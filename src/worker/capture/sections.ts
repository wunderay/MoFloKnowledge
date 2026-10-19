/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-enum-comparison -- domhandler's node.type enum is compared to its string values; the enum is not exported by a direct dependency */
import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { normalizeText, type TextSegment } from "./segments";

export interface ContentSection {
  heading: string | null;
  level: number;
  paragraphs: string[];
  listItems: string[];
  links: { url: string; label: string }[];
}

export interface ContentList { heading: string | null; intro: string | null; items: string[] }

const excluded = 'nav,footer,aside,[role="navigation"],[role="contentinfo"],[role="complementary"],script,style,noscript,template,svg,canvas,iframe,object,embed,[hidden],[aria-hidden="true"]';
const recommendation = /(?:^|[\s_-])(?:article[-_ ]?recommendations?|related[-_ ]?(?:articles?|posts?|stories)|recommended[-_ ]?(?:articles?|posts?|stories)|cookie[-_ ]?(?:banner|consent))(?:$|[\s_-])/i;
const blockTags = /^(?:address|article|aside|blockquote|dd|div|dl|dt|fieldset|figure|figcaption|form|h[1-6]|header|hr|li|main|ol|p|pre|section|table|tbody|td|th|thead|tr|ul)$/;

/** Read semantic relationships on a clone, before flattening the source DOM. */
export function captureContentSections(
  $: CheerioAPI,
  safeLink: (raw: string | undefined | null) => string | null,
): { sections: ContentSection[]; lists: ContentList[]; truncated: boolean } {
  const body = $("body").clone();
  // CMS navigation wrappers often contain phone/login/brand text beside the <nav>.
  // Stop at a content heading/main/article so this cannot swallow the page content.
  body.find('nav,[role="navigation"]').each((_i, node) => {
    let region = $(node);
    while (region.parent().length && !region.parent().is("body,main,article") && !region.parent().find("main,article,h1,h2,h3").length) {
      region = region.parent();
    }
    region.remove();
  });
  body.find(excluded).remove();
  // A page/article header can contain its title; only site banners are chrome.
  body.find("header").not("article header,main header").remove();
  body.find("[class],[id],[style]").each((_i, node) => {
    const el = $(node);
    if (recommendation.test(`${el.attr("class") ?? ""} ${el.attr("id") ?? ""}`) ||
      /display\s*:\s*none/i.test(el.attr("style") ?? "")) {
      el.remove();
    }
  });
  body.find("h1,h2,h3").each((_i, node) => {
    if (!/^(?:(?:latest|recent|related|recommended)\s+(?:articles?|posts?|stories|news)|you may also (?:like|enjoy))\s*[:.!]?$/i.test(normalizeText($(node).text()))) {
      return;
    }
    let region = $(node).parent();
    while (region.parent().length && !region.parent().is("body,main") && region.parent().find("h1,h2").length <= 1) {
      region = region.parent();
    }
    region.remove();
  });
  const primary = body.find("main").first().length ? body.find("main").first() : body.find("article").first();
  // Some CMSs wrap only the hero in <main>; keep substantive sibling sections in that case.
  const root = primary.length && normalizeText(primary.text()).length >= normalizeText(body.text()).length * 0.5 ? primary : body;
  root.find("br").replaceWith("\n");
  const sections: ContentSection[] = [];
  const lists: ContentList[] = [];
  let current: ContentSection | undefined;
  let remaining = 80000;
  let truncated = false;
  let stopped = false;
  const reserve = (original: string, max = 4000): string => {
    const text = normalizeText(original);
    const retained = text.slice(0, Math.max(0, Math.min(max, remaining - 1)));
    if (retained.length < text.length) {
      truncated = true;
    }
    if (retained) {
      remaining -= retained.length + 1;
    }
    return retained;
  };
  const section = () => {
    if (!current && sections.length < 80) {
      current = { heading: null, level: 0, paragraphs: [], listItems: [], links: [] };
      sections.push(current);
    }
    return current;
  };
  const append = (text: string, list = false) => {
    const cleaned = normalizeText(text);
    if (!cleaned) {
      return;
    }
    const target = section();
    if (!target) { truncated = true; return; }
    // Long paragraphs are split into exact source spans rather than losing their latter details.
    for (let offset = 0; offset < cleaned.length; offset += 4000) {
      const value = reserve(cleaned.slice(offset, offset + 4000));
      if (value) {
        (list ? target.listItems : target.paragraphs).push(value);
      }
      if (remaining <= 1) { truncated = true; break; }
    }
  };
  const captureLinks = (node: Element) => {
    const anchors = $(node).is("a[href]") ? $(node) : $(node).find("a[href]");
    anchors.each((_i, anchor) => {
      const url = safeLink($(anchor).attr("href"));
      const label = normalizeText($(anchor).text()).slice(0, 500);
      const target = section();
      if (!url || !label || !target || target.links.some((item) => item.url === url && item.label === label)) {
        return;
      }
      if (target.links.length >= 30) { truncated = true; return; }
      const value = reserve(label, 500);
      if (value) {
        target.links.push({ url, label: value });
      }
    });
  };
  const walk = (node: AnyNode) => {
    if (stopped) {
      return;
    }
    if (node.type === "text") { append(node.data); return; }
    if (node.type !== "tag") {
      return;
    }
    if (/^(?:ul|ol)$/.test(node.name)) {
      const list = $(node);
      const ownText = (element: ReturnType<CheerioAPI>) => {
        const copy = element.clone();
        copy.find("ul,ol").remove();
        return normalizeText(copy.text());
      };
      const previous = list.prev();
      const intro = list.parent().is("li") ? ownText(list.parent())
        : previous.is("p,h1,h2,h3,h4,h5,h6") ? normalizeText(previous.text()) : "";
      const items = list.children("li").slice(0, 100).map((_i, item) => ownText($(item))).get().filter(Boolean);
      if (lists.length < 50 && items.every((item) => item.length <= 4000) && intro.length <= 4000) {
        if (items.length) {
          lists.push({ heading: current?.heading ?? null, intro: intro || null, items });
        }
      } else {
        truncated = true;
      }
      if (list.children("li").length > 100) {
        truncated = true;
      }
    }
    if (/^h[1-6]$/.test(node.name)) {
      const text = normalizeText($(node).text());
      if (!text) {
        return;
      }
      if (sections.length >= 80) { truncated = true; stopped = true; return; }
      current = { heading: reserve(text, 2000) || null, level: Number(node.name[1]), paragraphs: [], listItems: [], links: [] };
      sections.push(current);
      captureLinks(node);
      return;
    }
    if (/^(?:p|li|blockquote|pre|dt|dd|td|th|figcaption|address)$/.test(node.name) && !$(node).find("h1,h2,h3,h4,h5,h6").length) {
      const own = $(node).clone();
      own.find("ul,ol").remove();
      own.find("p,div,dt,dd,tr").append("\n");
      append(own.text(), node.name === "li");
      captureLinks(node);
      // Nested list entries retain their relationship without repeating their parent's text.
      $(node).children("ul,ol").each((_i, list) => { walk(list); });
      return;
    }
    let inline = "";
    let inlineLinks: Element[] = [];
    const flush = () => {
      append(inline);
      inlineLinks.forEach(captureLinks);
      inline = "";
      inlineLinks = [];
    };
    for (const child of node.children) {
      if (child.type === "tag" && blockTags.test(child.name)) { flush(); walk(child); }
      else if (child.type === "text") {
        inline += child.data;
      } else if (child.type === "tag") { inline += $(child).text(); inlineLinks.push(child); }
    }
    flush();
  };
  root.toArray().forEach(walk);
  return { sections, lists, truncated };
}

export function sectionParts(sections: ContentSection[]): { text: string; heading?: string }[] {
  return sections.flatMap((section) => [
    ...(section.heading ? [{ text: section.heading }] : []),
    ...[...section.paragraphs, ...section.listItems, ...section.links.map((link) => link.label)]
      .map((text) => ({ text, ...(section.heading ? { heading: section.heading } : {}) })),
  ]);
}

/** Enforce the same source budget used for evidence, including a partially retained last segment. */
export function evidencedSections(sections: ContentSection[], segments: TextSegment[]): ContentSection[] {
  const texts = new Set(segments.map((segment) => segment.text));
  return sections.map((section) => ({
    ...section,
    heading: section.heading && texts.has(section.heading) ? section.heading : null,
    paragraphs: section.paragraphs.filter((text) => texts.has(text)),
    listItems: section.listItems.filter((text) => texts.has(text)),
    links: section.links.filter((link) => texts.has(link.label)),
  })).filter((section) => section.heading || section.paragraphs.length || section.listItems.length || section.links.length);
}

export interface DeclaredStyle { selector: string; declarations: string; colors: { property: string; value: string }[] }
export interface DeclaredLogo { selector: string; alt: string; url: string }

/** Source declarations only: this does not resolve the cascade, load assets, or claim rendering. */
export function captureDeclaredDesign($: CheerioAPI, safeLink: (raw: string | undefined | null) => string | null, jsonLd: unknown[] = []) {
  const styles: DeclaredStyle[] = [];
  const logos: DeclaredLogo[] = [];
  let remaining = 30000;
  let truncated = false;
  const addStyle = (selector: string, raw: string) => {
    const declarations: string[] = [];
    const colors: DeclaredStyle["colors"] = [];
    for (const match of raw.matchAll(/(?:^|;)\s*(font-family|color|background-color)\s*:\s*([^;{}]+)(?=;|$)/gi)) {
      const property = match[1].toLowerCase();
      const value = match[2].trim();
      if (!value || value.length > 500 || /url\s*\(|expression\s*\(/i.test(value)) {
        continue;
      }
      declarations.push(`${property}: ${value};`);
      if (property !== "font-family") {
        colors.push({ property, value: value.replace(/\s*!important\s*$/i, "") });
      }
    }
    const text = declarations.join(" ");
    if (!text) {
      return;
    }
    if (styles.length >= 100 || text.length + selector.length > remaining) { truncated = true; return; }
    remaining -= text.length + selector.length;
    styles.push({ selector: selector.slice(0, 500), declarations: text, colors });
  };
  $("style").slice(0, 40).each((_i, node) => {
    const css = $(node).text();
    if (css.length > 100000) {
      truncated = true;
    }
    for (const rule of css.slice(0, 100000).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      addStyle(rule[1].trim(), rule[2]);
    }
  });
  $("[style]").slice(0, 200).each((_i, node) => { addStyle(`${node.tagName}[style]`, $(node).attr("style") ?? ""); });
  $("img").slice(0, 300).each((_i, node) => {
    if (logos.length >= 20) { truncated = true; return; }
    const el = $(node);
    const alt = normalizeText(el.attr("alt") ?? "").slice(0, 500);
    const marker = `${el.attr("class") ?? ""} ${el.attr("id") ?? ""} ${alt}`;
    const url = safeLink(el.attr("src") || el.attr("data-src"));
    const ancestors = el.parents('header,nav,[role="banner"],[class],[id]');
    const context = ancestors.toArray().find((ancestor) => /^(?:header|nav)$/.test(ancestor.tagName) || $(ancestor).attr("role") === "banner" || /(?:^|[\s_-])(?:company[-_ ]?)?logo(?:$|[\s_-])/i.test(`${$(ancestor).attr("id") ?? ""} ${$(ancestor).attr("class") ?? ""}`));
    if (!context || !/logo/i.test(`${marker} ${url ?? ""} ${$(context).attr("class") ?? ""} ${$(context).attr("id") ?? ""}`)) {
      return;
    }
    if (!url || /partner|sponsor|client|favicon|brandfetch/i.test(`${marker} ${url} ${$(context).attr("class") ?? ""}`)) {
      return;
    }
    if (ancestors.toArray().some((ancestor) => /(?:^|[\s_-])(?:partners?|sponsors?|client[-_ ]?logos?|customers?)(?:$|[\s_-])/i.test(`${$(ancestor).attr("class") ?? ""} ${$(ancestor).attr("id") ?? ""}`))) {
      return;
    }
    if (el.closest('[hidden],[aria-hidden="true"]').length || el.parents().toArray().some((parent) => /display\s*:\s*none/i.test($(parent).attr("style") ?? ""))) {
      return;
    }
    const selector = `${context.tagName}${$(context).attr("role") === "banner" ? '[role="banner"]' : ""} img`;
    if (!logos.some((logo) => logo.url === url)) {
      logos.push({ selector, alt, url });
    }
  });
  // Only top-level business declarations (including @graph), never nested partner/sponsor objects.
  const visit = (value: unknown, depth = 0) => {
    if (!value || depth > 3 || logos.length >= 20) {
      return;
    }
    if (Array.isArray(value)) { value.slice(0, 30).forEach((item) => { visit(item, depth + 1); }); return; }
    if (typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    if (record["@graph"]) {
      visit(record["@graph"], depth + 1);
    }
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    const type = types.find((item) => typeof item === "string" && /^(?:Organization|LocalBusiness|Corporation|ProfessionalService|AccountingService|LegalService|MedicalBusiness|Store|Restaurant)$/.test(item));
    if (!type || typeof record.url !== "string") {
      return;
    }
    const companyUrl = safeLink(record.url);
    const pageUrl = safeLink("/");
    if (!companyUrl || !pageUrl || new URL(companyUrl).hostname !== new URL(pageUrl).hostname) {
      return;
    }
    const image = typeof record.logo === "string" ? record.logo : record.logo && typeof record.logo === "object" ? (record.logo as Record<string, unknown>).url ?? (record.logo as Record<string, unknown>).contentUrl : null;
    const url = typeof image === "string" ? safeLink(image) : null;
    if (!url || /favicon|brandfetch/i.test(url)) {
      return;
    }
    const alt = typeof record.name === "string" ? normalizeText(record.name).slice(0, 500) : "";
    if (!logos.some((logo) => logo.url === url)) {
      logos.push({ selector: `jsonld:${type}/logo`, alt, url });
    }
  };
  jsonLd.slice(0, 30).forEach((value) => { visit(value); });
  return { styles, logos, truncated };
}
