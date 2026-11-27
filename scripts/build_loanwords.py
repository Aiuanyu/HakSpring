# -*- coding: utf-8 -*-
"""
客委會《客語外來語》（LW）：
  --from-pdf : 從本機 PDF（/Users/gjrobert/NAS/lingua/客語/客委會客語外來語/）解析產生 data/loanwords/外來語-{腔}.csv 與 .json
  預設       : 從 data/loanwords/外來語-{腔}.csv 產生對應 .json（供 process_all_data.py 呼叫，不依賴 PDF）
"""
import csv
import io
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from process_all_data import UNIFIED_SCHEMA_HEADERS  # noqa: E402

PDF_DIR = "/Users/gjrobert/NAS/lingua/客語/客委會客語外來語/"
DIALECTS = [
    ("四", "si", "四縣", "20111026客委會語言資料-四縣.pdf"),
    ("海", "ha", "海陸", "20111026客委會語言資料-海陸.pdf"),
    ("大", "da", "大埔", "20111026客委會語言資料-大埔.pdf"),
    ("平", "rh", "饒平", "20111026客委會語言資料-饒平.pdf"),
    ("安", "zh", "詔安", "20111026客委會語言資料-詔安.pdf"),
]

TONE_CHARS = set("ˊˇˋˆ⁺+＋^`")
GIP_TO_COMBINING = {
    "ˊ": "\u0301",
    "ˋ": "\u0300",
    "ˇ": "\u030C",
    "^": "\u0302",
    "ˆ": "\u0302",
    "+": "\u0304",
    "＋": "\u0304",
    "⁺": "\u0304",
}

VOWEL_PRIORITY = ["a", "o", "e", "u", "i", "n", "m"]

# GIP tone symbol + checkedness -> numeric tone per dialect
# Based on reverse_tone_mapping.json & official Hakka romanization
GIP_NUM_MAP = {
    "si": {("", False): "55", ("", True): "5", ("ˊ", False): "24", ("ˇ", False): "11", ("ˋ", False): "31", ("ˋ", True): "2", ("+", False): "33"},
    "ha": {("", False): "55", ("", True): "5", ("ˊ", False): "24", ("ˇ", False): "11", ("ˋ", False): "53", ("ˋ", True): "2", ("+", False): "33", ("+", True): "5"},
    "da": {("", False): "33", ("+", False): "33", ("ˊ", False): "35", ("ˇ", False): "113", ("ˋ", False): "53", ("ˋ", True): "54", ("^", False): "31", ("^", True): "21"},
    "rh": {("", False): "55", ("", True): "5", ("ˊ", False): "24", ("ˇ", False): "11", ("ˋ", False): "53", ("ˋ", True): "2", ("^", False): "31", ("+", False): "33"},
    "zh": {("", False): "55", ("ˊ", False): "24", ("ˊ", True): "24", ("ˇ", False): "11", ("ˋ", False): "53", ("ˋ", True): "43", ("^", False): "31", ("^", True): "31"},
}


def gip_syllable_to_hpp_and_num(syllable, d_code):
    """Convert a single GIP syllable (e.g. idˋ, ji, bangˋ) to (hpp, numeric)."""
    m = re.match(r'^([a-zA-Z]+)([ˊˇˋˆ⁺+＋^`]?)$', syllable)
    if not m:
        return syllable, syllable
    letters, sym = m.groups()
    if sym == "＋" or sym == "⁺":
        sym = "+"
    elif sym == "ˆ":
        sym = "^"
    elif sym == "`":
        sym = "ˋ"

    # HPP conversion
    comb = GIP_TO_COMBINING.get(sym, "")
    if comb:
        hpp = letters
        for v in VOWEL_PRIORITY:
            idx = letters.lower().find(v)
            if idx != -1:
                hpp = unicodedata.normalize("NFC", letters[:idx+1] + comb + letters[idx+1:])
                break
    else:
        hpp = letters

    # Numeric tone conversion
    is_checked = letters.lower().endswith(("b", "d", "g"))
    tone_num = GIP_NUM_MAP.get(d_code, {}).get((sym, is_checked))
    if tone_num is None:
        tone_num = GIP_NUM_MAP.get(d_code, {}).get((sym, not is_checked), "")
    num = f"{letters}{tone_num}" if tone_num else letters
    return hpp, num


def convert_gip_phrase(pinyin_str, d_code):
    """Convert full GIP phrase to (hpp_str, num_str), preserving ／, 〔〕, (), spaces."""
    if not pinyin_str:
        return "", ""
    s = pinyin_str.replace("＋", "+").replace("⁺", "+").replace("ˆ", "^")
    # Tokenize keeping delimiters
    tokens = re.split(r'(\s+|[／/〔〕()\[\]，。、；：])', s)
    hpp_tokens = []
    num_tokens = []
    for tok in tokens:
        if not tok:
            continue
        if re.match(r'^[a-zA-Z]+[ˊˇˋ^+`]?$', tok):
            h, n = gip_syllable_to_hpp_and_num(tok, d_code)
            hpp_tokens.append(h)
            num_tokens.append(n)
        else:
            # Normalize ／ spacing
            t_clean = " / " if tok == "／" else tok
            hpp_tokens.append(t_clean)
            num_tokens.append(t_clean)
    hpp_res = re.sub(r'\s+', ' ', "".join(hpp_tokens)).strip()
    num_res = re.sub(r'\s+', ' ', "".join(num_tokens)).strip()
    return hpp_res, num_res


def extract_from_pdf(pdf_path, d_char, d_code, d_name):
    import pypdfium2 as pdfium

    def extract_page_chars(page):
        tp = page.get_textpage()
        n = tp.count_chars()
        chars = []
        for i in range(n):
            ch = tp.get_text_range(i, 1)
            if ch in ('\r', '\n'):
                continue
            box = tp.get_charbox(i)
            y_mid = (box[1] + box[3]) / 2.0
            chars.append((box[0], box[1], box[2], box[3], y_mid, ch))
        return chars

    def chars_to_lines(chars, y_tol=7.5, space_gap=2.8):
        if not chars:
            return []
        base_chars = [c for c in chars if c[5] not in TONE_CHARS and c[5] != ' ']
        tone_chars = [c for c in chars if c[5] in TONE_CHARS]
        base_chars.sort(key=lambda c: (-c[4], c[0]))
        lines = []
        for c in base_chars:
            x0, y0, x1, y1, y_mid, ch = c
            placed = False
            for line in lines:
                if abs(y_mid - line['base_y']) <= y_tol:
                    line['chars'].append(c)
                    placed = True
                    break
            if not placed:
                lines.append({'base_y': y_mid, 'chars': [c]})
        if not lines:
            return []
        for c in tone_chars:
            x0, y0, x1, y1, y_mid, ch = c
            best_line = None
            best_dist = 999.0
            for line in lines:
                dy = y_mid - line['base_y']
                if -4.0 <= dy <= 12.0 and abs(dy) < best_dist:
                    best_dist = abs(dy)
                    best_line = line
            if best_line is not None:
                best_line['chars'].append(c)
            else:
                lines.append({'base_y': y_mid, 'chars': [c]})
        lines.sort(key=lambda l: -l['base_y'])
        result = []
        for line in lines:
            cs = sorted(line['chars'], key=lambda c: c[0])
            parts = []
            prev_x1 = None
            for x0, y0, x1, y1, y_mid, ch in cs:
                if prev_x1 is not None and (x0 - prev_x1) > space_gap and ch not in TONE_CHARS:
                    parts.append(' ')
                parts.append(ch)
                prev_x1 = max(prev_x1, x1) if prev_x1 is not None else x1
            txt = ''.join(parts).strip()
            if txt:
                result.append({'y': line['base_y'], 'x0': cs[0][0], 'chars': cs, 'text': txt})
        return result

    def join_cs(sub_cs, space_gap=2.8):
        parts = []
        prev_x1 = None
        for x0, y0, x1, y1, y_mid, ch in sub_cs:
            if prev_x1 is not None and (x0 - prev_x1) > space_gap and ch not in TONE_CHARS:
                parts.append(' ')
            parts.append(ch)
            prev_x1 = max(prev_x1, x1) if prev_x1 is not None else x1
        return ''.join(parts).strip()

    def split_head_line(ln, col2_x, is_first_line=True):
        cs = sorted([c for c in ln['chars'] if c[5] != ' '], key=lambda c: c[0])
        if not cs:
            return "", ""
        has_cjk = any('\u4e00' <= c[5] <= '\u9fff' for c in cs)
        if not has_cjk and (not is_first_line or (cs[0][0] - col2_x > 65.0) or re.match(r'[a-z〔(]', cs[0][5])):
            py = join_cs(cs, space_gap=2.8)
            py = re.sub(r'\s+([ˊˇˋˆ⁺+＋^`])', r'\1', py)
            return "", py
        split_idx = None
        for i in range(1, len(cs)):
            prev_ch, curr_ch = cs[i-1][5], cs[i][5]
            gap = cs[i][0] - cs[i-1][2]
            if re.match(r'[a-z]', curr_ch):
                if gap > 4.5 or '\u4e00' <= prev_ch <= '\u9fff' or prev_ch in '）／〕':
                    split_idx = i
                    break
            if curr_ch == '〔' and gap > 4.0:
                split_idx = i
                break
        if split_idx is not None:
            left_cs, right_cs = cs[:split_idx], cs[split_idx:]
        else:
            left_cs, right_cs = cs, []
        word = join_cs(left_cs, space_gap=4.0)
        word = re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', word)
        pinyin = join_cs(right_cs, space_gap=2.8)
        pinyin = re.sub(r'\s+([ˊˇˋˆ⁺+＋^`])', r'\1', pinyin)
        return word, pinyin

    def replace_composite_glyphs(s):
        # 原書 PDF 用雙字座標重疊替代 Unicode 罕用字
        for src, dst in (
            ('仁厓', '𠊎'),
            ('拙帣', '𢯭'),
            ('仁恩', '𫣆'),
            ('課惱', '𧩣'),
            ('盰徑', '䀴'),
            ('盰俓', '䀴'),
            ('目巠', '䀴'),
            ('目徑', '䀴'),
            ('目俓', '䀴'),
            ('狗肖', '𤞚'),
            ('拍佰', '𢫦'),
        ):
            s = s.replace(src, dst)
        return s

    def clean_cjk_spaces(s):
        s = re.sub(r'\s+', ' ', s).strip()
        s = re.sub(r'(?<=[\u4e00-\u9fff，。！？；：、（）《》「」])\s+(?=[\u4e00-\u9fff，。！？；：、（）《》「」])', '', s)
        return replace_composite_glyphs(s)

    def clean_ja_spaces(s):
        s = re.sub(r'\s+', ' ', s).strip()
        ja_char = r'[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u3000-\u303f（）・ー]'
        return re.sub(f'(?<={ja_char})\\s+(?={ja_char})', '', s)

    pdf = pdfium.PdfDocument(pdf_path)
    entries = []
    cat_order = []
    for p_idx in range(4, 89):
        page = pdf[p_idx]
        chars = [c for c in extract_page_chars(page) if 45 <= c[1] <= 760]
        bullet_xs = [c[0] for c in chars if c[5] == '►']
        col3_x = min(bullet_xs) - 5.0 if bullet_xs else 290.0
        col1_chars = [c for c in chars if c[0] < 72]
        col1_lines = chars_to_lines(col1_chars, y_tol=5.0, space_gap=3.0)
        anchors = []
        cat_buf = []
        for ln in col1_lines:
            t_nospace = ln['text'].replace(' ', '')
            m = re.match(r'^(\d{1,2}-\d{2,3})$', t_nospace)
            if m:
                cat = ''.join(cat_buf).replace(' ', '')
                anchors.append({'id': m.group(1), 'cat': cat, 'y_id': ln['y']})
                cat_buf = []
            else:
                cat_buf.append(t_nospace)
        if not anchors:
            continue
        col1_max_x = max((c[2] for c in col1_chars), default=70.0)
        col2_x = col1_max_x + 2.0
        col2_chars = [c for c in chars if col2_x <= c[0] < col3_x]
        col3_chars = [c for c in chars if c[0] >= col3_x]
        col2_lines = chars_to_lines(col2_chars, y_tol=7.5, space_gap=2.8)
        col3_lines = chars_to_lines(col3_chars, y_tol=7.5, space_gap=2.8)
        ex_line_indices = [i for i, ln in enumerate(col2_lines) if re.search(r'(?:四|海|大|饒|詔)\s*(?:縣|陸|埔|平|安)\s*例\s*句', ln['text'])]
        c2_blocks = []
        if len(ex_line_indices) == len(anchors):
            start_i = 0
            for idx in range(len(anchors)):
                if idx + 1 < len(anchors):
                    ex_i, next_ex_i = ex_line_indices[idx], ex_line_indices[idx+1]
                    split_i = ex_i + 1
                    while split_i < next_ex_i:
                        txt_s = col2_lines[split_i]['text']
                        if col2_lines[split_i]['x0'] >= col2_x + 45.0 and not re.search(r'[a-zˊˇˋˆ⁺+＋^\x60〔〕]', txt_s) and col2_lines[split_i]['y'] > anchors[idx+1]['y_id'] + 24.0:
                            split_i += 1
                        else:
                            break
                    c2_blocks.append(col2_lines[start_i:split_i])
                    start_i = split_i
                else:
                    c2_blocks.append(col2_lines[start_i:])
        else:
            for idx, anc in enumerate(anchors):
                y_top = 760.0 if idx == 0 else anc['y_id'] + 28.0
                y_bot = 45.0 if idx == len(anchors) - 1 else anchors[idx+1]['y_id'] + 28.0
                c2_blocks.append([ln for ln in col2_lines if y_bot < ln['y'] <= y_top])

        c3_starts = [i for i, ln in enumerate(col3_lines) if '華語辭義' in ln['text'].replace(' ', '')]
        for idx, anc in enumerate(anchors):
            c2 = c2_blocks[idx]
            if len(c3_starts) == len(anchors):
                s3 = c3_starts[idx]
                e3 = c3_starts[idx+1] if idx + 1 < len(anchors) else len(col3_lines)
                c3 = col3_lines[s3:e3]
            else:
                y_top_c3 = 760.0 if idx == 0 else anc['y_id'] + 38.0
                y_bot_c3 = 45.0 if idx == len(anchors) - 1 else anchors[idx+1]['y_id'] + 38.0
                c3 = [ln for ln in col3_lines if y_bot_c3 < ln['y'] <= y_top_c3]
            ex_idx = next((i for i, ln in enumerate(c2) if re.search(r'(?:四|海|大|饒|詔)\s*(?:縣|陸|埔|平|安)\s*例\s*句', ln['text'])), None)
            head_lines = c2[:ex_idx] if ex_idx is not None else c2
            ex_lines = c2[ex_idx:] if ex_idx is not None else []
            word_parts, py_parts = [], []
            for hl_idx, hl in enumerate(head_lines):
                w, p = split_head_line(hl, col2_x, is_first_line=(hl_idx == 0))
                if w: word_parts.append(w)
                if p: py_parts.append(p)
            word = replace_composite_glyphs("".join(word_parts).strip())
            pinyin = " ".join(py_parts).strip()
            pinyin = re.sub(r'([ˊˇˋˆ⁺+＋^`])([a-zA-Z])', r'\1 \2', pinyin)
            pinyin = re.sub(r'\s+', ' ', pinyin).strip()
            hak_ex = ""
            if ex_lines:
                first_ex = re.sub(r'^.*?(?:四|海|大|饒|詔)\s*(?:縣|陸|埔|平|安)\s*例\s*句\s*', '', ex_lines[0]['text'])
                rest_ex = [ln['text'] for ln in ex_lines[1:]]
                hak_ex = clean_cjk_spaces("".join([first_ex] + rest_ex))
            c3_text = "\n".join(ln['text'] for ln in c3)
            def extract_field(pattern, next_patterns, clean_fn=clean_cjk_spaces):
                m = re.search(pattern + r'\s*([\s\S]*?)(?=' + next_patterns + r'|$)', c3_text)
                if not m:
                    return ""
                return clean_fn(m.group(1).replace('\n', ' '))
            def_zh = extract_field(r'►\s*華\s*語\s*辭\s*義', r'►\s*英\s*語\s*辭\s*義|►\s*日\s*語\s*辭\s*義|華\s*語\s*例\s*句')
            def_en = extract_field(r'►\s*英\s*語\s*辭\s*義', r'►\s*日\s*語\s*辭\s*義|華\s*語\s*例\s*句', lambda s: re.sub(r'\s+', ' ', s).strip())
            def_ja = extract_field(r'►\s*日\s*語\s*辭\s*義', r'華\s*語\s*例\s*句', clean_ja_spaces)
            ex_zh = extract_field(r'華\s*語\s*例\s*句', r'$')

            if anc['cat'] not in cat_order:
                cat_order.append(anc['cat'])
            cat_num = cat_order.index(anc['cat']) + 1
            hpp, num_py = convert_gip_phrase(pinyin, d_code)
            notes = []
            if def_en: notes.append(f"英語：{def_en}")
            if def_ja: notes.append(f"日語：{def_ja}")

            item = {h: "" for h in UNIFIED_SCHEMA_HEADERS}
            item.update({
                "編號": anc['id'],
                "客家語": word,
                "客語標音_顯示": hpp,
                "客語標音_查詢": num_py,
                "華語詞義": def_zh,
                "例句": hak_ex,
                "翻譯": ex_zh,
                "備註": "；".join(notes),
                "分類": f"{cat_num}{anc['cat']}",
                "sourceName": f"{d_name}外來語",
                "sourceType": "loanwords",
            })
            entries.append(item)
    return entries


def write_csv_and_json(out_dir, d_char, items):
    os.makedirs(out_dir, exist_ok=True)
    csv_path = os.path.join(out_dir, f"外來語-{d_char}.csv")
    json_path = os.path.join(out_dir, f"外來語-{d_char}.json")

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=UNIFIED_SCHEMA_HEADERS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(items)
    csv_text = buf.getvalue()

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        f.write(csv_text)

    payload = {"name": f"{d_char}外", "content": csv_text}
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def csv_to_json(out_dir, d_char):
    csv_path = os.path.join(out_dir, f"外來語-{d_char}.csv")
    json_path = os.path.join(out_dir, f"外來語-{d_char}.json")
    if not os.path.exists(csv_path):
        return
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        csv_text = f.read()
    payload = {"name": f"{d_char}外", "content": csv_text}
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def main():
    out_dir = os.path.join(ROOT, "data", "loanwords")
    from_pdf = "--from-pdf" in sys.argv
    if from_pdf:
        for d_char, d_code, d_name, pdf_name in DIALECTS:
            pdf_path = os.path.join(PDF_DIR, pdf_name)
            items = extract_from_pdf(pdf_path, d_char, d_code, d_name)
            write_csv_and_json(out_dir, d_char, items)
            print(f"  ✓ 產出外來語-{d_char}.csv / .json（{len(items)} 筆）")
    else:
        for d_char, _, _, _ in DIALECTS:
            csv_to_json(out_dir, d_char)
        print("  ✓ 外來語 JSON 更新完成（data/loanwords/外來語-*.json）")


if __name__ == "__main__":
    main()
