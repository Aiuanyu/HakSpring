import os
import re

def process_csv_files():
    """
    處理 data/gip 目錄下的所有 CSV 檔案，並將其轉換為 JS 變數檔案。
    """
    try:
        # 取得目前腳本所在的目錄
        script_dir = os.path.dirname(os.path.abspath(__file__))
        # 組合出 data/gip 的絕對路徑
        gip_dir = os.path.join(script_dir, 'data', 'gip')
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

            # 2. 讀取 CSV 檔案內容 (使用 utf-8-sig 來自動處理 BOM)
            with open(full_path, 'r', encoding='utf-8-sig') as f:
                csv_content = f.read()

            # 3. 組合新个 JS 檔案內容
            # 處理內容中可能出現的反引號 `
            js_safe_content = csv_content.replace('`', '\\`')
            
            js_content = (
                f"{variable_name} = {{\n"
                f'  "name": "{variable_name}",\n'
                f'  "content": `{js_safe_content}`\n'
                f"}};\n"
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