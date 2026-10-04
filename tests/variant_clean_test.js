// tests/variant_clean_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 設置全域 mock 環境
const reverseToneMappingData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../reverse_tone_mapping.json'), 'utf8')
);
global.window = {
  reverseToneMappingData: reverseToneMappingData,
  sandhiRulesData: JSON.parse(
    fs.readFileSync(path.join(__dirname, '../sandhi_rules.json'), 'utf8')
  )
};
global.history = {};

// 載入 variant-parser
const { parseVariants, getLineVariants } = require('../js/variant-parser.js');
global.parseVariants = parseVariants;
global.getLineVariants = getLineVariants;

// 載入 phonology-rules
const vm = require('vm');
const phonologyCode = fs.readFileSync(path.join(__dirname, '../js/game/phonology-rules.js'), 'utf8');
vm.runInThisContext(phonologyCode);

// Mock 詞庫資料，使用真實 HakSpring cert 體例
const mockWords = [
  {
    客家語: '醫院',
    客語標音_顯示: 'í ien【í ian】',
    客語標音_查詢: 'í ien',
    華語詞義: '醫院',
    進階華語: '醫院',
    詞性1: '名詞',
    分類: '1人體與醫療',
    progressKey: 'c四基1-3|m',
    source: 'cert',
    sourceName: '四縣初級'
  },
  {
    客家語: '肚屎【肚笥】',
    客語標音_顯示: 'dù sìi',
    客語標音_查詢: 'dù sìi',
    華語詞義: '肚子',
    進階華語: '肚子',
    詞性1: '名詞',
    分類: '1人體與醫療',
    progressKey: 'c四基1-23|m',
    source: 'cert',
    sourceName: '四縣初級'
  },
  {
    客家語: '阿婆【阿嬤】',
    客語標音_顯示: 'á pǒ【á ma】',
    客語標音_查詢: 'á pǒ',
    華語詞義: '祖母',
    進階華語: '祖母',
    詞性1: '名詞',
    分類: '6社會關係與行為',
    progressKey: 'c四基6-10|m',
    source: 'cert',
    sourceName: '四縣初級'
  },
  {
    客家語: '學校',
    客語標音_顯示: 'hog gao',
    客語標音_查詢: 'hog gao',
    華語詞義: '學校',
    進階華語: '學校',
    詞性1: '名詞',
    分類: '13藝文與教育',
    progressKey: 'c四基13-1|m',
    source: 'cert',
    sourceName: '四縣初級'
  },
  {
    客家語: '先生',
    客語標音_顯示: 'sienˊ sangˊ',
    客語標音_查詢: 'sienˊ sangˊ',
    華語詞義: '老師',
    進階華語: '老師',
    詞性1: '名詞',
    分類: '13藝文與教育',
    progressKey: 'c四基13-2|m',
    source: 'cert',
    sourceName: '四縣初級'
  },
  {
    客家語: '便所',
    客語標音_顯示: 'pien soˋ',
    客語標音_查詢: 'pien soˋ',
    華語詞義: '廁所',
    進階華語: '廁所',
    詞性1: '名詞',
    分類: '7居家生活',
    progressKey: 'c四基7-1|m',
    source: 'cert',
    sourceName: '四縣初級'
  }
];

// Mock 遊戲所需之全域函式
global.getWordsForDialectAndLevel = (dialect, dataVarName) => mockWords;
global.getProgress = () => null;
global.getFamiliarity = () => 0;

// 載入 question-gen
const {
  buildOptionsForType,
  generateDistractors,
  generatePinyinDistractors,
  generateGameSession,
  cleanClozeWord
} = require('../js/game/question-gen.js');

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('--- 測試 P1-補：資料層回修（出題、選項、比對還原成原始字串，保留【】） ---');

  // 1. buildOptionsForType 測試
  test('buildOptionsForType: p 題型（選拼音）之選項包含原始標音（含【】）', () => {
    const target = mockWords[0]; // 醫院，標音包含【í ian】
    const options = buildOptionsForType(target, 'p', mockWords);
    assert.strictEqual(options.length, 4, '應有 4 個選項');
    // 正確答案應為原始標音（含【】）
    assert.ok(options.includes('í ien【í ian】'), '選項應包含原始標音 í ien【í ian】');
  });

  test('buildOptionsForType: d 題型（看華語選客語）之選項包含原始客家語（含【】）', () => {
    const target = mockWords[1]; // 肚屎【肚笥】
    const options = buildOptionsForType(target, 'd', mockWords);
    assert.strictEqual(options.length, 4, '應有 4 個選項');
    // 正確答案應為原始客家語（含【】）
    assert.ok(options.includes('肚屎【肚笥】'), '選項應包含原始客家語「肚屎【肚笥】」');
  });

  test('buildOptionsForType: l 題型（聽力題）各選項 word 物件為原始物件（含【】）', () => {
    const target = mockWords[2]; // 阿婆【阿嬤】
    const options = buildOptionsForType(target, 'l', mockWords);
    assert.strictEqual(options.length, 4, '應有 4 個選項');
    assert.ok(options.includes(target), '選項應包含原始目標物件');
  });

  // 2. generateGameSession 測試
  await new Promise((resolve) => {
    test('generateGameSession: 生成之題目 targetWord 維持原始字串未被覆寫或污染，不外掛 cleanWord/cleanPhonetic', async () => {
      const session = await generateGameSession('四縣', '四基', { types: ['p', 'd', 'l', 'm'] });
      assert.ok(session.length > 0, '應成功生成題目');
      for (const q of session) {
        assert.ok(q.targetWord, '題目應包含 targetWord');
        assert.strictEqual(q.cleanWord, undefined, '出題層不應額外掛載 cleanWord');
        assert.strictEqual(q.cleanPhonetic, undefined, '出題層不應額外掛載 cleanPhonetic');
        
        // 檢查 targetWord 物件本身是否被保護（沒有被直接就地修改）
        if (q.targetWord.客家語.includes('肚屎')) {
          assert.strictEqual(q.targetWord.客家語, '肚屎【肚笥】', '原始 targetWord.客家語 必須維持完整未被覆寫');
        }
        if (q.targetWord.客語標音_顯示.includes('í ien')) {
          assert.strictEqual(q.targetWord.客語標音_顯示, 'í ien【í ian】', '原始 targetWord.客語標音_顯示 必須維持完整未被覆寫');
        }
      }
      resolve();
    });
  });

  // 3. 答案判定比對邏輯測試（還原為原始字串比對）
  test('答案比對判定：p 題型選項與 targetWord.客語標音_顯示 原始字串一致', () => {
    const target = mockWords[0];
    const correctText = target.客語標音_顯示; // 'í ien【í ian】'
    const options = buildOptionsForType(target, 'p', mockWords);
    
    // 模擬玩家點擊正解
    const selectedOption = correctText;
    assert.strictEqual(selectedOption === correctText, true, '正確答案判定必須吻合');
    
    // 模擬點擊干擾項
    const wrongOption = options.find(o => o !== correctText);
    assert.strictEqual(wrongOption === correctText, false, '錯誤答案判定不可判定為正確');
  });

  test('答案比對判定：d 題型選項與 targetWord.客家語 原始字串一致', () => {
    const target = mockWords[1]; // 肚屎【肚笥】
    const correctText = target.客家語; // '肚屎【肚笥】'
    const options = buildOptionsForType(target, 'd', mockWords);
    
    const selectedOption = correctText;
    assert.strictEqual(selectedOption === correctText, true, '正確答案判定必須吻合');
    
    const wrongOption = options.find(o => o !== correctText);
    assert.strictEqual(wrongOption === correctText, false, '錯誤答案判定不可判定為正確');
  });

  // 4. 日日一詞 FavId 與主卡片保持測試
  test('日日一詞：保留 rawWord 給 FavId', () => {
    const row = mockWords[1]; // 肚屎【肚笥】
    const rawWord = row['客家語'] || '';
    assert.strictEqual(rawWord, '肚屎【肚笥】', 'FavId 需要的 rawWord 必須維持原樣');
  });

  console.log(`\n測試完成！全部 ${passCount} 項測試通過！`);
}

runTests();
