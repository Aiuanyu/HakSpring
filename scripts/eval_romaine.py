#!/usr/bin/env python3
"""
Romaine 自動化引擎（js/romaine-auto.js）基準評分與錯題剖析腳本。
透過 macOS JavaScriptCore (jsc) 直接執行真實前端 RomaineAutoEngine，
計算四縣 P0 與詔安黃金語料（Leave-One-Out 交叉驗證）的：
  1. 音節讀音正確率（主指標）
  2. 詞級一致率（嚴格 / 忽略大小寫）
  3. 斷詞邊界 F1
  4. 錯誤詞彙統計（Top 20 失分點）
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile

JSC_BIN = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
DEFAULT_ROOT = "/Users/gjrobert/NAS/projects/HakSpring-romaine-auto"

JS_HARNESS = r"""
const window = globalThis;
const navigator = {};
const document = undefined;
const localStorage = {
  _map: Object.create(null),
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._map, k) ? this._map[k] : null; },
  setItem(k, v) { this._map[k] = String(v); },
  removeItem(k) { delete this._map[k]; },
};

// 由 Python 注入 __FILES__ (path -> string) 與 __DATASETS__
function fetch(url) {
  const clean = String(url).replace(/^\.\//, '').replace(/\?.*$/, '');
  const raw = __FILES__[clean];
  if (raw === undefined) {
    return Promise.resolve({
      ok: false,
      status: 404,
      json() { return Promise.reject(new Error('Not found: ' + clean)); },
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json() { return Promise.resolve(JSON.parse(raw)); },
  });
}

function extractSyllables(tokens) {
  const syls = [];
  for (const tok of tokens) {
    if (tok.punct || tok.nonCjk || tok.isComment || !tok.hpp) continue;
    const parts = String(tok.hpp).trim().split(/[\s'-]+/).filter(Boolean);
    for (const p of parts) {
      syls.push(p.toLowerCase());
    }
  }
  return syls;
}

function lcsLength(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }
  return dp[m][n];
}

function extractWordSpans(tokens) {
  const spans = new Set();
  let offset = 0;
  for (const tok of tokens) {
    const cleanHan = String(tok.han || '').replace(/[~#\-=+]/g, '');
    const len = Array.from(cleanHan).length;
    if (!tok.punct && !tok.nonCjk && !tok.isComment && len > 0) {
      spans.add(`${offset}:${offset + len}`);
    }
    offset += len;
  }
  return spans;
}

function cleanGoldHanForInput(han) {
  // 移除人工控詞與標記字元，保留換行與純諸夏字/標點結構
  return String(han || '').replace(/[~#\-=+]/g, '');
}

function evaluateDataset(engine, items, leaveOneOutAllItems) {
  let totalGoldSyllables = 0;
  let totalCorrectSyllables = 0;
  let totalGoldWords = 0;
  let totalExactWords = 0;
  let totalCaseInsensitiveWords = 0;
  let segTP = 0;
  let segPred = 0;
  let segGold = 0;

  const errorStats = new Map();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (leaveOneOutAllItems) {
      engine.repoVerifiedItems = leaveOneOutAllItems.filter((x) => x.id !== item.id);
      engine.applyVerifiedLearning([]);
    }

    const inputText = cleanGoldHanForInput(item.han);
    const predTokens = engine.segmentAndConvert(inputText);

    // 1. 音節正確率
    const goldSyl = extractSyllables(item.tokens);
    const predSyl = extractSyllables(predTokens);
    const matchedSyl = lcsLength(goldSyl, predSyl);
    totalGoldSyllables += goldSyl.length;
    totalCorrectSyllables += matchedSyl;

    // 2. 詞級一致率
    const predMap = new Map();
    let pOff = 0;
    for (const t of predTokens) {
      const cleanHan = String(t.han || '').replace(/[~#\-=+]/g, '');
      const len = Array.from(cleanHan).length;
      if (!t.punct && !t.nonCjk && !t.isComment && len > 0) {
        predMap.set(`${pOff}:${pOff + len}`, t);
      }
      pOff += len;
    }

    let gOff = 0;
    for (const t of item.tokens) {
      const cleanHan = String(t.han || '').replace(/[~#\-=+]/g, '');
      const len = Array.from(cleanHan).length;
      if (!t.punct && !t.nonCjk && !t.isComment && len > 0) {
        totalGoldWords++;
        const key = `${gOff}:${gOff + len}`;
        const match = predMap.get(key);
        const gHpp = String(t.hpp || '').trim();
        if (match && match.han === cleanHan) {
          const pHpp = String(match.hpp || '').trim();
          if (pHpp === gHpp) totalExactWords++;
          if (pHpp.toLowerCase() === gHpp.toLowerCase()) {
            totalCaseInsensitiveWords++;
          } else {
            const eKey = `讀音錯 | ${cleanHan}: 正=${gHpp.toLowerCase()} vs 測=${pHpp.toLowerCase()}`;
            if (!errorStats.has(eKey)) errorStats.set(eKey, { count: 0, example: item.han.slice(0, 24) });
            errorStats.get(eKey).count++;
          }
        } else {
          // 斷詞沒對上，找出涵蓋該範圍的預測詞
          const cover = [];
          let cur = 0;
          for (const pt of predTokens) {
            const pLen = Array.from(String(pt.han || '').replace(/[~#\-=+]/g, '')).length;
            if (!pt.punct && !pt.nonCjk && cur < gOff + len && cur + pLen > gOff) {
              cover.push(`${pt.han}(${pt.hpp})`);
            }
            cur += pLen;
          }
          const eKey = `斷詞錯 | ${cleanHan}(${gHpp.toLowerCase()}) -> ${cover.join(' ')}`;
          if (!errorStats.has(eKey)) errorStats.set(eKey, { count: 0, example: item.han.slice(0, 24) });
          errorStats.get(eKey).count++;
        }
      }
      gOff += len;
    }

    // 3. 斷詞邊界 F1
    const goldSpans = extractWordSpans(item.tokens);
    const predSpans = extractWordSpans(predTokens);
    segGold += goldSpans.size;
    segPred += predSpans.size;
    for (const s of predSpans) {
      if (goldSpans.has(s)) segTP++;
    }
  }

  const segP = segPred ? segTP / segPred : 0;
  const segR = segGold ? segTP / segGold : 0;
  const segF1 = segP + segR ? (2 * segP * segR) / (segP + segR) : 0;

  const topErrors = Array.from(errorStats.entries())
    .map(([desc, info]) => ({ desc, count: info.count, example: info.example }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    items: items.length,
    totalGoldSyllables,
    totalCorrectSyllables,
    syllableAccuracy: totalGoldSyllables ? totalCorrectSyllables / totalGoldSyllables : 0,
    totalGoldWords,
    wordExactMatch: totalGoldWords ? totalExactWords / totalGoldWords : 0,
    wordCaseInsensitiveMatch: totalGoldWords ? totalCaseInsensitiveWords / totalGoldWords : 0,
    segPrecision: segP,
    segRecall: segR,
    segF1,
    topErrors,
  };
}

async function runAll() {
  const results = {};

  // 1. 四縣 P0 (tests/romaine_p0.json)
  if (__DATASETS__.p0_xiien && __DATASETS__.p0_xiien.length) {
    const engine = new RomaineAutoEngine();
    await engine.init('.', 'xiien');
    engine.repoVerifiedItems = [];
    engine.applyVerifiedLearning([]);
    results.xiien_p0 = evaluateDataset(engine, __DATASETS__.p0_xiien, null);
  }

  // 2. 詔安黃金語料 (Leave-One-Out 與 Zero-Shot 對照)
  if (__DATASETS__.gold_zhioon && __DATASETS__.gold_zhioon.length) {
    const engine0 = new RomaineAutoEngine();
    await engine0.init('.', 'zhioon');
    engine0.repoVerifiedItems = [];
    engine0.applyVerifiedLearning([]);
    results.zhioon_zero_shot = evaluateDataset(engine0, __DATASETS__.gold_zhioon, null);

    const engineLoo = new RomaineAutoEngine();
    await engineLoo.init('.', 'zhioon');
    results.zhioon_loo = evaluateDataset(engineLoo, __DATASETS__.gold_zhioon, __DATASETS__.gold_zhioon);
  }

  print(JSON.stringify(results, null, 2));
}

runAll().catch((err) => {
  print('ERROR: ' + (err && err.stack ? err.stack : String(err)));
});
"""


def collect_needed_files(root: str) -> dict[str, str]:
    files = {}
    needed = [
        "sandhi_rules.json",
        "reverse_tone_mapping.json",
        "data/romaine/xiien_stats.json",
        "data/romaine/xiien_prefs.json",
        "data/romaine/zhioon_stats.json",
        "data/romaine/zhioon_prefs.json",
        "data/gip/20261020-四.json",
        "data/gip/20261020-南.json",
        "data/gip/20261020-安.json",
        "data/supp/補字典-四.json",
        "data/supp/補字典-南.json",
        "data/supp/補字典-安.json",
        "data/curated/加詞-四.json",
        "data/curated/加詞-安.json",
    ]
    for d_char, lvl in [
        ("四", "基"), ("四", "初"), ("四", "中"), ("四", "中高"), ("四", "高"),
        ("安", "基"), ("安", "初"), ("安", "中"), ("安", "中高"), ("安", "高"),
    ]:
        needed.append(f"data/cert/115{d_char}{lvl}.json")

    for rel in needed:
        full = os.path.join(root, rel)
        if os.path.exists(full):
            with open(full, "r", encoding="utf-8") as f:
                files[rel] = f.read()
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = os.path.abspath(args.root)

    p0_path = os.path.join(root, "tests", "romaine_p0.json")
    gold_path = os.path.join(root, "data", "romaine", "verified_sentences.json")

    p0_items = []
    if os.path.exists(p0_path):
        with open(p0_path, "r", encoding="utf-8") as f:
            p0_items = json.load(f).get("items", [])

    zhioon_items = []
    if os.path.exists(gold_path):
        with open(gold_path, "r", encoding="utf-8") as f:
            for it in json.load(f).get("items", []):
                if it.get("dialect") in ("zhaoan", "zhioon"):
                    zhioon_items.append(it)

    files_map = collect_needed_files(root)
    datasets = {"p0_xiien": p0_items, "gold_zhioon": zhioon_items}

    with open(os.path.join(root, "js", "romaine-join.js"), "r", encoding="utf-8") as f:
        join_js = f.read()
    with open(os.path.join(root, "js", "romaine-auto.js"), "r", encoding="utf-8") as f:
        auto_js = f.read()

    bundle = "\n".join([
        f"const __FILES__ = {json.dumps(files_map, ensure_ascii=False)};",
        f"const __DATASETS__ = {json.dumps(datasets, ensure_ascii=False)};",
        join_js,
        auto_js,
        JS_HARNESS,
    ])

    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as tf:
        tf.write(bundle)
        tmp_js = tf.name

    try:
        proc = subprocess.run([JSC_BIN, tmp_js], capture_output=True, text=True, check=True)
        out = proc.stdout.strip()
        if out.startswith("ERROR:"):
            raise RuntimeError(out)
        data = json.loads(out)
    finally:
        if os.path.exists(tmp_js):
            os.remove(tmp_js)

    for name, res in data.items():
        print("=" * 60)
        print(f"📊 {name} (句數={res['items']}, 總音節={res['totalGoldSyllables']}, 總詞數={res['totalGoldWords']})")
        print(f"  音節讀音正確率 (主指標): {res['syllableAccuracy']*100:.2f}% ({res['totalCorrectSyllables']}/{res['totalGoldSyllables']})")
        print(f"  詞級一致率 (忽略大小寫): {res['wordCaseInsensitiveMatch']*100:.2f}% | (嚴格大小寫): {res['wordExactMatch']*100:.2f}%")
        print(f"  斷詞邊界 F1: {res['segF1']*100:.2f}% (P={res['segPrecision']*100:.2f}%, R={res['segRecall']*100:.2f}%)")
        print("  Top 錯誤:")
        for e in res["topErrors"][:15]:
            print(f"    [{e['count']}x] {e['desc']}  (例: {e['example']}…)")


if __name__ == "__main__":
    main()
