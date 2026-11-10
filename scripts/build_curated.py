# -*- coding: utf-8 -*-
"""
愛灣語加詞：data/curated/加詞.csv（人工維護）→ data/curated/加詞-{腔}.csv／.json。

格式同客源翠補字典（JSON 个 content 係統一 schema 个 CSV），網站、企盤兩邊用同款方式讀。
六腔都輸出檔案；無資料个腔寫淨表頭个空檔，毋靠「檔案毋存在就略過」。
由 process_all_data.py 呼叫（在補字典之前）；也做得單獨跑：python3 scripts/build_curated.py
"""
import csv
import glob
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from process_all_data import UNIFIED_SCHEMA_HEADERS  # noqa: E402

DIALECTS = ['四', '海', '大', '平', '安', '南']
DEFINITION = '（教典、認證未收；愛灣語依例句出現情形與個人語感收錄，歡迎審查）'
CATEGORY = '個人加詞'
SOURCE_TYPE = 'curated'
REQUIRED = ['腔', '字', '客語標音_顯示', '客語標音_查詢']


def build_ground_truth_char_readings():
    """載入六腔官方教典、認證與補字典之單字音真值集合，供 Linter 驗證。"""
    data_dir = os.path.join(ROOT, 'data')
    valid = {l: {} for l in DIALECTS}
    for l in DIALECTS:
        # 1. 教典
        p = os.path.join(data_dir, 'gip', f'20261020-{l}.json')
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                content = json.load(f)['content']
                for r in csv.DictReader(io.StringIO(content)):
                    w = r['客家語']
                    disp = re.sub(r'^(又讀|文|白|特)\s*', '', r['客語標音_顯示'].split('【')[0].split('/')[0].strip())
                    query = re.sub(r'^(又讀|文|白|特)\s*', '', r['客語標音_查詢'].split('【')[0].split('/')[0].strip())
                    if len(w) == 1:
                        valid[l].setdefault(w, set()).add((disp, query))
                    elif len(w) == len(disp.split()) == len(query.split()):
                        for ch, d, q in zip(w, disp.split(), query.split()):
                            valid[l].setdefault(ch, set()).add((d, q))
        # 2. 認證
        for cf in glob.glob(os.path.join(data_dir, 'cert', f'115{l}*.json')):
            with open(cf, encoding='utf-8') as f:
                content = json.load(f)['content']
                for r in csv.DictReader(io.StringIO(content)):
                    w = r['客家語']
                    disp = re.sub(r'^(又讀|文|白|特)\s*', '', r['客語標音_顯示'].split('【')[0].split('/')[0].strip())
                    query = re.sub(r'^(又讀|文|白|特)\s*', '', r['客語標音_查詢'].split('【')[0].split('/')[0].strip())
                    if len(w) == 1:
                        valid[l].setdefault(w, set()).add((disp, query))
                    elif len(w) == len(disp.split()) == len(query.split()):
                        for ch, d, q in zip(w, disp.split(), query.split()):
                            valid[l].setdefault(ch, set()).add((d, q))
        # 3. 補字典
        sp = os.path.join(data_dir, 'supp', f'補字典-{l}.csv')
        if os.path.exists(sp):
            with open(sp, encoding='utf-8-sig') as f:
                for r in csv.DictReader(f):
                    w = r['客家語']
                    disp = re.sub(r'^(又讀|文|白|特)\s*', '', r['客語標音_顯示'].split('【')[0].split('/')[0].strip())
                    query = re.sub(r'^(又讀|文|白|特)\s*', '', r['客語標音_查詢'].split('【')[0].split('/')[0].strip())
                    if len(w) == 1:
                        valid[l].setdefault(w, set()).add((disp, query))
    return valid


def verify_against_ground_truth(rows, ground_truth=None):
    """
    單字音合法性阻斷檢查（Linter）：
    加詞.csv 內的多字詞，每個單字配音必須存在於該腔教典／認證／補字典真值庫中。
    若屬特殊造詞或特例，需於「判斷說明」標註「【特例免檢】」始予放行。
    """
    if ground_truth is None:
        ground_truth = build_ground_truth_char_readings()

    for i, r in enumerate(rows, start=2):
        explanation = r.get('判斷說明', '')
        if '【特例免檢】' in explanation:
            continue

        lect = r['腔']
        word = r['字']
        disp_sylls = r['客語標音_顯示'].split()
        query_sylls = r['客語標音_查詢'].split()

        # 多字詞且音節數相符時進行逐字校驗
        if len(word) > 1 and len(word) == len(disp_sylls) == len(query_sylls):
            for ch, d, q in zip(word, disp_sylls, query_sylls):
                valid_set = ground_truth.get(lect, {}).get(ch, set())
                # 乾淨化調號前綴
                clean_d = re.sub(r'^(又讀|文|白|特)\s*', '', d).strip()
                clean_q = re.sub(r'^(又讀|文|白|特)\s*', '', q).strip()

                # 比對 (disp, query) 或至少 query (數字調) 匹配
                matched = any(clean_d == vd and clean_q == vq for vd, vq in valid_set)
                if not matched and valid_set:
                    # 亦容許只比對數字調 (有些調符顯示微調)
                    query_matched = any(clean_q == vq for vd, vq in valid_set)
                    if not query_matched:
                        valid_readings_str = ' ； '.join(f'{vd} ({vq})' for vd, vq in sorted(valid_set))
                        raise ValueError(
                            f"data/curated/加詞.csv 第 {i} 列 [{lect}腔] 詞彙「{word}」中的單字「{ch}」"
                            f"配音 ({d} / {q}) 不在官方教典／認證／補字典真值庫中！\n"
                            f"該字合法讀音為：{valid_readings_str}\n"
                            f"（若為合音或特例，請在「判斷說明」欄位填入「【特例免檢】」以放行）"
                        )


def load_curated():
    """data/curated/加詞.csv → [{腔, 字, 客語標音_顯示, 客語標音_查詢, 依據, 判斷說明}]；欄位缺就報錯。"""
    path = os.path.join(ROOT, 'data', 'curated', '加詞.csv')
    with open(path, encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))
    for i, r in enumerate(rows, start=2):
        for key in REQUIRED:
            if not (r.get(key) or '').strip():
                raise ValueError(f'{path} 第 {i} 列欄位「{key}」係空个')
        if r['腔'] not in DIALECTS:
            raise ValueError(f'{path} 第 {i} 列腔「{r["腔"]}」毋在 {DIALECTS}')
    seen = {}
    for i, r in enumerate(rows, start=2):
        key = (r['腔'], r['字'], r['客語標音_顯示'])
        if key in seen:
            raise ValueError(f'{path} 第 {i} 列摎第 {seen[key]} 列重複：{key}')
        seen[key] = i

    # 執行音韻真值 Linter 防呆阻斷
    verify_against_ground_truth(rows)
    return rows


def main():
    rows = load_curated()
    out_dir = os.path.join(ROOT, 'data', 'curated')
    for d in DIALECTS:
        items = []
        for r in rows:
            if r['腔'] != d:
                continue
            note = '；'.join(x for x in (r.get('依據', ''), r.get('判斷說明', '')) if x)
            item = {h: '' for h in UNIFIED_SCHEMA_HEADERS}
            item.update({
                '編號': f'cur-{len(items) + 1}',
                '客家語': r['字'],
                '客語標音_顯示': r['客語標音_顯示'],
                '客語標音_查詢': r['客語標音_查詢'],
                '華語詞義': DEFINITION,
                '備註': note,
                '分類': CATEGORY,
                'sourceName': f'愛灣語加詞{d}',
                'sourceType': SOURCE_TYPE,
            })
            items.append(item)
        buf = io.StringIO(newline='')
        writer = csv.DictWriter(buf, fieldnames=UNIFIED_SCHEMA_HEADERS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(items)
        base = os.path.join(out_dir, f'加詞-{d}')
        with open(base + '.csv', 'w', encoding='utf-8-sig', newline='') as f:
            f.write(buf.getvalue())
        with open(base + '.json', 'w', encoding='utf-8') as f:
            json.dump({'name': f'愛灣語加詞{d}', 'content': buf.getvalue()}, f, ensure_ascii=False, indent=2)
        print(f'  愛灣語加詞{d}：{len(items)} 筆')


if __name__ == '__main__':
    main()
