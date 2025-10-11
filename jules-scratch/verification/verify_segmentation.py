import asyncio
import subprocess
import time
from playwright.async_api import async_playwright, expect

async def main():
    # 啟動一個簡單的 HTTP 伺服器
    server_process = subprocess.Popen(
        ['python3', '-m', 'http.server'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(1) # 等待伺服器啟動

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            # 1. 導航到頁面
            await page.goto('http://localhost:8000/index.html', timeout=60000)

            # 2. 等待 App 初始化完成
            await expect(page.locator("#loading-indicator")).to_be_hidden(timeout=60000)

            # 3. 關閉所有彈出視窗 (以正確的順序)
            whats_new_modal = page.locator('#whatsNewModal')
            if await whats_new_modal.is_visible():
                await page.locator('#whatsNewModalCloseBtn').click()
                await expect(whats_new_modal).to_be_hidden()

            info_modal = page.locator('#infoModal')
            if await info_modal.is_visible():
                await page.locator('#infoModalCloseBtn').click()
                await expect(info_modal).to_be_hidden()

            # 4. 點擊方言連結
            dialect_link = page.locator('span[data-varname="四基"] a')
            await expect(dialect_link).to_be_visible(timeout=10000)
            await dialect_link.click()

            # 5. **最終修正**: 等待新的分類面板被渲染出來
            await expect(page.locator("#cat-panel", has_text="再擇類別：")).to_be_visible(timeout=10000)

            # 6. 現在可以安全地點擊分類了
            category_radio = page.locator('input[name="category"][value="數字、時間"]')
            await category_radio.click()

            # 7. 等待表格內容出現
            await expect(page.locator("#category-table tbody tr")).to_be_visible()

            # 8. 找到並點擊第一個斷詞連結
            first_segmented_word = page.locator('a.segmented-word').first
            await expect(first_segmented_word).to_be_visible()
            await first_segmented_word.click()

            # 9. 等待並驗證查詞 popup
            popup = page.locator('#selectionPopup')
            await expect(popup).to_be_visible()
            word_text = await first_segmented_word.text_content()
            await expect(popup.locator('#selectionPopupTitle')).to_have_text(f'尋「{word_text}」个讀音')

            # 10. 截圖
            await page.screenshot(path="jules-scratch/verification/verification.png")

            await browser.close()
    finally:
        # 確保伺服器進程被終止
        server_process.terminate()
        server_process.wait()

if __name__ == '__main__':
    asyncio.run(main())