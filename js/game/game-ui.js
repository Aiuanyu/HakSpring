// js/game/game-ui.js
// Handles UI logic for the SRS game PoC

let currentSession = [];
let currentQuestionIndex = 0;
let score = 0;
let gameActiveDialect = '';
let gameActiveDataVarName = '';
let currentGameAudioElements = [];
let currentQuestionAudioPromise = Promise.resolve();

// 記住「上一次玩遊戲」用的腔調＋級別（dataVarName，如 '四基'）。
// 開遊戲 modal 仍照舊優先用網頁本身（或其他功能）目前設定的腔調/級別；
// 「搞上擺个腔級」按鈕按下去才會代入這裡記住的上次遊戲腔級。
const GAME_LAST_VAR_NAME_KEY = 'hakkaGameLastDataVarName';

function getLastPlayedGameVarName() {
  try {
    return localStorage.getItem(GAME_LAST_VAR_NAME_KEY) || null;
  } catch (e) {
    console.warn('Failed to read last played game level', e);
    return null;
  }
}

// 遊戲實際開打時才記錄，藉此代表「上一次玩」而非「選過但沒玩」
function saveLastPlayedGameVarName(dataVarName) {
  if (!dataVarName) return;
  try {
    if (localStorage.getItem(GAME_LAST_VAR_NAME_KEY) === dataVarName) return;
    localStorage.setItem(GAME_LAST_VAR_NAME_KEY, dataVarName);
    if (typeof window.triggerCloudSync === 'function') {
      window.triggerCloudSync();
    }
  } catch (e) {
    console.warn('Failed to save last played game level', e);
  }
}

// 只在「有上次玩過的紀錄、且跟目前 ready block 顯示的腔級不同」時才秀出按鈕，
// 避免使用者按了卻沒變化、一頭霧水。
function refreshUseLastPlayedBtn() {
  const btn = document.getElementById('gameUseLastPlayedBtn');
  if (!btn) return;
  const lastVarName = getLastPlayedGameVarName();
  const hasDifferentLast = !!lastVarName && !!window[lastVarName] && lastVarName !== gameActiveDataVarName;
  btn.style.display = hasDifferentLast ? 'inline-block' : 'none';
  if (hasDifferentLast && typeof getFullLevelName === 'function') {
    btn.textContent = `繼續搞 ${getFullLevelName(lastVarName)}`;
  }
}

function initGameUI() {
  const startGameBtn = document.getElementById('startGameBtn');
  const headerStartGameBtn = document.getElementById('headerStartGameBtn');
  const floatingStartGameBtn = document.getElementById('floatingStartGameBtn');
  const gameModal = document.getElementById('gameModal');
  const gameCloseBtn = document.getElementById('gameCloseBtn');
  const gameStartSessionBtn = document.getElementById('gameStartSessionBtn');
  const gameRetryBtn = document.getElementById('gameRetryBtn');
  const gamePlayAudioBtn = document.getElementById('game-play-audio-btn');

  const handleStartGameClick = () => {
    if (typeof trackEvent === 'function') {
      trackEvent('open_modal', 'Game', 'floating_btn');
    }

    const readyBlock = document.getElementById('game-setup-ready-block');
    const selectBlock = document.getElementById('game-setup-select-block');

    if (currentActiveDialectLevelFullName) {
      const 腔 = currentDataVarName.substring(0, 1);
      const 級 = currentDataVarName.substring(1);
      gameActiveDialect = getDialectInfo(腔, 級).腔名 || '四縣';
      gameActiveDataVarName = currentDataVarName;
      document.getElementById('game-target-level').textContent = currentActiveDialectLevelFullName;
      if (readyBlock) readyBlock.style.display = 'block';
      if (selectBlock) selectBlock.style.display = 'none';
      const startSessionBtn = document.getElementById('gameStartSessionBtn');
      if (startSessionBtn) startSessionBtn.style.display = 'block';
      refreshUseLastPlayedBtn();
      showGameView('setup');
      gameModal.style.display = 'flex';
      return;
    }

    // Infer from progress
    let latestVarName = null;
    let maxDue = -1;
    try {
      const progressObj = JSON.parse(localStorage.getItem('hakkaLearningProgress') || '{}');
      for (const key in progressObj) {
        const record = progressObj[key];
        const due = record[3] || 0;
        if (due > maxDue) {
          maxDue = due;
          const match = key.match(/^[cg]([^\d|]+)/);
          if (match) latestVarName = match[1];
        }
      }
    } catch (e) {
      console.warn('Failed to parse progress for inference', e);
    }

    if (latestVarName) {
      const varData = window[latestVarName];
      if (varData) {
        // Set game variables without triggering main UI changes
        gameActiveDataVarName = varData.name;
        // The getDialectInfo function is in main.js, but we can just set it from the first character
        const 腔 = varData.name.substring(0, 1);
        const 級 = varData.name.substring(1);
        gameActiveDialect = getDialectInfo(腔, 級).腔名 || '四縣'; // fallback

        document.getElementById('game-target-level').textContent = getFullLevelName(varData.name);
        if (readyBlock) readyBlock.style.display = 'block';
        if (selectBlock) selectBlock.style.display = 'none';
        const startSessionBtn = document.getElementById('gameStartSessionBtn');
        if (startSessionBtn) startSessionBtn.style.display = 'block';
        refreshUseLastPlayedBtn();
        showGameView('setup');
        gameModal.style.display = 'flex';
        return;
      }
    }

    if (readyBlock) readyBlock.style.display = 'none';
    if (selectBlock) selectBlock.style.display = 'block';
    const startSessionBtnFallback = document.getElementById('gameStartSessionBtn');
    if (startSessionBtnFallback) startSessionBtnFallback.style.display = 'none';
    showGameView('setup');
    gameModal.style.display = 'flex';
  };

  if (startGameBtn) startGameBtn.addEventListener('click', handleStartGameClick);
  if (headerStartGameBtn) headerStartGameBtn.addEventListener('click', handleStartGameClick);
  if (floatingStartGameBtn) floatingStartGameBtn.addEventListener('click', handleStartGameClick);

  const gameChangeLevelBtn = document.getElementById('gameChangeLevelBtn');
  if (gameChangeLevelBtn) {
    gameChangeLevelBtn.addEventListener('click', () => {
      document.getElementById('game-setup-ready-block').style.display = 'none';
      document.getElementById('gameStartSessionBtn').style.display = 'none';
      document.getElementById('game-setup-select-block').style.display = 'block';
    });
  }

  const gameConfirmLevelBtn = document.getElementById('gameConfirmLevelBtn');
  if (gameConfirmLevelBtn) {
    gameConfirmLevelBtn.addEventListener('click', () => {
      const dialect = document.getElementById('gameSelectDialect').value;
      const level = document.getElementById('gameSelectLevel').value;
      if (dialect && level) {
        const dataVarName = dialect + level;
        const varData = window[dataVarName];
        if (varData) {
          gameActiveDataVarName = varData.name;
          gameActiveDialect = getDialectInfo(dialect, level).腔名 || '四縣';

          document.getElementById('game-target-level').textContent = getFullLevelName(varData.name);
          document.getElementById('game-setup-select-block').style.display = 'none';
          document.getElementById('game-setup-ready-block').style.display = 'block';
          document.getElementById('gameStartSessionBtn').style.display = 'block';
          refreshUseLastPlayedBtn();
        } else {
          alert('無此腔調/級別組合的資料！');
        }
      } else {
        alert('請擇腔調摎級別！');
      }
    });
  }

  const gameUseLastPlayedBtn = document.getElementById('gameUseLastPlayedBtn');
  if (gameUseLastPlayedBtn) {
    gameUseLastPlayedBtn.addEventListener('click', () => {
      const lastVarName = getLastPlayedGameVarName();
      if (!lastVarName) return;
      const varData = window[lastVarName];
      if (!varData) {
        alert('揣無上擺个腔調/級別資料！');
        return;
      }
      gameActiveDataVarName = varData.name;
      const 腔 = lastVarName.substring(0, 1);
      const 級 = lastVarName.substring(1);
      gameActiveDialect = getDialectInfo(腔, 級).腔名 || '四縣';
      document.getElementById('game-target-level').textContent = getFullLevelName(varData.name);
      refreshUseLastPlayedBtn();
      if (typeof trackEvent === 'function') {
        trackEvent('use_last_played_level', 'Game', gameActiveDataVarName);
      }
    });
  }

  if (gameCloseBtn) {
    gameCloseBtn.addEventListener('click', () => {
      gameModal.style.display = 'none';
      stopGameAudio(); // 關 modal 立刻中斷任何正在播（或排隊要播）的音效
      if (currentSession && currentSession.length && currentQuestionIndex < currentSession.length) {
        if (typeof trackEvent === 'function') {
          trackEvent('quit_session', 'Game', `${gameActiveDataVarName}_q${currentQuestionIndex + 1}`);
        }
      }
    });
  }

  if (gameStartSessionBtn) {
    gameStartSessionBtn.addEventListener('click', startSession);
  }

  if (gameRetryBtn) {
    gameRetryBtn.addEventListener('click', startSession);
  }

  const gameSetupReturnBtn = document.getElementById('gameSetupReturnBtn');
  if (gameSetupReturnBtn) {
    gameSetupReturnBtn.addEventListener('click', () => {
      // 回選項畫面（沿用剛打完那局的腔調/級別），使用者不一定要換腔換級，
      // 想換的話畫面上本來就有「換其他腔／其他級」按鈕可以點，不必每次都先逼著重選。
      document.getElementById('game-setup-select-block').style.display = 'none';
      document.getElementById('game-setup-ready-block').style.display = 'block';
      document.getElementById('gameStartSessionBtn').style.display = 'block';
      refreshUseLastPlayedBtn();
      showGameView('setup');
    });
  }
  
  if (gamePlayAudioBtn) {
    gamePlayAudioBtn.addEventListener('click', () => {
      const question = currentSession[currentQuestionIndex];
      if (question && question.type === 'c') {
        playCurrentSentenceAudio();
      } else {
        playCurrentQuestionAudio();
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const gameModal = document.getElementById('gameModal');
    if (!gameModal || gameModal.style.display === 'none') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (['1', '2', '3', '4'].includes(e.key)) {
      const index = parseInt(e.key) - 1;
      const options = document.querySelectorAll('.game-option-btn');
      if (options.length > index && !options[0].disabled) {
        e.preventDefault();
        options[index].click();
      }
    }

    if (['q', 'w', 'e', 'Q', 'W', 'E'].includes(e.key)) {
      const evalBtns = document.querySelectorAll('.game-eval-btn');
      if (evalBtns.length > 0) {
        const keyMap = { 'q': 0, 'w': 1, 'e': 2 };
        const index = keyMap[e.key.toLowerCase()];
        if (evalBtns[index]) {
          e.preventDefault();
          evalBtns[index].click();
        }
      }
    }

    if (e.key.toLowerCase() === 'a') {
      const nextBtn = document.querySelector('.game-next-btn');
      if (nextBtn) {
        e.preventDefault();
        nextBtn.click();
      }
    }
    
    if (e.key.toLowerCase() === 'r') {
      const sentenceBtn = document.querySelector('.game-sentence-btn');
      if (sentenceBtn && sentenceBtn.style.display !== 'none') {
        e.preventDefault();
        sentenceBtn.click();
      }
    }

    if (e.key === 'Enter') {
      const nextBtn = document.querySelector('.game-next-btn');
      if (nextBtn) {
        e.preventDefault();
        nextBtn.click();
      } else {
        const evalBtns = document.querySelectorAll('.game-eval-btn');
        if (evalBtns.length > 0) {
          e.preventDefault();
          evalBtns[1].click(); // Default to 'good' on enter
        }
      }
    }
  });
}

function getSelectedTypes() {
  const checkboxes = document.querySelectorAll('input[name="gameType"]:checked');
  const types = Array.from(checkboxes).map(cb => cb.value);
  return types.length > 0 ? types : ['m']; // fallback to 'm'
}

async function startSession() {
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  const startBtn = document.getElementById('gameStartSessionBtn');
  const retryBtn = document.getElementById('gameRetryBtn');

  loadingText.textContent = '出題中，請小等一下……';
  loadingIndicator.style.display = 'flex';
  if (startBtn) startBtn.disabled = true;
  if (retryBtn) retryBtn.disabled = true;

  // 出題運算在慢速裝置（尤其手機）上是同步且吃重的，會卡住主執行緒數秒。
  // 若不先讓瀏覽器畫出上面這層遮罩就直接算題，使用者在等待期間亂點的觸控事件
  // 會被排進佇列，等運算結束、第一題畫面一出現就立刻誤觸到選項——導致第一題答錯。
  // 用雙重 requestAnimationFrame 確保遮罩「真的畫出來」了，才開始算題，
  // 讓期間的誤觸都被這層遮罩擋掉，而不是穿透到後面的答案按鈕。
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    const orderMode = document.querySelector('input[name="gameOrderMode"]:checked')?.value || 'random';
    const mixMode = document.querySelector('input[name="gameMixMode"]:checked')?.value || 'reviewFirst';
    const types = getSelectedTypes();

    currentSession = await generateGameSession(gameActiveDialect, gameActiveDataVarName, { orderMode, mixMode, types });
    currentQuestionIndex = 0;
    score = 0;

    saveLastPlayedGameVarName(gameActiveDataVarName);

    if (typeof trackEvent === 'function') {
      trackEvent('start_session', 'Game', `${gameActiveDataVarName}_${orderMode}_${mixMode}`);
    }

    loadingIndicator.style.display = 'none';
    showGameView('play');
    renderQuestion();
  } catch (err) {
    loadingIndicator.style.display = 'none';
    alert('產生題目失敗：' + err.message);
    console.error(err);
  } finally {
    if (startBtn) startBtn.disabled = false;
    if (retryBtn) retryBtn.disabled = false;
  }
}

function showGameView(viewName) {
  document.getElementById('game-setup-view').style.display = viewName === 'setup' ? 'block' : 'none';
  document.getElementById('game-play-view').style.display = viewName === 'play' ? 'block' : 'none';
  document.getElementById('game-result-view').style.display = viewName === 'result' ? 'block' : 'none';
}

function formatGamePinyinWithSandhi(pinyinStr) {
  if (!pinyinStr) return '';
  let formatted = typeof formatPhoneticForDisplay === 'function' ? formatPhoneticForDisplay(pinyinStr) : pinyinStr;
  const isDapu = gameActiveDialect === '大埔' || (gameActiveDataVarName && gameActiveDataVarName.startsWith('大'));
  if (isDapu && typeof getDapuSandhiHtml === 'function') {
    return getDapuSandhiHtml(formatted);
  }
  return formatted;
}

// 中斷並清掉所有進行中的遊戲音效（換題、關 modal、進下一題時都用）。
// 克漏字/聽力會連放兩遍，若不中斷，關掉 modal 後仍會繼續播。
function stopGameAudio() {
  currentGameAudioElements.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
  currentGameAudioElements = [];
}

function renderQuestion() {
  // Stop any currently playing audio
  stopGameAudio();

  if (currentQuestionIndex >= currentSession.length) {
    endSession();
    return;
  }

  const question = currentSession[currentQuestionIndex];
  
  const orderMode = document.querySelector('input[name="gameOrderMode"]:checked')?.value || 'random';
  const prefix = gameActiveDataVarName ? `${getFullLevelName(gameActiveDataVarName)} · ` : '';
  if (orderMode === 'sequential') {
    document.getElementById('game-question-counter').textContent = `${prefix}題 ${currentQuestionIndex + 1} / ${currentSession.length} (編號：${question.targetWord.編號})`;
  } else {
    document.getElementById('game-question-counter').textContent = `${prefix}題 ${currentQuestionIndex + 1} / ${currentSession.length}`;
  }
  
  const newBadge = document.getElementById('game-new-badge');
  newBadge.style.display = question.isNew ? 'inline-block' : 'none';

  // Apply pastel background color to modal dialog
  const gameModalDialog = document.querySelector('#gameModal .modal-dialog');
  if (gameModalDialog) {
    gameModalDialog.classList.remove('game-type-m', 'game-type-p', 'game-type-d', 'game-type-c', 'game-type-l');
    gameModalDialog.classList.add(`game-type-${question.type}`);
  }

  // Pinyin Mode specific UI
  const pinyinElem = document.getElementById('game-target-pinyin');
  const targetWordElem = document.getElementById('game-target-word');
  
  // Reset previous inline styles and visibility
  targetWordElem.style.removeProperty('font-size');
  targetWordElem.style.removeProperty('font-family');
  targetWordElem.style.removeProperty('display');
  pinyinElem.style.removeProperty('display');

  if (question.type === 'p') {
    pinyinElem.style.display = 'none'; // hide pinyin in prompt for pinyin test
    // If they have mandarin translation toggled on, we can append it
    const showMandarin = true; // Later we can add a toggle, for now just append it
    if (showMandarin && question.targetWord.華語詞義) {
      targetWordElem.innerHTML = `${question.targetWord.客家語}<div class="game-mandarin-translation">${question.targetWord.華語詞義}</div>`;
    } else {
      targetWordElem.innerHTML = question.targetWord.客家語;
    }
  } else if (question.type === 'l') {
    // 聽力題：隱藏目標詞和拼音，只播音檔
    targetWordElem.style.display = 'none';
    pinyinElem.style.display = 'none';
  } else if (question.type === 'd') {
    pinyinElem.style.display = 'none'; // hide pinyin in prompt since question is Chinese
    targetWordElem.textContent = question.targetWord.華語詞義;
    targetWordElem.style.setProperty('font-family', 'inherit', 'important');
    targetWordElem.style.setProperty('font-size', '1.3em', 'important');
  } else if (question.type === 'c') {
    pinyinElem.style.display = 'none';
    targetWordElem.innerHTML = question.clozeSentence;
    // 例句用「文源楷書 Marion Bunguan」那組（同主表例句 .sentence 的字型）
    targetWordElem.style.setProperty('font-family', "'Marion', 'Marion+jfBunguan', tauhu-oo, cursive", 'important');
    targetWordElem.style.setProperty('font-size', '1.3em', 'important');
  } else {
    targetWordElem.textContent = question.targetWord.客家語;
    pinyinElem.style.display = 'block';
    pinyinElem.innerHTML = formatGamePinyinWithSandhi(question.targetWord.客語標音_顯示 || question.targetWord.標音);
  }
  
  // Audio button hidden until they answer correctly
  document.getElementById('game-play-audio-btn').style.display = 'none';

  const optionsContainer = document.getElementById('game-options-container');
  optionsContainer.innerHTML = '';
  
  const existingHint = document.querySelector('.game-hint');
  if (existingHint) existingHint.remove();
  
  document.getElementById('game-feedback').style.display = 'none';
  
  question.options.forEach((opt, index) => {
    const btn = document.createElement('button');
    btn.className = 'game-option-btn';
    let displayOpt = opt;
    let comparisonValue = opt;
    if (question.type === 'l') {
      comparisonValue = opt.客家語;
      btn.style.fontFamily = 'var(--title-font)';
      btn.style.textAlign = 'left';
      btn.style.padding = '10px 15px'; // Adjust padding for taller button
      const optPinyin = formatGamePinyinWithSandhi(opt.客語標音_顯示 || opt.標音);
      const optMandarin = opt.華語詞義;
      // 3行排列
      const contentHtml = `
        <div style="display: inline-flex; flex-direction: column; vertical-align: middle;">
          <span style="font-family: var(--title-font); font-size: 1.2em; line-height: 1.2;">${opt.客家語}</span>
          <span style="font-family: var(--roman-font); font-size: 0.85em; color: #555; line-height: 1.2; margin-top: 2px;">${optPinyin}</span>
          <span style="font-size: 0.8em; color: #888; line-height: 1.2; margin-top: 2px;">${optMandarin}</span>
        </div>
      `;
      displayOpt = contentHtml;
    } else if (question.type === 'p') {
      btn.classList.add('game-pinyin-option');
      displayOpt = `<span class="pinyin-text">${formatGamePinyinWithSandhi(opt)}</span>`;
    } else if (question.type === 'd') {
      displayOpt = `<span style="font-family: var(--title-font); font-size: 1.2em;">${opt}</span>`;
    } else if (question.type === 'c') {
      // 克漏字選項是客語詞 → 用 --title-font（比照 |d）
      displayOpt = `<span style="font-family: var(--title-font); font-size: 1.2em;">${opt}</span>`;
    }
    
    if (question.type === 'l') {
      btn.innerHTML = `<kbd class="kbd-shortcut" style="vertical-align: middle; margin-right: 10px;">${index + 1}</kbd> ${displayOpt}`;
    } else {
      btn.innerHTML = `<kbd class="kbd-shortcut">${index + 1}</kbd> ${displayOpt}`;
    }
    btn.dataset.option = comparisonValue;
    btn.onclick = () => handleAnswer(comparisonValue, btn);
    optionsContainer.appendChild(btn);
  });
  
  if (question.type === 'c') {
    optionsContainer.insertAdjacentHTML('afterend', '<div class="game-hint" style="margin-top: 15px; font-size: 0.85em; color: #888;">克漏字是以教材例句出題，所以若選項中剛好有適合的詞但非標準答案，還請別介意！</div>');
  }
  
  // 題目出現時立刻播放音檔
  if (question.type === 'c') {
    currentQuestionAudioPromise = playCurrentSentenceAudio();
  } else {
    currentQuestionAudioPromise = playCurrentQuestionAudio();
  }

  // 自動捲動到題目卡 (為了窄版螢幕體驗)
  const playView = document.getElementById('game-play-view');
  if (playView) {
    playView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function highlightDiff(wrongStr, correctStr) {
  const dp = Array(correctStr.length + 1).fill(0).map(() => Array(wrongStr.length + 1).fill(0));
  for (let i = 1; i <= correctStr.length; i++) {
    for (let j = 1; j <= wrongStr.length; j++) {
      if (correctStr[i - 1] === wrongStr[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  let i = correctStr.length;
  let j = wrongStr.length;
  const matchCorrect = Array(correctStr.length).fill(false);
  
  while (i > 0 && j > 0) {
    if (correctStr[i - 1] === wrongStr[j - 1]) {
      matchCorrect[i - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  let result = '';
  let inStrong = false;
  for (let k = 0; k < correctStr.length; k++) {
    if (!matchCorrect[k]) {
      if (!inStrong) {
        result += '<strong class="diff-highlight">';
        inStrong = true;
      }
      result += correctStr[k];
    } else {
      if (inStrong) {
        result += '</strong>';
        inStrong = false;
      }
      result += correctStr[k];
    }
  }
  if (inStrong) {
    result += '</strong>';
  }
  return result;
}

function bumpDailyStat(isCorrect, isNew, qType, dataVarName) {
  try {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    // 1. 原有每日總計
    const statsObj = JSON.parse(localStorage.getItem('hakkaDailyStats') || '{}');
    const statArr = statsObj[dateStr] || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    statArr[0] = (statArr[0] ?? 0) + 1;
    if (isCorrect) {
      statArr[1] = (statArr[1] ?? 0) + 1;
    }
    if (isNew) {
      statArr[3] = (statArr[3] ?? 0) + 1;
    } else {
      statArr[2] = (statArr[2] ?? 0) + 1;
    }
    
    const typeIndexMap = { 'm': 4, 'p': 5, 'd': 6, 'c': 7, 'l': 8 };
    const typeIndex = typeIndexMap[qType];
    if (typeIndex !== undefined) {
      statArr[typeIndex] = (statArr[typeIndex] ?? 0) + 1;
    }
    
    statsObj[dateStr] = statArr;
    localStorage.setItem('hakkaDailyStats', JSON.stringify(statsObj));

    // 2. 新增每日各腔級統計
    if (dataVarName) {
      const statsByLevelObj = JSON.parse(localStorage.getItem('hakkaDailyStatsByLevel') || '{}');
      const todayByLevel = statsByLevelObj[dateStr] || {};
      const levelStatArr = todayByLevel[dataVarName] || [0, 0];
      
      levelStatArr[0] = (levelStatArr[0] ?? 0) + 1; // 答題數
      if (isCorrect) {
        levelStatArr[1] = (levelStatArr[1] ?? 0) + 1; // 答對數
      }
      todayByLevel[dataVarName] = levelStatArr;
      statsByLevelObj[dateStr] = todayByLevel;
      localStorage.setItem('hakkaDailyStatsByLevel', JSON.stringify(statsByLevelObj));
    }
  } catch (e) {
    console.warn('Failed to save daily stats', e);
  }
}

async function handleAnswer(selectedOption, btnElement) {
  const question = currentSession[currentQuestionIndex];
  let isCorrect = false;
  let correctText = '';
  
  if (question.type === 'p') {
    correctText = question.targetWord.客語標音_顯示 || question.targetWord.標音;
    isCorrect = selectedOption === correctText;
  } else if (question.type === 'd') {
    correctText = question.targetWord.客家語;
    isCorrect = selectedOption === correctText;
  } else if (question.type === 'c') {
    correctText = question.clozeTarget;
    isCorrect = selectedOption === correctText;
  } else if (question.type === 'l') {
    correctText = question.targetWord.客家語;
    isCorrect = selectedOption === correctText;
  } else {
    correctText = question.targetWord.華語詞義;
    isCorrect = selectedOption === correctText;
  }
  
  if (typeof trackEvent === 'function') {
    trackEvent('answer', 'Game', isCorrect ? 'correct' : 'wrong');
  }
  
  bumpDailyStat(isCorrect, question.isNew, question.type, gameActiveDataVarName);
  
  const options = document.querySelectorAll('.game-option-btn');
  options.forEach(btn => btn.disabled = true); // Disable all options

  const feedback = document.getElementById('game-feedback');
  feedback.style.display = 'block';
  feedback.innerHTML = ''; // clear previous
  
  const replayAudioPromise = currentQuestionAudioPromise.then(() => {
    if (question.type === 'c' || question.type === 'p') {
      return playCurrentQuestionAudio();
    } else {
      const fullSourceName = `cert${question.targetWord.dataVarName}`;
      const sentenceAudioUrl = typeof constructSentenceAudioUrl === 'function' ? constructSentenceAudioUrl(question.targetWord, fullSourceName) : null;
      if (sentenceAudioUrl) {
        return playCurrentSentenceAudio();
      } else {
        return playCurrentQuestionAudio();
      }
    }
  });

  if (isCorrect) {
    btnElement.classList.add('correct');
    feedback.className = 'game-feedback correct';
    score++;
    
    const msg = document.createElement('div');
    if (question.type === 'd' || question.type === 'c') {
      const pinyinHtml = formatGamePinyinWithSandhi(question.targetWord.客語標音_顯示 || question.targetWord.標音);
      msg.innerHTML = `著！（你覺著這題會難無：）<div style="margin-top: 8px; font-size: 0.9em; opacity: 0.9;">拼音：<span class="pinyin-text">${pinyinHtml}</span></div>`;
    } else {
      msg.textContent = '著！（你覺著這題會難無：）';
    }
    msg.style.marginBottom = '10px';
    feedback.appendChild(msg);
    
    const evalContainer = document.createElement('div');
    evalContainer.style.display = 'flex';
    evalContainer.style.flexWrap = 'wrap';
    evalContainer.style.gap = '10px';
    evalContainer.style.marginTop = '10px';
    
    const createEvalBtn = (text, color, result, shortcut) => {
      const b = document.createElement('button');
      b.className = 'game-btn game-eval-btn';
      b.style.backgroundColor = color;
      b.style.flex = '1 1 auto';
      b.innerHTML = `${text} <kbd class="kbd-shortcut" style="margin-right: 0; margin-left: 4px; padding: 1px 4px; font-size: 0.8em; opacity: 0.8">${shortcut}</kbd>`;
      b.onclick = () => saveProgressAndNext(result);
      return b;
    };
    
    evalContainer.appendChild(createEvalBtn('困難', '#ffc107', 'hard', 'Q'));
    evalContainer.appendChild(createEvalBtn('普通', '#28a745', 'good', 'W'));
    evalContainer.appendChild(createEvalBtn('簡單', '#007bff', 'easy', 'E'));
    
    feedback.appendChild(evalContainer);
    
    appendSentenceUI(feedback, question);
  } else {
    btnElement.classList.add('wrong');
    feedback.className = 'game-feedback wrong';
    
    // Highlight correct answer
    options.forEach(btn => {
      if (btn.dataset.option === correctText) {
        btn.classList.add('correct');
        if (question.type === 'p') {
          const kbdMatch = btn.innerHTML.match(/<kbd[^>]*>.*?<\/kbd>/);
          const kbdHTML = kbdMatch ? kbdMatch[0] : '';
          btn.innerHTML = `${kbdHTML} ${highlightDiff(selectedOption, correctText)}`;
        }
      }
    });
    
    const msg = document.createElement('div');
    if (question.type === 'p') {
      msg.innerHTML = `毋著。正確答案係：${highlightDiff(selectedOption, correctText)}`;
    } else if (question.type === 'd' || question.type === 'c') {
      const pinyinHtml = formatGamePinyinWithSandhi(question.targetWord.客語標音_顯示 || question.targetWord.標音);
      msg.innerHTML = `毋著。正確答案係：<span style="font-family: var(--title-font); font-size: 1.2em;">${correctText}</span><div style="margin-top: 8px; font-size: 0.9em; opacity: 0.9;">拼音：<span class="pinyin-text">${pinyinHtml}</span></div>`;
    } else {
      msg.textContent = `毋著。正確答案係：${correctText}`;
    }
    msg.style.marginBottom = '10px';
    feedback.appendChild(msg);
    
    appendSentenceUI(feedback, question);
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'game-btn game-next-btn';
    nextBtn.innerHTML = `下一題 <kbd class="kbd-shortcut" style="margin-right: 0; margin-left: 4px; padding: 1px 4px; font-size: 0.8em; opacity: 0.8">A</kbd>`;
    nextBtn.onclick = () => saveProgressAndNext('again');
    feedback.appendChild(nextBtn);
  }

  // 自動捲動到評估區，讓評估區保持在上緣
  feedback.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveProgressAndNext(lastResult) {
  if (typeof trackEvent === 'function') {
    trackEvent('grade', 'Game', lastResult);
  }

  const question = currentSession[currentQuestionIndex];
  // 一詞一卡：進度一律寫回詞卡（|m key），題型只影響 typeReps 計數。
  const wordKey = question.targetWord.progressKey.replace(/\|.$/, '|m');
  const existingProgress = await getProgress(wordKey) || {};

  // typeReps：這次用的形式 +1
  const typeReps = { ...(existingProgress.typeReps || {}) };
  if (typeReps.m == null && existingProgress.reps != null) {
    typeReps.m = existingProgress.reps; // 舊詞卡首次補上 |m 歷史次數
  }
  typeReps[question.type] = (typeReps[question.type] || 0) + 1;

  const todayEpochDay = Math.floor(Date.now() / 86400000);
  if (question.isPlanting && lastResult !== 'again') {
    // 種植連發題答對：只記 typeReps，不推進 SM-2（避免同日兩次曝光雙重加速排程）
    await putProgress(wordKey, { ...existingProgress, typeReps });
  } else {
    const newState = computeSM2(existingProgress, lastResult, todayEpochDay);
    await putProgress(wordKey, { ...newState, typeReps });
  }

  currentQuestionIndex++;
  renderQuestion();
}

function playCurrentQuestionAudio() {
  // modal 已關就別播——擋掉「關閉時第一遍還在放、鏈上的第二遍才要觸發」的漏網音效
  const gameModal = document.getElementById('gameModal');
  if (!gameModal || gameModal.style.display === 'none') return Promise.resolve();
  const question = currentSession[currentQuestionIndex];
  if (!question) return Promise.resolve();

  const targetWord = question.targetWord;
  // Use existing constructWordAudioUrl logic from main.js
  const fullSourceName = 'cert' + targetWord.dataVarName; // Assumed cert since PoC focuses on cert levels
  const audioUrl = typeof constructWordAudioUrl === 'function' ? constructWordAudioUrl(targetWord, fullSourceName) : null;
  
  if (audioUrl) {
    const finalUrl = applyAudioProxy(audioUrl);
    const audio = new Audio(finalUrl);
    currentGameAudioElements.push(audio);
    
    const audioBtn = document.getElementById('game-play-audio-btn');
    audioBtn.style.display = 'inline-block';
    
    // Animate button
    audioBtn.classList.add('playing');
    
    return new Promise(resolve => {
      audio.onended = () => {
        audioBtn.classList.remove('playing');
        resolve();
      };
      audio.onerror = () => {
        audioBtn.classList.remove('playing');
        resolve();
      };
      audio.play().catch(e => {
        console.error("Audio playback failed:", e);
        audioBtn.classList.remove('playing');
        resolve();
      });
    });
  }
  return Promise.resolve();
}

function appendSentenceUI(feedback, question) {
  const sentenceTextValue = question.targetWord.例句 ? question.targetWord.例句.trim() : '';
  if (sentenceTextValue && sentenceTextValue !== '-') {
    const sentenceDisplay = document.createElement('div');
    sentenceDisplay.className = 'game-sentence-display';
    
    const sentenceText = document.createElement('div');
    const formatText = (text) => text ? text.replace(/\n/g, '<br>') : '';
    const hakkaText = `<span class="sentence" style="font-size: 1.1em;">${formatText(question.targetWord.例句)}</span>`;
    
    const fullSourceName = `cert${question.targetWord.dataVarName}`;
    const audioUrl = typeof constructSentenceAudioUrl === 'function' ? constructSentenceAudioUrl(question.targetWord, fullSourceName) : null;
    const hasAudio = !!audioUrl;
    
    let sentenceAudioBtn = null;
    if (hasAudio) {
      sentenceAudioBtn = document.createElement('button');
      sentenceAudioBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
      sentenceAudioBtn.className = 'game-btn';
      sentenceAudioBtn.style.marginLeft = '10px';
      sentenceAudioBtn.style.backgroundColor = 'var(--primary-color)';
      sentenceAudioBtn.style.color = '#fff';
      sentenceAudioBtn.style.padding = '2px 8px';
      sentenceAudioBtn.style.fontSize = '0.9em';
      
      sentenceAudioBtn.onclick = (e) => {
        e.stopPropagation();
        playCurrentSentenceAudio(sentenceAudioBtn);
      };
    }

    sentenceText.innerHTML = `<strong>例句：</strong> ${hakkaText} `;
    if (sentenceAudioBtn) {
      sentenceText.appendChild(sentenceAudioBtn);
    }
    
    const translationTextValue = question.targetWord.翻譯 ? question.targetWord.翻譯.trim() : '';
    if (translationTextValue && translationTextValue !== '-') {
      sentenceText.insertAdjacentHTML('beforeend', `<br><strong>翻譯：</strong> ${formatText(question.targetWord.翻譯)}`);
    }
    
    sentenceDisplay.appendChild(sentenceText);

    const sentenceBtn = document.createElement('button');
    sentenceBtn.className = 'game-btn game-sentence-btn';
    sentenceBtn.style.backgroundColor = 'var(--text-light)';
    sentenceBtn.style.color = '#fff';
    sentenceBtn.style.marginRight = '10px';
    sentenceBtn.style.marginBottom = '10px';
    sentenceBtn.innerHTML = `看例句 <kbd class="kbd-shortcut" style="margin-right: 0; margin-left: 4px; padding: 1px 4px; font-size: 0.8em; opacity: 0.8">R</kbd>`;
    sentenceBtn.onclick = () => {
      sentenceDisplay.style.display = 'block';
      sentenceBtn.style.display = 'none';
      if (typeof trackEvent === 'function') {
        trackEvent('view_example', 'Game', gameActiveDataVarName);
      }
      if (hasAudio) {
        playCurrentSentenceAudio(sentenceAudioBtn);
      }
    };
    
    feedback.appendChild(sentenceBtn);
    
    const autoOpen = document.getElementById('gameAutoOpenSentence')?.checked;
    if (autoOpen) {
      sentenceDisplay.style.display = 'block';
      sentenceBtn.style.display = 'none';
    }
    feedback.appendChild(sentenceDisplay);
  }
}

function playCurrentSentenceAudio(btnEl) {
  // modal 已關就別播（同 playCurrentQuestionAudio；克漏字/聽力連放兩遍尤其需要）
  const gameModal = document.getElementById('gameModal');
  if (!gameModal || gameModal.style.display === 'none') return Promise.resolve();
  const question = currentSession[currentQuestionIndex];
  if (!question) return Promise.resolve();

  const targetWord = question.targetWord;
  // constructSentenceAudioUrl expects (lineData, fullSourceName)
  // We construct fullSourceName like 'cert四基'
  // But wait, getWordsForDialectAndLevel returns dataVarName like '四基'
  // and we know it's cert if we're in the game mode (which only uses cert so far)
  const fullSourceName = `cert${targetWord.dataVarName}`;
  const audioUrl = typeof constructSentenceAudioUrl === 'function' ? constructSentenceAudioUrl(targetWord, fullSourceName) : null;
  
  if (audioUrl) {
    const finalUrl = applyAudioProxy(audioUrl);
    const audio = new Audio(finalUrl);
    currentGameAudioElements.push(audio);
    
    if (btnEl) {
      btnEl.classList.add('playing');
      btnEl.style.opacity = '0.7';
    } else {
      const audioBtn = document.getElementById('game-play-audio-btn');
      if (audioBtn) {
        audioBtn.style.display = 'inline-block';
        audioBtn.classList.add('playing');
      }
    }
    
    if (typeof trackEvent === 'function') {
      trackEvent('play_sentence_audio', 'Game', gameActiveDataVarName);
    }
    
    return new Promise(resolve => {
      audio.onended = () => {
        if (btnEl) {
          btnEl.classList.remove('playing');
          btnEl.style.opacity = '1';
        } else {
          const audioBtn = document.getElementById('game-play-audio-btn');
          if (audioBtn) audioBtn.classList.remove('playing');
        }
        resolve();
      };
      
      audio.onerror = () => {
        if (btnEl) {
          btnEl.classList.remove('playing');
          btnEl.style.opacity = '1';
        } else {
          const audioBtn = document.getElementById('game-play-audio-btn');
          if (audioBtn) audioBtn.classList.remove('playing');
        }
        resolve();
      };
      
      audio.play().catch(e => {
        console.error("Sentence audio playback failed:", e);
        if (btnEl) {
          btnEl.classList.remove('playing');
          btnEl.style.opacity = '1';
        } else {
          const audioBtn = document.getElementById('game-play-audio-btn');
          if (audioBtn) audioBtn.classList.remove('playing');
        }
        resolve();
      });
    });
  }
  return Promise.resolve();
}

function endSession() {
  showGameView('result');
  document.getElementById('game-final-score').textContent = score;
  const totalElem = document.getElementById('game-total-questions');
  if (totalElem) totalElem.textContent = currentSession.length;
  
  if (typeof trackEvent === 'function') {
    trackEvent('complete_session', 'Game', `${gameActiveDataVarName}_${score}/${currentSession.length}`);
  }
}

// Hook into existing initializeAppUI or run when DOM is loaded
document.addEventListener('DOMContentLoaded', initGameUI);

// --- 戰績面板與 Streak 邏輯 ---

function getLocalYMD() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function calculateStreak(stats) {
  if (!stats || Object.keys(stats).length === 0) return 0;
  
  const dates = Object.keys(stats).sort().reverse();
  const todayStr = getLocalYMD();
  
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterdayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  
  let streak = 0;
  let currentCheckDateStr = dates[0] === todayStr ? todayStr : yesterdayStr;
  
  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
    return 0; // 最新紀錄早於昨天，代表中斷
  }

  const checkDate = new Date(currentCheckDateStr + 'T00:00:00');

  for (let i = 0; i < dates.length; i++) {
    const dStr = checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + String(checkDate.getDate()).padStart(2, '0');
    if (stats[dStr]) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

function aggregateStats(startDateStr, endDateStr) {
  const stats = JSON.parse(localStorage.getItem('hakkaDailyStats') || '{}');
  const levelStats = JSON.parse(localStorage.getItem('hakkaDailyStatsByLevel') || '{}');
  
  const res = { correct: 0, wrong: 0, types: {}, levels: {} };
  
  // bumpDailyStat 存的陣列格式：[total, correct, reviews, new, m, p, d, c, l]
  // 索引對照：0=總題數, 1=正確數, 2=複習數, 3=新詞數, 4=m次, 5=p次, 6=d次, 7=c次, 8=l次
  const typeIndexMap = { 'm': 4, 'p': 5, 'd': 6, 'c': 7, 'l': 8 };
  ['m', 'p', 'd', 'c', 'l'].forEach(t => { res.types[t] = { correct: 0, wrong: 0 }; });
  
  for (const [date, dayStats] of Object.entries(stats)) {
    if ((!startDateStr || date >= startDateStr) && (!endDateStr || date <= endDateStr)) {
      if (Array.isArray(dayStats)) {
        // 陣列格式：[total, correct, reviews, new, m, p, d, c, l]
        const dayTotal = dayStats[0] || 0;
        const dayCorrect = dayStats[1] || 0;
        const dayWrong = dayTotal - dayCorrect;
        res.correct += dayCorrect;
        res.wrong += dayWrong;
        
        // 各題型只有「次數」，沒有「對錯」分開記（bumpDailyStat 只記該題型被答幾次）。
        // 所以這裡先把題型次數記到 correct，未來若需要分開再擴充。
        for (const [t, idx] of Object.entries(typeIndexMap)) {
          const typeCount = dayStats[idx] || 0;
          if (typeCount > 0) {
            // 以比例推估各題型的正確數
            const ratio = dayTotal > 0 ? dayCorrect / dayTotal : 0;
            res.types[t].correct += Math.round(typeCount * ratio);
            res.types[t].wrong += typeCount - Math.round(typeCount * ratio);
          }
        }
      } else if (typeof dayStats === 'object') {
        // 萬一有舊格式物件資料的兼容
        for (const [type, ts] of Object.entries(dayStats)) {
          if (!res.types[type]) res.types[type] = { correct: 0, wrong: 0 };
          res.types[type].correct += ts.correct || 0;
          res.types[type].wrong += ts.wrong || 0;
          res.correct += ts.correct || 0;
          res.wrong += ts.wrong || 0;
        }
      }
      
      // 腔級統計（hakkaDailyStatsByLevel）
      if (levelStats[date]) {
        for (const [lvl, lvlDayStats] of Object.entries(levelStats[date])) {
          if (!res.levels[lvl]) res.levels[lvl] = { correct: 0, wrong: 0 };
          if (Array.isArray(lvlDayStats)) {
            // [答題數, 答對數] 格式
            const lvlTotal = lvlDayStats[0] || 0;
            const lvlCorrect = lvlDayStats[1] || 0;
            res.levels[lvl].correct += lvlCorrect;
            res.levels[lvl].wrong += (lvlTotal - lvlCorrect);
          } else if (typeof lvlDayStats === 'object') {
            for (const [type, ts] of Object.entries(lvlDayStats)) {
              res.levels[lvl].correct += ts.correct || 0;
              res.levels[lvl].wrong += ts.wrong || 0;
            }
          }
        }
      }
    }
  }
  
  return res;
}

function generateStatsHTML(title, data) {
  if (data.correct + data.wrong === 0) {
    return `<div style="text-align: center; color: var(--text-muted, #666); margin: 20px 0;">無答題紀錄</div>`;
  }
  
  const total = data.correct + data.wrong;
  const acc = Math.round((data.correct / total) * 100);

  let html = `<h5 style="margin-top: 0;">${title}</h5>`;

  // 對錯：堆疊式橫條（左綠答對、右紅答錯）＋數字說明
  const correctPct = total > 0 ? (data.correct / total) * 100 : 0;
  html += `
    <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
      <span style="color:#28a745;">✓ 答對 ${data.correct}</span>
      <span style="font-weight:bold;">正確率 ${acc}%</span>
      <span style="color:#dc3545;">✗ 答錯 ${data.wrong}</span>
    </div>
    <div style="display:flex; height:22px; border-radius:11px; overflow:hidden; margin-bottom:18px; background:rgba(128,128,128,0.15);">
      <div style="width:${correctPct}%; background:#28a745;" title="答對 ${data.correct}"></div>
      <div style="width:${100 - correctPct}%; background:#dc3545;" title="答錯 ${data.wrong}"></div>
    </div>`;

  // 題型分佈：堆疊式橫條，5 段用 5 題型粉彩（§E 同色）＋圖例
  const typeNames = { m: '看漢字選華語', p: '看拼音選華語', d: '看華語選漢字', c: '聽音選華語', l: '聽音選漢字' };
  const typeOrder = ['m', 'p', 'd', 'c', 'l'];
  const typeTotals = typeOrder.map(t => ({ t, n: (data.types[t] ? data.types[t].correct + data.types[t].wrong : 0) }));
  const grandTypeTotal = typeTotals.reduce((s, x) => s + x.n, 0);
  if (grandTypeTotal > 0) {
    html += `<h6 style="margin-bottom:6px;">題型分佈</h6>`;
    html += `<div style="display:flex; height:22px; border-radius:11px; overflow:hidden; margin-bottom:8px; background:rgba(128,128,128,0.15);">`;
    for (const { t, n } of typeTotals) {
      if (n === 0) continue;
      const pct = (n / grandTypeTotal) * 100;
      html += `<div style="width:${pct}%; background:var(--game-type-${t});" title="${typeNames[t]}：${n} 題"></div>`;
    }
    html += `</div>`;
    // 圖例
    html += `<div style="display:flex; flex-wrap:wrap; gap:4px 12px; font-size:0.8rem; margin-bottom:18px;">`;
    for (const { t, n } of typeTotals) {
      if (n === 0) continue;
      html += `<span style="display:inline-flex; align-items:center; gap:4px;">
        <span style="width:12px; height:12px; border-radius:3px; background:var(--game-type-${t}); display:inline-block;"></span>
        ${typeNames[t]} ${n}
      </span>`;
    }
    html += `</div>`;
  }
  
  if (Object.keys(data.levels).length > 0) {
    html += `<h6 style="margin-bottom:6px;">腔級分佈</h6><div style="display: flex; flex-direction: column; gap: 10px;">`;
    const sortedLevels = Object.entries(data.levels).sort((a, b) => (b[1].correct + b[1].wrong) - (a[1].correct + a[1].wrong));
    for (const [lvl, stats] of sortedLevels) {
      const lTotal = stats.correct + stats.wrong;
      if (lTotal === 0) continue;
      const lAcc = Math.round((stats.correct / lTotal) * 100);
      const lCorrectPct = (stats.correct / lTotal) * 100;
      const lvlLabel = (typeof getFullLevelName === 'function' ? getFullLevelName(lvl) : null) || lvl;
      // 每腔級一條堆疊橫條（左綠答對、右紅答錯）＋標籤
      html += `<div>
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:3px;">
          <span>${lvlLabel}</span>
          <span style="color:var(--text-muted,#666);">${stats.correct} 對 / ${stats.wrong} 錯 (${lAcc}%)</span>
        </div>
        <div style="display:flex; height:16px; border-radius:8px; overflow:hidden; background:rgba(128,128,128,0.15);">
          <div style="width:${lCorrectPct}%; background:#28a745;" title="答對 ${stats.correct}"></div>
          <div style="width:${100 - lCorrectPct}%; background:#dc3545;" title="答錯 ${stats.wrong}"></div>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  
  return html;
}

window.renderStatsModal = function() {
  const stats = JSON.parse(localStorage.getItem('hakkaDailyStats') || '{}');
  
  const streakDays = calculateStreak(stats);
  const streakContainer = document.getElementById('stats-streak-container');
  const streakSpan = document.getElementById('stats-streak-days');
  if (streakContainer && streakSpan) {
    if (streakDays > 0) {
      streakSpan.textContent = streakDays;
      streakContainer.style.display = 'block';
    } else {
      streakContainer.style.display = 'none';
    }
  }
  
  const todayStr = getLocalYMD();
  
  const todayData = aggregateStats(todayStr, todayStr);
  document.getElementById('stats-tab-today').innerHTML = generateStatsHTML('今晡日个戰績', todayData);
  
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const weekAgoStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const weekData = aggregateStats(weekAgoStr, todayStr);
  document.getElementById('stats-tab-week').innerHTML = generateStatsHTML('這禮拜个戰績（近七日）', weekData);
  
  const d2 = new Date();
  d2.setDate(d2.getDate() - 29);
  const monthAgoStr = d2.getFullYear() + '-' + String(d2.getMonth() + 1).padStart(2, '0') + '-' + String(d2.getDate()).padStart(2, '0');
  const monthData = aggregateStats(monthAgoStr, todayStr);
  document.getElementById('stats-tab-month').innerHTML = generateStatsHTML('這隻月个戰績（近三十日）', monthData);
  
  const d3 = new Date();
  d3.setDate(d3.getDate() - 364);
  const yearAgoStr = d3.getFullYear() + '-' + String(d3.getMonth() + 1).padStart(2, '0') + '-' + String(d3.getDate()).padStart(2, '0');
  const yearData = aggregateStats(yearAgoStr, todayStr);
  document.getElementById('stats-tab-year').innerHTML = generateStatsHTML('今年个戰績（近三百六十五日）', yearData);
  
  const allTimeData = aggregateStats(null, null);
  document.getElementById('stats-tab-overview').innerHTML = generateStatsHTML('各腔總覽（所有紀錄）', allTimeData);
};
