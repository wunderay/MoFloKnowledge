import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";
import { bareTenDigitPhone } from "./identity";
import { nameKey as key } from "./structured";

/** The site's own declared names (og:site_name, application-name) and its mailto/tel links, verbatim. */
export function metadataCandidates(page: StoredCapture, observations: TechnicalObservation[]): FieldCandidate[] {
  const result: FieldCandidate[] = [];
  const add = (field: string, value: unknown, observed: TechnicalObservation) => {
    result.push({ field, value, entity_key: null, origin: "source_backed", segment_ids: [],
      observation_ids: [observed.id], supporting_fields: [], note: null });
  };
  const hostLabel = key(new URL(page.capture.finalUrl).hostname.replace(/^www\./, "").split(".")[0]);
  const emails = new Set<string>();
  // The title's leading segment is the brand when the footer, a logo's alt text or the H1 repeats it.
  const headings = Array.isArray(page.capture.observations.headings) ? page.capture.observations.headings as { level?: number; text?: string }[] : [];
  const phrase = (text: string) => " " + text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
  const siteText = [
    ...observations.filter((o) => ["logo", "footer-text"].includes(o.property ?? "")).map((o) => o.value ?? ""),
    ...headings.filter((h) => h.level === 1).map((h) => h.text ?? ""),
  ].map(phrase);
  const repeated = (name: string) => phrase(name).trim() !== "" && siteText.some((text) => text.includes(phrase(name)));
  const titleObservation = observations.find((o) => o.property === "page-title");
  // A page or navigation label such as "Home" names the page, not the site.
  const pageLabel = /^(?:home|welcome|about|about us|contact|contact us|services|blog)$/i;
  const brand = titleObservation?.value?.split(/\s+[|\-–]\s+|\s*[|:]\s+/).map((part) => part.trim())
    .find((part) => key(part) && !pageLabel.test(part) && repeated(part)) ?? null;
  if (brand && titleObservation) {
    add("/company_foundation/alternative_company_names", [{ text: brand }], titleObservation);
  }
  for (const o of observations) {
    const value = o.value?.trim();
    if (!value) {
      continue;
    }
    // A site name of a person followed by descriptors (long and repeated nowhere on the page) is not the brand.
    const person = value.split(/\s+/).length > 3 && !repeated(value);
    if ((o.property === "meta:og:site_name" || o.property === "meta:application-name") && key(value) !== hostLabel &&
      !person && key(value) !== key(brand ?? "")) {
      add("/company_foundation/alternative_company_names", [{ text: value }], o);
    } else if (o.property === "mailto" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !emails.has(value.toLowerCase())) {
      emails.add(value.toLowerCase());
      add("/market_and_customers/channels", [{ channel_type: "Email", label: value, url: null }], o);
    }
  }
  const phone = observations.find((o) => o.property === "tel" && bareTenDigitPhone(o.value ?? ""));
  if (phone?.value) {
    add("/online_presence/phone", bareTenDigitPhone(phone.value), phone);
  }
  return result;
}
