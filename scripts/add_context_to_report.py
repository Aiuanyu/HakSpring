#!/usr/bin/env python3
import csv
import os

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    csv_path = os.path.join(project_root, "unsupported_glyphs_report.csv")
    data_dir = os.path.join(project_root, "data")

    if not os.path.exists(csv_path):
        print("找不到 unsupported_glyphs_report.csv")
        return

    print("讀取原本的報告...")
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print("正在從原始資料庫抓取例句/釋義的完整內容...")
    new_rows = []
    for r in rows:
        filename = r['file']
        line_num = int(r['line'])
        col_name = r['column']
        
        cert_path = os.path.join(data_dir, "cert", filename)
        gip_path = os.path.join(data_dir, "gip", filename)
        target_path = cert_path if os.path.exists(cert_path) else gip_path
        
        context = ""
        if os.path.exists(target_path):
            with open(target_path, 'r', encoding='utf-8') as f2:
                reader2 = csv.DictReader(f2)
                for i, r2 in enumerate(reader2, start=2):
                    if i == line_num:
                        context = r2.get(col_name, "")
                        break
        
        r['context'] = context
        new_rows.append(r)

    print("寫回報告...")
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=["char", "codepoint", "file", "line", "column", "entry", "context"])
        writer.writeheader()
        writer.writerows(new_rows)
    
    print("✅ 成功！已將例句內容補上。請重新整理網頁。")

if __name__ == "__main__":
    main()
