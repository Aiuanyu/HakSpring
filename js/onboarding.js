/**
 * 客源翠 HakSpring Onboarding 導覽腳本
 * 使用 Driver.js (https://driverjs.com/)
 */

function initHakSpringOnboarding() {
  const driver = window.driver.js.driver;
  
  // 偵測是否已登入
  const userBtn = document.getElementById('cloudSyncUserBtn');
  const isLoggedIn = userBtn && window.getComputedStyle(userBtn).display !== 'none';
  
  const syncStep = isLoggedIn ? {
    element: '#cloudSyncUserBtn',
    popover: {
      title: '登入同步進度',
      description: '忒好吔！你既經有登入帳號，做得同步進度。請繼續。',
      side: "bottom",
      align: 'start'
    }
  } : {
    element: '#cloudSyncBtn',
    popover: {
      title: '登入同步進度',
      description: '先登入帳號，你的遊戲進度與書籤就會自動備份並跨裝置同步到雲端！',
      side: "bottom",
      align: 'start'
    }
  };

  const steps = [
    {
      element: '#infoButton',
      popover: {
        title: '資訊與設定',
        description: '點擊此處打開資訊面板，你可以找到關於設定與帳號的功能。',
        side: "bottom",
        align: 'end'
      },
      onNextClick: () => {
        const infoBtn = document.getElementById('infoButton');
        if (infoBtn) {
          infoBtn.click();
        }
        setTimeout(() => {
          onboardingDriver.moveNext();
        }, 300);
      }
    },
    {
      ...syncStep,
      onNextClick: () => {
        onboardingDriver.moveNext();
      }
    },
    {
      element: '#infoModalCloseBtn',
      popover: {
        title: '關閉資訊面板',
        description: '點擊這裡關閉資訊面板，我們接著去看看遊戲功能！',
        side: "bottom",
        align: 'end'
      },
      onNextClick: () => {
        const infoModalCloseBtn = document.getElementById('infoModalCloseBtn');
        if (infoModalCloseBtn) {
          infoModalCloseBtn.click();
        }
        // Fallback in case click fails
        const infoModal = document.getElementById('infoModal');
        if (infoModal && infoModal.classList.contains('is-visible')) {
          infoModal.classList.remove('is-visible');
        }
        setTimeout(() => {
          onboardingDriver.moveNext();
        }, 300);
      }
    },
    {
      element: '#floatingStartGameBtn',
      popover: {
        title: '進入遊戲',
        description: '點擊右側這個搖桿按鈕，隨時隨地進入客語挑戰！',
        side: "left",
        align: 'center'
      },
      onNextClick: () => {
        // 在前往下一步前，程式化打開遊戲 Modal
        const startBtn = document.getElementById('floatingStartGameBtn');
        if (startBtn) {
          startBtn.click();
        }
        // 等待 Modal 動畫完成
        setTimeout(() => {
          onboardingDriver.moveNext();
        }, 300);
      }
    },
    {
      element: '#game-options-area',
      popover: {
        title: '選項設定',
        description: '在這裡選擇你想挑戰的腔調與級別，還能自訂「複習優先」或「固定依序」等學習模式。',
        side: "top",
        align: 'center'
      }
    },
    {
      element: '#gameStartSessionBtn',
      popover: {
        title: '玩的過程',
        description: '準備好就點擊開始！每局 10 題選擇題，系統會根據你的答對次數自動安排間隔複習（SRS 機制）。祝你學習愉快！',
        side: "top",
        align: 'center'
      }
    }
  ];

  const onboardingDriver = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    doneBtnText: '完成',
    closeBtnText: '關閉',
    nextBtnText: '下一步 &rarr;',
    prevBtnText: '&larr; 上一步',
    steps: steps
  });

  onboardingDriver.drive();
}

// 暴露全域函數供外部呼叫
window.startHakSpringOnboarding = initHakSpringOnboarding;
window.resetHakSpringOnboardingTest = () => {
  localStorage.removeItem('whatsNewVersion');
  localStorage.removeItem('seenOnboarding20260705');
  console.log('✅ 已清除 whatsNewVersion 與 seenOnboarding20260705');
  alert('已重設導覽狀態！請重新整理網頁即可模擬一般使用者首次看到的流程。');
};
