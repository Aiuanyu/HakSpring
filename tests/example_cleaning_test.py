"""tests/example_cleaning_test.py：例句與翻譯清洗單元測試（clean_example_sentence, clean_translation, parse_example_sentence_field）。"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from process_all_data import clean_example_sentence, clean_translation, parse_example_sentence_field


class ExampleCleaningTest(unittest.TestCase):
    def test_clean_example_sentence_duplicate_prefix(self):
        # 連續重複之「例：例：」前綴
        s = "例：例：姐公个竹篾手藝盡好，佢做个燈籠，在元宵燈節比賽打頭名。"
        out = clean_example_sentence(s)
        self.assertEqual(out, "姐公个竹篾手藝盡好，佢做个燈籠，在元宵燈節比賽打頭名。")

        # 混用例如與例
        s2 = "例如：例：阿姆後生時節盡辛苦！"
        self.assertEqual(clean_example_sentence(s2), "阿姆後生時節盡辛苦！")

    def test_clean_example_sentence_multiline_and_internal(self):
        # 換行後的例：
        s = "同你交關恁多，分𠊎拗蠻一息毋怕啦！<br>例：𠊎老妹正讀高中一年生，英文就講啊拗蠻好吔。"
        out = clean_example_sentence(s)
        self.assertEqual(out, "同你交關恁多，分𠊎拗蠻一息毋怕啦！<br>𠊎老妹正讀高中一年生，英文就講啊拗蠻好吔。")

        # 句末標點後接例：
        s2 = "聽講中風个人若係翻病，會越來越壞。）例：聽講中風个人係準翻病，會越來越壞。"
        out2 = clean_example_sentence(s2)
        self.assertEqual(out2, "聽講中風个人若係翻病，會越來越壞。）聽講中風个人係準翻病，會越來越壞。")

    def test_clean_example_sentence_pos_and_numbers(self):
        # 詞性或計量序號後的例：
        s = "計算成批、成群事物的單位。例：一幫人(一群人)"
        out = clean_example_sentence(s)
        self.assertEqual(out, "計算成批、成群事物的單位。一幫人(一群人)")

        s2 = "3.動。連接、相連。例：銜接。"
        out2 = clean_example_sentence(s2)
        self.assertEqual(out2, "3.動。連接、相連。銜接。")

    def test_clean_example_sentence_preserves_natural_words(self):
        # 正常合法詞語絕對不可被誤刪
        samples = [
            "照老例，爺哀過身，孝服愛著啊到圓七過。",
            "在法律面前人人係平等个，無人做得有例外。",
            "男女个比例係五比一，細妹仔少加盡多。",
            "提供相像个例仔分𠊎等參考。",
            "先生用不少例題來解說。"
        ]
        for text in samples:
            self.assertEqual(clean_example_sentence(text), text)

    def test_clean_translation_removes_prefix_and_brackets(self):
        # 翻譯前綴「例：」
        self.assertEqual(clean_translation("例：耳飽飽。"), "耳飽飽。")
        self.assertEqual(clean_translation("例：原形畢露。"), "原形畢露。")
        self.assertEqual(clean_translation("例：開端。<br>例：端正。"), "開端。<br>端正。")

        # 外層多餘括號剝除
        self.assertEqual(clean_translation("（他遠離家鄉很久了。）"), "他遠離家鄉很久了。")
        self.assertEqual(clean_translation("((看他偷偷摸摸地在藏東西))"), "看他偷偷摸摸地在藏東西")
        self.assertEqual(clean_translation("(（他在高中教歷史。）)"), "他在高中教歷史。")

    def test_parse_example_sentence_field_fullwidth_brackets(self):
        # 全形整句翻譯自動分流至翻譯欄位
        ef = "例：干你麼个事？（干你什麼事？）"
        sent, trans = parse_example_sentence_field(ef)
        self.assertEqual(sent, "干你麼个事？")
        self.assertEqual(trans, "干你什麼事？")

        # 兩層括號與多句
        ef2 = "例：一飽眼福。(例：耳飽飽。)\n例：飽讀詩書。(例：食飽。)"
        sent2, trans2 = parse_example_sentence_field(ef2)
        self.assertEqual(sent2, "一飽眼福。<br>飽讀詩書。")
        self.assertEqual(trans2, "耳飽飽。<br>食飽。")


if __name__ == '__main__':
    unittest.main()
