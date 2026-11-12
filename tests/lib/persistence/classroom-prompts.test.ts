import { describe, expect, it } from 'vitest';

import {
  CLASSROOM_PROMPT_MAX_CHARS,
  truncatePromptText,
} from '@/lib/persistence/classroom-prompts';

describe('truncatePromptText', () => {
  it('leaves short prompts unchanged', () => {
    expect(truncatePromptText('hello')).toBe('hello');
  });

  it('truncates long prompts to the max', () => {
    const long = 'x'.repeat(CLASSROOM_PROMPT_MAX_CHARS + 50);
    expect(truncatePromptText(long).length).toBe(CLASSROOM_PROMPT_MAX_CHARS);
  });
});
