import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';

/**
 * Start Mission is gated by the briefing typewriter finishing — not by
 * whether a language model is configured. Students open an already-generated
 * shared classroom; model setup only matters for admin candidate generation.
 *
 * State A: no language model → Start Mission still enables after the briefing.
 * State B: llm slot set → same briefing gate.
 */

const SCREENSHOT_DIR = 'e2e/screenshots';

test.describe.configure({ mode: 'serial' });

test.describe('#580 Start Mission briefing gate', () => {
  test('State A: no language model → Start Mission enables after briefing', async ({
    page,
    mockApi,
  }) => {
    await mockApi.mockModelSettings({ providers: {} });
    await mockApi.mockCurriculumRelease({ available: false });

    const home = new HomePage(page);
    await Promise.all([page.waitForResponse('**/api/model-config'), home.goto()]);
    await expect(home.briefing).toBeVisible();
    await expect(page.locator('button:has(svg.lucide-settings)').first()).toBeVisible();
    await expect(home.enterButton).toBeDisabled();

    await home.waitForBriefing();
    await expect(home.enterButton).toBeEnabled();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/580-state-a-no-provider.png`,
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('State B: the llm slot names a model → Start Mission enables after briefing', async ({
    page,
    mockApi,
  }) => {
    await mockApi.mockModelSettings({
      providers: { openai: ['gpt-4o', 'gpt-4o-mini'] },
      llm: 'openai:gpt-4o',
    });
    await mockApi.mockCurriculumRelease({ available: false });

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
