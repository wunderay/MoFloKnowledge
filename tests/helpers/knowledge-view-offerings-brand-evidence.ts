// Provenance fixtures for the item-level evidence tests of Business Offerings and
// Brand Identity: claims of every origin on individual list items, and coverage
// reasons on empty, partial and contested fields. A draft and its saved snapshot
// carry the same claims. Checked against the schemas and validateProvenance in
// knowledge-view-offerings-brand-evidence-fixtures.test.ts.
import { createEmptyProvenance, type Business } from "../../src/contracts";
import { SNAPSHOT_ID, draftFrom, snapshotFrom } from "./knowledge-view-fixtures";
import { brandBusiness, offeringsBusiness } from "./knowledge-view-offerings-brand-fixtures";

const ACTOR = "00000000-0000-4000-8000-0000000a0001";
export const SOURCE_ID = "00000000-0000-4000-8000-0000000a5001";
export const EVIDENCE_ID = "00000000-0000-4000-8000-0000000a5002";
const source = {
  id: SOURCE_ID,
  url: "https://www.harborandpine.example/brand",
  title: "Harbor & Pine brand page",
  author: null,
  site_name: "Harbor & Pine",
  published_on: null,
  retrieved_at: "2026-10-10T12:00:00.000Z",
};
const evidence = [
  { id: EVIDENCE_ID, source_page_id: SOURCE_ID, kind: "text" as const, excerpt: "Our offerings, logos, colors and typefaces.", technical: null },
];

export type Origin = "source_backed" | "inferred" | "user_provided";
export interface Coverage {
  target: string;
  status: "found" | "partial" | "conflict" | "not_checked" | "not_found";
  reason: string | null;
}
interface Mark { target: (b: Business) => string | null; origin: Origin }

const OB = "/branding_and_style";
const off = (b: Business, i: number) => (b.offerings[i] ? `/offerings/@${b.offerings[i].id}` : null);
const brandItem = (list: "logos" | "brand_colors" | "fonts", i: number, leaf: string): Mark["target"] =>
  (b) => (b.branding_and_style[list][i] ? `${OB}/${list}/@${b.branding_and_style[list][i].id}/${leaf}` : null);
const offeringLeaf = (i: number, leaf: string): Mark["target"] => (b) => (off(b, i) ? `${off(b, i)}/${leaf}` : null);
/** The claims every fixture carries (a target that does not exist in a variant is skipped). */
export const MARKS: Record<string, Mark> = {
  // Offering 1: a user-corrected feature and source-backed wording.
  o1Name: { target: offeringLeaf(0, "name"), origin: "source_backed" },
  o1Feature: {
    target: (b) => (b.offerings[0]?.features[1] ? `${off(b, 0)}/features/@${b.offerings[0].features[1].id}/text` : null),
    origin: "user_provided",
  },
  o1Raw: { target: offeringLeaf(0, "pricing/raw"), origin: "source_backed" },
  // Offering 2: historical inference on its description.
  o2Description: { target: offeringLeaf(1, "description"), origin: "inferred" },
  // Brand: a source-backed primary and a user-corrected second item in each list.
  logo1: { target: brandItem("logos", 0, "url"), origin: "source_backed" },
  logo2: { target: brandItem("logos", 1, "url"), origin: "user_provided" },
  color1: { target: brandItem("brand_colors", 0, "hex"), origin: "source_backed" },
  color2: { target: brandItem("brand_colors", 1, "hex"), origin: "user_provided" },
  font1: { target: brandItem("fonts", 0, "family"), origin: "source_backed" },
  font2: { target: brandItem("fonts", 1, "family"), origin: "user_provided" },
};

export const REASONS = {
  description: "Only the homepage describes this offering.",
  noPricing: "No price appears on the pages that were checked.",
  noFeatures: "The product page was only partly captured.",
  noType: "No page classifies this offering.",
  logos: "The logo files could not all be downloaded.",
  noColors: "No brand guide was assessed.",
  noFonts: "No typeface declaration was found in the stylesheets.",
};

export interface ObEvidenceOptions {
  /** Edit the business before provenance is built. */
  business?: (b: Business) => void;
  coverage?: (b: Business) => Coverage[];
  marks?: string[];
}
export const defaultCoverage = (b: Business): Coverage[] => [
  { target: `${off(b, 0)}/description`, status: "partial" as const, reason: REASONS.description },
  { target: `${off(b, 3)}/pricing`, status: "not_found" as const, reason: REASONS.noPricing },
  { target: `${off(b, 3)}/features`, status: "partial" as const, reason: REASONS.noFeatures },
  { target: `${off(b, 3)}/offering_type`, status: "not_checked" as const, reason: REASONS.noType },
  { target: `${OB}/logos`, status: "partial" as const, reason: REASONS.logos },
  { target: `${OB}/brand_colors`, status: "not_checked" as const, reason: REASONS.noColors },
  { target: `${OB}/fonts`, status: "not_found" as const, reason: REASONS.noFonts },
];

export function buildObEvidence(opts: ObEvidenceOptions = {}) {
  const business = offeringsBusiness();
  business.branding_and_style = brandBusiness().branding_and_style;
  opts.business?.(business);
  const draft = draftFrom(business);
  const brandingEntry = draft.entries.find((e) => e.kind === "branding_and_style")!;
  const claims = (opts.marks ?? Object.keys(MARKS))
    .map((key) => ({ key, target: MARKS[key].target(business), origin: MARKS[key].origin }))
    .filter((m): m is { key: string; target: string; origin: Origin } => m.target !== null)
    .map((m, i) => {
      const offering = business.offerings.find((o) => m.target.startsWith(`/offerings/@${o.id}/`));
      const user = m.origin === "user_provided";
      return {
        id: `00000000-0000-4000-8000-0000000a6${String(i).padStart(3, "0")}`,
        entry_id: offering ? offering.id : brandingEntry.id,
        targets: [m.target],
        origin: m.origin,
        evidence_ids: user ? [] : [EVIDENCE_ID],
        based_on_claim_ids: [] as string[],
        actor_id: user ? ACTOR : null,
        authored_at: user ? "2026-10-11T09:00:00.000Z" : null,
        note: user ? "Corrected by the owner." : null,
      };
    });
  const coverage = (opts.coverage ?? defaultCoverage)(business).map((c) => ({ targets: [c.target], status: c.status, job_id: null, reason: c.reason }));
  for (const entry of draft.entries) {
    const own = claims.filter((c) => c.entry_id === entry.id);
    const root = entry.kind === "offering" ? `/offerings/@${entry.id}` : `/${entry.kind}`;
    entry.provenance = {
      ...createEmptyProvenance(),
      sources: own.some((c) => c.evidence_ids.length) ? [source] : [],
      evidence: own.some((c) => c.evidence_ids.length) ? evidence : [],
      claims: own,
      coverage: coverage.filter((c) => c.targets[0].startsWith(root)),
    } as never;
  }
  draft.citationContext = { claims, evidence, sources: [source] } as never;
  const snapshot = () => {
    const payload = snapshotFrom(draft);
    payload.provenance.sources = [source];
    payload.provenance.evidence = evidence;
    payload.provenance.claims = claims as never;
    payload.provenance.coverage = coverage as never;
    return { payload, versionId: SNAPSHOT_ID };
  };
  return { business, draft, claims, coverage, evidence, sources: [source], snapshot };
}
