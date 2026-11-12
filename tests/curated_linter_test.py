# -*- coding: utf-8 -*-
"""build_curated.verify_against_ground_truth：假音、抄錯調號愛攔得著，真音、特例愛放行。"""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import build_curated as bc  # noqa: E402


def row(lect, word, disp, query, note=''):
    return {'腔': lect, '字': word, '客語標音_顯示': disp, '客語標音_查詢': query, '判斷說明': note}


class LinterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gt = bc.build_ground_truth_char_readings()

    def check(self, r):
        bc.verify_against_ground_truth([r], self.gt)

    def test_fake_syllable_blocked(self):
        # 「介」南四縣教典係 giai，無 gia；「面」無 mian
        with self.assertRaises(ValueError):
            self.check(row('南', '介面', 'giai mian', 'giai55 mian55'))

    def test_wrong_tone_blocked(self):
        # 「儲」四縣係 cu11（陽平），抄成 cu31（陰上）
        with self.assertRaises(ValueError):
            self.check(row('四', '儲存', 'cù cǔn', 'cu31 cun11'))

    def test_real_reading_passes(self):
        self.check(row('四', '介面', 'gie mien', 'gie55 mien55'))

    def test_exemption_passes(self):
        self.check(row('南', '介面', 'giai mian', 'giai55 mian55', '【特例免檢】合音'))


if __name__ == '__main__':
    unittest.main()
