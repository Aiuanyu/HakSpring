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

  // 海陸 (ha)
  { pair: 'sad sà', expected: '<ruby class="sandhi-t2">sad<rt>2</rt></ruby> sà', dialect: 'ha', desc: '海陸 5+53->2' },
  { pair: 'sán san', expected: '<ruby class="sandhi-t33">sán<rt>33</rt></ruby> san', dialect: 'ha', desc: '海陸 24+55->33' },

  // 大埔 (da)
  { pair: 'sān sān', expected: '<ruby class="sandhi-t35">sān<rt>35</rt></ruby> sān', dialect: 'da', desc: '大埔 33+33->35' },
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
  { pair: 'm̌ sà', expected: 'm̌ sà', dialect: 'zh', desc: '詔安 鼻音測試 m̌ (11) 無變調' }
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
