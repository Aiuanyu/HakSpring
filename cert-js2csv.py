# -*- coding: utf-8 -*-
import os
import re
import sys

def convert_cert_js_to_csv(source_directory):
    """
    讀取指定目錄下的所有 .js 檔案，
    並將其內容中用反引號 (`) 包裹的 CSV 字串，
    提取出來並儲存為同名的 .csv 檔案。

    :param source_directory: 包含 .js 檔案的來源目錄路徑
    """
    print(f"--- 開始處理目錄：{source_directory} ---")

    # 檢查來源目錄是否存在
    if not os.path.isdir(source_directory):
        print(f"錯誤：尋無目錄 '{source_directory}'。請確定路徑正確，或腳本係在專案个根目錄執行。")
        return

    # 找出所有 .js 檔案
    js_files = [f for f in os.listdir(source_directory) if f.endswith('.js')]

    if not js_files:
        print("在該目錄下尋無任何 .js 檔案。")
        return

    successful_conversions = 0
    failed_conversions = 0

    # 遍歷所有 .js 檔案
    for js_file in js_files:
        js_file_path = os.path.join(source_directory, js_file)
        csv_file_path = os.path.join(source_directory, js_file.replace('.js', '.csv'))

        print(f"\n> 處理中: {js_file_path}")

        try:
            with open(js_file_path, 'r', encoding='utf-8') as f:
                js_content = f.read()

            # 使用正規表示式尋找 content: `...` 裡肚个內容
            # re.DOTALL (或 re.S) 確保 '.' 可以匹配換行符
            match = re.search(r'(?:"content"|content):\s*`([\s\S]*)`', js_content)

            if match:
                # 取得第一個捕獲組个內容，就係 CSV 字串
                csv_content = match.group(1).strip()
                
                # 將提取出來个內容寫入新个 .csv 檔案
                with open(csv_file_path, 'w', encoding='utf-8-sig') as f:
                    # 使用 utf-8-sig 編碼，分 Excel 打開時較毋會亂碼
                    f.write(csv_content)
                
                print(f"  ✓ 成功產生檔案: {csv_file_path}")
                successful_conversions += 1
            else:
                print(f"  ✗ 警告：在 {js_file} 裡肚尋無符合 `content: ...` 个格式，跳過處理。")
                failed_conversions += 1

        except Exception as e:
            print(f"  ✗ 錯誤：處理檔案 {js_file} 時發生意外：{e}")
            failed_conversions += 1

    print("\n--- 全部處理完成 ---")
    print(f"成功轉換 {successful_conversions} 隻檔案。")
    if failed_conversions > 0:
        print(f"失敗或跳過 {failed_conversions} 隻檔案。")

if __name__ == '__main__':
    # 設定目標目錄个相對路徑
    # 這支腳本愛放在專案个根目錄下執行，
    # 恁樣佢正尋得著 'data/cert' 這个資料夾。
    cert_directory = os.path.join('data', 'cert')
    
    # 執行轉換
    convert_cert_js_to_csv(cert_directory)
