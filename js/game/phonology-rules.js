// js/game/phonology-rules.js
// Defines phonological rules and confusable sets for Hakka Pinyin distractor generation

const CONFUSABLE = {
  // Onsets
  f: ['h', 'v'],
  h: ['f'],
  v: ['f'],
  b: ['p', 'm'],
  p: ['b'],
  m: ['n', 'ng'],
  n: ['l', 'm', 'ng'],
  l: ['n'],
  z: ['zh', 'c', 's'],
  c: ['ch', 'z', 's'],
  s: ['sh', 'z', 'c'],
  zh: ['z', 'ch', 'sh'],
  ch: ['c', 'zh', 'sh'],
  sh: ['s', 'zh', 'ch'],
  j: ['q', 'x'],
  q: ['j', 'x'],
  x: ['j', 'q'],
  g: ['k', 'ng'],
  k: ['g'],
  ng: ['n', 'm', 'g'],
  
  // Nuclei & Diphthongs
  i: ['ii', 'e'],
  ii: ['i', 'u'],
  o: ['u', 'e'],
  u: ['o'],
  e: ['a', 'i'],
  a: ['o', 'e'],
  eu: ['io', 'au'],
  io: ['eu', 'iu'],
  au: ['eu', 'ou'],

  // Codas
  m_coda: ['n_coda', 'ng_coda'],
  n_coda: ['m_coda', 'ng_coda'],
  ng_coda: ['n_coda', 'm_coda'],
  b_coda: ['d_coda', 'g_coda'],
  d_coda: ['b_coda', 'g_coda'],
  g_coda: ['b_coda', 'd_coda'],

  // Rhymes (whole rhyme replacement)
  ung: ['ong'],
  ong: ['ung'],
  ab: ['ad', 'ag'],
  ad: ['ab', 'ag'],
  ag: ['ab', 'ad']
};

const FORBIDDEN = [
  { onset: ['zh', 'ch', 'sh', 'rh'], nucleus: 'ii' }
];

/**
 * Parses a Hakka pinyin syllable into onset, nucleus/rhyme, coda, and tone.
 * Simplified parser for distractor generation.
 */
function parseSyllable(syllable) {
  // Example regex (simplified): 
  // onset: (zh|ch|sh|rh|ng|z|c|s|j|q|x|b|p|m|f|v|d|t|n|l|g|k|h)?
  // medial/nucleus/coda is the rest
  // This is a naive parser for the purpose of rule checking
  let onset = '';
  let rest = syllable;
  
  const onsets = ['zh', 'ch', 'sh', 'rh', 'ng', 'z', 'c', 's', 'j', 'q', 'x', 'b', 'p', 'm', 'f', 'v', 'd', 't', 'n', 'l', 'g', 'k', 'h'];
  for (const o of onsets) {
    if (rest.startsWith(o)) {
      onset = o;
      rest = rest.slice(o.length);
      break;
    }
  }

  // Extract tone number or tone mark if any (assuming tone number for now, or just ignore for legality)
  let tone = '';
  const toneMatch = rest.match(/\d+$/);
  if (toneMatch) {
    tone = toneMatch[0];
    rest = rest.slice(0, -tone.length);
  }

  // Now 'rest' is rhyme (nucleus + coda)
  let coda = '';
  const codas = ['ng', 'm', 'n', 'b', 'd', 'g', 'p', 't', 'k'];
  for (const c of codas) {
    if (rest.endsWith(c)) {
      coda = c;
      rest = rest.slice(0, -c.length);
      break;
    }
  }

  let nucleus = rest;

  return { onset, nucleus, coda, tone, original: syllable };
}

/**
 * Checks if a parsed syllable violates any FORBIDDEN rules.
 */
function isLegalSyllable(parsed) {
  for (const rule of FORBIDDEN) {
    if (rule.onset && rule.onset.includes(parsed.onset)) {
      if (rule.nucleus && rule.nucleus === parsed.nucleus) {
        return false; // Illegal
      }
    }
  }
  // Add more specific hakka phonotactic constraints if needed
  // E.g., 'm', 'n', 'ng' as syllabic consonants are legal, but here we just check forbidden list
  return true;
}
