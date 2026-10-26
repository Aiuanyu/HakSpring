// tests/kipan_converter_test.js
// 測試客源翠企盤打字並列格式轉換器（Kipan Converter）
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKipanLine, convertKipanText, convertPunctToRomance, convertPunctToHan } = require('../js/kipan-converter.js');

test('平哥標準範例：漢字在頂高，頓號「、」轉「,」，保留羅馬字 hyphen、有縫、無縫', () => {
  const input =
    "𠊎 (Ngǎi) 無 (mǒ) 幾愛 (gì oi) 客委會 (Hàg-Ví-Fi) 認 (ngin) 證辭彙 (ziin cǐifi)裡肚 (dídù)有兜仔 (iúdéu'è)个 (ge)例 (li) 句 (gi)會 (voi)講 (gòng)體 (tì) 罰 (fad)、權 (kiǎn) 威 (ví)教育 (gau'iùg)个 (ge)感覺 (gàmgòg)";

  const res = convertKipanText(input);

  assert.equal(res.detectedOrder, 'han-top', '應自動偵測諸夏字在頂高');
  assert.equal(
    res.topText,
    '𠊎無幾愛客委會認證辭彙裡肚有兜仔个例句會講體罰、權威教育个感覺',
    '頂層諸夏字行應自動去除雜亂空格',
  );
  assert.equal(
    res.bottomText,
    "Ngǎi mǒ gì oi Hàg-Ví-Fi ngin ziin cǐifi dídù iúdéu'è ge li gi voi gòng tì fad, kiǎn ví gau'iùg ge gàmgòg",
    '底層羅馬字行頓號應轉換為逗號「, 」，並保留 hyphen、內部空格與連寫',
  );
});

test('手動切換頂層順序：forceOrder: rom-top 真實對調諸夏字與羅馬字行', () => {
  const input =
    '𠊎 (Ngǎi) 無 (mǒ) 幾愛 (gì oi) 客委會 (Hàg-Ví-Fi)';

  const resRomTop = convertKipanText(input, { forceOrder: 'rom-top' });
  assert.equal(resRomTop.detectedOrder, 'rom-top');
  assert.equal(
    resRomTop.topText,
    'Ngǎi mǒ gì oi Hàg-Ví-Fi',
    '頂層必須為真正的羅馬字行',
  );
  assert.equal(
    resRomTop.bottomText,
    '𠊎無幾愛客委會',
    '底層必須為真正的諸夏字行',
  );

  const resHanTop = convertKipanText(input, { forceOrder: 'han-top' });
  assert.equal(resHanTop.detectedOrder, 'han-top');
  assert.equal(resHanTop.topText, '𠊎無幾愛客委會');
  assert.equal(resHanTop.bottomText, 'Ngǎi mǒ gì oi Hàg-Ví-Fi');
});

test('各種標點與括號雙向轉換：中文全形 ⟷ 羅馬字半形', () => {
  // 1. 中文全形轉羅馬字半形：頓號、逗號、句號、問驚號、引號、各類括號（圆括號、方括號、花括號）
  const hanPunct = '「食飽、無，恁好。敢係？當好！」（四縣）【美濃】｛註｝';
  assert.equal(
    convertPunctToRomance(hanPunct),
    '"食飽,無,恁好.敢係?當好!"(四縣)[美濃]{註}',
  );

  // 2. 羅馬字半形轉中文全形：逗號轉「，」、句號轉「。」、各類半形括號轉全形
  const romPunct = 'Ngǎi, ngi. he? ho! (Sixian) [Meinung] {Note}';
  assert.equal(
    convertPunctToHan(romPunct),
    'Ngǎi， ngi。 he？ ho！ （Sixian） ［Meinung］ ｛Note｝',
  );

  // 3. 完整雙向語句轉換驗證（含括號）
  // 3a. 漢字帶多種標點與說明性括號輸入
  const inputWithPunct = '試驗 (Cii-ngiàm)：好 (hò)！【認證】 (Ngin-ziin)……';
  const res1 = convertKipanText(inputWithPunct);
  assert.equal(res1.topText, '試驗：好！【認證】……');
  assert.equal(res1.bottomText, 'Cii-ngiàm: hò! [Ngin-ziin]...');
});

test('反向案例：第一字為羅馬字時，自動判定羅馬字在頂高，且標點雙向轉換', () => {
  const input =
    'Ngǎi (𠊎) mǒ (無) gì oi (幾愛) Hàg-Ví-Fi (客委會)！';

  const res = convertKipanText(input);
  assert.equal(res.detectedOrder, 'rom-top', '應自動偵測羅馬字在頂高');
  assert.equal(res.topText, 'Ngǎi mǒ gì oi Hàg-Ví-Fi!', '頂層羅馬字標點應為半形「!」');
  assert.equal(res.bottomText, '𠊎無幾愛客委會！', '底層諸夏字標點應為全形「！」');
});

test('相容性：全形括號（...）亦能正確轉換', () => {
  const input = '客源翠（Hàg-Ngiǎn-Cui） 企盤（Kì-Pǎn）';
  const res = convertKipanText(input);

  assert.equal(res.topText, '客源翠企盤');
  assert.equal(res.bottomText, 'Hàg-Ngiǎn-Cui Kì-Pǎn');
});

test('多段落處理：換行符保持段落對稱且標點雙向對應', () => {
  const input = `𠊎 (Ngǎi) 識 (sii) 講 (gòng) 客 (Hàg)。\n汝 (Ngi) 呢 (nē)？`;
  const res = convertKipanText(input);

  const expectedTop = `𠊎識講客。\n汝呢？`;
  const expectedBottom = `Ngǎi sii gòng Hàg.\nNgi nē?`;

  assert.equal(res.topText, expectedTop, '諸夏字行使用全形中文標點「。」與「？」');
  assert.equal(res.bottomText, expectedBottom, '羅馬字行使用半形西洋標點「.」與「?」');
});

test('邊界防禦：空字串或純文字不拋錯', () => {
  assert.equal(convertKipanText('').topText, '');
  assert.equal(convertKipanText(null).topText, '');

  const plain = '純文字無括號';
  const resPlain = convertKipanText(plain);
  assert.equal(resPlain.topText, plain);
  assert.equal(resPlain.bottomText, plain);
});
