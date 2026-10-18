# -*- coding: utf-8 -*-
"""
次方言補音（sub-dialects-fill）：認證四縣無標南四縣音个詞條，推導南四縣音。

認證無標【南】毋係「南北共樣」，係官方漏標。推導照下背順序，前一層有結果就停：
1. 教典南四縣：詞目共樣就用教典南四縣个音（整條詞）。
2. 逐隻音節：
   a. 詞尾「仔」照詞性：形容詞、副詞 → é，名詞 → è
   b. 字級對照：由已標南音个認證詞、教典四縣／南四縣共詞，學「這隻字北讀 X、南讀 Y」
   c. 系統規則：舌根音、喉音、零聲母 + -ien/-ied → -ian/-iad
   d. 以上都無：音節照北四縣（記做 same）
單字詞查教典時，教典个音摎逐音節推導無共樣，記做 gip-check（可能係同形異義，愛人工確認）。

輸出：data/sub-dialects-fill/南四縣.json 摎 .csv（附表，以「來源＋編號」對到原詞條，原始資料毋動）；
      南四縣.web.json：網站用个精簡版，淨收推導結果摎北四縣無共樣个。
`--eval`：拿已標南音个詞條做五摺交叉驗證，印出各方法个準確率。
"""
import csv
import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from build_supp_dict import (  # noqa: E402
    HAN, SYLLABLE, READING_SPLIT, expand_parens, load_variants,
)

OUT_DIR = os.path.join(ROOT, 'data', 'sub-dialects-fill')
TONE_MARKS = '̀́̂̄̌'
VELAR_ZERO = ('g', 'k', 'h', 'ng', '')
INITIALS = ['zh', 'ch', 'sh', 'rh', 'ng', 'bb', 'b', 'p', 'm', 'f', 'v', 'd', 't', 'n', 'l',
            'g', 'k', 'h', 'z', 'c', 's', 'j', 'q', 'x']
TABLE_MIN_COUNT = 2
TABLE_MIN_SHARE = 0.8


def nfc(s):
    return unicodedata.normalize('NFC', s)


def split_tone(syl):
    """回傳（無調字母、調符）。"""
    d = unicodedata.normalize('NFD', syl)
    marks = ''.join(c for c in d if c in TONE_MARKS)
    base = ''.join(c for c in d if c not in TONE_MARKS)
    return base, marks


def put_tone(base, mark):
    """調符放在主要元音頂高（a > e > o > u > i）。"""
    if not mark:
        return nfc(base)
    for v in 'aeoui':
        i = base.find(v)
        if i >= 0:
            return nfc(base[:i + 1] + mark + base[i + 1:])
    return nfc(base + mark)


def initial_of(base):
    for ini in INITIALS:
        if base.startswith(ini):
            return ini
    return ''


def rule_ien(syl):
    """舌根音、喉音、零聲母 + -ien/-ied → -ian/-iad；毋合就回傳 None。"""
    base, mark = split_tone(syl)
    low = base.lower()
    ini = initial_of(low)
    rest = low[len(ini):]
    if ini in VELAR_ZERO and rest in ('ien', 'ied'):
        return put_tone(base[:len(ini)] + 'ia' + rest[2:], mark)
    return None


def zai_by_pos(pos):
    if pos in ('形容詞', '副詞'):
        return 'é'
    if pos == '名詞':
        return 'è'
    return None


NOTE_SPLIT = re.compile(r'特')


def first_reading(phonetic):
    """取第一隻讀音，拆忒「又讀／文／白／特」等註記，音節用一隻空白隔開。"""
    for part in READING_SPLIT.split(phonetic):
        for p in NOTE_SPLIT.split(part):
            sylls = SYLLABLE.findall(p)
            if sylls:
                return ' '.join(nfc(x) for x in sylls)
    return ''


def syllables(phonetic):
    return [nfc(x) for x in SYLLABLE.findall(phonetic)]


def aligned(word, phonetic):
    chars = HAN.findall(word)
    sylls = [nfc(s) for s in SYLLABLE.findall(phonetic.replace('-', ' '))]
    if chars and len(chars) == len(sylls):
        return chars, sylls
    return None


def load_entries():
    """認證四縣詞條：(檔, 編號) → {word, pos, north, south(可能無)}；教典四縣、南四縣：詞 → 音。"""
    cert = {}
    gip = {'四': defaultdict(list), '南': defaultdict(list)}
    for o in load_variants():
        src = o['sourceName']
        if src.startswith('四縣'):
            e = cert.setdefault((o['file'], o['id']), {'word': None, 'pos': o['pos'], 'north': None,
                                                      'south': None, 'south_word': None, 'src': src})
            if o['label'] == '北' and e['north'] is None:
                e['word'], e['north'] = o['word'], o['phonetic']
            elif o['label'] == '南' and e['south'] is None:
                e['south'], e['south_word'] = o['phonetic'], o['word']
        elif src in ('教典四', '教典南'):
            r = first_reading(o['phonetic'])
            if r:
                gip[src[2]][o['word']].append(r)
    return cert, gip


def learn_table(pairs):
    """pairs：[(字, 北音節, 南音節)] → (字, 北音節) → Counter(南音節)。"""
    table = defaultdict(Counter)
    for ch, n, s in pairs:
        table[(ch, n)][s] += 1
    return table


def cert_pairs(e):
    """已標南音、詞共樣、對得齊个認證詞條 → 逐字（北、南）。"""
    if not e['south'] or e['south_word'] != e['word']:
        return []
    a, b = aligned(e['word'], e['north']), aligned(e['word'], e['south'])
    if not a or not b:
        return []
    return [(ch, n, s) for ch, n, s in zip(a[0], a[1], b[1])]


def gip_pairs(gip):
    out = []
    for word, norths in gip['四'].items():
        if word not in gip['南']:
            continue
        a, b = aligned(word, norths[0]), aligned(word, gip['南'][word][0])
        if a and b:
            out += [(ch, n, s) for ch, n, s in zip(a[0], a[1], b[1])]
    return out


def derive(e, table, gip):
    """回傳（南四縣標音、整條方法、逐音節方法）。"""
    south, how, methods = derive_syllables(e, table)
    candidates = gip['南'].get(e['word'])
    if candidates:
        # 教典南四縣可能有同形異義（例：擔 dám／dam），揀摎逐音節推導最近个該隻
        pred = syllables(south)

        def score(c):
            cs = syllables(c)
            return (cs == pred, sum(a == b for a, b in zip(cs, pred)) - abs(len(cs) - len(pred)))
        best = max(candidates, key=score)
        # 單字詞同形異義个風險最大（例：擔 dám／dam）：教典个音摎推導無共樣，標 gip-check 等人工確認
        if len(HAN.findall(e['word'])) == 1 and syllables(best) != pred:
            return best, 'gip-check', []
        return best, 'gip', []
    return south, how, methods


def derive_syllables(e, table):
    word, north = e['word'], e['north']
    al = aligned(word, north)
    chars = al[0] if al else None
    out, methods = [], []
    matches = list(SYLLABLE.finditer(north))
    for i, m in enumerate(matches):
        syl = nfc(m.group())
        ch = chars[i] if chars else None
        new, how = None, None
        if ch == '仔' and i == len(matches) - 1:
            z = zai_by_pos(e['pos'])
            if z:
                new, how = z, 'zai'
        if new is None and ch is not None:
            c = table.get((ch, syl))
            if c:
                top, n = c.most_common(1)[0]
                total = sum(c.values())
                if total >= TABLE_MIN_COUNT and n / total >= TABLE_MIN_SHARE:
                    new, how = top, 'table'
        if new is None:
            r = rule_ien(syl)
            if r:
                new, how = r, 'rule-ien'
        if new is None:
            new, how = syl, 'same'
        out.append((m.start(), m.end(), new))
        methods.append(how)
    south = north
    for start, end, new in reversed(out):
        south = south[:start] + new + south[end:]
    entry_method = 'syllable' if any(h != 'same' for h in methods) else 'same'
    return south, entry_method, methods


def evaluate(cert, gip):
    tests = [(k, e) for k, e in cert.items() if cert_pairs(e)]
    folds = 5
    stats = Counter()
    by_method = defaultdict(Counter)
    gp = gip_pairs(gip)
    for f in range(folds):
        train = [p for i, (k, e) in enumerate(tests) if i % folds != f for p in cert_pairs(e)]
        table = learn_table(train + gp)
        for i, (k, e) in enumerate(tests):
            if i % folds != f:
                continue
            truth = syllables(e['south'])
            pred, how, sm = derive(e, table, gip)
            ok = syllables(pred) == truth
            stats['entries'] += 1
            stats['entry_ok'] += ok
            by_method[how]['n'] += 1
            by_method[how]['ok'] += ok
            if how != 'gip':
                tsyl, psyl = truth, syllables(pred)
                if len(tsyl) == len(psyl) == len(sm):
                    for t, p, h in zip(tsyl, psyl, sm):
                        by_method['syl:' + h]['n'] += 1
                        by_method['syl:' + h]['ok'] += (t == p)
    print(f'考卷：已標南音个詞條 {stats["entries"]} 條，整條全對 {stats["entry_ok"]}'
          f'（{stats["entry_ok"] / stats["entries"]:.1%}）')
    for k in sorted(by_method):
        v = by_method[k]
        print(f'  {k:14s} {v["ok"]:5d}／{v["n"]:5d}  {v["ok"] / v["n"]:.1%}')


def main():
    cert, gip = load_entries()
    if '--eval' in sys.argv:
        evaluate(cert, gip)
        return
    table = learn_table([p for e in cert.values() for p in cert_pairs(e)] + gip_pairs(gip))
    rows = []
    for (fname, eid), e in cert.items():
        if e['south'] or not e['north']:
            continue
        south, how, sm = derive(e, table, gip)
        rows.append({
            'source': fname.replace('.json', '').lstrip('0123456789'),
            '編號': eid,
            '客家語': e['word'],
            '北四縣': e['north'],
            '南四縣': south,
            'method': how,
            'syllable_methods': ' '.join(sm),
            'same_as_north': syllables(south) == syllables(e['north']),
        })
    os.makedirs(OUT_DIR, exist_ok=True)
    base = os.path.join(OUT_DIR, '南四縣')
    with open(base + '.json', 'w', encoding='utf-8') as f:
        json.dump({'name': '次方言補音南四縣', 'from': '四縣認證', 'entries': rows}, f, ensure_ascii=False, indent=1)
    buf = io.StringIO(newline='')
    w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), lineterminator='\n')
    w.writeheader()
    w.writerows(rows)
    with open(base + '.csv', 'w', encoding='utf-8-sig', newline='') as f:
        f.write(buf.getvalue())
    # 網站用个精簡版：淨收推導結果摎北四縣無共樣个，鍵係「來源|編號」（例：四基|1-3）
    web = {f"{r['source']}|{r['編號']}": [r['南四縣'], r['method']] for r in rows if not r['same_as_north']}
    with open(base + '.web.json', 'w', encoding='utf-8') as f:
        json.dump(web, f, ensure_ascii=False, separators=(',', ':'))
    c = Counter(r['method'] for r in rows)
    diff = sum(1 for r in rows if not r['same_as_north'])
    print(f'--- 次方言補音（南四縣）---\n  補 {len(rows)} 條；推導結果摎北四縣無共樣个 {diff} 條；方法：{dict(c)}')


if __name__ == '__main__':
    main()
