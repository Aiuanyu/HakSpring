#!/usr/bin/env python3
"""
檢查認證詞彙音檔完整性
根據完整的音檔 URL 規則檢查 114/112 年度音檔可用性
"""

import json
import sys
import time
import urllib.request
import urllib.error
import ssl
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Create SSL context that doesn't verify certificates
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# ==================== 配置 ====================

AUDIO_BASE_URL = "https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary"

# 腔調對應（來自 main.js:372）
ACCENT_MAP = {
    "四": "si",
    "海": "ha",
    "大": "da",
    "平": "rh",
    "安": "zh",
}

# 級別配置（來自 main.js:380）
LEVEL_CONFIG = {
    "基": {"目錄級": "5", "目錄另級": "1", "檔級": ""},
    "初": {"目錄級": "1", "檔級": ""},
    "中": {"目錄級": "2", "檔級": "1"},
    "中高": {"目錄級": "3", "檔級": "2"},
    "高": {"目錄級": "4", "檔級": "3"},
}

# 例外音檔（來自 exclusions.js）
EXCEPTION_AUDIO = {
    "基": [
        ("16-3", "110", "007"),
        ("7-13", "110", "024"),
    ],
    "初": [],
    "中": [
        ("1-15", "110", "015"),
        ("4-156", "110", "156"),
    ],
    "中高": [
        ("1-2", "110", "002"),
        ("9-156", "110", "156"),
    ],
    "高": [
        ("1-205", "110", "205"),
        ("9-116", "110", "116"),
        ("9-26", "110", "026"),
    ],
}

# 已知缺失音檔（來自 NAmedias.js）
KNOWN_MISSING = {
    "海陸中高級": {
        "4-261": {"word": True, "sentence": False},
    },
    "詔安中級": {
        "17-119": {"word": True, "sentence": False},
    },
    "詔安初級": {
        "18-92": {"word": False, "sentence": False},
    },
    "海陸高級": {
        "1-101": {"word": False, "sentence": "na"},
        "16-36": {"word": False, "sentence": "na"},
    },
    "大埔高級": {
        "2-100": {"word": False, "sentence": "na"},
        "2-194": {"word": False, "sentence": "na"},
        "3-32": {"word": False, "sentence": "na"},
        "5-103": {"word": False, "sentence": "na"},
        "10-217": {"word": False, "sentence": "na"},
        "10-543": {"word": False, "sentence": "na"},
        "17-2": {"word": False, "sentence": "na"},
    },
    "詔安高級": {
        "1-112": {"word": False, "sentence": "na"},
        "3-28": {"word": False, "sentence": "na"},
        "7-130": {"word": False, "sentence": "na"},
    },
}


# ==================== 工具函數 ====================

def parse_entry_id(entry_id: str) -> Tuple[str, str]:
    """解析詞彙編號，例如 "1-1" -> ("01", "001")"""
    parts = entry_id.split("-")
    if len(parts) == 2:
        category = parts[0].zfill(2)
        number = parts[1].zfill(3)
        return category, number
    return None, None


def check_url_exists(url: str, timeout: int = 5) -> bool:
    """檢查 URL 是否存在（使用 HEAD 請求）"""
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_context) as response:
            return response.status == 200
    except:
        return False


def build_audio_url(
    year: str,
    level: str,
    accent: str,
    level_prefix: str,
    category: str,
    number: str,
    is_sentence: bool = False,
    is_exception: bool = False,
) -> str:
    """
    構建音檔 URL

    參數:
        year: 年度（114, 112, 110）
        level: 目錄級（1, 2, 3, 4, 5）
        accent: 腔調（si, ha, da, rh, zh）
        level_prefix: 檔級前綴（'', '1', '2', '3'）
        category: 類別編號（01, 02, ...）
        number: 詞彙編號（001, 002, ...）
        is_sentence: 是否為句音檔
        is_exception: 是否為例外音檔
    """
    # 例外音檔路徑插入
    exception_path = ""
    if is_exception:
        exception_path = "w/" if not is_sentence else "s/"

    # 句音檔後綴
    sentence_suffix = "s" if is_sentence else ""

    # 構建 URL
    url = f"{AUDIO_BASE_URL}/{year}/{level}/{accent}/{exception_path}{level_prefix}{accent}-{category}-{number}{sentence_suffix}.mp3"
    return url


def check_entry_audio(
    entry_id: str,
    accent: str,
    level: str,
    level_name: str,
) -> Dict:
    """
    檢查單一詞彙的音檔

    返回格式:
    {
        "entry_id": "1-1",
        "word": {"year": "114", "url": "...", "exists": True},
        "sentence": {"year": "114", "url": "...", "exists": True},
        "status": "ok" | "word_missing" | "sentence_missing" | "both_missing"
    }
    """
    # 解析編號
    category, number = parse_entry_id(entry_id)
    if not category or not number:
        return {"entry_id": entry_id, "error": "Invalid entry ID"}

    # 獲取級別配置
    config = LEVEL_CONFIG.get(level, {})
    dir_level = config.get("目錄級", "")
    level_prefix = config.get("檔級", "")
    alt_level = config.get("目錄另級")

    # 檢查是否為例外音檔
    exceptions = EXCEPTION_AUDIO.get(level, [])
    exception_data = None
    for exc_id, exc_year, exc_num in exceptions:
        if exc_id == entry_id:
            exception_data = (exc_year, exc_num)
            break

    # 檢查是否為已知缺失
    full_name = f"{ACCENT_MAP.get(accent, '')}{level_name}"
    missing_info = KNOWN_MISSING.get(full_name, {}).get(entry_id)

    result = {"entry_id": entry_id}

    # === 檢查詞音檔 ===
    if missing_info and missing_info.get("word") == False:
        result["word"] = {"status": "known_missing"}
    elif exception_data:
        # 例外音檔
        exc_year, exc_num = exception_data
        exc_level = alt_level if alt_level else dir_level
        url = build_audio_url(
            exc_year, exc_level, ACCENT_MAP[accent],
            level_prefix, category, exc_num.zfill(3),
            is_sentence=False, is_exception=True
        )
        exists = check_url_exists(url)
        result["word"] = {"year": exc_year, "url": url, "exists": exists}
    else:
        # 標準檢查：114 -> 112
        found = False

        # 114 年度
        if level in ["基", "初"]:
            # 初級 114 使用標準 2 位類別編號
            url = build_audio_url(
                "114", dir_level, ACCENT_MAP[accent],
                level_prefix, category, number
            )
            exists = check_url_exists(url)
            if exists:
                result["word"] = {"year": "114", "url": url, "exists": True}
                found = True

        # 112 年度（fallback）
        if not found:
            # 初級 112 使用 3 位類別編號
            if level == "初":
                category_112 = category[0].zfill(3)  # 01 -> 001
            else:
                category_112 = category

            url = build_audio_url(
                "112", dir_level, ACCENT_MAP[accent],
                level_prefix, category_112, number
            )
            exists = check_url_exists(url)
            result["word"] = {"year": "112", "url": url, "exists": exists}

    # === 檢查句音檔 ===
    # 高級無句音檔
    if level == "高":
        result["sentence"] = {"status": "level_na"}
    elif missing_info and missing_info.get("sentence") == False:
        result["sentence"] = {"status": "known_missing"}
    elif missing_info and missing_info.get("sentence") == "na":
        result["sentence"] = {"status": "known_na"}
    elif exception_data:
        # 例外音檔
        exc_year, exc_num = exception_data
        exc_level = alt_level if alt_level else dir_level
        url = build_audio_url(
            exc_year, exc_level, ACCENT_MAP[accent],
            level_prefix, category, exc_num.zfill(3),
            is_sentence=True, is_exception=True
        )
        exists = check_url_exists(url)
        result["sentence"] = {"year": exc_year, "url": url, "exists": exists}
    else:
        # 標準檢查：114 -> 112
        found = False

        # 114 年度
        if level in ["基", "初"]:
            url = build_audio_url(
                "114", dir_level, ACCENT_MAP[accent],
                level_prefix, category, number,
                is_sentence=True
            )
            exists = check_url_exists(url)
            if exists:
                result["sentence"] = {"year": "114", "url": url, "exists": True}
                found = True

        # 112 年度（fallback）
        if not found:
            if level == "初":
                category_112 = category[0].zfill(3)
            else:
                category_112 = category

            url = build_audio_url(
                "112", dir_level, ACCENT_MAP[accent],
                level_prefix, category_112, number,
                is_sentence=True
            )
            exists = check_url_exists(url)
            result["sentence"] = {"year": "112", "url": url, "exists": exists}

    # 判斷狀態
    word_ok = result.get("word", {}).get("exists") or result.get("word", {}).get("status") == "known_missing"
    sentence_ok = (
        result.get("sentence", {}).get("exists") or
        result.get("sentence", {}).get("status") in ["known_missing", "level_na", "known_na"]
    )

    if word_ok and sentence_ok:
        result["status"] = "ok"
    elif not word_ok and not sentence_ok:
        result["status"] = "both_missing"
    elif not word_ok:
        result["status"] = "word_missing"
    else:
        result["status"] = "sentence_missing"

    return result


def load_json_data(json_path: str) -> List[str]:
    """從 JSON 檔案載入詞彙編號"""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    content = data.get("content", "")
    lines = content.strip().split("\n")

    entry_ids = []
    for line in lines[1:]:  # 跳過標題
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) > 0:
            entry_id = parts[0].strip()
            if entry_id and "-" in entry_id:
                entry_ids.append(entry_id)

    return entry_ids


def check_file(json_path: str) -> Dict:
    """檢查單一檔案的所有音檔"""
    print(f"check_file called with: {json_path}", flush=True)
    filename = Path(json_path).stem
    print(f"Filename parsed: {filename}", flush=True)

    # 解析檔名，例如 "113四基" -> accent=四, level=基
    if not filename[:3].isdigit():
        return {"error": "Invalid filename"}

    accent_char = filename[3] if len(filename) > 3 else None
    level_chars = filename[4:] if len(filename) > 4 else None
    print(f"Accent: {accent_char}, Level: {level_chars}", flush=True)

    if accent_char not in ACCENT_MAP or level_chars not in LEVEL_CONFIG:
        return {"error": f"Unknown accent/level: {accent_char}/{level_chars}"}

    # 載入編號
    print("Loading entry IDs...", flush=True)
    entry_ids = load_json_data(json_path)
    print(f"Loaded {len(entry_ids)} entry IDs", flush=True)

    print(f"\n檢查 {filename} ({len(entry_ids)} 個詞彙)...")

    results = {
        "file": filename,
        "accent": accent_char,
        "level": level_chars,
        "total_entries": len(entry_ids),
        "entries": [],
        "summary": {
            "ok": 0,
            "word_missing": 0,
            "sentence_missing": 0,
            "both_missing": 0,
        }
    }

    # TEST: Only check first 50 entries for faster testing
    test_limit = min(50, len(entry_ids))
    print(f"TEST MODE: Checking only first {test_limit} entries", flush=True)

    for i, entry_id in enumerate(entry_ids[:test_limit], 1):
        if i == 1:
            print(f"Starting check for first entry: {entry_id}", flush=True)
        result = check_entry_audio(entry_id, accent_char, level_chars, level_chars)
        if i == 1:
            print(f"First entry result: {result}", flush=True)
        results["entries"].append(result)

        status = result.get("status", "unknown")
        results["summary"][status] = results["summary"].get(status, 0) + 1

        # 進度顯示
        if i % 10 == 0:
            print(f"  已檢查 {i}/{test_limit} 個詞彙...", flush=True)

        # 延遲避免請求過快（reduced for testing)
        time.sleep(0.05)

    return results


def generate_report(results: Dict) -> str:
    """生成檢查報告"""
    report = []
    report.append("=" * 80)
    report.append(f"【{results['file']}】音檔檢查報告")
    report.append("=" * 80)
    report.append("")
    report.append(f"檔案: {results['file']}")
    report.append(f"腔調: {results['accent']}")
    report.append(f"級別: {results['level']}")
    report.append(f"總詞彙數: {results['total_entries']}")
    report.append("")
    report.append("檢查結果:")
    report.append(f"  ✓ 完全正常: {results['summary']['ok']}")
    report.append(f"  ⚠ 缺詞音檔: {results['summary']['word_missing']}")
    report.append(f"  ⚠ 缺句音檔: {results['summary']['sentence_missing']}")
    report.append(f"  ✗ 全部缺失: {results['summary']['both_missing']}")

    # 列出問題詞彙
    problems = [e for e in results["entries"] if e.get("status") != "ok"]
    if problems:
        report.append("")
        report.append(f"問題詞彙 ({len(problems)} 個):")
        for entry in problems[:20]:  # 最多顯示 20 個
            report.append(f"  {entry['entry_id']}: {entry.get('status')}")
            if entry.get('word'):
                report.append(f"    詞: {entry['word']}")
            if entry.get('sentence'):
                report.append(f"    句: {entry['sentence']}")

        if len(problems) > 20:
            report.append(f"  ... 還有 {len(problems) - 20} 個問題詞彙")

    report.append("")
    report.append("=" * 80)

    return "\n".join(report)


def main():
    print("Main function started!", flush=True)
    # 測試單一檔案：四縣基礎級
    test_file = Path(__file__).parent.parent / "data" / "cert" / "113四基.json"
    print(f"Test file path resolved: {test_file}", flush=True)

    if not test_file.exists():
        print(f"錯誤: 找不到測試檔案: {test_file}")
        sys.exit(1)

    print(f"開始檢查: {test_file.name}")
    print("=" * 80)

    # 執行檢查
    print("About to call check_file...", flush=True)
    results = check_file(str(test_file))
    print("check_file returned", flush=True)

    # 生成報告
    report = generate_report(results)
    print("\n" + report)

    # 儲存結果
    output_dir = test_file.parent.parent
    report_path = output_dir / "cert_audio_check_report.txt"
    results_path = output_dir / "cert_audio_check_results.json"

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n報告已儲存至: {report_path}")
    print(f"完整結果已儲存至: {results_path}")


if __name__ == "__main__":
    print("Script started!", flush=True)
    import sys
    sys.stdout.flush()
    main()
