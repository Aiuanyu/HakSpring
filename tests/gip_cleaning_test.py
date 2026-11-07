# -*- coding: utf-8 -*-
import unittest
import sys
import os

# Add parent dir to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from process_all_data import clean_gip_raw_phonetic, get_gip_raw_patches


class TestGipCleaning(unittest.TestCase):

    def test_patch_override_hoiliug(self):
        tracker = []
        # 海陸「還會」變調值轉本調
        res = clean_gip_raw_phonetic("han1155 voi5533", "海", "還會", "gip-8568", tracker)
        self.assertEqual(res, "han55 voi33")
        self.assertEqual(len(tracker), 1)
        self.assertIn("調值錯誤（變調值誤作本調）", tracker[0]['categories'])

        # 海陸「果醬」漏空格黏音
        tracker = []
        res = clean_gip_raw_phonetic("go24ziong11", "海", "果醬", "gip-2095", tracker)
        self.assertEqual(res, "go24 ziong11")
        self.assertEqual(len(tracker), 1)
        self.assertIn("漏空格黏音", tracker[0]['categories'])

    def test_rule_sequence_prefix_removal(self):
        # 測試各腔序號標籤殘留自動清除
        tracker = []
        res = clean_gip_raw_phonetic("ha33 shiu24　又讀3.ha53 shiu24", "海", "下手", "gip-192", tracker)
        self.assertEqual(res, "ha33 shiu24　又讀ha53 shiu24")
        self.assertIn("序號標籤殘留", tracker[0]['categories'])

        tracker = []
        res = clean_gip_raw_phonetic("ti24 id5　合音2.ti24", "海", "第一", "gip-4731", tracker)
        self.assertEqual(res, "ti24 id5　合音ti24")

        tracker = []
        res = clean_gip_raw_phonetic("nai55 iu24　俗音1.nai53 iu24", "南", "哪有", "gip-2734", tracker)
        self.assertEqual(res, "nai55 iu24　俗音nai53 iu24")

    def test_rule_split_syllable_and_tone(self):
        # 測試音節字母與調值數字分離自動黏合
        tracker = []
        res = clean_gip_raw_phonetic("ciam 33 shi55", "海", "暫時", "gip-6721", tracker)
        self.assertEqual(res, "ciam33 shi55")
        self.assertIn("音節調號分離", tracker[0]['categories'])

        tracker = []
        res = clean_gip_raw_phonetic("hog5 vien 55", "平", "學員", "gip-4509", tracker)
        self.assertEqual(res, "hog5 vien55")

        tracker = []
        res = clean_gip_raw_phonetic("gong31 gun11　又讀 gong11 gun 11", "安", "鋼筋", "gip-7315", tracker)
        self.assertEqual(res, "gong31 gun11　又讀 gong11 gun11")

    def test_clean_input_unaffected(self):
        tracker = []
        clean_text = "han55 voi33　又讀han55 voi53"
        res = clean_gip_raw_phonetic(clean_text, "海", "正常詞", "gip-1", tracker)
        self.assertEqual(res, clean_text)
        self.assertEqual(len(tracker), 0)


if __name__ == '__main__':
    unittest.main()
