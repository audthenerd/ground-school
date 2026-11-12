import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS_STORAGE = createSettingsStorage();

test.describe('Admin curriculum', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('maic:account:settings-storage', settings);
      localStorage.setItem('locale', 'en-US');
    }, SETTINGS_STORAGE);
  });

  test('non-admin is redirected away from /admin/curriculum and has no shield on home', async ({
    page,
    mockApi,
  }) => {
    await mockApi.mockAuthSession({ authenticated: true, isAdmin: false, name: 'Learner' });
    await mockApi.mockAdminCurriculum();

    // Hit the admin route first: the client gate redirects before the heavy home
    // library queries run, so this stays reliable on a cold Next compile.
    await page.goto('/admin/curriculum', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
      .toBe('/');
    await expect(page.getByTestId('admin-curriculum-page')).toHaveCount(0);

    const home = new HomePage(page);
    await expect(home.logo).toBeVisible({ timeout: 30_000 });
    await expect(home.adminOpenCurriculum).toHaveCount(0);
  });

  test('admin can open curriculum, generate a candidate, and approve a ready one', async ({
    page,
    mockApi,
  }) => {
    await mockApi.mockAuthSession({
      authenticated: true,
      isAdmin: true,
      email: 'admin@example.com',
    });
    const admin = await mockApi.mockAdminCurriculum({
      candidates: [
        {
          id: 'cand-ready',
          stageId: 'stage-ready',
          label: 'Ready sortie',
          status: 'ready',
          outlineTitle: 'RSAF Commands',
          scenesCompleted: 2,
          scenesTotal: 2,
        },
      ],
    });

    const home = new HomePage(page);
    await home.goto();
    await expect(home.adminOpenCurriculum).toBeVisible({ timeout: 30_000 });
    await home.adminOpenCurriculum.click();
    await expect(page).toHaveURL(/\/admin\/curriculum/, { timeout: 60_000 });

    const curriculum = page.getByTestId('admin-curriculum-page');
    await expect(curriculum).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('admin-live-release')).toContainText(/No classroom is live yet/i);
    await expect(page.getByTestId('admin-candidate-cand-ready')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('admin-approve').click();
    await expect.poll(() => admin.approveCalls.length).toBe(1);
    await expect(page.getByTestId('admin-live-release')).toContainText('stage-ready');

    await page.getByTestId('admin-generate-candidates').click();
    await expect.poll(() => admin.generateCalls.length).toBe(1);
    await expect(page.getByTestId(/admin-candidate-cand-/)).toHaveCount(2);
  });
});
