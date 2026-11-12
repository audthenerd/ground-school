import { test, expect } from '../fixtures/base';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { openSeededSlideClassroom } from '../fixtures/seed-slide-classroom';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

/**
 * Scene creation is enabled in the slide editor: the inter-thumb "+" insertion
 * zones and the per-slide Duplicate menu item are exposed alongside reorder /
 * delete / rename. (Duplicated slides carry their actions; a blank inserted
 * slide is authored via the script timeline / MAIC Agent.) This test guards
 * that the entry points stay available — flip SCENE_CREATION_ENABLED off and it
 * fails.
 */
test.describe('Slide editor — scene creation (enabled)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('maic:account:settings-storage', settings);
    }, SETTINGS_STORAGE);
  });

  test('Pro mode rail exposes insert + duplicate alongside rename/delete', async ({
    page,
  }, testInfo) => {
    await openSeededSlideClassroom(page, 'e2e-scene-gate');
    expect(page.url()).toMatch(/\/classroom\//);

    const classroom = new ClassroomPage(page);
    await classroom.waitForLoaded();
    await expect(classroom.sidebarScenes.first()).toBeVisible({ timeout: 10_000 });

    // Enter Pro mode via the header Pro Switch.
    await page.getByRole('switch').click();

    // The slide nav rail replaces the playback sidebar in Pro mode.
    const rail = page.getByTestId('slide-nav-rail');
    await expect(rail).toBeVisible({ timeout: 10_000 });

    // Insertion zones are present between thumbs.
    await expect(page.getByTestId('slide-nav-insert')).not.toHaveCount(0);

    // The per-slide overflow menu now has Rename + Duplicate + Delete (3 items).
    // Counting menuitems keeps the assertion locale-independent.
    await page.getByTestId('slide-nav-more').first().click();
    await expect(page.getByRole('menuitem')).toHaveCount(3);

    // Visual evidence, attached to the Playwright report.
    await testInfo.attach('pro-rail-scene-creation', {
      body: await rail.screenshot(),
      contentType: 'image/png',
    });
  });
});
