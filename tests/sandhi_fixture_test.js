const fs = require('fs');
const path = require('path');

const reverseToneMappingData = JSON.parse(fs.readFileSync(path.join(__dirname, '../reverse_tone_mapping.json'), 'utf8'));
global.window = {
  reverseToneMappingData: reverseToneMappingData,
  sandhiRulesData: JSON.parse(fs.readFileSync(path.join(__dirname, '../sandhi_rules.json'), 'utf8'))
};

global.document = {
  createElement: function(tag) {
    return {
      tagName: tag,
      className: '',
      textContent: '',
      innerHTML: '',
      children: [],
      appendChild: function(child) { this.children.push(child); },
      get outerHTML() {
        if (tag === 'ruby') {
          return `<ruby class="${this.className}">${this.textContent}<rt>${this.children[0].textContent}</rt></ruby>`;
        } else if (tag === 'rt') {
          return `<rt>${this.textContent}</rt>`;
        }
      }
    };
  },
  createTreeWalker: function() {
    return {
      nextNode: function() { return null; }
    };
  }
};
global.NodeFilter = { SHOW_TEXT: 4 };

const { getSandhiHtml } = require('../main.js');

const fixtures = [
  // 四縣 (si)
  { pair: 'sán sán', expected: '<ruby class="sandhi-t11">sán<rt>11</rt></ruby> sán', dialect: 'si', desc: '四縣 24+24->11' },
  { pair: 'sán san', expected: '<ruby class="sandhi-t11">sán<rt>11</rt></ruby> san', dialect: 'si', desc: '四縣 24+55->11' },
  { pair: 'sán sad', expected: '<ruby class="sandhi-t11">sán<rt>11</rt></ruby> sad', dialect: 'si', desc: '四縣 24+5->11' },
  { pair: 'ha ngi bài (ha bài、ha fǐ、ha lín、ha cii)', expected: 'ha ngi bài (ha bài、ha fǐ、ha lín、ha cii)', dialect: 'si', desc: '四縣 頓號阻斷變調（CERT 下二擺 lín 避變調）' },
  { pair: 'sán、san', expected: 'sán、san', dialect: 'si', desc: '四縣 頓號阻斷 24+55 變調' },
  { pair: 'sán，san', expected: 'sán，san', dialect: 'si', desc: '四縣 逗號阻斷 24+55 變調' },

  // 海陸 (ha)
  { pair: 'sad sà', expected: '<ruby class="sandhi-t2">sad<rt>2</rt></ruby> sà', dialect: 'ha', desc: '海陸 5+53->2' },
  { pair: 'sán san', expected: '<ruby class="sandhi-t33">sán<rt>33</rt></ruby> san', dialect: 'ha', desc: '海陸 24+55->33' },

  // 大埔 (da)
  { pair: 'sān sǎ', expected: '<ruby class="sandhi-t35">sān<rt>35</rt></ruby> sǎ', dialect: 'da', desc: '大埔 33+113->35' },
  { pair: 'sān sâ', expected: '<ruby class="sandhi-t35">sān<rt>35</rt></ruby> sâ', dialect: 'da', desc: '大埔 33+31->35' },
  { pair: 'sān sâd', expected: '<ruby class="sandhi-t35">sān<rt>35</rt></ruby> sâd', dialect: 'da', desc: '大埔 33+21->35' },
  { pair: 'sà sâ', expected: '<ruby class="sandhi-t55">sà<rt>55</rt></ruby> sâ', dialect: 'da', desc: '大埔 53+31->55' },

  // 饒平 (rh)
  { pair: 'sà sǎ', expected: '<ruby class="sandhi-t33">sà<rt>33</rt></ruby> sǎ', dialect: 'rh', desc: '饒平 53+11->33' },
  { pair: 'sa sǎ', expected: '<ruby class="sandhi-t53">sa<rt>53</rt></ruby> sǎ', dialect: 'rh', desc: '饒平 55+11->53' },
  { pair: 'sà sǎ【sà sǎ】', expected: '<ruby class="sandhi-t33">sà<rt>33</rt></ruby> sǎ【sà sǎ】', dialect: 'rh', desc: '饒平 括號防護測試' },
  
  // 詔安 (zh)
  { pair: 'sâ sǎ', expected: '<ruby class="sandhi-t11">sâ<rt>11</rt></ruby> sǎ', dialect: 'zh', desc: '詔安 31+11->11' },
  { pair: 'sáb san', expected: '<ruby class="sandhi-t5">sáb<rt>5</rt></ruby> san', dialect: 'zh', desc: '詔安 24(-b)->5' },
  { pair: 'sà sá', expected: '<ruby class="sandhi-t33">sà<rt>33</rt></ruby> sá', dialect: 'zh', desc: '詔安 53+24->33' },
  { pair: 'sàd san', expected: '<ruby class="sandhi-t3">sàd<rt>3</rt></ruby> san', dialect: 'zh', desc: '詔安 43(-d)+55->3' },
  { pair: 'm̌ sà', expected: 'm̌ sà', dialect: 'zh', desc: '詔安 鼻音測試 m̌ (11) 無變調' },

  // 詔安 AA 疊詞前字變 55（除入聲外）與 AAA
  { pair: 'lěn lěn', expected: '<ruby class="sandhi-t55">lěn<rt>55</rt></ruby> lěn', dialect: 'zh', desc: '詔安 AA 陰平疊詞 11+11->55+11' },
  { pair: 'bbǔ bbǔ', expected: '<ruby class="sandhi-t55">bbǔ<rt>55</rt></ruby> bbǔ', dialect: 'zh', desc: '詔安 AA 陰平疊詞 烏烏 11+11->55+11' },
  { pair: 'fùng fùng', expected: '<ruby class="sandhi-t55">fùng<rt>55</rt></ruby> fùng', dialect: 'zh', desc: '詔安 AA 陽平疊詞 紅紅 53+53->55+53' },
  { pair: 'fùng fùng fùng', expected: '<ruby class="sandhi-t55">fùng<rt>55</rt></ruby> <ruby class="sandhi-t33">fùng<rt>33</rt></ruby> fùng', dialect: 'zh', desc: '詔安 AAA 陽平三疊詞 紅紅紅 53+53+53->55+33+53' },
  { pair: 'sáb sáb', expected: '<ruby class="sandhi-t5">sáb<rt>5</rt></ruby> sáb', dialect: 'zh', desc: '詔安 AA 入聲疊詞不變 55（仍走陰入變 5）' },

  // 詔安 後字變調白名單（前字維持本調）
  { pair: 'ngài ngìn', expected: 'ngài <ruby class="sandhi-t33">ngìn<rt>33</rt></ruby>', dialect: 'zh', desc: '詔安 後字變調 𠊎人 53+53->53+33' },
  { pair: 'hôo mò', expected: 'hôo <ruby class="sandhi-t11">mò<rt>11</rt></ruby>', dialect: 'zh', desc: '詔安 後字變調 好無 31+53->31+11' },
  { pair: 'ngìb lòi', expected: 'ngìb <ruby class="sandhi-t11">lòi<rt>11</rt></ruby>', dialect: 'zh', desc: '詔安 後字變調 入來 43+53->43+11' },

  // 大埔 AAA 三疊詞
  { pair: 'ziāng ziāng ziāng', expected: '<ruby class="sandhi-t35">ziāng<rt>35</rt></ruby> <ruby class="sandhi-t113">ziāng<rt>113</rt></ruby> ziāng', dialect: 'da', desc: '大埔 AAA 陰平三疊詞 33+33+33->35+113+33' },
  { pair: 'chîu chîu chîu', expected: '<ruby class="sandhi-t35">chîu<rt>35</rt></ruby> <ruby class="sandhi-t113">chîu<rt>113</rt></ruby> chîu', dialect: 'da', desc: '大埔 AAA 上聲三疊詞 31+31+31->35+113+31' },
  { pair: 'fǔng fǔng fǔng', expected: '<ruby class="sandhi-t35">fǔng<rt>35</rt></ruby> <ruby class="sandhi-t33">fǔng<rt>33</rt></ruby> fǔng', dialect: 'da', desc: '大埔 AAA 陽平三疊詞 113+113+113->35+33+113' },
  { pair: 'pàg pàg pàg', expected: '<ruby class="sandhi-t35">pàg<rt>35</rt></ruby> <ruby class="sandhi-t113">pàg<rt>113</rt></ruby> pàg', dialect: 'da', desc: '大埔 AAA 陽入三疊詞 54+54+54->35+113+54' }
];

let failed = 0;
fixtures.forEach(t => {
  const resHtml = getSandhiHtml(t.pair, t.dialect);
  if (resHtml !== t.expected) {
    console.error(`❌ FAIL [${t.desc}]`);
    console.error(`   INPUT:    ${t.pair}`);
    console.error(`   EXPECTED: ${t.expected}`);
    console.error(`   ACTUAL:   ${resHtml}`);
    failed++;
  } else {
    console.log(`✅ PASS [${t.desc}]`);
  }
});

if (failed === 0) {
  console.log('\n🎉 ALL FIXTURES PASSED!');
  process.exit(0);
} else {
  console.error(`\n💥 ${failed} FIXTURES FAILED.`);
  process.exit(1);
}
