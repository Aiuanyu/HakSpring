import os
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console messages
        console_messages = []
        page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))

        try:
            # 1. Navigate to the local server URL
            page.goto('http://localhost:8000/index.html')

            # 2. Wait for the loading indicator to appear and then disappear.
            # This is the key check to ensure the async data loading has started and finished.
            loading_indicator = page.locator('#loading-indicator')
            expect(loading_indicator).to_be_visible(timeout=5000)
            expect(loading_indicator).to_be_hidden(timeout=30000) # 30 second timeout for data fetching

            # 3. Check that the main content area is now visible
            generated_content = page.locator('#generated')
            expect(generated_content).to_be_visible()

            # 4. Find and click the link for "四縣" -> "基礎級"
            siki_basic_link = page.locator('span[data-varname="四基"] a')
            siki_basic_link.click()

            # 5. Wait for the table to be generated inside the #generated container
            generated_table = generated_content.locator('table')
            expect(generated_table).to_be_visible()
            # Also check that the table has some rows
            expect(generated_content.locator('tr')).to_have_count(lambda c: c > 1)


            # 6. Take a screenshot for visual verification
            screenshot_path = 'jules-scratch/verification/verification.png'
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print("An error occurred during Playwright verification.")
            print(e)

        finally:
            # Print all captured console messages
            print("\n--- Browser Console Output ---")
            if console_messages:
                for msg in console_messages:
                    print(msg)
            else:
                print("No console messages were captured.")
            print("----------------------------\n")

            # Stop the server
            # I can't do this easily from here, it's a background process.
            # I will let it run and clean it up later if needed.

            browser.close()

if __name__ == "__main__":
    run_verification()
