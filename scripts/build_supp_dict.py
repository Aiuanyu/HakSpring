# -*- coding: utf-8 -*-
"""
客源翠補字典：從認證、教典个詞條逐字對齊，補教典無獨立建字个單字音。

做法：
1. 呼叫 scripts/supp_expand_variants.js，用 js/variant-parser.js 展開【】變體。
2. 拆「又讀／文／白／特」等異讀（合音、小稱變調等變調後个讀法丟忒），展開「屁（屁卵）」這種括號同義詞。
3. 字數摎音節數共樣个詞，逐字配對（例：藍衫 ↔ lǎm sám → 藍 = lǎm）。
4. 每腔：該腔認證、教典全部無單字條目个字，收佢在詞裡肚出現過个全部讀音（分類「補字典」）。
5. 多音字補音：有單字條目个字，詞裡肚另外有單字條目無收个讀音（含淨差調），
   在詞裡出現 POLY_MIN_COUNT 擺以上正收（分類「多音字補音」）。
6. 擬音：data/supp/擬音-{腔}.csv（scripts/build_jf_nisim.py 產生）个字，該腔還係無音个，
   收第一候選（分類「擬音」）。這下淨四縣有。
7. 沿襲：data/supp/人工沿襲.csv 人工指定「妳 沿襲 你」這種，該腔無單字條目个字，
   全部讀音照抄來源字（分類「沿襲」，六腔都做）。優先過補字典、擬音。

輸出：data/supp/補字典-{腔}.csv 摎 .json（JSON 格式同 cert／gip 共樣，content 係統一 schema 个 CSV）。
由 process_all_data.py 最尾呼叫；也做得單獨跑：python3 scripts/build_supp_dict.py
"""
import csv
import io
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from process_all_data import (  # noqa: E402
    UNIFIED_SCHEMA_HEADERS, convert_diacritic_to_numeric, expand_reverse_map,
    comprehensive_clean_spacing, convert_phonetic_string,
)

DIALECTS = ['四', '海', '大', '平', '安', '南']
DIALECT_NAMES = {'四': '四縣', '海': '海陸', '大': '大埔', '平': '饒平', '安': '詔安', '南': '南四縣'}
# 調符 → 數字調：南四縣用四縣个規則
REVERSE_KEY = {'四': 'si', '海': 'ha', '大': 'da', '平': 'rh', '安': 'zh', '南': 'si'}
CERT_DIALECT = {'四縣': '四', '海陸': '海', '大埔': '大', '饒平': '平', '詔安': '安'}
LABEL_NAMES = {'北': '北四縣', '南': '南四縣', '美': '美濃', '竹': '新竹', '卓': '卓蘭', '桃': '桃園'}
# 各腔補字典个「主」變體：腔內來源淨有這隻時，備註毋使標
MAIN_LABEL = {'四': '北', '南': '南', '平': '竹'}

DEFINITION = '（教典未獨立建字，愛灣語客源翠程式自動補音，無釋義）'
POLY_DEFINITION = '（教典未獨立建此音，愛灣語客源翠程式自動補音，無釋義）'
NISIM_DEFINITION = '（教典無收這隻字，愛灣語客源翠擬音、歡迎審查。目前無釋義）'
INHERIT_DEFINITION = '（教典無收這隻字，音同「{}」，愛灣語客源翠補音。目前無釋義）'
POLY_MIN_COUNT = 3
MAX_EXAMPLES = 5

HAN = re.compile(r'[㐀-䶿一-鿿豈-﫿\U00020000-\U0003ffff]')
# 音節：拉丁字母（含調符、組合附加符號）
SYLLABLE = re.compile(r"[a-zA-ZÀ-ɏḀ-ỿ̀-ͯ']+")
# 教典讀音欄个註記（對照 main.js PHONETIC_NOTE_NAMES 摎 data/gip 實際出現个寫法）
# 另一隻正式讀音：拆開、全部收
READING_NOTES = ['又俗音', '又讀', '又音', '俗音', '特殊音', '特', '又', '文', '白']
# 合音、變調後个讀法，毋係字本身个讀音：拆開、丟忒
DROP_NOTES = ['小稱變調讀本調為', '小稱變調讀', '為後字變調', '後字變調讀', '後字變調',
              '本調為', '合音讀', '合音']
_NOTES = sorted(READING_NOTES + DROP_NOTES, key=len, reverse=True)
NOTE_SPLIT = re.compile('(' + '|'.join(_NOTES) + r')\s*\d*\s*\.?')
# 舊名，保留分 split 用（無分種類）
READING_SPLIT = re.compile('(?:' + '|'.join(_NOTES) + r')\s*\d*\s*\.?')


def split_readings(phonetic):
    """讀音欄拆做幾隻正式讀音；合音、變調後个讀法丟忒。"""
    parts = NOTE_SPLIT.split(phonetic)
    readings = [parts[0]]
    for note, seg in zip(parts[1::2], parts[2::2]):
        if note not in DROP_NOTES:
            readings.append(seg)
    return [r.strip() for r in readings if r.strip()]


def target_dialect(source_name, label):
    """這筆讀音屬哪隻腔个補字典。"""
    if source_name.startswith('教典'):
        return source_name[2:]
    for name, d in CERT_DIALECT.items():
        if source_name.startswith(name):
            if d == '四' and label in ('南', '美'):
                return '南'
            return d
    return None


SYLL_PAREN = re.compile(r'(?<=\S)[（(]([^）)\s]+)[）)]')


def expand_parens(word, phonetic):
    """屁（屁卵）／pi (pi lòn) → [(屁, pi), (屁卵, pi lòn)]；同 Kipan extract_and_build.js 个 expandParens。
    音節後背直接黏等个括號（饒平 má(ma)、vín(rhiún)）係同一隻音節个另一讀，拆做兩筆。"""
    if not re.search(r'[（(]', word) and SYLL_PAREN.search(phonetic):
        outer = SYLL_PAREN.sub('', phonetic)
        inner = re.sub(r"[^\s（(]+[（(]([^）)\s]+)[）)]", r'\1', phonetic)
        return [(word, outer), (word, inner)]
    pat = r'^(.*?)[（(](.*?)[）)](.*?)$'
    mw, mp = re.match(pat, word), re.match(pat, phonetic)
    if mw and mp:
        return [((mw[1] + mw[3]).strip(), (mp[1] + mp[3]).strip()), (mw[2].strip(), mp[2].strip())]
    if mw:
        return [((mw[1] + mw[3]).strip(), phonetic), (mw[2].strip(), phonetic)]
    return [(re.sub(r'[（()）]', '', word).strip(), re.sub(r'[（()）]', '', phonetic).strip())]


def align(word, phonetic):
    """字數摎音節數共樣就逐字配對；毋共樣回傳 None。"""
    chars = HAN.findall(word)
    # 詞裡肚有非漢字、非標點个東西（例：羅馬字、數字）就毋對齊
    if re.search(r'[A-Za-z0-9]', word):
        return None
    sylls = SYLLABLE.findall(phonetic.replace('-', ' '))
    if not chars or len(chars) != len(sylls):
        return None
    # 無母音个音節係資料錯誤（例：大埔「家」標 g），毋過成音節鼻音（m、ng、詔安 hm、gng，大埔 hn）係合法个
    for syl in sylls:
        base = re.sub(r'[\u0300-\u036f]', '', unicodedata.normalize('NFD', syl)).lower()
        if not re.search(r'[aeiou]', base) and not re.fullmatch(r'[bpfvdtlgkhzcsjqxr]*(m|n|ng)', base):
            return None
    return list(zip(chars, sylls))


def load_gip_numeric():
    """教典原始个數字調：(腔, 字, 調符音節) → 數字調音節。查詢欄優先用這个，毋使自家反推。"""
    result = {}
    for d in DIALECTS:
        gip_dir = os.path.join(ROOT, 'data', 'gip')
        for fn in os.listdir(gip_dir):
            if not fn.endswith(f'-{d}.json'):
                continue
            with open(os.path.join(gip_dir, fn), encoding='utf-8') as f:
                rows = csv.DictReader(io.StringIO(json.load(f)['content']))
            for r in rows:
                if '又' in r['客語標音_顯示']:
                    continue
                chars = HAN.findall(r['客家語'])
                disp, num = r['客語標音_顯示'].split(), r['客語標音_查詢'].split()
                if len(chars) == len(disp) == len(num):
                    for c, a, b in zip(chars, disp, num):
                        result.setdefault((d, c, a), b)
    return result


def load_gip_readings(d):
    """教典原始 CSV 个音讀 → 詞目 → [讀音…]（調符、音節一隻空白隔開）。

    愛讀原始 CSV：處理過个「客語標音_顯示」會共全形空白壓做半形，讀音中間个邊界就無忒。
    音讀欄：全形空白隔開幾隻讀音（有時無註記，第二隻係變調形式，例：kong31 ngiu<u>24</u>），
    再拆「又讀／特…」註記，丟忒「合音」「（後字變調）」等。
    """
    with open(os.path.join(ROOT, 'tone_mapping.json'), encoding='utf-8') as f:
        tm = json.load(f)
    tone_map = {'vowel_priority': tm.get('vowel_priority', []),
                'tones': {**tm.get('default_tones', {}), **tm.get('dialect_maps', {}).get(d, {})}}
    gip_dir = os.path.join(ROOT, 'data', 'gip')
    fname = next(f for f in os.listdir(gip_dir) if f.endswith(f'-{d}.csv'))
    out = defaultdict(list)
    with open(os.path.join(gip_dir, fname), encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            raw = re.sub(r'</?u>', '', row['音讀'])
            raw = re.sub(r'（[^）]*）', '', raw)
            for seg in raw.split('\u3000'):
                for reading in split_readings(seg):
                    sylls = SYLLABLE.findall(convert_phonetic_string(reading, tone_map))
                    r = ' '.join(unicodedata.normalize('NFC', x) for x in sylls)
                    if r and r not in out[row['詞目']]:
                        out[row['詞目']].append(r)
    return out


def load_records():
    """認證：經 variant-parser 展開【】變體；教典：無【】，直接讀原始 CSV（保留讀音邊界）。"""
    for o in load_variants():
        if not o['sourceName'].startswith('教典'):
            yield o
    for d in DIALECTS:
        for word, readings in load_gip_readings(d).items():
            for r in readings:
                yield {'sourceName': f'教典{d}', 'label': '', 'word': word, 'phonetic': r}


def load_variants():
    js = os.path.join(ROOT, 'scripts', 'supp_expand_variants.js')
    res = subprocess.run(['node', js], capture_output=True, text=True, check=True)
    for line in res.stdout.splitlines():
        if line.strip():
            yield json.loads(line)


def load_inherit():
    """data/supp/人工沿襲.csv → 字 → (來源字, 備註)。"""
    path = os.path.join(ROOT, 'data', 'supp', '人工沿襲.csv')
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8-sig') as f:
        return {r['字']: (r['沿襲'], r.get('備註', '')) for r in csv.DictReader(f) if r['字'] and r['沿襲']}


def load_nisim(d):
    """data/supp/擬音-{腔}.csv → [{字, 讀音, 其他候選, 依據…}]；無檔案就係空个。"""
    path = os.path.join(ROOT, 'data', 'supp', f'擬音-{d}.csv')
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8-sig') as f:
        return [r for r in csv.DictReader(f) if r['讀音']]


def main():
    with open(os.path.join(ROOT, 'reverse_tone_mapping.json'), encoding='utf-8') as f:
        reverse = json.load(f)
    vowel_map = reverse['vowel_map']
    reverse_map = expand_reverse_map(reverse['dialect_reverse_map'], vowel_map)
    with open(os.path.join(ROOT, 'tone_mapping.json'), encoding='utf-8') as f:
        vowel_priority = json.load(f).get('vowel_priority', [])

    gip_numeric = load_gip_numeric()
    singles = defaultdict(set)  # 腔 → 有單字條目个字
    single_readings = defaultdict(lambda: defaultdict(set))  # 腔 → 字 → 單字條目个讀音
    # 腔 → 字 → 讀音 → {'count', 'examples': [(詞, 標音, 來源)], 'labels': set}
    readings = defaultdict(lambda: defaultdict(lambda: defaultdict(
        lambda: {'count': 0, 'examples': [], 'labels': set()})))
    stats = defaultdict(lambda: {'pairs': 0, 'aligned': 0})

    for o in load_records():
        d = target_dialect(o['sourceName'], o['label'])
        if not d:
            continue
        for ph in split_readings(o['phonetic']):
            for word, phon in expand_parens(o['word'], ph):
                if not word or not phon:
                    continue
                stats[d]['pairs'] += 1
                if len(HAN.findall(word)) == 1 and len(word.strip()) == 1:
                    singles[d].add(word.strip())
                    for syl in SYLLABLE.findall(phon):
                        single_readings[d][word.strip()].add(unicodedata.normalize('NFC', syl))
                pairs = align(word, phon)
                if not pairs:
                    continue
                stats[d]['aligned'] += 1
                for ch, syl in pairs:
                    rec = readings[d][ch][unicodedata.normalize('NFC', syl)]
                    rec['count'] += 1
                    for lab in (['卓', '桃'] if o['label'] == '卓桃' else [o['label']]):
                        rec['labels'].add(lab or MAIN_LABEL.get(d, ''))
                    if len(rec['examples']) < MAX_EXAMPLES and (word, phon) not in [(w, p) for w, p, _ in rec['examples']]:
                        rec['examples'].append((word, phon, o['sourceName']))

    out_dir = os.path.join(ROOT, 'data', 'supp')
    os.makedirs(out_dir, exist_ok=True)
    print('--- 補字典（詞裡有、單字無）＋多音字補音 ---')
    for d in DIALECTS:
        dmap = reverse_map[REVERSE_KEY[d]]
        rows = []
        # 補字典：無單字條目个字，收全部讀音
        # 沿襲：來源字个單字條目讀音，無就用來源字在詞裡肚个讀音
        inherit = []
        for ch, (src, memo) in load_inherit().items():
            if ch in singles[d]:
                continue
            syls = sorted(single_readings[d][src]) if src in singles[d] else \
                [syl for syl, _ in sorted(readings[d][src].items(), key=lambda x: -x[1]['count'])]
            if syls:
                inherit.append((ch, src, memo, syls))
        inherited = {ch for ch, _, _, _ in inherit}
        chars = [(ch, rs) for ch, rs in readings[d].items() if ch not in singles[d] and ch not in inherited]
        # 多音字補音：有單字條目，淨收單字條目無个讀音，而且出現夠多擺
        poly = []
        for ch, rs in readings[d].items():
            if ch not in singles[d]:
                continue
            extra = {syl: rec for syl, rec in rs.items()
                     if syl not in single_readings[d][ch] and rec['count'] >= POLY_MIN_COUNT}
            if extra:
                poly.append((ch, extra))
        # 排序：出現總次數多个先，再照字
        chars.sort(key=lambda x: (-sum(r['count'] for r in x[1].values()), x[0]))
        poly.sort(key=lambda x: (-sum(r['count'] for r in x[1].values()), x[0]))
        groups = [(ch, rs, '補字典', DEFINITION, '') for ch, rs in chars]
        groups += [(ch, rs, '多音字補音', POLY_DEFINITION,
                    '單字條目已有 ' + '、'.join(sorted(single_readings[d][ch])) + '；')
                   for ch, rs in poly]
        nisim = [r for r in load_nisim(d) if r['字'] not in singles[d] and r['字'] not in readings[d]
                 and r['字'] not in inherited]
        for ch, rs, category, definition, prefix in groups:
            for syl, rec in sorted(rs.items(), key=lambda x: -x[1]['count']):
                examples = '、'.join(f'{w}（{p}，{s}）' for w, p, s in rec['examples'])
                note = f'{prefix}出現 {rec["count"]} 擺；出處：{examples}'
                labels = [l for l in LABEL_NAMES if l in rec['labels']]
                if labels and labels != [MAIN_LABEL.get(d)]:
                    note = '腔內：' + '、'.join(LABEL_NAMES[l] for l in labels) + '；' + note
                item = {h: '' for h in UNIFIED_SCHEMA_HEADERS}
                item.update({
                    '編號': f'supp-{len(rows) + 1}',
                    '客家語': ch,
                    '客語標音_顯示': syl,
                    '客語標音_查詢': gip_numeric.get((d, ch, syl)) or comprehensive_clean_spacing(
                        convert_diacritic_to_numeric(syl, dmap, vowel_map, vowel_priority)),
                    '華語詞義': definition,
                    '備註': note,
                    '分類': category,
                    'sourceName': f'補字典{d}',
                    'sourceType': 'supp',
                })
                rows.append(item)
        for ch, src, memo, syls in inherit:
            for syl in syls:
                item = {h: '' for h in UNIFIED_SCHEMA_HEADERS}
                item.update({
                    '編號': f'supp-{len(rows) + 1}',
                    '客家語': ch,
                    '客語標音_顯示': syl,
                    '客語標音_查詢': gip_numeric.get((d, src, syl)) or comprehensive_clean_spacing(
                        convert_diacritic_to_numeric(syl, dmap, vowel_map, vowel_priority)),
                    '華語詞義': INHERIT_DEFINITION.format(src),
                    '備註': f'沿襲「{src}」（人工指定）' + (f'；{memo}' if memo else ''),
                    '分類': '沿襲',
                    'sourceName': f'補字典{d}',
                    'sourceType': 'supp',
                })
                rows.append(item)
        for r in nisim:
            note = '擬音'
            if r['其他候選']:
                note += '；其他候選：' + r['其他候選']
            if r['依據']:
                note += '；依據：' + r['依據']
            item = {h: '' for h in UNIFIED_SCHEMA_HEADERS}
            item.update({
                '編號': f'supp-{len(rows) + 1}',
                '客家語': r['字'],
                '客語標音_顯示': r['讀音'],
                '客語標音_查詢': r['數字調'],
                '華語詞義': NISIM_DEFINITION,
                '備註': note,
                '分類': '擬音',
                'sourceName': f'補字典{d}',
                'sourceType': 'supp',
            })
            rows.append(item)

        buf = io.StringIO(newline='')
        writer = csv.DictWriter(buf, fieldnames=UNIFIED_SCHEMA_HEADERS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
        base = os.path.join(out_dir, f'補字典-{d}')
        with open(base + '.csv', 'w', encoding='utf-8-sig', newline='') as f:
            f.write(buf.getvalue())
        with open(base + '.json', 'w', encoding='utf-8') as f:
            json.dump({'name': f'補字典{d}', 'content': buf.getvalue()}, f, ensure_ascii=False, indent=2)
        s = stats[d]
        poly_count = sum(len(rs) for _, rs in poly)
        inherit_count = sum(len(syls) for _, _, _, syls in inherit)
        print(f'  {DIALECT_NAMES[d]}：補字典 {len(chars)} 字、{len(rows) - poly_count - inherit_count - len(nisim)} 音；'
              f'多音字補音 {len(poly)} 字、{poly_count} 音；沿襲 {len(inherit)} 字、{inherit_count} 音；擬音 {len(nisim)} 字'
              f'（單字條目 {len(singles[d])} 字；詞 {s["pairs"]} 筆，對齊 {s["aligned"]} 筆）')


if __name__ == '__main__':
    main()
