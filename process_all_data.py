# -*- coding: utf-8 -*>
import os
import csv
import re
import io
import json
import unicodedata

# --- Helper Dictionaries and Constants ---

UNIFIED_SCHEMA_HEADERS = [
    "編號", "客家語", "客語標音_顯示", "客語標音_查詢", "華語詞義", "例句", "翻譯", 
    "備註", "分類", "詞性1", "詞性2", "sourceName", "sourceType", "詞目音檔名"
]

DIALECT_MAP = {
    '四': '四縣', '海': '海陸', '大': '大埔', 
    '平': '饒平', '安': '詔安', '南': '南四縣'
}
REVERSE_DIALECT_MAP = {v: k for k, v in DIALECT_MAP.items()}
CHAR_TO_CODE_MAP = {
    '四': 'si', '海': 'ha', '大': 'da', 
    '平': 'rh', '安': 'zh', '南': 'na'
}

LEVEL_MAP = {
    '基': '基礎級', '初': '初級', '中': '中級', 
    '中高': '中高級', '高': '高級'
}

# --- Data Cleaning and Transformation Functions ---

def comprehensive_clean_spacing(text):
    if not text: return ""
    all_hakka_vowels = "áàăâāǎéèĕêēěíìĭîīǐóòŏôōǒúùŭûūǔńňǹm̄ḿm̌m̂m̀n̄ńňn̂ǹ"
    letter_like = f"a-zA-Z0-9{all_hakka_vowels}'"
    text = re.sub(f"([{letter_like}])([^{letter_like}\\s])", r"\1 \2", text)
    text = re.sub(f"([^{letter_like}\\s])([{letter_like}])", r"\1 \2", text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# --- GIP/CERT Phonetic Conversion Functions ---

def convert_syllable(syllable, tone_map):
    match = re.match(r'^([^a-zA-Z]*)?([a-zA-Z]+)(\d+)([^a-zA-Z]*)?$', syllable)
    if not match:
        return syllable
    leading_punc, letters, tone_val, trailing_punc = match.groups()
    leading_punc, trailing_punc = leading_punc or "", trailing_punc or ""
    tone_mappings = tone_map.get('tones', {}).get(tone_val)
    if not tone_mappings:
        return leading_punc + letters + tone_val + trailing_punc
    vowel_priority = tone_map.get('vowel_priority', [])
    converted_letters = letters
    for vowel in vowel_priority:
        if vowel in letters:
            new_vowel = tone_mappings.get(vowel)
            if new_vowel:
                converted_letters = letters.replace(vowel, new_vowel, 1)
                break
    return leading_punc + converted_letters + trailing_punc

def convert_phonetic_string(phonetic_str, tone_map):
    if not phonetic_str: return ""
    processed_str = phonetic_str.replace('－', '-')
    processed_str = re.sub(r'([，、；：-]+)', r' \1 ', processed_str)
    processed_str = re.sub(r'\s+', ' ', processed_str).strip()
    syllables = processed_str.split(' ')
    converted_syllables = [convert_syllable(s, tone_map) for s in syllables if s]
    return " ".join(converted_syllables)

# --- 教典例句：翻譯無括號个格式（見 data/annotations.md 第四節）---
# 有兜教典例句毋係「例：客語。(華語)」，係「客語。 華語。」抑係「客1。(客2。) (華1。) 華2。」，
# 前半客語、後半華語，中央用空白隔開。用客語、華語个特徵字判斷分界。
# 淨收兩邊都常用个字以外个：蓋、當、著、該、麼、啊、莫在華語乜常見，毋算。
HAKFA_MARKERS = set('个吔佢係毋恁仰摎𠊎㖠吂兜嗄恅厥𢯭')
MANDARIN_MARKERS = set('的了他她們是很沒嗎什和跟呢吧那')
WRAPPED_SENTENCE = re.compile(r'\(([^()]*?[。！？])\)')


def _hakfa_score(text):
    return sum(c in HAKFA_MARKERS for c in text) - sum(c in MANDARIN_MARKERS for c in text)


def _wrapped_sentences(block):
    """半形括號包規句个拆出來做另一句；全形括號係句肚个同義詞，毋拆。"""
    out = []
    for tok in re.split(r'[\s\u3000]+', block.strip()):
        for part in WRAPPED_SENTENCE.split(tok):
            if part.strip():
                out.append(part.strip())
    return out


def split_unlabeled_example(text):
    """無「例：」个教典例句，拆做（客語句、華語句）；無把握就回傳 None，維持舊做法。

    兩邊句數愛共樣正採用，避免共詞語列舉（例：黏土。(國土。) 土產。）拆毋著。
    """
    toks = [t for t in re.split(r'[\s\u3000]+', text.strip()) if t]
    if len(toks) < 2:
        return None
    scores = [_hakfa_score(t) for t in toks]
    best = None
    for k in range(1, len(toks)):
        h, m = sum(scores[:k]), sum(scores[k:])
        if h >= 1 and m <= 0 and (best is None or h - m > best[0]):
            best = (h - m, k)
    if best is None:
        # 退路：淨兩段、兩段都夠長、長度相近，前段無比後段較像華語（「客語句。 華語句。」）
        if len(toks) != 2:
            return None
        a, b = toks
        if not (min(len(a), len(b)) >= 6 and 0.5 <= len(a) / len(b) <= 2 and scores[0] >= scores[1]
                and re.search(r'[。！？]$', a) and re.search(r'[。！？]$', b)):
            return None
        best = (0, 1)
    k = best[1]
    hakfa = _wrapped_sentences(' '.join(toks[:k]))
    mandarin = _wrapped_sentences(' '.join(toks[k:]))
    if len(hakfa) != len(mandarin):
        return None
    return hakfa, mandarin


def clean_translation(text):
    """清洗例句翻譯文字，剝除多餘外層括號與前綴標記（如 例：、例如：）"""
    if not text:
        return ""
    lines = re.split(r'<br\s*/?>|\n', text, flags=re.IGNORECASE)
    cleaned_lines = []
    for line in lines:
        s = line.strip()
        if not s:
            cleaned_lines.append("")
            continue
        while (s.startswith('(') and s.endswith(')')) or (s.startswith('（') and s.endswith('）')):
            s = s[1:-1].strip()
        if s.startswith('（') or s.startswith('('):
            s = s[1:].strip()
        if s.endswith('）') or s.endswith(')'):
            s = s[:-1].strip()
        s = re.sub(r'^(?:(?:例如|例句|例|如)[：:\s]*)+', '', s)
        s = re.sub(r'([。！？；;）\)])\s*(?:(?:例如|例句|例|如)[：:\s]*)+', r'\1', s)
        while (s.startswith('(') and s.endswith(')')) or (s.startswith('（') and s.endswith('）')):
            s = s[1:-1].strip()
        cleaned_lines.append(s)
    return "<br>".join(cleaned_lines)


def parse_example_sentence_field(example_field_text):
    if not example_field_text: return "", ""
    stripped = example_field_text.strip()
    if not stripped.startswith('例'):
        split = split_unlabeled_example(stripped)
        if split:
            hakfa, mandarin = split
            return clean_example_sentence("<br>".join(hakfa)), clean_translation("<br>".join(mandarin))
    translations = re.findall(r'\((.*?)\)', example_field_text)
    cleaned_example = re.sub(r'\s*\([^)]*\)', '', example_field_text).strip()

    # 處理教典手誤之全形整句括號（包句號/問號/驚嘆號且為華語整句），抽取至翻譯中
    fw_sentences = re.findall(r'（([^（）]*?[。！？][^（）]*?)）', cleaned_example)
    if fw_sentences:
        translations.extend(fw_sentences)
        cleaned_example = re.sub(r'\s*（[^（）]*?[。！？][^（）]*?）', '', cleaned_example).strip()

    translation_text = "<br>".join(t.strip() for t in translations)
    split_parts = re.split(r'([。；])', cleaned_example)
    example_sentences = []
    for i in range(0, len(split_parts) - 1, 2):
        sentence, delimiter = split_parts[i], split_parts[i+1]
        if sentence.strip():
            example_sentences.append(sentence.strip() + delimiter)
    if len(split_parts) % 2 == 1 and split_parts[-1].strip():
        example_sentences.append(split_parts[-1].strip())
    raw_example = "<br>".join(s.strip() for s in example_sentences)
    return clean_example_sentence(raw_example), clean_translation(translation_text)

def clean_example_sentence(text):
    if not text:
        return ""
    lines = re.split(r'<br\s*/?>|\n', text, flags=re.IGNORECASE)
    cleaned_lines = []
    for line in lines:
        s = line.strip()
        if not s:
            cleaned_lines.append("")
            continue
        # 1. 循環清除開頭所有的 例如/例句/例/如 前綴
        s = re.sub(r'^(?:(?:例如|例句|例|如)[：:\s]*)+', '', s)
        s = re.sub(r'^例如(?=[\u4e00-\u9fa5])', '', s)
        # 2. 清除標點符號後接的「例：」或「例如：」等前綴
        s = re.sub(r'([。！？；;）\)])\s*(?:(?:例如|例句|例|如)[：:\s]*)+', r'\1', s)
        # 3. 清除詞性或序號後的「例：」（如 "1.動。銜接。例：銜接" -> "1.動。銜接。銜接"）
        s = re.sub(r'(\d+\s*[。.])\s*(?:(?:例如|例句|例|如)[：:\s]*)+', r'\1', s)
        s = re.sub(r'([動名形副量嘆代助連介]\s*[。.])\s*(?:(?:例如|例句|例|如)[：:\s]*)+', r'\1', s)

        all_quotes = re.findall(r'「([^」]+)」', s)
        stripped = re.sub(r'^(?:例如|例|如)\s*', '', s)
        stripped = re.sub(r'「[^」]+」', '', stripped)
        stripped = re.sub(r'[、，\s。！？]', '', stripped)
        if len(all_quotes) >= 2 and stripped == "":
            sub_sents = []
            for q in all_quotes:
                q = q.strip()
                if not re.search(r'[。！？]$', q):
                    q += "。"
                sub_sents.append(q)
            cleaned_lines.append("<br>".join(sub_sents))
            continue
        s = re.sub(r'^(?:例如|例|如)\s*「', '「', s)
        if len(all_quotes) == 1:
            single_match = re.match(r'^「([^」]+)」([。！？]?)$', s)
            if single_match:
                s = single_match.group(1) + (single_match.group(2) or "。")
        cleaned_lines.append(s)
    return "<br>".join(cleaned_lines)

def expand_reverse_map(dialect_reverse_map, vowel_map):
    expanded_map = {}
    base_vowels = sorted(list(set(vowel_map.values())))
    for dialect, rules in dialect_reverse_map.items():
        learned_rules = {}
        for key, tone_value in rules.items():
            is_checked = key.endswith('d')
            char = key.removesuffix('d')
            decomposed = unicodedata.normalize('NFD', char)
            diacritic_type = decomposed[1:] if len(decomposed) > 1 else 'none'
            rule_key = f"{diacritic_type}_{is_checked}"
            learned_rules[rule_key] = tone_value

        new_dialect_rules = {}
        for diacritic, base_vowel in vowel_map.items():
            decomposed = unicodedata.normalize('NFD', diacritic)
            diacritic_type = decomposed[1:] if len(decomposed) > 1 else 'none'
            rule_key_normal = f"{diacritic_type}_False"
            if rule_key_normal in learned_rules:
                new_dialect_rules[diacritic] = learned_rules[rule_key_normal]
            rule_key_checked = f"{diacritic_type}_True"
            if rule_key_checked in learned_rules:
                new_dialect_rules[diacritic + 'd'] = learned_rules[rule_key_checked]

        for v in base_vowels:
            rule_key_normal = f"none_False"
            if rule_key_normal in learned_rules:
                new_dialect_rules[v] = learned_rules[rule_key_normal]
            rule_key_checked = f"none_True"
            if rule_key_checked in learned_rules:
                new_dialect_rules[v + 'd'] = learned_rules[rule_key_checked]
        expanded_map[dialect] = new_dialect_rules
    return expanded_map

def convert_diacritic_to_numeric(text, dialect_map, vowel_map, vowel_priority):
    """使用 re.findall 提取所有音節，再轉換並用空白重組。"""
    if not text: return ""

    def convert_one_word(word):
        # This is the core conversion logic for a single, isolated syllable.
        if not word or word.isnumeric(): return ""
        is_checked = word.endswith(('b', 'd', 'g')) and not word.endswith('ng')
        diacritic_char, base_word = None, word

        for char in word:
            if char in vowel_map:
                diacritic_char = char
                base_word = word.replace(diacritic_char, vowel_map[char], 1)
                break
        
        key = None
        if diacritic_char:
            key = diacritic_char + 'd' if is_checked else diacritic_char
        else:
            main_vowel = next((v for v in vowel_priority if v in base_word), None)
            if main_vowel:
                key = main_vowel + 'd' if is_checked else main_vowel

        tone = dialect_map.get(key)
        return base_word + tone if tone else base_word

    # 1. 定義一個音節包含个所有合法字元
    syllable_chars = "a-zA-Z'" + "".join(vowel_map.keys())
    syllable_pattern = re.compile(f"[{syllable_chars}]+")

    # 2. 尋出所有个音節
    found_syllables = syllable_pattern.findall(text)

    # 3. 轉換每一隻音節
    converted_syllables = [convert_one_word(s) for s in found_syllables]

    # 4. 用空白重組
    return " ".join(converted_syllables)

# --- Helper Functions ---

def get_cert_source_name(filename):
    base_name = os.path.splitext(filename)[0]
    match = re.match(r'\d*([四海大平安])(.*)', base_name)
    if match:
        dialect_char, level_char = match.groups()
        dialect = DIALECT_MAP.get(dialect_char, '')
        level = LEVEL_MAP.get(level_char, '')
        return f"{dialect}{level}"
    return base_name

def get_js_variable_name(filename, source_type):
    base_name = os.path.splitext(filename)[0]
    if source_type == 'cert':
        # More robustly parse the cert filename to get the short variable name
        # e.g., "113大中高.csv" -> "大中高"
        match = re.match(r'\d*([四海大平安])(基|初|中高|中|高)', base_name)
        if match:
            dialect_char, level_char = match.groups()
            return f"{dialect_char}{level_char}"
        else:
            # Fallback for safety, though it shouldn't be needed if filenames are consistent.
            match_fallback = re.match(r'\d*(.*)', base_name)
            return match_fallback.group(1) if match_fallback else base_name
    elif source_type == 'gip':
        match = re.search(r'\d+-(.+)', base_name)
        if match:
            return f"教典{match.group(1)}"
    return base_name

# --- Parsing Functions ---

def parse_cert_csv(file_path, dialect_reverse_map, vowel_map, vowel_priority):
    data = []
    source_name = get_cert_source_name(os.path.basename(file_path))
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            print(f"  ✗ 警告：檔案 {os.path.basename(file_path)} 係空个，跳過。")
            return []

        dialect_prefix = ''
        if len(header) > 1 and header[1].endswith('客家語'):
            dialect_prefix = header[1].replace('客家語', '')
        if not dialect_prefix:
            print(f"  ✗ 錯誤：無法從 {os.path.basename(file_path)} 的標頭偵測腔調前綴。")
            return []

        dialect_char = REVERSE_DIALECT_MAP.get(dialect_prefix)
        dialect_code = CHAR_TO_CODE_MAP.get(dialect_char)

        if not dialect_code or dialect_code not in dialect_reverse_map:
            print(f"  ✗ 錯誤：尋無腔調 '{dialect_prefix}' ({dialect_code or '無'}) 个反向對應規則。")
            return []
        specific_dialect_map = dialect_reverse_map[dialect_code]

        dict_reader = csv.DictReader(f, fieldnames=header)
        for row in dict_reader:
            standard_item = {h: "" for h in UNIFIED_SCHEMA_HEADERS}
            display_phonetic = row.get(f'{dialect_prefix}客語標音', '')
            numeric_phonetic = convert_diacritic_to_numeric(display_phonetic, specific_dialect_map, vowel_map, vowel_priority)

            standard_item.update({
                '編號': row.get('編號', ''),
                '客家語': row.get(f'{dialect_prefix}客家語', ''),
                '華語詞義': row.get(f'{dialect_prefix}華語詞義', ''),
                '例句': clean_example_sentence(row.get(f'{dialect_prefix}例句', row.get('例句', ''))),
                '翻譯': clean_translation(row.get(f'{dialect_prefix}翻譯', row.get('翻譯', ''))),
                '備註': row.get('備註', ''),
                '分類': row.get('分類', ''),
                '詞性1': row.get('詞性1', ''),
                '詞性2': row.get('詞性2', ''),
                '客語標音_顯示': display_phonetic,
                '客語標音_查詢': comprehensive_clean_spacing(numeric_phonetic),
                'sourceName': source_name,
                'sourceType': 'cert'
            })
            data.append(standard_item)
    return data

def split_gip_phonetic(original_phonetic, tone_map):
    """教典音讀 →（顯示、查詢）。

    音讀欄用全形空白隔開幾隻讀音（見 data/annotations.md 第三節）：
    - 有註記个（又讀、特…）照舊，網站會轉做 label
    - 無註記个第二讀音：摎頭前共樣（含拿忒 <u> 以後共樣）就去忒；無共樣用「 / 」隔開（同認證「同詞多音」寫法）
    - 尾項个「（後字變調）」改做放在讀音頭前个註記，網站正會轉做 label
    以前全形空白會壓做半形，幾隻讀音黏做一串（例：白果 ped gò pag gò）。
    """
    display, query, seen = [], [], set()
    for seg in original_phonetic.split('\u3000'):
        seg = re.sub(r'</?u>', '', seg).strip()
        if not seg:
            continue
        note = re.search(r'\s*（([^）]*)）\s*$', seg)
        if note:
            seg = note.group(1) + seg[:note.start()].strip()
        key = re.sub(r'\s+', ' ', seg)
        if key in seen:
            continue
        seen.add(key)
        shown = convert_phonetic_string(seg, tone_map)
        if display and not re.match(r'^[\u4e00-\u9fff]', seg):
            shown = '/ ' + shown
        display.append(shown)
        query.append(comprehensive_clean_spacing(seg))
    return ' '.join(display), ' '.join(query)


# --- 教典原始音讀清洗、補丁表與回饋上游追蹤 ---

GIP_PATCHES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'gip_raw_patches.json')
_gip_patches_cache = None

def get_gip_raw_patches():
    global _gip_patches_cache
    if _gip_patches_cache is None:
        if os.path.exists(GIP_PATCHES_FILE):
            try:
                with open(GIP_PATCHES_FILE, 'r', encoding='utf-8') as f:
                    _gip_patches_cache = json.load(f)
            except Exception as e:
                print(f"  ✗ 警告：載入 gip_raw_patches.json 失敗: {e}")
                _gip_patches_cache = []
        else:
            _gip_patches_cache = []
    return _gip_patches_cache

GIP_ERRATA_RECORDS = []

def clean_gip_raw_phonetic(original_phonetic, dialect_char, hanji="", gip_id="", tracker=None):
    """清洗教典原始音讀：包含特異補丁覆蓋、通用規則清洗（序號前綴、音節數字空格等），並記錄回饋清單。"""
    if not original_phonetic:
        return ""
    text = original_phonetic
    initial_text = text
    applied_categories = []
    applied_reasons = []

    # 1. 特異補丁表比對（詞目特定修正）
    patches = get_gip_raw_patches()
    for p in patches:
        if p.get('dialect') == dialect_char:
            if not p.get('hanji') or p.get('hanji') == hanji:
                m_raw = p.get('match_raw')
                r_raw = p.get('replace_raw')
                if m_raw and m_raw in text:
                    text = text.replace(m_raw, r_raw)
                    applied_categories.append(p.get('category', '特定補丁'))
                    if p.get('reason'):
                        applied_reasons.append(p.get('reason'))

    # 2. 通用規則清洗（跨腔防禦）
    # 2a. 清除註記標籤後的殘留序號（如「又讀3.ha53」→「又讀ha53」、「合音2.ti24」→「合音ti24」）
    seq_pattern = re.compile(r'(又讀|俗音|合音|特|小稱|又俗音)\d+\.')
    if seq_pattern.search(text):
        text = seq_pattern.sub(r'\1', text)
        applied_categories.append("序號標籤殘留")
        applied_reasons.append("官方音讀標籤後殘留內部編號序號（如「又讀1.」「俗音2.」）。")

    # 2b. 音節與調值數字之間誤夾空格或 NBSP（如「ciam 33」→「ciam33」、「hog5 vien 55」→「hog5 vien55」）
    split_pattern = re.compile(r'([a-zA-Z]+)[\s\u00a0]+(\d{1,3})')
    if split_pattern.search(text):
        text = split_pattern.sub(r'\1\2', text)
        applied_categories.append("音節調號分離")
        applied_reasons.append("音節字母與調值數字間誤夾空白或不換行空格（NBSP）。")

    if text != initial_text and tracker is not None:
        tracker.append({
            'dialect': dialect_char,
            'gip_id': gip_id,
            'hanji': hanji,
            'original': initial_text,
            'cleaned': text,
            'categories': list(dict.fromkeys(applied_categories)),
            'reasons': list(dict.fromkeys(applied_reasons))
        })

    return text


def generate_upstream_errata_report(tracker, output_path):
    """產出結構化 Markdown 報告，供回饋教育部客語辭典編審團隊／客委會。"""
    if not tracker:
        return
    lines = [
        "# 教育部臺灣客語辭典原始資料勘誤與反饋建議表",
        "",
        "> 本文件由客源翠（HakSpring）資料前置清洗管線於處理教育部教典原始 CSV 時自動彙整產出。",
        "> 目的在於提供官方編審小組作為後續更新辭典資料庫之具體勘誤依據。",
        "",
        f"- 總計檢核並修正筆數：**{len(tracker)} 筆**",
        "",
        "## 一、問題分類統計",
        ""
    ]
    from collections import Counter
    cat_counter = Counter()
    dialect_counter = Counter()
    for item in tracker:
        dialect_counter[item['dialect']] += 1
        for c in item['categories']:
            cat_counter[c] += 1

    lines.append("| 腔別 | 筆數 |")
    lines.append("| :--- | :---: |")
    dialect_order = ['四', '南', '海', '大', '平', '安']
    for d in dialect_order:
        if d in dialect_counter:
            lines.append(f"| {DIALECT_MAP.get(d, d)}腔 | {dialect_counter[d]} |")
    lines.append("")

    lines.append("| 勘誤類型 | 筆數 |")
    lines.append("| :--- | :---: |")
    for cat, count in cat_counter.most_common():
        lines.append(f"| {cat} | {count} |")
    lines.append("")

    lines.append("## 二、勘誤條目清單")
    lines.append("")
    lines.append("| 腔別 | 編號 | 詞目 | 教典原始標音 | 客源翠修正標音 | 問題類型 | 勘誤建議說明 |")
    lines.append("| :---: | :---: | :--- | :--- | :--- | :--- | :--- |")

    for item in tracker:
        cats = "、".join(item['categories'])
        reasons = "；".join(item['reasons']) if item['reasons'] else "－"
        orig = item['original'].replace('\u3000', ' ').replace('|', '\\|')
        clean = item['cleaned'].replace('\u3000', ' ').replace('|', '\\|')
        lines.append(f"| {item['dialect']} | {item['gip_id']} | {item['hanji']} | `{orig}` | `{clean}` | {cats} | {reasons} |")

    lines.append("")
    lines.append("---")
    lines.append("*（本報告於每次執行 `python3 process_all_data.py` 時自動同步更新）*")
    lines.append("")

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f"  ✓ 成功產出回饋上游清單: {output_path}")


def parse_gip_csv(file_path, tone_map_data, dialect_char, tracker=None):
    data = []
    source_name = f"教典{dialect_char}"
    default_tones = tone_map_data.get('default_tones', {})
    dialect_specific_tones = tone_map_data.get('dialect_maps', {}).get(dialect_char, {})
    final_tones = {**default_tones, **dialect_specific_tones}
    current_tone_map = {"vowel_priority": tone_map_data.get("vowel_priority", []), "tones": final_tones}
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            standard_item = {h: "" for h in UNIFIED_SCHEMA_HEADERS}
            original_phonetic = row.get('音讀', '')
            hanji = row.get('詞目', '')
            gip_id = f"gip-{idx+1}"
            cleaned_phonetic = clean_gip_raw_phonetic(original_phonetic, dialect_char, hanji, gip_id, tracker)
            example_field = row.get('例句', '')
            cleaned_example, translation = parse_example_sentence_field(example_field)
            phonetic_display, phonetic_query = split_gip_phonetic(cleaned_phonetic, current_tone_map)
            standard_item.update({
                '編號': gip_id,
                '客家語': hanji,
                '華語詞義': re.sub(r'(\d+\.)\s*', r'\1 ', row.get('釋義', '').replace('　', '<br>')),
                '詞目音檔名': row.get('對應音檔名稱', '').strip(),
                '例句': cleaned_example,
                '翻譯': translation,
                '客語標音_顯示': phonetic_display,
                '客語標音_查詢': phonetic_query,
                '分類': '教典',
                'sourceName': source_name,
                'sourceType': 'gip'
            })
            data.append(standard_item)
    return data

# --- Output Functions ---

def write_to_json_file(data, output_path, variable_name):
    csv_string = ""
    if data:
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=UNIFIED_SCHEMA_HEADERS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(data)
        csv_string = output.getvalue()
    
    json_content = {
        "name": variable_name,
        "content": csv_string
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(json_content, f, ensure_ascii=False, indent=2)



# --- Main Processing Logic ---

def process_directory(directory_path, source_type, all_maps):
    print(f"--- 開始處理目錄：{directory_path} ({source_type}) ---")
    if not os.path.isdir(directory_path):
        print(f"  ✗ 錯誤：尋無目錄 '{directory_path}'。")
        return
    csv_files = [f for f in os.listdir(directory_path) if f.endswith('.csv')]
    if not csv_files:
        print("  - 在該目錄下尋無任何 .csv 檔案。")
        return
    for filename in csv_files:
        file_path = os.path.join(directory_path, filename)
        print(f"\n> 處理中: {file_path}")
        try:
            parsed_data, output_path, variable_name = None, None, None
            if source_type == 'cert':
                output_path = os.path.splitext(file_path)[0] + '.json'
                variable_name = get_js_variable_name(os.path.basename(file_path), source_type)
                parsed_data = parse_cert_csv(file_path, all_maps['expanded_reverse_map'], all_maps['vowel_map'], all_maps['vowel_priority'])
            elif source_type == 'gip':
                match = re.search(r'(\d+)-(.+)\.csv', filename)
                if match:
                    dialect_char = match.group(2)
                    output_path = os.path.splitext(file_path)[0] + '.json'
                    variable_name = f"教典{dialect_char}"
                    parsed_data = parse_gip_csv(file_path, all_maps['tone_map_data'], dialect_char, GIP_ERRATA_RECORDS)
                else:
                    print(f"  ✗ 警告：GIP 檔名格式毋著，跳過: {filename}")
                    continue
            if parsed_data is None:
                continue
            write_to_json_file(parsed_data, output_path, variable_name)
            print(f"  ✓ 成功產生檔案: {output_path}")
        except Exception as e:
            print(f"  ✗ 錯誤：處理檔案 {filename} 時發生意外：{e}")

def build_cross_dialect_map(script_dir):
    """
    三層階梯 Join：建立 GIP 教典跨腔對照表。
    Layer 1: 詞目字串 → Layer 1.5: hk 概念代碼 → Layer 2: 長釋義
    """
    from collections import defaultdict

    dialects = ['四', '海', '大', '平', '安', '南']
    gip_dir = os.path.join(script_dir, 'data', 'gip')

    # 1. 讀取全部 GIP CSV
    all_records = []  # [{d, idx, word, def_norm, hk}, ...]
    for d in dialects:
        csv_path = None
        for f in os.listdir(gip_dir):
            if f.endswith(f'-{d}.csv'):
                csv_path = os.path.join(gip_dir, f)
                break
        if not csv_path:
            print(f'  ✗ 找不到 {d} 腔 CSV')
            continue
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader):
                audio = row.get('對應音檔名稱', '').strip()
                hk_match = re.match(r'(hk\d+)', audio)
                def_raw = row.get('釋義', '').strip()
                def_norm = re.sub(r'[\s\u3000]+', '', def_raw).strip()
                all_records.append({
                    'd': d,
                    'idx': idx,
                    'word': row.get('詞目', '').strip(),
                    'def_norm': def_norm,
                    'hk': hk_match.group(1) if hk_match else '',
                })

    # 2. 建立群組（Union-Find 思路，但用 dict 合併）
    # 每個 record 的唯一 ID: f"{d}-{idx}"
    def rec_id(r):
        return f"{r['d']}-{r['idx']}"

    parent = {}  # rec_id -> group_id
    groups = {}  # group_id -> { joinType, members: {d: [{idx, word}]} }
    next_gid = [1]

    def new_group(join_type):
        gid = f"G{next_gid[0]:05d}"
        next_gid[0] += 1
        groups[gid] = {'joinType': join_type, 'members': defaultdict(list)}
        return gid

    def add_to_group(gid, record):
        rid = rec_id(record)
        if rid in parent:
            return  # 已屬於某群組
        parent[rid] = gid
        groups[gid]['members'][record['d']].append({
            'idx': record['idx'],
            'word': record['word']
        })

    def merge_groups(gid_a, gid_b, preferred_type):
        """將 gid_b 的所有成員併入 gid_a"""
        if gid_a == gid_b:
            return gid_a
        for d, members in groups[gid_b]['members'].items():
            for m in members:
                rid = f"{d}-{m['idx']}"
                parent[rid] = gid_a
                groups[gid_a]['members'][d].append(m)
        del groups[gid_b]
        # joinType 取最高優先級
        type_priority = {'word': 3, 'hk': 2, 'def': 1}
        cur_a = groups[gid_a].get('joinType', 'def')
        best_type = cur_a
        if type_priority.get(preferred_type, 0) > type_priority.get(best_type, 0):
            best_type = preferred_type
        groups[gid_a]['joinType'] = best_type
        return gid_a

    # --- Layer 1: 詞目字串 ---
    by_word = defaultdict(list)
    for r in all_records:
        by_word[r['word']].append(r)

    for word, recs in by_word.items():
        if len(recs) < 2:
            continue
        existing_gids = set()
        for r in recs:
            rid = rec_id(r)
            if rid in parent:
                existing_gids.add(parent[rid])
        if existing_gids:
            gid = existing_gids.pop()
            for other_gid in existing_gids:
                gid = merge_groups(gid, other_gid, 'word')
        else:
            gid = new_group('word')
        for r in recs:
            add_to_group(gid, r)

    print(f'  Layer 1 (詞目字串): {len(groups)} 群組')

    # --- Layer 1.5: hk 概念代碼 ---
    by_hk = defaultdict(list)
    for r in all_records:
        if r['hk']:
            by_hk[r['hk']].append(r)

    for hk, recs in by_hk.items():
        if len(recs) < 2:
            continue
        existing_gids = set()
        for r in recs:
            rid = rec_id(r)
            if rid in parent:
                existing_gids.add(parent[rid])

        if existing_gids:
            gid = existing_gids.pop()
            for other_gid in existing_gids:
                gid = merge_groups(gid, other_gid, 'hk')
        else:
            gid = new_group('hk')
        for r in recs:
            add_to_group(gid, r)

    print(f'  Layer 1 + 1.5: {len(groups)} 群組')

    # --- Layer 2: 長釋義（≥ 8 字 + 黑名單） ---
    DEF_BLACKLIST_PREFIXES = ('見「', '同「')
    DEF_BLACKLIST_EXACT = {'姓。', '地名。', '人名。', '全部。', '衣服。', '手掌。',
                           '樹枝。', '蝸牛。'}

    def is_def_eligible(d):
        if not d or len(d) < 8:
            return False
        if d in DEF_BLACKLIST_EXACT:
            return False
        for prefix in DEF_BLACKLIST_PREFIXES:
            if d.startswith(prefix):
                return False
        return True

    by_def = defaultdict(list)
    for r in all_records:
        if is_def_eligible(r['def_norm']):
            by_def[r['def_norm']].append(r)

    for def_str, recs in by_def.items():
        if len(recs) < 2:
            continue
        existing_gids = set()
        for r in recs:
            rid = rec_id(r)
            if rid in parent:
                existing_gids.add(parent[rid])

        if existing_gids:
            gid = existing_gids.pop()
            for other_gid in existing_gids:
                gid = merge_groups(gid, other_gid, 'def')
        else:
            gid = new_group('def')
        for r in recs:
            add_to_group(gid, r)

    print(f'  Layer 1 + 1.5 + 2: {len(groups)} 群組')

    # 3. 清理：只保留跨腔（≥ 2 個不同腔）的群組
    final_groups = {}
    for gid, g in groups.items():
        if len(g['members']) >= 2:
            final_groups[gid] = {
                'joinType': g['joinType'],
                'members': dict(g['members'])  # defaultdict → dict
            }

    # 4. 建立 wordIndex 反查表
    word_index = {}
    for gid, g in final_groups.items():
        for d, members in g['members'].items():
            for m in members:
                w = m['word']
                if w not in word_index:
                    word_index[w] = gid
                elif word_index[w] != gid:
                    # 衝突：同一詞目在不同群組（極罕見，取群組較大的）
                    existing_g = final_groups.get(word_index[w])
                    if existing_g and len(existing_g['members']) < len(g['members']):
                        word_index[w] = gid

    # 5. 輸出
    output = {
        'version': '2026-09-05',
        'groups': final_groups,
        'wordIndex': word_index
    }
    output_path = os.path.join(gip_dir, 'cross_dialect_map.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

    stats = {
        'total_groups': len(final_groups),
        'total_words_indexed': len(word_index),
        'by_join_type': defaultdict(int)
    }
    for g in final_groups.values():
        stats['by_join_type'][g['joinType']] += 1

    print(f'  ✓ 輸出 {output_path}')
    print(f'    群組: {stats["total_groups"]}, 詞目索引: {stats["total_words_indexed"]}')
    print(f'    各層: {dict(stats["by_join_type"])}')


if __name__ == '__main__':
    import sys
    script_dir = os.path.dirname(os.path.abspath(__file__))

    if '--only-map' in sys.argv:
        print("\n--- 建立 GIP 跨腔對照表 ---")
        build_cross_dialect_map(script_dir)
        sys.exit(0)

    all_maps = {}
    try:
        with open(os.path.join(script_dir, 'tone_mapping.json'), 'r', encoding='utf-8') as f:
            all_maps['tone_map_data'] = json.load(f)
        with open(os.path.join(script_dir, 'reverse_tone_mapping.json'), 'r', encoding='utf-8') as f:
            reverse_data = json.load(f)
            all_maps['vowel_map'] = reverse_data['vowel_map']
            all_maps['expanded_reverse_map'] = expand_reverse_map(reverse_data['dialect_reverse_map'], all_maps['vowel_map'])
        all_maps['vowel_priority'] = all_maps['tone_map_data'].get('vowel_priority', [])
    except FileNotFoundError as e:
        print(f"✗ 嚴重錯誤：尋無必要个規則檔 ({e.filename})，腳本無法執行。")
        exit()
    except json.JSONDecodeError as e:
        print(f"✗ 嚴重錯誤：規則檔格式毋著: {e}")
        exit()

    source_map = {
        'cert': os.path.join(script_dir, 'data', 'cert'),
        'gip': os.path.join(script_dir, 'data', 'gip')
    }

    if '--only-supp' not in sys.argv:
        for source_type, source_path in source_map.items():
            process_directory(source_path, source_type, all_maps)

        print("\n--- 全部 CSV 處理完成 ---")
        upstream_report_path = os.path.join(script_dir, 'data', 'upstream_feedback_gip.md')
        generate_upstream_errata_report(GIP_ERRATA_RECORDS, upstream_report_path)

    # 愛灣語加詞（人工維護个 data/curated/加詞.csv），補字典會讀佢，人工加詞優先過擬音（見 data/curated/README.md）
    sys.path.insert(0, os.path.join(script_dir, 'scripts'))
    import build_curated
    build_curated.main()

    # 補字典係對認證、教典 JSON 推出來个，認證、教典一更新就愛重建（見 data/supp/README.md）
    import build_supp_dict
    build_supp_dict.main()

    # 次方言補音（推導認證無標个南四縣音），用著補字典个對齊工具，見 data/sub-dialects-fill/README.md
    import build_subdialect_fill
    build_subdialect_fill.main()

    # 審音佇列（review-readings.html 讀），見 data/sub-dialects-fill/README.md
    import build_review_queue
    build_review_queue.main()

    