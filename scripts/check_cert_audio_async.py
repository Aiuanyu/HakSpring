#!/usr/bin/env python3
"""
檢查認證詞彙音檔完整性（異步高速版）
使用 asyncio + aiohttp 實現並發檢查，速度比同步版快 20-50 倍
"""

import json
import sys
import asyncio
import ssl
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import aiohttp

# ==================== 配置 ====================

AUDIO_BASE_URL = "https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary"

# 腔調對應
ACCENT_MAP = {
    "四": "si",
    "海": "ha",
    "大": "da",
    "平": "rh",
    "安": "zh",
}

# 級別配置
LEVEL_CONFIG = {
    "基": {"目錄級": "5", "目錄另級": "1", "檔級": ""},
    "初": {"目錄級": "1", "檔級": ""},
    "中": {"目錄級": "2", "檔級": "1"},
    "中高": {"目錄級": "3", "檔級": "2"},
    "高": {"目錄級": "4", "檔級": "3"},
}

# 例外音檔
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

# 已知缺失音檔
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
    """解析詞彙編號"""
    parts = entry_id.split("-")
    if len(parts) == 2:
        category = parts[0].zfill(2)
        number = parts[1].zfill(3)
        return category, number
    return None, None


async def check_url_exists(session: aiohttp.ClientSession, url: str) -> bool:
    """異步檢查 URL 是否存在"""
    try:
        async with session.head(url, timeout=aiohttp.ClientTimeout(total=5)) as response:
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
    """構建音檔 URL"""
    exception_path = ""
    if is_exception:
        exception_path = "w/" if not is_sentence else "s/"

    sentence_suffix = "s" if is_sentence else ""
    url = f"{AUDIO_BASE_URL}/{year}/{level}/{accent}/{exception_path}{level_prefix}{accent}-{category}-{number}{sentence_suffix}.mp3"
    return url


async def check_entry_audio(
    session: aiohttp.ClientSession,
    entry_id: str,
    accent: str,
    level: str,
    level_name: str,
) -> Dict:
    """異步檢查單一詞彙的音檔"""
    category, number = parse_entry_id(entry_id)
    if not category or not number:
        return {"entry_id": entry_id, "error": "Invalid entry ID"}

    config = LEVEL_CONFIG.get(level, {})
    dir_level = config.get("目錄級", "")
    level_prefix = config.get("檔級", "")
    alt_level = config.get("目錄另級")

    # 檢查例外
    exceptions = EXCEPTION_AUDIO.get(level, [])
    exception_data = None
    for exc_id, exc_year, exc_num in exceptions:
        if exc_id == entry_id:
            exception_data = (exc_year, exc_num)
            break

    # 檢查已知缺失
    full_name = f"{ACCENT_MAP.get(accent, '')}{level_name}"
    missing_info = KNOWN_MISSING.get(full_name, {}).get(entry_id)

    result = {"entry_id": entry_id}

    # === 檢查詞音檔 ===
    if missing_info and missing_info.get("word") == False:
        result["word"] = {"status": "known_missing"}
    elif exception_data:
        exc_year, exc_num = exception_data
        exc_level = alt_level if alt_level else dir_level
        url = build_audio_url(
            exc_year, exc_level, ACCENT_MAP[accent],
            level_prefix, category, exc_num.zfill(3),
            is_sentence=False, is_exception=True
        )
        exists = await check_url_exists(session, url)
        result["word"] = {"year": exc_year, "url": url, "exists": exists}
    else:
        # 標準檢查：114 -> 112
        found = False

        # 114 年度
        if level in ["基", "初"]:
            url = build_audio_url(
                "114", dir_level, ACCENT_MAP[accent],
                level_prefix, category, number
            )
            exists = await check_url_exists(session, url)
            if exists:
                result["word"] = {"year": "114", "url": url, "exists": True}
                found = True

        # 112 年度（fallback）
        if not found:
            if level == "初":
                category_112 = category[0].zfill(3)
            else:
                category_112 = category

            url = build_audio_url(
                "112", dir_level, ACCENT_MAP[accent],
                level_prefix, category_112, number
            )
            exists = await check_url_exists(session, url)
            result["word"] = {"year": "112", "url": url, "exists": exists}

    # === 檢查句音檔 ===
    if level == "高":
        result["sentence"] = {"status": "level_na"}
    elif missing_info and missing_info.get("sentence") == False:
        result["sentence"] = {"status": "known_missing"}
    elif missing_info and missing_info.get("sentence") == "na":
        result["sentence"] = {"status": "known_na"}
    elif exception_data:
        exc_year, exc_num = exception_data
        exc_level = alt_level if alt_level else dir_level
        url = build_audio_url(
            exc_year, exc_level, ACCENT_MAP[accent],
            level_prefix, category, exc_num.zfill(3),
            is_sentence=True, is_exception=True
        )
        exists = await check_url_exists(session, url)
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
            exists = await check_url_exists(session, url)
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
            exists = await check_url_exists(session, url)
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


async def check_file(json_path: str, max_concurrent: int = 50) -> Dict:
    """異步檢查單一檔案的所有音檔"""
    filename = Path(json_path).stem

    # 解析檔名
    if not filename[:3].isdigit():
        return {"error": "Invalid filename"}

    accent_char = filename[3] if len(filename) > 3 else None
    level_chars = filename[4:] if len(filename) > 4 else None

    if accent_char not in ACCENT_MAP or level_chars not in LEVEL_CONFIG:
        return {"error": f"Unknown accent/level: {accent_char}/{level_chars}"}

    # 載入編號
    entry_ids = load_json_data(json_path)
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

    # 創建 SSL context（跳過證書驗證）
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    # 創建連接器和會話
    connector = aiohttp.TCPConnector(ssl=ssl_context, limit=max_concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        # 創建所有檢查任務
        tasks = [
            check_entry_audio(session, entry_id, accent_char, level_chars, level_chars)
            for entry_id in entry_ids
        ]

        # 批次執行並顯示進度
        completed = 0
        for coro in asyncio.as_completed(tasks):
            result = await coro
            results["entries"].append(result)

            status = result.get("status", "unknown")
            results["summary"][status] = results["summary"].get(status, 0) + 1

            completed += 1
            if completed % 10 == 0 or completed == len(entry_ids):
                print(f"  已檢查 {completed}/{len(entry_ids)} 個詞彙...", flush=True)

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
        for entry in problems[:20]:
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


async def main():
    """主函數"""
    # 測試單一檔案
    test_file = Path(__file__).parent.parent / "data" / "cert" / "113四基.json"

    if not test_file.exists():
        print(f"錯誤: 找不到測試檔案: {test_file}")
        sys.exit(1)

    print(f"開始檢查: {test_file.name}")
    print("=" * 80)

    # 執行檢查
    results = await check_file(str(test_file), max_concurrent=50)

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
    # 安裝依賴：pip install aiohttp
    try:
        import aiohttp
    except ImportError:
        print("錯誤: 需要安裝 aiohttp 套件")
        print("請執行: pip install aiohttp")
        sys.exit(1)

    asyncio.run(main())
