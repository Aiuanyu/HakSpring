#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""替盤點結果加上官方 114 比對與建議處置。

讀 data/manual_edits_113_audit.csv，對每筆手改比對官方 113 vs 114 同一格：
- 官方未動 → 手改仍適用 → 建議「保留」
- 官方已動 → 建議「需人工目視」（官方可能已修或改了別的）
- 無 114 檔（高級）→ 建議「保留」
另偵測同一詞條 ≥4 欄連動的 content-diff（疑似當年誤拆例句造成的錯位）→ 建議「回歸官方(目視確認)」。

輸出：data/manual_edits_113_audit_114.csv
"""
import csv
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audit_manual_edits import read_csv, norm_ws, ROOT  # noqa: E402

RAW113 = os.path.join(ROOT, 'data', 'cert_113')
RAW114 = os.path.join(ROOT, 'data', 'cert_114')
IN_CSV = os.path.join(ROOT, 'data', 'manual_edits_113_audit.csv')
OUT_CSV = os.path.join(ROOT, 'data', 'manual_edits_113_audit_114.csv')

def main():
    with open(IN_CSV, 'r', encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))
    header, findings = rows[0], rows[1:]

    cache = {}
    def load(year_dir, fn):
        p = os.path.join(year_dir, fn)
        if p not in cache:
            cache[p] = read_csv(p)[1] if os.path.exists(p) else None
        return cache[p]

    # 錯位偵測：同檔同編號的 content-diff 欄數
    cascade = defaultdict(int)
    for r in findings:
        if r[3] == 'content-diff':
            cascade[(r[0], r[1])] += 1

    out = []
    stats = defaultdict(int)
    for r in findings:
        fn113, key, col, typ = r[0], r[1], r[2], r[3]
        fn114 = fn113.replace('113', '114', 1)
        v114, status = '', ''
        d114 = load(RAW114, fn114)
        d113 = load(RAW113, fn113)
        if typ == 'header-diff':
            status, advice = '—', '資訊性，略過'
        elif d114 is None:
            status, advice = '無114檔', '保留'
        else:
            rec113 = (d113 or {}).get(key)
            rec114 = d114.get(key)
            if rec114 is None:
                status, advice = '114無此編號', '需人工目視'
            elif col in ('(整列)',):
                same = all(norm_ws(rec113.get(c, '')) == norm_ws(rec114.get(c, ''))
                           for c in rec113) if rec113 else False
                status = '官方未動' if same else '官方已動'
                advice = '保留' if same else '需人工目視'
            else:
                v113 = norm_ws((rec113 or {}).get(col, ''))
                v114 = norm_ws(rec114.get(col, ''))
                if v113 == v114:
                    status, advice = '官方未動', '保留'
                else:
                    status, advice = '官方已動', '需人工目視'
        if typ == 'content-diff' and cascade[(fn113, key)] >= 4:
            advice = '疑錯位→回歸官方(目視確認)'
        out.append(r + [v114, status, advice])
        stats[advice] += 1

    with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(header + ['官方114值', '114狀態', '建議處置'])
        w.writerows(out)

    print(f'已輸出 {OUT_CSV}（{len(out)} 筆）')
    print('建議處置統計：')
    for k, v in sorted(stats.items(), key=lambda x: -x[1]):
        print(f'  {k}: {v}')

if __name__ == '__main__':
    main()
