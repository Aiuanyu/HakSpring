#!/usr/bin/env python3
"""
HakSpring 認證詞彙（CERT）清洗與宣告式覆寫管線（Source -> Clean + Overlay -> Output CSV）

功能：
1. 讀取官方原始轉出之 CSV（如 data/cert_115/115*.csv）。
2. 正規化欄位結構（將中高級、高級的 9 欄「華語詞義/例句」透過兩階段規則切分為標準 10 欄）。
3. 套用 PUA 私用區造字映射（依據 glyph_mapping.json 及認證詞表特例）。
4. 將官方部頒調號（ˊ ˋ ˇ ^ ˆ + ⁺）轉換為客源翠白話字組合調符（HagPinPlus，含詔安 oo/ee 與 m/n 鼻音韻母），
   並自動修復「字母與調號間誤插空白」與「調號後漏空白連寫」異常，同時轉換備註欄內之標音。
5. 套用 data/patches/cert-overrides.csv 宣告式覆寫（含官方基準值比對與 Stale Patch 偵測）。
6. 輸出相容於 process_all_data.py 之標準 UTF-8-BOM CSV。
"""

import argparse
import csv
import glob
import os
import re
import sys
import unicodedata

DIALECT_FULL = {
    "四": "四縣",
    "海": "海陸",
    "大": "大埔",
    "平": "饒平",
    "安": "詔安",
}

PUA_MAP = {
    "\ue40f": "㘝",
    "\ue452": "䗁",
    "\ue459": "䟘",
    "\ue548": "𢳆",
    "\ue5a4": "𪐞",
    "\ue700": "𫣆",
    "\ue702": "忒",
    "\ue9e0": "",
    "\ue9e2": "",
    "\uf374": "𢯭",
    "\uf93f": "錄",
    "\uf9be": "料",
    "\uf9ca": "流",
}

TONE_MAP = {
    "ˊ": "\u0301",
    "ˋ": "\u0300",
    "ˇ": "\u030c",
    "^": "\u0302",
    "ˆ": "\u0302",
    "+": "\u0304",
    "⁺": "\u0304",
}

VOWEL_PRIORITY = ["a", "o", "e", "u", "i", "n", "m"]
SPLIT_FALLBACK_RE = re.compile(r"^(.*?[。！？])((?:例如|例|如)[：:「].*)$", re.DOTALL)


def apply_pua(text: str) -> str:
    if not text:
        return ""
    for k, v in PUA_MAP.items():
        if k in text:
            text = text.replace(k, v)
    return text


def add_diacritic_to_syllable(syl: str, comb: str) -> str:
    lower = syl.lower()
    for v in VOWEL_PRIORITY:
        idx = lower.find(v)
        if idx != -1:
            ch = syl[idx]
            if v in ("m", "n"):
                accented = ch + comb
            else:
                accented = unicodedata.normalize("NFC", ch + comb)
            return syl[:idx] + accented + syl[idx + 1 :]
    return syl


def convert_phonetic_text(text: str) -> str:
    if not text:
        return ""
    # 1. 消除字母與調號之間誤插的空白（如 "hi ˋ" -> "hiˋ"）
    s = re.sub(r"([a-zA-Z'])\s+([ˊˋˇˆ˙⁺+^])", r"\1\2", text.strip())
    # 2. 補齊調號後直接連寫字母所缺的空白（如 "tienˊgungˊ" -> "tienˊ gungˊ"）
    s = re.sub(r"([ˊˋˇˆ˙⁺+^])(?=[a-zA-Z])", r"\1 ", s)
    # 3. 轉換每個「音節+調號」為組合調符
    def repl(m):
        syl, tone = m.group(1), m.group(2)
        if tone == "˙":
            return syl
        comb = TONE_MAP.get(tone)
        if not comb:
            return m.group(0)
        return add_diacritic_to_syllable(syl, comb)

    return re.sub(r"([a-zA-Z']+)([ˊˋˇˆ˙⁺+^])", repl, s)


def convert_note_text(text: str) -> str:
    if not text:
        return ""
    # 僅針對備註中帶有調號的音節進行轉換
    s = re.sub(r"([a-zA-Z'])\s+([ˊˋˇˆ⁺+^])", r"\1\2", text.strip())

    def repl(m):
        syl, tone = m.group(1), m.group(2)
        comb = TONE_MAP.get(tone)
        if not comb:
            return m.group(0)
        return add_diacritic_to_syllable(syl, comb)

    return re.sub(r"([a-zA-Z']+)([ˊˋˇˆ⁺+^])", repl, s)


def split_meaning_example(raw_text: str, translation: str, level: str):
    raw_text = (raw_text or "").strip()
    if "\n" in raw_text:
        parts = raw_text.split("\n", 1)
        return parts[0].strip(), parts[1].strip()
    if level == "中高" or (level == "高" and translation.strip()):
        m = SPLIT_FALLBACK_RE.match(raw_text)
        if m:
            return m.group(1).strip(), m.group(2).strip()
    return raw_text, ""


def load_overrides(patch_path: str):
    overrides = {}
    if not os.path.exists(patch_path):
        return overrides
    with open(patch_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            ds = row["腔級"].strip()
            code = row["編號"].strip()
            col = row["欄位"].strip()
            overrides.setdefault((ds, code), []).append(row)
    return overrides


def build_cert_dataset(src_dir: str, out_dir: str, patch_path: str, year_prefix: str = "115"):
    os.makedirs(out_dir, exist_ok=True)
    overrides = load_overrides(patch_path)
    used_overrides = set()
    stale_warnings = []

    src_files = sorted(glob.glob(os.path.join(src_dir, f"{year_prefix}*.csv")))
    if not src_files:
        raise FileNotFoundError(f"找不到任何 {year_prefix}*.csv 於 {src_dir}")

    total_rows = 0
    applied_count = 0

    for src_path in src_files:
        fname = os.path.basename(src_path)
        ds = fname[len(year_prefix) : -4]  # 例如 "四中", "四中高", "四高"
        dialect_char = ds[0]
        level = ds[1:]
        d_full = DIALECT_FULL[dialect_char]

        # 對齊 process_all_data.py 預期的 10 欄標題
        if level in ("中高", "高"):
            ex_header = "例句"
        else:
            ex_header = f"{d_full}例句"

        out_headers = [
            "編號",
            f"{d_full}客家語",
            f"{d_full}客語標音",
            f"{d_full}華語詞義",
            ex_header,
            f"{d_full}翻譯",
            "備註",
            "詞性1",
            "詞性2",
            "分類",
        ]

        out_rows = []
        with open(src_path, encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            _ = next(reader, None)
            for raw_row in reader:
                if not raw_row or not raw_row[0].strip():
                    continue
                raw_row = [apply_pua(c.strip()) for c in raw_row]
                code = raw_row[0]

                if len(raw_row) == 10:
                    word = raw_row[1]
                    phon = convert_phonetic_text(raw_row[2])
                    meaning = raw_row[3]
                    example = raw_row[4]
                    trans = raw_row[5]
                    note = convert_note_text(raw_row[6])
                    pos1, pos2, cat = raw_row[7], raw_row[8], raw_row[9]
                elif len(raw_row) == 9:
                    word = raw_row[1]
                    phon = convert_phonetic_text(raw_row[2])
                    trans = raw_row[4]
                    meaning, example = split_meaning_example(raw_row[3], trans, level)
                    note = convert_note_text(raw_row[5])
                    pos1, pos2, cat = raw_row[6], raw_row[7], raw_row[8]
                else:
                    raise ValueError(f"{fname} 編號 {code} 欄位數異常: {len(raw_row)}")

                norm = {
                    "編號": code,
                    "詞彙": word,
                    "標音": phon,
                    "華語詞義": meaning,
                    "例句": example,
                    "翻譯": trans,
                    "備註": note,
                    "詞性1": pos1,
                    "詞性2": pos2,
                    "分類": cat,
                }

                if (ds, code) in overrides:
                    for ov in overrides[(ds, code)]:
                        col = ov["欄位"].strip()
                        expected_base = ov["官方基準值"]
                        new_val = ov["覆寫值"]
                        actual_base = norm.get(col, "")
                        if actual_base != expected_base:
                            stale_warnings.append(
                                f"[STALE PATCH] {ds} {code} ({word}) [{col}]: "
                                f"預期官方基準={repr(expected_base)}, 實際清洗後基準={repr(actual_base)}"
                            )
                        norm[col] = new_val
                        used_overrides.add((ds, code, col))
                        applied_count += 1

                out_rows.append(
                    [
                        norm["編號"],
                        norm["詞彙"],
                        norm["標音"],
                        norm["華語詞義"],
                        norm["例句"],
                        norm["翻譯"],
                        norm["備註"],
                        norm["詞性1"],
                        norm["詞性2"],
                        norm["分類"],
                    ]
                )
                total_rows += 1

        out_path = os.path.join(out_dir, fname)
        with open(out_path, "w", encoding="utf-8-sig", newline="") as out_f:
            writer = csv.writer(out_f, lineterminator="\n")
            writer.writerow(out_headers)
            writer.writerows(out_rows)

    for (ds, code), ov_list in overrides.items():
        for ov in ov_list:
            col = ov["欄位"].strip()
            if (ds, code, col) not in used_overrides:
                stale_warnings.append(f"[UNUSED PATCH] {ds} {code} [{col}] 未命中任何詞條！")

    print(
        f"✅ 完成 {len(src_files)} 份認證詞表清洗與覆寫（共 {total_rows} 筆詞條，套用 {applied_count} 筆覆寫）-> {out_dir}"
    )
    if stale_warnings:
        for w in stale_warnings:
            print(w, file=sys.stderr)
        sys.exit(2)


def main():
    parser = argparse.ArgumentParser(description="Build cleaned CERT CSVs from official source + overrides")
    parser.add_argument("--src-dir", default="data/cert_115", help="Official raw CSV directory")
    parser.add_argument("--out-dir", default="data/cert", help="Output cleaned CSV directory")
    parser.add_argument("--patch", default="data/patches/cert-overrides.csv", help="Declarative overrides CSV")
    parser.add_argument("--year", default="115", help="Year prefix (default: 115)")
    args = parser.parse_args()
    build_cert_dataset(args.src_dir, args.out_dir, args.patch, args.year)


if __name__ == "__main__":
    main()
