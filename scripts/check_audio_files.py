#!/usr/bin/env python3
"""
檢查所有認證詞彙音檔是否存在
根據編號自動構建 114、113、112 年度音檔 URL 並檢查可用性
"""

import json
import os
import sys
from pathlib import Path
import urllib.request
import urllib.error
from typing import Dict, List, Tuple
import time

# 音檔 URL 基礎路徑
AUDIO_BASE_URL = "https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary"

# 腔調對應
ACCENT_MAP = {
    "四": "si",
    "海": "hai",
    "大": "da",
    "平": "rao",  # 饒平
    "安": "zhao",  # 詔安
}

# 級別對應
LEVEL_MAP = {
    "基": "5",  # 基礎級
    "初": "1",  # 初級
    "中": "2",  # 中級
    "中高": "3",  # 中高級
    "高": "4",  # 高級
}


def parse_entry_id(entry_id: str) -> Tuple[str, str]:
    """
    解析詞彙編號，例如 "1-1" -> ("01", "001")
    """
    parts = entry_id.split("-")
    if len(parts) == 2:
        category = parts[0].zfill(2)
        number = parts[1].zfill(3)
        return category, number
    return None, None


def build_audio_url(year: str, level: str, accent: str, category: str, number: str) -> str:
    """
    構建音檔 URL
    例如: https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/114/5/si/si-01-001.mp3
    """
    return f"{AUDIO_BASE_URL}/{year}/{level}/{accent}/{accent}-{category}-{number}.mp3"


def check_url_exists(url: str, timeout: int = 5) -> bool:
    """
    檢查 URL 是否存在（使用 HEAD 請求）
    """
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status == 200
    except (urllib.error.URLError, urllib.error.HTTPError):
        return False
    except Exception as e:
        print(f"檢查 {url} 時發生錯誤: {e}", file=sys.stderr)
        return False


def load_json_data(json_path: str) -> List[str]:
    """
    從 JSON 檔案載入資料並提取所有詞彙編號
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    content = data.get("content", "")
    lines = content.strip().split("\n")

    # 跳過標題行
    entry_ids = []
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) > 0:
            entry_id = parts[0].strip()
            if entry_id and "-" in entry_id:
                entry_ids.append(entry_id)

    return entry_ids


def check_audio_for_file(json_path: str, years: List[str] = ["114", "113", "112"]) -> Dict:
    """
    檢查單一檔案的所有音檔
    """
    filename = Path(json_path).stem

    # 解析檔名，例如 "113四基" -> year=113, accent=四, level=基
    if not filename[:3].isdigit():
        return None

    year_from_file = filename[:3]
    accent_char = filename[3] if len(filename) > 3 else None
    level_chars = filename[4:] if len(filename) > 4 else None

    if accent_char not in ACCENT_MAP or level_chars not in LEVEL_MAP:
        print(f"無法解析檔名: {filename}")
        return None

    accent = ACCENT_MAP[accent_char]
    level = LEVEL_MAP[level_chars]

    # 載入編號
    entry_ids = load_json_data(json_path)

    print(f"\n檢查 {filename} ({len(entry_ids)} 個詞彙)...")

    results = {
        "file": filename,
        "accent": accent_char,
        "level": level_chars,
        "total_entries": len(entry_ids),
        "checked": {},
    }

    # 對每個編號檢查不同年度的音檔
    for i, entry_id in enumerate(entry_ids, 1):
        category, number = parse_entry_id(entry_id)
        if not category or not number:
            continue

        entry_results = {}
        for year in years:
            url = build_audio_url(year, level, accent, category, number)
            exists = check_url_exists(url)
            entry_results[year] = {"url": url, "exists": exists}

            # 加入延遲避免請求過快
            time.sleep(0.1)

        results["checked"][entry_id] = entry_results

        # 每 10 個詞彙顯示進度
        if i % 10 == 0:
            print(f"  已檢查 {i}/{len(entry_ids)} 個詞彙...")

    return results


def generate_report(all_results: List[Dict]) -> str:
    """
    生成檢查報告
    """
    report = []
    report.append("=" * 80)
    report.append("認證詞彙音檔檢查報告")
    report.append("=" * 80)
    report.append("")

    total_entries = 0
    total_issues = 0

    for result in all_results:
        if not result:
            continue

        filename = result["file"]
        accent = result["accent"]
        level = result["level"]
        entries_count = result["total_entries"]

        report.append(f"\n【{filename}】（{accent}腔 {level}）")
        report.append(f"總詞彙數: {entries_count}")

        total_entries += entries_count

        # 統計各年度可用音檔數
        year_stats = {"114": 0, "113": 0, "112": 0}
        missing_all = []

        for entry_id, year_results in result["checked"].items():
            found_any = False
            for year, info in year_results.items():
                if info["exists"]:
                    year_stats[year] += 1
                    found_any = True

            if not found_any:
                missing_all.append(entry_id)

        report.append(f"  114 年度音檔: {year_stats['114']}/{entries_count}")
        report.append(f"  113 年度音檔: {year_stats['113']}/{entries_count}")
        report.append(f"  112 年度音檔: {year_stats['112']}/{entries_count}")

        if missing_all:
            total_issues += len(missing_all)
            report.append(f"  ⚠️  完全找不到音檔的詞彙: {len(missing_all)} 個")
            report.append(f"     編號: {', '.join(missing_all[:10])}")
            if len(missing_all) > 10:
                report.append(f"           （還有 {len(missing_all) - 10} 個...）")

    report.append("")
    report.append("=" * 80)
    report.append(f"總計: {total_entries} 個詞彙")
    report.append(f"問題數: {total_issues} 個詞彙完全找不到音檔")
    report.append("=" * 80)

    return "\n".join(report)


def main():
    # 資料目錄
    data_dir = Path(__file__).parent.parent / "data" / "cert"

    if not data_dir.exists():
        print(f"錯誤: 資料目錄不存在: {data_dir}")
        sys.exit(1)

    # 找出所有 JSON 檔案
    json_files = sorted(data_dir.glob("113*.json"))

    if not json_files:
        print(f"錯誤: 在 {data_dir} 中找不到 113*.json 檔案")
        sys.exit(1)

    print(f"找到 {len(json_files)} 個檔案")
    print("開始檢查音檔...")

    all_results = []
    for json_file in json_files:
        result = check_audio_for_file(str(json_file))
        if result:
            all_results.append(result)

    # 生成報告
    report = generate_report(all_results)
    print("\n" + report)

    # 儲存報告
    report_path = data_dir.parent / "cert_audio_check_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\n報告已儲存至: {report_path}")

    # 儲存完整結果為 JSON
    results_path = data_dir.parent / "cert_audio_check_results.json"
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print(f"完整結果已儲存至: {results_path}")


if __name__ == "__main__":
    main()
