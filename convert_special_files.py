import os
import re
import json

def convert_special_js_to_json():
    """
    專門處理 tone_mapping_data.js, NAmedias.js, 和 exclusions.js 的
    一個更強大、更精準的轉換腳本。
    """
    base_dir = os.getcwd()
    files_to_process = [
        'tone_mapping_data.js',
        'NAmedias.js',
        'exclusions.js'
    ]

    print("開始轉換三個特殊的 JS 資料檔...")

    for filename in files_to_process:
        js_path = os.path.join(base_dir, filename)
        json_path = js_path.replace('.js', '.json')

        if not os.path.exists(js_path):
            print(f"  -> 找不到檔案: {js_path}，已跳過。")
            continue

        print(f"\n處理中: {filename}")
        try:
            with open(js_path, 'r', encoding='utf-8') as f:
                content = f.read()

            final_json_data = None

            # --- 核心修正：先移除所有註解 ---
            # 移除 /* ... */ 塊狀註解
            content = re.sub(r'/\*[\s\S]*?\*/', '', content)
            # 移除 // ... 行內註解
            content = re.sub(r'//.*', '', content)

            if filename == 'tone_mapping_data.js' or filename == 'NAmedias.js':
                # 這個通用邏輯適用於只有一個物件的 JS 檔
                match = re.search(r'=\s*(\{[\s\S]*?\});', content)
                if match:
                    # 取得 JS 物件的純文字
                    js_object_str = match.group(1)
                    
                    # --- 轉換為合法 JSON 的關鍵步驟 ---
                    # 1. 將所有單引號 ' 替換為雙引號 "
                    json_like_str = js_object_str.replace("'", '"')
                    
                    # 2. 為所有沒被引號包住的鍵名 (key) 加上雙引號
                    #    例如： { word: true } -> { "word": true }
                    json_like_str = re.sub(r'([{,]\s*)([a-zA-Z0-9_]+)(\s*:)', r'\1"\2"\3', json_like_str)
                    
                    # 3. 移除物件或陣列結尾多餘的逗號 (trailing commas)
                    json_like_str = re.sub(r',\s*([}\]])', r'\1', json_like_str)

                    final_json_data = json.loads(json_like_str)
                    print(f"  -> 成功解析 {filename}")
                else:
                    print("  -> 處理失敗，找不到 ' = { ... };' 的資料結構。")

            elif filename == 'exclusions.js':
                # 將多個陣列合併為一個 JSON 物件
                combined_data = {}
                # 這個 regex 會尋找 `變數名 = [...]` 這種模式，不再限制 const
                matches = re.findall(r'(\w+)\s*=\s*(\[[\s\S]*?\]);', content)
                if not matches:
                     print("  -> 處理失敗，找不到 '變數 = [...];' 的資料結構。")
                else:
                    for var_name, array_str in matches:
                        try:
                            # 移除陣列結尾可能的多餘逗號
                            cleaned_array_str = re.sub(r',\s*\]', ']', array_str.strip())
                            combined_data[var_name] = json.loads(cleaned_array_str)
                        except json.JSONDecodeError as e:
                            print(f"    -> 解析陣列 {var_name} 失敗: {e}")
                    final_json_data = combined_data
                    print("  -> 成功合併 exclusions 中的所有陣列")

            if final_json_data:
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(final_json_data, f, ensure_ascii=False, indent=2)
                print(f"  -> 成功建立: {json_path}")
                # 建議手動刪除舊檔案，確保轉換正確
                # os.remove(js_path)
            else:
                 print(f"  -> 未能產生 JSON 資料，已跳過。")

        except Exception as e:
            print(f"  -> 發生預期外的錯誤: {e}")

    print("\n轉換完成。")

if __name__ == '__main__':
    convert_special_js_to_json()
