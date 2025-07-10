import os
import re
import json

def convert_syllable(syllable, tone_map):
    """轉換單一音節个聲調符號，並保留前後个標點符號"""
    # 樣式：(頭前標點) (字母) (數字) (後壁標點)
    match = re.match(r'^([^a-zA-Z]*)?([a-zA-Z]+)(\d+)([^a-zA-Z]*)?$', syllable)
    if not match:
        return syllable

    leading_punc, letters, tone_val, trailing_punc = match.groups()
    leading_punc = leading_punc or ""
    trailing_punc = trailing_punc or ""

    # 進行聲調轉換
    tone_mappings = tone_map.get('tones', {}).get(tone_val)
    if not tone_mappings:
        # 若尋無對應，原樣組合回去
        return leading_punc + letters + tone_val + trailing_punc

    vowel_priority = tone_map.get('vowel_priority', [])
    
    converted_letters = letters # 預設值
    # 根據元音優先順序尋著愛換个字母
    for vowel in vowel_priority:
        if vowel in letters:
            new_vowel = tone_mappings.get(vowel)
            if new_vowel:
                converted_letters = letters.replace(vowel, new_vowel, 1)
                break # 尋著了就跳出

    # 將標點、轉換後个音節組合轉去
    return leading_punc + converted_letters + trailing_punc

def convert_phonetic_string(phonetic_str, tone_map):
    """轉換歸个音讀字串，包含前處理標點符號"""
    if not phonetic_str:
        return ""
    
    # 1. 前處理：統一標點與間隔
    # 淨將全形連字號「－」轉做半形「-」
    processed_str = phonetic_str.replace('－', '-')

    # 標準化所有指定標點符號前後的空白：前後都加一隻空白
    # 匹配全形逗號、頓號、分號、冒號，以及半形連字號（一個或多個）
    processed_str = re.sub(r'([，、；：-]+)', r' \1 ', processed_str)
    
    # 壓縮多餘的空白
    processed_str = re.sub(r'\s+', ' ', processed_str).strip()

    # 2. 用空白來切分音節
    syllables = processed_str.split(' ')
    converted_syllables = [convert_syllable(s, tone_map) for s in syllables if s]
    return " ".join(converted_syllables)

def generate_js_from_json(json_path, js_path):
    """
    讀取純 JSON 檔案，並將其內容包裝成一支 JS 變數檔案。
    """
    try:
        print("\n--- 開始產生前端用个 JS 聲調對應檔 ---")
        # 讀取 JSON 檔案个原始文字內容
        with open(json_path, 'r', encoding='utf-8') as f:
            json_string_content = f.read()

        # 組合 JS 檔案个內容
        js_content = (
            f"const toneMappingData = {json_string_content};"
        )
        
        # 決定 JS 檔案个輸出路徑 (同 JSON 檔案共目錄)
        output_dir = os.path.dirname(json_path)
        full_js_path = os.path.join(output_dir, os.path.basename(js_path))

        # 將內容寫入 .js 檔案
        with open(full_js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        
        print(f"✓ 已成功產生檔案: {full_js_path}")

    except Exception as e:
        print(f"產生 JS 檔案時發生錯誤: {e}")

def process_csv_files():
    """
    處理 data/gip 目錄下的所有 CSV 檔案，並將其轉換為 JS 變數檔案。
    """
    try:
        # 取得目前腳本所在的目錄
        script_dir = os.path.dirname(os.path.abspath(__file__))
        # 組合出 data/gip 的絕對路徑
        gip_dir = os.path.join(script_dir, 'data', 'gip')
        mapping_path = os.path.join(script_dir, 'tone_mapping.json')

        # 讀取聲調對應表
        with open(mapping_path, 'r', encoding='utf-8') as f:
            tone_map = json.load(f)

        output_dir = gip_dir  # 輸出目錄與來源目錄相同

        if not os.path.isdir(gip_dir):
            print(f"錯誤：尋無目錄 '{gip_dir}'")
            return

        # 找出所有 .csv 檔案
        csv_files = [f for f in os.listdir(gip_dir) if f.endswith('.csv')]

        if not csv_files:
            print(f"在 '{gip_dir}' 目錄下尋無任何 CSV 檔案。")
            return

        print(f"尋著 {len(csv_files)} 隻 CSV 檔案，開始處理...")

        for csv_file in csv_files:
            full_path = os.path.join(gip_dir, csv_file)

            # 1. 解析檔名，產生新檔名與變數名
            # 檔名範例: 教客典-20250630-四.csv
            match = re.search(r'教客典-(\d+)-(.+)\.csv', csv_file)
            if not match:
                print(f"  - 檔名格式毋著，跳過： {csv_file}")
                continue

            date_part = match.group(1)  # 20250630
            dialect_char = match.group(2) # 四

            new_file_name = f"{date_part}-{dialect_char}.js"
            variable_name = f"教典{dialect_char}"

            print(f"- 處理中: {csv_file}")
            print(f"  - 新 JS 檔名: {new_file_name}")
            print(f"  - 新 JS 變數名: {variable_name}")

            # 組合聲調對應表
            default_tones = tone_map.get('default_tones', {})
            dialect_specific_tones = tone_map.get('dialect_maps', {}).get(dialect_char, {})
            
            # 合併，腔調特別規則會蓋過預設值
            final_tones = {**default_tones, **dialect_specific_tones}
            
            current_tone_map = {
                "vowel_priority": tone_map.get("vowel_priority", []),
                "tones": final_tones
            }

            # 2. 讀取 CSV 檔案內容 (使用 utf-8-sig 來自動處理 BOM)
            with open(full_path, 'r', encoding='utf-8-sig') as f:
                lines = f.readlines()

            # 處理音讀與例句轉換
            header = lines[0].strip().split(',')
            try:
                phonetic_col_index = header.index('音讀')
                audio_col_index = header.index('對應音檔名稱')
                header[audio_col_index] = '詞目音檔名' # 修改標頭名稱

                # 檢查並準備處理「例句」欄位
                try:
                    example_col_index = header.index('例句')
                    header.append('翻譯')
                    has_example_col = True
                except ValueError:
                    example_col_index = -1
                    has_example_col = False

            except ValueError as e:
                print(f"  - 警告：在 {csv_file} 尋無必要个欄位 ({e})，跳過轉換。")
                csv_content = "".join(lines)
            else:
                new_lines = [','.join(header) + '\n'] # 使用修改後个標頭
                for line in lines[1:]:
                    if not line.strip(): continue # 跳過空行
                    parts = line.strip().split(',')

                    # 處理音讀轉換
                    if len(parts) > phonetic_col_index:
                        original_phonetics = parts[phonetic_col_index]
                        converted_phonetics = convert_phonetic_string(original_phonetics, current_tone_map)
                        parts[phonetic_col_index] = converted_phonetics

                    # 處理例句與翻譯
                    if has_example_col:
                        # 確保欄位列表有足夠空間容納新增的翻譯欄
                        while len(parts) < len(header):
                            parts.append('')
                        
                        if example_col_index < len(parts) and parts[example_col_index]:
                            original_example = parts[example_col_index]
                            
                            # 1. 提取翻譯 (...)
                            translations = re.findall(r'\((.*?)\)', original_example)
                            translation_text = "<br>".join(t.strip() for t in translations)

                            # 2. 清理例句，移除 (...)
                            cleaned_example = re.sub(r'\s*\([^)]*\)', '', original_example).strip()
                            
                            # 3. 將多個例句用 <br> 分隔，並保留句尾標點
                            split_parts = re.split(r'([。；])', cleaned_example)
                            example_sentences = []
                            # 將句子和其後的分隔符號配對組合
                            for i in range(0, len(split_parts) - 1, 2):
                                sentence = split_parts[i]
                                delimiter = split_parts[i+1]
                                if sentence.strip():
                                    example_sentences.append(sentence.strip() + delimiter)
                            
                            # 處理最後一個可能沒有分隔符號的句子
                            if len(split_parts) % 2 == 1 and split_parts[-1].strip():
                                example_sentences.append(split_parts[-1].strip())

                            new_example_text = "<br>".join(s.strip() for s in example_sentences)

                            # 4. 更新 parts
                            parts[example_col_index] = new_example_text
                            parts[len(header)-1] = translation_text # 翻譯放在最後一欄

                    new_lines.append(','.join(parts) + '\n')
                csv_content = "".join(new_lines)

            # 3. 組合新个 JS 檔案內容
            # 處理內容中可能出現的反引號 `
            js_safe_content = csv_content.replace('`', '\`')
            
            js_content = (
                f"const {variable_name} = {{\n"  # 用 const 較好
                f'  name: "{variable_name}",\n'
                f'  content: `{js_safe_content}`\n'
                f"}};"
            )

            # 4. 將新內容寫入 JS 檔案
            new_file_path = os.path.join(output_dir, new_file_name)
            with open(new_file_path, 'w', encoding='utf-8') as f:
                f.write(js_content)
            
            print(f"  ✓ 已成功產生檔案: {new_file_path}")

        print("\n全部處理完成！")

    except Exception as e:
        print(f"處理過程發生錯誤: {e}")

if __name__ == "__main__":
    process_csv_files()

    # --- ▼▼▼ 在這搭加上底下个程式碼 ▼▼▼ ---
    # 執行完 CSV 處理後，自動產生分前端用个 .js 檔案
    # 確定 tone_mapping.json 檔案个路徑
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, 'tone_mapping.json')
    js_path = 'tone_mapping_data.js' # JS 檔案个名稱

    if os.path.exists(json_path):
        generate_js_from_json(json_path, js_path)
    else:
        print(f"\n警告：尋無 {json_path}，無法度產生前端用个 JS 檔案。")
    # --- ▲▲▲ 加入結束 ▲▲▲ ---
