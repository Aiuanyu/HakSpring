#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
客源翠六腔真值查驗工具 (hakfa_lookup.py) — 雙核心版本

功能：
1. 【正向查配音與釋義】：查詢客話詞彙在六腔（四縣、南四縣、海陸、大埔、饒平、詔安）中的官方真值讀音、CERT 分級、同義並列詞、釋義與例句。
2. 【反向從 Chinese 查客詞】：輸入 Chinese 詞彙／概念，從教典、認證與補字典之釋義、翻譯與詞目附記中反查客人真正的講法（優先置頂 CERT 基礎級核心詞）。
3. 支援 --emit-csv 參數，直接輸出加詞.csv 標準格式列。
4. 支援 -z / --zh 強制以 Chinese 反查，或自動在詞目查無收錄時啟動語意反查。

用法：
    python3 scripts/hakfa_lookup.py 已經          # 自動正向查無完整詞目時，啟動語意反查並列出配音
    python3 scripts/hakfa_lookup.py -z 或者       # 明確以 Chinese 反查客人講法（基礎級優先）
    python3 scripts/hakfa_lookup.py 落去 下去 同   # 客詞正向查六腔真值標音、釋義與例句
    python3 scripts/hakfa_lookup.py --emit-csv 企盤
"""

import argparse
import csv
import glob
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')

# 依「四南海大平安」規範排列
LECTS = ['四', '南', '海', '大', '平', '安']
LECT_NAMES = {
    '四': '四縣',
    '南': '南四縣',
    '海': '海陸',
    '大': '大埔',
    '平': '饒平',
    '安': '詔安',
}

_CACHE = None

def load_all_lexicon():
    global _CACHE
    if _CACHE is not None:
        return _CACHE

    # records[lect] = list of dict:
    # { 'src': str, 'word': str, 'disp': str, 'query': str, 'gloss': str, 'example': str, 'trans': str }
    records = {l: [] for l in LECTS}

    for l in LECTS:
        # 1. 教典 JSON
        gip_path = os.path.join(DATA_DIR, 'gip', f'20261020-{l}.json')
        if os.path.exists(gip_path):
            with open(gip_path, encoding='utf-8') as f:
                content = json.load(f)['content']
                for r in csv.DictReader(io.StringIO(content)):
                    records[l].append({
                        'src': '教典',
                        'word': r.get('客家語', '').strip(),
                        'disp': r.get('客語標音_顯示', '').strip(),
                        'query': r.get('客語標音_查詢', '').strip(),
                        'gloss': r.get('華語詞義', '').strip(),
                        'example': r.get('例句', '').strip(),
                        'trans': r.get('翻譯', '').strip(),
                    })

        # 2. 認證 JSON (data/cert/115{l}*.json)
        cert_files = sorted(glob.glob(os.path.join(DATA_DIR, 'cert', f'115{l}*.json')))
        for cf in cert_files:
            src_name = os.path.basename(cf).replace('.json', '')
            with open(cf, encoding='utf-8') as f:
                content = json.load(f)['content']
                for r in csv.DictReader(io.StringIO(content)):
                    records[l].append({
                        'src': src_name,
                        'word': r.get('客家語', '').strip(),
                        'disp': r.get('客語標音_顯示', '').strip(),
                        'query': r.get('客語標音_查詢', '').strip(),
                        'gloss': r.get('華語詞義', '').strip(),
                        'example': r.get('例句', '').strip(),
                        'trans': r.get('翻譯', '').strip(),
                    })

        # 3. 補字典 CSV (data/supp/補字典-{l}.csv)
        supp_path = os.path.join(DATA_DIR, 'supp', f'補字典-{l}.csv')
        if os.path.exists(supp_path):
            with open(supp_path, encoding='utf-8-sig') as f:
                for r in csv.DictReader(f):
                    records[l].append({
                        'src': '補字典',
                        'word': r.get('客家語', '').strip(),
                        'disp': r.get('客語標音_顯示', '').strip(),
                        'query': r.get('客語標音_查詢', '').strip(),
                        'gloss': r.get('華語詞義', '').strip(),
                        'example': r.get('例句', '').strip(),
                        'trans': r.get('翻譯', '').strip(),
                    })

        # 4. 愛灣語加詞 CSV (data/curated/加詞-{l}.csv)
        curated_path = os.path.join(DATA_DIR, 'curated', f'加詞-{l}.csv')
        if os.path.exists(curated_path):
            with open(curated_path, encoding='utf-8-sig') as f:
                for r in csv.DictReader(f):
                    records[l].append({
                        'src': '愛灣語加詞',
                        'word': r.get('客家語', '').strip(),
                        'disp': r.get('客語標音_顯示', '').strip(),
                        'query': r.get('客語標音_查詢', '').strip(),
                        'gloss': r.get('華語詞義', '').strip(),
                        'example': r.get('例句', '').strip(),
                        'trans': r.get('翻譯', '').strip(),
                    })

    _CACHE = records
    return _CACHE


def clean_word(word_str):
    """去除方括號、括號等附記，提取真實核心字形"""
    w = re.sub(r'【.*?】', '', word_str)
    w = re.sub(r'（.*?）', '', w)
    w = re.sub(r'\(.*?\)', '', w)
    return w.strip()


def lookup_word_and_chars(word, records):
    """回傳 (整詞命中 dict, 各單字命中 list of dict, 各單字合成詞例句抽樣)"""
    word_matches = {l: [] for l in LECTS}
    for l in LECTS:
        for r in records[l]:
            raw_w = r['word']
            pure_w = clean_word(raw_w)
            if raw_w == word or pure_w == word or f"【{word}】" in raw_w:
                word_matches[l].append(r)

    char_matches = []
    compound_samples = []

    for ch in word:
        ch_dict = {l: [] for l in LECTS}
        ch_samples = {l: [] for l in LECTS}
        for l in LECTS:
            for r in records[l]:
                w = clean_word(r['word'])
                if w == ch:
                    ch_dict[l].append(r)
                elif ch in w and len(w) >= 2 and len(ch_samples[l]) < 5:
                    ch_samples[l].append(f"{w}({r['disp']})")
        char_matches.append((ch, ch_dict))
        compound_samples.append((ch, ch_samples))

    return word_matches, char_matches, compound_samples


def reverse_lookup_zh(zh_word, records):
    """從 Chinese (釋義/翻譯/詞目附記) 反查客話對應詞彙與例句"""
    # 先建立 core_word -> {l: [records]} 完整索引，確保某詞在教典命中釋義時，能同時帶出其 115四基 等認證級別
    word_index = {}
    for l in LECTS:
        for r in records[l]:
            cw = clean_word(r['word']) or r['word']
            if cw not in word_index:
                word_index[cw] = {lect: [] for lect in LECTS}
            word_index[cw][l].append(r)

    matched_terms = {}

    for l in LECTS:
        for r in records[l]:
            gloss = r['gloss']
            trans = r['trans']
            word_field = r['word']

            # 區分命中精準度：
            # 0 = 釋義獨立義項完全命中（含「每個人」↔「每一個人」同義正規化）
            # 1 = 釋義短語命中（義項長度 <= 查詢詞長度 + 3）或例句翻譯獨立短句完全命中
            # 2 = 釋義長句說明中包含該詞，或例句翻譯子字串命中
            norm_zh = zh_word.replace('每一', '每')
            match_rank = 99
            if f"【{zh_word}】" in word_field or f"（{zh_word}）" in word_field:
                match_rank = 0
            elif zh_word in gloss or (norm_zh != zh_word and norm_zh in gloss) or (zh_word.startswith('每') and zh_word.replace('每', '每一', 1) in gloss):
                tokens = [t.strip() for t in re.split(r'[、，。；;！!？?／/\s\d\.]+|<br\s*/?>', gloss) if t.strip()]
                norm_tokens = [t.replace('每一', '每') for t in tokens]
                if zh_word in tokens or norm_zh in norm_tokens:
                    match_rank = 0
                elif any((zh_word in t or norm_zh in nt) and len(t) <= len(zh_word) + 3 for t, nt in zip(tokens, norm_tokens)):
                    match_rank = 1
                else:
                    match_rank = 2
            elif zh_word in trans:
                tr_tokens = [t.strip() for t in re.split(r'[、，。；;！!？?／/\s\d\.]+|<br\s*/?>', trans) if t.strip()]
                if zh_word in tr_tokens:
                    match_rank = 1
                else:
                    match_rank = 2

            if match_rank < 99:
                core_word = clean_word(word_field) or word_field

                if core_word not in matched_terms:
                    matched_terms[core_word] = {
                        'records': word_index.get(core_word, {lect: [] for lect in LECTS}),
                        'match_rank': match_rank,
                        'raw_words': set(),
                        'glosses': set(),
                        'examples': []
                    }
                else:
                    if match_rank < matched_terms[core_word]['match_rank']:
                        matched_terms[core_word]['match_rank'] = match_rank

                matched_terms[core_word]['raw_words'].add(word_field)
                if gloss:
                    matched_terms[core_word]['glosses'].add(gloss.replace('\n', ' '))
                if r['example'] and len(matched_terms[core_word]['examples']) < 2:
                    matched_terms[core_word]['examples'].append({
                        'lect': LECT_NAMES[l],
                        'ex': r['example'].replace('\n', ' '),
                        'tr': r['trans'].replace('\n', ' ')
                    })

    return matched_terms


def get_src_tier(src):
    """CERT 分級與來源優先序：基礎(0) > 初級(1) > 中級(2) > 中高(3) > 高級(4) > 愛灣語加詞(5) > 教典(6) > 補字典(7)"""
    if src.endswith('基'):
        return 0
    if src.endswith('初'):
        return 1
    if src.endswith('中'):
        return 2
    if src.endswith('中高'):
        return 3
    if src.endswith('高'):
        return 4
    if src == '愛灣語加詞':
        return 5
    if src == '教典':
        return 6
    return 7


def format_src_badge(src):
    if src.endswith('基'):
        return f"⭐基礎:{src}"
    return src


def clean_html_text(text):
    return re.sub(r'<br\s*/?>', ' / ', text).replace('\n', ' ').strip()


def format_readings(match_list):
    if not match_list:
        return '（無收錄）'
    sorted_matches = sorted(match_list, key=lambda r: get_src_tier(r['src']))
    formatted = []
    seen = set()
    for r in sorted_matches:
        key = (r['disp'], r['query'], r['src'])
        if key not in seen:
            seen.add(key)
            badge = format_src_badge(r['src'])
            word_note = f" 〈詞目:{r['word']}〉" if ('（' in r['word'] or '(' in r['word']) else ""
            formatted.append(f"{r['disp']} ({r['query']}) [{badge}]{word_note}")
    return ' ； '.join(formatted)


def print_whole_word_semantics(word_matches):
    """印出整詞收錄之同義並列詞、釋義與官方例句（防止只看標音不看語意）"""
    all_recs = []
    for l in LECTS:
        for r in word_matches[l]:
            all_recs.append((l, r))
    if not all_recs:
        return

    all_recs.sort(key=lambda item: get_src_tier(item[1]['src']))

    variants = []
    glosses = []
    examples = []
    for l, r in all_recs:
        w = r['word']
        if ('（' in w or '(' in w or '【' in w) and w not in variants:
            variants.append(f"{w}[{r['src']}]")
        if r['gloss']:
            g = clean_html_text(r['gloss'])
            if g and g not in glosses:
                glosses.append(g)
        if r['example'] and len(examples) < 3:
            ex = clean_html_text(r['example'])
            tr = clean_html_text(r['trans'])
            ex_entry = (LECT_NAMES[l], r['src'], ex, tr)
            if not any(e[2] == ex for e in examples):
                examples.append(ex_entry)

    if variants:
        print(f"  📌 同義並列／附記：{', '.join(variants[:4])}")
    if glosses:
        print(f"  📖 官方釋義：{' ｜ '.join(glosses[:3])}")
    if examples:
        print("  💬 官方例句：")
        for lect_name, src, ex, tr in examples:
            tr_str = f" （{tr}）" if tr else ""
            print(f"      - [{lect_name}/{format_src_badge(src)}] {ex}{tr_str}")


def print_reverse_report(zh_word, matched_terms, records):
    print(f"\n{'#'*25} 【Chinese 反查客詞】：『{zh_word}』 {'#'*25}")
    if not matched_terms:
        print(f"  在官方詞典與認證庫之釋義中，查無對應『{zh_word}』之客話詞條。")
        return False

    print(f"  共找到 {len(matched_terms)} 個相關客話詞目（依 CERT 基礎級優先排序）：\n")

    def term_sort_key(kv):
        term, data = kv
        best_tier = 99
        total_hits = 0
        for l in LECTS:
            for r in data['records'][l]:
                total_hits += 1
                t = get_src_tier(r['src'])
                if t < best_tier:
                    best_tier = t
        return (data.get('match_rank', 99), best_tier, len(term), -total_hits)

    sorted_terms = sorted(matched_terms.items(), key=term_sort_key)

    for idx, (term, data) in enumerate(sorted_terms[:8], 1):
        lect_coverage = [LECT_NAMES[l] for l in LECTS if data['records'][l]]
        best_tier = min(
            (get_src_tier(r['src']) for l in LECTS for r in data['records'][l]),
            default=99
        )
        tier_tag = " ⭐【基礎核心詞】" if best_tier == 0 else (" 【初級詞】" if best_tier == 1 else "")
        print(f"  [{idx}] 客話詞目：【{term}】{tier_tag}（分佈腔別：{', '.join(lect_coverage)}）")
        
        # 顯示各腔讀音
        for l in LECTS:
            if data['records'][l]:
                print(f"      - {LECT_NAMES[l]} ({l}): {format_readings(data['records'][l])}")

        # 顯示釋義摘要
        if data['glosses']:
            sample_gloss = ' / '.join(clean_html_text(g) for g in list(data['glosses'])[:2])
            print(f"      * 釋義：{sample_gloss}")

        # 顯示母語例句
        if data['examples']:
            ex = data['examples'][0]
            print(f"      * 例句（{ex['lect']}）：{clean_html_text(ex['ex'])}")
            if ex['tr']:
                print(f"        翻譯：{clean_html_text(ex['tr'])}")
        print()

    return True


def print_lookup_report(words, records, force_zh=False):
    for w in words:
        if force_zh:
            matched_terms = reverse_lookup_zh(w, records)
            print_reverse_report(w, matched_terms, records)
            continue

        word_matches, char_matches, compound_samples = lookup_word_and_chars(w, records)
        has_whole = any(bool(word_matches[l]) for l in LECTS)

        # 若是多字詞且正向完全查無整詞收錄，主動啟動「Chinese 反查」尋找客話對應正字
        if not has_whole and len(w) >= 2:
            matched_terms = reverse_lookup_zh(w, records)
            if matched_terms:
                print(f"\n{'='*25} 查詢詞彙：【{w}】 {'='*25}")
                print(f"  ℹ️ 正向客話詞庫無完全匹配之【{w}】詞目。")
                print(f"  💡 自動啟動【Chinese 反查客詞】模式，為您尋找客人真正的用字與講法：")
                print_reverse_report(w, matched_terms, records)
                print(f"  -------------------- [以下提供【{w}】字面拆解配音供參考] --------------------")

        print(f"\n{'='*25} 查詢詞彙配音：【{w}】 {'='*25}")
        if has_whole:
            print("【整詞官方收錄】")
            for l in LECTS:
                print(f"  [{LECT_NAMES[l]} ({l})]: {format_readings(word_matches[l])}")
            print_whole_word_semantics(word_matches)
        else:
            print("【整詞官方未收錄，拆解單字分析】")

        for idx, (ch, ch_dict) in enumerate(char_matches):
            print(f"\n  ▶ 單字【{ch}】（第 {idx+1} 字）六腔真值：")
            for l in LECTS:
                print(f"    - {LECT_NAMES[l]} ({l}): {format_readings(ch_dict[l])}")
            print(f"    - 既有合成詞抽樣：")
            for l in LECTS:
                samples = ', '.join(compound_samples[idx][1][l]) or '此腔無此詞條()'
                print(f"      * {l}: {samples}")


def emit_csv_rows(words, records):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(['字詞', '四縣', '南四縣', '海陸', '大埔', '饒平', '詔安'])

    for w in words:
        word_matches, char_matches, _ = lookup_word_and_chars(w, records)
        row = [w]
        for l in LECTS:
            if word_matches[l]:
                best = sorted(word_matches[l], key=lambda r: get_src_tier(r['src']))[0]
                row.append(f"{best['disp']} ({best['query']})")
            else:
                combined_disp = []
                combined_query = []
                for ch, ch_dict in char_matches:
                    if ch_dict[l]:
                        best_ch = sorted(ch_dict[l], key=lambda r: get_src_tier(r['src']))[0]
                        combined_disp.append(best_ch['disp'])
                        combined_query.append(best_ch['query'])
                    else:
                        combined_disp.append('?')
                        combined_query.append('?')
                row.append(f"{' '.join(combined_disp)} ({' '.join(combined_query)}) [合成]")
        writer.writerow(row)

    print(out.getvalue().strip())


def main():
    parser = argparse.ArgumentParser(description='客源翠六腔真值查驗工具（雙核心：Chinese反查客詞 ＋ 客詞查配音與釋義）')
    parser.add_argument('words', nargs='+', help='要查詢的客話詞彙、單字，或 Chinese 意念')
    parser.add_argument('--emit-csv', action='store_true', help='直接輸出加詞.csv 格式列')
    parser.add_argument('-z', '--zh', action='store_true', help='強制以 Chinese 語意反查客人真實對應詞彙與例句')
    args = parser.parse_args()

    records = load_all_lexicon()

    if args.emit_csv:
        emit_csv_rows(args.words, records)
    else:
        print_lookup_report(args.words, records, force_zh=args.zh)


if __name__ == '__main__':
    main()
