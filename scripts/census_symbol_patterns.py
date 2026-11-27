#!/usr/bin/env python3
"""
符號／註記態樣普查（唯讀，毋改任何資料）。

做麼个：掃 data/cert/115*.json 摎 data/gip/2026*.json 个「客家語」「客語標音_顯示」欄，
漢字、羅馬字音節攏縮成佔位符（詞目欄 a、標音欄 s），淨留符號，統計各種「符號組合」出現幾多條。
結果用來對照 docs/narrow-screen-line-breaks.md 个盤點表。

用法：python3 scripts/census_symbol_patterns.py [--top 40]
資料換版（認證換年度、教典換版）後重跑，把 doc 裡肚个條數更新。
"""
import argparse
import collections
import csv
import glob
import io
import json
import os
import re

csv.field_size_limit(10**9)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')

# 漢字範圍：毋含 CJK 標點（U+3000–303F），無則【】、會當做漢字
HAN = re.compile(
    r'[⺀-⿟ㄅ-ㄯㆠ-ㆿ㐀-䶿一-鿿豈-﫿'
    r'-\U00020000-\U0003ffff\U000f0000-\U000fffff□]'
)


def load_rows():
    rows = []
    patterns = (('cert', 'cert/115*.json'), ('gip', 'gip/2026*.json'))
    for src, pat in patterns:
        for f in sorted(glob.glob(os.path.join(ROOT, pat))):
            with open(f, encoding='utf-8') as fh:
                d = json.load(fh)
            for r in csv.DictReader(io.StringIO(d['content'])):
                r['_src'], r['_name'] = src, d['name']
                rows.append(r)
    return rows


def sig_word(s):
    s = s.replace('\xa0', '␣').replace('　', '▢').replace('\n', '⏎')
    s = re.sub(r'H+', 'H', HAN.sub('H', s))
    return re.sub(r'[A-Za-z0-9]+', 'a', s)


def sig_phonetic(s):
    s = s.replace('\xa0', '␣').replace('　', '▢').replace('\n', '⏎')
    s = HAN.sub('N', s)  # 教典行內註記（特、又讀…）
    # 音節（含組合附加符號，如 m̌）→ s；連字號相連視為同一音節
    s = re.sub(r'[^\W_]+(?:[̀-ͯ]*[^\W_]*)*(?:-[^\W_̀-ͯ]+)*', 's', s)
    s = re.sub(r'[̀-ͯ]', '', s)
    s = re.sub(r'(s ?)+', 's', s)
    return re.sub(r' +', '_', s)


def dun_location(word):
    """認證詞目欄頓號个位置：括號（）裡、變體【】裡、兩層都有、最外層。"""
    paren = bracket = 0
    out = collections.Counter()
    for ch in word:
        if ch == '（':
            paren += 1
        elif ch == '）':
            paren = max(0, paren - 1)
        elif ch == '【':
            bracket += 1
        elif ch == '】':
            bracket = max(0, bracket - 1)
        elif ch == '、':
            out[('（）' if paren else '') + ('【】' if bracket else '') or '最外層'] += 1
    return out


def tally(rows, src, fld, fn, top):
    c, ex = collections.Counter(), {}
    for r in rows:
        if r['_src'] != src:
            continue
        v = r.get(fld) or ''
        k = fn(v)
        c[k] += 1
        ex.setdefault(k, v)
    print(f'\n### {src}／{fld}（{len(c)} 種態樣）')
    for k, n in c.most_common(top):
        print(f'{n:7d}  {k!r:40}  例：{ex[k][:44]!r}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=40)
    top = ap.parse_args().top
    rows = load_rows()
    by_src = collections.Counter(r['_src'] for r in rows)
    print('總筆數', dict(by_src))
    tally(rows, 'cert', '客家語', sig_word, top)
    tally(rows, 'gip', '客家語', sig_word, top)
    tally(rows, 'cert', '客語標音_顯示', sig_phonetic, top)
    tally(rows, 'gip', '客語標音_顯示', sig_phonetic, top)

    print('\n### 認證詞目欄頓號（、）个位置')
    loc = collections.Counter()
    for r in rows:
        if r['_src'] == 'cert':
            loc.update(dun_location(r.get('客家語') or ''))
    for k, n in loc.most_common():
        print(f'{n:7d}  {k}')

    gip = [r for r in rows if r['_src'] == 'gip']
    prov = [r for r in gip if re.search('[，；－─]', r['客家語'] or '')]
    print(f'\n### 教典諺語／歇後語（詞目含 ，；－－ ──）：{len(prov)} 條')
    for k, n in sorted(collections.Counter(r['_name'] for r in prov).items()):
        print(f'{n:7d}  {k}')
    lens = sorted(len(r['客家語']) for r in prov)
    print(f'  詞目字數：中位數 {lens[len(lens) // 2]}、第 90 百分位 {lens[int(len(lens) * .9)]}、最長 {lens[-1]}')

    cert = [r for r in rows if r['_src'] == 'cert']
    nb = [r['客語標音_顯示'] for r in cert if '\xa0' in (r['客語標音_顯示'] or '')]
    alone = [p for p in nb if re.search(r'(?<! )\xa0(?! )', p)]
    print(f'\n### 認證標音含不換行空白：{len(nb)} 條，其中兩爿無普通空白（音節間斷毋開）：{len(alone)} 條')


if __name__ == '__main__':
    main()
