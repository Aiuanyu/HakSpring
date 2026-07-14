/**
 * HakSpring Sandhi Engine
 * Generalized framework for Hakka tone sandhi rules.
 */

const HakkaSandhi = (() => {
  const BLOCKING_PUNCTUATION = '()（）【】';
  const SKIPPABLE_PUNCTUATION = '\\s、';
  const ALL_PUNCTUATION_CHARS = SKIPPABLE_PUNCTUATION + BLOCKING_PUNCTUATION;

  const TOKENIZER_REGEX = new RegExp(
    `[^<>` +
      ALL_PUNCTUATION_CHARS +
      `]+|[${SKIPPABLE_PUNCTUATION}]+|[${BLOCKING_PUNCTUATION}]+`,
    'g'
  );
  const SKIPPABLE_REGEX = new RegExp(`^[${SKIPPABLE_PUNCTUATION}]+$`);
  const BLOCKING_REGEX = new RegExp(`^[${BLOCKING_PUNCTUATION}]+$`);

  /**
   * Defines sandhi rules for different dialects.
   * Each dialect has an array of rules.
   * A rule is a function: (currentSyllable, nextSyllable) => { newTone, rubyClass } | null
   */
  const rules = {
    '大埔': [
      // Rule 1: 31/53 + (31, 11, 33, 53, 2) -> 55 (高降變)
      // Note: Dapu 31 is circumflex [âêîôû], while some other dialects/notations might use grave [àèìòù].
      (current, next) => {
        if (current.match(/[àèìòùâêîôû](?![bdg])/) && next.match(/[àèìòùâêîôûǎěǐǒǔāēīōū]/)) {
          return { newTone: '55', rubyClass: 'sandhi-高降變' };
        }
        return null;
      },
      // Rule 2: 33 + (113, 21, 53, 31, 35) -> 35 (中平變)
      (current, next) => {
        if (current.match(/[āēīōū]/) && next.match(/[ǎěǐǒǔâêîôûàèìòùáéíóú]/)) {
          return { newTone: '35', rubyClass: 'sandhi-中平變' };
        }
        return null;
      },
      // Rule 3: 113 + 113 -> 33 (低升變)
      (current, next) => {
        if (current.match(/[ǎěǐǒǔ]/) && next.match(/[ǎěǐǒǔ]/)) {
          return { newTone: '33', rubyClass: 'sandhi-低升變' };
        }
        return null;
      }
    ]
    // Other dialects can be added here
  };

  /**
   * Applies sandhi rules to a single syllable given the next one.
   */
  function applyRule(syllable, nextSyllable, dialect) {
    const dialectRules = rules[dialect] || [];
    for (const rule of dialectRules) {
      const result = rule(syllable, nextSyllable);
      if (result) return result;
    }
    return null;
  }

  /**
   * Processes a list of tokens and applies sandhi.
   * Tokens can be syllables, punctuation, or spaces.
   */
  function applyToTokens(tokens, dialectName) {
    const dialect = dialectName ? dialectName.replace('教典', '') : '';
    const results = [];
    for (let i = 0; i < tokens.length; i++) {
      let currentToken = tokens[i];

      // Skip non-syllables or already processed ruby tags
      if (
        currentToken.startsWith('<ruby') ||
        SKIPPABLE_REGEX.test(currentToken) ||
        BLOCKING_REGEX.test(currentToken)
      ) {
        results.push({ text: currentToken, sandhi: null });
        continue;
      }

      // Find the next "real" word token
      let nextWordToken = '';
      for (let j = i + 1; j < tokens.length; j++) {
        if (
          tokens[j].startsWith('<ruby') ||
          SKIPPABLE_REGEX.test(tokens[j])
        ) {
          continue;
        }
        if (BLOCKING_REGEX.test(tokens[j])) {
          break;
        }
        nextWordToken = tokens[j];
        break;
      }

      if (!nextWordToken) {
        results.push({ text: currentToken, sandhi: null });
        continue;
      }

      // Handle multiple variants separated by '/'
      if (currentToken.includes('/')) {
        const variants = currentToken.split('/');
        const processedVariants = variants.map(v => {
            const ruleResult = applyRule(v, nextWordToken, dialect);
            return ruleResult ? { text: v, ...ruleResult } : { text: v, sandhi: null };
        });
        results.push({ variants: processedVariants });
      } else {
        const ruleResult = applyRule(currentToken, nextWordToken, dialect);
        results.push(ruleResult ? { text: currentToken, ...ruleResult } : { text: currentToken, sandhi: null });
      }
    }
    return results;
  }

  /**
   * Processes an HTML string (like from the dictionary) and injects <ruby> tags for sandhi.
   */
  function applyToHtml(htmlContent, dialectName) {
    const dialect = dialectName ? dialectName.replace('教典', '') : '';
    if (!dialect || !rules[dialect]) return htmlContent;

    const sandhiRubyRegex = /<ruby class="sandhi-(?:高降變|中平變|低升變)"[^>]*>.*?<\/ruby>/g;
    let preliminaryTokens = [];
    let lastIndex = 0;

    // Preserve existing sandhi ruby tags
    htmlContent.replace(sandhiRubyRegex, (match, offset) => {
      if (offset > lastIndex) {
        preliminaryTokens.push(htmlContent.substring(lastIndex, offset));
      }
      preliminaryTokens.push(match);
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < htmlContent.length) {
      preliminaryTokens.push(htmlContent.substring(lastIndex));
    }

    const tokens = preliminaryTokens
      .flatMap((token) => {
        if (token.startsWith('<ruby')) return [token];
        return token.match(TOKENIZER_REGEX) || [];
      })
      .filter((t) => t && t.length > 0);

    const sandhiResults = applyToTokens(tokens, dialect);
    let hasActualModification = false;

    const finalTokens = sandhiResults.map(res => {
        if (res.variants) {
            const variantHtml = res.variants.map(v => {
                if (v.newTone) {
                    hasActualModification = true;
                    return `<ruby class="${v.rubyClass}">${v.text}<rt>${v.newTone}</rt></ruby>`;
                }
                return v.text;
            }).join('/');
            return variantHtml;
        } else if (res.newTone) {
            hasActualModification = true;
            return `<ruby class="${res.rubyClass}">${res.text}<rt>${res.newTone}</rt></ruby>`;
        }
        return res.text;
    });

    return hasActualModification ? finalTokens.join('') : htmlContent;
  }

  return {
    applyToTokens,
    applyToHtml,
    hasRulesFor: (dialect) => !!(dialect && rules[dialect.replace('教典', '')])
  };
})();

// Export for browser environment
if (typeof window !== 'undefined') {
  window.HakkaSandhi = HakkaSandhi;
}
