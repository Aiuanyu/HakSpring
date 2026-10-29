"""scripts/build_subdialect_fill.py 个純函式測試：斜線音節个字位置、write_rows 輸出个 JSON／CSV 有效。"""
import csv
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import build_subdialect_fill as b  # noqa: E402

# 1. syllable_slots：斜線連等个音節（同詞多音）共一隻字位置
matches, slots, n = b.syllable_slots('hím/hiún sòng')
assert [m.group() for m in matches] == ['hím', 'hiún', 'sòng'], [m.group() for m in matches]
assert slots == [0, 0, 1] and n == 2, (slots, n)
matches, slots, n = b.syllable_slots('bòd zìi')
assert slots == [0, 1] and n == 2
matches, slots, n = b.syllable_slots('')
assert slots == [] and n == 0
# 空白隔開（毋係斜線）算兩隻字位置
_, slots, n = b.syllable_slots('hím hiún')
assert slots == [0, 1] and n == 2

# 2. tone_24_to_33：24（á）→ 33（ā）；其他調毋動
assert b.tone_24_to_33('láng sùi') == 'lāng sùi'
assert b.tone_24_to_33('sān sǎ') == 'sān sǎ'

# 3. write_rows：extra 空／毋空，產出个 JSON 都愛讀得返來、CSV 摎 entries 筆數共樣
rows = [{'詞目': '冷水', '讀音': 'nāng sùi', '變體': ['美濃'], '待確認': False},
        {'詞目': '孵卵', '讀音': 'pu nòn', '變體': ['美濃'], '待確認': False}]
with tempfile.TemporaryDirectory() as d:
    for extra in (None, {}, {'name': '次方言補音', 'from': '認證四縣'}):
        base = os.path.join(d, 'x')
        b.write_rows(base, rows, extra)
        data = json.load(open(base + '.json', encoding='utf-8'))
        assert data['entries'] == rows, extra
        for k, v in (extra or {}).items():
            assert data[k] == v
        with open(base + '.csv', encoding='utf-8-sig', newline='') as f:
            got = list(csv.DictReader(f))
        assert len(got) == len(rows) and got[0]['變體'] == '美濃'

# 3b. meinung_table：淨用「美濃詞目 == 詞目」个認證詞條；同義異形詞（詞目無共樣）毋入表
def _e(word, north, meinung, meinung_word=None):
    return {'word': word, 'north': north, 'south': None, 'south_word': None,
            'meinung': meinung, 'meinung_word': meinung_word or word}
cert = {
    ('a', '1'): _e('冷水', 'láng sùi', 'nāng sùi'),
    ('a', '2'): _e('佢兜人', 'gǐ déu ngǐn', 'ǐ nén', meinung_word='佢等'),   # 美濃音屬「佢等」：毋入表
}
table = b.meinung_table(cert)
assert table[('冷', 'láng')] == {'nāng': 1}
assert ('兜', 'déu') not in table

# 3c. 實資料迴歸：認證四縣有美濃標記、詞目共樣个詞條，美濃音摎底音逐音節都愛有聲母抑韻母共樣。
#     （無共樣，多半係 variant-parser 又將同義異形詞抑「美濃音屬南四縣詞」誤掛到北四縣詞，例：好額 → 額 bòd）
import re  # noqa: E402
import unicodedata  # noqa: E402
def _plain(syl):
    return ''.join(c for c in unicodedata.normalize('NFD', syl.lower()) if unicodedata.category(c) != 'Mn')
def _far(x, y):
    ix, fx = re.match(r'^([^aeiou]*)(.*)$', _plain(x)).groups()
    iy, fy = re.match(r'^([^aeiou]*)(.*)$', _plain(y)).groups()
    return ix != iy and fx != fy
real_cert, _ = b.load_entries()
checked = 0
for k, e in real_cert.items():
    if not e['meinung'] or e['meinung_word'] != e['word']:
        continue
    base = e['south'] if e['south'] and e['south_word'] == e['word'] else e['north']
    a, m = b.aligned(e['word'], base or ''), b.aligned(e['word'], e['meinung'])
    if a and m:
        checked += 1
        for x, y in zip(a[1], m[1]):
            assert not _far(x, y), (k, e['word'], base, e['meinung'])
assert checked > 20, checked

# 3d. 實產出迴歸（同義異形詞、美濃音屬南四縣詞，毋可逐字污染單字音）
def _supp(d):
    with open(os.path.join(ROOT, 'data', 'supp', f'補字典-{d}.csv'), encoding='utf-8-sig', newline='') as f:
        return {(r['客家語'], r['客語標音_顯示']) for r in csv.DictReader(f)}
south = _supp('南')
for bad in [('額', 'bòd'), ('關', 'có'), ('囹', 'lug'), ('欖', 'è'), ('兜', 'nén'), ('壽', 'xiǔ')]:
    assert bad not in south, bad
for good in [('等', 'nén'), ('欖', 'nàm'), ('嬭', 'mí')]:
    assert good in south, good
with open(os.path.join(ROOT, 'data', 'sub-dialects-fill', '美濃.csv'), encoding='utf-8-sig', newline='') as f:
    meinung_rows = list(csv.DictReader(f))
by_word = {r['詞目']: r['讀音'] for r in meinung_rows if r['來源檔'] == '教典南'}
assert by_word['寄雨'] == 'gi ì', by_word['寄雨']             # 毋係 giu ì（救雨个美濃音）
assert by_word['寄'] == 'gi', by_word['寄']
by_cert = {(r['來源檔'], r['編號']): r['讀音'] for r in meinung_rows if r['來源檔'].startswith('113')}
# 南四縣詞括號內係同義詞（A 類）：詞形摎北四縣無共樣，美濃毋推（平哥 20261029）
for synonym_entry in [('113四中', '13-34'), ('113四中', '17-60'), ('113四中高', '4-83'), ('113四初', '6-11'),
                      ('113四基', '6-12'), ('113四基', '18-40'), ('113四中高', '10-6'), ('113四中高', '11-22'),
                      ('113四中高', '8-116')]:
    assert synonym_entry not in by_cert, synonym_entry
assert by_cert[('113四中', '1-50')] == 'ngiàg těu'             # 額頭，毋係 bòd těu
assert by_cert[('113四中', '2-37')] == 'guān xīm'              # 關心，毋係 cō xīm

# 3e. 教典「俗音」「又俗音」係詞級讀音，毋拆做單字音（例：夭壽 俗音 iáu xiǔ → 毋生單字「壽 xiǔ」；今年 俗音 gin24 → 毋生單字「今 gín」）
assert ('壽', 'xiǔ') not in _supp('南')
assert ('今', 'gín') not in _supp('四')
assert ('公', 'gung') not in _supp('四')

# 4. 輸出个附表檔：全部愛讀得返來（防 write_rows 手工拼 JSON 壞去）
fill = os.path.join(ROOT, 'data', 'sub-dialects-fill')
for name in ('南四縣.json', '美濃.json', '待審-南四縣.json'):
    data = json.load(open(os.path.join(fill, name), encoding='utf-8'))
    assert isinstance(data['entries'], list) and data['entries'], name
web = json.load(open(os.path.join(fill, '美濃.web.json'), encoding='utf-8'))
assert 300 < len(web) < 400, len(web)   # 淨收詞彙性差異（336）
print('✨ build_subdialect_fill 純函式、輸出檔 全部 PASS')
