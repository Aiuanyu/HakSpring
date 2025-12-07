// js/userData.js

// --- 全域變數 ---
let firebaseUser = null;
let userRef = null;
let localUserDataCache = {}; // 本地快取
let isFirebaseDataLoaded = false;
let firebaseDataLoadedPromise = null;

// --- Firebase 初始化同使用者驗證 ---

async function initFirebase() {
  firebaseDataLoadedPromise = new Promise((resolve, reject) => {
    if (!firebase || !firebase.auth || !firebase.database) {
      console.warn("Firebase SDK 尚未載入，資料同步功能將無法使用。");
      isFirebaseDataLoaded = true;
      resolve();
      return;
    }

    const unsubscribe = firebase.auth().onAuthStateChanged(async (user) => {
      unsubscribe(); // 確保只執行一次
      if (user) {
        firebaseUser = user;
        console.log("Firebase 使用者已驗證 (匿名)，UID:", firebaseUser.uid);
        userRef = firebase.database().ref('users/' + firebaseUser.uid);
        await loadDataFromFirebase();
        resolve();
      } else {
        console.log("使用者尚未登入，嘗試匿名登入...");
        try {
          await firebase.auth().signInAnonymously();
          // 登入成功後，onAuthStateChanged 會再次被觸發，並由上面个 if (user) 區塊處理
        } catch (error) {
          console.error("Firebase 匿名登入失敗:", error);
          isFirebaseDataLoaded = true;
          reject(error);
        }
      }
    });
  });
  return firebaseDataLoadedPromise;
}

/**
 * 從 Firebase 載入使用者所有資料到本地快取，並處理舊資料徙竇。
 * @returns {Promise<void>}
 */
async function loadDataFromFirebase() {
  return new Promise(resolve => {
    if (!userRef) {
      isFirebaseDataLoaded = true;
      return resolve();
    }
    userRef.once('value', async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        localUserDataCache = data;
        console.log("已從 Firebase 載入使用者資料到快取:", localUserDataCache);
      } else {
        console.log("Firebase 肚尚無使用者資料，檢查係無係有舊資料愛徙竇...");
        await migrateLocalStorageToFirebase();
      }
      isFirebaseDataLoaded = true;
      resolve();
    }, (error) => {
      console.error("從 Firebase 讀取資料失敗:", error);
      isFirebaseDataLoaded = true;
      resolve();
    });
  });
}

/**
 * 將 localStorage 內个舊資料搬上 Firebase。
 * @returns {Promise<void>}
 */
async function migrateLocalStorageToFirebase() {
  const keysToMigrate = ['hakkaBookmarks', 'dontShowInfoModalAgain', 'lastSearchMode', 'lastSearchDialect', 'whatsNewVersion', 'romanizerJoiningMode'];
  let dataToMigrate = {};
  let hasDataToMigrate = false;

  keysToMigrate.forEach(key => {
    const localValueRaw = localStorage.getItem(key);
    if (localValueRaw !== null) {
      try {
        dataToMigrate[key] = JSON.parse(localValueRaw);
      } catch (e) {
        dataToMigrate[key] = localValueRaw;
      }
      hasDataToMigrate = true;
    }
  });

  if (hasDataToMigrate) {
    console.log("尋著 localStorage 舊資料，當在該搬上 Firebase...", dataToMigrate);
    if (userRef) {
      await userRef.set(dataToMigrate);
      localUserDataCache = dataToMigrate; // 更新本地快取
      console.log("舊資料徙竇成功！");
      // 徙竇成功後，清理舊資料
      keysToMigrate.forEach(key => {
        localStorage.removeItem(key);
      });
      console.log("已清理 localStorage 舊資料。");
    }
  } else {
    console.log("無尋著任何愛徙竇个舊資料。");
  }
}

// --- 核心資料管理 ---

function getUserData(key, defaultValue = null) {
  if (localUserDataCache.hasOwnProperty(key)) {
    return localUserDataCache[key];
  }
  // 在 Firebase 資料載入前，或徙竇過程中，回退到 localStorage
  if (!isFirebaseDataLoaded) {
      const localValue = localStorage.getItem(key);
      if (localValue !== null) {
          try {
              return JSON.parse(localValue);
          } catch(e) {
              return localValue;
          }
      }
  }
  return defaultValue;
}

function setUserData(key, value) {
  localUserDataCache[key] = value;
  if (userRef) {
    userRef.child(key).set(value).catch(error => {
      console.error(`同步資料到 Firebase 失敗 (key: ${key}):`, error);
    });
  }
}

// --- 書籤 (Bookmarks) 相關功能 ---

function getBookmarks() {
  return getUserData('hakkaBookmarks', []);
}

function saveBookmark(rowId, percentage, category, tableName) {
  let bookmarks = getBookmarks();
  const newBookmark = {
    rowId: rowId,
    percentage: percentage,
    cat: category,
    tableName: tableName,
    timestamp: Date.now(),
  };

  const existingIndex = bookmarks.findIndex(
    (bm) => bm.tableName === newBookmark.tableName && bm.cat === newBookmark.cat
  );
  if (existingIndex > -1) {
    bookmarks.splice(existingIndex, 1);
  }
  bookmarks.unshift(newBookmark);

  if (bookmarks.length > 10) {
    let indexToDelete = -1;
    for (let i = bookmarks.length - 1; i >= 1; i--) {
      if (
        bookmarks[i].tableName === newBookmark.tableName &&
        bookmarks[i].cat !== newBookmark.cat
      ) {
        indexToDelete = i;
        break;
      }
    }
    if (indexToDelete > -1) {
      bookmarks.splice(indexToDelete, 1);
    } else {
      bookmarks.pop();
    }
  }

  setUserData('hakkaBookmarks', bookmarks);
}

function removeBookmarkForCompletedCategory(tableName, category) {
    let bookmarks = getBookmarks();
    const indexToRemove = bookmarks.findIndex(
        (bm) => bm.tableName === tableName && bm.cat === category
    );

    if (indexToRemove > -1) {
        console.log(`移除已完成類別个書籤: ${tableName} - ${category}`);
        bookmarks.splice(indexToRemove, 1);
        setUserData('hakkaBookmarks', bookmarks);
    }
}
