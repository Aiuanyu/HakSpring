/*
說明：
此檔案用來記錄已知缺失的音檔資訊。
資料結構如下：
missingAudioData = {
  "表格名稱 (腔調級別全名)": {
    "類別名稱": {
      "詞彙編號": {
        word: true (有詞彙音檔) / false (無詞彙音檔),
        sentence: true (有例句音檔) / false (無例句音檔) / 'na' (不適用，例如高級本來就無例句音檔),
        note: "備註說明文字"
      }
    }
  }
};
*/

/*
20261103 115 年度認證詞彙音檔實測：
下背 112 年度已知缺失个音檔（含海陸中高級 4-261 詞彙摎句仔音檔、詔安中級 17-119、詔安初級 18-92、海陸／大埔／詔安高級等 15 筆），
在上游 115 年度音檔目錄下已經 100% 補齊（HTTP 200 OK），故將現役 missingAudioData 清空，舊紀錄轉做註解留存備查。
*/
const missingAudioData = {
/*
  "海陸中高級": {
    "外在活動與動作": {
      "4-261": { word: true, sentence: false, note: "有詞彙音檔，無句仔音檔" }
    }
  },
  "詔安中級": {
    "職業與經濟": {
      "17-119": { word: true, sentence: false, note: "有詞彙音檔，無句仔音檔" }
    }
  },
  "詔安初級": {
    "時空與情狀副詞": {
      "18-92": { word: false, sentence: false, note: "詞彙、句仔音檔都無" }
    }
  },
  "海陸高級": { // 高級本來就 sentence: 'na' (不適用)
    "人體與醫療": {
      "1-101": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    },
    "職業與經濟": {
      "16-36": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    }
  },
  "大埔高級": { // 高級本來就 sentence: 'na' (不適用)
    // "人體與醫療": { "1-205": { word: true, sentence: 'na', note: "110 有 - 此筆正常，僅供參考註記" } },
    "心理活動與感覺": {
      "2-100": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" },
      "2-194": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    },
    "外在活動與動作": {
      "3-32": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    },
    "自然與景觀": {
      "5-103": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    },
    "社會關係與行為": {
      "10-217": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" },
      "10-543": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    },
    "藝文與教育": {
      "17-2": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    }
  },
  "詔安高級": { // 高級本來就 sentence: 'na' (不適用)
    "人體與醫療": {
      "1-112": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    },
    "外在活動與動作": {
      "3-28": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    },
    "居家生活": {
      "7-130": { word: false, sentence: 'na', note: "高級無句仔音檔，詞彙音檔乜無" }
    }
  }
*/
};

/**
 * 檢查指定詞彙是否有音檔缺失情況。
 * @param {string} tableName - 表格名稱 (例如 "海陸中高級")
 * @param {string} categoryName - 類別名稱 (例如 "外在活動與動作")
 * @param {string} itemId - 詞彙編號 (例如 "4-261")
 * @returns {object|null} 包含音檔狀態的物件 { word: boolean, sentence: boolean|'na', note: string }，或在無特定資訊時返回 null。
 */
function getMissingAudioInfo(tableName, categoryName, itemId) {
  if (typeof missingAudioData !== 'undefined' &&
      missingAudioData[tableName] &&
      missingAudioData[tableName][categoryName] &&
      missingAudioData[tableName][categoryName][itemId]) {
    return missingAudioData[tableName][categoryName][itemId];
  }
  return null;
}