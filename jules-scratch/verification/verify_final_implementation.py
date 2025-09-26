import asyncio
from playwright.async_api import async_playwright, expect
import os

async def main():
    async with async_playwright() as p:
        iphone_13 = p.devices['iPhone 13']
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(**iphone_13)
        page = await context.new_page()

        # Listen for console messages to see SW caching logs
        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

        try:
            # 1. Navigate to the local server
            url = "http://localhost:8000/index.html"
            print(f"Navigating to: {url}")
            await page.goto(url, wait_until="networkidle")

            # 2. Wait for the main content to be visible
            await expect(page.locator("#main-content")).to_be_visible(timeout=30000)
            print("Main content is visible.")

            # 3. Close the info modal
            await page.locator("#infoModalCloseBtn").click()
            print("Closed the info modal.")

            # 4. Click on a dialect and level
            await page.locator('span[data-varname="四基"] a').click()
            print("Clicked on '四縣 基礎'.")

            # 5. Click on a category
            await page.locator('input[name="category"]').first.click()
            print("Clicked on the first category.")

            # 6. Wait for the table to be generated
            await expect(page.locator("#category-table")).to_be_visible(timeout=10000)
            print("Category table is visible.")

            # 7. Click the "play from this row" button
            await page.locator('.playFromThisRow').first.click()
            print("Clicked 'play from this row' on the first row.")

            # 8. Verify that the row gets the 'nowPlaying' ID, which indicates playback has started.
            await expect(page.locator("#nowPlaying")).to_be_visible(timeout=10000)
            print("Playback has started, 'nowPlaying' ID is visible on the row.")

            # 9. Now that playback is confirmed, check the Media Session metadata.
            # This might still be racy, but it's more likely to succeed now.
            media_session_title = await page.evaluate("navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : ''")
            media_session_artist = await page.evaluate("navigator.mediaSession.metadata.artist")

            print(f"Media Session Title: {media_session_title}")
            print(f"Media Session Artist: {media_session_artist}")

            assert media_session_title is not None and media_session_title != "", "Media Session title should be set."
            assert media_session_artist is not None and media_session_artist != "", "Media Session artist should be set."

            print("Media Session metadata verified successfully.")

            # 9. Take a screenshot for visual confirmation
            screenshot_path = "jules-scratch/verification/verification.png"
            await page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")
            raise
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())