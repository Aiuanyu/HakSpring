# -*- coding: utf-8 -*-
import os
import csv
import json
import re

def get_words_from_cert_csv(file_path):
    """從 CERT CSV 檔案中提取詞彙。"""
    words = set()
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            return set()  # 跳過空檔案

        hakka_word_index = -1
        # 尋找包含 "客家語" 的欄位索引
        for i, col in enumerate(header):
            if "客家語" in col:
                hakka_word_index = i
                break

        if hakka_word_index == -1:
            # print(f"  - 警告: 在 {os.path.basename(file_path)} 中找不到 '客家語' 欄位。")
            return set()

        for row in reader:
            if len(row) > hakka_word_index:
                word = row[hakka_word_index].strip()
                if word:
                    # 有些詞條會用 / 分隔，例如 "人客/客人"
                    for w in re.split(r'[/\s]', word):
                        if w:
                            words.add(w)
    return words


def get_words_from_gip_csv(file_path):
    """從 GIP CSV 檔案中提取詞彙。"""
    words = set()
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        try:
            reader = csv.DictReader(f)
            for row in reader:
                word = row.get('詞目', '').strip()
                if word:
                    # 有些詞條會用 / 分隔
                    for w in re.split(r'[/\s]', word):
                        if w:
                            words.add(w)
        except Exception:
            # 檔案可能是空的或標頭有問題
            return set()
    return words

def build_trie(words):
    """從一組詞彙建立 Trie 樹。"""
    root = {}
    for word in words:
        node = root
        for char in word:
            node = node.setdefault(char, {})
        node['is_end'] = True
    return root

def main():
    """主函式，處理檔案並建立 Trie。"""
    all_words = set()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir == "/Users/jules/workspace":
        script_dir = "." # 在本地執行的路徑修正

    cert_dir = os.path.join(script_dir, 'data', 'cert')
    gip_dir = os.path.join(script_dir, 'data', 'gip')

    print("--- 開始從 CERT 檔案提取詞彙 ---")
    if os.path.isdir(cert_dir):
        for filename in sorted(os.listdir(cert_dir)):
            if filename.endswith('.csv'):
                file_path = os.path.join(cert_dir, filename)
                # print(f"> 讀取中: {filename}")
                words = get_words_from_cert_csv(file_path)
                all_words.update(words)
    else:
        print(f"  ✗ 錯誤: 找不到目錄 '{cert_dir}'")


    print("--- 開始從 GIP 檔案提取詞彙 ---")
    if os.path.isdir(gip_dir):
        for filename in sorted(os.listdir(gip_dir)):
            if filename.endswith('.csv'):
                file_path = os.path.join(gip_dir, filename)
                # print(f"> 讀取中: {filename}")
                words = get_words_from_gip_csv(file_path)
                all_words.update(words)
    else:
         print(f"  ✗ 錯誤: 找不到目錄 '{gip_dir}'")

    print(f"--- 總共找到 {len(all_words)} 個不重複的詞彙 ---")

    print("--- 正在建立詞彙樹 (Trie) ---")
    trie = build_trie(all_words)

    output_path = os.path.join(script_dir, 'trie.json')
    print(f"--- 正在將詞彙樹寫入到 {output_path} ---")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(trie, f, ensure_ascii=False)

    print("--- 全部處理完成 ---")


if __name__ == '__main__':
    main()