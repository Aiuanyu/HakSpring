# -*- coding: utf-8 -*-
"""
次方言補音（sub-dialects-fill）：認證四縣無標南四縣音个詞條，推導南四縣音。

認證無標【南】毋係「南北共樣」，係官方漏標。推導照下背順序，前一層有結果就停：
1. 教典南四縣：詞目共樣就用教典南四縣个音（整條詞）。
2. 逐隻音節：
   a. 詞尾「仔」照詞性：形容詞、副詞 → é，名詞 → è
   b. 字級對照：由已標南音个認證詞、教典四縣／南四縣共詞，學「這隻字北讀 X、南讀 Y」
   c. 系統規則：舌根音、喉音、零聲母 + -ien/-ied → -ian/-iad
   d. 以上都無：音節照北四縣（記做 same）；有這種音節个詞條算推毋出，毋寫進附表，另外列在 待審-南四縣
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
    HAN, SYLLABLE, load_gip_readings, load_variants,
)

OUT_DIR = os.path.join(ROOT, 'data', 'sub-dialects-fill')
TONE_MARKS = '̀́̂̄̌'
VELAR_ZERO = ('g', 'k', 'h', 'ng', '')
INITIALS = ['zh', 'ch', 'sh', 'rh', 'ng', 'bb', 'b', 'p', 'm', 'f', 'v', 'd', 't', 'n', 'l',
            'g', 'k', 'h', 'z', 'c', 's', 'j', 'q', 'x']
TABLE_MIN_COUNT = 1   # 20261021 由 2 降做 1：交叉驗證字級對照 96.5%→96.3%，整條全對 78.0%→78.8%
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
                                                      'south': None, 'south_word': None, 'src': src,
                                                      'meinung': None, 'meinung_word': None})
            if o['label'] == '北' and e['north'] is None:
                e['word'], e['north'] = o['word'], o['phonetic']
            elif o['label'] == '南' and e['south'] is None:
                e['south'], e['south_word'] = o['phonetic'], o['word']
            elif o['label'] == '美' and e['meinung'] is None:
                e['meinung'], e['meinung_word'] = o['phonetic'], o['word']
    for d in ('四', '南'):
        for word, readings in load_gip_readings(d).items():
            gip[d][word] += readings
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


def derive(e, table, gip, manual_chars=None):
    """回傳（南四縣標音、整條方法、逐音節方法）。"""
    south, how, methods = derive_syllables(e, table, manual_chars)
    # 音節數摎北四縣無共樣个教典讀音毋用（多半係合音抑係無共樣个詞形，例：幾下 giá／gì há）
    n_north = syllable_slots(e['north'])[2]
    candidates = [c for c in gip['南'].get(e['word'], []) if len(syllables(c)) == n_north]
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


def syllable_slots(phonetic):
    """音節 → 字位置。斜線連等个音節（同詞多音，例：hím/hiún）共一隻字位置。"""
    matches = list(SYLLABLE.finditer(phonetic))
    slots, slot, prev_end = [], -1, None
    for m in matches:
        if prev_end is None or phonetic[prev_end:m.start()] != '/':
            slot += 1
        slots.append(slot)
        prev_end = m.end()
    return matches, slots, slot + 1


def derive_syllables(e, table, manual_chars=None):
    word, north = e['word'], e['north']
    matches, slots, n_slots = syllable_slots(north)
    han = HAN.findall(word)
    chars = han if han and len(han) == n_slots else None
    out, methods = [], []
    for i, m in enumerate(matches):
        syl = nfc(m.group())
        ch = chars[slots[i]] if chars else None
        new, how = None, None
        # 人工字音（審音工具「依字歸組」）優先：（字、北音、詞性）→ 南音；詞性空白表示毋分詞性
        if manual_chars and ch:
            mc = manual_chars.get((ch, syl, e['pos'])) or manual_chars.get((ch, syl, ''))
            if mc:
                new, how = mc, 'manual'
        if new is None and ch == '仔' and slots[i] == n_slots - 1:
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


LAYER_NAMES = {'gip': '教典南四縣', 'gip-check': '教典南四縣', 'table': '字級對照',
               'zai': '系統規則', 'rule-ien': '系統規則'}


def entry_layer(how, sm):
    """整條个推導層；有音節無證據（same）就回傳 None（推毋出，毋寫進附表）。"""
    if how in ('gip', 'gip-check'):
        return LAYER_NAMES[how]
    if how == 'same' or 'same' in sm:
        return None
    if sm and all(h == 'manual' for h in sm):
        return '人工'
    # 人工字音摎其他方法混用：取其他方法裡較弱个
    return '系統規則' if any(h in ('zai', 'rule-ien') for h in sm) else '字級對照'


def write_rows(base, rows, extra=None):
    # 一筆一行：檔案較細，git diff 也看得清楚
    head = json.dumps(extra or {}, ensure_ascii=False)[:-1]
    head = head + (', ' if extra else '') + '"entries": [\n'
    with open(base + '.json', 'w', encoding='utf-8') as f:
        f.write(head + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n]}\n')
    buf = io.StringIO(newline='')
    w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), lineterminator='\n')
    w.writeheader()
    w.writerows([{k: (' '.join(v) if isinstance(v, list) else v) for k, v in r.items()} for r in rows])
    with open(base + '.csv', 'w', encoding='utf-8-sig', newline='') as f:
        f.write(buf.getvalue())


def tone_24_to_33(phonetic):
    """美濃：24 調（á）一律改 33 調（ā）。美濃腔系統規則；認證標个美濃音聲調還係寫 24，驗毋著。"""
    d = unicodedata.normalize('NFD', phonetic)
    return nfc(d.replace('\u0301', '\u0304'))


def meinung_table(cert):
    """認證已標美濃音个詞：（字、南四縣音節）→ 美濃音節。南四縣無標就用北四縣做底。"""
    pairs = []
    for e in cert.values():
        if not e['meinung'] or e['meinung_word'] != e['word']:
            continue
        base = e['south'] if e['south'] and e['south_word'] == e['word'] else e['north']
        a, b = aligned(e['word'], base or ''), aligned(e['word'], e['meinung'])
        if a and b:
            pairs += [(ch, x, y) for ch, x, y in zip(a[0], a[1], b[1])]
    return learn_table(pairs)


def derive_meinung(word, south, table):
    """由南四縣音推美濃音：字級對照（認證已標个美濃音）→ 24 調改 33 調。"""
    al = aligned(word, south)
    out, used_table = south, False
    if al:
        matches = list(SYLLABLE.finditer(south))
        for i in reversed(range(len(matches))):
            m = matches[i]
            c = table.get((al[0][i], nfc(m.group())))
            if c:
                top = c.most_common(1)[0][0]
                if top != nfc(m.group()):
                    out = out[:m.start()] + top + out[m.end():]
                    used_table = True
    return tone_24_to_33(out), used_table


def build_meinung(cert, south_rows):
    """認證四縣詞條（無標美濃音个）→ 美濃附表。南四縣音愛有：認證原標，抑係南四縣附表推得出來个。"""
    table = meinung_table(cert)
    derived_south = {(r['來源檔'], r['編號']): r for r in south_rows}
    rows, skipped = [], 0
    for (fname, eid), e in cert.items():
        if e['meinung'] or not e['north']:
            continue
        key = (fname.replace('.json', ''), eid)
        if e['south']:
            south, south_word, south_layer = e['south'], e['south_word'], '認證原標'
        elif key in derived_south:
            r = derived_south[key]
            south, south_word, south_layer = r['讀音'], e['word'], r['推導層']
        else:
            skipped += 1        # 南四縣推毋出，美濃乜推毋出
            continue
        meinung, used_table = derive_meinung(south_word, south, table)
        row = {
            '來源檔': key[0],
            '編號': eid,
            '詞目': e['word'],
            '北四縣': e['north'],
            '讀音': meinung,
            '變體': ['美濃'],
            '推導層': '系統規則',      # 美濃跟南四縣＋24 改 33，都係系統規則
            '待確認': False,
            '同南四縣': syllables(meinung) == syllables(south),
            '南四縣來源': south_layer,
            '用著字級對照': used_table,
        }
        if south_word != e['word']:
            row['讀音詞目'] = south_word   # 認證南四縣用另一隻詞（例：鍬布脣→車布脣）
        rows.append(row)
    return rows, skipped


def build_meinung_gip(gip, table):
    """教典美濃：以教典南四縣个讀音做底推。鍵用「腔＋詞目」（教典 idx 會位移）。

    回傳附表列（一隻讀音一列）摎網站用个 {'教典|詞': 美濃讀音（ / 隔開）}，
    網站淨收摎南四縣無共樣个；教典四縣、南四縣共用一隻鍵（教典四縣个詞用共樣詞目對到教典南四縣）。
    """
    rows, web = [], {}
    for word, souths in gip['南'].items():
        meinungs = []
        for south in souths:
            meinung, used_table = derive_meinung(word, south, table)
            rows.append({
                '來源檔': '教典南',
                '編號': '',
                '詞目': word,
                '北四縣': gip['四'][word][0] if gip['四'].get(word) else '',
                '讀音': meinung,
                '變體': ['美濃'],
                '推導層': '系統規則',
                '待確認': False,
                '同南四縣': syllables(meinung) == syllables(south),
                '南四縣來源': '教典南四縣',
                '用著字級對照': used_table,
                '讀音詞目': '',
            })
            if meinung not in meinungs:
                meinungs.append(meinung)
        if any(syllables(m) != syllables(sx) for m, sx in zip(meinungs, souths)):
            web[f'教典|{word}'] = ' / '.join(meinungs)
    return rows, web


MANUAL_CSV = os.path.join(OUT_DIR, '人工-南四縣.csv')
MANUAL_CHAR_CSV = os.path.join(OUT_DIR, '人工字音-南四縣.csv')


def load_manual_chars():
    """審音工具「依字歸組」个結果：（字、北音、詞性）→ 南音。詞性空白表示毋分詞性（淨「仔」分詞性）。"""
    if not os.path.exists(MANUAL_CHAR_CSV):
        return {}
    with open(MANUAL_CHAR_CSV, encoding='utf-8-sig') as f:
        return {(r['字'], nfc(r['北音']), r.get('詞性', '')): nfc(r['南音'].strip())
                for r in csv.DictReader(f) if r.get('判定') == '採用' and r.get('南音', '').strip()}


def load_manual():
    """審音結果（review-readings.html 匯出）：（來源檔, 編號）→ 讀音。淨收判定「採用」个。"""
    if not os.path.exists(MANUAL_CSV):
        return {}
    with open(MANUAL_CSV, encoding='utf-8-sig') as f:
        return {(r['來源檔'], r['編號']): r['讀音'].strip()
                for r in csv.DictReader(f) if r.get('判定') == '採用' and r.get('讀音', '').strip()}


def main():
    cert, gip = load_entries()
    if '--eval' in sys.argv:
        evaluate(cert, gip)
        return
    table = learn_table([p for e in cert.values() for p in cert_pairs(e)] + gip_pairs(gip))
    manual = load_manual()
    manual_chars = load_manual_chars()
    rows, pending = [], []
    for (fname, eid), e in cert.items():
        if e['south'] or not e['north']:
            continue
        south, how, sm = derive(e, table, gip, manual_chars)
        layer = entry_layer(how, sm)
        key = (fname.replace('.json', ''), eid)
        if key in manual:
            # 人工審過：蓋過推導結果（含 gip-check）
            south, how, sm, layer = manual[key], 'manual', [], '人工'
        row = {
            '來源檔': fname.replace('.json', ''),   # 例：113四高
            '編號': eid,
            '詞目': e['word'],
            '北四縣': e['north'],
            '讀音': south,                           # HagPinPlus 調符，摎認證標音共樣格式
            '變體': ['南'],
            '推導層': layer,
            '待確認': how == 'gip-check',            # 單字詞，教典音摎逐音節推導無共樣
            '同北四縣': syllables(south) == syllables(e['north']),
            '逐音節': ' '.join(sm),
        }
        (rows if layer else pending).append(row)
    os.makedirs(OUT_DIR, exist_ok=True)
    meta = {'name': '次方言補音', 'from': '認證四縣', 'schema': 'data/sub-dialects-fill/README.md'}
    write_rows(os.path.join(OUT_DIR, '南四縣'), rows, meta)
    # 推毋出个（有音節無證據）：毋寫進附表，另外列分審音工具
    write_rows(os.path.join(OUT_DIR, '待審-南四縣'), pending, {**meta, 'note': '推毋出，毋係附表'})
    # 網站用个精簡版：淨收推導結果摎北四縣無共樣个，鍵係「來源|編號」（例：四基|1-3）
    web = {f"{r['來源檔'].lstrip('0123456789')}|{r['編號']}": [r['讀音'], r['推導層']]
           for r in rows if not r['同北四縣']}
    with open(os.path.join(OUT_DIR, '南四縣.web.json'), 'w', encoding='utf-8') as f:
        json.dump(web, f, ensure_ascii=False, separators=(',', ':'))
    # 美濃：以南四縣（認證原標＋上背推得出來个）做底
    m_rows, m_skipped = build_meinung(cert, rows)
    for r in m_rows:
        r.setdefault('讀音詞目', '')
    n_cert_rows = len(m_rows)
    g_rows, g_web = build_meinung_gip(gip, meinung_table(cert))
    m_rows += g_rows
    write_rows(os.path.join(OUT_DIR, '美濃'), m_rows, {**meta, 'base': '南四縣（認證原標＋南四縣附表）'})
    # 美濃全部係系統規則，網站版淨存讀音
    m_web = {f"{r['來源檔'].lstrip('0123456789')}|{r['編號']}": r['讀音']
             for r in m_rows[:n_cert_rows] if not r['同南四縣']}
    m_web.update(g_web)
    with open(os.path.join(OUT_DIR, '美濃.web.json'), 'w', encoding='utf-8') as f:
        json.dump(m_web, f, ensure_ascii=False, separators=(',', ':'))
    m_diff = sum(1 for r in m_rows if not r['同南四縣'])
    print(f'--- 次方言補音（美濃）---\n  附表 {len(m_rows)} 條（認證 {n_cert_rows}、教典 {len(g_rows)}；'
          f'摎南四縣無共樣 {m_diff} 條；用著字級對照 {sum(r["用著字級對照"] for r in m_rows)} 條）；'
          f'認證南四縣推毋出致使跳過 {m_skipped} 條；網站精簡版 {len(m_web)} 鍵（教典 {len(g_web)}）')

    c = Counter(r['推導層'] for r in rows)
    diff = sum(1 for r in rows if not r['同北四縣'])
    print(f'--- 次方言補音（南四縣）---\n  附表 {len(rows)} 條（摎北四縣無共樣 {diff} 條）；推導層：{dict(c)}；'
          f'待確認 {sum(r["待確認"] for r in rows)}；推毋出（待審）{len(pending)} 條')


if __name__ == '__main__':
    main()
