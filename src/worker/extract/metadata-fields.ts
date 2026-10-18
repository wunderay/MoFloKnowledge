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
  for (const o of observations) {
    const value = o.value?.trim();
    if (!value) {
      continue;
    }
    if ((o.property === "meta:og:site_name" || o.property === "meta:application-name") && key(value) !== hostLabel) {
      add("/company_foundation/alternative_company_names", [{ text: value }], o);
    } else if (o.property === "mailto" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      add("/market_and_customers/channels", [{ channel_type: "Email", label: value, url: null }], o);
    }
  }
  const phone = observations.find((o) => o.property === "tel" && bareTenDigitPhone(o.value ?? ""));
  if (phone?.value) {
    add("/online_presence/phone", bareTenDigitPhone(phone.value), phone);
  }
  return result;
}
