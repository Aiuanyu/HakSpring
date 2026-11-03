// tests/search_gip_tone_test.js
// 測試查詞框支援 GIP 調符（調型）轉換數字調查詢與無調容錯
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Minimal DOM/window mock 提供給 main.js 測試
const reverseToneMappingData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../reverse_tone_mapping.json'), 'utf8')
);
global.window = {
  reverseToneMappingData: reverseToneMappingData,
  sandhiRulesData: JSON.parse(
    fs.readFileSync(path.join(__dirname, '../sandhi_rules.json'), 'utf8')
  ),
  SUB_DIALECT_FILL: { 南: null, 美: null },
};
global.document = {
  createElement: () => ({ appendChild: () => {}, querySelector: () => null }),
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const {
  classifyTone,
  getDialectCode,
  convertPinyinQueryToNumeric,
  isRomanizedHakka,
  normalizePhonetics,
} = require('../main.js');

test('isRomanizedHakka: 應正確識別含 GIP 調符與帶調字母之客語拼音', () => {
  assert.equal(isRomanizedHakka('sabˋ'), true, 'sabˋ 應被辨識為客話羅馬字');
  assert.equal(isRomanizedHakka('bodˋ ziiˋ'), true, 'bodˋ ziiˋ 應被辨識為客話羅馬字');
  assert.equal(isRomanizedHakka('piangˇ'), true, 'piangˇ 應被辨識為客話羅馬字');
  assert.equal(isRomanizedHakka('sed+'), true, 'sed+ 應被辨識為客話羅馬字');
  assert.equal(isRomanizedHakka('su^'), true, 'su^ 應被辨識為客話羅馬字');
  assert.equal(isRomanizedHakka('sàb'), true, 'HPP 帶調字母應被辨識為客話羅馬字');
  assert.equal(isRomanizedHakka('垃圾'), false, '漢字非羅馬字');
});

test('normalizePhonetics: 應正確剝除 GIP 調符與數字，還原純音節字母', () => {
  assert.equal(normalizePhonetics('sabˋ'), 'sab', 'sabˋ 應剝除重音符號轉為 sab');
  assert.equal(normalizePhonetics('bodˋ'), 'bod', 'bodˋ 應剝除重音符號轉為 bod');
  assert.equal(normalizePhonetics('piangˇ'), 'piang', 'piangˇ 應剝除抑揚符號轉為 piang');
  assert.equal(normalizePhonetics('sed+'), 'sed', 'sed+ 應剝除加號轉為 sed');
  assert.equal(normalizePhonetics('su^'), 'su', 'su^ 應剝除脫字號轉為 su');
  assert.equal(normalizePhonetics('sab2'), 'sab', 'sab2 應剝除數字轉為 sab');
});

test('convertPinyinQueryToNumeric: 四縣腔單音節 GIP 調符精確轉數字調', () => {
  // 1. 陰入聲（促音尾 + ˋ）：四縣調值為 2
  const r1 = convertPinyinQueryToNumeric('sabˋ', '四縣');
  assert.equal(r1.hasTone, true, 'sabˋ 應標記為有調');
  assert.equal(r1.numericQuery, 'sab2', '四縣 sabˋ 應轉為 sab2');

  // 促音 p 尾相容（GIP/PFS 常見寫法 sapˋ）
  const r1p = convertPinyinQueryToNumeric('sapˋ', '四縣');
  assert.equal(r1p.numericQuery, 'sab2', '四縣 sapˋ 應相容轉為 sab2');

  // ASCII 反引號 ` 鍵盤容錯
  const r1tick = convertPinyinQueryToNumeric('sab`', '四縣');
  assert.equal(r1tick.numericQuery, 'sab2', 'ASCII 反引號 sab` 應相容轉為 sab2');

  // 2. 陽平聲（舒聲 + ˇ）：四縣調值為 11
  const r2 = convertPinyinQueryToNumeric('piangˇ', '四縣');
  assert.equal(r2.hasTone, true);
  assert.equal(r2.numericQuery, 'piang11', '四縣 piangˇ 應轉為 piang11');

  // 3. 上聲（舒聲 + ˋ）：四縣調值為 31
  const r3 = convertPinyinQueryToNumeric('ziiˋ', '四縣');
  assert.equal(r3.hasTone, true);
  assert.equal(r3.numericQuery, 'zii31', '四縣 ziiˋ 應轉為 zii31');

  // 4. 陰平聲（舒聲 + ˊ 或 HPP á）：四縣調值為 24
  const r4 = convertPinyinQueryToNumeric('faˊ', '四縣');
  assert.equal(r4.hasTone, true);
  assert.equal(r4.numericQuery, 'fa24', '四縣 faˊ 應轉為 fa24');

  const r4hpp = convertPinyinQueryToNumeric('fá', '四縣');
  assert.equal(r4hpp.hasTone, true);
  assert.equal(r4hpp.numericQuery, 'fa24', '四縣 HPP fá 應轉為 fa24');
});

test('convertPinyinQueryToNumeric: 海陸腔 GIP 調符精確轉數字調', () => {
  // 海陸陰平 53（ˋ）
  const rHai1 = convertPinyinQueryToNumeric('bauˋ', '海陸');
  assert.equal(rHai1.hasTone, true);
  assert.equal(rHai1.numericQuery, 'bau53', '海陸 bauˋ 應轉為 bau53');

  // 海陸陰入 5（+）
  const rHai2 = convertPinyinQueryToNumeric('sed+', '海陸');
  assert.equal(rHai2.hasTone, true);
  assert.equal(rHai2.numericQuery, 'sed5', '海陸 sed+ 應轉為 sed5');

  // 海陸上聲 24（ˊ）
  const rHai3 = convertPinyinQueryToNumeric('hoiˊ', '海陸');
  assert.equal(rHai3.hasTone, true);
  assert.equal(rHai3.numericQuery, 'hoi24', '海陸 hoiˊ 應轉為 hoi24');
});

test('convertPinyinQueryToNumeric: 多音節詞語與連字號轉換', () => {
  // 空格分隔多音節
  const rMulti = convertPinyinQueryToNumeric('bodˋ ziiˋ', '四縣');
  assert.equal(rMulti.hasTone, true);
  assert.equal(rMulti.numericQuery, 'bod2 zii31', '四縣 bodˋ ziiˋ 應轉為 bod2 zii31');

  // 連字號分隔多音節
  const rHyphen = convertPinyinQueryToNumeric('bodˋ-ziiˋ', '四縣');
  assert.equal(rHyphen.hasTone, true);
  assert.equal(rHyphen.numericQuery, 'bod2-zii31', '四縣 bodˋ-ziiˋ 應轉為 bod2-zii31');

  // 原本即為數字調時保持原樣
  const rNum = convertPinyinQueryToNumeric('la31 sab2', '四縣');
  assert.equal(rNum.hasTone, true);
  assert.equal(rNum.numericQuery, 'la31 sab2', '既有數字調應完整保留');

  // 無調字母輸入
  const rPlain = convertPinyinQueryToNumeric('sab', '四縣');
  assert.equal(rPlain.hasTone, false, '無調字母 hasTone 應為 false');
  assert.equal(rPlain.baseQuery, 'sab');
});

test('搜尋過濾整合驗證：四縣 sabˋ 正確比對資料庫數字調並具備 Fallback 容錯', () => {
  // 模擬資料庫項目
  const mockDatabase = [
    { 客家語: '垃圾', 客語標音_查詢: 'la31 sab2' },
    { 客家語: '眨目', 客語標音_查詢: 'sab2 mug2' },
    { 客家語: '干涉', 客語標音_查詢: 'gon24 sab5' },
    { 客家語: '平板', 客語標音_查詢: 'piang11 ban31' },
  ];

  // 1. 宜庭先生場景：輸入 sabˋ
  const parsed = convertPinyinQueryToNumeric('sabˋ', '四縣');
  assert.equal(parsed.numericQuery, 'sab2');

  const matchedItems = mockDatabase.filter((item) =>
    item.客語標音_查詢.includes(parsed.numericQuery)
  );

  assert.equal(matchedItems.length, 2, 'sabˋ 應精確命中陰入聲的「垃圾」與「眨目」');
  assert.equal(matchedItems[0].客家語, '垃圾');
  assert.equal(matchedItems[1].客家語, '眨目');

  // 2. 測試若精確聲調無結果時的 fallback 行為
  const parsedNonExistent = convertPinyinQueryToNumeric('sabˇ', '四縣'); // 四縣 sab 沒有陽平 11
  let fallbackMatches = mockDatabase.filter((item) =>
    item.客語標音_查詢.includes(parsedNonExistent.numericQuery)
  );
  assert.equal(fallbackMatches.length, 0, 'sabˇ 精確查無結果');

  // Fallback 觸發：拿無調 baseQuery 模糊搜尋
  if (fallbackMatches.length === 0 && parsedNonExistent.baseQuery) {
    fallbackMatches = mockDatabase.filter((item) =>
      normalizePhonetics(item.客語標音_查詢).includes(parsedNonExistent.baseQuery)
    );
  }
  assert.equal(
    fallbackMatches.length,
    3,
    'Fallback 應能以無調 sab 搜出「垃圾」、「眨目」與「干涉」'
  );
});
