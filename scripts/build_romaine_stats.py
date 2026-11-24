#!/usr/bin/env python3
"""
離線掃描 HakSpring 現有詞典與例句語料，產出全自動 Romaine 前端所需的：
  1. data/romaine/{dialect}_stats.json  （詞頻 unigram + 高頻 bigram）
  2. data/romaine/{dialect}_prefs.json  （高頻多讀音詞條候選清單，供人工設定預設偏好）

用法：
  python3 scripts/build_romaine_stats.py --dialect sixian
"""

from __future__ import annotations

import argparse
import csv
import glob
import io
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DIALECT_SOURCES = {
    "xiien": {
        "cdm_key": "四",
        "gip": "data/gip/20261020-四.json",
        "cert_glob": "data/cert/115四*.json",
    },
    "namxiian": {
        "cdm_key": "南",
        "gip": "data/gip/20261020-南.json",
        "cert_glob": "data/cert/115四*.json",
        "extract_nan_bracket": True,
    },
    "hoiliug": {
        "cdm_key": "海",
        "gip": "data/gip/20261020-海.json",
        "cert_glob": "data/cert/115海*.json",
    },
    "taibu": {
        "cdm_key": "大",
        "gip": "data/gip/20261020-大.json",
        "cert_glob": "data/cert/115大*.json",
    },
    "ngiaupin": {
        "cdm_key": "平",
        "gip": "data/gip/20261020-平.json",
        "cert_glob": "data/cert/115平*.json",
    },
    "zhioon": {
        "cdm_key": "安",
        "gip": "data/gip/20261020-安.json",
        "cert_glob": "data/cert/115安*.json",
    },
}

DIALECT_ALIASES = {
    "sixian": "xiien",
    "nansixian": "namxiian",
    "hailu": "hoiliug",
    "dapu": "taibu",
    "raoping": "ngiaupin",
    "zhaoan": "zhioon",
}

CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\U00020000-\U0002ebef]")


def is_cjk(ch: str) -> bool:
    return bool(CJK_RE.match(ch))


def load_csv_json(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        obj = json.load(f)
    reader = csv.DictReader(io.StringIO(obj["content"]))
    return list(reader)


def clean_han_variants(raw: str) -> list[str]:
    """清理詞頭漢字（移除【】註記，拆分／與、並列詞條）。"""
    if not raw:
        return []
    s = re.sub(r"【.*?】", "", raw)
    s = re.sub(r"（.*?）|\(.*?\)", "", s)
    parts = [p.strip() for p in re.split(r"[、／/]", s) if p.strip()]
    return [p for p in parts if any(is_cjk(c) for c in p)]


def clean_hpp_variants(raw: str) -> list[str]:
    """清理 HPP 標音欄位（移除【】註記、依又讀/俗音/特拆層、展開音節內斜線、統一 NFC）。"""
    if not raw:
        return []
    s = re.sub(r"【.*?】", "", raw)
    s = re.sub(r"[（）()]", "", s)
    out = []

    def expand_phrase(phrase: str):
        words = [w for w in phrase.strip().split() if w]
        combos = [[]]
        for w in words:
            alts = [a for a in w.split("/") if a]
            nxt = []
            for base in combos:
                for a in alts:
                    nxt.append(base + [unicodedata.normalize("NFC", a)])
            combos = nxt
            if len(combos) > 16:
                break
        for c in combos:
            out.append(" ".join(c))

    drop_notes_re = re.compile(
        r"(?:小稱變調讀本調為|小稱變調讀|後字變調又讀|後字變調讀|為後字變調|後字變調為|後字變調|為新調值|之合音|合音讀|合音|本調為|詞目刪除|七層|分佢|為)"
    )
    s = drop_notes_re.sub(" ", s)
    s = re.sub(r"^\s*\d+[.．、]\s*", "", s)
    note_split_re = re.compile(r"(又俗音|又讀|又音|俗音|特殊音|特|又|文|白)")
    for slash_chunk in re.split(r"\s+/\s+", s):
        for i, piece in enumerate(note_split_re.split(slash_chunk)):
            part = re.sub(r"\s+", " ", piece).strip()
            if not part or i % 2 == 1:
                continue
            expand_phrase(part)
    return out


def split_sentences(text: str) -> list[str]:
    """依標點切出純諸夏字片段，供斷詞統計使用。"""
    if not text:
        return []
    text = re.sub(r"（.*?）|\(.*?\)|【.*?】", "", text)
    chunks = []
    buf = []
    for ch in text:
        if is_cjk(ch):
            buf.append(ch)
        else:
            if buf:
                chunks.append("".join(buf))
                buf = []
    if buf:
        chunks.append("".join(buf))
    return chunks


def load_cross_dialect_index() -> dict[str, dict[int, str]]:
    """載入 cross_dialect_map.json，建立 {腔字: {gip_idx: group_id}} 反查表。"""
    cdm_path = os.path.join(ROOT, "data", "gip", "cross_dialect_map.json")
    idx_to_group: dict[str, dict[int, str]] = defaultdict(dict)
    if not os.path.exists(cdm_path):
        return idx_to_group
    with open(cdm_path, "r", encoding="utf-8") as f:
        groups = json.load(f).get("groups", {})
    for gid, gobj in groups.items():
        for d_char, members in (gobj.get("members") or {}).items():
            for m in members:
                idx = m.get("idx")
                if idx is not None:
                    idx_to_group[d_char][int(idx)] = gid
    return idx_to_group


def cert_level_weight(filename: str) -> int:
    if "基" in filename:
        return 5
    if "初" in filename:
        return 4
    if "中." in filename:
        return 3
    if "中高" in filename:
        return 2
    return 1


def build_lexicon(dialect: str, cdm_index: dict[str, dict[int, str]] | None = None):
    cfg = DIALECT_SOURCES[dialect]
    cdm_key = cfg["cdm_key"]
    gip_idx_map = (cdm_index or {}).get(cdm_key, {})

    gip_rows = []
    gip_path = os.path.join(ROOT, cfg["gip"])
    if os.path.exists(gip_path):
        gip_rows.extend(load_csv_json(gip_path))

    cert_files = sorted(glob.glob(os.path.join(ROOT, cfg["cert_glob"])))
    cert_rows_with_meta: list[tuple[str, dict]] = []
    for p in cert_files:
        lvl_tag = re.sub(r"^115[四海大平安]", "", os.path.basename(p)).replace(".json", "")
        lvl_w = cert_level_weight(os.path.basename(p))
        for r in load_csv_json(p):
            cert_rows_with_meta.append((f"{lvl_tag}:{r.get('編號', '')}", lvl_w, r))

    lexicon: dict[str, list[str]] = defaultdict(list)
    seen_pairs: set[tuple[str, str]] = set()
    cert_scores: dict[tuple[str, str], int] = defaultdict(int)
    # 記錄每筆 (han, hpp) 連結的同源群組 ID（Gxxxx 或 cert:級:編號）
    pair_links: dict[tuple[str, str], set[str]] = defaultdict(set)
    sentences: list[str] = []

    def add_row(r: dict, prefer_nan_bracket: bool = False, link_id: str | None = None, cert_w: int = 0):
        raw_han = r.get("客家語", "")
        raw_hpp = r.get("客語標音_顯示", "")
        if prefer_nan_bracket:
            h_m = re.search(r"【([^】]+)】", raw_han)
            p_m = re.search(r"【([^】]+)】", raw_hpp)
            hans = clean_han_variants(h_m.group(1) if h_m else raw_han)
            hpps = clean_hpp_variants(p_m.group(1) if p_m else raw_hpp)
        else:
            hans = clean_han_variants(raw_han)
            hpps = clean_hpp_variants(raw_hpp)
        if hans and hpps:
            for h in hans:
                for p in hpps:
                    if len(p.split()) == len(h):
                        if (h, p) not in seen_pairs:
                            seen_pairs.add((h, p))
                            lexicon[h].append(p)
                        if cert_w > 0:
                            cert_scores[(h, p)] += cert_w
                        if link_id:
                            pair_links[(h, p)].add(link_id)
        ex = r.get("例句", "")
        if ex:
            sentences.append(ex)

    for idx, r in enumerate(gip_rows):
        gid = gip_idx_map.get(idx)
        add_row(r, False, link_id=f"gip:{gid}" if gid else None, cert_w=0)
    curated_path = os.path.join(ROOT, "data", "curated", f"加詞-{cdm_key}.json")
    if os.path.exists(curated_path):
        for r in load_csv_json(curated_path):
            r_copy = dict(r)
            if r_copy.get("客語標音_顯示"):
                r_copy["客語標音_顯示"] = re.sub(r"^--", "", r_copy["客語標音_顯示"])
            add_row(r_copy, False, link_id=None, cert_w=1)
    for cert_key, lvl_w, r in cert_rows_with_meta:
        add_row(r, bool(cfg.get("extract_nan_bracket")), link_id=f"cert:{cert_key}", cert_w=lvl_w)

    return lexicon, sentences, len(gip_rows) + len(cert_rows_with_meta), cert_scores, pair_links


def load_segmentation_rules() -> tuple[set[str], list[str]]:
    path = os.path.join(ROOT, "data", "romaine", "segmentation_rules.json")
    if not os.path.exists(path):
        return set(), []
    with open(path, "r", encoding="utf-8") as f:
        obj = json.load(f)
    return set(obj.get("no_merge") or []), list(obj.get("common_words") or [])


def viterbi_segment(
    chunk: str,
    lexicon: dict[str, list[str]],
    max_len: int,
    unigram: Counter | None = None,
    total_tokens: int = 0,
    no_merge: set[str] | None = None,
) -> list[str]:
    n = len(chunk)
    dp = [float("inf")] * (n + 1)
    back = [0] * (n + 1)
    dp[0] = 0.0

    for i in range(n):
        if dp[i] == float("inf"):
            continue
        # 嘗試所有詞典匹配
        matched = False
        for length in range(1, min(max_len, n - i) + 1):
            w = chunk[i : i + length]
            if no_merge and w in no_merge:
                continue
            if w in lexicon:
                matched = True
                if unigram and total_tokens > 0:
                    freq = unigram.get(w, 0) + 0.5
                    cost = -math.log(freq / (total_tokens + 0.5 * len(lexicon)))
                    # 輕微偏好較長詞彙以減少過度切碎
                    cost -= 0.35 * (length - 1)
                else:
                    # 第一輪（無詞頻）：偏好長詞
                    cost = 2.0 - 0.6 * (length - 1)
                if dp[i] + cost < dp[i + length]:
                    dp[i + length] = dp[i] + cost
                    back[i + length] = i
        # 單字 OOV 懲罰（保底一定走得通）
        if not matched or chunk[i : i + 1] not in lexicon:
            oov_cost = 12.0
            if dp[i] + oov_cost < dp[i + 1]:
                dp[i + 1] = dp[i] + oov_cost
                back[i + 1] = i

    tokens = []
    pos = n
    while pos > 0:
        prev = back[pos]
        tokens.append(chunk[prev:pos])
        pos = prev
    tokens.reverse()
    return tokens


def run_em(lexicon: dict[str, list[str]], sentences: list[str], rounds: int = 2, no_merge: set[str] | None = None):
    max_len = max((len(w) for w in lexicon), default=1)
    max_len = min(max_len, 8)
    all_chunks = []
    for s in sentences:
        all_chunks.extend(split_sentences(s))

    unigram: Counter = Counter()
    total_tokens = 0

    for _ in range(rounds):
        new_uni: Counter = Counter()
        for ch in all_chunks:
            for tok in viterbi_segment(ch, lexicon, max_len, unigram, total_tokens, no_merge):
                new_uni[tok] += 1
        unigram = new_uni
        total_tokens = sum(unigram.values())

    # 最後一輪同時統計 bigram
    bigram: Counter = Counter()
    for ch in all_chunks:
        toks = viterbi_segment(ch, lexicon, max_len, unigram, total_tokens, no_merge)
        for a, b in zip(toks, toks[1:]):
            bigram[f"{a}\t{b}"] += 1

    return unigram, bigram, len(all_chunks)


def collect_seed_preferences(cdm_index: dict[str, dict[int, str]]):
    """從已校對腔調（xiien overrides + verified_sentences.json）抽出：
    1. seed_links: {(han, link_id): score} — 跨腔同形同義詞的預設選擇權重
    2. seed_unigram: {link_id: (han, freq)} — 供欠語料腔調互學的詞頻
    """
    seed_links: dict[tuple[str, str], float] = defaultdict(float)

    # 1. 四縣 xiien_prefs_overrides.json
    xiien_ov_path = os.path.join(ROOT, "data", "romaine", "xiien_prefs_overrides.json")
    xiien_overrides = {}
    if os.path.exists(xiien_ov_path):
        with open(xiien_ov_path, "r", encoding="utf-8") as f:
            xiien_overrides = json.load(f).get("overrides", {})

    # 2. 黃金語料 verified_sentences.json（僅 confirmed 專家確認資料納入跨腔互學種子，verified 初校僅留本腔）
    gold_counts: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
    gold_path = os.path.join(ROOT, "data", "romaine", "verified_sentences.json")
    if os.path.exists(gold_path):
        with open(gold_path, "r", encoding="utf-8") as f:
            for item in json.load(f).get("items", []):
                if item.get("status") != "confirmed":
                    continue
                d = item.get("dialect", "xiien")
                d = DIALECT_ALIASES.get(d, d)
                for tok in item.get("tokens", []):
                    if tok.get("punct") or tok.get("nonCjk") or tok.get("comment") or tok.get("uncertain"):
                        continue
                    han = (tok.get("han") or "").strip()
                    hpp = (tok.get("hpp") or "").strip().lower()
                    if han and hpp:
                        gold_counts[d][han][hpp] += 1

    # 將四縣 overrides 與 confirmed 專家黃金語料對回各自的 link_id（gip:Gxxxx / cert:級:編號）
    for src_d in DIALECT_SOURCES:
        _, _, _, _, src_links = build_lexicon(src_d, cdm_index)
        for (han, hpp), links in src_links.items():
            score = 0.0
            if src_d == "xiien" and han in xiien_overrides:
                if xiien_overrides[han].get("default", "").lower() == hpp.lower():
                    score += 100.0
            if han in gold_counts.get(src_d, {}):
                score += 20.0 * gold_counts[src_d][han].get(hpp.lower(), 0)
            if score > 0:
                for lid in links:
                    seed_links[(han, lid)] += score

    return seed_links


def build_context_readings(
    lexicon: dict[str, list[str]],
    poly_defaults: dict[str, str],
) -> tuple[dict[str, str], dict[str, str]]:
    """從本腔多字合成詞（2～4 字）萃取單字多音詞的「前字/後字共現讀音」知識。"""
    prev_counts: dict[str, Counter] = defaultdict(Counter)
    next_counts: dict[str, Counter] = defaultdict(Counter)

    poly_chars = {h for h, rs in lexicon.items() if len(h) == 1 and len(rs) > 1}
    char_valid_hpps = {h: {r.lower(): r for r in lexicon[h]} for h in poly_chars}

    for word, readings in lexicon.items():
        wlen = len(word)
        if wlen < 2 or wlen > 4:
            continue
        hpp = poly_defaults.get(word, readings[0])
        syls = hpp.split()
        if len(syls) != wlen:
            continue
        for idx, ch in enumerate(word):
            if ch not in poly_chars:
                continue
            syl_lower = syls[idx].lower()
            if syl_lower not in char_valid_hpps[ch]:
                continue
            canon_hpp = char_valid_hpps[ch][syl_lower]
            if idx > 0:
                prev_ch = word[idx - 1]
                prev_counts[f"{prev_ch}\t{ch}"][canon_hpp] += 1
            if idx + 1 < wlen:
                next_ch = word[idx + 1]
                next_counts[f"{ch}\t{next_ch}"][canon_hpp] += 1

    def finalize(tbl: dict[str, Counter]) -> dict[str, str]:
        out = {}
        for k, cnt in tbl.items():
            total = sum(cnt.values())
            best_hpp, best_c = cnt.most_common(1)[0]
            if total > 0 and best_c / total >= 0.75:
                out[k] = best_hpp
        return out

    return finalize(prev_counts), finalize(next_counts)


def build_for_dialect(
    dialect: str,
    min_bigram: int,
    cdm_index: dict[str, dict[int, str]],
    seed_links: dict[tuple[str, str], float],
    xiien_transfer_freq: dict[str, int],
    no_merge: set[str],
    common_words: list[str],
):
    lexicon, sentences, raw_rows, cert_scores, pair_links = build_lexicon(dialect, cdm_index)
    unigram, bigram, chunk_count = run_em(lexicon, sentences, rounds=2, no_merge=no_merge)

    # 跨腔同形同義詞頻遷移（僅補入目標腔詞典確有收錄的同形詞）
    if dialect != "xiien" and xiien_transfer_freq:
        for han, x_freq in xiien_transfer_freq.items():
            if han in lexicon:
                bonus = int(round(0.25 * x_freq))
                if bonus > 0:
                    unigram[han] = max(unigram.get(han, 0), bonus)

    out_dir = os.path.join(ROOT, "data", "romaine")
    os.makedirs(out_dir, exist_ok=True)

    # 載入本腔人工校對覆寫表（若有）
    overrides_path = os.path.join(out_dir, f"{dialect}_prefs_overrides.json")
    overrides = {}
    if os.path.exists(overrides_path):
        with open(overrides_path, "r", encoding="utf-8") as f:
            overrides = json.load(f).get("overrides", {})

    # 多讀音詞條：1) 本腔人工 override > 2) 跨腔同形同義詞偏好遷移 > 3) 認證詞庫優先 > 4) 原序
    polyphones = []
    poly_defaults: dict[str, str] = {}
    transferred_count = 0
    for han, readings in lexicon.items():
        if len(readings) > 1:
            ov = overrides.get(han, {})
            if ov.get("default"):
                default_hpp = ov["default"]
            else:
                best_hpp = readings[0]
                best_score = (-1.0, -1, -999)
                has_seed = False
                for idx_r, r_hpp in enumerate(readings):
                    links = pair_links.get((han, r_hpp), set())
                    s_score = sum(seed_links.get((han, lid), 0.0) for lid in links)
                    if s_score > 0:
                        has_seed = True
                    c_score = cert_scores.get((han, r_hpp), 0)
                    cand_tuple = (s_score, c_score, -idx_r)
                    if cand_tuple > best_score:
                        best_score = cand_tuple
                        best_hpp = r_hpp
                default_hpp = best_hpp
                if has_seed:
                    transferred_count += 1
            poly_defaults[han] = default_hpp
            entry = {
                "han": han,
                "freq": unigram.get(han, 0),
                "default": default_hpp,
                "candidates": readings,
            }
            if ov.get("note"):
                entry["note"] = ov["note"]
            polyphones.append(entry)
    # 若人工覆寫表指定的詞條僅收於補字典（不在官方 gip/cert 詞庫），仍寫入 prefs 供前端偏好套用
    for ov_han, ov in overrides.items():
        if ov.get("default") and ov_han not in poly_defaults:
            poly_defaults[ov_han] = ov["default"]
            entry = {
                "han": ov_han,
                "freq": unigram.get(ov_han, 0),
                "default": ov["default"],
                "candidates": [ov["default"]],
            }
            if ov.get("note"):
                entry["note"] = ov["note"]
            polyphones.append(entry)
    polyphones.sort(key=lambda x: (-x["freq"], -len(x["candidates"]), x["han"]))

    ctx_prev, ctx_next = build_context_readings(lexicon, poly_defaults)

    pruned_uni = {k: v for k, v in unigram.items() if v >= 1}
    pruned_bi = {k: v for k, v in bigram.items() if v >= min_bigram}

    stats_path = os.path.join(out_dir, f"{dialect}_stats.json")
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "dialect": dialect,
                "meta": {
                    "raw_rows": raw_rows,
                    "sentences": len(sentences),
                    "chunks": chunk_count,
                    "lexicon_words": len(lexicon),
                    "total_tokens": sum(unigram.values()),
                    "unique_unigrams": len(pruned_uni),
                    "unique_bigrams": len(pruned_bi),
                    "unique_ctx_prev": len(ctx_prev),
                    "unique_ctx_next": len(ctx_next),
                },
                "unigram": pruned_uni,
                "bigram": pruned_bi,
                "ctx_prev": ctx_prev,
                "ctx_next": ctx_next,
                "no_merge": sorted(no_merge),
                "common_words": common_words,
            },
            f,
            ensure_ascii=False,
        )

    prefs_path = os.path.join(out_dir, f"{dialect}_prefs.json")
    with open(prefs_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "dialect": dialect,
                "total_polyphones": len(polyphones),
                "items": polyphones,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(
        f"[{dialect}] rows={raw_rows}, sentences={len(sentences)}, "
        f"lexicon={len(lexicon)}, polyphones={len(polyphones)} (seed_transferred={transferred_count}), "
        f"unigrams={len(pruned_uni)}, bigrams(>={min_bigram})={len(pruned_bi)}, "
        f"ctx_prev={len(ctx_prev)}, ctx_next={len(ctx_next)}"
    )
    print(f"Wrote: {stats_path}")
    print(f"Wrote: {prefs_path}")
    return unigram


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="xiien", choices=list(DIALECT_SOURCES.keys()) + ["all"])
    parser.add_argument("--min-bigram", type=int, default=2, help="只保留出現 >= N 次的 bigram")
    args = parser.parse_args()

    cdm_index = load_cross_dialect_index()
    seed_links = collect_seed_preferences(cdm_index)
    no_merge, common_words = load_segmentation_rules()

    # 先算四縣 xiien 詞頻作為同形詞頻遷移基底
    xiien_lex, xiien_sents, _, _, _ = build_lexicon("xiien", cdm_index)
    xiien_uni, _, _ = run_em(xiien_lex, xiien_sents, rounds=2, no_merge=no_merge)
    xiien_transfer_freq = {k: v for k, v in xiien_uni.items() if v >= 3}

    targets = list(DIALECT_SOURCES.keys()) if args.dialect == "all" else [args.dialect]
    for d in targets:
        build_for_dialect(d, args.min_bigram, cdm_index, seed_links, xiien_transfer_freq, no_merge, common_words)


if __name__ == "__main__":
    main()
