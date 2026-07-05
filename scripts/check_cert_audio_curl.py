#!/usr/bin/env python3
"""
檢查認證詞彙音檔完整性（curl 版，可靠且高速）。

為什麼用 curl：
    aiohttp 從未安裝、urllib 在大量請求時受 macOS SSL / HEAD 限制不穩，
    導致先前的腳本把「請求失敗」誤判為「音檔不存在」（一行 `except: return False`）。
    curl 對此伺服器經實測穩定（HEAD → 200），平行 10 條約 0.2 秒/20 條。

關鍵設計：
    - 區分三種結果：found(200) / not_found(404) / ERROR(其他)。
      ERROR 絕不當成 not_found，而是大聲報出，避免重蹈覆轍。
    - 詞彙編號來源 = data/cert_114/*.csv（這次要更新到的權威清單）。
      高級無 114 ODS，沿用 data/cert/113*高.json 的編號。
    - 音檔 URL 規則見 2026-update.md「音檔 URL 完整規則」。

用法：
    python3 scripts/check_cert_audio_curl.py            # 全部
    python3 scripts/check_cert_audio_curl.py 四基       # 只跑四縣基礎級
    python3 scripts/check_cert_audio_curl.py 四基 四初  # 跑指定幾個
"""

import csv
import io
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# ==================== 配置 ====================

AUDIO_BASE_URL = "https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary"
ROOT = Path(__file__).parent.parent
CSV_114_DIR = ROOT / "data" / "cert_114"
JSON_113_DIR = ROOT / "data" / "cert"
OUT_DIR = ROOT / "data"
MAX_WORKERS = 10  # 與實測相符，平行 10 條 curl

ACCENT_MAP = {"四": "si", "海": "ha", "大": "da", "平": "rh", "安": "zh"}
ACCENT_FULL = {"四": "四縣", "海": "海陸", "大": "大埔", "平": "饒平", "安": "詔安"}
LEVEL_FULL = {"基": "基礎級", "初": "初級", "中": "中級", "中高": "中高級", "高": "高級"}

# 級別配置：目錄級、句音檔有無、檔級前綴、基礎級例外目錄
LEVEL_CONFIG = {
    "基": {"dir": "5", "prefix": "", "has_sentence": True, "alt_dir": "1"},
    "初": {"dir": "1", "prefix": "", "has_sentence": True},
    "中": {"dir": "2", "prefix": "1", "has_sentence": True},
    "中高": {"dir": "3", "prefix": "2", "has_sentence": True},
    "高": {"dir": "4", "prefix": "3", "has_sentence": False},
}

# 例外音檔（exclusions.js）：編號 -> (年度, 音檔編號)，路徑插入 w/(詞) 或 s/(句)
EXCEPTION_AUDIO = {
    "基": {"16-3": ("110", "007"), "7-13": ("110", "024")},
    "中": {"1-15": ("110", "015"), "4-156": ("110", "156")},
    "中高": {"1-2": ("110", "002"), "9-156": ("110", "156")},
    "高": {"1-205": ("110", "205"), "9-116": ("110", "116"), "9-26": ("110", "026")},
}

# 已知缺失音檔（NAmedias.js）：以「腔全名+級全名」索引
# word/sentence: True=有, False=無, "na"=不適用(高級無句)
KNOWN_MISSING = {
    "海陸中高級": {"4-261": {"word": True, "sentence": False}},
    "詔安中級": {"17-119": {"word": True, "sentence": False}},
    "詔安初級": {"18-92": {"word": False, "sentence": False}},
    "海陸高級": {"1-101": {"word": False}, "16-36": {"word": False}},
    "大埔高級": {
        "2-100": {"word": False}, "2-194": {"word": False}, "3-32": {"word": False},
        "5-103": {"word": False}, "10-217": {"word": False}, "10-543": {"word": False},
        "17-2": {"word": False},
    },
    "詔安高級": {"1-112": {"word": False}, "3-28": {"word": False}, "7-130": {"word": False}},
}


# ==================== URL 構建 ====================

def parse_entry_id(entry_id):
    """'1-1' -> ('01','001')；無法解析回 (None, None)"""
    parts = entry_id.split("-")
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return None, None
    return parts[0].zfill(2), parts[1].zfill(3)


def build_url(year, level, accent_code, category, number, *, sentence=False,
              exception=False):
    cfg = LEVEL_CONFIG[level]
    dir_level = cfg["dir"]
    prefix = cfg["prefix"]
    exc_path = ""
    if exception:
        exc_path = "s/" if sentence else "w/"
        if level == "基":
            dir_level = cfg.get("alt_dir", dir_level)
    # 初級 112 年度類別為 3 位數
    if level == "初" and year == "112":
        category = category.zfill(3)
    suffix = "s" if sentence else ""
    return (f"{AUDIO_BASE_URL}/{year}/{dir_level}/{accent_code}/"
            f"{exc_path}{prefix}{accent_code}-{category}-{number}{suffix}.mp3")


# ==================== curl 檢查 ====================

def curl_status(url):
    """回傳 (status_code:int, error:str|None)。失敗時 status=0、error 有值。"""
    try:
        out = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-I",
             "--max-time", "15", url],
            capture_output=True, text=True, timeout=20,
        )
        code = out.stdout.strip()
        if out.returncode != 0:
            return 0, f"curl rc={out.returncode} {out.stderr.strip()[:80]}"
        return int(code) if code.isdigit() else 0, (None if code.isdigit() else code)
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def check_one_url(url):
    """200 -> 'found'；404 -> 'not_found'；其他/錯誤 -> 'ERROR:...'（絕不靜默吞掉）"""
    code, err = curl_status(url)
    if code == 200:
        return "found"
    if code == 404:
        return "not_found"
    return f"ERROR:{code or err}"


# ==================== 單一詞彙檢查 ====================

def check_entry(entry_id, accent, level):
    """回傳該詞彙的詞/句音檔檢查結果 dict。"""
    accent_code = ACCENT_MAP[accent]
    category, number = parse_entry_id(entry_id)
    full_name = ACCENT_FULL[accent] + LEVEL_FULL[level]
    cfg = LEVEL_CONFIG[level]
    result = {"entry_id": entry_id}

    if category is None:
        result["error"] = "無法解析編號"
        return result

    known = KNOWN_MISSING.get(full_name, {}).get(entry_id, {})
    exc = EXCEPTION_AUDIO.get(level, {}).get(entry_id)

    # ---- 詞音檔 ----
    if "word" in known and known["word"] is False:
        result["word"] = {"status": "known_missing"}
    elif exc:
        exc_year, exc_num = exc
        url = build_url(exc_year, level, accent_code, category, exc_num,
                        exception=True)
        result["word"] = {"year": exc_year, "url": url, "result": check_one_url(url),
                          "exception": True}
    else:
        # 標準：先試 114，缺則 fallback 112
        url114 = build_url("114", level, accent_code, category, number)
        r = check_one_url(url114)
        if r == "found":
            result["word"] = {"year": "114", "url": url114, "result": "found"}
        else:
            url112 = build_url("112", level, accent_code, category, number)
            r112 = check_one_url(url112)
            result["word"] = {"year": "112", "url": url112, "result": r112,
                              "_114": r}  # 記錄 114 為何沒中（not_found / ERROR）

    # ---- 句音檔 ----
    if not cfg["has_sentence"]:
        result["sentence"] = {"status": "level_na"}
    elif "sentence" in known and known["sentence"] is False:
        result["sentence"] = {"status": "known_missing"}
    elif exc:
        exc_year, exc_num = exc
        url = build_url(exc_year, level, accent_code, category, exc_num,
                        sentence=True, exception=True)
        result["sentence"] = {"year": exc_year, "url": url,
                              "result": check_one_url(url), "exception": True}
    else:
        url114 = build_url("114", level, accent_code, category, number, sentence=True)
        r = check_one_url(url114)
        if r == "found":
            result["sentence"] = {"year": "114", "url": url114, "result": "found"}
        else:
            url112 = build_url("112", level, accent_code, category, number,
                               sentence=True)
            r112 = check_one_url(url112)
            result["sentence"] = {"year": "112", "url": url112, "result": r112,
                                  "_114": r}
    return result


# ==================== 載入詞彙編號 ====================

# 佔位列：CSV 列存在但無實際詞條，無音檔屬正常，須跳過
#   - 詞彙欄為「此腔無此詞條」（289 列）
#   - 編號欄為「此級無此單元」（5 列，本身就不是合法編號）
PLACEHOLDER_WORD = "此腔無此詞條"
PLACEHOLDER_ID = "此級無此單元"


def _word_of(row):
    """取一列的詞彙本體（欄名各檔略異，取第二欄最穩）。"""
    vals = list(row.values())
    return (vals[1] if len(vals) > 1 else "").strip()


def load_entry_ids(accent, level):
    """回傳 [(編號, 是否佔位)]。114 CSV 取編號；高級無 114，改讀 113 JSON。"""
    if level == "高":
        jf = JSON_113_DIR / f"113{accent}高.json"
        if not jf.exists():
            return None
        reader = csv.DictReader(io.StringIO(
            json.loads(jf.read_text(encoding="utf-8"))["content"]))
    else:
        cf = CSV_114_DIR / f"114{accent}{level}.csv"
        if not cf.exists():
            return None
        reader = csv.DictReader(cf.open(encoding="utf-8"))
    out = []
    for row in reader:
        eid = row.get("編號", "").strip()
        if not eid or eid == PLACEHOLDER_ID:
            continue
        out.append((eid, _word_of(row) == PLACEHOLDER_WORD))
    return out


# ==================== 主流程 ====================

def check_file(accent, level):
    rows = load_entry_ids(accent, level)
    name = f"{accent}{level}"
    if rows is None:
        print(f"  [跳過] {name}：找不到來源檔")
        return None
    real = [eid for eid, ph in rows if not ph]
    placeholder = sum(1 for _, ph in rows if ph)
    print(f"  檢查 {name}（{len(real)} 詞"
          + (f"，跳過 {placeholder} 佔位列" if placeholder else "") + "）...",
          end="", flush=True)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        results = list(ex.map(lambda eid: check_entry(eid, accent, level), real))

    summary = {"total": len(results), "placeholder": placeholder,
               "word_ok": 0, "word_missing": 0,
               "word_error": 0, "sent_ok": 0, "sent_missing": 0,
               "sent_error": 0, "sent_na": 0, "year114": 0}
    for r in results:
        w = r.get("word", {})
        if w.get("result") == "found" or w.get("status") == "known_missing":
            if w.get("result") == "found":
                summary["word_ok"] += 1
                if w.get("year") == "114":
                    summary["year114"] += 1
            else:
                summary["word_missing"] += 1
        elif w.get("result", "").startswith("ERROR"):
            summary["word_error"] += 1
        else:
            summary["word_missing"] += 1
        s = r.get("sentence", {})
        if s.get("status") in ("level_na",):
            summary["sent_na"] += 1
        elif s.get("status") == "known_missing":
            summary["sent_missing"] += 1
        elif s.get("result") == "found":
            summary["sent_ok"] += 1
        elif s.get("result", "").startswith("ERROR"):
            summary["sent_error"] += 1
        else:
            summary["sent_missing"] += 1

    err = summary["word_error"] + summary["sent_error"]
    flag = f"  ⚠️ {err} 個請求錯誤!" if err else ""
    print(f" 詞OK {summary['word_ok']}（114:{summary['year114']}）"
          f"／缺 {summary['word_missing']}；句OK {summary['sent_ok']}"
          f"／缺 {summary['sent_missing']}{flag}")
    return {"file": name, "accent": accent, "level": level,
            "summary": summary, "entries": results}


def main():
    targets = sys.argv[1:]
    accents = ["四", "海", "大", "平", "安"]
    levels = ["基", "初", "中", "中高", "高"]
    all_files = [(a, l) for a in accents for l in levels]
    if targets:
        all_files = [(a, l) for (a, l) in all_files if f"{a}{l}" in targets]
        if not all_files:
            print(f"找不到符合的目標：{targets}")
            print("格式範例：四基 海初 安高")
            return

    print(f"開始檢查 {len(all_files)} 個檔案（curl 平行 {MAX_WORKERS}）\n")
    all_results = []
    for accent, level in all_files:
        res = check_file(accent, level)
        if res:
            all_results.append(res)

    out = {"files": all_results}
    out_json = OUT_DIR / "cert_audio_check_results.json"
    out_json.write_text(json.dumps(out, ensure_ascii=False, indent=2),
                        encoding="utf-8")
    print(f"\n結果已寫入 {out_json.relative_to(ROOT)}")

    # 全域摘要：列出有問題的詞彙（缺音檔 + 請求錯誤）
    print("\n" + "=" * 60 + "\n總結\n" + "=" * 60)
    total_err = 0
    for res in all_results:
        s = res["summary"]
        miss = s["word_missing"] + s["sent_missing"]
        err = s["word_error"] + s["sent_error"]
        total_err += err
        status = "✅" if (miss == 0 and err == 0) else "⚠️"
        print(f"{status} {res['file']:6} 詞 {s['word_ok']}/{s['total']}"
              f"（114:{s['year114']}）缺{s['word_missing']} 句缺{s['sent_missing']}"
              + (f" ❗錯誤{err}" if err else ""))
    if total_err:
        print(f"\n❗ 共 {total_err} 個請求發生錯誤（非 200/404），"
              f"這些不是『音檔缺失』，是網路/伺服器問題，需重跑或排查。")


if __name__ == "__main__":
    main()
