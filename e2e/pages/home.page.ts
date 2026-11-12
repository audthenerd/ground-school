import type { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly logo: Locator;
  readonly briefing: Locator;
  readonly enterButton: Locator;
  readonly curriculumError: Locator;
  readonly adminOpenCurriculum: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logo = page.locator('img[alt="Ground School"]');
    this.briefing = page.getByTestId('sortie-briefing');
    this.enterButton = page.getByTestId('start-mission');
    this.curriculumError = page.getByTestId('home-curriculum-error');
    this.adminOpenCurriculum = page.getByTestId('admin-open-curriculum');
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

  /** Open the admin-approved shared classroom (Start Mission). */
  async submit() {
    await this.enterButton.click();
  }

  /** Start Mission and wait for the approved classroom route. */
  async openClassroom() {
    await this.submit();
    await this.page.waitForURL(/\/classroom\//, { timeout: 60_000 });
  }
}
