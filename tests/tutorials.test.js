import { describe, it, expect } from 'vitest';
import { tutorialFallbackUrl } from '../functions/api/_tutorials.js';

describe('tutorialFallbackUrl', () => {
  it('builds a musclewiki-scoped search URL and encodes the name', () => {
    const url = tutorialFallbackUrl('手臂收尾:三头下压+弯举');
    expect(url.startsWith('https://www.bing.com/search?q=')).toBe(true);
    expect(url).toContain('site%3Amusclewiki.com');
    expect(url).not.toContain(' ');
  });
});
