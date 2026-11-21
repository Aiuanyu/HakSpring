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
    "sixian": {
        "gip": "data/gip/20261020-四.json",
        "cert_glob": "data/cert/115四*.json",
    },
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

    note_split_re = re.compile(r"(又俗音|又讀|又音|俗音|特殊音|特)")
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


def build_lexicon(dialect: str):
    cfg = DIALECT_SOURCES[dialect]
    rows = []
    gip_path = os.path.join(ROOT, cfg["gip"])
    if os.path.exists(gip_path):
        rows.extend(load_csv_json(gip_path))
    for p in sorted(glob.glob(os.path.join(ROOT, cfg["cert_glob"]))):
        rows.extend(load_csv_json(p))

    lexicon: dict[str, list[str]] = defaultdict(list)
    seen_pairs: set[tuple[str, str]] = set()
    sentences: list[str] = []

    for r in rows:
        hans = clean_han_variants(r.get("客家語", ""))
        hpps = clean_hpp_variants(r.get("客語標音_顯示", ""))
        if hans and hpps:
            for h in hans:
                for p in hpps:
                    # 過濾掉明顯音節數與字數不合的雜訊
                    if len(p.split()) == len(h) and (h, p) not in seen_pairs:
                        seen_pairs.add((h, p))
                        lexicon[h].append(p)
        ex = r.get("例句", "")
        if ex:
            sentences.append(ex)

    return lexicon, sentences, len(rows)


def viterbi_segment(
    chunk: str,
    lexicon: dict[str, list[str]],
    max_len: int,
    unigram: Counter | None = None,
    total_tokens: int = 0,
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


def run_em(lexicon: dict[str, list[str]], sentences: list[str], rounds: int = 2):
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
            for tok in viterbi_segment(ch, lexicon, max_len, unigram, total_tokens):
                new_uni[tok] += 1
        unigram = new_uni
        total_tokens = sum(unigram.values())

    # 最後一輪同時統計 bigram
    bigram: Counter = Counter()
    for ch in all_chunks:
        toks = viterbi_segment(ch, lexicon, max_len, unigram, total_tokens)
        for a, b in zip(toks, toks[1:]):
            bigram[f"{a}\t{b}"] += 1

    return unigram, bigram, len(all_chunks)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="sixian", choices=list(DIALECT_SOURCES.keys()))
    parser.add_argument("--min-bigram", type=int, default=2, help="只保留出現 >= N 次的 bigram")
    args = parser.parse_args()

    lexicon, sentences, raw_rows = build_lexicon(args.dialect)
    unigram, bigram, chunk_count = run_em(lexicon, sentences, rounds=2)

    out_dir = os.path.join(ROOT, "data", "romaine")
    os.makedirs(out_dir, exist_ok=True)

    pruned_uni = {k: v for k, v in unigram.items() if v >= 1}
    pruned_bi = {k: v for k, v in bigram.items() if v >= args.min_bigram}

    stats_path = os.path.join(out_dir, f"{args.dialect}_stats.json")
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "dialect": args.dialect,
                "meta": {
                    "raw_rows": raw_rows,
                    "sentences": len(sentences),
                    "chunks": chunk_count,
                    "lexicon_words": len(lexicon),
                    "total_tokens": sum(unigram.values()),
                    "unique_unigrams": len(pruned_uni),
                    "unique_bigrams": len(pruned_bi),
                },
                "unigram": pruned_uni,
                "bigram": pruned_bi,
            },
            f,
            ensure_ascii=False,
        )

    # 載入人工校對覆寫表（若有）
    overrides_path = os.path.join(out_dir, f"{args.dialect}_prefs_overrides.json")
    overrides = {}
    if os.path.exists(overrides_path):
        with open(overrides_path, "r", encoding="utf-8") as f:
            overrides = json.load(f).get("overrides", {})

    # 多讀音詞條（按語料出現頻率排序，供設定偏好讀音表）
    polyphones = []
    for han, readings in lexicon.items():
        if len(readings) > 1:
            ov = overrides.get(han, {})
            default_hpp = ov.get("default", readings[0])
            entry = {
                "han": han,
                "freq": unigram.get(han, 0),
                "default": default_hpp,
                "candidates": readings,
            }
            if ov.get("note"):
                entry["note"] = ov["note"]
            polyphones.append(entry)
    polyphones.sort(key=lambda x: (-x["freq"], -len(x["candidates"]), x["han"]))

    prefs_path = os.path.join(out_dir, f"{args.dialect}_prefs.json")
    with open(prefs_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "dialect": args.dialect,
                "total_polyphones": len(polyphones),
                "items": polyphones,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(
        f"[{args.dialect}] rows={raw_rows}, sentences={len(sentences)}, "
        f"lexicon={len(lexicon)}, polyphones={len(polyphones)}, "
        f"unigrams={len(pruned_uni)}, bigrams(>={args.min_bigram})={len(pruned_bi)}"
    )
    print(f"Wrote: {stats_path}")
    print(f"Wrote: {prefs_path}")


if __name__ == "__main__":
    main()
