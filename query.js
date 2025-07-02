document.addEventListener('DOMContentLoaded', function () {
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');
    const resultsContainer = document.getElementById('results');
    const resultsSummaryContainer = document.getElementById('results-summary');

    // All data variables from the included JS files
    const allData = {
        '四縣': [四基, 四初, 四中, 四中高, 四高],
        '海陸': [海基, 海初, 海中, 海中高, 海高],
        '大埔': [大基, 大初, 大中, 大中高, 大高],
        '饒平': [平基, 平初, 平中, 平中高, 平高],
        '詔安': [安基, 安初, 安中, 安中高, 安高]
    };

    function csvToArray(str) {
        const rows = str.split('\n');
        if (rows.length < 2) return [];
        const headers = rows[0].replace(/(四縣|海陸|大埔|饒平|詔安)/g, '').split(',');
        const data = [];

        for (let i = 1; i < rows.length; i++) {
            if (!rows[i]) continue;
            const values = rows[i].split(',');
            const obj = {};
            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = values[j];
            }
            data.push(obj);
        }
        return data;
    }

    function performSearch() {
        const selectedDialect = document.querySelector('input[name="dialect"]:checked').value;
        const searchMode = document.querySelector('input[name="search-mode"]:checked').value;
        const keyword = searchInput.value.trim();

        if (!keyword) {
            resultsSummaryContainer.textContent = '';
            resultsContainer.innerHTML = '<p style="text-align: center;">請輸入關鍵字</p>';
            return;
        }

        const dialectData = allData[selectedDialect];
        let combinedData = [];
        dialectData.forEach(level => {
            if (level && level.content) {
                const levelData = csvToArray(level.content);
                levelData.forEach(item => {
                    item.sourceName = level.name; // e.g., '四基'
                });
                combinedData = combinedData.concat(levelData);
            }
        });

        const results = combinedData.filter(item => {
            if (item && item[searchMode]) {
                return item[searchMode].toLowerCase().includes(keyword.toLowerCase());
            }
            return false;
        });

        displayResults(results, keyword, searchMode);
    }

    function getFullLevelName(name) {
        let 腔名 = '';
        let 級名 = '';
        const 腔 = name.substring(0, 1);
        const 級 = name.substring(1);

        switch (腔) {
            case '四': 腔名 = '四縣'; break;
            case '海': 腔名 = '海陸'; break;
            case '大': 腔名 = '大埔'; break;
            case '平': 腔名 = '饒平'; break;
            case '安': 腔名 = '詔安'; break;
        }
        switch (級) {
            case '基': 級名 = '基礎級'; break;
            case '初': 級名 = '初級'; break;
            case '中': 級名 = '中級'; break;
            case '中高': 級名 = '中高級'; break;
            case '高': 級名 = '高級'; break;
        }
        return 腔名 + 級名;
    }

    function displayResults(results, keyword, searchMode) {
        resultsContainer.innerHTML = '';

        if (results.length === 0) {
            resultsSummaryContainer.textContent = '尋無結果';
            return;
        }

        resultsSummaryContainer.textContent = `尋到 ${results.length} 筆結果`;

        const table = document.createElement('table');
        table.setAttribute('width', '100%');

        const highlightRegex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');

        results.forEach(line => {
            if (!line || !line.編號) return;

            // --- Start of logic copied/adapted from main.js ---
            const sourceName = line.sourceName;
            let 腔 = sourceName.substring(0, 1);
            let 級 = sourceName.substring(1);

            let selected例外音檔;
            switch (級) {
                case '基': selected例外音檔 = typeof 基例外音檔 !== 'undefined' ? 基例外音檔 : []; break;
                case '初': selected例外音檔 = typeof 初例外音檔 !== 'undefined' ? 初例外音檔 : []; break;
                case '中': selected例外音檔 = typeof 中例外音檔 !== 'undefined' ? 中例外音檔 : []; break;
                case '中高': selected例外音檔 = typeof 中高例外音檔 !== 'undefined' ? 中高例外音檔 : []; break;
                case '高': selected例外音檔 = typeof 高例外音檔 !== 'undefined' ? 高例外音檔 : []; break;
                default: selected例外音檔 = [];
            }
            const 例外音檔 = selected例外音檔;

            const generalMediaYr = '112';
            var 目錄級, 目錄另級, 檔腔, 檔級 = '';

            switch (腔) {
                case '四': 檔腔 = 'si'; break;
                case '海': 檔腔 = 'ha'; break;
                case '大': 檔腔 = 'da'; break;
                case '平': 檔腔 = 'rh'; break;
                case '安': 檔腔 = 'zh'; break;
            }
            switch (級) {
                case '基': 目錄級 = '5'; 目錄另級 = '1'; break;
                case '初': 目錄級 = '1'; break;
                case '中': 目錄級 = '2'; 檔級 = '1'; break;
                case '中高': 目錄級 = '3'; 檔級 = '2'; break;
                case '高': 目錄級 = '4'; 檔級 = '3'; break;
            }
            const fullLvlName = getFullLevelName(sourceName);
            const category = line.分類; // Assuming '分類' exists in the data

            const missingAudioInfo = typeof getMissingAudioInfo === 'function' ?
                getMissingAudioInfo(fullLvlName, category, line.編號) : null;

            let mediaYr = generalMediaYr;
            let pre112Insertion詞 = '';
            let pre112Insertion句 = '';
            let 詞目錄級 = 目錄級;
            let 句目錄級 = 目錄級;
            let mediaNo = '';

            var no = line.編號.split('-');
            if (no[0] <= 9) no[0] = '0' + no[0];
            if (級 === '初') no[0] = '0' + no[0];
            if (no[1] <= 9) no[1] = '0' + no[1];
            if (no[1] <= 99) no[1] = '0' + no[1];
            mediaNo = no[1];

            const index = 例外音檔.findIndex(([編號]) => 編號 === line.編號);
            if (index !== -1) {
                const matchedElement = 例外音檔[index];
                mediaYr = matchedElement[1];
                mediaNo = matchedElement[2];
                pre112Insertion詞 = 'w/';
                pre112Insertion句 = 's/';
                if (目錄另級 !== undefined) {
                    詞目錄級 = 目錄另級;
                    句目錄級 = 目錄另級;
                }
            }

            const 詞目錄 = `${詞目錄級}/${檔腔}/${pre112Insertion詞}${檔級}${檔腔}`;
            const 句目錄 = `${句目錄級}/${檔腔}/${pre112Insertion句}${檔級}${檔腔}`;
            // --- End of logic copied/adapted from main.js ---

            var item = document.createElement('tr');
            item.dataset.source = fullLvlName; // Add source for context

            // TD1: 編號 & Source
            const td1 = document.createElement('td');
            td1.className = 'no';
            td1.dataset.label = '編號';
            const noText = document.createTextNode(line.編號 + '\u00A0');
            td1.appendChild(noText);
            const sourceSpan = document.createElement('span');
            sourceSpan.className = 'source-tag';
            sourceSpan.textContent = `(${fullLvlName})`;
            sourceSpan.style.fontSize = '0.8em';
            sourceSpan.style.color = '#666';
            td1.appendChild(document.createElement('br'));
            td1.appendChild(sourceSpan);
            item.appendChild(td1);

            // TD2: 詞彙、標音、音檔、意義、備註
            const td2 = document.createElement('td');
            td2.dataset.label = '詞彙';
            const ruby = document.createElement('ruby');
            ruby.innerHTML = searchMode === '客家語' ? line.客家語.replace(highlightRegex, '<mark>$1</mark>') : line.客家語;
            const rt = document.createElement('rt');
            rt.textContent = line.客語標音;
            ruby.appendChild(rt);
            td2.appendChild(ruby);
            td2.appendChild(document.createElement('br'));

            // Word Audio
            let wordAudioActuallyMissing = missingAudioInfo && missingAudioInfo.word === false;
            if (!wordAudioActuallyMissing) {
                const audio1 = document.createElement('audio');
                audio1.className = 'media';
                audio1.controls = true;
                audio1.preload = 'none';
                let wordAudioSrc = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no[0]}-${mediaNo}.mp3`;
                if (fullLvlName === '海陸中高級' && line.編號 === '4-261') {
                    wordAudioSrc = 'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3';
                }
                audio1.src = wordAudioSrc;
                td2.appendChild(audio1);
            }

            td2.appendChild(document.createElement('br'));
            const meaningText = document.createElement('span');
            meaningText.innerHTML = searchMode === '華語詞義' ? line.華語詞義.replace(/"/g, '').replace(highlightRegex, '<mark>$1</mark>') : line.華語詞義.replace(/"/g, '');
            td2.appendChild(meaningText);
            if (line.備註 && line.備註.trim() !== '') {
                const notesP = document.createElement('p');
                notesP.className = 'notes';
                notesP.textContent = `（${line.備註}）`;
                td2.appendChild(notesP);
            }
            item.appendChild(td2);

            // TD3: 例句、音檔、翻譯
            const td3 = document.createElement('td');
            td3.dataset.label = '例句';
            const hasExampleSentenceText = line.例句 && line.例句.trim() !== '';
            if (hasExampleSentenceText) {
                const sentenceSpan = document.createElement('span');
                sentenceSpan.className = 'sentence';
                sentenceSpan.innerHTML = (searchMode === '例句' ? line.例句.replace(highlightRegex, '<mark>$1</mark>') : line.例句).replace(/"/g, '').replace(/\n/g, '<br>');
                td3.appendChild(sentenceSpan);
                td3.appendChild(document.createElement('br'));

                // Sentence Audio
                let sentenceAudioActuallyMissing = (missingAudioInfo && missingAudioInfo.sentence === false) || 級 === '高';
                if (!sentenceAudioActuallyMissing) {
                    const audio2 = document.createElement('audio');
                    audio2.className = 'media';
                    audio2.controls = true;
                    audio2.preload = 'none';
                    audio2.src = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${句目錄}-${no[0]}-${mediaNo}s.mp3`;
                    td3.appendChild(audio2);
                }

                td3.appendChild(document.createElement('br'));
                const translationText = document.createElement('span');
                translationText.innerHTML = (searchMode === '翻譯' ? line.翻譯.replace(highlightRegex, '<mark>$1</mark>') : line.翻譯).replace(/"/g, '').replace(/\n/g, '<br>');
                td3.appendChild(translationText);
            }
            item.appendChild(td3);

            table.appendChild(item);
        });

        resultsContainer.appendChild(table);

        // Apply sandhi transformations if needed
        if (document.querySelector('input[name="dialect"]:checked').value === '大埔') {
            if (typeof 大埔高降異化 === 'function') 大埔高降異化();
            if (typeof 大埔中遇低升 === 'function') 大埔中遇低升();
            if (typeof 大埔低升異化 === 'function') 大埔低升異化();
        }
    }

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
});