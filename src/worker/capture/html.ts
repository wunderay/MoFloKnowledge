import { load } from 'cheerio';
import { normalizeUrl } from '../network/url-scope';
import { hashCapture, makeSegments, normalizeText, type TextSegment } from './segments';
import type { RenderResult } from '../../contracts/render-task';
export type PageCapture = {
    normalizedUrl: string;
    finalUrl: string;
    title: string | null;
    author: string | null;
    publisher: string | null;
    publishedAt: string | null;
    updatedAt: string | null;
    segments: TextSegment[];
    text: string;
    contentHash: string;
    observations: Record<string, unknown>;
    links: {
        url: string;
        label: string;
    }[];
    requiresRender: boolean;
    truncated: boolean;
};
export function captureHtml(input: {
    requestedUrl: string;
    finalUrl: string;
    body: Buffer | string;
    redirects?: string[];
}, rendered?: RenderResult): PageCapture {
    const html = Buffer.isBuffer(input.body) ? input.body.toString('utf8') : input.body;
    if (Buffer.byteLength(html) > 2 * 1024 * 1024)
        throw new Error('HTML capture exceeds decoded limit');
    const $ = load(html);
    const meta = (name: string) => $(`meta[name="${name}"],meta[property="${name}"]`).first().attr('content')?.trim() || null;
    const title = normalizeText($('title').first().text()) || null;
    const jsonLd: unknown[] = [];
    $('script[type="application/ld+json"]').slice(0, 30).each((_i, node) => { try {
        const text = $(node).text();
        if (text.length <= 50000)
            jsonLd.push(JSON.parse(text));
    }
    catch { /* Invalid structured metadata is not evidence. */ } });
    const canonicalRaw = $('link[rel="canonical"]').first().attr('href');
    let canonical: string | null = null;
    try {
        if (canonicalRaw)
            canonical = normalizeUrl(canonicalRaw, input.finalUrl);
    }
    catch { }
    $('script,style,noscript,template,svg,canvas,iframe,object,embed,[hidden],[aria-hidden="true"],input[type="hidden"]').remove();
    $('[style]').each((_i, node) => { if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test($(node).attr('style') ?? ''))
        $(node).remove(); });
    const headings = $('h1,h2,h3,h4,h5,h6').slice(0, 200).map((_i, node) => ({ level: Number(node.tagName.slice(1)), text: normalizeText($(node).text()) })).get();
    const safeLink = (raw: string | undefined): string | null => { try {
        return raw ? normalizeUrl(raw, input.finalUrl) : null;
    }
    catch {
        return null;
    } };
    const links: {
        url: string;
        label: string;
    }[] = [];
    $('a[href]').slice(0, 500).each((_i, node) => { const url = safeLink($(node).attr('href')); if (url)
        links.push({ url, label: normalizeText($(node).text()).slice(0, 500) }); });
    const forms = $('form').slice(0, 40).map((_i, node) => ({ action: safeLink($(node).attr('action')), method: ($(node).attr('method') ?? 'GET').toUpperCase(), labels: $(node).find('label').map((_j, label) => normalizeText($(label).text())).get().slice(0, 30) })).get();
    const ctas = $('button,a[role="button"],input[type="submit"]').slice(0, 100).map((_i, node) => ({ label: normalizeText($(node).text() || $(node).attr('value') || '').slice(0, 500), destination: safeLink($(node).attr('href')) })).get();
    const addresses = $('address,[itemprop="address"]').slice(0, 30).map((_i, node) => normalizeText($(node).text())).get();
    const priceText = $('[itemprop="price"], [class*="price"], [class*="pricing"]').slice(0, 40).map((_i, node) => normalizeText($(node).text()).slice(0, 2000)).get();
    // Main text excludes repeated navigation/footer; links/forms above preserve visible navigation observations.
    $('nav,footer,[role="navigation"],header').remove();
    const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');
    root.find('br').replaceWith('\n');
    root.find('p,div,section,li,h1,h2,h3,h4,h5,h6,tr').append('\n');
    const parsed = rendered ? makeSegments(rendered.text.split(/\n+/).map(text => ({ text }))) : makeSegments(root.text().split(/\n+/).map(text => ({ text })));
    const observations: Record<string, unknown> = { headings, jsonLd, metaDescription: meta('description') ?? meta('og:description'), canonical, redirects: input.redirects ?? [], forms, ctas, addresses, priceText, socialLinks: links.filter(link => /\b(?:linkedin|twitter|x|facebook|instagram|youtube|tiktok)\.com$/.test(new URL(link.url).hostname)), ...(rendered ? { design: rendered } : {}), limitations: rendered?.limitations ?? [] };
    const finalized = { normalizedUrl: normalizeUrl(input.requestedUrl), finalUrl: normalizeUrl(rendered?.finalUrl ?? input.finalUrl), title, author: meta('author'), publisher: meta('publisher') ?? meta('og:site_name'), publishedAt: meta('article:published_time'), updatedAt: meta('article:modified_time'), ...parsed, observations, links, requiresRender: parsed.text.length < 200 || /enable javascript|javascript is required/i.test(parsed.text) };
    return { ...finalized, contentHash: hashCapture(finalized) };
}
export function shouldRenderPage(capture: PageCapture, isHomepage: boolean, requiresClientSection = false): boolean { return isHomepage || capture.requiresRender || requiresClientSection; }
