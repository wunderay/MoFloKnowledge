import { describe, expect, it } from 'vitest';
import { Frontier } from '@/worker/crawl/frontier';

describe('path scope', () => {
  it('only follows pages at or below the start path', () => {
    const frontier = new Frontier('https://github.com/wunderay', { documentLimit: 10, depthLimit: 3 });
    expect(frontier.add('https://github.com/wunderay/repo', 'repo', 1)).toBe(true);
    expect(frontier.add('https://github.com/', 'home', 1)).toBe(false);
    expect(frontier.add('https://github.com/other', 'other', 1)).toBe(false);
    expect(frontier.add('https://github.com/wunderay-other', 'sibling', 1)).toBe(false);
  });

  it('refuses a redirect alias that leaves the start path', () => {
    const frontier = new Frontier('https://github.com/wunderay', { documentLimit: 10, depthLimit: 3 });
    expect(() => frontier.alias('https://github.com/wunderay', 'https://github.com/other')).toThrow();
  });

  it('keeps the whole host in scope for a root start url', () => {
    const frontier = new Frontier('https://acme.example.com/', { documentLimit: 10, depthLimit: 3 });
    expect(frontier.add('https://acme.example.com/about', 'about', 1)).toBe(true);
  });
});
