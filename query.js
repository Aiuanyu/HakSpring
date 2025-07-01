document.addEventListener('DOMContentLoaded', function () {
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');

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
        const headers = rows[0].replace(/(四縣|海陸|大埔|饒平|詔安)/g, '').split(',');
        const data = [];

        for (let i = 1; i < rows.length; i++) {
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
            document.getElementById('results').innerHTML = '<p>請輸入關鍵字</p>';
            return;
        }

        const dialectData = allData[selectedDialect];
        let combinedData = [];
        dialectData.forEach(level => {
            const levelData = csvToArray(level.content);
            combinedData = combinedData.concat(levelData);
        });

        const results = combinedData.filter(item => {
            if (item[searchMode]) {
                return item[searchMode].includes(keyword);
            }
            return false;
        });

        displayResults(results);
    }

    function displayResults(results) {
        const resultsContainer = document.getElementById('results');
        const resultsSummaryContainer = document.getElementById('results-summary');
        resultsContainer.innerHTML = '';

        if (results.length === 0) {
            resultsSummaryContainer.textContent = '尋無結果';
            return;
        }

        resultsSummaryContainer.textContent = `尋到 ${results.length} 筆結果`;

        const table = document.createElement('table');
        table.setAttribute('width', '100%');

        results.forEach(line => {
            var item = document.createElement('tr');

            // TD1: 編號
            const td1 = document.createElement('td');
            td1.className = 'no';
            td1.dataset.label = '編號';
            const noText = document.createTextNode(line.編號 + '\u00A0');
            td1.appendChild(noText);
            item.appendChild(td1);

            // TD2: 詞彙、標音、意義、備註
            const td2 = document.createElement('td');
            td2.dataset.label = '詞彙';
            const ruby = document.createElement('ruby');
            ruby.textContent = line.客家語;
            const rt = document.createElement('rt');
            rt.textContent = line.客語標音;
            ruby.appendChild(rt);
            td2.appendChild(ruby);
            td2.appendChild(document.createElement('br'));

            const meaningText = document.createTextNode(line.華語詞義.replace(/"/g, ''));
            td2.appendChild(meaningText);
            if (line.備註 && line.備註.trim() !== '') {
                const notesP = document.createElement('p');
                notesP.className = 'notes';
                notesP.textContent = `（${line.備註}）`;
                td2.appendChild(notesP);
            }
            item.appendChild(td2);

            // TD3: 例句、翻譯
            const td3 = document.createElement('td');
            td3.dataset.label = '例句';

            const hasExampleSentenceText = line.例句 && line.例句.trim() !== '';

            if (hasExampleSentenceText) {
                const sentenceSpan = document.createElement('span');
                sentenceSpan.className = 'sentence';
                sentenceSpan.innerHTML = line.例句.replace(/"/g, '').replace(/\n/g, '<br>');
                td3.appendChild(sentenceSpan);
                td3.appendChild(document.createElement('br'));

                const translationText = document.createElement('span');
                translationText.innerHTML = line.翻譯.replace(/"/g, '').replace(/\n/g, '<br>');
                td3.appendChild(translationText);
            }
            item.appendChild(td3);

            table.appendChild(item);
        });

        resultsContainer.appendChild(table);
    }

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
});