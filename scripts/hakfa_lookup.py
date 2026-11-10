#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
客源翠六腔真值查驗工具 (hakfa_lookup.py)

功能：
1. 查詢詞彙或單字在六腔（四縣、南四縣、海陸、大埔、饒平、詔安）中的官方真值讀音。
2. 資料來源包含：data/gip/20261020-*.json、data/cert/、data/supp/補字典-*.csv、data/curated/加詞-*.csv。
3. 支援 --emit-csv 參數，直接輸出加詞.csv 標準格式列，徹底杜絕手抄與腦補錯誤。

用法：
    python3 scripts/hakfa_lookup.py 企盤 儲存 介面
    python3 scripts/hakfa_lookup.py --emit-csv 企盤 儲存
"""

import argparse
import csv
import glob
import io
import json
import os
import re
import sys

# 根目錄指向 HakSpring
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

    # records[lect] = list of dict: { 'src': str, 'word': str, 'disp': str, 'query': str }
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
                        'word': r['客家語'],
                        'disp': r['客語標音_顯示'],
                        'query': r['客語標音_查詢'],
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
                        'word': r['客家語'],
                        'disp': r['客語標音_顯示'],
                        'query': r['客語標音_查詢'],
                    })

        # 3. 補字典 CSV (data/supp/補字典-{l}.csv)
        supp_path = os.path.join(DATA_DIR, 'supp', f'補字典-{l}.csv')
        if os.path.exists(supp_path):
            with open(supp_path, encoding='utf-8-sig') as f:
                for r in csv.DictReader(f):
                    records[l].append({
                        'src': '補字典',
                        'word': r['客家語'],
                        'disp': r['客語標音_顯示'],
                        'query': r['客語標音_查詢'],
                    })

        # 4. 愛灣語加詞 CSV (data/curated/加詞-{l}.csv)
        curated_path = os.path.join(DATA_DIR, 'curated', f'加詞-{l}.csv')
        if os.path.exists(curated_path):
            with open(curated_path, encoding='utf-8-sig') as f:
                for r in csv.DictReader(f):
                    records[l].append({
                        'src': '愛灣語加詞',
                        'word': r['客家語'],
                        'disp': r['客語標音_顯示'],
                        'query': r['客語標音_查詢'],
                    })

    _CACHE = records
    return _CACHE


def lookup_word_and_chars(word, records):
    """回傳 (整詞命中 dict, 各單字命中 list of dict, 各單字合成詞例句抽樣)"""
    word_matches = {l: [] for l in LECTS}
    for l in LECTS:
        for r in records[l]:
            if r['word'] == word:
                word_matches[l].append(r)

    char_matches = []
    compound_samples = []

    for ch in word:
        ch_dict = {l: [] for l in LECTS}
        ch_samples = {l: [] for l in LECTS}
        for l in LECTS:
            for r in records[l]:
                w = r['word']
                if w == ch:
                    ch_dict[l].append(r)
                elif ch in w and len(w) >= 2 and len(ch_samples[l]) < 5:
                    ch_samples[l].append(f"{w}({r['disp']})")
        char_matches.append((ch, ch_dict))
        compound_samples.append((ch, ch_samples))

    return word_matches, char_matches, compound_samples


def format_readings(match_list):
    if not match_list:
        return '（無收錄）'
    formatted = []
    seen = set()
    for r in match_list:
        key = (r['disp'], r['query'])
        if key not in seen:
            seen.add(key)
            formatted.append(f"{r['disp']} ({r['query']}) [{r['src']}]")
    return ' ； '.join(formatted)


def print_lookup_report(words, records):
    for w in words:
        print(f"\n{'='*25} 查詢詞彙：【{w}】 {'='*25}")
        word_matches, char_matches, compound_samples = lookup_word_and_chars(w, records)

        has_whole = any(bool(word_matches[l]) for l in LECTS)
        if has_whole:
            print("【整詞官方收錄】")
            for l in LECTS:
                print(f"  [{LECT_NAMES[l]} ({l})]: {format_readings(word_matches[l])}")
        else:
            print("【整詞官方未收錄，拆解單字分析】")

        for idx, (ch, ch_dict) in enumerate(char_matches):
            print(f"\n  ▶ 單字【{ch}】（第 {idx+1} 字）六腔真值：")
            for l in LECTS:
                res = format_readings(ch_dict[l])
                print(f"    - {LECT_NAMES[l]} ({l}): {res}")
            print(f"    - 既有合成詞抽樣：")
            for l in LECTS:
                samples = compound_samples[idx][1][l]
                sample_str = ', '.join(dict.fromkeys(samples)) if samples else '無'
                print(f"      * {l}: {sample_str}")


def emit_csv_lines(words, records):
    """直接產生 data/curated/加詞.csv 標準格式"""
    print("# 依客源翠官方資料庫真值自動產生之加詞.csv 候選資料（禁止手動修改調號）：")
    print("腔,字,客語標音_顯示,客語標音_查詢,依據,判斷說明")
    for w in words:
        word_matches, char_matches, _ = lookup_word_and_chars(w, records)
        for l in LECTS:
            # 優先取第一主讀合成
            disp_sylls = []
            query_sylls = []
            all_found = True
            for ch, ch_dict in char_matches:
                if ch_dict[l]:
                    # 取第一項
                    first_r = ch_dict[l][0]
                    # 若為多音字【】或 / 隔開，取第一個乾淨音節；並濾除「白/文/特/又讀」前綴
                    clean_disp = first_r['disp'].split('【')[0].split('/')[0].strip()
                    clean_disp = re.sub(r'^(又讀|文|白|特)\s*', '', clean_disp).strip()
                    clean_query = first_r['query'].split('【')[0].split('/')[0].strip()
                    clean_query = re.sub(r'^(又讀|文|白|特)\s*', '', clean_query).strip()
                    disp_sylls.append(clean_disp)
                    query_sylls.append(clean_query)
                else:
                    all_found = False
                    break
            if all_found:
                disp_str = ' '.join(disp_sylls)
                query_str = ' '.join(query_sylls)
                print(f'{l},{w},{disp_str},{query_str},教典與認證單字合成,依官方單字真值合成')
            else:
                print(f'# 警告：{l} 腔未能集齊詞彙「{w}」所有單字之官方讀音')


def main():
    parser = argparse.ArgumentParser(description="客源翠六腔真值查驗工具")
    parser.add_argument('words', nargs='+', help="要查詢的客語詞彙或單字")
    parser.add_argument('--emit-csv', action='store_true', help="直接輸出加詞.csv 格式列")
    args = parser.parse_args()

    records = load_all_lexicon()
    if args.emit_csv:
        emit_csv_lines(args.words, records)
    else:
        print_lookup_report(args.words, records)


if __name__ == '__main__':
    main()
