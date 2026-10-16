import type { Page } from 'playwright-core';
import type { RenderResult } from '../contracts/render-task';
export async function captureRenderedPage(page: Page): Promise<Omit<RenderResult, 'resourceBytes'>> {
    return page.evaluate(() => {
        const visible = (node: Element) => { const style = getComputedStyle(node); return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0; };
        const selectorFor=(element:Element):string=>{const parts:string[]=[];let current:Element|null=element;while(current){if(current.id){parts.unshift('#'+CSS.escape(current.id));break;}const tag=current.tagName.toLowerCase();const siblings=current.parentElement?[...current.parentElement.children].filter(sibling=>sibling.tagName===current!.tagName):[current];parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current)+1})`);current=current.parentElement;}return parts.join(' > ');};
        const styles = [...document.querySelectorAll('body,h1,h2,h3,button,a[role="button"],header,footer')].filter(visible).slice(0, 100).map((element, index) => { const style = getComputedStyle(element); return { selector: selectorFor(element), evidenceId: `style${index + 1}`, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, backgroundColor: style.backgroundColor }; });
        const limitations: string[] = [];
        const stylesheets = [...document.styleSheets].slice(0, 50).map(sheet => { try {
            return { url: sheet.href, declarations: [...sheet.cssRules].map(rule => rule.cssText).join('\n').slice(0, 100000), status: 'available' as const };
        }
        catch {
            limitations.push('Stylesheet CSSOM inaccessible: ' + (sheet.href ?? 'inline'));
            return { url: sheet.href, declarations: '', status: 'unavailable' as const };
        } });
        const fonts = performance.getEntriesByType('resource').filter(entry => /\.(?:woff2?|ttf|otf)(?:\?|$)/i.test(entry.name)).slice(0, 100).map(entry => ({ url: entry.name, loaded: (entry as PerformanceResourceTiming).responseEnd > 0 }));
        const logos = [...document.querySelectorAll('header img,footer img,[role="banner"] img,img[alt*="logo" i]')].filter(visible).filter(element => !element.closest('a') || !(element.closest('a') as HTMLAnchorElement).hostname || [location.hostname, 'www.' + location.hostname].includes((element.closest('a') as HTMLAnchorElement).hostname)).slice(0, 40).map(element => { const image = element as HTMLImageElement; return { url: image.currentSrc || image.src, alt: image.alt.slice(0, 500), context: (image.closest('header,footer,[role="banner"]')?.tagName ?? 'candidate').toLowerCase() }; }).filter(logo => /^https?:/.test(logo.url));
        const root = document.querySelector('main') ?? document.body;
        return { finalUrl: location.href, text: ((root as HTMLElement | null)?.innerText ?? '').slice(0, 100000), styles, stylesheets, fonts, logos, limitations };
    });
}
