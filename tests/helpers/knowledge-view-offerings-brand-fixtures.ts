// Fixtures for the Business Offerings and Brand Identity acceptance tests.
// Same fictional company as the other view tests (Harbor & Pine Coffee Roasters).
// Valid fixtures satisfy DraftResponseSchema / KnowledgeBaseExportSchema (checked in
// knowledge-view-offerings-brand-fixtures.test.ts). The "hostile" builders break the
// schema on purpose (a javascript: logo URL, a non-hex colour, a font without a
// family) to prove the view stays safe against data the schema would normally reject.
import { createEmptyProvenance, type Business, type EntryProvenance } from "../../src/contracts";
import {
  SNAPSHOT_ID,
  buildBusiness,
  draftFrom,
  snapshotFrom,
  type Draft,
} from "./knowledge-view-fixtures";

const id = (n: number) => `00000000-0000-4000-8000-00000ff${n.toString(16).padStart(5, "0")}`;
const ft = (n: number, text: string) => ({ id: id(0x5000 + n), text });

export type Pricing = NonNullable<Business["offerings"][number]["pricing"]>;
const pricing = (p: Partial<Pricing> & Pick<Pricing, "kind" | "raw">): Pricing => ({
  amount: null,
  min_amount: null,
  max_amount: null,
  currency: null,
  billing_interval: null,
  pricing_model: null,
  qualifications: [],
  as_of: null,
  ...p,
});

export const OFFERING_IDS = [id(0x100), id(0x101), id(0x102), id(0x103)] as const;
export const SECOND_OFFERING_FEATURES = ["Weekly roasting schedule", "On-site barista training"];
export const OFFERINGS: Business["offerings"] = [
  {
    id: OFFERING_IDS[0],
    name: "Monthly Single-Origin Subscription",
    description: "A fresh bag of our featured single-origin coffee each month, roasted to order and shipped within two days.",
    offering_type: "Subscription",
    category: "Coffee",
    features: [ft(1, "Roasted to order"), ft(2, "Free shipping over forty dollars"), ft(3, "Pause or skip any month")],
    pricing: pricing({
      kind: "paid",
      raw: "$18 per bag, billed monthly",
      amount: "18.00",
      currency: "USD",
      billing_interval: "month",
      pricing_model: "Recurring subscription",
    }),
    url: "https://www.harborandpine.example/subscribe",
    images: [],
  },
  {
    id: OFFERING_IDS[1],
    name: "Wholesale Cafe Program",
    description: "Weekly fresh-roasted supply for independent cafes with flexible minimums and barista training.",
    offering_type: "Wholesale",
    category: "Coffee",
    features: SECOND_OFFERING_FEATURES.map((t, i) => ft(10 + i, t)),
    pricing: pricing({
      kind: "contact_for_pricing",
      raw: "Contact us for wholesale pricing",
      pricing_model: "Volume-tiered quote",
    }),
    url: "https://www.harborandpine.example/wholesale",
    images: [],
  },
  {
    id: OFFERING_IDS[2],
    name: "Saturday Roasting Workshop",
    description: "A hands-on two-hour class in the Wharf Street roastery.",
    offering_type: "Class",
    category: null,
    features: [],
    pricing: pricing({ kind: "free", raw: "Free for subscribers" }),
    url: null,
    images: [],
  },
  {
    // No name, no type, no features, no pricing: only a description.
    id: OFFERING_IDS[3],
    name: null,
    description: "A seasonal gift box with three small-lot coffees and a tasting card.",
    offering_type: null,
    category: null,
    features: [],
    pricing: null,
    url: null,
    images: [],
  },
];

/** The standard business, with the four offerings above replacing its single one. */
export function offeringsBusiness(offerings: Business["offerings"] = OFFERINGS): Business {
  const b = buildBusiness();
  b.offerings = structuredClone(offerings);
  return b;
}
export const offeringsDraft = (offerings?: Business["offerings"]) => draftFrom(offeringsBusiness(offerings));
export const offeringsSnapshot = (draft: Draft = offeringsDraft()) => ({ payload: snapshotFrom(draft), versionId: SNAPSHOT_ID });

/** A company with the standard data and no offerings at all. */
export const noOfferingsDraft = () => draftFrom(offeringsBusiness([]));

export const offeringAddHref = (companyId: string) => `/knowledge/view?companyId=${companyId}&category=offering`;
export const brandingAddHref = (companyId: string) => `/knowledge/view?companyId=${companyId}&category=branding_and_style`;

// ---- Brand Identity ------------------------------------------------------------
const BASE = "https://cdn.harborandpine.example/brand";
type Branding = Business["branding_and_style"];
export const LOGOS: Branding["logos"] = [
  { id: id(0x200), url: `${BASE}/logo-wordmark.svg`, variant: "Horizontal wordmark", kind: "company_logo" },
  { id: id(0x201), url: `${BASE}/logo-stacked.png`, variant: "Stacked lockup", kind: "company_logo" },
  { id: id(0x202), url: `${BASE}/logo-mark.png`, variant: null, kind: "company_logo" },
];
const color = (n: number, hex: string, apparent_role: string | null) => ({
  id: id(0x300 + n),
  hex,
  alpha: 1,
  apparent_role,
  classification: "brand_guide_confirmed" as const,
});
export const COLORS: Branding["brand_colors"] = [
  color(0, "#1F4E79", null), // Primary
  color(1, "#C8553D", "Roast red"), // its own name
  color(2, "#F2E8CF", null), // Tertiary
  color(3, "#386641", null), // Color 4
  color(4, "#A7C957", null), // Color 5
];
const font = (n: number, family: string, apparent_use: string | null) => ({
  id: id(0x400 + n),
  family,
  apparent_use,
  observations: [] as ("css_declared" | "resource_loaded" | "computed_family")[],
  brand_confirmed: true,
});
export const FONTS: Branding["fonts"] = [
  font(0, "Fraunces", "Headings"),
  font(1, "Inter", "Body text"),
  font(2, "IBM Plex Mono", null),
];

export function brandBusiness(parts: Partial<Pick<Branding, "logos" | "brand_colors" | "fonts">> = {}): Business {
  const b = buildBusiness();
  b.branding_and_style.logos = structuredClone(parts.logos ?? LOGOS);
  b.branding_and_style.brand_colors = structuredClone(parts.brand_colors ?? COLORS);
  b.branding_and_style.fonts = structuredClone(parts.fonts ?? FONTS);
  return b;
}
export const brandDraft = (parts?: Parameters<typeof brandBusiness>[0]) => draftFrom(brandBusiness(parts));
export const brandSnapshot = (draft: Draft = brandDraft()) => ({ payload: snapshotFrom(draft), versionId: SNAPSHOT_ID });
export const emptyBrandDraft = () => brandDraft({ logos: [], brand_colors: [], fonts: [] });

/** `count` schema-valid colours with distinct hex values and no names. */
export function manyColors(count: number): Branding["brand_colors"] {
  return Array.from({ length: count }, (_, i) =>
    color(0x10 + i, `#${(0x10 + i * 13).toString(16).toUpperCase().padStart(2, "0")}${(0xe0 - i * 9).toString(16).toUpperCase().padStart(2, "0")}${(0x20 + i * 7).toString(16).toUpperCase().padStart(2, "0")}`, null),
  );
}

// ---- evidence: claims the product could hold, for a draft and its snapshot ---------
export const SOURCE_ID = "00000000-0000-4000-8000-0000000a3001";
export const EVIDENCE_ID = "00000000-0000-4000-8000-0000000a3002";
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
  { id: EVIDENCE_ID, source_page_id: SOURCE_ID, kind: "text" as const, excerpt: "Our brand colors, logos and typefaces.", technical: null },
];
interface Claim { entry: string; target: string }
/** One source-backed claim per card, on the first offering and on the brand lists. */
export function evidenceTargets(business: Business): Claim[] {
  const o = business.offerings[0];
  const br = business.branding_and_style;
  const at = (path: string) => `/offerings/@${o.id}/${path}`;
  return [
    { entry: o.id, target: at("name") },
    { entry: o.id, target: at("offering_type") },
    { entry: o.id, target: at("description") },
    { entry: o.id, target: at(`features/@${o.features[0].id}/text`) },
    { entry: o.id, target: at("pricing/raw") },
    { entry: o.id, target: at("pricing/pricing_model") },
    { entry: "branding", target: `/branding_and_style/logos/@${br.logos[0].id}/url` },
    { entry: "branding", target: `/branding_and_style/brand_colors/@${br.brand_colors[0].id}/hex` },
    { entry: "branding", target: `/branding_and_style/fonts/@${br.fonts[0].id}/family` },
  ];
}

export function evidenceFixture() {
  const business = offeringsBusiness();
  const brand = brandBusiness();
  business.branding_and_style = brand.branding_and_style;
  const draft = draftFrom(business);
  const brandingEntry = draft.entries.find((e) => e.kind === "branding_and_style")!;
  const targets = evidenceTargets(business);
  const claims = targets.map((t, i) => ({
    id: `00000000-0000-4000-8000-0000000a4${String(i).padStart(3, "0")}`,
    entry_id: t.entry === "branding" ? brandingEntry.id : t.entry,
    targets: [t.target],
    origin: "source_backed" as const,
    evidence_ids: [EVIDENCE_ID],
    based_on_claim_ids: [] as string[],
    actor_id: null,
    authored_at: null,
    note: null,
  }));
  for (const entry of draft.entries) {
    const own = claims.filter((c) => c.entry_id === entry.id);
    entry.provenance = {
      ...createEmptyProvenance(),
      sources: own.length ? [source] : [],
      evidence: own.length ? evidence : [],
      claims: own,
    } as EntryProvenance as never;
  }
  draft.citationContext = { claims, evidence, sources: [source] } as never;
  const snapshot = () => {
    const payload = snapshotFrom(draft);
    payload.provenance.sources = [source];
    payload.provenance.evidence = evidence;
    payload.provenance.claims = claims as never;
    return { payload, versionId: SNAPSHOT_ID };
  };
  return { business, draft, claims, evidence, sources: [source], snapshot };
}

// ---- hostile data (schema-invalid on purpose) -----------------------------------
export const HOSTILE = {
  jsLogo: "javascript:alert(document.cookie)",
  dataLogo: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
  badHex: 'red;background:url(https://evil.example/pixel.gif)',
  scriptHex: '#abc"><script>alert(1)</script>',
};
