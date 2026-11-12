# -*- coding: utf-8 -*-
"""
擬音審音佇列：產生 review-nisim.html 讀个 review/nisim-queue.json。

選字：data/supp/擬音-四.csv 照例句次數、字頻排序前 TOP 隻，加上「依據有異體」个風險字前 RISK 隻
（異體字推音會共意思無共个字拿來亂借音，例：饋←匱）。

用法：python3 scripts/build_nisim_review.py
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'supp', '擬音-四.csv')
OUT = os.path.join(ROOT, 'review', 'nisim-queue.json')
TOP = 150
RISK = 100


def main():
    with open(SRC, encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))
    picked, seen = [], set()
    for tag, pool, n in (('高頻', rows, TOP), ('異體風險', [r for r in rows if '異體' in r['依據']], RISK)):
        for r in pool[:n]:
            if r['字'] in seen:
                continue
            seen.add(r['字'])
            picked.append({
                'id': r['字'], '字': r['字'], '讀音': r['讀音'], '數字調': r['數字調'],
                '其他候選': r['其他候選'].split(), '依據': r['依據'],
                '字頻': int(r['字頻'] or 0), '例句次數': int(r['例句次數'] or 0),
                '標籤': tag + ('' if '異體' not in r['依據'] else '／含異體'),
            })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'note': '由 scripts/build_nisim_review.py 產生，毋好手改。', 'items': picked}, f, ensure_ascii=False)
    print(f'{len(picked)} 隻字 → {OUT}')


if __name__ == '__main__':
    main()
