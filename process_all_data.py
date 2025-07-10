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

def parse_example_sentence_field(example_field_text):
    if not example_field_text: return "", ""
    translations = re.findall(r'\((.*?)\)', example_field_text)
    translation_text = "<br>".join(t.strip() for t in translations)
    cleaned_example = re.sub(r'\s*\([^)]*\)', '', example_field_text).strip()
    split_parts = re.split(r'([。；])', cleaned_example)
    example_sentences = []
    for i in range(0, len(split_parts) - 1, 2):
        sentence, delimiter = split_parts[i], split_parts[i+1]
        if sentence.strip():
            example_sentences.append(sentence.strip() + delimiter)
    if len(split_parts) % 2 == 1 and split_parts[-1].strip():
        example_sentences.append(split_parts[-1].strip())
    return "<br>".join(s.strip() for s in example_sentences), translation_text

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
                '例句': row.get(f'{dialect_prefix}例句', row.get('例句', '')),
                '翻譯': row.get(f'{dialect_prefix}翻譯', row.get('翻譯', '')),
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

def parse_gip_csv(file_path, tone_map_data, dialect_char):
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
            example_field = row.get('例句', '')
            cleaned_example, translation = parse_example_sentence_field(example_field)
            standard_item.update({
                '編號': f"gip-{idx+1}",
                '客家語': row.get('詞目', ''),
                '華語詞義': row.get('釋義', ''),
                '詞目音檔名': row.get('對應音檔名稱', ''),
                '例句': cleaned_example,
                '翻譯': translation,
                '客語標音_顯示': convert_phonetic_string(original_phonetic, current_tone_map),
                '客語標音_查詢': comprehensive_clean_spacing(original_phonetic),
                '分類': '教典',
                'sourceName': source_name,
                'sourceType': 'gip'
            })
            data.append(standard_item)
    return data

# --- Output Functions ---

def write_to_js_file(data, output_path, source_type, variable_name=None):
    if not variable_name:
        filename = os.path.basename(output_path)
        variable_name = get_js_variable_name(filename, source_type)
    csv_string = ""
    if data:
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=UNIFIED_SCHEMA_HEADERS)
        writer.writeheader()
        writer.writerows(data)
        csv_string = output.getvalue()
    escaped_csv_content = csv_string.replace('`', '\\`')
    js_content = f"const {variable_name} = {{\n  name: '{variable_name}',\n  content: `{escaped_csv_content}`\n}};\n"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_content)

def generate_js_from_json(json_path, js_path):
    try:
        print("\n--- 開始產生前端用个 JS 聲調對應檔 ---")
        with open(json_path, 'r', encoding='utf-8') as f:
            json_string_content = f.read()
        js_content = f"const toneMappingData = {json_string_content};"
        with open(js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        print(f"✓ 已成功產生檔案: {js_path}")
    except Exception as e:
        print(f"✗ 產生 JS 檔案時發生錯誤: {e}")

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
            parsed_data, output_js_path, js_variable_name = None, None, None
            if source_type == 'cert':
                output_js_path = os.path.splitext(file_path)[0] + '.js'
                parsed_data = parse_cert_csv(file_path, all_maps['expanded_reverse_map'], all_maps['vowel_map'], all_maps['vowel_priority'])
            elif source_type == 'gip':
                match = re.search(r'(\d+)-(.+)\.csv', filename)
                if match:
                    dialect_char = match.group(2)
                    output_js_path = os.path.splitext(file_path)[0] + '.js'
                    js_variable_name = f"教典{dialect_char}"
                    parsed_data = parse_gip_csv(file_path, all_maps['tone_map_data'], dialect_char)
                else:
                    print(f"  ✗ 警告：GIP 檔名格式毋著，跳過: {filename}")
                    continue
            if not parsed_data:
                continue
            write_to_js_file(parsed_data, output_js_path, source_type, variable_name=js_variable_name)
            print(f"  ✓ 成功產生檔案: {output_js_path}")
        except Exception as e:
            print(f"  ✗ 錯誤：處理檔案 {filename} 時發生意外：{e}")

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
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

    for source_type, source_path in source_map.items():
        process_directory(source_path, source_type, all_maps)
        
    print("\n--- 全部 CSV 處理完成 ---")

    generate_js_from_json(os.path.join(script_dir, 'tone_mapping.json'), os.path.join(script_dir, 'tone_mapping_data.js'))