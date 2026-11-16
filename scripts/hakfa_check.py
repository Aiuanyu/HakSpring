#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
客源翠客話文本體檢與防呆工具 (hakfa_check.py)

功能：
1. 【禁字與假朋友攔截】：攔截 Ho̍h-ló 話滲入字（矣、閣、佇、向望、V落去、拍字家私）、
   Chinese 直譯詞（的、他、嗎、已經、跟著、正好、乾脆、同齡、天氣、偷懶、每隻人等）與簡體字殘留。
2. 【漢字＋標音真值核對】：自動偵測文本內「漢字 + 標音」配對（如：部 bu），比對客源翠六腔字典真值；
   凡標出不存在於字典之聲韻（如全濁並母「部」誤標為 bu），立即報錯攔截。
3. 【詞庫斷詞與未收錄雙字組合警示】：以客源翠全庫（教典＋認證＋補字典＋愛灣語加詞）對草稿進行最大匹配斷詞，
   自動揪出「詞庫查無整詞、疑似拆字硬湊」之雙字組合（如「向望」），並列出官方常用合成詞供替換。
4. 【CERT 分級核心詞提示】：提示可替換為 CERT 基礎級（⭐115四基）之高頻詞（如：抑係 -> 還係）。
5. 【執行憑證輸出】：輸出帶 SHA-256 短雜湊與斷詞統計之檢驗憑證，杜絕目測假自檢。

用法：
    python3 scripts/hakfa_check.py "𠊎想愛同你共下學客話。"
    python3 scripts/hakfa_check.py -f draft.md
"""

import argparse
import hashlib
import os
import re
import sys
import unicodedata

import hakfa_lookup as hl

# 1. 確定性違規規則（❌ ERROR：命中即失敗，必須修正）
ERROR_RULES = [
    (r'矣', 'Ho̍h-ló 話語氣詞滲入：「矣」請改用四縣「吔 (è)」或「哩」'),
    (r'毋閣|閣再|閣較|閣有|閣來|閣去', 'Ho̍h-ló 話「閣 (koh)」滲入：「毋閣」請改「毋過」；「再」請用「過／再過／𫝘過」'),
    (r'佇', 'Ho̍h-ló 話介詞滲入：「佇」請改用「在」'),
    (r'向望', 'Ho̍h-ló 話假朋友滲入：客話無「向望」，期盼請用「希望 (hí mong)」或「指望 (zìi mong)」'),
    (r'(?:做|講|行|讀|寫|看|試|撐|堅持|維持|傳承|流傳)落去', 'Ho̍h-ló 話假朋友：四縣「落去 (log hi)」義為「入去（進去）」（如：做毋得落去、放落去）；動作延續或往下請用「下去 (há hi)」或「續等＋V」'),
    (r'拍字|打字家私', 'Ho̍h-ló 話詞彙滲入：客話請用「打字」「打字工具」'),
    (r'[他她]們|[他她]', 'Chinese 代詞殘留：「他／她」請改用「佢 (gǐ)」，複數用「佢兜／佢等」'),
    (r'我們|你們', 'Chinese 代詞殘留：「我們」請改用「𫣆（兜）／𠊎等」，「你們」用「你兜／你等」'),
    (r'嗎[？?！!。，,\s]|嗎$', 'Chinese 疑問詞殘留：是非問句尾請用「無／吂」，或於動詞前用「敢」'),
    (r'[吧呢][？?！!。，,\s]|[吧呢]$', 'Chinese 語氣詞殘留：請改用客話語氣詞「哪／哦／啊／吔／哩」'),
    (r'已經|已(?=完成|做好|結束|解決|有|知|看|聽|改|修)', 'Chinese 詞彙直套：「已／已經」客話講「既經 (gi gíng)」'),
    (r'毋使趕|愛趕', 'Chinese「趕（時間）」直套：客話講「赴時間／拚事」'),
    (r'跈著', 'Chinese「跟著」直譯：客話持續體請用「跈等 (těn dén)」'),
    (r'同齡人?', 'Chinese 書面詞直套：客話講「同年个 (tǔng ngiěn ge)」「同年人」'),
    (r'天氣', 'Chinese 詞彙直套：「天氣」客話講「天時 (tién sǐi)」'),
    (r'正好', 'Chinese 詞彙直套：「正好」客話講「堵堵好 (dù dù hò)」'),
    (r'乾脆', 'Chinese 詞彙直套：「乾脆」客話講「將就 (zióng qiu)」'),
    (r'偷懶', 'Chinese 詞彙直套：「偷懶」客話講「推懶 (tói lán)」或「賣懶 (mai lán)」'),
    (r'無單淨', '否定詞選錯：「單淨」之性質否定請用「毋單淨」'),
    (r'還無', '否定詞誤用：「還沒」客話講「吂 (mǎng)」「還吂」或「毋曾」'),
    (r'(?<!講|過|客|你|佢|吾|若|厥)个話[，,。]', 'Chinese「的話」語法直譯：客話假設句請於句首用「係講」，句尾勿加「个話」'),
    (r'(?:[一二兩三四五六七八九十百千萬幾多每逐])隻(?!(?:細人仔|人公仔|人頭))[^，。！？、；\s]{0,6}?人', '量詞誤用：數詞計人嚴禁套用「隻」（無「一隻人、兩隻人、每隻人」），客話計人專用「儕 (sǎ)」（如：一儕人、兩儕後生人、逐儕、每儕）'),
    (r'走路', 'Chinese/客話假朋友：客話「走 (zèu)」義為「跑」！「走路」必須講「行路 (hǎng lu)」'),
    (r'跑步|跑去|跑轉|跑回|跑來|快跑', 'Chinese 動詞直套：客話「跑」講「走 (zèu)」（如：走轉屋下、走去、遽遽走）'),
    (r'吵架', 'Chinese 詞彙直套：「吵架」客話講「冤家 (ién gá)」或「相罵 (xióng ma)」'),
    (r'昨天|明天|早上|晚上', 'Chinese 時間詞直套：客話講「昨晡日 (昨天)」「天光日 (明天)」「朝晨／早起 (早上)」「暗晡頭 (晚上)」'),
    (r'吃(?:飯|早|午|晚|茶|酒|麵|菜|肉|藥|東)|喝(?:茶|酒|水|湯)|(?:早|午|晚)餐', 'Chinese 飲食詞直套：客話「吃、喝」一律用「食 (siid)」，三餐講「食朝 (siid záu)／食晝 (siid zu)／食夜 (siid ia)」'),
    (r'睡覺|洗澡', 'Chinese 日常詞直套：「睡覺」客話講「睡目 (soi mùg)」；「洗澡」講「洗身 (sè síin)」'),
    (r'看[毋不]懂|聽[毋不]懂|看得懂|聽得懂', 'Chinese 補語直套：客話講「看毋識／看得識 (kon m̌/dèd siid)」、「聽毋識／聽得識 (táng m̌/dèd siid)」'),
    (r'穿(?:衣|衫)|一[件條](?:衣|衫)', 'Chinese 衣物詞直套：客話「穿衣」講「著衫 (zòg sám)」，衣物量詞用「領 (liáng)」（一領衫）'),
    (r'越來越', 'Chinese 遞進詞直套：「越來越…」客話講「緊來緊 (gìn lǒi gìn)…」'),
    (r'地道', '支語滲入：臺灣正體中文請改用「道地」；若為客話文本表達語言／技術道地標準，客話講「正 (zang)」[115四初]、「正板 (zang bàn)」[115四中高] 或「到家 (do gá)」'),
    (r'[从译爱换们这发为东车书长门问间开关见现观视频觉习师带队办难欢买卖实际标准确认识语词汇读写听说话错误检验]', '簡體字殘留：請全面改用正體字（zh-TW）'),
]

# 2. 語感與分級提示規則（⚠️ WARN：提醒確認，不強制中斷）
WARN_RULES = [
    (r'的', '發現「的」字：若非專有名詞或引文，客話領屬與修飾請改用「个」（代詞領格用「吾／若／厥」）'),
    (r'抑係', 'CERT 分級提示：「抑係」為初級詞（115四初），日常對話可優先考慮基礎級核心詞 ⭐「還係 (hǎn he)」(115四基)'),
    (r'一直(?!行|走|落雨)', '語感提示：表示持續時段，客話常講「一路（里來）」或「緊＋V」'),
]

# 常見單字功能詞／高頻單字（斷詞時不視為未知湊字碎片）
FUNCTION_CHARS = set(
    '𠊎吾你若佢厥𫣆个係毋無吂莫愛會識正就斯在到等忒核煞兜這該遐'
    '食講看聽知做去來轉有好當蓋盡異恁仰麼哪㖠儕隻領頭皮下'
    '吔哩哪哦啊過較比同摎分共還也乜都又定人日年時月天水火風雨山路屋書車話字事'
    '一二三四五六七八九十百千萬半幾多全大細長短高低早暗新舊老少男女'
    '前後左右上下裡肚外背頂底中間頭尾手腳目耳鼻嘴心肝頭那'
    '尋改入加落像捉寫讀學用問答行企坐睡拿放開關出起見各每逐'
)


def strip_tone(s):
    """將帶調號或數字調之客話拼音轉為純聲韻母小寫字母，供真值比對"""
    nfd = unicodedata.normalize('NFD', s)
    # 去除組合附加符號與數字調
    cleaned = re.sub(r'[\u0300-\u036f0-9]', '', nfd)
    return cleaned.lower().strip()


def build_lexicon_structures(records):
    """建立全庫詞集、單字合法讀音表、單字合成詞抽樣表"""
    words_set = set()
    char_readings = {}  # ch -> set of base_syllables
    char_raw_readings = {}  # ch -> list of "腔:disp(query)"
    char_compounds = {}  # ch -> list of compound strings

    for l in hl.LECTS:
        for r in records[l]:
            w = hl.clean_word(r['word'])
            if not w:
                continue
            words_set.add(w)
            # 若原詞目有括號同義詞，如「同（摎）」「落去（入去）」，一併納入合法詞
            for alt in re.findall(r'[（(【](.*?)[）)】]', r['word']):
                for sub in re.split(r'[／/、,，]', alt):
                    sub = sub.strip()
                    if sub:
                        words_set.add(sub)

            if len(w) == 1:
                ch = w
                if ch not in char_readings:
                    char_readings[ch] = set()
                    char_raw_readings[ch] = []
                # 解析可能的多音節或斜線音
                tokens = re.findall(r'[a-zA-Záàâǎāéèêěēíìîǐīóòôǒōúùûǔūńǹňḿm̀\u0300-\u036f]+[0-9]*', r['disp'] + ' ' + r['query'])
                for tok in tokens:
                    base = strip_tone(tok)
                    if base:
                        char_readings[ch].add(base)
                entry_str = f"{l}:{r['disp']}"
                if entry_str not in char_raw_readings[ch]:
                    char_raw_readings[ch].append(entry_str)
            elif len(w) >= 2 and l == '四':
                for ch in w:
                    if ch not in char_compounds:
                        char_compounds[ch] = []
                    comp_str = f"{w}({r['disp']})"
                    if len(char_compounds[ch]) < 5 and comp_str not in char_compounds[ch]:
                        char_compounds[ch].append(comp_str)

    return words_set, char_readings, char_raw_readings, char_compounds


def check_phonetic_pairs(text, char_readings, char_raw_readings):
    """
    掃描文本中形如「部 bu」「部 (bu55)」「部 `bu`」之單字標音配對，
    核對該聲韻是否存在於六腔字典真值中。
    """
    errors = []
    # 匹配：單一漢字 + 選用符號（：/空格/括號/反引號） + 小寫羅馬字音節（排除首字母大寫之英文專有名詞如 Sonnet/Flash）
    pattern = re.compile(
        r'(?<![\u4e00-\u9fff\u3400-\u4dbf\U00020000-\U0002ebef])'
        r'([\u4e00-\u9fff\u3400-\u4dbf\U00020000-\U0002ebef])'
        r'(?:\s*[:：]\s*(?:[四南海大平安]\s*)?|\s+[(\[（]?|\s*[(\[（])'
        r'([a-záàâǎāéèêěēíìîǐīóòôǒōúùûǔūńǹňḿm̀]{1,7}[0-9]{0,3})'
        r'(?![a-zA-Z0-9])'
    )
    # 排除常見英文單字或非標音代號
    ignore_words = {
        'ai', 'pr', 'ci', 'cd', 'ui', 'db', 'os', 'id', 'md', 'py', 'js', 'kt',
        'in', 'on', 'to', 'of', 'or', 'by', 'is', 'at', 'as', 'an', 'be', 'do',
        'go', 'if', 'it', 'no', 'so', 'up', 'we', 'he', 'me', 'my', 'us', 'ok',
        'tl', ' poj', 'tps', 'hpp', 'pfs', 'csv', 'json', 'git', 'app', 'mac',
        'ios', 'apk', 'pr', 'mr', 'vs'
    }

    for m in pattern.finditer(text):
        ch = m.group(1)
        rom = m.group(2)
        base = strip_tone(rom)
        if base in ignore_words or len(base) < 1:
            continue
        if ch in char_readings and char_readings[ch]:
            if base not in char_readings[ch]:
                valid_str = ' / '.join(char_raw_readings[ch][:6])
                hint = ""
                if base.startswith(('b', 'd', 'g')) and any(
                    v.startswith(('p', 't', 'k', 'c')) for v in char_readings[ch]
                ):
                    hint = "（注意：中古諸夏語全濁聲母並/定/群母在客話一律讀送氣清音 p/t/k，嚴禁受 Chinese 拼音 b/d/g 污染！）"
                errors.append(
                    f"標音真值違規：單字【{ch}】旁標註了『{rom}』(聲韻 {base})，但六腔字典真值無此聲韻！{hint} 官方真值：{valid_str}"
                )
    return errors


def segment_and_find_unattested(text, words_set, char_compounds):
    """
    對文本內漢字序列做正向最大匹配斷詞（Maximum Matching）：
    統計命中詞庫之多字詞數，並找出連續 >=2 個「未收錄且非基礎單字」之疑似湊字組合。
    """
    cjk_runs = re.findall(r'[\u4e00-\u9fff\u3400-\u4dbf\U00020000-\U0002ebef]+', text)
    multiword_hits = []
    unattested_warnings = []
    seen_unattested = set()

    for run in cjk_runs:
        n = len(run)
        i = 0
        single_buffer = []

        while i < n:
            matched_len = 0
            for l in range(min(6, n - i), 1, -1):
                sub = run[i:i + l]
                if sub in words_set:
                    matched_len = l
                    break

            if matched_len >= 2:
                if len(single_buffer) >= 2:
                    comp = ''.join(single_buffer)
                    if comp not in seen_unattested:
                        seen_unattested.add(comp)
                        unattested_warnings.append(comp)
                single_buffer = []
                multiword_hits.append(run[i:i + matched_len])
                i += matched_len
            else:
                ch = run[i]
                if ch in FUNCTION_CHARS:
                    if len(single_buffer) >= 2:
                        comp = ''.join(single_buffer)
                        if comp not in seen_unattested:
                            seen_unattested.add(comp)
                            unattested_warnings.append(comp)
                    single_buffer = []
                else:
                    single_buffer.append(ch)
                i += 1

        if len(single_buffer) >= 2:
            comp = ''.join(single_buffer)
            if comp not in seen_unattested:
                seen_unattested.add(comp)
                unattested_warnings.append(comp)

    formatted_unattested = []
    for comp in unattested_warnings:
        hints = []
        for ch in comp:
            samples = char_compounds.get(ch, [])
            if samples:
                hints.append(f"「{ch}」常用詞：{', '.join(samples[:4])}")
        hint_str = f"（{' ｜ '.join(hints)}）" if hints else ""
        formatted_unattested.append(
            f"詞庫查無整詞【{comp}】：請確認是否為外語／Ho̍h-ló 話借詞或拆字硬湊？{hint_str}"
        )

    return multiword_hits, formatted_unattested


def check_text(text):
    records = hl.load_all_lexicon()
    words_set, char_readings, char_raw_readings, char_compounds = build_lexicon_structures(records)

    errors = []
    warnings = []

    # 排除反引號內之負例引用（如 `向望`），避免討論錯例時誤觸規則；但漢字標音核對仍掃描全文
    prose_text = re.sub(r'`[^`]+`', ' ', text)

    # 1. 確定性違規掃描
    for pat, msg in ERROR_RULES:
        matches = list(re.finditer(pat, prose_text))
        if matches:
            found_strs = sorted(set(m.group(0) for m in matches))
            errors.append(f"命中『{'、'.join(found_strs)}』➔ {msg}")

    # 2. 漢字＋標音真值核對（同樣排除反引號內之負例引用）
    phon_errors = check_phonetic_pairs(prose_text, char_readings, char_raw_readings)
    errors.extend(phon_errors)

    # 3. 語感與分級提示
    for pat, msg in WARN_RULES:
        matches = list(re.finditer(pat, prose_text))
        if matches:
            found_strs = sorted(set(m.group(0) for m in matches))
            warnings.append(f"命中『{'、'.join(found_strs)}』➔ {msg}")

    # 4. 斷詞與未收錄雙字組合警示
    multiword_hits, unattested_warns = segment_and_find_unattested(prose_text, words_set, char_compounds)
    warnings.extend(unattested_warns)

    # 5. 計算憑證雜湊
    short_hash = hashlib.sha256(text.encode('utf-8')).hexdigest()[:8]
    cjk_count = len(re.findall(r'[\u4e00-\u9fff\u3400-\u4dbf\U00020000-\U0002ebef]', text))

    print("=" * 60)
    print("🔍 客源翠客話文本體檢報告 (hakfa_check.py)")
    print("=" * 60)
    print(f"📊 統計：漢字數 {cjk_count} ｜ 詞庫多字詞命中 {len(multiword_hits)} 個（{', '.join(dict.fromkeys(multiword_hits)) or '無'}）")

    if errors:
        print(f"\n❌ 【嚴重違規 ({len(errors)} 項) — 必須修正後方可交稿】：")
        for idx, e in enumerate(errors, 1):
            print(f"  {idx}. {e}")
    else:
        print("\n✅ 【嚴重違規：0 項】")

    if warnings:
        print(f"\n⚠️ 【語感／分級／未收錄組合提示 ({len(warnings)} 項) — 請逐項查證】：")
        for idx, w in enumerate(warnings, 1):
            print(f"  {idx}. {w}")
    else:
        print("\n✅ 【語感／未收錄組合提示：0 項】")

    print("\n📋 請將以下檢驗憑證貼入回應末尾之 callout：")
    status_str = "PASS" if not errors else "FAIL"
    print(f"> [!NOTE]")
    print(
        f"> `hakfa_check` 憑證：`[{status_str} | sha256:{short_hash} | 漢字:{cjk_count} | 詞庫詞:{len(multiword_hits)} | ❌違規:{len(errors)} | ⚠️提示:{len(warnings)}]`"
    )
    print("=" * 60)

    return 0 if not errors else 1


def main():
    parser = argparse.ArgumentParser(description='客源翠客話文本體檢與防呆工具 (hakfa_check.py)')
    parser.add_argument('text', nargs='*', help='要檢查的客話文本字串')
    parser.add_argument('-f', '--file', help='要檢查的客話草稿檔案路徑')
    args = parser.parse_args()

    if args.file:
        with open(args.file, encoding='utf-8') as f:
            content = f.read()
    elif args.text:
        content = ' '.join(args.text)
    else:
        content = sys.stdin.read()

    if not content.strip():
        print("請輸入要檢查的客話文本或指定 -f 檔案路徑。", file=sys.stderr)
        sys.exit(2)

    sys.exit(check_text(content))


if __name__ == '__main__':
    main()
