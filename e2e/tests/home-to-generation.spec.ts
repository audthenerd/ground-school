import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { createMockScene } from '../fixtures/test-data/generated-scene';
import { seedServerDocument, uniqueStageId } from '../fixtures/server-seed';
import type { Page } from '@playwright/test';

const SETTINGS_STORAGE = createSettingsStorage();

interface BodySpacing {
  paddingRight: string;
  marginRight: string;
}

async function readBodySpacing(page: Page): Promise<BodySpacing> {
  return page.evaluate(() => {
    const styles = getComputedStyle(document.body);
    return {
      paddingRight: styles.paddingRight,
      marginRight: styles.marginRight,
    };
  });
}

async function expectBodyScrollState(page: Page, initialSpacing: BodySpacing, locked: boolean) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        locked: document.body.hasAttribute('data-scroll-locked'),
        paddingRight: getComputedStyle(document.body).paddingRight,
        marginRight: getComputedStyle(document.body).marginRight,
      })),
    )
    .toEqual({
      locked,
      paddingRight: initialSpacing.paddingRight,
      marginRight: initialSpacing.marginRight,
    });
}

test.describe('Home → Classroom', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('maic:account:settings-storage', settings);
      localStorage.setItem('locale', 'en-US');
    }, SETTINGS_STORAGE);
  });

  test('home page session probe does not block the briefing', async ({ page }) => {
    const session = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/auth/session',
    );
    const home = new HomePage(page);
    await home.goto();

    const response = await session;
    expect(response.status()).toBe(200);
    await expect(home.logo).toBeVisible();
    await expect(home.briefing).toBeVisible();
    await expect(home.enterButton).toBeDisabled();
  });

  test('Start Mission opens the admin-approved classroom', async ({ page, mockApi }) => {
    const stageId = uniqueStageId('e2e-curriculum');
    const now = Date.now();
    // Establish the anonymous owner cookie before seeding; keep navigation light
    // so a cold Next compile does not burn the whole test budget.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await seedServerDocument(page, {
      stage: { id: stageId, name: 'Approved sortie', createdAt: now, updatedAt: now },
      scenes: [createMockScene(stageId)],
      outline: { outlines: [], createdAt: now, updatedAt: now },
    });
    await mockApi.mockCurriculumRelease({ available: true, stageId });

    const home = new HomePage(page);
    await home.goto();

    await expect(home.logo).toBeVisible({ timeout: 30_000 });
    await expect(home.briefing).toBeVisible();
    await expect(home.enterButton).toBeDisabled();

    await home.waitForBriefing();
    await expect(home.enterButton).toBeEnabled();

    await home.openClassroom();
    expect(page.url()).toContain(`/classroom/${stageId}`);
  });

  test('Start Mission shows an error when no classroom is released', async ({ page, mockApi }) => {
    await mockApi.mockCurriculumRelease({ available: false });

    const home = new HomePage(page);
    await home.goto();
    await home.waitForBriefing();
    await home.enterButton.click({ timeout: 15_000 });

    await expect(home.curriculumError).toBeVisible({ timeout: 15_000 });
    await expect(home.curriculumError).toContainText(/not released|尚未发布/i);
    expect(page.url()).not.toContain('/classroom/');
    expect(page.url()).not.toContain('/generation-preview');
  });

  test('keeps body spacing stable when the settings dialog opens', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.logo).toBeVisible();

    const initialBodySpacing = await readBodySpacing(page);

    await page.locator('button:has(svg.lucide-settings)').first().click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expectBodyScrollState(page, initialBodySpacing, true);
  });
});
