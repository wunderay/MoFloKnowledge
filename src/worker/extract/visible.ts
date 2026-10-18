import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";
import { serviceTextCandidates } from "./services-text";
import { parseEmployeeCount } from "./text";

/** Explicit labels only: semantic categories are never guessed from prose. */
export function visibleCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
): FieldCandidate[] {
  const result: FieldCandidate[] = serviceTextCandidates(page, observations);
  const add = (field: string, value: unknown, segment_ids: string[],
    observation_ids: string[] = [], entity_key: string | null = null) => {
    result.push({ field, value, entity_key, origin: "source_backed",
      segment_ids, observation_ids, supporting_fields: [], note: null });
  };
  const labels: [RegExp, string, boolean][] = [
    [/^Industry\s*:\s*(.+)$/i, "/company_foundation/industry", false],
    [/^Business model\s*:\s*(.+)$/i, "/company_foundation/business_model", false],
    [/^Company pitch\s*:\s*(.+)$/i, "/positioning/company_pitch", false],
    [/^Target buyers\s*:\s*(.+)$/i, "/market_and_customers/target_buyers", true],
    [/^Service locations\s*:\s*(.+)$/i, "/company_foundation/service_locations", true],
  ];
  for (const segment of page.capture.segments) {
    // Anchoring each line prevents an unrelated paragraph containing a label from being reclassified.
    for (const line of segment.text.split("\n")) {
      for (const [pattern, field, collection] of labels) {
        const value = pattern.exec(line)?.[1]?.trim();
        if (value && value.length <= 4000) {
          add(field, collection ? [{ text: value }] : value, [segment.id]);
        }
      }
      const employee = /^Employee count\s*:\s*(.+)$/i.exec(line)?.[1]?.trim();
      if (employee && employee.length <= 4000) {
        add("/company_foundation/employee_count", parseEmployeeCount(employee), [segment.id]);
      }
      const founding = /^(?:Founded|Established)\s*(?::|in)?\s*(\d{4})(?:\b|$)/i.exec(line) ??
        /^Since\s+(\d{4})\.?$/i.exec(line);
      if (founding) {
        const year = Number(founding[1]);
        if (year >= 1000 && year <= new Date().getUTCFullYear()) {
          add("/company_foundation/year_founded", year, [segment.id]);
        }
      }
    }
  }
  // A homepage description is published overview metadata; inner-page descriptions often describe a single service.
  if (new URL(page.capture.finalUrl).pathname === "/") {
    const description = observations.find((o) => o.property === "meta-description");
    if (description?.value) {
      add("/company_foundation/overview", description.value, [], [description.id]);
    }
  }
  for (const address of observations.filter((o) => o.property === "address" && o.value)) {
    add("/company_foundation/main_address", {
      label: null, raw: address.value, line1: null, line2: null,
      city: null, region: null, postal_code: null, country: null,
    }, [], [address.id]);
  }
  // A named profile page must independently agree in its title and visible heading.
  // Copy only a role explicitly in that title, or a separate exact role heading.
  const profileTitle = page.capture.title &&
    /^(.+?)\s+[-—–|]\s+.+?\s+(Co-Founder|Founder|CEO|Chief Executive Officer|Owner|President|Director)$/i.exec(page.capture.title);
  const profileName = profileTitle?.[1].trim() ?? page.capture.title;
  const roleHeadings = observations.filter((o) => o.property === "heading" &&
    /^(?:Co-Founder|Founder|CEO|Chief Executive Officer|Owner|President|Director)$/i.test(o.value ?? ""));
  const roleHeading = roleHeadings.length === 1 ? roleHeadings[0] : undefined;
  const profileRole = profileTitle?.[2] ?? roleHeading?.value;
  const nameSlug = profileName ? encodeURIComponent(profileName.toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")) : null;
  const pageSlug = new URL(page.capture.finalUrl).pathname.replace(/\/$/, "").split("/").at(-1);
  if (profileName && profileRole && (profileTitle || pageSlug?.toLowerCase() === nameSlug?.toLowerCase()) && /\/(?:team|people|staff|about-us|about)\/[^/]+\/?$/i.test(new URL(page.capture.finalUrl).pathname) &&
      !observations.some((o) => /\/@type(?:\/\d+)?$/.test(o.property ?? "") && /^(?:https?:\/\/schema\.org\/)?Person$/.test(o.value ?? ""))) {
    const name = profileName;
    const heading = observations.find((o) => o.property === "heading" &&
      (o.value === name || o.value?.startsWith(name + ",")));
    const source = page.capture.segments.find((s) => s.text.includes(name));
    const title = observations.find((o) => o.property === "page-title" && o.value === page.capture.title);
    if (heading && source && title && !name.includes("|") && (profileTitle || roleHeading?.id !== heading.id)) {
      const entity = `${page.capture.finalUrl}|${name}|${source.id}`;
      const cited = [title.id, heading.id, ...(!profileTitle && roleHeading ? [roleHeading.id] : [])];
      add("/key_people/@id/name", name, [source.id], cited, entity);
      add("/key_people/@id/title", profileRole, [source.id], cited, entity);
      const description = observations.find((o) => o.property === "meta-description" && o.value?.includes(name));
      if (description) {
        add("/key_people/@id/background_or_relevance", description.value,
        [source.id], [description.id], entity);
      }
    }
  }
  return result;
}
