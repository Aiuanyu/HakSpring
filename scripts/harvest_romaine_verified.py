#!/usr/bin/env python3
from __future__ import annotations

"""
harvest_romaine_verified.py
將匯出的 `romaine-verified-*.json` 自動收割並合併進 `data/romaine/verified_sentences.json`：
  1. 正規化腔調代碼（sixian→xiien、zhaoan→zhioon 等，含 cert_ref.dialect）。
  2. 預設僅收錄含 `cert_ref` 的詞條，略過自由輸入測試句（可用 --include-free-text 覆寫）。
  3. 依 (dialect, cert_ref.level, cert_ref.id) 與 (dialect, pure_cjk(han)) 進行
     updated_at Last-Write-Wins 去重合併；缺少 status 時補為 "verified"。
  4. 若有實際變更，自動更新 `js/romaine-table-overlay.js` 的 `verified_sentences.json?v=YYYYMMDD` 快取版號。
  5. 可搭配 `--eval` 執行 `scripts/eval_romaine.py` 驗證基準分數。
"""
import argparse
import datetime as dt
import glob
import json
import os
import re
import subprocess
import sys
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.dirname(SCRIPT_DIR)
DEFAULT_EXPORT_DIR = "/Users/gjrobert/NAS/Obsidian/Main/!暫存/Romaine"

DIALECT_ALIAS = {
    "sixian": "xiien",
    "nansixian": "namxiian",
    "hailu": "hoiliug",
    "dapu": "taibu",
    "raoping": "ngiaupin",
    "zhaoan": "zhioon",
}

CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\U00020000-\U0002ebef]")


def norm_dialect(d: str | None) -> str:
    d = (d or "").strip()
    return DIALECT_ALIAS.get(d, d or "xiien")


def pure_cjk(s: str | None) -> str:
    return "".join(CJK_RE.findall(s or ""))


def parse_ts(iso_str: str | None) -> float:
    if not iso_str:
        return 0.0
    try:
        s = iso_str.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return dt.datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0.0


def normalize_item(raw: dict) -> dict:
    item = dict(raw)
    cr = item.get("cert_ref")
    if isinstance(cr, dict):
        cr = dict(cr)
        d = norm_dialect(cr.get("dialect") or item.get("dialect"))
        is_cert = cr.get("sourceType") == "cert" or (not cr.get("sourceType") and bool(cr.get("level")))
        if is_cert and d == "namxiian":
            d = "xiien"
        cr["dialect"] = d
        item["cert_ref"] = cr
        item["dialect"] = d
    else:
        item["dialect"] = norm_dialect(item.get("dialect"))
    if not item.get("status"):
        item["status"] = "verified"
    return item


def item_keys(item: dict) -> tuple[tuple | None, tuple | None]:
    d = norm_dialect(item.get("dialect"))
    cr = item.get("cert_ref")
    cert_key = None
    if isinstance(cr, dict) and cr.get("id"):
        cert_key = (d, str(cr.get("level") or ""), str(cr.get("id")))
    cjk = pure_cjk(item.get("han"))
    cjk_key = (d, cjk) if cjk else None
    return cert_key, cjk_key


def merge_items(
    existing: list[dict],
    incoming: list[dict],
    include_free_text: bool = False,
) -> tuple[list[dict], dict]:
    merged: list[dict] = []
    by_cert: dict[tuple, int] = {}
    by_cjk: dict[tuple, int] = {}

    def register(idx: int, it: dict) -> None:
        ck, jk = item_keys(it)
        if ck:
            by_cert[ck] = idx
        if jk:
            by_cjk[jk] = idx

    for raw in existing:
        it = normalize_item(raw)
        idx = len(merged)
        merged.append(it)
        register(idx, it)

    stats = {
        "added": 0,
        "updated": 0,
        "kept_existing": 0,
        "skipped_no_cert": 0,
        "skipped_empty": 0,
    }

    for raw in incoming:
        if not isinstance(raw, dict) or not raw.get("han"):
            stats["skipped_empty"] += 1
            continue
        if not include_free_text and not raw.get("cert_ref"):
            stats["skipped_no_cert"] += 1
            continue

        it = normalize_item(raw)
        ck, jk = item_keys(it)
        match_idx = by_cert.get(ck) if ck in by_cert else by_cjk.get(jk)

        if match_idx is None:
            idx = len(merged)
            merged.append(it)
            register(idx, it)
            stats["added"] += 1
        else:
            prev = merged[match_idx]
            if parse_ts(it.get("updated_at")) > parse_ts(prev.get("updated_at")):
                merged[match_idx] = it
                register(match_idx, it)
                stats["updated"] += 1
            else:
                stats["kept_existing"] += 1

    return merged, stats


def bump_overlay_cache_version(root: str, version_str: str) -> bool:
    overlay_path = os.path.join(root, "js", "romaine-table-overlay.js")
    if not os.path.exists(overlay_path):
        return False
    with open(overlay_path, "r", encoding="utf-8") as f:
        text = f.read()
    new_text, n = re.subn(
        r"(verified_sentences\.json\?v=)[0-9A-Za-z_-]+",
        rf"\g<1>{version_str}",
        text,
    )
    if n > 0 and new_text != text:
        with open(overlay_path, "w", encoding="utf-8") as f:
            f.write(new_text)
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="自動收割匯出的 romaine-verified-*.json 至 verified_sentences.json")
    parser.add_argument("inputs", nargs="*", help="匯出檔路徑（可多個；未指定時掃描預設暫存資料夾）")
    parser.add_argument("--root", default=DEFAULT_ROOT, help="HakSpring 專案根目錄")
    parser.add_argument("--dry-run", action="store_true", help="僅預覽合併統計，不寫入檔案")
    parser.add_argument("--include-free-text", action="store_true", help="一併收錄無 cert_ref 的自由輸入句")
    parser.add_argument("--eval", action="store_true", help="寫入後自動執行 eval_romaine.py")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    gold_path = os.path.join(root, "data", "romaine", "verified_sentences.json")

    input_files = list(args.inputs)
    if not input_files:
        if os.path.isdir(DEFAULT_EXPORT_DIR):
            input_files = sorted(glob.glob(os.path.join(DEFAULT_EXPORT_DIR, "romaine-verified-*.json")))
    if not input_files:
        print("找不到任何匯出檔，請指定路徑。", file=sys.stderr)
        return 1

    if os.path.exists(gold_path):
        with open(gold_path, "r", encoding="utf-8") as f:
            gold_data = json.load(f)
    else:
        gold_data = {"schema_version": 1, "items": []}

    existing_items = gold_data.get("items", [])
    incoming_items: list[dict] = []
    for path in input_files:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("items", data) if isinstance(data, dict) else data
        if isinstance(items, list):
            incoming_items.extend(items)

    merged_items, stats = merge_items(
        existing_items,
        incoming_items,
        include_free_text=args.include_free_text,
    )

    before_counts = Counter(norm_dialect(x.get("dialect")) for x in existing_items)
    after_counts = Counter(x.get("dialect") for x in merged_items)

    print(f"來源檔案：{', '.join(os.path.basename(p) for p in input_files)}")
    print(f"處理結果：新增 {stats['added']} 筆、更新 {stats['updated']} 筆、沿用舊版 {stats['kept_existing']} 筆、略過無 cert_ref {stats['skipped_no_cert']} 筆")
    print(f"總筆數：{len(existing_items)} → {len(merged_items)}")
    print(f"腔調分佈（前）：{dict(before_counts)}")
    print(f"腔調分佈（後）：{dict(after_counts)}")

    if args.dry_run:
        print("[dry-run] 未寫入檔案。")
        return 0

    changed = stats["added"] > 0 or stats["updated"] > 0
    if not changed and existing_items == merged_items:
        print("無實質異動，未寫入檔案。")
        return 0

    gold_data["schema_version"] = gold_data.get("schema_version", 1)
    gold_data["items"] = merged_items
    with open(gold_path, "w", encoding="utf-8") as f:
        json.dump(gold_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"已寫入 {gold_path}")

    today_str = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime("%Y%m%d")
    if bump_overlay_cache_version(root, today_str):
        print(f"已更新 js/romaine-table-overlay.js 快取版號為 ?v={today_str}")

    if args.eval:
        eval_script = os.path.join(root, "scripts", "eval_romaine.py")
        subprocess.run([sys.executable, eval_script, "--root", root], check=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
