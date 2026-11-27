# -*- coding: utf-8 -*-
"""C3：認證標音、詞目欄空白雜訊清理（不換行空白、全形空白、換行、雙空白）。"""
import json
import glob
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from process_all_data import clean_display_whitespace, clean_word_whitespace


class TestWhitespaceCleaners(unittest.TestCase):
    def test_display_whitespace(self):
        self.assertEqual(clean_display_whitespace('fí \xa0fug'), 'fí fug')
        self.assertEqual(clean_display_whitespace('ǐn\xa0ióng'), 'ǐn ióng')  # 兩爿無空白，原本斷毋開
        self.assertEqual(clean_display_whitespace('ngib　pí'), 'ngib pí')
        self.assertEqual(clean_display_whitespace('a b\nc d'), 'a b c d')
        self.assertEqual(clean_display_whitespace('biang sáng xì【bia  sáng xì】'), 'biang sáng xì【bia sáng xì】')
        self.assertEqual(clean_display_whitespace('  a b  '), 'a b')
        self.assertEqual(clean_display_whitespace(''), '')

    def test_display_keeps_letters_and_punctuation(self):
        text = 'sài (bán、bán sài)【sâi/sài】...ngoi è'
        self.assertEqual(clean_display_whitespace(text), text)

    def test_word_whitespace(self):
        self.assertEqual(clean_word_whitespace('幼稚園\n（幼兒園）'), '幼稚園（幼兒園）')
        self.assertEqual(clean_word_whitespace('點人指　'), '點人指')
        self.assertEqual(clean_word_whitespace('表演\xa0'), '表演')
        self.assertEqual(clean_word_whitespace('阿公毋做，做人个孫仔'), '阿公毋做，做人个孫仔')


class TestGeneratedJson(unittest.TestCase):
    def test_no_residual_noise_in_cert_json(self):
        import csv
        import io
        csv.field_size_limit(10**9)
        bad = []
        for f in glob.glob(os.path.join(ROOT, 'data', 'cert', '115*.json')):
            with open(f, encoding='utf-8') as fh:
                content = json.load(fh)['content']
            for r in csv.DictReader(io.StringIO(content)):
                p = r['客語標音_顯示']
                if any(c in p for c in '\xa0　\n\r') or '  ' in p or p != p.strip():
                    bad.append((r['編號'], p))
                if '\n' in r['客家語']:
                    bad.append((r['編號'], r['客家語']))
        self.assertEqual(bad, [])


if __name__ == '__main__':
    unittest.main()
