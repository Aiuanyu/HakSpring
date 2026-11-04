// tests/manual_sync_test.js
// 測試手動同步（匯出/匯入/URL 壓縮/合併）與雲端推拉核心完全一致
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Mock localStorage
const store = {};
global.localStorage = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, val) => { store[key] = String(val); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};

global.window = {
  pfsConverter: {
    normalizeDisplayScript: (v) => (v === 'pfs' ? 'pfs' : v === 'gip' ? 'gip' : 'hpp'),
  },
  updateProgressDropdown: () => {},
  applyHakfaDisplayScript: () => {},
  applyMeinungFillSetting: () => {},
  dispatchEvent: () => {},
  location: { origin: 'http://localhost:8000', pathname: '/', search: '', hash: '' }
};

global.document = {
  getElementById: () => null,
  addEventListener: () => {},
  visibilityState: 'visible'
};

const cloudSync = require('../js/cloud-sync.js');

test('exportCurrentSyncData: 完整打包所有七大同步欄位', () => {
  localStorage.clear();
  localStorage.setItem('hakkaBookmarks', JSON.stringify([
    { rowId: 5, cat: '1', tableName: '四縣基礎級', timestamp: 1000, filter: 'all' }
  ]));
  localStorage.setItem('showMeinungFill', 'true');
  localStorage.setItem('hakfaDisplayScript', 'pfs');
  localStorage.setItem('hakkaLearningProgress', JSON.stringify({
    'c四基1-1|m': [1, 21, 1000, 2.5]
  }));
  localStorage.setItem('hakkaDailyStats', JSON.stringify({ '2026-11-05': 10 }));
  localStorage.setItem('hakkaDailyFavs', JSON.stringify({ items: ['115四基-1-1'], tomb: {} }));
  localStorage.setItem('hakkaFamiliarity', JSON.stringify({ '1-1': 1 }));

  const exported = cloudSync.exportCurrentSyncData();
  assert.equal(exported.version, 1);
  assert.equal(exported.bookmarks.length, 1);
  assert.equal(exported.preferences.showMeinungFill, true);
  assert.equal(exported.preferences.hakfaDisplayScript, 'pfs');
  assert.equal(exported.learning_progress['c四基1-1|m'][0], 1);
  assert.equal(exported.daily_stats['2026-11-05'], 10);
  assert.equal(exported.daily_favs.items[0], '115四基-1-1');
  assert.equal(exported.familiarity['1-1'], 1);
});

test('compressSyncDataToUrl / decompressSyncDataFromUrl: 往返壓縮解壓 100% 精準', async () => {
  const sample = {
    version: 1,
    exportedAt: '2026-11-05T05:00:00.000Z',
    bookmarks: [{ rowId: 10, cat: '2', tableName: '海陸初級', timestamp: 2000, filter: 'all' }],
    preferences: { romanizerJoiningMode: 'hyphen', hakfaDisplayScript: 'hpp', showMeinungFill: false },
    learning_progress: { 'c海初2-1|m': [2, 7, 2000, 2.3] },
    daily_stats: { '2026-11-05': 5 },
    daily_stats_by_level: { '海初': { due: 1, overdue: 0, total: 10 } },
    daily_favs: { items: ['115海初-2-1'], tomb: {} },
    familiarity: { '2-1': 2 }
  };

  const encodedUrl = await cloudSync.compressSyncDataToUrl(sample);
  assert.ok(encodedUrl.length > 0);
  assert.ok(!/[+=/]/.test(encodedUrl), '必須為 URL-safe 字串，無 +, =, /');

  const restored = await cloudSync.decompressSyncDataFromUrl(encodedUrl);
  assert.deepEqual(restored, sample);
});

test('applyIncomingSyncData: 手動匯入與雲端拉取之智慧合併完全一致', async () => {
  localStorage.clear();
  // 本地舊資料
  localStorage.setItem('hakkaBookmarks', JSON.stringify([
    { rowId: 1, cat: '1', tableName: '四縣基礎級', timestamp: 500, filter: 'all' }
  ]));
  localStorage.setItem('hakkaDailyStats', JSON.stringify({ '2026-11-05': 2 }));
  localStorage.setItem('hakkaDailyFavs', JSON.stringify({ items: ['115四基-1-1'], tomb: {} }));
  localStorage.setItem('hakkaFamiliarity', JSON.stringify({ '1-1': 1 }));

  // 傳入的較新資料
  const incoming = {
    bookmarks: [
      { rowId: 15, cat: '1', tableName: '四縣基礎級', timestamp: 1500, filter: 'all' },
      { rowId: 8, cat: '2', tableName: '海陸初級', timestamp: 1200, filter: 'all' }
    ],
    preferences: { showMeinungFill: true },
    learning_progress: { 'c四基1-1|m': [1, 21, 1500, 2.5] },
    daily_stats: { '2026-11-05': 8 },
    daily_stats_by_level: {},
    daily_favs: { items: ['115四基-1-1', '115海初-2-1'], tomb: {} },
    familiarity: { '1-1': 1, '2-1': 2 }
  };

  await cloudSync.applyIncomingSyncData(incoming, true);

  const mergedBookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks'));
  assert.equal(mergedBookmarks.length, 2);
  const siBookmark = mergedBookmarks.find(b => b.tableName === '四縣基礎級');
  assert.equal(siBookmark.rowId, 15, '較新 timestamp 的書籤應覆蓋舊書籤');

  const mergedFavs = JSON.parse(localStorage.getItem('hakkaDailyFavs'));
  assert.equal(Object.keys(mergedFavs.items).length, 2);

  const mergedFamiliarity = JSON.parse(localStorage.getItem('hakkaFamiliarity'));
  assert.equal(mergedFamiliarity['2-1'], 2);

  const showMeinung = localStorage.getItem('showMeinungFill');
  assert.equal(showMeinung, 'true');
});
