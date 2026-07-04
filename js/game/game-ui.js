// js/game/game-ui.js
// Handles UI logic for the SRS game PoC

let currentSession = [];
let currentQuestionIndex = 0;
let score = 0;
let gameActiveDialect = '';
let gameActiveDataVarName = '';
let currentGameAudioElements = [];

function initGameUI() {
  const startGameBtn = document.getElementById('startGameBtn');
  const gameModal = document.getElementById('gameModal');
  const gameCloseBtn = document.getElementById('gameCloseBtn');
  const gameStartSessionBtn = document.getElementById('gameStartSessionBtn');
  const gameRetryBtn = document.getElementById('gameRetryBtn');
  const gamePlayAudioBtn = document.getElementById('game-play-audio-btn');

  if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
      // Check if a dialect and level are selected
      if (!currentActiveDialectLevelFullName) {
        alert('請先在主控板選擇腔調與級別！');
        return;
      }
      
      gameActiveDialect = currentDialect;
      gameActiveDataVarName = currentDataVarName;
      
      document.getElementById('game-target-level').textContent = currentActiveDialectLevelFullName;
      showGameView('setup');
      gameModal.style.display = 'flex';
    });
  }

  if (gameCloseBtn) {
    gameCloseBtn.addEventListener('click', () => {
      gameModal.style.display = 'none';
    });
  }

  if (gameStartSessionBtn) {
    gameStartSessionBtn.addEventListener('click', startSession);
  }

  if (gameRetryBtn) {
    gameRetryBtn.addEventListener('click', startSession);
  }
  
  if (gamePlayAudioBtn) {
    gamePlayAudioBtn.addEventListener('click', playCurrentQuestionAudio);
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

async function startSession() {
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  
  loadingText.textContent = '準備題目中...';
  loadingIndicator.style.display = 'flex';

  try {
    const modeSelect = document.getElementById('gameLearningMode');
    const mode = modeSelect ? modeSelect.value : 'review';
    currentSession = await generateGameSession(gameActiveDialect, gameActiveDataVarName, mode);
    currentQuestionIndex = 0;
    score = 0;
    
    loadingIndicator.style.display = 'none';
    showGameView('play');
    renderQuestion();
  } catch (err) {
    loadingIndicator.style.display = 'none';
    alert('產生題目失敗：' + err.message);
    console.error(err);
  }
}

function showGameView(viewName) {
  document.getElementById('game-setup-view').style.display = viewName === 'setup' ? 'block' : 'none';
  document.getElementById('game-play-view').style.display = viewName === 'play' ? 'block' : 'none';
  document.getElementById('game-result-view').style.display = viewName === 'result' ? 'block' : 'none';
}

function renderQuestion() {
  // Stop any currently playing audio
  currentGameAudioElements.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
  currentGameAudioElements = [];

  if (currentQuestionIndex >= currentSession.length) {
    endSession();
    return;
  }

  const question = currentSession[currentQuestionIndex];
  
  const modeSelect = document.getElementById('gameLearningMode');
  const mode = modeSelect ? modeSelect.value : 'review';
  if (mode === 'sequential') {
    document.getElementById('game-question-counter').textContent = `題 ${currentQuestionIndex + 1} / ${currentSession.length} (編號：${question.targetWord.編號})`;
  } else {
    document.getElementById('game-question-counter').textContent = `題 ${currentQuestionIndex + 1} / ${currentSession.length}`;
  }
  
  const newBadge = document.getElementById('game-new-badge');
  newBadge.style.display = question.isNew ? 'inline-block' : 'none';

  document.getElementById('game-target-word').textContent = question.targetWord.客家語;
  document.getElementById('game-target-pinyin').textContent = question.targetWord.標音;
  
  // Audio button hidden until they answer correctly
  document.getElementById('game-play-audio-btn').style.display = 'none';

  const optionsContainer = document.getElementById('game-options-container');
  optionsContainer.innerHTML = '';
  
  document.getElementById('game-feedback').style.display = 'none';
  
  question.options.forEach((opt, index) => {
    const btn = document.createElement('button');
    btn.className = 'game-option-btn';
    btn.innerHTML = `<kbd class="kbd-shortcut">${index + 1}</kbd> ${opt}`;
    btn.onclick = () => handleAnswer(opt, btn);
    optionsContainer.appendChild(btn);
  });
}

async function handleAnswer(selectedOption, btnElement) {
  const question = currentSession[currentQuestionIndex];
  const isCorrect = selectedOption === question.targetWord.華語詞義;
  
  const options = document.querySelectorAll('.game-option-btn');
  options.forEach(btn => btn.disabled = true); // Disable all options

  const feedback = document.getElementById('game-feedback');
  feedback.style.display = 'block';
  feedback.innerHTML = ''; // clear previous

  if (isCorrect) {
    btnElement.classList.add('correct');
    feedback.className = 'game-feedback correct';
    score++;
    
    // Play audio
    const audioPromise = playCurrentQuestionAudio();
    
    const msg = document.createElement('div');
    msg.textContent = '著！（你覺著這題會難無：）';
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
    
    appendSentenceUI(feedback, question, audioPromise);
  } else {
    btnElement.classList.add('wrong');
    feedback.className = 'game-feedback wrong';
    
    // Highlight correct answer
    options.forEach(btn => {
      if (btn.textContent === question.targetWord.華語詞義) {
        btn.classList.add('correct');
      }
    });
    
    const msg = document.createElement('div');
    msg.textContent = `毋著。正確答案係：${question.targetWord.華語詞義}`;
    msg.style.marginBottom = '10px';
    feedback.appendChild(msg);
    
    appendSentenceUI(feedback, question);
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'game-btn game-next-btn';
    nextBtn.innerHTML = `下一題 <kbd class="kbd-shortcut" style="margin-right: 0; margin-left: 4px; padding: 1px 4px; font-size: 0.8em; opacity: 0.8">A</kbd>`;
    nextBtn.onclick = () => saveProgressAndNext('again');
    feedback.appendChild(nextBtn);
  }
}

async function saveProgressAndNext(lastResult) {
  const question = currentSession[currentQuestionIndex];
  const progressKey = question.targetWord.progressKey;
  const existingProgress = await getProgress(progressKey) || {};
  
  const todayEpochDay = Math.floor(Date.now() / 86400000);
  const newState = computeSM2(existingProgress, lastResult, todayEpochDay);
  
  await putProgress(progressKey, newState);

  currentQuestionIndex++;
  renderQuestion();
}

function playCurrentQuestionAudio() {
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

function appendSentenceUI(feedback, question, audioPromise = Promise.resolve()) {
  if (question.targetWord.例句 && question.targetWord.翻譯) {
    const sentenceDisplay = document.createElement('div');
    sentenceDisplay.className = 'game-sentence-display';
    
    const sentenceText = document.createElement('div');
    const formatText = (text) => text ? text.replace(/\n/g, '<br>') : '';
    const hakkaText = `<span class="sentence" style="font-size: 1.1em;">${formatText(question.targetWord.例句)}</span>`;
    
    const sentenceAudioBtn = document.createElement('button');
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

    sentenceText.innerHTML = `<strong>例句：</strong> ${hakkaText} `;
    sentenceText.appendChild(sentenceAudioBtn);
    sentenceText.insertAdjacentHTML('beforeend', `<br><strong>翻譯：</strong> ${formatText(question.targetWord.翻譯)}`);
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
      playCurrentSentenceAudio(sentenceAudioBtn);
    };
    
    feedback.appendChild(sentenceBtn);
    
    const autoOpen = document.getElementById('gameAutoOpenSentence')?.checked;
    if (autoOpen) {
      sentenceDisplay.style.display = 'block';
      sentenceBtn.style.display = 'none';
      audioPromise.then(() => {
        // Double check if this is still the current question
        const currentQ = currentSession[currentQuestionIndex];
        if (currentQ === question) {
          playCurrentSentenceAudio(sentenceAudioBtn);
        }
      });
    }
    feedback.appendChild(sentenceDisplay);
  }
}

function playCurrentSentenceAudio(btnEl) {
  const question = currentSession[currentQuestionIndex];
  if (!question) return;
  
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
    }
    
    audio.play().catch(e => {
      console.error("Sentence audio playback failed:", e);
      alert("無法播放例句音檔，可能是音檔不存在或網路問題。");
      if (btnEl) {
        btnEl.classList.remove('playing');
        btnEl.style.opacity = '1';
      }
    });
    
    audio.onended = () => {
      if (btnEl) {
        btnEl.classList.remove('playing');
        btnEl.style.opacity = '1';
      }
    };
  } else {
    alert("此詞彙目前沒有提供例句語音。");
  }
}

function endSession() {
  showGameView('result');
  document.getElementById('game-final-score').textContent = score;
}

// Hook into existing initializeAppUI or run when DOM is loaded
document.addEventListener('DOMContentLoaded', initGameUI);
