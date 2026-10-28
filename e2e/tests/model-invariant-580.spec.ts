import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';

/**
 * #580 — "usable provider ⇒ a concrete model is always selected".
 *
 * The course model is the workspace's `llm` slot, read from the server
 * (`/api/model-config`); the browser keeps no provider state.
 *
 * State A: the workspace has no language model → Enter Classroom stays
 *          disabled after the briefing. NO modelNotConfigured toast, NO
 *          forced settings dialog. Model setup is via the header settings gear.
 * State B: the llm slot names a model → Enter Classroom enables after the
 *          briefing finishes.
 *
 * The Playwright Chromium locale is en-US, so UI strings are English
 * ("Enter Classroom").
 */

const SCREENSHOT_DIR = 'e2e/screenshots';

test.describe.configure({ mode: 'serial' });

test.describe('#580 model-selection invariant', () => {
  test('State A: no language model → disabled generate, settings gear present, no toast', async ({
    page,
    mockApi,
  }) => {
    await mockApi.mockModelSettings({ providers: {} });

    const home = new HomePage(page);
    await Promise.all([page.waitForResponse('**/api/model-config'), home.goto()]);
    await expect(home.briefing).toBeVisible();
    await expect(page.locator('button:has(svg.lucide-settings)').first()).toBeVisible();

    await home.waitForBriefing();
    await expect(home.enterButton).toBeDisabled();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/580-state-a-no-provider.png`,
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('State B: the llm slot names a model → generation enabled after briefing', async ({
    page,
    mockApi,
  }) => {
    await mockApi.mockModelSettings({
      providers: { openai: ['gpt-4o', 'gpt-4o-mini'] },
      llm: 'openai:gpt-4o',
    });

    const home = new HomePage(page);
    await Promise.all([page.waitForResponse('**/api/model-config'), home.goto()]);
    await expect(home.briefing).toBeVisible();

    await home.waitForBriefing();
    await expect(home.enterButton).toBeEnabled();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/580-state-b-usable-provider.png`,
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });
});
