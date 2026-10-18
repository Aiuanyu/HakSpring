// tests/pfs_converter_test.js
// 驗證 HagPinPlus 轉 PFS（臺灣客語白話字）核心轉換模組
const assert = require('assert');
const {
  convertSyllableToPFS,
  toPFS,
  isSiXianDialect,
  isPfsDisplayActive
} = require('../js/pfs-converter.js');

console.log('🧪 Starting PFS converter unit tests...');

// 1. 六調轉換測試（陰平、陽平、上聲、去聲、陰入、陽入）
// 陰平 (24): acute -> circumflex (ˆ)
assert.strictEqual(convertSyllableToPFS('fú'), 'fû');
assert.strictEqual(convertSyllableToPFS('gá'), 'kâ');
assert.strictEqual(convertSyllableToPFS('sám'), 'sâm');
assert.strictEqual(convertSyllableToPFS('tién'), 'thiên');

// 陽平 (11): caron -> grave (̀)
assert.strictEqual(convertSyllableToPFS('fǔ'), 'fù');
assert.strictEqual(convertSyllableToPFS('ngǐn'), 'ngìn');
assert.strictEqual(convertSyllableToPFS('iěn'), 'yèn');
assert.strictEqual(convertSyllableToPFS('mǎ'), 'mà');

// 上聲 (31): grave -> acute (́)
assert.strictEqual(convertSyllableToPFS('fù'), 'fú');
assert.strictEqual(convertSyllableToPFS('sùi'), 'súi');
assert.strictEqual(convertSyllableToPFS('diàu'), 'tiáu');
assert.strictEqual(convertSyllableToPFS('ià'), 'yá');

// 去聲 (55): 無調符 -> 無調符
assert.strictEqual(convertSyllableToPFS('fu'), 'fu');
assert.strictEqual(convertSyllableToPFS('tai'), 'thai');
assert.strictEqual(convertSyllableToPFS('zo'), 'cho');
assert.strictEqual(convertSyllableToPFS('se'), 'se');
assert.strictEqual(convertSyllableToPFS('cui'), 'chhui');

// 陰入 (2): 帶 grave 且結尾為 b/d/g -> 無調符 + p/t/k
assert.strictEqual(convertSyllableToPFS('fùg'), 'fuk');
assert.strictEqual(convertSyllableToPFS('bàg'), 'pak');
assert.strictEqual(convertSyllableToPFS('dèd'), 'tet');
assert.strictEqual(convertSyllableToPFS('sìd'), 'sit');
assert.strictEqual(convertSyllableToPFS('qìd'), 'chhit');
assert.strictEqual(convertSyllableToPFS('ìd'), 'yit');

// 陽入 (5): 無調符且結尾為 b/d/g -> 直豎符 (̍) + p/t/k
assert.strictEqual(convertSyllableToPFS('fug'), 'fu̍k');
assert.strictEqual(convertSyllableToPFS('pag'), 'pha̍k');
assert.strictEqual(convertSyllableToPFS('ded'), 'te̍t');
assert.strictEqual(convertSyllableToPFS('liug'), 'liu̍k');
assert.strictEqual(convertSyllableToPFS('log'), 'lo̍k');

console.log('  ✅ 1. 聲調與調值映射測試 PASS');

// 2. 聲母轉換測試
assert.strictEqual(convertSyllableToPFS('bàg'), 'pak');   // b -> p
assert.strictEqual(convertSyllableToPFS('pag'), 'pha̍k'); // p -> ph
assert.strictEqual(convertSyllableToPFS('dù'), 'tú');     // d -> t
assert.strictEqual(convertSyllableToPFS('tai'), 'thai');  // t -> th
assert.strictEqual(convertSyllableToPFS('gá'), 'kâ');     // g -> k
assert.strictEqual(convertSyllableToPFS('kói'), 'khôi');  // k -> kh
assert.strictEqual(convertSyllableToPFS('zo'), 'cho');    // z -> ch (洪音)
assert.strictEqual(convertSyllableToPFS('cá'), 'chhâ');   // c -> chh (洪音)
assert.strictEqual(convertSyllableToPFS('jia'), 'chia');  // j -> ch (細音)
assert.strictEqual(convertSyllableToPFS('qìd'), 'chhit'); // q -> chh (細音)
assert.strictEqual(convertSyllableToPFS('xién'), 'siên'); // x -> s (細音)
assert.strictEqual(convertSyllableToPFS('sám'), 'sâm');   // s -> s

console.log('  ✅ 2. 聲母映射測試 PASS');

// 3. 零聲母開頭 i 轉 y 測試
assert.strictEqual(convertSyllableToPFS('í'), 'yî');
assert.strictEqual(convertSyllableToPFS('ìd'), 'yit');
assert.strictEqual(convertSyllableToPFS('ín'), 'yîn');
assert.strictEqual(convertSyllableToPFS('im'), 'yim');
assert.strictEqual(convertSyllableToPFS('ià'), 'yá');
assert.strictEqual(convertSyllableToPFS('iàng'), 'yáng');
assert.strictEqual(convertSyllableToPFS('iěn'), 'yèn');
assert.strictEqual(convertSyllableToPFS('iung'), 'yung');

console.log('  ✅ 3. 零聲母半元音 y 轉換測試 PASS');

// 4. 空韻 ṳ (ii) 及其帶尾韻測試
assert.strictEqual(convertSyllableToPFS('sii'), 'sṳ');
assert.strictEqual(convertSyllableToPFS('cǐi'), 'chhṳ̀');
assert.strictEqual(convertSyllableToPFS('zíim'), 'chṳ̂m');
assert.strictEqual(convertSyllableToPFS('sìim'), 'sṳ́m');
assert.strictEqual(convertSyllableToPFS('zìin'), 'chṳ́n');
assert.strictEqual(convertSyllableToPFS('siib'), 'sṳ̍p');
assert.strictEqual(convertSyllableToPFS('zìid'), 'chṳt');

console.log('  ✅ 4. 空韻 ṳ (U+1E73) 及其鼻音入聲尾測試 PASS');

// 5. 調符落點（Tone Placement）優先權測試
assert.strictEqual(convertSyllableToPFS('diàu'), 'tiáu'); // a > i, u -> a 標尖音
assert.strictEqual(convertSyllableToPFS('sùi'), 'súi');   // ui -> i 標尖音
assert.strictEqual(convertSyllableToPFS('ciú'), 'chhiû'); // iu -> u 標折音
assert.strictEqual(convertSyllableToPFS('zéu'), 'chêu');  // e 標折音
assert.strictEqual(convertSyllableToPFS('kói'), 'khôi');  // o 標折音

// ue -> oe 映射測試（國家 guèd -> koet, 耿耿 guèn -> koén, 潰 kue -> khoe）
assert.strictEqual(convertSyllableToPFS('guèd'), 'koet');
assert.strictEqual(convertSyllableToPFS('guèn'), 'koén');
assert.strictEqual(convertSyllableToPFS('kue'), 'khoe');
assert.strictEqual(toPFS('guèd gá'), 'koet-kâ');

console.log('  ✅ 5. 調符落點優先權測試 PASS');

// 6. 大小寫保留測試
assert.strictEqual(convertSyllableToPFS('Hàg'), 'Hak');
assert.strictEqual(convertSyllableToPFS('HÀG'), 'HAK');
assert.strictEqual(convertSyllableToPFS('Pag'), 'Pha̍k');
assert.strictEqual(convertSyllableToPFS('Mí'), 'Mî');

console.log('  ✅ 6. 大小寫保留測試 PASS');

// 7. 多音節短語與連字號（Hyphen）組合測試
assert.strictEqual(toPFS('Hàg ngiěn cui'), 'Hak-ngièn-chhui');
assert.strictEqual(toPFS('Pag fa sii'), 'Pha̍k-fa-sṳ');
assert.strictEqual(toPFS('bàg gúng'), 'pak-kûng');
assert.strictEqual(toPFS('zo dèd'), 'cho-tet');
assert.strictEqual(toPFS('sìd fan'), 'sit-fan');
assert.strictEqual(toPFS('Tién gúng log sùi'), 'Thiên-kûng-lo̍k-súi');
assert.strictEqual(toPFS('se moi ngǐn'), 'se-moi-ngìn');
assert.strictEqual(toPFS('dù sii'), 'tú-sṳ');
assert.strictEqual(toPFS('【特】ià déu'), '【特】yá-têu');
assert.strictEqual(toPFS('特ià déu'), '特yá-têu');
assert.strictEqual(toPFS('又讀am mó sii'), '又讀am-mô-sṳ');
assert.strictEqual(toPFS('am mó sii só/sǒ'), 'am-mô-sṳ-sô/sò');
assert.strictEqual(toPFS('fug vu/mu'), 'fu̍k-vu/mu');
assert.strictEqual(toPFS('1. bàg gúng 2. zo dèd'), '1. pak-kûng 2. cho-tet');
assert.strictEqual(toPFS('(vǔn sii)'), '(vùn-sṳ)');

// 冪等性與既有 PFS 格式保護測試
assert.strictEqual(toPFS('koet-kâ'), 'koet-kâ');
assert.strictEqual(toPFS('sṳ'), 'sṳ');
assert.strictEqual(toPFS('Pha̍k-fa-sṳ'), 'Pha̍k-fa-sṳ');
assert.strictEqual(toPFS('Thiên-kûng-lo̍k-súi'), 'Thiên-kûng-lo̍k-súi');

console.log('  ✅ 7. 多音節連字號語句轉換測試 PASS');

// 8. 腔調識別與相容性測試
assert.strictEqual(isSiXianDialect('四縣'), true);
assert.strictEqual(isSiXianDialect('南四縣'), true);
assert.strictEqual(isSiXianDialect('北四縣'), true);
assert.strictEqual(isSiXianDialect('四基'), true);
assert.strictEqual(isSiXianDialect('教典四'), true);
assert.strictEqual(isSiXianDialect('教典南'), true);
assert.strictEqual(isSiXianDialect('si'), true);
assert.strictEqual(isSiXianDialect('na'), true);
assert.strictEqual(isSiXianDialect('海陸'), false);
assert.strictEqual(isSiXianDialect('大埔'), false);
assert.strictEqual(isSiXianDialect('饒平'), false);
assert.strictEqual(isSiXianDialect('詔安'), false);

// 「四海大平安」等含其他腔名用字个合稱，絕不可當成四縣
assert.strictEqual(isSiXianDialect('四海大平安'), false);
assert.strictEqual(isSiXianDialect('海陸基'), false);
assert.strictEqual(isSiXianDialect('大埔中高'), false);
assert.strictEqual(isSiXianDialect('南四縣'), true);
assert.strictEqual(isSiXianDialect('四中高'), true);
assert.strictEqual(isSiXianDialect('東南'), false);

console.log('  ✅ 8. 腔調識別（四縣/南四縣）保護測試 PASS');

// 9. 對照表範例自動核對：pages/pfs.md 內所有「HagPinPlus ↔ PFS」單音節範例，須與引擎輸出一致
{
  const fs = require('fs');
  const path = require('path');
  const md = fs.readFileSync(path.join(__dirname, '../pages/pfs.md'), 'utf8');
  const pairs = [...md.matchAll(/`([^`\s]+)` ↔ `([^`\s]+)`/g)];
  assert.ok(pairs.length > 40, `對照表範例數量異常：${pairs.length}`);
  const bad = pairs
    .map(([, hpp, pfs]) => [hpp, pfs, convertSyllableToPFS(hpp)])
    .filter(([, pfs, out]) => out.normalize('NFC') !== pfs.normalize('NFC'));
  assert.deepStrictEqual(bad, [], '對照表範例與引擎輸出不一致：' + JSON.stringify(bad));
  // 毋：m + U+030C（caron）→ m + U+0300（grave），務必用組合附加符號
  assert.strictEqual(convertSyllableToPFS('m̌'), 'm̀');
}

console.log('  ✅ 9. 對照表範例與引擎一致 PASS');

// 10. 詞組範例：引擎一律吃「音節間有空格」的 HagPinPlus；文件上的連寫是另一條顯示路線，不進引擎
{
  const phrases = [
    ['Hàg ngiěn cui', 'Hak-ngièn-chhui'],
    ['Pag fa sii', 'Pha̍k-fa-sṳ'],
    ['guèd gá', 'koet-kâ'],
    ['Bàg gúng', 'Pak-kûng'],
    ['zo dèd', 'cho-tet'],
    ['siid fan', 'sṳ̍t-fan'],
    ['Tién gúng log sùi', 'Thiên-kûng-lo̍k-súi'],
    ['se moi ngǐn', 'se-moi-ngìn'],
    ['Mí guèd', 'Mî-koet']
  ];
  for (const [hpp, pfs] of phrases) {
    assert.strictEqual(toPFS(hpp, '四').normalize('NFC'), pfs.normalize('NFC'), hpp);
  }
}

console.log('  ✅ 10. 詞組範例（空格輸入）PASS');

console.log('🎉 All PFS converter tests passed successfully!');
process.exit(0);
