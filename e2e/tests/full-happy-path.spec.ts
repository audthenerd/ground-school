import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { createMockScene } from '../fixtures/test-data/generated-scene';
import { seedServerDocument, uniqueStageId } from '../fixtures/server-seed';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

test.describe('Full Happy Path', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('maic:account:settings-storage', settings);
    }, SETTINGS_STORAGE);
  });

  test('home → approved classroom with scene navigation', async ({ page, mockApi }) => {
    const stageId = uniqueStageId('e2e-happy');
    const now = Date.now();
    const scene0 = createMockScene(stageId);
    const scene1 = {
      ...createMockScene(stageId),
      id: 'scene-1',
      order: 1,
      title: '光合作用（续）',
    };

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await seedServerDocument(page, {
      stage: {
        id: stageId,
        name: 'Mock Course',
        createdAt: now,
        updatedAt: now,
      },
      scenes: [scene0, scene1],
      outline: { outlines: [], createdAt: now, updatedAt: now },
    });
    await mockApi.mockCurriculumRelease({ available: true, stageId });

    // ── Phase 1: Home page ──────────────────────────────────────────────
    const home = new HomePage(page);
    await home.goto();

    await expect(home.logo).toBeVisible();
    await expect(home.briefing).toBeVisible();
    await expect(home.enterButton).toBeDisabled();

    await home.waitForBriefing();
    await expect(home.enterButton).toBeEnabled();

    await home.openClassroom();
    expect(page.url()).toContain(`/classroom/${stageId}`);

    // ── Phase 2: Classroom ──────────────────────────────────────────────
    const classroom = new ClassroomPage(page);
    await classroom.waitForLoaded();

    await expect(classroom.sidebarScenes.first()).toBeVisible({ timeout: 10_000 });
    await expect(classroom.getSceneTitle(0)).toContainText('光合作用');

    const sceneCount = await classroom.sidebarScenes.count();
    if (sceneCount > 1) {
      await classroom.clickScene(1);
      await expect(classroom.sidebarScenes.nth(1)).toBeVisible();
    }
  });
});
