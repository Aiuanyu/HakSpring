from playwright.sync_api import sync_playwright, expect
import os

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Listen for all console events and print them
    page.on("console", lambda msg: print(f"CONSOLE: {msg.type} >> {msg.text}"))

    # Navigate to the local server
    url = "http://localhost:8123/index.html?force-refresh=true"
    print(f"Navigating to: {url}")
    page.goto(url)

    print("Waiting for loading indicator to disappear...")
    expect(page.locator("#loading-indicator")).to_be_hidden(timeout=90000)
    print("Loading indicator hidden.")

    # Close the info modal if it's visible
    info_modal_close_btn = page.locator("#infoModalCloseBtn")
    if info_modal_close_btn.is_visible():
        print("Info modal is visible, closing it...")
        info_modal_close_btn.click()
        expect(page.locator("#infoModal")).to_be_hidden()
        print("Info modal closed.")

    # Perform a search
    print("Performing search...")
    search_input = page.locator("#search-input")
    expect(search_input).to_be_visible()
    search_input.fill("阿姆")
    search_input.press("Enter")
    print("Search submitted.")

    # Wait for the first result row to be visible
    print("Waiting for results...")
    first_result_row = page.locator("#generated tr").first
    expect(first_result_row).to_be_visible(timeout=10000)
    print("Results visible.")

    # Find and click the accordion button in the first 'cert' result
    print("Looking for accordion button...")
    accordion_button = page.locator("tr:has(.source-tag.cert-source) .crossDialectBtn").first
    expect(accordion_button).to_be_visible()
    accordion_button.click()
    print("Accordion button clicked.")

    # Wait for the accordion content to appear
    print("Waiting for accordion row...")
    accordion_row = page.locator(".accordion-row").first
    expect(accordion_row).to_be_visible()
    print("Accordion row visible.")

    # Take a screenshot
    print("Taking screenshot...")
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()
    print("Browser closed.")


with sync_playwright() as playwright:
    run_verification(playwright)

print("Verification script finished and screenshot taken.")