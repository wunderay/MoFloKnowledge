import { it, expect } from 'vitest';
import { Frontier } from '../../src/worker/crawl/frontier';
import { CrawlBudgets } from '../../src/worker/crawl/budgets';
import { Scheduler } from '../../src/worker/crawl/scheduler';
import { parseRobots, robotsAllows, RobotsCache, retryAfterMs } from '../../src/worker/crawl/robots';
it('prioritizes bounded frontier and restores deduplication/limits', () => {
    const frontier = new Frontier('https://example.com');
    expect(frontier.next()?.depth).toBe(0);
    frontier.add('/other', 'Other', 1);
    frontier.add('/pricing', 'Pricing', 1);
    frontier.add('/too-deep', '', 3);
    expect(frontier.next()?.url).toBe('https://example.com/pricing');
    frontier.alias('https://example.com/other', 'https://www.example.com/about');
    const restored = new Frontier(frontier.root, {}, frontier.snapshot());
    expect(restored.add('/pricing', '', 1)).toBe(false);
    expect([...restored.limitsReached]).toContain('depth');
});
it('reserves documents and design bytes synchronously before concurrent tasks', () => {
    const budgets = new CrawlBudgets({ documentLimit: 1 });
    const reservation = budgets.reserve(0, 1024);
    expect(() => budgets.reserve(0)).toThrow('documents');
    expect(() => budgets.finish(reservation, 10, 1025)).toThrow('reserved');
    expect(budgets.snapshot().documents).toBe(1);
});
it('paces starts and enforces HTTP concurrency while releasing failed tasks', async () => {
    const scheduler = new Scheduler();
    let active = 0, max = 0;
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 4 }, (_, i) => scheduler.runHttp(`https://host${i}.example.com`, async () => { active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 20)); active--; })));
    expect(max).toBe(3);
    await Promise.all([0, 1].map(() => scheduler.runHttp('https://example.com', async () => { starts.push(Date.now()); })));
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(490);
});
it('honors longest robots rule and bot group; retries indeterminate origins once', async () => {
    const policy = parseRobots('User-agent: *\nDisallow: /\nUser-agent: MoFloKnowledgeBot\nDisallow: /private*\nAllow: /private/public$\nCrawl-delay: 2');
    expect(robotsAllows('/private/secret', policy.rules)).toBe(false);
    expect(robotsAllows('/private/public', policy.rules)).toBe(true);
    expect(robotsAllows('/about', policy.rules)).toBe(true);
    expect(robotsAllows('/private',parseRobots('User-agent: *\nDisallow: /%70rivate').rules)).toBe(false);
    expect(robotsAllows('/caf%C3%A9',parseRobots('User-agent: *\nDisallow: /café').rules)).toBe(false);
    expect(policy.delayMs).toBe(2000);
    expect(retryAfterMs('9999')).toBe(10000);
    let calls = 0;
    const robots = new RobotsCache(async (url) => { calls++; return { requestedUrl: url, finalUrl: url, status: 503, headers: {}, body: Buffer.alloc(0), redirects: [] }; });
    expect((await robots.check('https://example.com/a')).allowed).toBe(false);
    await robots.check('https://example.com/b');
    expect(calls).toBe(2);
});

it('uses destination relevance without letting repeated services crowd out company context', () => {
    const frontier = new Frontier('https://example.com', { documentLimit: 10 });
    frontier.next();
    for (const [url, label] of [
        ['/services', 'Services'], ['/company-background', 'About us'], ['/about/team-member', 'About our founder'],
        ['/contact', 'Contact'], ['/appointment', 'Schedule'], ['/company-background/privacy-policy', 'Privacy'],
        ['/company-background/referrals', 'Referrals'], ['/blog/service-news', 'Service news'],
        ...Array.from({ length: 5 }, (_, index) => [`/services/detail-${index}`, 'Service']),
    ]) frontier.add(url, label, 1);
    const selected = Array.from({ length: 9 }, () => frontier.next()?.url);
    expect(selected).toContain('https://example.com/company-background');
    expect(selected).toContain('https://example.com/contact');
    expect(selected).toContain('https://example.com/about/team-member');
    expect(selected.filter((url) => url?.includes('/services/detail-'))).toHaveLength(5);
    expect(frontier.next()).toBeUndefined();
    expect([...frontier.limitsReached]).toContain('documents');
    expect(frontier.snapshot().pending).toHaveLength(4);
});
