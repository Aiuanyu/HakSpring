# -*- coding: utf-8 -*-
"""
審音佇列：產生 review-readings.html 讀个 review/queue.json。

佇列（第一版）：
- 南四縣待審：次方言補音推毋出个認證四縣詞條（有音節無證據）。逐音節列出推導結果，
  待定个音節附候選（這隻字在教典南四縣、已標南音个認證詞裡肚出現過个南音，含次數摎出處詞）。
- 教典待確認：單字詞，教典南四縣个音摎逐音節推導無共樣（gip-check，可能同形異義）。
- 依字歸組：南四縣待審个待定音節，照（字、北音）歸組（「仔」再分詞性），一組定一擺，
  套到全部有這隻音節个詞。結果匯出 data/sub-dialects-fill/人工字音-南四縣.csv。

審好个結果由 HTML 匯出 data/sub-dialects-fill/人工-南四縣.csv，
build_subdialect_fill.py 會當「人工」推導層讀轉去。

用法：python3 scripts/build_review_queue.py（process_all_data.py --only-supp 以後跑）
"""
import csv
import io
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import build_subdialect_fill as fill  # noqa: E402

# 毋放 data/：網站毋讀這个檔，放 data/ 就愛 bump data_version、害使用者重新下載全部資料
OUT = os.path.join(ROOT, 'review', 'queue.json')
MAX_EXAMPLES = 4
MAX_CANDIDATES = 6


def cert_details():
    """（檔、編號）→ 華語詞義、例句（認證 JSON）。"""
    out = {}
    cert_dir = os.path.join(ROOT, 'data', 'cert')
    for fn in os.listdir(cert_dir):
        if not (fn.startswith('113四') and fn.endswith('.json')):
            continue
        with open(os.path.join(cert_dir, fn), encoding='utf-8') as f:
            for r in csv.DictReader(io.StringIO(json.load(f)['content'])):
                out[(fn, r['編號'])] = {'華語詞義': r['華語詞義'], '例句': r['例句'].split('<br>')[0]}
    return out


def gip_meanings(d):
    """教典詞目 → [釋義…]（一隻讀音一條，照原始順序）。"""
    out = defaultdict(list)
    with open(os.path.join(ROOT, 'data', 'gip', f'20250630-{d}.json'), encoding='utf-8') as f:
        for r in csv.DictReader(io.StringIO(json.load(f)['content'])):
            out[r['客家語']].append(r['華語詞義'].replace('<br>', ' ')[:60])
    return out


def south_evidence(cert, gip):
    """字 → 南音節 → {'n', 'ex': [(詞, 南讀音, 來源)]}：教典南四縣全部詞、已標南音个認證詞。"""
    ev = defaultdict(lambda: defaultdict(lambda: {'n': 0, 'ex': []}))

    def add(word, reading, src):
        al = fill.aligned(word, reading)
        if not al:
            return
        for ch, s in zip(*al):
            rec = ev[ch][s]
            rec['n'] += 1
            if len(rec['ex']) < MAX_EXAMPLES:
                rec['ex'].append([word, reading, src])

    for word, readings in gip['南'].items():
        for r in readings:
            add(word, r, '教典南四縣')
    for e in cert.values():
        if e['south'] and e['south_word'] == e['word']:
            add(e['word'], e['south'], e['src'])
    return ev


def main():
    cert, gip = fill.load_entries()
    table = fill.learn_table([p for e in cert.values() for p in fill.cert_pairs(e)] + fill.gip_pairs(gip))
    details = cert_details()
    meanings = gip_meanings('南')
    ev = south_evidence(cert, gip)

    pending, gip_check = [], []
    for (fname, eid), e in sorted(cert.items()):
        if e['south'] or not e['north']:
            continue
        south, how, sm = fill.derive(e, table, gip)
        layer = fill.entry_layer(how, sm)
        base = {
            'id': f"{fname.replace('.json', '')}|{eid}",
            '來源檔': fname.replace('.json', ''),
            '編號': eid,
            '詞目': e['word'],
            '詞性': e['pos'],
            '北四縣': e['north'],
            **details.get((fname, eid), {}),
        }
        if layer is None:
            matches, slots, n_slots = fill.syllable_slots(e['north'])
            han = fill.HAN.findall(e['word'])
            chars = han if len(han) == n_slots else None
            sylls = []
            for i, m in enumerate(matches):
                north_syl = fill.nfc(m.group())
                derived = fill.syllables(south)[i] if i < len(fill.syllables(south)) else north_syl
                item = {'字': chars[slots[i]] if chars else '', '北': north_syl, '推導': derived, '方法': sm[i] if i < len(sm) else ''}
                if item['方法'] == 'same':
                    cands = ev.get(item['字'], {}) if item['字'] else {}
                    item['候選'] = [
                        {'音': s, '次數': rec['n'], '出處': rec['ex']}
                        for s, rec in sorted(cands.items(), key=lambda x: -x[1]['n'])[:MAX_CANDIDATES]
                    ]
                sylls.append(item)
            pending.append({**base, 'queue': '南四縣待審', '推導': south, '音節': sylls,
                            '對得齊': bool(chars)})
        elif how == 'gip-check':
            derived = fill.derive_syllables(e, table)[0]
            gip_readings = gip['南'].get(e['word'], [])
            gip_check.append({**base, 'queue': '教典待確認', '推導': south, '逐音節推導': derived,
                              '教典南四縣': [[r, (meanings.get(e['word']) or [''])[min(i, len(meanings.get(e['word']) or ['']) - 1)]]
                                         for i, r in enumerate(gip_readings)]})

    # 依字歸組：（字、北音、詞性）；詞性淨「仔」用，其他字毋分
    groups = {}
    for it in pending:
        for s in it['音節']:
            if s['方法'] != 'same' or not s['字']:
                continue
            pos = it['詞性'] if s['字'] == '仔' else ''
            key = (s['字'], s['北'], pos)
            g = groups.setdefault(key, {
                'id': f"G|{s['字']}|{s['北']}|{pos}", 'queue': '依字歸組',
                '字': s['字'], '北音': s['北'], '詞性': pos, '候選': s.get('候選', []), '詞條': [],
            })
            if not any(x['id'] == it['id'] for x in g['詞條']):
                g['詞條'].append({'id': it['id'], '詞目': it['詞目'], '北四縣': it['北四縣'], '詞性': it['詞性'],
                                 '華語詞義': (it.get('華語詞義') or '')[:30]})
    group_list = sorted(groups.values(), key=lambda g: (-len(g['詞條']), g['字'], g['北音']))
    for g in group_list:
        g['條數'] = len(g['詞條'])

    tz = timezone(timedelta(hours=8))
    data = {
        'generated': datetime.now(tz).strftime('%Y-%m-%dT%H:%M:%S+08:00'),
        'note': '由 scripts/build_review_queue.py 產生，毋好手改。審音結果由 review-readings.html 匯出 data/sub-dialects-fill/人工-南四縣.csv。',
        'queues': {'依字歸組': group_list, '南四縣待審': pending, '教典待確認': gip_check},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    with_cands = sum(1 for it in pending if all(s.get('候選') for s in it['音節'] if s['方法'] == 'same'))
    print(f'--- 審音佇列 ---\n  依字歸組 {len(group_list)} 組；南四縣待審 {len(pending)} 條（待定音節全部有候選 {with_cands}）；教典待確認 {len(gip_check)} 條'
          f'\n  → {os.path.relpath(OUT, ROOT)}（{os.path.getsize(OUT) // 1024} KB）')


if __name__ == '__main__':
    main()
