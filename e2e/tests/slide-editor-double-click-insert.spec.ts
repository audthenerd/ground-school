import { test, expect } from '../fixtures/base';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { openSeededSlideClassroom } from '../fixtures/seed-slide-classroom';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

/**
 * Double-click text insertion on slide canvas (#1310).
 * Verifies that double-clicking on blank canvas area creates a new text element.
 * Regression test to ensure the event-propagation guard works correctly.
 */
test.describe('Slide editor double-click text insertion (#1310)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('maic:account:settings-storage', settings);
    }, SETTINGS_STORAGE);
  });

  test('double-click on blank canvas area creates a new text element', async ({ page }) => {
    await openSeededSlideClassroom(page, 'e2e-dblclick');

    const classroom = new ClassroomPage(page);
    await classroom.waitForLoaded();
    await expect(classroom.sidebarScenes.first()).toBeVisible({ timeout: 10_000 });

    // Enter Pro edit mode
    await page.getByRole('switch').click();
    await expect(page.getByTestId('slide-nav-rail')).toBeVisible({ timeout: 10_000 });

    // Open slide editor by clicking on first scene
    await classroom.clickScene(0);
    await page.waitForTimeout(1000); // Wait for slide editor to fully render

    // Wait for canvas to be available
    const canvas = page
      .locator('[data-testid="canvas-viewport"], .canvas-viewport, [class*="canvas"]')
      .first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Get initial count of editable elements
    const initialElementCount = await page.locator('.editable-element').count();

    // Double-click on blank canvas area (center, avoiding existing elements)
    const boundingBox = await canvas.boundingBox();
    if (!boundingBox) throw new Error('Canvas bounding box not found');

    const clickX = boundingBox.x + boundingBox.width * 0.7;
    const clickY = boundingBox.y + boundingBox.height * 0.7;

    await page.mouse.dblclick(clickX, clickY);
    await page.waitForTimeout(500); // Wait for text element creation

    // Verify a new text element was created
    const newElementCount = await page.locator('.editable-element').count();
    expect(newElementCount).toBeGreaterThan(initialElementCount);
  });
});
