import { load } from "cheerio";
import { normalizeUrl } from "../network/url-scope";
import {
  hashCapture,
  makeSegments,
  normalizeText,
  type TextSegment,
} from "./segments";
import type { RenderResult } from "../../contracts/render-task";
import { capturePageMetadata } from "./metadata";
import { captureCards, captureNavGroups } from "./listings";
import { captureContentSections, captureDeclaredDesign, evidencedSections, sectionParts } from "./sections";
export interface PageCapture {
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
  links: { url: string; label: string }[];
  requiresRender: boolean;
  truncated: boolean;
}
export function captureHtml(
  input: {
    requestedUrl: string;
    finalUrl: string;
    body: Buffer | string;
    redirects?: string[];
  },
  rendered?: RenderResult,
): PageCapture {
  const html = Buffer.isBuffer(input.body)
    ? input.body.toString("utf8")
    : input.body;
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) {
    throw new Error("HTML capture exceeds decoded limit");
  }
  const $ = load(html);
  const hasExecutableScripts = $("script")
    .toArray()
    .some((node) => {
      const type = ($(node).attr("type") ?? "").trim().toLowerCase();
      return (
        type === "" ||
        type === "module" ||
        /^(?:application|text)\/(?:java|ecma)script$/.test(type)
      );
    });
  const meta = (name: string): string | null => {
    if (rendered?.metadata) {
      return (
        rendered.metadata.meta
          .find((item) => item.name.toLowerCase() === name)
          ?.content.trim() || null
      );
    }
    return (
      $(`meta[name="${name}"],meta[property="${name}"]`)
        .first()
        .attr("content")
        ?.trim() || null
    );
  };
  const title =
    normalizeText(
      rendered?.metadata
        ? (rendered.metadata.title ?? "")
        : $("title").first().text(),
    ) || null;
  const jsonLd: unknown[] = [];
  const metadataLimitations = new Set<string>();
  const parseJsonLd = (text: string) => {
    if (text.length > 50000) {
      metadataLimitations.add("Structured metadata exceeded the capture limit.");
      return;
    }
    try {
      jsonLd.push(JSON.parse(text));
    } catch {
      // Keep a fixed limitation, never source payloads or parser error excerpts.
      metadataLimitations.add("Some structured metadata could not be parsed.");
    }
  };
  if (rendered?.metadata) {
    if (rendered.metadata.jsonLd.length > 30) {
      metadataLimitations.add("Structured metadata exceeded the capture limit.");
    }
    rendered.metadata.jsonLd.slice(0, 30).forEach(parseJsonLd);
  } else {
    const scripts = $('script[type="application/ld+json"]');
    if (scripts.length > 30) {
      metadataLimitations.add("Structured metadata exceeded the capture limit.");
    }
    scripts.slice(0, 30).each((_i, node) => { parseJsonLd($(node).text()); });
  }
  const effectiveUrl = normalizeUrl(rendered?.finalUrl ?? input.finalUrl);
  const safeLink = (raw: string | undefined | null): string | null => {
    try {
      return raw ? normalizeUrl(raw, effectiveUrl) : null;
    } catch {
      return null;
    }
  };
  const canonical = rendered?.metadata
    ? safeLink(rendered.metadata.canonical)
    : safeLink($('link[rel="canonical"]').first().attr("href"));
  const declaredDesign = captureDeclaredDesign($, safeLink, jsonLd);
  const content = captureContentSections($, safeLink);
  // Read before page chrome and embeds are stripped below; identical for fetched and rendered pages.
  const pageMetadata = capturePageMetadata($, safeLink, jsonLd);
  $(
    'script,style,noscript,template,svg,canvas,iframe,object,embed,[hidden],[aria-hidden="true"],input[type="hidden"]',
  ).remove();
  $("[style]").each((_i, node) => {
    if (
      /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(
        $(node).attr("style") ?? "",
      )
    ) {
      $(node).remove();
    }
  });
  // Long server-rendered copy does not establish that a required client section is ready.
  // Inspect only bounded structural placeholders; ordinary scripts alone do not trigger rendering.
  const clientRoot = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body");
  const requiresClientSection =
    !rendered &&
    hasExecutableScripts &&
    clientRoot
      .find(
        "section,div,article,[aria-busy],[data-client],[data-hydrate],[data-reactroot]",
      )
      .slice(0, 300)
      .toArray()
      .some((node) => {
        const element = $(node);
        const content = normalizeText(element.text());
        const marker = [
          element.attr("id") ?? "",
          element.attr("class") ?? "",
          element.attr("data-section") ?? "",
          element.attr("data-component") ?? "",
        ]
          .join(" ")
          .replace(/([a-z])([A-Z])/g, "$1 $2");
        const requiredRegion =
          /(?:^|[\s_-])(?:faq|questions?|answers?|team|pricing|products?|services?|contact|locations?|content|app|root)(?:$|[\s_-])/i.test(
            marker,
          );
        const explicitClient =
          element.attr("aria-busy") === "true" ||
          element.attr("data-client") !== undefined ||
          element.attr("data-hydrate") !== undefined ||
          element.attr("data-reactroot") !== undefined;
        const loading =
          /^(?:loading\b[^.!?]{0,100}(?:\.{1,3}|…)?|please wait(?:\.{1,3}|…)?|fetching\b[^.!?]{0,100}(?:\.{1,3}|…)?)$/i.test(
            content,
          );
        return (
          content.length <= 120 &&
          (loading ||
            (content.length === 0 && (requiredRegion || explicitClient)))
        );
      });
  const headings =
    rendered?.headings?.map(({ level, text }) => ({ level, text })) ??
    $("h1,h2,h3,h4,h5,h6")
      .slice(0, 200)
      .map((_i, node) => ({
        level: Number(node.tagName.slice(1)),
        text: normalizeText($(node).text()).slice(0, 2000),
      }))
      .get();
  const links: { url: string; label: string }[] = [];
  if (rendered?.links) {
    for (const link of rendered.links) {
      const url = safeLink(link.url);
      if (url) {
        links.push({ url, label: normalizeText(link.label).slice(0, 500) });
      }
    }
  } else {
    $("a[href]")
      .slice(0, 500)
      .each((_i, node) => {
        const url = safeLink($(node).attr("href"));
        if (url) {
          links.push({
            url,
            label: normalizeText($(node).text()).slice(0, 500),
          });
        }
      });
  }
  // Keep the closest unambiguous local form context, including CMS div wrappers.
  const formContext = (node: Parameters<typeof $>[0]) => {
    let region = $(node);
    let heading: string | null = null;
    let context: string | null = null;
    const form = $(node);
    const local = (candidate: Parameters<typeof $>[0]) => {
      const element = $(candidate);
      if (element.closest('nav,aside,footer,header,[role="navigation"],[role="contentinfo"],[role="complementary"]').length) {
        return false;
      }
      // Sibling sections and recommendation cards cannot describe this form.
      if (element.closest("section,article,main")[0] !== form.closest("section,article,main")[0]) {
        return false;
      }
      return !element.parents("[class],[id]").toArray().some((ancestor) =>
        /(?:^|[\s_-])(?:related|recommended|recommendations?|cookie|consent)(?:$|[\s_-])/i.test(`${$(ancestor).attr("class") ?? ""} ${$(ancestor).attr("id") ?? ""}`) &&
        !$(ancestor).find("form").toArray().some((nestedForm) => nestedForm === form[0]));
    };
    for (let depth = 0; depth < 5 && region.length && !region.is("body,html,main,article"); depth++, region = region.parent()) {
      if (region.find("form").length > 1) {
        break;
      }
      const headings = region.find("h1,h2,h3,h4,h5,h6").filter((_i, heading) => local(heading));
      if (!heading && headings.length === 1) {
        heading = normalizeText(headings.text()).slice(0, 2000) || null;
      }
      const paragraphs = region.find("p").filter((_i, paragraph) => local(paragraph) && !$(paragraph).closest("form").length);
      if (!context && paragraphs.length === 1) {
        const text = normalizeText(paragraphs.text());
        if (text.length <= 2000) {
          context = text || null;
        }
      }
      if ((heading && context) || region.is("section")) {
        break;
      }
    }
    return { heading, context };
  };
  const forms =
    rendered?.forms?.map(({ action, method, labels }) => ({
      action: safeLink(action),
      method,
      labels,
      heading: null as string | null,
      submitLabels: [] as string[],
    })) ??
    $("form")
      .slice(0, 40)
      .map((_i, node) => ({
        action: safeLink($(node).attr("action")),
        method: ($(node).attr("method") ?? "GET").toUpperCase(),
        labels: $(node)
          .find("label")
          .map((_j, label) => normalizeText($(label).text()).slice(0, 500))
          .get()
          .slice(0, 30),
        ...formContext(node),
        submitLabels: $(node).find('button:not([type]),button[type="submit"],input[type="submit"]')
          .slice(0, 20).map((_j, submit) => normalizeText($(submit).text() || $(submit).attr("value") || "").slice(0, 500)).get().filter(Boolean),
      }))
      .get();
  const ctas =
    rendered?.ctas?.map(({ label, destination }) => ({
      label,
      destination: safeLink(destination),
    })) ??
    $('button,a[role="button"],input[type="submit"]')
      .slice(0, 100)
      .map((_i, node) => ({
        label: normalizeText(
          $(node).text() || $(node).attr("value") || "",
        ).slice(0, 500),
        destination: safeLink($(node).attr("href")),
      }))
      .get();
  const addresses =
    rendered?.addresses?.map((item) => item.text) ??
    $('address,[itemprop="address"]')
      .slice(0, 30)
      .map((_i, node) => normalizeText($(node).text()).slice(0, 2000))
      .get();
  const priceText =
    rendered?.priceText?.map((item) => item.text) ??
    $('[itemprop="price"],[class*="price"],[class*="pricing"]')
      .slice(0, 40)
      .map((_i, node) => normalizeText($(node).text()).slice(0, 2000))
      .get();
  // Named cards beneath an explicit services/products heading are declarations, not a prose classifier.
  // Capture only direct card headings and their own paragraph; unrelated links remain ordinary links.
  const offeringBlocks: { name: string; description: string | null; url: string | null }[] = [];
  if (!rendered) {
    $("h1,h2").slice(0, 100).each((_i, heading) => {
      if (!/^(?:our\s+)?(?:services|products|offerings)(?:\s+(?:and|&)\s+(?:services|products))?$/i.test(normalizeText($(heading).text()))) {
        return;
      }
      const container = $(heading).closest("section,article");
      const region = container.length ? container : $(heading).parent();
      region.find("h3,h4").slice(0, 30).each((_j, node) => {
        const name = normalizeText($(node).text());
        if (!name || name.length > 200) {
          return;
        }
        const card = $(node).closest("article,li").length
          ? $(node).closest("article,li") : $(node).parent();
        // Several headings in one wrapper do not establish which paragraph belongs to this name.
        const paragraph = card.find("h3,h4").length === 1
          ? card.find("p").first() : $(node).next("p");
        const description = normalizeText(paragraph.text()).slice(0, 4000) || null;
        const anchor = $(node).find("a[href]").first().length
          ? $(node).find("a[href]").first()
          : card.find("h3,h4").length === 1 ? card.find("a[href]").first() : $(node).next("a[href]");
        const url = safeLink(anchor.attr("href"));
        if (url && new URL(url).hostname !== new URL(effectiveUrl).hostname) {
          return;
        }
        if (!offeringBlocks.some((item) => item.name === name && item.url === url)) {
          offeringBlocks.push({ name, description, url });
        }
      });
    });
  }
  const navGroups = (rendered ? [] : captureNavGroups($)).map((group) => ({
    parent: group.parent,
    links: group.links.flatMap((item) => {
      const url = safeLink(item.url);
      return url ? [{ url, label: item.label }] : [];
    }),
  }));
  // Exclude repeated page chrome, retaining selected visible observations as exact source segments below.
  $('nav,footer,[role="navigation"],header').remove();
  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body");
  const catalogueCards = rendered ? [] : captureCards($, root);
  root.find("br").replaceWith("\n");
  root.find("p,div,section,li,h1,h2,h3,h4,h5,h6,tr").append("\n");
  const mainParts = (rendered ? rendered.text : root.text())
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean);
  const observedParts = [
    ...headings.map((item) => item.text),
    ...links.map((item) => item.label),
    ...forms.flatMap((item) => item.labels),
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- String() on loosely typed content values is intentional; the values are scalars at runtime
    ...forms.flatMap((item) => [item.heading ?? "", ...("context" in item ? [String(item.context ?? "")] : []), ...item.submitLabels]),
    ...content.lists.flatMap((item) => [item.intro ?? "", ...item.items]),
    ...ctas.map((item) => item.label),
    ...addresses,
    ...priceText,
  ]
    .map(normalizeText)
    .filter(Boolean);
  // Keep section text first so structural claims always have exact retained segment evidence.
  const seenParts = new Set<string>();
  const parsed = makeSegments(
    [...sectionParts(content.sections), ...mainParts.map((text) => ({ text })), ...observedParts.map((text) => ({ text }))]
      .filter((part) => !seenParts.has(part.text) && !!seenParts.add(part.text)),
  );
  const limitations = [...new Set([...(rendered?.limitations ?? []), ...metadataLimitations])];
  if (content.truncated) {
    limitations.push("Content sections exceeded the structural capture limit.");
  }
  if (declaredDesign.truncated) {
    limitations.push("HTML design declarations exceeded the capture limit.");
  }
  if (pageMetadata.truncated) {
    limitations.push("Structured page metadata exceeded a capture limit.");
  }
  if (pageMetadata.oversized) {
    limitations.push("Structured page metadata exceeded the capture size limit and was truncated.");
  }
  if (
    parsed.truncated &&
    !limitations.includes("Captured text exceeded the source segment limit.")
  ) {
    limitations.push("Captured text exceeded the source segment limit.");
  }
  const observations: Record<string, unknown> = {
    headings,
    contentSections: evidencedSections(content.sections, parsed.segments),
    contentLists: content.lists.filter((list) => list.items.every((item) => parsed.segments.some((segment) => segment.text === item)))
      .map((list) => ({ ...list, heading: list.heading && parsed.segments.some((segment) => segment.text === list.heading) ? list.heading : null, intro: list.intro && parsed.segments.some((segment) => segment.text === list.intro) ? list.intro : null })),
    declaredStyles: declaredDesign.styles,
    declaredLogos: declaredDesign.logos,
    offeringBlocks,
    navGroups,
    catalogueCards,
    clientSectionDetected: requiresClientSection,
    jsonLd,
    ...pageMetadata.metadata,
    metaDescription: meta("description") ?? meta("og:description"),
    canonical,
    redirects: input.redirects ?? [],
    forms: forms.map((form) => ({
      ...form,
      heading: form.heading && parsed.segments.some((segment) => segment.text === form.heading) ? form.heading : null,
      ...("context" in form ? { context: form.context && parsed.segments.some((segment) => segment.text === form.context) ? form.context : null } : {}),
    })),
    ctas,
    addresses,
    priceText,
    socialLinks: links.filter((link) =>
      /\b(?:linkedin|twitter|x|facebook|instagram|youtube|tiktok)\.com$/.test(
        new URL(link.url).hostname,
      ),
    ),
    ...(rendered ? { design: rendered } : {}),
    limitations: limitations.slice(0, 100),
  };
  const finalized = {
    normalizedUrl: normalizeUrl(input.requestedUrl),
    finalUrl: effectiveUrl,
    title,
    author: meta("author"),
    publisher: meta("publisher") ?? meta("og:site_name"),
    publishedAt: meta("article:published_time"),
    updatedAt: meta("article:modified_time"),
    ...parsed,
    observations,
    links,
    requiresRender:
      requiresClientSection ||
      parsed.text.length < 200 ||
      /enable javascript|javascript is required/i.test(parsed.text),
  };
  return { ...finalized, contentHash: hashCapture(finalized) };
}
export function shouldRenderPage(
  capture: PageCapture,
  isHomepage: boolean,
  requiresClientSection = false,
): boolean {
  return isHomepage || capture.requiresRender || requiresClientSection;
}
