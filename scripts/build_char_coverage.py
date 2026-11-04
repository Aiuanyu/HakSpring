# -*- coding: utf-8 -*-
"""
字表涵蓋度資料建置腳本：
統計客源翠對 jf7000、臺灣常用 T1+T2 及全部 Unihan 漢字字集的讀音涵蓋度。

輸入（只讀本專案檔案）：
- .cache/jf-nisim/jf7000-{base,ext_taiwan,ext_naming}.txt
- .cache/jf-nisim/Unihan.zip
- data/gip/20261020-{四,南,海,大,平,安}.json
- data/cert/115*.json
- data/supp/補字典-{四,南,海,大,平,安}.csv

輸出：
- data/coverage/chars-jf.json（jf7000 7,772 字）
- data/coverage/chars-t12.json（臺灣常用 T1+T2 且不在 jf7000 的 5,848 字）
- data/coverage/chars-used-outside-jf.json（詞目用到但不在 jf7000 的 175 字）
- data/coverage/summary.json（字集 × 六腔分層統計，加版本資訊）
"""
import csv
import glob
import io
import json
import os
import re
import sys
import unicodedata
import zipfile
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache', 'jf-nisim')
DATA_DIR = os.path.join(ROOT, 'data')
COVERAGE_DIR = os.path.join(DATA_DIR, 'coverage')

DIALECTS = ['四', '南', '海', '大', '平', '安']
DIALECT_NAMES = {'四': '四縣', '南': '南四縣', '海': '海陸', '大': '大埔', '平': '饒平', '安': '詔安'}
JF_PACKS = [('base', 'base'), ('ext_taiwan', 'taiwan'), ('ext_naming', 'naming')]
JF_COMMIT = 'af8f31a1'

HAN = re.compile(r'^[㐀-䶿一-鿿豈-﫿\U00020000-\U0003ffff]$')
HAN_ANY = re.compile(r'[㐀-䶿一-鿿豈-﫿\U00020000-\U0003ffff]')


def get_block(ch):
    """判斷字元所屬 Unicode CJK 區塊。"""
    cp = ord(ch)
    if 0x4E00 <= cp <= 0x9FFF:
        return '基本區'
    if 0x3400 <= cp <= 0x4DBF:
        return '擴充A'
    if 0x20000 <= cp <= 0x2A6DF:
        return '擴充B'
    if 0x2A700 <= cp <= 0x2B739:
        return '擴充C'
    if 0x2B740 <= cp <= 0x2B81D:
        return '擴充D'
    if 0x2B820 <= cp <= 0x2CEAD:
        return '擴充E'
    if 0x2CEB0 <= cp <= 0x2EBE0:
        return '擴充F'
    if 0x30000 <= cp <= 0x3134A:
        return '擴充G'
    if 0x31350 <= cp <= 0x323AF:
        return '擴充H'
    if 0x2EBF0 <= cp <= 0x2EE5D:
        return '擴充I'
    if (0xF900 <= cp <= 0xFAFF) or (0x2F800 <= cp <= 0x2FA1F):
        return '相容'
    return '其他'


def load_jf7000():
    """讀取 jf7000 字表。"""
    chars, pack_of = [], {}
    for pack_file, pack_id in JF_PACKS:
        path = os.path.join(CACHE, f'jf7000-{pack_file}.txt')
        with open(path, encoding='utf-8') as f:
            for line in f:
                m = re.fullmatch(r'uni([0-9A-F]{4,5})|u([0-9A-F]{5})', line.strip())
                if not m:
                    continue
                ch = chr(int(m.group(1) or m.group(2), 16))
                if HAN.match(ch) and ch not in pack_of:
                    pack_of[ch] = pack_id
                    chars.append(ch)
    return chars, pack_of


def load_unihan():
    """讀取 Unihan.zip 的 kRSUnicode 與 kIRG_TSource。"""
    path = os.path.join(CACHE, 'Unihan.zip')
    rads, t_sources = {}, {}
    with zipfile.ZipFile(path) as z:
        for line in z.open('Unihan_IRGSources.txt'):
            line = line.decode('utf-8')
            if line.startswith('#') or not line.strip():
                continue
            parts = line.strip().split('\t')
            if len(parts) >= 3:
                u, k, v = parts[0], parts[1], parts[2]
                ch = chr(int(u[2:], 16))
                if k == 'kRSUnicode' and ch not in rads:
                    rads[ch] = v.split()[0]
                elif k == 'kIRG_TSource':
                    t_sources[ch] = v
    return rads, t_sources


def clean_readings(reading_list):
    """整理讀音列表，保持原本次序且去除重複。"""
    seen = set()
    cleaned = []
    for r in reading_list:
        for item in r.strip().split():
            item_norm = unicodedata.normalize('NFC', item.strip())
            if item_norm and item_norm not in seen:
                seen.add(item_norm)
                cleaned.append(item_norm)
    return ' '.join(cleaned)


def load_all_sources():
    """讀取教典、認證、補字典資料。"""
    # 1. 教典單字與所有詞目出處
    gip_singles = {d: {} for d in DIALECTS}
    vocab_words_gip = defaultdict(set)
    for d in DIALECTS:
        path = os.path.join(DATA_DIR, 'gip', f'20261020-{d}.json')
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        reader = csv.DictReader(io.StringIO(data['content']))
        for row in reader:
            w = row['客家語'].strip()
            py = row['客語標音_顯示'].strip()
            # 詞目字出處
            for c in HAN_ANY.findall(w):
                vocab_words_gip[c].add(w)
            if HAN.match(w) and py:
                gip_singles[d].setdefault(w, []).append(py)

    for d in DIALECTS:
        for w in gip_singles[d]:
            gip_singles[d][w] = clean_readings(gip_singles[d][w])

    # 2. 認證單字與所有詞目出處
    cert_singles = {d: {} for d in DIALECTS}
    vocab_words_cert = defaultdict(set)
    for cf in glob.glob(os.path.join(DATA_DIR, 'cert', '115*.json')):
        fname = os.path.basename(cf)
        matched_d = None
        for d in ['四', '海', '大', '平', '安']:
            if fname.startswith(f'115{d}'):
                matched_d = d
                break
        with open(cf, encoding='utf-8') as f:
            data = json.load(f)
        reader = csv.DictReader(io.StringIO(data['content']))
        for row in reader:
            w = row.get('客家語', '').strip()
            py = row.get('客語標音_顯示', '').strip()
            for c in HAN_ANY.findall(w):
                vocab_words_cert[c].add(w)
            if matched_d and HAN.match(w) and py:
                cert_singles[matched_d].setdefault(w, []).append(py)

    for d in DIALECTS:
        for w in cert_singles[d]:
            cert_singles[d][w] = clean_readings(cert_singles[d][w])

    # 3. 補字典
    supp_entries = {d: {} for d in DIALECTS}
    for d in DIALECTS:
        path = os.path.join(DATA_DIR, 'supp', f'補字典-{d}.csv')
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                w = row['客家語'].strip()
                cat = row.get('分類', '').strip()
                py = row.get('客語標音_顯示', '').strip()
                if not w or not cat or not py:
                    continue
                # 分類優先級判定
                cat_code = None
                if cat in ('補字典', '多音字補音'):
                    cat_code = 'S'
                elif cat == '沿襲':
                    cat_code = 'Y'
                elif cat == '擬音':
                    cat_code = 'N'
                if cat_code:
                    supp_entries[d].setdefault(w, []).append((cat_code, py))

    # 整理各字的補字典優先來源
    supp_final = {d: {} for d in DIALECTS}
    for d in DIALECTS:
        for w, items in supp_entries[d].items():
            has_s = [py for code, py in items if code == 'S']
            has_y = [py for code, py in items if code == 'Y']
            has_n = [py for code, py in items if code == 'N']
            if has_s:
                supp_final[d][w] = ('S', clean_readings(has_s))
            elif has_y:
                supp_final[d][w] = ('Y', clean_readings(has_y))
            elif has_n:
                supp_final[d][w] = ('N', clean_readings(has_n))

    return gip_singles, cert_singles, supp_final, vocab_words_gip, vocab_words_cert


def resolve_char(ch, gip_singles, cert_singles, supp_final):
    """判定單字在六腔（四、南、海、大、平、安）的來源碼與讀音。"""
    src_codes = []
    readings = []
    for d in DIALECTS:
        if ch in gip_singles[d]:
            src_codes.append('G')
            readings.append(gip_singles[d][ch])
        elif ch in cert_singles[d]:
            src_codes.append('C')
            readings.append(cert_singles[d][ch])
        elif ch in supp_final[d]:
            code, py = supp_final[d][ch]
            src_codes.append(code)
            readings.append(py)
        else:
            src_codes.append('-')
            readings.append('')
    return ''.join(src_codes), readings


def main():
    print('1. 載入 jf7000 與 Unihan 資料...')
    jf_chars, jf_pack_of = load_jf7000()
    rads, t_sources = load_unihan()
    jf_char_set = set(jf_chars)

    print('2. 載入教典、認證、補字典資料...')
    gip_singles, cert_singles, supp_final, vocab_words_gip, vocab_words_cert = load_all_sources()

    os.makedirs(COVERAGE_DIR, exist_ok=True)

    print('3. 產生 chars-jf.json (7,772 字)...')
    chars_jf_list = []
    for ch in jf_chars:
        src, py = resolve_char(ch, gip_singles, cert_singles, supp_final)
        chars_jf_list.append({
            'c': ch,
            'pack': jf_pack_of[ch],
            'rad': rads.get(ch, ''),
            'blk': get_block(ch),
            'src': src,
            'py': py
        })

    jf_json_path = os.path.join(COVERAGE_DIR, 'chars-jf.json')
    with open(jf_json_path, 'w', encoding='utf-8') as f:
        json.dump(chars_jf_list, f, ensure_ascii=False, separators=(',', ':'))
    print(f'   已寫入 {jf_json_path} ({os.path.getsize(jf_json_path):,} bytes)')

    print('4. 產生 chars-t12.json (T1+T2 且不在 jf7000，5,848 字)...')
    t12_chars = []
    for ch, src_str in t_sources.items():
        if src_str.startswith('T1-') or src_str.startswith('T2-'):
            if ch not in jf_char_set:
                t12_chars.append(ch)
    # 按 Unicode 碼位穩定排序
    t12_chars.sort(key=ord)

    chars_t12_list = []
    for ch in t12_chars:
        src, py = resolve_char(ch, gip_singles, cert_singles, supp_final)
        chars_t12_list.append({
            'c': ch,
            'pack': '',
            'rad': rads.get(ch, ''),
            'blk': get_block(ch),
            'src': src,
            'py': py
        })

    t12_json_path = os.path.join(COVERAGE_DIR, 'chars-t12.json')
    with open(t12_json_path, 'w', encoding='utf-8') as f:
        json.dump(chars_t12_list, f, ensure_ascii=False, separators=(',', ':'))
    print(f'   已寫入 {t12_json_path} ({os.path.getsize(t12_json_path):,} bytes)')

    print('5. 產生 chars-used-outside-jf.json (詞目用到但不在 jf7000，175 字)...')
    all_vocab_chars = set(vocab_words_gip.keys()) | set(vocab_words_cert.keys())
    outside_jf_chars = sorted(all_vocab_chars - jf_char_set, key=ord)

    chars_outside_list = []
    for ch in outside_jf_chars:
        src, py = resolve_char(ch, gip_singles, cert_singles, supp_final)
        in_gip = ch in vocab_words_gip
        in_cert = ch in vocab_words_cert
        from_src = '教典＋認證' if (in_gip and in_cert) else ('教典' if in_gip else '認證')
        # 合併詞目，最多取 5 個
        words = sorted(list(vocab_words_gip.get(ch, set()) | vocab_words_cert.get(ch, set())))[:5]
        chars_outside_list.append({
            'c': ch,
            'rad': rads.get(ch, ''),
            'blk': get_block(ch),
            'src': src,
            'py': py,
            'from': from_src,
            'words': words
        })

    outside_json_path = os.path.join(COVERAGE_DIR, 'chars-used-outside-jf.json')
    with open(outside_json_path, 'w', encoding='utf-8') as f:
        json.dump(chars_outside_list, f, ensure_ascii=False, separators=(',', ':'))
    print(f'   已寫入 {outside_json_path} ({os.path.getsize(outside_json_path):,} bytes)')

    print('6. 統計分層數據並產生 summary.json...')
    def summarize_items(item_list):
        stats = {}
        for d_idx, d in enumerate(DIALECTS):
            g, c, s, y, n, none = 0, 0, 0, 0, 0, 0
            for it in item_list:
                code = it['src'][d_idx]
                if code == 'G':
                    g += 1
                elif code == 'C':
                    c += 1
                elif code == 'S':
                    s += 1
                elif code == 'Y':
                    y += 1
                elif code == 'N':
                    n += 1
                else:
                    none += 1
            stats[d] = {
                'G': g,
                'C': c,
                'S': s,
                'Y': y,
                'N': n,
                'none': none,
                'official': g + c,
                'carved': s + y,
                'with_carved': g + c + s + y,
                'nisim': n,
                'total_with_sound': g + c + s + y + n,
                'total': len(item_list)
            }
        return stats

    jf_stats = summarize_items(chars_jf_list)
    t12_outside_stats = summarize_items(chars_t12_list)

    # 完整 T1+T2 (13,064) = jf 裡的 T1+T2 + chars_t12_list
    t12_all_items = [it for it in chars_jf_list if t_sources.get(it['c'], '').startswith(('T1-', 'T2-'))] + chars_t12_list
    t12_all_stats = summarize_items(t12_all_items)

    pack_counts = defaultdict(int)
    for it in chars_jf_list:
        pack_counts[it['pack']] += 1

    summary = {
        'versions': {
            'cert': '115',
            'gip': '20261020',
            'supp_date': '2026-11-04',
            'unihan': '18.0',
            'jf7000': JF_COMMIT
        },
        'scopes': {
            'jf7000': {
                'total': len(chars_jf_list),
                'packs': dict(pack_counts),
                'dialects': jf_stats
            },
            't12': {
                'total': len(t12_all_items),
                'dialects': t12_all_stats
            },
            'outside_jf_t12': {
                'total': len(chars_t12_list),
                'dialects': t12_outside_stats
            },
            'all': {
                'total': 102527
            }
        },
        'outside_jf_vocab': {
            'total': len(chars_outside_list)
        }
    }

    summary_path = os.path.join(COVERAGE_DIR, 'summary.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f'   已寫入 {summary_path}')

    print('\n=== jf7000 驗收數據檢查 ===')
    print('| 腔 | 官方(G+C) | ＋切出(S+Y) | 擬音(N) | 無音(-) | 總計 |')
    print('|---|---|---|---|---|---|')
    for d in DIALECTS:
        st = jf_stats[d]
        print(f"| {d} | {st['official']} (G:{st['G']}, C:{st['C']}) | {st['with_carved']} (S:{st['S']}, Y:{st['Y']}) | ＋{st['nisim']} | {st['none']} | {st['total']} |")


if __name__ == '__main__':
    main()
