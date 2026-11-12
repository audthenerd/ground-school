import type { Page } from '@playwright/test';
import type { MockGenerationRun } from './mock-api';
import { GenerationPreviewPage } from '../pages/generation-preview.page';

/**
 * Students no longer start generation from home. Specs that exercise the
 * generation-preview UI POST a run through the page (so `page.route` mocks
 * apply), then open `/generation-preview?run=…`.
 */
export async function startGenerationRun(
  page: Page,
  run: MockGenerationRun,
  input: Record<string, unknown> = {},
): Promise<void> {
  await page.goto('/');
  const result = await page.evaluate(
    async (body) => {
      const response = await fetch('/api/generation-runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    {
      requirement: '讲解光合作用',
      outlineReview: 'countdown',
      ...input,
    },
  );

  if (result.status !== 202) {
    throw new Error(
      `Expected generation run to start with 202, got ${result.status}: ${JSON.stringify(result.body)}`,
    );
  }

  const preview = new GenerationPreviewPage(page);
  await preview.goto(run.id);
}
