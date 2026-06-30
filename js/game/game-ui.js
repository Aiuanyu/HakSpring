// js/game/game-ui.js
// Handles UI logic for the SRS game PoC

let currentSession = [];
let currentQuestionIndex = 0;
let score = 0;
let gameActiveDialect = '';
let gameActiveDataVarName = '';

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
}

async function startSession() {
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  
  loadingText.textContent = '準備題目中...';
  loadingIndicator.style.display = 'flex';

  try {
    currentSession = await generateGameSession(gameActiveDialect, gameActiveDataVarName);
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
  if (currentQuestionIndex >= currentSession.length) {
    endSession();
    return;
  }

  const question = currentSession[currentQuestionIndex];
  
  document.getElementById('game-question-counter').textContent = `題 ${currentQuestionIndex + 1} / ${currentSession.length}`;
  
  const newBadge = document.getElementById('game-new-badge');
  newBadge.style.display = question.isNew ? 'inline-block' : 'none';

  document.getElementById('game-target-word').textContent = question.targetWord.客家語;
  document.getElementById('game-target-pinyin').textContent = question.targetWord.標音;
  
  // Audio button hidden until they answer correctly
  document.getElementById('game-play-audio-btn').style.display = 'none';

  const optionsContainer = document.getElementById('game-options-container');
  optionsContainer.innerHTML = '';
  
  document.getElementById('game-feedback').style.display = 'none';
  
  question.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'game-option-btn';
    btn.textContent = opt;
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
    playCurrentQuestionAudio();
    
    const msg = document.createElement('div');
    msg.textContent = '正確！請評估難易度：';
    msg.style.marginBottom = '10px';
    feedback.appendChild(msg);
    
    const createEvalBtn = (text, color, result) => {
      const b = document.createElement('button');
      b.className = 'game-btn';
      b.style.backgroundColor = color;
      b.style.marginRight = '10px';
      b.textContent = text;
      b.onclick = () => saveProgressAndNext(result);
      return b;
    };
    
    feedback.appendChild(createEvalBtn('重來', '#6c757d', 'again'));
    feedback.appendChild(createEvalBtn('普通', '#28a745', 'good'));
    feedback.appendChild(createEvalBtn('簡單', '#007bff', 'easy'));
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
    msg.textContent = `錯誤。正確答案是：${question.targetWord.華語詞義}`;
    msg.style.marginBottom = '10px';
    feedback.appendChild(msg);
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'game-btn';
    nextBtn.textContent = '下一題';
    nextBtn.onclick = () => saveProgressAndNext('again');
    feedback.appendChild(nextBtn);
  }
}

async function saveProgressAndNext(lastResult) {
  const question = currentSession[currentQuestionIndex];
  const progressKey = question.targetWord.progressKey;
  const existingProgress = await getProgress(progressKey) || {};
  
  await putProgress(progressKey, {
    ...existingProgress,
    seen: true,
    lastResult: lastResult,
    updatedAt: Date.now()
  });

  currentQuestionIndex++;
  renderQuestion();
}

function playCurrentQuestionAudio() {
  const question = currentSession[currentQuestionIndex];
  if (!question) return;
  
  const targetWord = question.targetWord;
  // Use existing constructAudioUrlForPopup logic from main.js
  const dialectInfo = {
    sourceType: 'cert', // Assumed cert since PoC focuses on cert levels
    dataVarName: targetWord.dataVarName
  };
  
  const audioUrl = constructAudioUrlForPopup(targetWord, dialectInfo);
  
  if (audioUrl) {
    const finalUrl = applyAudioProxy(audioUrl);
    const audio = new Audio(finalUrl);
    audio.play().catch(e => console.error("Audio playback failed:", e));
    
    const audioBtn = document.getElementById('game-play-audio-btn');
    audioBtn.style.display = 'inline-block';
    
    // Animate button
    audioBtn.classList.add('playing');
    audio.onended = () => audioBtn.classList.remove('playing');
  }
}

function endSession() {
  showGameView('result');
  document.getElementById('game-final-score').textContent = score;
}

// Hook into existing initializeAppUI or run when DOM is loaded
document.addEventListener('DOMContentLoaded', initGameUI);
