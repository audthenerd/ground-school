import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

describe('DEFAULT_BRAND (single-brand build)', () => {
  it('uses the original product identity for full chrome', () => {
    expect(DEFAULT_BRAND.productName).toBe('Ground School');
    expect(DEFAULT_BRAND.shortName).toBe('Ground School');
    expect(DEFAULT_BRAND.markSrc).toBe('/brand/ground-school-mark-minimal.svg');
    expect(DEFAULT_BRAND.themeColor).toBe('#3288C6');
  });

  it('uses the landing-page mark with a separate product wordmark', () => {
    expect(DEFAULT_BRAND.logoHasWordmark).toBe(false);
    expect(DEFAULT_BRAND.logoSrc).toBe('/brand/ground-school-mark-minimal.svg');
  });
});
