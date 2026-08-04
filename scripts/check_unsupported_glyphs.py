#!/usr/bin/env python3
"""
check_unsupported_glyphs.py
檢查客源翠資料庫中不被字型支援的字元

用法：
    python3 scripts/check_unsupported_glyphs.py

此腳本會：
1. 自動下載三套字型（Iansui、霞鶩文楷 TC、豆腐烏）到暫存目錄
2. 讀取各字型的 cmap 表，取得支援字元的 union set
3. 掃描 data/cert/*.csv 及 data/gip/*.csv（排除羅馬字欄位）
4. 輸出不支援字元的報告（CSV 格式）

相依套件：
    pip install --no-cache-dir 'fonttools[woff]'
"""

import csv
import io
import os
import re
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:
    print("錯誤：請先安裝 fonttools")
    print("  pip install --no-cache-dir 'fonttools[woff]'")
    sys.exit(1)


# ─── 字型下載設定 ───────────────────────────────────────────

FONT_SOURCES = {
    "Iansui": {
        "url": "https://github.com/ButTaiwan/iansui/releases/download/v1.020/iansui.zip",
        "type": "zip",  # zip 裡面有 Iansui-Regular.ttf
        "filename_in_zip": "Iansui-Regular.ttf",
    },
    "LXGWWenKaiTC": {
        "url": "https://github.com/lxgw/LxgwWenkaiTC/releases/download/v1.522/LXGWWenKaiTC-Regular.ttf",
        "type": "ttf",
    },
    "tauhu-oo": {
        "url": "https://raw.githubusercontent.com/tauhu-tw/tauhu-oo/master/TauhuOo2005-Regular.otf",
        "type": "otf",
    },
}


# ─── CSV 欄位過濾設定 ──────────────────────────────────────

# cert CSV 要排除的欄位名（包含這些關鍵字就跳過）
CERT_SKIP_KEYWORDS = ["編號", "標音"]

# gip CSV 要排除的欄位名（完全匹配）
GIP_SKIP_COLUMNS = {"序號", "音讀", "方言點", "詞目索引", "對應音檔名稱"}

# 不檢查的字元範圍（ASCII、常用標點、HTML tag 等）
# 只檢查 U+2E80 以上的字元（CJK 部首補充開始）
MIN_CODEPOINT = 0x2E80


# ─── 字型下載與 cmap 提取 ──────────────────────────────────

def download_font(name: str, config: dict, tmpdir: str) -> str:
    """下載字型檔到暫存目錄，回傳本地檔案路徑"""
    url = config["url"]
    font_type = config["type"]

    print(f"  📥 下載 {name}...", end=" ", flush=True)

    if font_type == "zip":
        zip_path = os.path.join(tmpdir, f"{name}.zip")
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path, "r") as zf:
            target = config["filename_in_zip"]
            zf.extract(target, tmpdir)
            font_path = os.path.join(tmpdir, target)
        os.remove(zip_path)  # 清掉 zip，節省空間
    else:
        ext = "otf" if font_type == "otf" else "ttf"
        font_path = os.path.join(tmpdir, f"{name}.{ext}")
        urllib.request.urlretrieve(url, font_path)

    size_mb = os.path.getsize(font_path) / (1024 * 1024)
    print(f"完成 ({size_mb:.1f} MB)")
    return font_path


def extract_cmap(font_path: str) -> set:
    """從字型檔提取所有支援的 Unicode code point"""
    font = TTFont(font_path)
    codepoints = set()
    for table in font["cmap"].tables:
        if table.isUnicode():
            codepoints.update(table.cmap.keys())
    font.close()
    return codepoints


def build_supported_charset() -> set:
    """下載所有字型，建立支援字元的 union set"""
    print("🔤 建立字型支援字元集合...")

    all_codepoints = set()

    with tempfile.TemporaryDirectory(prefix="hakspring_fonts_") as tmpdir:
        for name, config in FONT_SOURCES.items():
            try:
                font_path = download_font(name, config, tmpdir)
                cmap = extract_cmap(font_path)
                print(f"     {name}: {len(cmap):,} 個字元")
                all_codepoints.update(cmap)
                # 下載完立刻刪除字型檔，節省空間
                os.remove(font_path)
            except Exception as e:
                print(f"  ⚠️  {name} 下載或解析失敗: {e}")
                print(f"     （將繼續處理其他字型）")
        # TemporaryDirectory 結束時會自動清理

    print(f"  ✅ 聯集: {len(all_codepoints):,} 個字元\n")
    return all_codepoints


# ─── CSV 掃描 ──────────────────────────────────────────────

def should_skip_column_cert(col_name: str) -> bool:
    """判斷 cert CSV 的欄位是否要跳過"""
    return any(kw in col_name for kw in CERT_SKIP_KEYWORDS)


def should_skip_column_gip(col_name: str) -> bool:
    """判斷 gip CSV 的欄位是否要跳過"""
    return col_name in GIP_SKIP_COLUMNS


def is_checkable_char(ch: str) -> bool:
    """判斷字元是否需要檢查（只檢查 CJK 相關字元）"""
    cp = ord(ch)
    # 只檢查 U+2E80 以上的字元
    if cp < MIN_CODEPOINT:
        return False
    # 排除一般標點符號區間
    # U+3000-U+303F: CJK 標點（但 U+3005 々、U+3007 〇 要檢查）
    if 0x3000 <= cp <= 0x303F and cp not in (0x3005, 0x3007):
        return False
    # 排除注音符號（U+3100-U+312F）— 瀏覽器有系統 fallback
    if 0x3100 <= cp <= 0x312F:
        return False
    # 排除括號等符號
    if 0x3008 <= cp <= 0x3011:
        return False
    if 0xFF01 <= cp <= 0xFF60:
        # 全形 ASCII，系統一般有支援
        return False
    return True


def get_entry_name(row: dict, csv_type: str) -> str:
    """從 CSV 列取得詞目名稱，方便報告中參照"""
    if csv_type == "cert":
        # cert CSV 的第二欄是「X腔客家語」
        for key in row:
            if "客家語" in key:
                return row[key]
        return ""
    else:
        return row.get("詞目", "")


def scan_csv_file(filepath: str, csv_type: str, supported: set) -> list:
    """
    掃描單一 CSV 檔案，回傳不支援字元的列表

    Returns:
        list of dict: [{char, codepoint, file, line, column, entry}, ...]
    """
    results = []
    skip_fn = should_skip_column_cert if csv_type == "cert" else should_skip_column_gip

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for line_num, row in enumerate(reader, start=2):  # header 是第 1 行
                entry_name = get_entry_name(row, csv_type)
                for col_name, value in row.items():
                    if col_name is None or value is None:
                        continue
                    if skip_fn(col_name):
                        continue
                    for ch in value:
                        if is_checkable_char(ch) and ord(ch) not in supported:
                            results.append({
                                "char": ch,
                                "codepoint": f"U+{ord(ch):04X}",
                                "file": os.path.basename(filepath),
                                "line": line_num,
                                "column": col_name,
                                "entry": entry_name,
                                "context": value,
                            })
    except Exception as e:
        print(f"  ⚠️  讀取 {filepath} 失敗: {e}")

    return results


def scan_all_csvs(data_dir: str, supported: set) -> list:
    """掃描所有 cert 同 gip 的 CSV 檔案"""
    all_results = []

    # 掃描 cert
    cert_dir = os.path.join(data_dir, "cert")
    if os.path.isdir(cert_dir):
        csv_files = sorted(Path(cert_dir).glob("*.csv"))
        print(f"📂 掃描 cert/ ({len(csv_files)} 個檔案)...")
        for f in csv_files:
            results = scan_csv_file(str(f), "cert", supported)
            if results:
                print(f"  ⚠  {f.name}: {len(results)} 個不支援字元")
            all_results.extend(results)

    # 掃描 gip
    gip_dir = os.path.join(data_dir, "gip")
    if os.path.isdir(gip_dir):
        csv_files = sorted(Path(gip_dir).glob("*.csv"))
        print(f"📂 掃描 gip/ ({len(csv_files)} 個檔案)...")
        for f in csv_files:
            results = scan_csv_file(str(f), "gip", supported)
            if results:
                print(f"  ⚠  {f.name}: {len(results)} 個不支援字元")
            all_results.extend(results)

    return all_results


# ─── 報告輸出 ──────────────────────────────────────────────

def deduplicate_results(results: list) -> list:
    """去重：同一個字元在同一列只出現一次"""
    seen = set()
    deduped = []
    for r in results:
        key = (r["codepoint"], r["file"], r["line"], r["column"])
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    return deduped


def write_report(results: list, output_path: str):
    """將結果寫成 CSV 報告"""
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["char", "codepoint", "file", "line", "column", "entry", "context"])
        writer.writeheader()
        writer.writerows(results)
    print(f"\n📊 報告已寫入: {output_path}")
    print(f"   共 {len(results)} 筆不支援字元記錄")


def print_summary(results: list):
    """印出摘要：按字元分組統計"""
    from collections import Counter
    char_counts = Counter((r["codepoint"], r["char"]) for r in results)
    print(f"\n{'─' * 60}")
    print(f"📋 摘要：共 {len(char_counts)} 種不支援字元")
    print(f"{'─' * 60}")
    print(f"  {'字元':<4}  {'Code Point':<10}  {'出現次數'}")
    print(f"  {'─'*4}  {'─'*10}  {'─'*8}")
    for (cp, ch), count in char_counts.most_common():
        # 用 repr 顯示不可見字元
        display = ch if ch.isprintable() else f"(PUA {cp})"
        print(f"  {display:<4}  {cp:<10}  {count}")


# ─── 主程式 ────────────────────────────────────────────────

def main():
    # 取得專案根目錄（此腳本在 scripts/ 裡）
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    data_dir = project_root / "data"

    if not data_dir.is_dir():
        print(f"錯誤：找不到 data 目錄: {data_dir}")
        sys.exit(1)

    print("=" * 60)
    print("🔍 客源翠字型支援字元檢查工具")
    print("=" * 60)
    print()

    # Step 1: 建立字型支援字元集合
    supported = build_supported_charset()

    # Step 2: 掃描所有 CSV
    results = scan_all_csvs(str(data_dir), supported)

    # Step 3: 去重 & 輸出
    results = deduplicate_results(results)

    if not results:
        print("\n✅ 恭喜！所有字元都在字型支援範圍內。")
        return

    # 按 codepoint 排序
    results.sort(key=lambda r: (r["codepoint"], r["file"], r["line"]))

    # 寫報告
    report_path = project_root / "unsupported_glyphs_report.csv"
    write_report(results, str(report_path))

    # 印摘要
    print_summary(results)


if __name__ == "__main__":
    main()
