import type { StoredCapture } from "../crawl/run-crawl";
import type { TechnicalObservation } from "./types";
import type { RenderResult } from "../../contracts/render-task";
import { stableId, stripTrackingParams } from "./identity";
import type { DeclaredLogo, DeclaredStyle } from "../capture/sections";
import { structuredData } from "./structured-data";
const SITE_NAME_TAGS = ["og:site_name", "application-name"];
/** Bounded plain observations, never executable metadata or provider instructions. */
export function technicalObservations(
  page: StoredCapture,
): TechnicalObservation[] {
  const result: TechnicalObservation[] = [];
  let limited = false;
  const add = (
    selector: string | null,
    property: string,
    original: string,
    asset_url: string | null = null,
  ) => {
    if (result.length >= 1000) {
      limited = true;
      return;
    }
    let value = original
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "");
    if (value.length > 4000) {
      limited = true;
      value = value.slice(0, 4000);
    }
    const id = stableId(
      "observation",
      selector ?? "",
      property,
      value,
      asset_url ?? "",
    );
    if (!result.some((item) => item.id === id)) {
      result.push({ id, selector, property, value, asset_url });
    }
  };
  add(null, "url", page.capture.finalUrl);
  const raw = page.capture.observations;
  if (page.capture.title) {
    add(null, "page-title", page.capture.title);
  }
  if (page.capture.author) {
    add(null, "author", page.capture.author);
  }
  if (page.capture.publisher) {
    add(null, "publisher", page.capture.publisher);
  }
  if (typeof raw.metaDescription === "string") {
    add(null, "meta-description", raw.metaDescription);
  }
  const design = raw.design as RenderResult | undefined;
  if (Array.isArray(raw.declaredStyles)) {
    for (const style of (raw.declaredStyles as DeclaredStyle[]).slice(0, 100)) {
      // Static declarations are deliberately distinct from renderer-computed properties.
      add(style.selector, "stylesheet", style.declarations, page.capture.finalUrl);
      for (const color of style.colors) {
        add(style.selector, "declared-" + color.property, color.value);
      }
    }
  }
  if (Array.isArray(raw.declaredLogos)) {
    for (const logo of (raw.declaredLogos as DeclaredLogo[]).slice(0, 20)) {
      add(logo.selector, "logo", `${logo.alt} | ${logo.selector}`, logo.url);
    }
  }
  if (design) {
    for (const style of design.styles) {
      add(style.selector, "font-family", style.fontFamily);
      add(style.selector, "color", style.color);
      add(style.selector, "background-color", style.backgroundColor);
    }
    for (const sheet of design.stylesheets) {
      if (sheet.status === "available") {
        add(null, "stylesheet", sheet.declarations, sheet.url);
      }
    }
    for (const font of design.fonts) {
      if (font.loaded) {
        add(null, "font-resource", font.url, font.url);
      }
    }
    for (const logo of design.logos) {
      add(logo.context, "logo", `${logo.alt} | ${logo.context}`, logo.url);
    }
  }
  for (const link of page.capture.links) {
    add(null, "href", link.url, link.url);
    add(null, "anchor-label", link.label, link.url);
  }
  // A person's own profile is kept as a labelled observation; it is never the company's profile.
  for (const link of page.capture.links) {
    if (/^(?:www\.)?linkedin\.com$/.test(new URL(link.url).hostname) && /^\/in\/[^/]+/i.test(new URL(link.url).pathname)) {
      add(null, "personal-linkedin-profile", stripTrackingParams(link.url), link.url);
    }
  }
  const textItems = (name: string, property: string) => {
    if (Array.isArray(raw[name])) {
      for (const item of raw[name] as unknown[]) {
        if (typeof item === "string") {
          add(null, property, item);
        } else if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          add(
            "selector" in item ? String(item.selector) : null,
            property,
            item.text,
          );
        }
      }
    }
  };
  textItems("headings", "heading");
  textItems("addresses", "address");
  textItems("priceText", "price-text");
  if (Array.isArray(raw.ctas)) {
    for (const item of raw.ctas as {
      selector?: string;
      label?: string;
      destination?: string | null;
    }[]) {
      if (item.label) {
        add(
          item.selector ?? null,
          "cta-label",
          item.label,
          item.destination ?? null,
        );
      }
      if (item.destination) {
        add(item.selector ?? null, "href", item.destination, item.destination);
      }
    }
  }
  if (Array.isArray(raw.forms)) {
    for (const item of raw.forms as {
      selector?: string;
      action?: string | null;
      method?: string;
      labels?: string[];
      heading?: string | null;
      submitLabels?: string[];
    }[]) {
      for (const label of item.labels ?? []) {
        add(item.selector ?? null, "form-label", label, item.action ?? null);
      }
      if (item.heading) {
        add(item.selector ?? null, "form-heading", item.heading, item.action ?? null);
      }
      for (const label of item.submitLabels ?? []) {
        add(item.selector ?? null, "form-submit-label", label, item.action ?? null);
      }
      if (item.action) {
        add(item.selector ?? null, "form-action", item.action, item.action);
      }
      if (item.method) {
        add(item.selector ?? null, "form-method", item.method);
      }
    }
  }
  let jsonLeaves = 0;
  const visit = (value: unknown, path: string, depth = 0) => {
    if (depth > 8 || jsonLeaves >= 100) {
      limited = true;
      return;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      jsonLeaves++;
      add(null, "jsonld:" + path, String(value));
    } else if (Array.isArray(value)) {
      value
        .slice(0, 30)
        .forEach((item, index) => { visit(item, path + "/" + index, depth + 1); });
    } else if (value && typeof value === "object") {
      Object.entries(value)
        .slice(0, 50)
        .forEach(([key, item]) => { visit(item, path + "/" + key, depth + 1); });
    }
  };
  structuredData(raw).forEach((value, index) => { visit(value, String(index)); });
  // Captured metadata the extractor reads: the site's own names and its mailto/tel contact links.
  if (Array.isArray(raw.metaTags)) {
    for (const tag of raw.metaTags as { name?: unknown; content?: unknown }[]) {
      if (typeof tag.name === "string" && SITE_NAME_TAGS.includes(tag.name.toLowerCase()) && typeof tag.content === "string") {
        add(null, "meta:" + tag.name.toLowerCase(), tag.content);
      }
    }
  }
  for (const [name, property] of [["mailtoLinks", "mailto"], ["telLinks", "tel"]] as const) {
    if (Array.isArray(raw[name])) {
      for (const link of (raw[name] as { value?: unknown }[]).slice(0, 20)) {
        if (typeof link.value === "string") {
          add(null, property, link.value);
        }
      }
    }
  }
  if (limited) {
    result.push({
      id: stableId("observation-limit"),
      selector: null,
      property: "capture-limitation",
      value:
        "Structured observations were truncated by the extraction envelope budget.",
      asset_url: null,
    });
  }
  return result;
}
