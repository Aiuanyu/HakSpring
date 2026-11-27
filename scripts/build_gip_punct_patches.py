#!/usr/bin/env python3
"""
教典「詞目有分句標點、音讀卻無標點」補丁產生器（overlay 層）。

問題：教典有兜諺語、歇後語，詞目有 `，` `；` `、` `－－`，原始音讀卻無對應標點
（例：詞目「阿婆嫁孫女－－無主無意」配音讀 `a24 po11 ga55 sun24 ng31 mo11 zu31 mo11 i55`）。
做法：依各分句个漢字字數摎音節數對應，產生「match_raw → replace_raw」補丁，
輸出 data/patches/gip-punct-fill.json；process_all_data.py 讀 gip_raw_patches.json 時會一齊讀這个。
補丁照教典原始音讀个寫法補標點（`go24，mo11`、`ng31－－mo11`），所以後續轉調符、查詢欄都走原本管線。

安全設計：
- 淨處理「無別讀、無註記、原始音讀無任何分句標點、字數＝音節數」个詞目；其他一律略過。
- match_raw 係整串原始音讀，官方日後補好標點，補丁就自動對毋著、毋會作用（會自己失效）。
- 補丁會經 clean_gip_raw_phonetic 進勘誤追蹤，出現在 data/upstream_feedback_gip.md，供回報官方。

用法：python3 scripts/build_gip_punct_patches.py   （教典換版後重跑，再跑 process_all_data.py）
"""
import collections
import csv
import json
import os
import re

csv.field_size_limit(10**9)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
GIP_DIR = os.path.join(ROOT, 'data', 'gip')
OUT = os.path.join(ROOT, 'data', 'patches', 'gip-punct-fill.json')

LETTER = re.compile(r'[^\W_]|□')  # 一隻漢字（含缺字 □）對一隻音節
CLAUSE = re.compile(r'([，；、]|[－─—]{2,})')
RAW_PUNCT = re.compile(r'[，；、－─—]')
CATEGORY = '標點缺漏'
REASON = '詞目有分句標點（，；、－－），音讀卻無對應標點；依各分句字數摎音節數對應補上。'


def clause_split(word):
    """詞目 → [(漢字字數, 該句後背个標點)]，尾項標點為空字串。"""
    parts = CLAUSE.split(word)
    segs = [[parts[0], '']]
    for i in range(1, len(parts), 2):
        segs[-1][1] = parts[i]
        segs.append([parts[i + 1] if i + 1 < len(parts) else '', ''])
    return [(len(LETTER.findall(t)), p) for t, p in segs if t or p]


def build():
    patches, skipped = [], collections.Counter()
    for fname in sorted(os.listdir(GIP_DIR)):
        m = re.match(r'(\d+)-(.+)\.csv$', fname)
        if not m:
            continue
        dialect = m.group(2)
        with open(os.path.join(GIP_DIR, fname), encoding='utf-8-sig') as fh:
            for idx, row in enumerate(csv.DictReader(fh)):
                word, raw = row['詞目'], row['音讀']
                if not CLAUSE.search(word.strip()):
                    continue
                if RAW_PUNCT.search(raw):
                    skipped['原始音讀已有標點'] += 1
                    continue
                base = raw.strip().strip('　')
                if '　' in base or re.search(r'[^\x00-\x7f]', base):
                    skipped['有別讀或註記'] += 1
                    continue
                toks = base.split()
                segs = clause_split(word.strip())
                if any(n < 1 for n, _ in segs):
                    skipped['分句無漢字'] += 1
                    continue
                if sum(n for n, _ in segs) != len(toks):
                    skipped['字數不等於音節數'] += 1
                    continue
                out, k = '', 0
                for si, (n, punct) in enumerate(segs):
                    # 破折號一律寫成原始音讀个「－－」：管線（convert_phonetic_string）淨認這个，
                    # 詞目用「──」（U+2500）時照寫會害聲調數字毋轉調符
                    if re.fullmatch(r'[－─—]{2,}', punct):
                        punct = '－－'
                    out += ' '.join(toks[k:k + n]) + punct
                    k += n
                    if si < len(segs) - 1 and not punct:
                        out += ' '
                patches.append({
                    'dialect': dialect, 'hanji': word, 'gip_id': f'gip-{idx + 1}',
                    'match_raw': base, 'replace_raw': out,
                    'category': CATEGORY, 'reason': REASON,
                })
    return patches, skipped


def main():
    patches, skipped = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(patches, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'補丁 {len(patches)} 筆 → {os.path.relpath(OUT, ROOT)}')
    print('各腔：', dict(collections.Counter(p['dialect'] for p in patches)))
    print('略過：', dict(skipped))


if __name__ == '__main__':
    main()
