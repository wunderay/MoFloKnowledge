import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { normalizeText } from "./segments";

type SafeLink = (raw: string | undefined | null) => string | null;
type Node = Cheerio<AnyNode>;

interface MetaTag { attribute: "name" | "property" | "itemprop" | "http-equiv"; name: string; content: string }
interface LinkRel { rel: string; href: string; hreflang?: string; type?: string; sizes?: string }
interface StructuredItem { type: string | null; vocab?: string; props: Record<string, string[]> }
interface Breadcrumb { source: "json-ld" | "html"; items: { name: string; url: string | null }[] }

export interface PageMetadata {
  htmlLang: string | null;
  metaTags: MetaTag[];
  linkRels: LinkRel[];
  microdata: StructuredItem[];
  rdfa: StructuredItem[];
  mailtoLinks: { value: string; text: string }[];
  telLinks: { value: string; text: string }[];
  breadcrumbs: Breadcrumb[];
  labelValuePairs: { label: string; value: string; source: "dl" | "table" }[];
  times: { datetime: string; text: string }[];
  images: { src: string; alt: string }[];
  embeds: { provider: "youtube" | "vimeo"; url: string }[];
}

/** Caps for each list, plus the bound on the serialized size of all new keys together. */
const METADATA_CAPS = {
  metaTags: 200,
  linkRels: 100,
  microdata: 50,
  rdfa: 50,
  propsPerItem: 40,
  valuesPerProp: 10,
  mailtoLinks: 20,
  telLinks: 20,
  breadcrumbs: 5,
  breadcrumbItems: 20,
  labelValuePairs: 100,
  times: 50,
  images: 50,
  embeds: 20,
  valueLength: 1000,
  totalBytes: 150000,
} as const;

const secretName = /(?:csrf|xsrf|token|nonce|secret|passw|api[-_.]?key|access[-_.]?key|session|signature|credential|authorization)/i;
const secretValue = /(?:\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/;
const signedParam = /sig|signature|token|key|credential|policy/i;
const wantedRels = new Set(["canonical", "alternate", "icon", "shortcut", "apple-touch-icon", "apple-touch-icon-precomposed", "manifest", "me", "author"]);
const chrome = 'nav,footer,aside,[role="navigation"],[role="contentinfo"],[role="complementary"],script,style,noscript,template,svg,canvas,[hidden],[aria-hidden="true"]';

const clean = (text: string | undefined, max: number = METADATA_CAPS.valueLength): string =>
  normalizeText(text ?? "").slice(0, max);
const safeValue = (text: string): string => (secretValue.test(text) ? "" : text);

function embedFor(url: string): { provider: "youtube" | "vimeo"; url: string } | null {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    return { provider: "youtube", url };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    return { provider: "vimeo", url };
  }
  return null;
}

/** Verbatim, bounded page metadata read from the raw document (not from rendered state). */
export function capturePageMetadata(
  $: CheerioAPI,
  checkedLink: SafeLink,
  jsonLd: unknown[],
): { metadata: PageMetadata; truncated: boolean; oversized: boolean } {
  const caps = METADATA_CAPS;
  // Stored URLs lose query parameters that look like credentials or signatures.
  const safeLink: SafeLink = (raw) => {
    const link = checkedLink(raw);
    if (!link) {
      return null;
    }
    const url = new URL(link);
    for (const key of [...url.searchParams.keys()]) {
      if (secretName.test(key) || signedParam.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.href;
  };
  let truncated = false;
  const cap = <T>(items: T[], max: number): T[] => {
    if (items.length > max) {
      truncated = true;
    }
    return items.slice(0, max);
  };
  const scan = (selector: string, root: Node | CheerioAPI = $, max = 1000): Element[] =>
    (root === $ ? $(selector) : (root as Node).find(selector)).slice(0, max).toArray() as Element[];
  const inert = (node: Element) => $(node).closest("script,style,noscript,template").length > 0;

  const htmlLang = clean($("html").first().attr("lang"), 35) || null;

  const metaTags: MetaTag[] = [];
  for (const node of scan("meta")) {
    if (inert(node)) {
      continue;
    }
    for (const attribute of ["name", "property", "itemprop", "http-equiv"] as const) {
      const name = clean($(node).attr(attribute), 200);
      const content = $(node).attr("content");
      if (!name || content === undefined || secretName.test(name)) {
        continue;
      }
      const value = safeValue(clean(content));
      if (value) {
        metaTags.push({ attribute, name, content: value });
      }
    }
  }

  const linkRels: LinkRel[] = [];
  for (const node of scan("link[rel][href]")) {
    const rels = clean($(node).attr("rel"), 200).toLowerCase().split(" ").filter((rel) => wantedRels.has(rel));
    const href = safeLink($(node).attr("href"));
    if (!rels.length || !href || inert(node)) {
      continue;
    }
    const rel = rels.includes("shortcut") && rels.includes("icon") ? "icon" : rels[0] ?? "";
    const hreflang = clean($(node).attr("hreflang"), 35);
    const type = clean($(node).attr("type"), 100);
    const sizes = clean($(node).attr("sizes"), 100);
    linkRels.push({ rel, href, ...(hreflang ? { hreflang } : {}), ...(type ? { type } : {}), ...(sizes ? { sizes } : {}) });
  }

  const scalar = (node: Element): string => {
    const el = $(node);
    const tag = node.tagName.toLowerCase();
    const attr = (name: string) => el.attr(name);
    if (tag === "meta") {
      return clean(attr("content"));
    }
    if (tag === "a" || tag === "link" || tag === "area") {
      return safeLink(attr("href")) ?? "";
    }
    if (["img", "source", "audio", "video", "iframe", "embed"].includes(tag)) {
      return safeLink(attr("src")) ?? "";
    }
    if (tag === "time") {
      return clean(attr("datetime") ?? el.text());
    }
    if (["data", "meter"].includes(tag) && attr("value") !== undefined) {
      return clean(attr("value"));
    }
    return clean(el.text());
  };
  const flatten = (
    scopes: Element[],
    scopeSelector: string,
    propSelector: string,
    propName: (node: Element) => string[],
    typeOf: (node: Element) => string | null,
    value: (node: Element) => string,
    vocabOf?: (node: Element) => string,
  ): StructuredItem[] => {
    const items: StructuredItem[] = [];
    for (const scope of scopes) {
      if (inert(scope)) {
        continue;
      }
      const props: Record<string, string[]> = {};
      let count = 0;
      for (const node of scan(propSelector, $(scope), 400)) {
        if ($(node).parent().closest(scopeSelector)[0] !== scope || inert(node)) {
          continue;
        }
        for (const name of propName(node)) {
          const text = safeValue(value(node));
          if (!text || secretName.test(name)) {
            continue;
          }
          if (!(name in props)) {
            if (count >= caps.propsPerItem) {
              truncated = true;
              continue;
            }
            count++;
            props[name] = [];
          }
          const list = props[name];
          if (list && list.length < caps.valuesPerProp && !list.includes(text)) {
            list.push(text);
          } else if (list && list.length >= caps.valuesPerProp) {
            truncated = true;
          }
        }
      }
      const type = typeOf(scope);
      if (type || Object.keys(props).length) {
        const vocab = vocabOf?.(scope);
        items.push({ type, ...(vocab ? { vocab } : {}), props });
      }
    }
    return items;
  };
  const names = (attribute: string) => (node: Element): string[] =>
    clean($(node).attr(attribute), 400).split(" ").filter(Boolean).map((name) => name.slice(0, 200));
  const microdata = cap(
    flatten(scan("[itemscope]"), "[itemscope]", "[itemprop]", names("itemprop"), (node) => clean($(node).attr("itemtype"), 400) || null, scalar),
    caps.microdata,
  );
  const rdfaValue = (node: Element): string => {
    const el = $(node);
    const explicit = el.attr("content") ?? el.attr("datetime");
    if (explicit !== undefined) {
      return clean(explicit);
    }
    const resource = el.attr("resource") ?? el.attr("href") ?? el.attr("src");
    return resource !== undefined && !el.text().trim() ? (safeLink(resource) ?? "") : clean(el.text());
  };
  const rdfa = cap(
    flatten(
      scan("[typeof]"),
      "[typeof]",
      "[property]",
      names("property"),
      (node) => clean($(node).attr("typeof"), 400) || null,
      rdfaValue,
      (node) => clean($(node).closest("[vocab]").attr("vocab"), 300),
    ),
    caps.rdfa,
  );

  const contact = (scheme: "mailto" | "tel", valueMax: number) => {
    const found: { value: string; text: string }[] = [];
    for (const node of scan(`a[href^="${scheme}:" i]`)) {
      if (inert(node)) {
        continue;
      }
      // Drop any query (subject/body) and decode; only the address or number is kept.
      let raw = ($(node).attr("href") ?? "").slice(scheme.length + 1).split("?")[0] ?? "";
      try {
        raw = decodeURIComponent(raw);
      } catch {
        // Keep the undecoded value.
      }
      const value = clean(raw, valueMax);
      if (value && !found.some((item) => item.value === value)) {
        found.push({ value, text: clean($(node).text(), 300) });
      }
    }
    return found;
  };
  const mailtoLinks = cap(contact("mailto", 254), caps.mailtoLinks);
  const telLinks = cap(contact("tel", 64), caps.telLinks);

  const breadcrumbs: Breadcrumb[] = [];
  const crumbItems = (list: unknown): Breadcrumb["items"] => {
    if (!Array.isArray(list)) {
      return [];
    }
    const out: Breadcrumb["items"] = [];
    for (const entry of list as unknown[]) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const inner = record.item && typeof record.item === "object" ? (record.item as Record<string, unknown>) : null;
      const name = clean(typeof record.name === "string" ? record.name : typeof inner?.name === "string" ? inner.name : "");
      const rawUrl = typeof record.item === "string" ? record.item : typeof inner?.["@id"] === "string" ? inner["@id"] : typeof record.url === "string" ? record.url : null;
      if (name) {
        out.push({ name, url: safeLink(rawUrl) });
      }
    }
    return out;
  };
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 6) {
      return;
    }
    if (Array.isArray(value)) {
      (value as unknown[]).slice(0, 100).forEach((entry) => { visit(entry, depth + 1); });
      return;
    }
    const record = value as Record<string, unknown>;
    const type = record["@type"];
    if (type === "BreadcrumbList" || (Array.isArray(type) && type.includes("BreadcrumbList"))) {
      const sorted = Array.isArray(record.itemListElement)
        ? [...(record.itemListElement as unknown[])].sort((a, b) => Number((a as Record<string, unknown> | null)?.position ?? 0) - Number((b as Record<string, unknown> | null)?.position ?? 0))
        : [];
      const items = crumbItems(sorted);
      if (items.length) {
        breadcrumbs.push({ source: "json-ld", items: cap(items, caps.breadcrumbItems) });
      }
    }
    if (record["@graph"]) {
      visit(record["@graph"], depth + 1);
    }
  };
  visit(jsonLd, 0);
  for (const node of scan('nav[aria-label*="breadcrumb" i],[role="navigation"][aria-label*="breadcrumb" i],ol[class*="breadcrumb" i],ul[class*="breadcrumb" i],nav[class*="breadcrumb" i]', $, 20)) {
    if (inert(node) || $(node).parents('[aria-label*="breadcrumb" i],[class*="breadcrumb" i]').length) {
      continue;
    }
    const entries = $(node).find("li");
    const items = (entries.length ? entries.toArray() : $(node).find("a").toArray()).slice(0, caps.breadcrumbItems + 1).flatMap((entry) => {
      const name = clean($(entry).text(), 300);
      const anchor = entry.tagName.toLowerCase() === "a" ? $(entry) : $(entry).find("a[href]").first();
      return name ? [{ name, url: safeLink(anchor.attr("href")) }] : [];
    });
    if (items.length) {
      breadcrumbs.push({ source: "html", items: cap(items, caps.breadcrumbItems) });
    }
  }
  const trails = cap(breadcrumbs, caps.breadcrumbs);

  // Main content only: page chrome, hidden nodes and repeated site banners are excluded.
  const body = $("body").clone();
  body.find(chrome).remove();
  body.find("header").not("article header,main header").remove();
  const main = body.find("main").first().length ? body.find("main").first() : body.find("article").first().length ? body.find("article").first() : body;

  const pairs: PageMetadata["labelValuePairs"] = [];
  for (const dl of scan("dl", main, 100)) {
    let label: string | null = null;
    for (const child of $(dl).children().toArray().slice(0, 400)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "dt") {
        label = clean($(child).text(), 200);
      } else if (tag === "dd" && label) {
        const value = safeValue(clean($(child).text()));
        if (value) {
          pairs.push({ label, value, source: "dl" });
        }
      }
    }
  }
  for (const table of scan("table", main, 100)) {
    const rows = $(table).find("> tr, > tbody > tr, > thead > tr").toArray().slice(0, 200);
    const simple = rows.length > 0 && !$(table).find("table").length &&
      rows.every((row) => $(row).children("th,td").length === 2 && !$(row).children("[colspan],[rowspan]").length);
    if (!simple) {
      continue;
    }
    for (const row of rows) {
      const [left, right] = $(row).children("th,td").toArray();
      const label = clean($(left).text(), 200);
      const value = safeValue(clean($(right).text()));
      if (label && value) {
        pairs.push({ label, value, source: "table" });
      }
    }
  }

  const times = cap(
    scan("time[datetime]", main).flatMap((node) => {
      const datetime = clean($(node).attr("datetime"), 64);
      return datetime ? [{ datetime, text: clean($(node).text(), 300) }] : [];
    }),
    caps.times,
  );

  const images = cap(
    scan("img", main).flatMap((node) => {
      const src = safeLink($(node).attr("src") ?? $(node).attr("data-src"));
      return src ? [{ src, alt: clean($(node).attr("alt"), 500) }] : [];
    }),
    caps.images,
  );

  const embeds: PageMetadata["embeds"] = [];
  for (const node of scan("iframe,embed,video,video source")) {
    if ($(node).closest("script,style,noscript,template").length) {
      continue;
    }
    const url = safeLink($(node).attr("src") ?? $(node).attr("data-src"));
    const embed = url ? embedFor(url) : null;
    if (embed && !embeds.some((item) => item.url === embed.url)) {
      embeds.push(embed);
    }
  }

  const metadata: PageMetadata = {
    htmlLang,
    metaTags: cap(metaTags, caps.metaTags),
    linkRels: cap(linkRels, caps.linkRels),
    microdata,
    rdfa,
    mailtoLinks,
    telLinks,
    breadcrumbs: trails,
    labelValuePairs: cap(pairs, caps.labelValuePairs),
    times,
    images,
    embeds: cap(embeds, caps.embeds),
  };
  // Bound the total: drop the tail of the largest list until the serialized size fits.
  let oversized = false;
  const listKeys = Object.keys(metadata).filter((key) => Array.isArray(metadata[key as keyof PageMetadata])) as (keyof PageMetadata)[];
  while (Buffer.byteLength(JSON.stringify(metadata), "utf8") > caps.totalBytes) {
    oversized = true;
    const largest = listKeys
      .map((key) => ({ key, size: JSON.stringify(metadata[key]).length, length: (metadata[key] as unknown[]).length }))
      .filter((entry) => entry.length > 0)
      .sort((a, b) => b.size - a.size)[0];
    if (!largest) {
      break;
    }
    const list = metadata[largest.key] as unknown[];
    list.length = Math.floor(list.length / 2);
  }
  return { metadata, truncated, oversized };
}
