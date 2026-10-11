#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""盤點：data/cert（現役）vs data/cert_113（乾淨官方）的差異，
把「系統性轉換」（HagPinPlus 標音、空格清理、佔位列刪除）濾掉，
剩下的輸出成「疑似手改清單」。

用法：python3 scripts/audit_manual_edits.py [--csv 輸出路徑]
"""
import csv
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUR_DIR = os.path.join(ROOT, 'data', 'cert')
RAW_DIR = os.path.join(ROOT, 'data', 'cert_113')

PLACEHOLDER_WORD = '此腔無此詞條'
PLACEHOLDER_UNIT = '此級無此單元'

# 官方調號字母（修飾符號；含 ASCII 的 ^ 與 +）
OFFICIAL_TONE_MARKS = set('ˊˋˇˆ˙⁺+^')

def canon_col(col):
    """把兩邊不一致的欄名正規化成同一套角色名。"""
    c = col.strip()
    if c in ('編號', '編碼'):
        return '編號'
    if '標音' in c:
        return '標音'
    if ('詞義' in c and ('舉例' in c or '例句' in c)):
        return '詞義例句合併'
    if '詞義' in c:
        return '詞義'
    if '例句' in c or (c.endswith('舉例')):
        return '例句'
    if '翻譯' in c or '華譯' in c:
        return '翻譯'
    if '客家語' in c or '詞彙' in c:
        return '客家語'
    return c
# HagPinPlus 變音符（組合字元，NFD 後的 combining marks）
def strip_combining(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if not unicodedata.combining(c))

def norm_ws(s):
    return re.sub(r'\s+', ' ', (s or '').strip())

def no_space(s):
    return re.sub(r'\s+', '', (s or ''))

def read_csv(path):
    with open(path, 'r', encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))
    if not rows:
        return [], {}
    header = [canon_col(h) for h in rows[0]]
    data = {}
    dup = []
    for r in rows[1:]:
        if not any(cell.strip() for cell in r):
            continue
        # 補齊/截斷到 header 長度（官方檔常有尾逗號）
        r = (r + [''] * len(header))[:len(header)]
        rec = dict(zip(header, [c.strip() for c in r]))
        key = rec.get('編號', '')
        if not key:
            continue
        if key in data:
            dup.append(key)
        data[key] = rec
    return header, data

def is_placeholder(rec):
    vals = ' '.join(rec.values())
    return PLACEHOLDER_WORD in vals or PLACEHOLDER_UNIT in vals

# --- 標音比較 ---
SYL_SPLIT = re.compile(r'\s+')

def pinyin_skeleton(s):
    """去掉官方調號字母與 HagPinPlus 變音符後的『純字母骨架』，用來判斷聲韻是否有改。"""
    s = strip_combining(s.replace('<br>', ' '))
    s = ''.join(c for c in s if c not in OFFICIAL_TONE_MARKS)
    return no_space(re.sub(r'\s+', ' ', s.strip()))

def tone_signature(s, kind):
    """每個音節的調記號序列。kind='raw' 取官方調號字母；kind='cur' 取變音符名。"""
    sig = []
    for syl in SYL_SPLIT.split(s.replace('<br>', ' ').strip()):
        if not syl:
            continue
        if kind == 'raw':
            marks = [c for c in syl if c in OFFICIAL_TONE_MARKS]
            sig.append(marks[-1] if marks else '∅')
        else:
            nfd = unicodedata.normalize('NFD', syl)
            marks = [c for c in nfd if unicodedata.combining(c)]
            sig.append(unicodedata.name(marks[-1], '?').replace('COMBINING ', '') if marks else '∅')
    return sig

def main():
    out_csv = None
    if '--csv' in sys.argv:
        out_csv = sys.argv[sys.argv.index('--csv') + 1]

    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith('.csv'))
    findings = []          # 疑似手改
    stats = Counter()      # 全域統計
    per_file = {}

    # 第一輪：跨全部檔案學習「官方調號 → 變音符」對應（分腔）
    tone_pairs = defaultdict(Counter)  # dialect -> (raw_mark, cur_mark) -> count
    parsed = {}
    for fn in files:
        cur_path = os.path.join(CUR_DIR, fn)
        if not os.path.exists(cur_path):
            per_file[fn] = {'error': '現役缺此檔'}
            continue
        h_raw, raw = read_csv(os.path.join(RAW_DIR, fn))
        h_cur, cur = read_csv(cur_path)
        parsed[fn] = (h_raw, raw, h_cur, cur)
        dialect = fn[3]  # 113四基.csv -> 四
        pin_cols = [c for c in h_raw if '標音' in c and c in h_cur]
        for key, rrec in raw.items():
            crec = cur.get(key)
            if not crec or is_placeholder(rrec):
                continue
            for col in pin_cols:
                rv, cv = rrec.get(col, ''), crec.get(col, '')
                if pinyin_skeleton(rv) != pinyin_skeleton(cv):
                    continue
                rs, cs = tone_signature(rv, 'raw'), tone_signature(cv, 'cur')
                if len(rs) == len(cs):
                    for a, b in zip(rs, cs):
                        tone_pairs[dialect][(a, b)] += 1

    # 每腔每個官方調號的主流對應（含入聲差異就用 (raw_mark) -> 最常見 cur_mark 集合）
    tone_rule = {}
    for d, cnt in tone_pairs.items():
        by_raw = defaultdict(Counter)
        for (a, b), n in cnt.items():
            by_raw[a][b] += n
        # 允許一個官方調號對到多個變音符（平/入聲同符不同值沒差，符號通常一致），
        # 取覆蓋 >= 2% 的都算合法，避免把稀有正常對應誤判成手改
        tone_rule[d] = {a: {b for b, n in c.items() if n >= max(2, 0.02 * sum(c.values()))}
                        for a, c in by_raw.items()}

    # 第二輪：逐檔逐筆分類差異
    for fn in files:
        if fn not in parsed:
            continue
        h_raw, raw, h_cur, cur = parsed[fn]
        dialect = fn[3]
        f_stat = Counter()
        header_diff = (h_raw != h_cur)
        if header_diff:
            findings.append((fn, '(header)', '欄位', 'header-diff', ','.join(h_raw), ','.join(h_cur)))

        # 列集合差異
        raw_keys, cur_keys = set(raw), set(cur)
        for k in sorted(raw_keys - cur_keys):
            if is_placeholder(raw[k]):
                f_stat['佔位列刪除(系統)'] += 1
            else:
                f_stat['列被刪除(疑手改)'] += 1
                findings.append((fn, k, '(整列)', 'row-removed', raw[k].get('編號', '') + ' ' + list(raw[k].values())[1], ''))
        for k in sorted(cur_keys - raw_keys):
            f_stat['列新增(疑手改)'] += 1
            findings.append((fn, k, '(整列)', 'row-added', '', ' '.join(list(cur[k].values())[:3])))

        for key in sorted(raw_keys & cur_keys):
            rrec, crec = raw[key], cur[key]
            if is_placeholder(rrec):
                f_stat['佔位列(現役保留?)'] += 1 if is_placeholder(crec) else 0
                continue
            for col in h_raw:
                # 高級：原始檔詞義+例句擠一欄，現役拆成兩欄 → 串回去驗證
                if col == '詞義例句合併' and col not in crec:
                    rv = no_space(rrec.get(col, ''))
                    cv = no_space(crec.get('詞義', '') + crec.get('例句', '')).replace('<br>', '')
                    if rv == cv:
                        f_stat['詞義例句拆欄(系統)'] += 1
                    else:
                        f_stat['詞義例句拆欄異常(疑手改)'] += 1
                        findings.append((fn, key, col, 'split-anomaly',
                                         rrec.get(col, ''),
                                         crec.get('詞義', '') + ' ‖ ' + crec.get('例句', '')))
                    continue
                if col not in crec:
                    continue
                rv, cv = rrec.get(col, ''), crec.get(col, '')
                if norm_ws(rv) == norm_ws(cv):
                    continue
                if no_space(rv) == no_space(cv):
                    f_stat['空格清理(系統)'] += 1
                    continue
                if no_space(rv) == no_space(cv).replace('<br>', ''):
                    f_stat['例句br分隔(系統)'] += 1
                    continue
                if '標音' in col:
                    if pinyin_skeleton(rv) == pinyin_skeleton(cv):
                        rs, cs = tone_signature(rv, 'raw'), tone_signature(cv, 'cur')
                        if len(rs) == len(cs) and all(
                                b in tone_rule.get(dialect, {}).get(a, set())
                                for a, b in zip(rs, cs)):
                            f_stat['標音調號轉換(系統)'] += 1
                        else:
                            f_stat['標音調號異常(疑手改)'] += 1
                            findings.append((fn, key, col, 'tone-anomaly', rv, cv))
                    else:
                        f_stat['標音字母不同(疑手改)'] += 1
                        findings.append((fn, key, col, 'pinyin-letters', rv, cv))
                else:
                    f_stat['內容不同(疑手改)'] += 1
                    findings.append((fn, key, col, 'content-diff', rv, cv))
        per_file[fn] = dict(f_stat)
        stats.update(f_stat)

    # --- 輸出 ---
    print('=== 各檔統計 ===')
    for fn in files:
        st = per_file.get(fn, {})
        if 'error' in st:
            print(f'{fn}: ⚠ {st["error"]}')
            continue
        manual = sum(v for k, v in st.items() if '疑手改' in k)
        sysc = sum(v for k, v in st.items() if '系統' in k)
        print(f'{fn}: 系統性 {sysc:5d}  疑手改 {manual:3d}  ' +
              '  '.join(f'{k}={v}' for k, v in sorted(st.items()) if '疑手改' in k and v))
    print('\n=== 全域統計 ===')
    for k, v in stats.most_common():
        print(f'  {k}: {v}')
    print(f'\n疑似手改明細共 {len(findings)} 筆')

    if out_csv:
        with open(out_csv, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f)
            w.writerow(['檔案', '編號', '欄位', '類型', '官方原始', '現役'])
            w.writerows(findings)
        print(f'明細已寫入 {out_csv}')

if __name__ == '__main__':
    main()
