/* ==========================================================================
   日日一詞 (Daily Word)
   P2: 真資料串接、聯集抽籤池、Mulberry32/LCG 演算法、門面腔判定
   ========================================================================== */

const DailyWord = (function () {
  
  // DOM Elements
  let dailyModalBody;
  
  // State
  let dailyPool = []; // Unified pool
  let certCount = 0;
  let gipCount = 0;
  let dataVersion = 'unknown';
  let isPoolBuilt = false;
  let currentMode = 'today'; // 'today', 'random', or 'specific'
  let currentSpecificFavId = null;

  // --- Favorites Manager (P4) ---
  const DailyFavManager = {
    key: 'hakkaDailyFavs',
    getFavs: function() {
      try {
        const stored = localStorage.getItem(this.key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed.items)) {
            const migratedItems = {};
            const now = Date.now();
            parsed.items.forEach(key => { migratedItems[key] = now; });
            parsed.items = migratedItems;
          }
          return {
            items: parsed.items || {},
            tomb: parsed.tomb || {}
          };
        }
      } catch (e) {
        console.error('Error reading hakkaDailyFavs:', e);
      }
      return { items: {}, tomb: {} };
    },
    saveFavs: function(data) {
      try {
        localStorage.setItem(this.key, JSON.stringify(data));
      } catch (e) {
        console.error('Error saving hakkaDailyFavs:', e);
      }
    },
    toggleFav: function(idString) { // e.g. "c四基1-1:客家"
      const data = this.getFavs();
      if (data.items[idString]) {
        // Remove and tombstone
        delete data.items[idString];
        data.tomb[idString] = Date.now();
      } else {
        // Add
        data.items[idString] = Date.now();
        delete data.tomb[idString];
      }
      this.saveFavs(data);
    },
    isFav: function(idString) {
      return !!this.getFavs().items[idString];
    },
    clearAll: function() {
      const data = this.getFavs();
      const now = Date.now();
      Object.keys(data.items).forEach(item => {
        data.tomb[item] = now;
      });
      data.items = {};
      this.saveFavs(data);
    },
    getCount: function() {
      return Object.keys(this.getFavs().items).length;
    }
  };

  // Initialize
  async function init() {
    dailyModalBody = document.getElementById('daily-modal-body');
    await fetchVersion();
    renderDailyWord('today');
  }

  async function fetchVersion() {
    try {
      const res = await fetch('data/data_version.json?cachebust=' + new Date().getTime());
      if (res.ok) {
        const json = await res.json();
        dataVersion = json.version || 'unknown';
      }
    } catch (e) {
      console.warn('DailyWord: Cannot fetch data_version.json', e);
    }
  }

  function buildDailyPool() {
    if (isPoolBuilt) return true;
    
    const certDialects = ['四', '海', '大', '平', '安'];
    const certLevels = ['基', '初', '中', '中高', '高'];
    const gipDialects = ['四', '海', '大', '平', '安', '南'];

    // Check if ALL data is loaded
    let allLoaded = true;
    certDialects.forEach(d => {
      certLevels.forEach(l => {
        if (!window[d + l]) allLoaded = false;
      });
    });
    gipDialects.forEach(d => {
      if (!window['教典' + d]) allLoaded = false;
    });
    
    if (!allLoaded) return false;

    let certSet = new Set();
    let gipSet = new Set();

    certDialects.forEach(d => {
      certLevels.forEach(l => {
        const data = window[d + l];
        if (data && Array.isArray(data.content)) {
          data.content.forEach(row => {
            if (!row['客家語'] || row['客家語'].includes('此腔無此詞條')) return;
            if (!row['編號'] || String(row['編號']).includes('此級無此單元')) return;
            certSet.add(`${l}|${row['編號']}`);
          });
        }
      });
    });
    
    gipDialects.forEach(d => {
      const data = window['教典' + d];
      if (data && Array.isArray(data.content)) {
        data.content.forEach(row => {
          if (!row['客家語'] || row['客家語'].includes('此腔無此詞條')) return;
          gipSet.add(row['客家語']);
        });
      }
    });

    certCount = certSet.size;
    gipCount = gipSet.size;

    // Add items with origin marker
    certSet.forEach(key => dailyPool.push({ type: 'cert', key }));
    gipSet.forEach(key => dailyPool.push({ type: 'gip', key }));

    // Sort to make it deterministic across machines
    dailyPool.sort((a, b) =>
      a.type !== b.type ? (a.type === 'cert' ? -1 : 1)
                        : (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    );
    isPoolBuilt = true;
    return true;
  }

  const NAME_TO_CODE = { '四縣':'四', '南四縣':'南', '海陸':'海', '大埔':'大', '饒平':'平', '詔安':'安' };

  function getDisplayAccent() {
    try {
      const s = localStorage.getItem('lastSearchDialect');
      if (s && NAME_TO_CODE[s]) return NAME_TO_CODE[s];
      
      const g = localStorage.getItem('hakkaGameLastDataVarName');
      if (g && g !== 'ALL_OVERDUE') return g.charAt(0);
    } catch(e) {}
    
    return '四';
  }

  function getDialectFullName(short) {
    const map = { '四': '四縣', '南': '南四縣', '海': '海陸', '大': '大埔', '平': '饒平', '安': '詔安' };
    return map[short] || '四縣';
  }

  function getRowForAccent(item, targetAccentShort) {
    if (item.type === 'cert') {
      const [level, id] = item.key.split('|');
      const dialects = ['四', '海', '大', '平', '安'];
      const orderedDialects = [targetAccentShort, ...dialects.filter(d => d !== targetAccentShort)];
      
      for (const d of orderedDialects) {
        if (d === '南') continue; // cert doesn't have '南'
        const data = window[d + level];
        if (data && Array.isArray(data.content)) {
          const found = data.content.find(r => String(r['編號']) === id && r['客家語'] && !r['客家語'].includes('此腔無此詞條'));
          if (found) return { row: found, dialect: d, level };
        }
      }
    } else if (item.type === 'gip') {
      const word = item.key;
      const dialects = ['四', '海', '大', '平', '安', '南'];
      const orderedDialects = [targetAccentShort, ...dialects.filter(d => d !== targetAccentShort)];
      
      for (const d of orderedDialects) {
        const data = window['教典' + d];
        if (data && Array.isArray(data.content)) {
          const idx = data.content.findIndex(r => r['客家語'] === word && !r['客家語'].includes('此腔無此詞條'));
          if (idx !== -1) return { row: data.content[idx], dialect: d, index: idx + 1 };
        }
      }
    }
    return null;
  }

  // --- Random Algorithms ---
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

  function getTodayIndex(N) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const seed = parseInt(`${yyyy}${mm}${dd}`, 10);
    return Math.floor(mulberry32(seed)() * N);
  }

  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }

  function getCoprime(N) {
    if (N <= 1) return 1;
    let a = Math.floor(N * 0.618);
    if (a === 0) a = 1;
    while (gcd(a, N) !== 1 && a < N) {
      a++;
    }
    if (a >= N) return 1; // Fallback to 1 (stride of 1 visits all)
    return a;
  }

  function getCycleState(N, ver) {
    let state = { a: 0, b: 0, pos: 0, n: N, ver: ver };
    try {
      const saved = localStorage.getItem('hakkaDailyCycle');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.n === N && parsed.ver === ver && parsed.pos < N) {
          state = parsed;
          return state;
        }
      }
    } catch(e) {}
    
    // Initialize new cycle
    state.a = getCoprime(N);
    state.b = Math.floor(Math.random() * N);
    state.pos = 0;
    saveCycleState(state);
    return state;
  }

  function saveCycleState(state) {
    try {
      localStorage.setItem('hakkaDailyCycle', JSON.stringify(state));
    } catch(e) {}
  }

  function getRandomIndex(state) {
    const N = state.n;
    return (state.a * state.pos + state.b) % N;
  }

  // --- Rendering ---
  function renderDailyWord(mode = 'today', retryCount = 0, specificFavId = null) {
    if (!dailyModalBody) return;
    // Don't update currentMode if it's 'specific' so that "Back" knows what to return to
    if (mode !== 'specific') {
      currentMode = mode;
      currentSpecificFavId = null;
    } else {
      currentSpecificFavId = specificFavId;
    }

    if (!buildDailyPool()) {
      dailyModalBody.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--main-text-color);">資料載入中，請稍候...</div>';
      // Wait and try again
      if (retryCount < 20) {
        setTimeout(() => renderDailyWord(mode, retryCount + 1, specificFavId), 500);
      } else {
        dailyModalBody.innerHTML = '<div style="padding: 40px; text-align: center; color: #ff6b6b;">資料載入失敗，請重新整理頁面。</div>';
      }
      return;
    }

    const N = dailyPool.length;
    let idx = 0;
    let isToday = false;
    let state = getCycleState(N, dataVersion);

    if (mode === 'specific' && specificFavId) {
      const isGipFav = specificFavId.charAt(0) === 'g';
      const wordFav = specificFavId.substring(specificFavId.indexOf(':') + 1);
      
      if (isGipFav) {
        idx = dailyPool.findIndex(i => i.type === 'gip' && i.key === wordFav);
      } else {
        const idPart = specificFavId.split(':')[0];
        const match = idPart.match(/^c.(.*?)([0-9].*)$/);
        if (match) {
          const level = match[1];
          const rowId = match[2];
          const expectedKey = `${level}|${rowId}`;
          idx = dailyPool.findIndex(i => i.type === 'cert' && i.key === expectedKey);
        } else {
          idx = -1;
        }
      }

      if (idx === -1) {
        // Fallback to searching by word text
        const targetAccentShort = getDisplayAccent();
        const certLevels = ['基', '初', '中', '中高', '高'];
        let foundKey = null;
        for (const lvl of certLevels) {
          const data = window[targetAccentShort + lvl];
          if (data && Array.isArray(data.content)) {
            const foundRow = data.content.find(r => r['客家語'] === wordFav && !r['客家語'].includes('此腔無此詞條'));
            if (foundRow) {
              foundKey = `${lvl}|${foundRow['編號']}`;
              break;
            }
          }
        }
        
        if (foundKey) {
           idx = dailyPool.findIndex(i => i.type === 'cert' && i.key === foundKey);
        }
      }

      if (idx === -1) {
        // Ultimate fallback if missing
        idx = getTodayIndex(N);
        isToday = true;
      }
    } else if (mode === 'today') {
      idx = getTodayIndex(N);
      isToday = true;
    } else {
      idx = getRandomIndex(state);
      state.pos++;
      saveCycleState(state);
    }

    const item = dailyPool[idx];
    const targetAccent = getDisplayAccent();
    const matchInfo = getRowForAccent(item, targetAccent);

    if (!matchInfo) {
      dailyModalBody.innerHTML = '<div style="padding: 40px; text-align: center;">詞彙對應錯誤，請重試。</div>';
      return;
    }

    const { row, dialect, level } = matchInfo;
    
    const today = new Date();
    const dayStr = today.getDate();
    const monthStr = today.toLocaleDateString('zh-TW', { month: 'long' });
    
    // Set YYYY.MM.DD header date
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const headerDateEl = document.getElementById('daily-header-date');
    if (headerDateEl) {
      headerDateEl.innerText = `${yyyy}.${mm}.${dd}`;
    }

    // Set Hakka weekday
    const dayOfWeek = today.getDay();
    const hakkaNumbers = ['日', '一', '二', '三', '四', '五', '六'];
    let weekdayStr;
    if (dayOfWeek === 0 && dialect === '安') {
      weekdayStr = '禮拜日';
    } else {
      weekdayStr = '拜' + hakkaNumbers[dayOfWeek];
    }
    
    const modeText = (mode === 'specific') ? '收藏詞' : (isToday ? (dialect === '安' ? '今日' : '今晡日') : '隨機拈詞');
    const word = row['客家語'];
    
    // Use main.js formatter if available
    let pinyinHTML = '';
    const rawPinyin = row['客語標音_顯示'] || row['客語標音_查詢'] || '';
    
    // First, format and clean the base pinyin
    if (item.type === 'cert') {
        pinyinHTML = rawPinyin.split('或')[0].trim();
    } else {
        pinyinHTML = typeof window.formatPhoneticForDisplay === 'function' ? window.formatPhoneticForDisplay(rawPinyin) : rawPinyin;
    }
    
    // Apply sandhi
    if (typeof window.getSandhiPronunciation === 'function') {
        const fullDialectName = getDialectFullName(dialect);
        const sandhiResult = window.getSandhiPronunciation(pinyinHTML, fullDialectName);
        if (sandhiResult) {
            pinyinHTML = sandhiResult.sandhi;
        }
    }
    
    // Adjust font size for long ruby tags
    if (typeof window.adjustRubyFontSize === 'function') {
        const span = document.createElement('span');
        span.innerHTML = pinyinHTML;
        window.adjustRubyFontSize(span);
        pinyinHTML = span.innerHTML;
    }
    
    let metaStr = '';
    if (item.type === 'cert') {
      const sourceName = typeof getFullLevelName === 'function' ? getFullLevelName(dialect + level) : (dialect + level);
      metaStr = `${sourceName}認證詞彙編號 ${row['編號']}`;
    } else {
      const sourceName = typeof getFullLevelName === 'function' ? getFullLevelName('教典' + dialect) : ('教典' + dialect);
      const formattedIndex = matchInfo.index.toLocaleString('en-US');
      metaStr = `${sourceName}第 ${formattedIndex} 條`;
    }
    
    const meaning = row['華語詞義'] || '';
    let sentenceRaw = row['例句'] ? String(row['例句']).replace(/"/g, '') : '';
    sentenceRaw = sentenceRaw.replace(/\n/g, '<br>').replace(/\r/g, ''); // Ensure newlines are <br>
    
    // Also split by " 例：" (space + 例：)
    sentenceRaw = sentenceRaw.replace(/\s+(例|例如)\s*[：:]\s*/g, '<br>');
    
    const sentenceParts = sentenceRaw.split('<br>').map(s => s.trim()).filter(s => s !== '');

    let isGip = item.type !== 'cert';
    let originalDialectInfo = {};
    if (isGip) {
       originalDialectInfo = { 腔: dialect, 腔名: typeof ACCENT_INFO !== 'undefined' && ACCENT_INFO[dialect] ? ACCENT_INFO[dialect].腔名 : '', 級: '', fullLvlName: typeof ACCENT_INFO !== 'undefined' && ACCENT_INFO[dialect] ? ACCENT_INFO[dialect].腔名 + '教典' : '' };
    } else {
       originalDialectInfo = typeof getDialectInfo === 'function' ? getDialectInfo(dialect, level) : {腔: dialect, 級: level};
    }
    
    let lineForAudio = Object.assign({}, row, {
      sourceType: isGip ? 'gip' : 'cert',
      sourceName: isGip ? '教典' + dialect : dialect + level
    });
    
    let mainWordAudio = '';
    let mainSentenceAudio = '';
    if (typeof constructWordAudioUrl === 'function') {
      let fullSourceName = isGip ? 'gip' + originalDialectInfo.fullLvlName : 'cert' + originalDialectInfo.腔 + originalDialectInfo.級;
      mainWordAudio = constructWordAudioUrl(lineForAudio, fullSourceName);
      if (mainWordAudio && typeof applyAudioProxy === 'function') mainWordAudio = applyAudioProxy(mainWordAudio);
      
      if (typeof constructSentenceAudioUrl === 'function') {
        mainSentenceAudio = constructSentenceAudioUrl(lineForAudio, fullSourceName);
        if (mainSentenceAudio && typeof applyAudioProxy === 'function') mainSentenceAudio = applyAudioProxy(mainSentenceAudio);
      }
    }

    const sentenceBlock = sentenceParts.map(s => {
      let cleanSentence = s.replace(/^(例|例如)\s*[：:]\s*/, '');
      return `
      <div class="daily-sentence-block">
        <span class="daily-sentence-badge">例</span>
        <span class="daily-sentence-text">${cleanSentence}</span>
        ${mainSentenceAudio ? `<button class="playBtn" data-src="${mainSentenceAudio}" style="background:none; border:none; color:#888; margin-left:6px; cursor:pointer;"><i class="fas fa-volume-up"></i></button>` : ''}
      </div>`;
    }).join('');

    const crossDialectResults = typeof findCrossDialectRows === 'function' ? findCrossDialectRows(lineForAudio, originalDialectInfo, isGip) : [];
    
    const crossBtnHTML = crossDialectResults.length > 0 ? 
      `<button id="dailyCrossBtn" class="crossDialectBtn" style="font-size: 0.8em; padding: 2px; margin-left: 2px; vertical-align: middle;"><i class="fas fa-plus-circle"></i></button>` : '';

    // Favorites ID calculation
    const sourcePrefix = isGip ? 'g' : 'c';
    const rowId = row['編號'] || row['序號'];
    const dataVarName = isGip ? dialect : dialect + level;
    const favId = `${sourcePrefix}${dataVarName}${rowId}:${word}`;
    const isFav = DailyFavManager.isFav(favId);
    const favCount = DailyFavManager.getCount();

    dailyModalBody.innerHTML = `
      <div class="daily-card-container">
        <div class="daily-card">
          <div class="daily-card-header">
            <div class="daily-cal-block">
              <div class="daily-cal-day">${dayStr}</div>
              <div class="daily-cal-month">
                <div>${monthStr}</div>
                <div>${weekdayStr}</div>
              </div>
            </div>
            <div class="daily-mode-badge">${modeText}</div>
          </div>
          
          <div class="daily-tear-line"></div>
          
          <div class="daily-word-section">
            <button class="daily-fav-btn ${isFav ? 'active' : ''}" data-favid="${favId}" title="加入收藏">${isFav ? '★' : '☆'}</button>
            <div class="daily-word">
              ${word}
            </div>
            <div class="daily-pinyin-wrapper" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; margin-bottom: 30px;">
              <div class="daily-pinyin" style="margin-bottom: 0;">${pinyinHTML}</div>
              ${mainWordAudio ? `<button class="playBtn" data-src="${mainWordAudio}" style="background:none; border:none; color:var(--daily-card-text); font-size: 0.8em; cursor:pointer; padding: 2px;"><i class="fas fa-volume-up"></i></button>` : ''}
              ${crossBtnHTML}
            </div>
            <div class="daily-meta">${metaStr}</div>
            
            ${sentenceBlock}
            
            <div id="dailyCrossContainer" class="daily-cross-container" style="display: none; margin-top: 15px; border-top: 1px dashed rgba(0,0,0,0.1); padding-top: 10px;"></div>
          </div>
          
          <div class="daily-meaning-section">
            <span class="daily-lang-badge">華語</span>
            <span class="daily-meaning-text">${meaning}</span>
          </div>
          
          <div class="daily-source-section">
            資料來源：客委會認證詞彙、教育部常用詞典<br>介面、配色及功能參照：<a href="https://khutian.liz462liz.workers.dev/" target="_blank" style="color: inherit; text-decoration: underline;">Liz Lim「逐工一詞」</a>
          </div>
        </div>
        
        <div class="daily-actions">
          <button id="dailyBtnToday" class="daily-btn daily-btn-outline">${dialect === '安' ? '今日' : '今晡日'}</button>
          <button id="dailyBtnRandom" class="daily-btn daily-btn-outline">隨機拈詞</button>
          <button id="dailyBtnFavList" class="daily-btn daily-btn-outline daily-fav-count-btn"><span style="color: #BE3B2B;">★</span> ${favCount.toLocaleString()}</button>
        </div>
        
        <div class="daily-footer-stats">
          共 ${(certCount + gipCount).toLocaleString()} 個客語詞條 ・ 本輪進度 ${state.pos.toLocaleString()} / ${N.toLocaleString()}
        </div>
      </div>
    `;

    // Bind events
    const btnToday = dailyModalBody.querySelector('#dailyBtnToday');
    const btnRandom = dailyModalBody.querySelector('#dailyBtnRandom');
    const btnFavToggle = dailyModalBody.querySelector('.daily-fav-btn');
    const btnFavList = dailyModalBody.querySelector('#dailyBtnFavList');
    
    if (btnToday) {
      btnToday.addEventListener('click', () => {
        renderDailyWord('today');
      });
    }
    if (btnRandom) {
      btnRandom.addEventListener('click', () => {
        renderDailyWord('random');
        if (dailyModalBody) dailyModalBody.scrollTop = 0;
      });
    }
    if (btnFavToggle) {
      btnFavToggle.addEventListener('click', (e) => {
        const fId = e.currentTarget.dataset.favid;
        DailyFavManager.toggleFav(fId);
        // Re-render to update the star state and count
        renderDailyWord(mode, 0, mode === 'specific' ? specificFavId : null); 
      });
    }
    if (btnFavList) {
      btnFavList.addEventListener('click', () => {
        renderFavoritesPanel();
      });
    }

    // Global playBtn delegation for daily mode
    const playBtns = dailyModalBody.querySelectorAll('.playBtn');
    playBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const src = this.dataset.src;
        if (src && typeof window.playAudioWithAnimation === 'function') {
          window.playAudioWithAnimation(this, src);
        }
      });
    });

    if (crossDialectResults.length > 0) {
       const crossBtn = dailyModalBody.querySelector('#dailyCrossBtn');
       const crossContainer = dailyModalBody.querySelector('#dailyCrossContainer');
       if (crossBtn && crossContainer) {
         crossBtn.addEventListener('click', () => {
           if (crossContainer.style.display === 'none') {
             crossContainer.style.display = 'block';
             crossBtn.querySelector('i').className = 'fas fa-minus-circle';
             
             if (crossContainer.children.length === 0) {
               crossDialectResults.forEach(({ foundItem, itemDialectInfo }) => {
                 const crossItem = document.createElement('div');
                 crossItem.className = 'daily-cross-item';
                 
                 let crossPinyin = foundItem['客語標音_顯示'] || foundItem['客語標音_查詢'] || '';
                 if (!isGip) {
                   crossPinyin = crossPinyin.split('或')[0].trim();
                 } else {
                   crossPinyin = typeof window.formatPhoneticForDisplay === 'function' ? window.formatPhoneticForDisplay(crossPinyin) : crossPinyin;
                 }
                 if (typeof window.getSandhiPronunciation === 'function') {
                   const fullDialectName = typeof getDialectFullName === 'function' ? getDialectFullName(itemDialectInfo.腔) : itemDialectInfo.腔名;
                   const sandhiResult = window.getSandhiPronunciation(crossPinyin, fullDialectName);
                   if (sandhiResult) crossPinyin = sandhiResult.sandhi;
                 }
                 
                 let audioUrl = '';
                 let sentenceAudioUrl = '';
                 if (typeof constructWordAudioUrl === 'function') {
                    let fullSourceName = isGip ? 'gip' + itemDialectInfo.fullLvlName : 'cert' + itemDialectInfo.腔 + itemDialectInfo.級;
                    audioUrl = constructWordAudioUrl(foundItem, fullSourceName);
                    if (audioUrl && typeof applyAudioProxy === 'function') audioUrl = applyAudioProxy(audioUrl);
                    
                    if (typeof constructSentenceAudioUrl === 'function') {
                      sentenceAudioUrl = constructSentenceAudioUrl(foundItem, fullSourceName);
                      if (sentenceAudioUrl && typeof applyAudioProxy === 'function') sentenceAudioUrl = applyAudioProxy(sentenceAudioUrl);
                    }
                 }
                 
                 let sentenceRaw = foundItem['例句'] ? String(foundItem['例句']).replace(/"/g, '') : '';
                 let sentenceHTML = '';
                 if (sentenceRaw) {
                   sentenceRaw = sentenceRaw.replace(/\n/g, '<br>').replace(/\r/g, '');
                   sentenceRaw = sentenceRaw.replace(/\s+(例|例如)\s*[：:]\s*/g, '<br>');
                   const parts = sentenceRaw.split('<br>').map(s => s.trim()).filter(s => s !== '');
                   sentenceHTML = parts.map(s => {
                     let cleanS = s.replace(/^(例|例如)\s*[：:]\s*/, '');
                     return `<div class="daily-sentence-block" style="margin-top: 6px; font-size: 0.95em; padding: 4px 8px; border-radius: 4px; background: rgba(0,0,0,0.02);"><span class="daily-sentence-badge" style="transform: scale(0.85); margin-right: 4px;">例</span><span class="daily-sentence-text">${cleanS}</span>${sentenceAudioUrl ? `<button class="playBtn" data-src="${sentenceAudioUrl}" style="background:none; border:none; color:#888; margin-left:6px; cursor:pointer;"><i class="fas fa-volume-up"></i></button>` : ''}</div>`;
                   }).join('');
                 }
                 
                 const displayWord = foundItem['客家語'] === word ? '' : foundItem['客家語'];
                 
                 crossItem.innerHTML = `
                   <div style="margin-bottom: 8px; border-radius: 6px; background: rgba(0,0,0,0.03); padding: 6px; border: 1px solid rgba(0,0,0,0.05);">
                     <div class="daily-cross-item-header" style="display: flex; align-items: center; justify-content: space-between;">
                       <div style="display: flex; align-items: center; gap: 8px;">
                         <span class="source-tag ${isGip ? 'gip' : 'cert'}-source" style="font-size: 0.8em; padding: 2px 6px;">${itemDialectInfo.腔名}</span>
                         ${displayWord ? `<span style="font-size: 1.05em; color: var(--daily-card-text); font-weight: bold;">${displayWord}</span>` : ''}
                         <span class="daily-pinyin" style="font-size: 0.9em; margin-bottom: 0; color: #777;">${crossPinyin}</span>
                       </div>
                       <div style="display: flex; align-items: center; gap: 6px;">
                         ${audioUrl ? `<button class="crossWordPlayBtn number-btn" data-src="${audioUrl}" style="border-radius: 50%; width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; border: 1px solid #ccc; background: white;"><i class="fas fa-play" style="font-size: 10px; margin-left: 2px; color: #555;"></i></button>` : ''}
                         ${sentenceHTML ? `<button class="crossSubBtn" style="background: none; border: none; color: #888; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px;"><i class="fas fa-plus"></i></button>` : ''}
                       </div>
                     </div>
                     ${sentenceHTML ? `<div class="daily-cross-item-body" style="display: none; padding-top: 4px; margin-top: 4px; border-top: 1px solid rgba(0,0,0,0.05);">${sentenceHTML}</div>` : ''}
                   </div>
                 `;
                 
                 const playBtn = crossItem.querySelector('.crossWordPlayBtn');
                 const subBtn = crossItem.querySelector('.crossSubBtn');
                 const bodyDiv = crossItem.querySelector('.daily-cross-item-body');
                 
                 const expandSubAccordion = () => {
                   if (bodyDiv && bodyDiv.style.display === 'none') {
                     bodyDiv.style.display = 'block';
                     if (subBtn) subBtn.innerHTML = '<i class="fas fa-minus"></i>';
                   }
                 };
                 
                 if (subBtn) {
                   subBtn.addEventListener('click', (e) => {
                     e.stopPropagation();
                     if (bodyDiv.style.display === 'none') {
                       expandSubAccordion();
                     } else {
                       bodyDiv.style.display = 'none';
                       subBtn.innerHTML = '<i class="fas fa-plus"></i>';
                     }
                   });
                 }
                 
                 if (playBtn) {
                   playBtn.addEventListener('click', function(e) {
                     e.stopPropagation();
                     expandSubAccordion();
                     const src = this.dataset.src;
                     if (src && typeof window.playAudioWithAnimation === 'function') {
                        window.playAudioWithAnimation(this, src);
                     }
                   });
                 }
                 
                 // Also attach events to sentence play btns inside crossItem
                 const sentenceBtns = crossItem.querySelectorAll('.daily-cross-item-body .playBtn');
                 sentenceBtns.forEach(btn => {
                    btn.addEventListener('click', function(e) {
                      e.stopPropagation();
                      const src = this.dataset.src;
                      if (src && typeof window.playAudioWithAnimation === 'function') {
                        window.playAudioWithAnimation(this, src);
                      }
                    });
                 });
                 
                 crossContainer.appendChild(crossItem);
               });
             }
           } else {
             crossContainer.style.display = 'none';
             crossBtn.querySelector('i').className = 'fas fa-plus-circle';
           }
         });
       }
    }
  }

  function renderFavoritesPanel() {
    if (!dailyModalBody) return;
    const favsObj = DailyFavManager.getFavs().items;
    const favs = Object.keys(favsObj).sort((a, b) => favsObj[b] - favsObj[a]); // sort by newest first
    
    let html = `
      <div class="daily-card-container" style="display: flex; flex-direction: column; max-height: 90vh;">
        <div class="daily-card" style="flex: 1; overflow-y: auto; padding-top: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="margin: 0; font-family: var(--title-font); font-size: 1.5rem; color: #C23628;"><span style="color: #BE3B2B;">★</span> 我的收藏</h2>
            <button id="dailyBtnBack" class="daily-btn" style="padding: 4px 12px; font-size: 0.9em; background: rgba(0,0,0,0.05); border: none; border-radius: 4px; cursor: pointer;">返回</button>
          </div>
    `;

    if (favs.length === 0) {
      html += `<div style="text-align: center; padding: 40px; color: #888;">目前還沒有收藏任何詞彙喔！<br>趕快去按星星吧 ⭐</div>`;
    } else {
      html += `<div class="daily-fav-list" style="display: flex; flex-direction: column; gap: 8px;">`;
      favs.forEach(favId => {
        // favId format: g海中高123:打早
        const wordFav = favId.substring(favId.indexOf(':') + 1);
        html += `
          <div class="daily-fav-list-item" data-favid="${favId}" style="padding: 12px 16px; border-radius: 8px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.05); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-family: var(--title-font); font-size: 1.2rem; font-weight: bold; color: var(--daily-card-text);">${wordFav}</span>
            <i class="fas fa-chevron-right" style="color: #ccc; font-size: 0.8em;"></i>
          </div>
        `;
      });
      html += `</div>`;
      
      html += `
        <div style="margin-top: 30px; text-align: center;">
          <button id="dailyBtnClearFavs" class="daily-btn" style="color: #ff4d4f; border: 1px solid rgba(255,77,79,0.3); background: transparent; padding: 6px 16px; border-radius: 4px; cursor: pointer;">清空收藏</button>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    dailyModalBody.innerHTML = html;

    // Bind events
    const btnBack = dailyModalBody.querySelector('#dailyBtnBack');
    if (btnBack) {
      btnBack.addEventListener('click', () => renderDailyWord(currentMode));
    }

    const listItems = dailyModalBody.querySelectorAll('.daily-fav-list-item');
    listItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const targetFavId = e.currentTarget.dataset.favid;
        renderDailyWord('specific', 0, targetFavId);
      });
    });

    const btnClear = dailyModalBody.querySelector('#dailyBtnClearFavs');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('確定要清空所有收藏的詞彙嗎？')) {
          DailyFavManager.clearAll();
          renderFavoritesPanel();
        }
      });
    }
  }

  function refreshUI() {
    // Only refresh if the modal is currently open and has content
    const modal = document.getElementById('dailyModal');
    if (!modal || modal.style.display === 'none' || !dailyModalBody) return;
    
    // Determine which view is currently active
    if (dailyModalBody.querySelector('#dailyBtnBack')) {
      renderFavoritesPanel();
    } else {
      renderDailyWord(currentMode, 0, currentMode === 'specific' ? currentSpecificFavId : null);
    }
  }

  return {
    init,
    renderDailyWord,
    refreshUI
  };
})();

window.DailyWord = DailyWord;

window.playAudioWithAnimation = function(btn, src) {
  if (!src) return;
  if (window.currentAudio) {
    window.currentAudio.pause();
    document.querySelectorAll('.daily-playing').forEach(el => el.classList.remove('daily-playing'));
  }
  btn.classList.add('daily-playing');
  window.currentAudio = new Audio(src);
  window.currentAudio.addEventListener('ended', () => btn.classList.remove('daily-playing'));
  window.currentAudio.addEventListener('pause', () => btn.classList.remove('daily-playing'));
  window.currentAudio.play().catch(err => {
    console.error('Audio play failed:', err);
    btn.classList.remove('daily-playing');
  });
};

