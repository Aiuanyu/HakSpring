
const { chromium } = require('playwright');
const http = require('http');
const handler = require('serve-handler');
const path = require('path');

const PORT = 8000;
const server = http.createServer((request, response) => {
  return handler(request, response, {
    public: './'
  });
});

(async () => {
  server.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Desktop test
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#main-content', { state: 'visible' });

    // Close modals if they appear
    if (await page.isVisible('#whatsNewModal')) {
      await page.click('#whatsNewModalCloseBtn');
    }
    if (await page.isVisible('#infoModal')) {
      await page.click('#infoModalCloseBtn');
    }

    await page.click('span[data-varname="四基"] a');
    await page.click('input[name="category"][value="人體與醫療"]');
    await page.waitForSelector('#category-table');
    await page.screenshot({ path: 'desktop_view.png' });

    // Mobile test
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    await page.reload();
    await page.waitForSelector('#main-content', { state: 'visible' });
        // Close modals if they appear
    if (await page.isVisible('#whatsNewModal')) {
      await page.click('#whatsNewModalCloseBtn');
    }
    if (await page.isVisible('#infoModal')) {
      await page.click('#infoModalCloseBtn');
    }
    await page.click('span[data-varname="四基"] a');
    await page.click('input[name="category"][value="人體與醫療"]');
    await page.waitForSelector('#category-table');
    await page.screenshot({ path: 'mobile_view.png' });

    console.log('Screenshots saved: desktop_view.png, mobile_view.png');

    await browser.close();
    server.close();
  });
})();
