
const { test, expect } = require('@playwright/test');

test.describe('Translation UI Flow Verification', () => {
  test('should correctly navigate the translation popup UI', async ({ page }) => {
    // 1. Navigate to the application
    await page.goto('http://localhost:8000');

    // 2. Wait for the main content to be visible to ensure the app is loaded
    await page.waitForSelector('#main-content', { state: 'visible', timeout: 30000 });

    // 3. Find the first sentence element and select text within it
    const sentenceElement = await page.locator('.sentence').first();
    await expect(sentenceElement).toBeVisible();

    // Simulate a mouse drag to select text, as click/select_text doesn't trigger the mouseup event
    const boundingBox = await sentenceElement.boundingBox();
    if (!boundingBox) {
      throw new Error('Could not get bounding box for sentence element');
    }
    await page.mouse.move(boundingBox.x + boundingBox.width / 4, boundingBox.y + boundingBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(boundingBox.x + (boundingBox.width * 3) / 4, boundingBox.y + boundingBox.height / 2);
    await page.mouse.up();

    // 4. Wait for the selection popup to appear and verify the "Translate" button is present
    const popup = page.locator('#selection-popup');
    await expect(popup).toBeVisible({ timeout: 10000 });
    const translateButton = popup.locator('#translate-btn');
    await expect(translateButton).toBeVisible();

    // 5. Click the "Translate" button
    await translateButton.click();

    // 6. Verify the translation view is now active
    const translationView = popup.locator('#translation-view');
    await expect(translationView).toBeVisible();
    const backButton = popup.locator('#back-to-pronunciation-btn');
    await expect(backButton).toBeVisible();

    // 7. Take a screenshot of the translation view
    await page.screenshot({ path: '/home/jules/verification/translation_view.png' });

    // 8. Click the "Back" button
    await backButton.click();

    // 9. Verify the original pronunciation view is restored
    const pronunciationView = popup.locator('#pronunciation-view');
    await expect(pronunciationView).toBeVisible();
    await expect(translationView).toBeHidden();

    // 10. Take a final screenshot to confirm the state is restored
    await page.screenshot({ path: '/home/jules/verification/final_view.png' });
  });
});
