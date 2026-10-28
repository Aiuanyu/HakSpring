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

# 3b. syllables_far：聲母摎韻母攏無共樣正算講法無共樣；淨聲母抑淨韻母無共樣毋算（冷 láng→nāng）
assert b.syllables_far('ngiàg', 'bòd')
assert b.syllables_far('guán', 'có')
assert not b.syllables_far('láng', 'nāng')      # 韻母共樣
assert not b.syllables_far('hò', 'hó')          # 淨調無共樣
assert not b.syllables_far('mé', 'mí')

# 3c. meinung_table：詞中有「講法無共樣」个音節，成條毋入表；音節數無共樣（對毋齊）也毋入表
def _e(word, north, meinung):
    return {'word': word, 'north': north, 'south': None, 'south_word': None,
            'meinung': meinung, 'meinung_word': word}
cert = {
    ('a', '1'): _e('冷水', 'láng sùi', 'nāng sùi'),    # 正常音變：入表
    ('a', '2'): _e('好額', 'hò ngiàg', 'iú bòd'),       # 講法無共樣：成條毋入表
    ('a', '3'): _e('額頭', 'ngiàg těu', 'ngiàg těu'),   # 對照表毋該有（額 ngiàg）→ bòd
    ('a', '4'): _e('撿採', 'giàm cài', 'zùn'),         # 字數摎音節數對毋齊：毋入表
}
table = b.meinung_table(cert)
assert table[('冷', 'láng')] == {'nāng': 1}
assert ('好', 'hò') not in table
assert table[('額', 'ngiàg')] == {'ngiàg': 1}, table[('額', 'ngiàg')]
assert ('撿', 'giàm') not in table

# 3d. 補字典：lexically_different 淨判斷「同詞目、讀音講法無共樣」（好額 hò ngiàg ↔ iú bòd）；
#     字數摎音節數對毋齊毋判（交畀 align／meinung_table 處理）
import build_supp_dict as sd  # noqa: E402
assert sd.lexically_different('好額', 'hò ngiàg', 'iú bòd')
assert not sd.lexically_different('好額', 'hò ngiàg', 'hó ngiàg')   # 淨調無共樣
assert not sd.lexically_different('冷水', 'láng sùi', 'nāng sùi')   # 音變
assert not sd.lexically_different('好額', 'hò ngiàg', 'iú')          # 音節數對毋齊

# 4. 輸出个附表檔：全部愛讀得返來（防 write_rows 手工拼 JSON 壞去）
fill = os.path.join(ROOT, 'data', 'sub-dialects-fill')
for name in ('南四縣.json', '美濃.json', '待審-南四縣.json'):
    data = json.load(open(os.path.join(fill, name), encoding='utf-8'))
    assert isinstance(data['entries'], list) and data['entries'], name
web = json.load(open(os.path.join(fill, '美濃.web.json'), encoding='utf-8'))
assert 300 < len(web) < 400, len(web)   # 淨收詞彙性差異（336）
print('✨ build_subdialect_fill 純函式、輸出檔 全部 PASS')
