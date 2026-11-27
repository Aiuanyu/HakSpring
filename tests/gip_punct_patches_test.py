# -*- coding: utf-8 -*-
"""教典「標點缺漏」overlay 補丁：產生器規則，摎補丁經管線後个顯示。"""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'scripts'))

import build_gip_punct_patches as B
from process_all_data import clean_gip_raw_phonetic, convert_phonetic_string


class TestClauseSplit(unittest.TestCase):
    def test_clause_split(self):
        self.assertEqual(B.clause_split('阿公毋做，做人个孫仔'), [(4, '，'), (5, '')])
        self.assertEqual(B.clause_split('阿婆嫁孫女－－無主無意'), [(5, '－－'), (4, '')])
        self.assertEqual(B.clause_split('鴨嫲多，懶生卵；心臼多，懶洗碗'), [(3, '，'), (3, '；'), (3, '，'), (3, '')])
        self.assertEqual(B.clause_split('七坐、八爬、九生牙'), [(2, '、'), (2, '、'), (3, '')])


class TestGeneratedOverlay(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(B.OUT, encoding='utf-8') as fh:
            cls.patches = json.load(fh)

    def test_patch_shape(self):
        self.assertGreater(len(self.patches), 0)
        for p in self.patches:
            self.assertEqual(p['category'], B.CATEGORY)
            self.assertNotEqual(p['match_raw'], p['replace_raw'])
            # 補丁淨補標點：拿忒標點、空白後，音節完全共樣
            strip = lambda s: [t for t in s.replace('，', ' ').replace('；', ' ').replace('、', ' ').replace('－－', ' ').split()]
            self.assertEqual(strip(p['match_raw']), strip(p['replace_raw']))
            # 破折號一律「－－」（U+FF0D），毋寫「──」
            self.assertNotIn('─', p['replace_raw'])

    def test_patch_through_pipeline(self):
        # 歇後語（詞目用 ──）：補丁後聲調照常轉調符，毋會殘留數字
        hit = [p for p in self.patches if '──' in p['hanji']]
        self.assertTrue(hit)
        cleaned = clean_gip_raw_phonetic(hit[0]['match_raw'], hit[0]['dialect'], hit[0]['hanji'], hit[0]['gip_id'], [])
        self.assertIn('－－', cleaned)

    def test_convert_keeps_punctuation_tokens(self):
        with open(os.path.join(ROOT, 'tone_mapping.json'), encoding='utf-8') as fh:
            m = json.load(fh)
        tone_map = {'vowel_priority': m.get('vowel_priority', []),
                    'tones': {**m.get('default_tones', {}), **m.get('dialect_maps', {}).get('四', {})}}
        self.assertEqual(convert_phonetic_string('zo55，zo55', tone_map), 'zo ， zo')
        self.assertEqual(convert_phonetic_string('ng31－－mo11', tone_map), 'ǹg -- mǒ')


if __name__ == '__main__':
    unittest.main()
