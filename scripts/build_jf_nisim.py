# -*- coding: utf-8 -*-
"""
jf7000 擬音：jf7000 目標字集（基本包＋本土語言包＋臺灣命名包）裡肚，客源翠各腔資料完全無音个字，
用《廣韻》音韻地位、Unihan 粵語讀音、異體字，各腔分別從該腔个已知字學對照，擬出該腔讀音。

做法：
1. 已知字＝該腔認證、教典有單字條目个字（讀音較穩，詞裡肚切出來个音毋用來學；饒平淨用新竹主變體）。
2. 對照表：中古聲母（分等）→ 客語聲母、中古韻（分聲組）→ 客語韻母、中古聲母＋四聲 → 客語調類；
   粵語聲母、韻母、聲調 → 客語，同樣學。兩邊个機率合起來（naive Bayes），
   聲母 × 韻母愛係該腔有个音節，入聲韻配入聲調、非入聲韻配非入聲調。
3. 調類用抽象个（調符字元, 是否入聲）表示，調類 → 數字調從該腔已知資料自動學（取多數）。
4. 同音韻地位个已知字音加分；Unihan 異體字（万→萬）有音个，直接加大分。
5. 第一候選寫入「讀音」，其他候選摎依據寫入備註。

輸出：data/supp/擬音-{四,海,大,平,安,南}.csv（build_supp_dict.py 會收入補字典，分類「擬音」）。
資料來源下載到 .cache/jf-nisim/（毋進 repo）：
- jf7000（justfont，CC BY-SA 4.0）
- tshet-uinh-data《廣韻》（nk2028，CC0）
- Unihan（Unicode, Inc.，Unicode License v3）

用法：python3 scripts/build_jf_nisim.py [--dialect 四 海 大 平 安 南] [--eval]
毋係 process_all_data.py 自動跑个步驟：字表、對照表有變正手動重跑。
"""
import argparse
import collections
import csv
import glob
import io
import math
import os
import random
import re
import sys
import unicodedata
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import build_supp_dict as supp  # noqa: E402

CACHE = os.path.join(ROOT, '.cache', 'jf-nisim')
JF_COMMIT = 'af8f31a1eb0aa2121f2939deef504ea260e8a480'
JF_URL = f'https://raw.githubusercontent.com/justfont/jf7000/{JF_COMMIT}/charset/0.9/list_{{}}.txt'
JF_PACKS = {'base': '基本', 'ext_taiwan': '本土語言', 'ext_naming': '臺灣命名'}
QY_URL = ('https://raw.githubusercontent.com/nk2028/tshet-uinh-data/'
          '21585e22c8a730ca2fd175112f4d18e16d5ce578/%E9%9F%BB%E6%9B%B8/%E5%BB%A3%E9%9F%BB.csv')
UNIHAN_URL = 'https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip'
VARIANT_KEYS = ('kTraditionalVariant', 'kSimplifiedVariant', 'kZVariant', 'kSemanticVariant')
N_CANDIDATES = 5

HAN = supp.HAN
ENTERING = re.compile(r'(b|d|(?<!n)g)$')
INIT = re.compile(r'(ng|zh|ch|sh|rh|[bpmfvdtnlgkhzcsjqx]?)(.*)')
JYUTPING = re.compile(r'(gw|kw|ng|[bpmfdtnlgkhwzcsj]?)([a-z]*?)([1-6])$')
# 中古聲組：韻母對照照聲組分
GROUPS = {'幫': '幫滂並明', '端': '端透定泥', '知': '知徹澄孃', '精': '精清從心邪', '莊': '莊初崇生俟',
          '章': '章昌船書常', '日': '日', '來': '來', '見': '見溪羣疑', '影': '影曉匣云以'}
GROUP_OF = {x: g for g, xs in GROUPS.items() for x in xs}


def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        print(f'  下載 {url}')
        urllib.request.urlretrieve(url, path)
    return path


def nfd(s):
    return unicodedata.normalize('NFD', s)


def bare(s):
    return re.sub(r'[̀-ͯ]', '', nfd(s))


def tone_of(s):
    """回傳抽象調類 tuple：(調符字元, 是否入聲)。"""
    m = re.search(r'[̀-ͯ]', nfd(s))
    return (m.group(0) if m else '', bool(ENTERING.search(bare(s))))


def compose(base, tone):
    """無調音節＋調類 (調符字元, 是否入聲) → 調符音節（調符位置照 tone_mapping.json vowel_priority）。"""
    mark, _ = tone
    if not mark:
        return base
    for v in 'aoeuinm':
        i = base.find(v)
        if i >= 0:
            return unicodedata.normalize('NFC', base[:i + 1] + mark + base[i + 1:])
    return base


def split_syl(s):
    m = INIT.match(bare(s))
    return m.group(1), m.group(2), tone_of(s)


def roundtrip_check(single):
    """往返測試：每腔所有已知單字讀音 s，compose(hi + hf, ht) 愛等於 s。"""
    ok, total, bad = 0, 0, []
    for c, syls in single.items():
        for s in syls:
            total += 1
            hi, hf, ht = split_syl(s)
            rt = compose(hi + hf, ht)
            if rt == s:
                ok += 1
            else:
                bad.append((c, s, rt))
    rate = ok / total if total else 1.0
    print(f'  往返測試：{ok}/{total} ({rate:.2%})')
    if rate < 0.99:
        raise RuntimeError(f'往返測試通過率低過 99%：{bad[:10]}')
    return ok, total


def learn_tone_numbers():
    """從各腔已知資料（教典數字調摎補字典 CSV）自動學「調類 → 數字調」，取多數。"""
    counts = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    for (d, _, disp), num in supp.load_gip_numeric().items():
        m = re.search(r'(\d+)$', num)
        if m:
            counts[d][tone_of(disp)][m.group(1)] += 1
    for d in supp.DIALECTS:
        path = os.path.join(ROOT, 'data', 'supp', f'補字典-{d}.csv')
        if os.path.exists(path):
            with open(path, encoding='utf-8-sig') as f:
                for r in csv.DictReader(f):
                    if r.get('分類') == '擬音':
                        continue
                    disp, num = r['客語標音_顯示'].strip(), r['客語標音_查詢'].strip()
                    m = re.search(r'(\d+)$', num)
                    if disp and m:
                        counts[d][tone_of(disp)][m.group(1)] += 1
    return {d: {t: c.most_common(1)[0][0] for t, c in tc.items()} for d, tc in counts.items()}


def parse_mc(st):
    """音韻地位（例「幫一唐平」）→ 聲母、聲母＋等、聲組＋韻、聲調。"""
    deng = re.search(r'[一二三四]', st)
    rhyme = st[1:-1] + ('入' if st[-1] == '入' else '')
    return st[0], st[0] + (deng.group() if deng else ''), (GROUP_OF.get(st[0], st[0]), rhyme), rhyme, st[-1]


def parse_jyutping(j):
    m = JYUTPING.match(j)
    if not m:
        return None
    sonorant = m.group(1) in ('m', 'n', 'l', 'ng', 'j', 'w')
    return m.group(1), m.group(2), (sonorant, m.group(3) + ('入' if re.search(r'[ptk]$', m.group(2)) else ''))


def load_jf():
    chars, pack_of = [], {}
    for pack, name in JF_PACKS.items():
        with open(fetch(JF_URL.format(pack), f'jf7000-{pack}.txt'), encoding='utf-8') as f:
            for line in f:
                m = re.fullmatch(r'uni([0-9A-F]{4,5})|u([0-9A-F]{5})', line.strip())
                if not m:
                    continue
                ch = chr(int(m.group(1) or m.group(2), 16))
                if HAN.fullmatch(ch) and ch not in pack_of:
                    pack_of[ch] = name
                    chars.append(ch)
    return chars, pack_of


def load_qieyun():
    """字 → {音韻地位: 反切}；音韻地位 → 字。"""
    pos, members = collections.defaultdict(dict), collections.defaultdict(set)
    with open(fetch(QY_URL, '廣韻.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['字頭'] and r['音韻地位']:
                pos[r['字頭']][r['音韻地位']] = r['反切']
                members[r['音韻地位']].add(r['字頭'])
    return pos, members


def load_unihan():
    path = fetch(UNIHAN_URL, 'Unihan.zip')
    cant, var = collections.defaultdict(list), collections.defaultdict(set)
    with zipfile.ZipFile(path) as z:
        for line in io.TextIOWrapper(z.open('Unihan_Readings.txt'), encoding='utf-8'):
            if '\tkCantonese\t' in line:
                u, _, v = line.rstrip('\n').split('\t')
                cant[chr(int(u[2:], 16))] = v.split()
        for line in io.TextIOWrapper(z.open('Unihan_Variants.txt'), encoding='utf-8'):
            if line.startswith('#') or not line.strip():
                continue
            u, k, v = line.rstrip('\n').split('\t')
            if k in VARIANT_KEYS:
                a = chr(int(u[2:], 16))
                var[a].update(chr(int(x.split('<')[0][2:], 16)) for x in v.split())
                var[a].discard(a)
    return cant, var


def load_known(records, d):
    """單字條目个讀音、詞裡肚切出來个字（毋使擬）。饒平淨用新竹主變體。"""
    single = collections.defaultdict(set)
    in_words = set()
    for o in records:
        if supp.target_dialect(o['sourceName'], o['label']) != d:
            continue
        if d == '平' and o['label'] not in ('', '竹'):
            continue
        for ph in supp.split_readings(o['phonetic']):
            for w, p in supp.expand_parens(o['word'], ph):
                if not w or not p:
                    continue
                if len(HAN.findall(w)) == 1 and len(w.strip()) == 1:
                    single[w.strip()].update(unicodedata.normalize('NFC', s) for s in supp.SYLLABLE.findall(p))
                for ch, _ in supp.align(w, p) or []:
                    in_words.add(ch)
    return single, in_words


def char_counts(d):
    """各腔認證、教典：華語欄（詞義、翻譯）字頻，客語例句字數。"""
    zh, ex = collections.Counter(), collections.Counter()
    if d != '南':
        dname = supp.DIALECT_NAMES[d]
        for fn in glob.glob(os.path.join(ROOT, 'data', 'cert', f'113{d}*.csv')):
            with open(fn, encoding='utf-8-sig') as f:
                for r in csv.DictReader(f):
                    zh.update(HAN.findall(r.get(f'{dname}華語詞義', '') + r.get(f'{dname}翻譯', '')))
                    ex.update(HAN.findall(r.get(f'{dname}例句', '')))
    with open(os.path.join(ROOT, 'data', 'gip', f'20250630-{d}.csv'), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            # 例句「客語。(華語)」：括號前係客語
            hak, _, trans = r['例句'].partition('(')
            zh.update(HAN.findall(r['釋義'] + trans))
            ex.update(HAN.findall(hak))
    return zh, ex


class Model:
    TABLES = ('mi', 'mi2', 'mf', 'mf2', 'mt', 'ci', 'cf', 'ct')

    def __init__(self, train, single, pos, cant):
        self.single, self.pos, self.cant = single, pos, cant
        self.t = {k: collections.defaultdict(collections.Counter) for k in self.TABLES}
        self.prior = {k: collections.Counter() for k in 'ift'}
        self.inventory = set()
        for c in train:
            for s in single[c]:
                hi, hf, ht = split_syl(s)
                self.inventory.add(hi + hf)
                self.prior['i'][hi] += 1
                self.prior['f'][hf] += 1
                self.prior['t'][ht] += 1
                if len(pos.get(c, ())) == 1:
                    ini, ini_deng, grp_rhyme, rhyme, tone = parse_mc(next(iter(pos[c])))
                    self.t['mi'][ini][hi] += 1
                    self.t['mi2'][ini_deng][hi] += 1
                    self.t['mf'][rhyme][hf] += 1
                    self.t['mf2'][grp_rhyme][hf] += 1
                    self.t['mt'][(ini, tone)][ht] += 1
                if len(cant.get(c, ())) == 1:
                    p = parse_jyutping(cant[c][0])
                    if p:
                        self.t['ci'][p[0]][hi] += 1
                        self.t['cf'][p[1]][hf] += 1
                        self.t['ct'][p[2]][ht] += 1

    def dist(self, table, key, prior):
        c = self.t[table].get(key)
        if not c:
            return None
        n, P = sum(c.values()), self.prior[prior]
        N = sum(P.values())
        return {x: (c[x] + 0.5 * P[x] / N) / (n + 0.5) for x in P}

    def combine(self, ds, prior):
        ds = [d for d in ds if d]
        if not ds:
            return None
        P = self.prior[prior]
        N = sum(P.values())
        out = {}
        for x in P:
            pr = P[x] / N
            out[x] = math.log(pr) + sum(math.log(d[x] + 1e-9) - math.log(pr) for d in ds)
        return out

    def candidates(self, c, members=None, variants=()):
        """→ [(讀音, 分數, 依據…)]，分數高个先。"""
        res, why = {}, collections.defaultdict(list)
        for st in list(self.pos.get(c, ())) or [None]:
            for cp in [parse_jyutping(j) for j in self.cant.get(c, ())] or [None]:
                di, df, dt = [], [], []
                if st:
                    ini, ini_deng, grp_rhyme, rhyme, tone = parse_mc(st)
                    di.append(self.dist('mi2', ini_deng, 'i') or self.dist('mi', ini, 'i'))
                    df.append(self.dist('mf2', grp_rhyme, 'f') or self.dist('mf', rhyme, 'f'))
                    dt.append(self.dist('mt', (ini, tone), 't'))
                if cp:
                    di.append(self.dist('ci', cp[0], 'i'))
                    df.append(self.dist('cf', cp[1], 'f'))
                    dt.append(self.dist('ct', cp[2], 't'))
                I, F, T = self.combine(di, 'i'), self.combine(df, 'f'), self.combine(dt, 't')
                if not (I and F and T):
                    continue
                for i in sorted(I, key=I.get, reverse=True)[:6]:
                    for f in sorted(F, key=F.get, reverse=True)[:6]:
                        b = i + f
                        if b not in self.inventory:
                            continue
                        entering = bool(ENTERING.search(b))
                        for t in T:
                            if entering != t[1]:
                                continue
                            syl, sc = compose(b, t), I[i] + F[f] + T[t]
                            if sc > res.get(syl, -1e9):
                                res[syl] = sc
        # 同音韻地位个已知字
        if members is not None:
            for st in self.pos.get(c, ()):
                for m in sorted(members[st]):
                    if m != c and self.single[m]:
                        for r in self.single[m]:
                            res[r] = res.get(r, -30) + 1.5
                            why[r].append(f'同音韻地位「{m}」')
        # 異體字有單字條目
        for v in sorted(variants):
            for r in self.single.get(v, ()):
                res[r] = res.get(r, -30) + 8
                why[r].append(f'異體「{v}」')
        ranked = sorted(res.items(), key=lambda x: -x[1])[:N_CANDIDATES]
        return [(r, sc, why[r]) for r, sc in ranked]


def evaluate(single, pos, members, cant, var):
    known = [c for c in single if single[c] and (c in pos or c in cant)]
    random.seed(1)
    random.shuffle(known)
    hits, total = [0, 0, 0], 0
    for k in range(5):
        test = known[k::5]
        model = Model(set(known) - set(test), single, pos, cant)
        saved = {c: single[c] for c in test}
        for c in test:
            single[c] = set()
        for c in test:
            cs = [r for r, _, _ in model.candidates(c, members, var.get(c, ()))]
            total += 1
            for j, n in enumerate((1, 3, 5)):
                hits[j] += any(r in saved[c] for r in cs[:n])
        for c in test:
            single[c] = saved[c]
    r1, r3, r5 = hits[0] / total, hits[1] / total, hits[2] / total
    print(f'  交叉驗證：{total} 字；第一候選對 {r1:.1%}、前三 {r3:.1%}、前五 {r5:.1%}')
    return r1, r3, r5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dialect', nargs='*', default=supp.DIALECTS, choices=supp.DIALECTS,
                    help='要跑个腔（預設六腔全跑）')
    ap.add_argument('--eval', action='store_true', help='五摺交叉驗證')
    args = ap.parse_args()
    dialects = args.dialect or supp.DIALECTS

    jf, pack_of = load_jf()
    pos, members = load_qieyun()
    cant, var = load_unihan()
    records = list(supp.load_records())
    tone_numbers = learn_tone_numbers()

    for d in dialects:
        dname = supp.DIALECT_NAMES[d]
        print(f'--- jf7000 擬音（{dname}）---')
        single, in_words = load_known(records, d)
        roundtrip_check(single)
        if args.eval:
            r1, _, _ = evaluate(single, pos, members, cant, var)
            if r1 < 0.5:
                print(f'  ⚠️ {dname} 第一候選準確率 {r1:.1%} < 50%，跳過輸出')
                continue

        tnum = tone_numbers[d]
        model = Model([c for c in single if single[c]], single, pos, cant)
        zh, ex = char_counts(d)
        targets = [c for c in jf if not single[c] and c not in in_words]
        rows, no_cand = [], []
        for c in targets:
            cands = model.candidates(c, members, var.get(c, ()))
            if not cands:
                no_cand.append(c)
                continue
            basis = []
            if c in pos:
                basis.append('廣韻 ' + '、'.join(f'{st}（{fq}切）' for st, fq in pos[c].items()))
            if c in cant:
                basis.append('粵 ' + ' '.join(cant[c]))
            top, _, why = cands[0]
            if why:
                basis.append('、'.join(why[:3]))
            rows.append({
                '字': c,
                '讀音': top,
                '數字調': bare(top) + tnum[tone_of(top)],
                '其他候選': ' '.join(r for r, _, _ in cands[1:]),
                '依據': '；'.join(basis),
                '字包': pack_of[c],
                '字頻': zh[c],
                '例句次數': ex[c],
            })
        rows.sort(key=lambda r: (-r['例句次數'], -r['字頻'], r['字']))
        out = os.path.join(ROOT, 'data', 'supp', f'擬音-{d}.csv')
        with open(out, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\n')
            w.writeheader()
            w.writerows(rows)
        print(f'  jf7000 {len(jf)} 字；{dname}無音 {len(targets)} 字 → 擬音 {len(rows)} 字，無候選 {len(no_cand)} 字'
              f'\n  → {os.path.relpath(out, ROOT)}')
        if no_cand:
            print('  無候選：' + ''.join(no_cand))


if __name__ == '__main__':
    main()
