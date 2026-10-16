import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";

/** Explicit labels only: semantic categories are never guessed from prose. */
export function visibleCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
): FieldCandidate[] {
  const result: FieldCandidate[] = [];
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
        if (value && value.length <= 4000)
          add(field, collection ? [{ text: value }] : value, [segment.id]);
      }
      const founding = /^(?:Founded|Established)\s*(?::|in)?\s*(\d{4})(?:\b|$)/i.exec(line);
      if (founding) {
        const year = Number(founding[1]);
        if (year >= 1000 && year <= new Date().getUTCFullYear())
          add("/company_foundation/year_founded", year, [segment.id]);
      }
    }
  }
  // A homepage description is published overview metadata; inner-page descriptions often describe a single service.
  if (new URL(page.capture.finalUrl).pathname === "/") {
    const description = observations.find((o) => o.property === "meta-description");
    if (description?.value)
      add("/company_foundation/overview", description.value, [], [description.id]);
  }
  for (const address of observations.filter((o) => o.property === "address" && o.value))
    add("/company_foundation/main_address", {
      label: null, raw: address.value, line1: null, line2: null,
      city: null, region: null, postal_code: null, country: null,
    }, [], [address.id]);
  // The site explicitly categorizes these URLs beneath services/products/offerings.
  // Link labels supply only names: their destinations and marketing copy are never paraphrased.
  for (const link of page.capture.links) {
    if (!/\/(?:services|products|offerings)\/[^/]+\/?$/i.test(new URL(link.url).pathname) ||
        new URL(link.url).hostname !== new URL(page.capture.finalUrl).hostname ||
        !link.label || link.label.length > 200 ||
        /^(?:learn more|read more|view|details|contact|click here|get started|book now)$/i.test(link.label)) continue;
    const href = observations.find((o) => o.property === "href" && o.value === link.url);
    const label = observations.find((o) => o.property === "anchor-label" && o.value === link.label && o.asset_url === link.url);
    if (href && label) {
      add("/offerings/@id/name", link.label, [], [href.id, label.id], link.url);
      add("/offerings/@id/url", link.url, [], [href.id, label.id], link.url);
      if (link.url === page.capture.finalUrl) {
        const description = observations.find((o) => o.property === "meta-description" && o.value);
        if (description) add("/offerings/@id/description", description.value, [],
          [href.id, label.id, description.id], link.url);
      }
    }
  }
  const blocks = page.capture.observations.offeringBlocks;
  if (Array.isArray(blocks))
    for (const block of blocks.slice(0, 30) as {
      name?: unknown; description?: unknown; url?: unknown;
    }[]) {
      if (typeof block.name !== "string" || !block.name || block.name.includes("|")) continue;
      const nameSegment = page.capture.segments.find((s) => s.text.includes(block.name as string));
      if (!nameSegment) continue;
      const entity = typeof block.url === "string" && block.url !== page.capture.finalUrl &&
        page.capture.links.some((link) => link.url === block.url) ? block.url :
        `${page.capture.finalUrl}|${block.name}|${nameSegment.id}`;
      add("/offerings/@id/name", block.name, [nameSegment.id], [], entity);
      if (typeof block.description === "string" && block.description) {
        const source = page.capture.segments.find((s) => s.text.includes(block.description as string));
        if (source) add("/offerings/@id/description", block.description, [source.id], [], entity);
      }
      if (typeof block.url === "string" && page.capture.links.some((link) => link.url === block.url)) {
        const observed = observations.find((o) => o.property === "href" && o.value === block.url);
        if (observed) add("/offerings/@id/url", block.url, [], [observed.id], entity);
      }
    }
  return result;
}
