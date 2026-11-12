import type { Page } from '@playwright/test';
import { createMockScene } from './test-data/generated-scene';
import { seedServerDocument, uniqueStageId } from './server-seed';

/** Seed a one-slide classroom and open it — used by Pro-mode slide editor specs. */
export async function openSeededSlideClassroom(
  page: Page,
  prefix: string,
): Promise<{ stageId: string }> {
  await page.goto('/', { waitUntil: 'networkidle' });
  const stageId = uniqueStageId(prefix);
  const now = Date.now();
  await seedServerDocument(page, {
    stage: {
      id: stageId,
      name: 'Slide classroom',
      createdAt: now,
      updatedAt: now,
    },
    scenes: [createMockScene(stageId)],
    outline: { outlines: [], createdAt: now, updatedAt: now },
  });
  await page.goto(`/classroom/${encodeURIComponent(stageId)}`);
  return { stageId };
}
