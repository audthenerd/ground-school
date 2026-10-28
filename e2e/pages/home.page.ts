import type { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly logo: Locator;
  readonly briefing: Locator;
  readonly enterButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logo = page.locator('img[alt="Ground School"]');
    this.briefing = page.getByTestId('sortie-briefing');
    this.enterButton = page
      .getByRole('button', { name: /enter/i })
      .or(page.locator('button:has-text("进入课堂")'));
  }

  async goto() {
    await this.page.goto('/');
  }

  /** Wait until the mission briefing typewriter has finished. */
  async waitForBriefing() {
    await this.briefing.waitFor({ state: 'visible' });
    await this.page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="sortie-briefing"]');
      return el?.getAttribute('data-briefing-complete') === 'true';
    });
  }

  /** @deprecated Topic input removed; waits for the briefing instead. */
  async fillRequirement(_text?: string) {
    await this.waitForBriefing();
  }

  async submit() {
    await this.enterButton.click();
  }
}
