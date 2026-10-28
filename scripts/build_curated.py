# -*- coding: utf-8 -*-
"""
愛灣語加詞：data/curated/加詞.csv（人工維護）→ data/curated/加詞-{腔}.csv／.json。

格式同客源翠補字典（JSON 个 content 係統一 schema 个 CSV），網站、企盤兩邊用同款方式讀。
六腔都輸出檔案；無資料个腔寫淨表頭个空檔，毋靠「檔案毋存在就略過」。
由 process_all_data.py 呼叫（在補字典之前）；也做得單獨跑：python3 scripts/build_curated.py
"""
import csv
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from process_all_data import UNIFIED_SCHEMA_HEADERS  # noqa: E402

DIALECTS = ['四', '海', '大', '平', '安', '南']
DEFINITION = '（教典、認證未收；愛灣語依例句出現情形與個人語感收錄，歡迎審查）'
CATEGORY = '個人加詞'
SOURCE_TYPE = 'curated'
REQUIRED = ['腔', '字', '客語標音_顯示', '客語標音_查詢']


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
