# -*- coding: utf-8 -*-
"""教典音讀「少音節」守門測試：詞目漢字比音節多，多半係官方資料漏標（見 data/annotations.md）。

已知、確認毋係漏標个，列佇 KNOWN_OK（合音等）；已知補丁修過个詞目，補丁失效（官方改版）時，
這隻測試會紅，提醒愛重新檢查。新增漏標（教典換版）也會紅，愛補 data/gip_raw_patches.json 个補丁，
抑係確認無問題後加入 KNOWN_OK。
"""
import csv
import glob
import io
import json
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
csv.field_size_limit(10**9)

LETTER = re.compile(r'[^\W_]|□')
SYLLABLE = re.compile(r'[a-z]+[0-9]*')  # 含漏標聲調數字个音節，這樣少音節摎缺聲調分開檢查
TONELESS = re.compile(r'[a-z]+(?![a-z0-9])')
# (腔別 sourceName, 詞目) → 原因。合音：兩隻字合讀一隻音節，音節比字少係正常
KNOWN_OK = {
    ('教典安', '做麼个'): '麼个合音 bbai53',
    ('教典安', '得佢氣死'): '得佢合音 dui24',
}


def first_reading(query):
    """查詢欄取第一組讀音：先拿忒開頭个讀音註記（特、白…），再切到 ` / ` 抑係下一個註記（漢字）為止。"""
    query = re.sub(r'^[\u4e00-\u9fff]+\s*', '', query)
    return re.split(r' / |[\u4e00-\u9fff]', query, maxsplit=1)[0]


class TestGipSyllableCount(unittest.TestCase):
    def test_no_missing_syllables(self):
        short = []
        for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'gip', '2026*.json'))):
            with open(f, encoding='utf-8') as fh:
                d = json.load(fh)
            for r in csv.DictReader(io.StringIO(d['content'])):
                query = r['客語標音_查詢']
                if not query:
                    continue  # 空音讀：另案（教典原始資料無音讀，毋可臆測）
                han = len(LETTER.findall(r['客家語']))
                syl = len(SYLLABLE.findall(first_reading(query)))
                if syl < han and (r['sourceName'], r['客家語']) not in KNOWN_OK:
                    short.append((r['sourceName'], r['編號'], r['客家語'], query, han, syl))
        self.assertEqual(short, [], '教典音讀少音節（可能官方漏標），愛補 gip_raw_patches.json 抑係加入 KNOWN_OK')

    def test_no_toneless_syllables(self):
        """查詢欄个每隻音節都愛有聲調數字（輕聲用 0）；漏標會害搜尋對毋著聲調。"""
        bad = []
        for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'gip', '2026*.json'))):
            with open(f, encoding='utf-8') as fh:
                d = json.load(fh)
            for r in csv.DictReader(io.StringIO(d['content'])):
                reading = first_reading(r['客語標音_查詢'])
                missing = [t for t in TONELESS.findall(reading)]
                if missing:
                    bad.append((r['sourceName'], r['編號'], r['客家語'], r['客語標音_查詢'], missing))
        self.assertEqual(bad, [], '教典音讀有音節漏標聲調數字，愛補 gip_raw_patches.json')

    def test_known_ok_still_short(self):
        # KNOWN_OK 个詞目若已經補齊，就應該從清單拿掉（免清單越積越多）
        still = set()
        for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'gip', '2026*.json'))):
            with open(f, encoding='utf-8') as fh:
                d = json.load(fh)
            for r in csv.DictReader(io.StringIO(d['content'])):
                key = (r['sourceName'], r['客家語'])
                if key in KNOWN_OK:
                    han = len(LETTER.findall(r['客家語']))
                    if len(SYLLABLE.findall(first_reading(r['客語標音_查詢']))) < han:
                        still.add(key)
        self.assertEqual(still, set(KNOWN_OK))


if __name__ == '__main__':
    unittest.main()
