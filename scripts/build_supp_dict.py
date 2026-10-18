# -*- coding: utf-8 -*-
"""
客源翠補字典（第一層）：從認證、教典个詞條逐字對齊，補教典無獨立建字个單字音。

做法：
1. 呼叫 scripts/supp_expand_variants.js，用 js/variant-parser.js 展開【】變體。
2. 拆「又讀／文／白」等異讀，展開「屁（屁卵）」這種括號同義詞。
3. 字數摎音節數共樣个詞，逐字配對（例：藍衫 ↔ lǎm sám → 藍 = lǎm）。
4. 每腔：該腔認證、教典全部無單字條目个字，收佢在詞裡肚出現過个全部讀音。

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
    comprehensive_clean_spacing,
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
MAX_EXAMPLES = 5

HAN = re.compile(r'[㐀-䶿一-鿿豈-﫿\U00020000-\U0003ffff]')
# 音節：拉丁字母（含調符、組合附加符號）
SYLLABLE = re.compile(r"[a-zA-ZÀ-ɏḀ-ỿ̀-ͯ']+")
READING_SPLIT = re.compile(r'(?:又讀|又俗音|俗音|又音|又|文|白)\s*\d*\s*\.?')


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


def load_variants():
    js = os.path.join(ROOT, 'scripts', 'supp_expand_variants.js')
    res = subprocess.run(['node', js], capture_output=True, text=True, check=True)
    for line in res.stdout.splitlines():
        if line.strip():
            yield json.loads(line)


def main():
    with open(os.path.join(ROOT, 'reverse_tone_mapping.json'), encoding='utf-8') as f:
        reverse = json.load(f)
    vowel_map = reverse['vowel_map']
    reverse_map = expand_reverse_map(reverse['dialect_reverse_map'], vowel_map)
    with open(os.path.join(ROOT, 'tone_mapping.json'), encoding='utf-8') as f:
        vowel_priority = json.load(f).get('vowel_priority', [])

    gip_numeric = load_gip_numeric()
    singles = defaultdict(set)  # 腔 → 有單字條目个字
    # 腔 → 字 → 讀音 → {'count', 'examples': [(詞, 標音, 來源)], 'labels': set}
    readings = defaultdict(lambda: defaultdict(lambda: defaultdict(
        lambda: {'count': 0, 'examples': [], 'labels': set()})))
    stats = defaultdict(lambda: {'pairs': 0, 'aligned': 0})

    for o in load_variants():
        d = target_dialect(o['sourceName'], o['label'])
        if not d:
            continue
        for ph in [p.strip() for p in READING_SPLIT.split(o['phonetic']) if p.strip()]:
            for word, phon in expand_parens(o['word'], ph):
                if not word or not phon:
                    continue
                stats[d]['pairs'] += 1
                if len(HAN.findall(word)) == 1 and len(word.strip()) == 1:
                    singles[d].add(word.strip())
                pairs = align(word, phon)
                if not pairs:
                    continue
                stats[d]['aligned'] += 1
                for ch, syl in pairs:
                    rec = readings[d][ch][syl]
                    rec['count'] += 1
                    for lab in (['卓', '桃'] if o['label'] == '卓桃' else [o['label']]):
                        rec['labels'].add(lab or MAIN_LABEL.get(d, ''))
                    if len(rec['examples']) < MAX_EXAMPLES and (word, phon) not in [(w, p) for w, p, _ in rec['examples']]:
                        rec['examples'].append((word, phon, o['sourceName']))

    out_dir = os.path.join(ROOT, 'data', 'supp')
    os.makedirs(out_dir, exist_ok=True)
    print('--- 補字典（第一層：詞裡有、單字無）---')
    for d in DIALECTS:
        dmap = reverse_map[REVERSE_KEY[d]]
        rows = []
        chars = [(ch, rs) for ch, rs in readings[d].items() if ch not in singles[d]]
        # 排序：出現總次數多个先，再照字
        chars.sort(key=lambda x: (-sum(r['count'] for r in x[1].values()), x[0]))
        for ch, rs in chars:
            for syl, rec in sorted(rs.items(), key=lambda x: -x[1]['count']):
                examples = '、'.join(f'{w}（{p}，{s}）' for w, p, s in rec['examples'])
                note = f'出現 {rec["count"]} 擺；出處：{examples}'
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
                    '華語詞義': DEFINITION,
                    '備註': note,
                    '分類': '補字典',
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
        print(f'  {DIALECT_NAMES[d]}：{len(chars)} 字、{len(rows)} 音'
              f'（單字條目 {len(singles[d])} 字；詞 {s["pairs"]} 筆，對齊 {s["aligned"]} 筆）')


if __name__ == '__main__':
    main()
