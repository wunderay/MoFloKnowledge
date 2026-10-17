// Fixtures for the /knowledge/view reference-layout acceptance tests.
// The company is deliberately NOT the product owner's: "Harbor & Pine Coffee
// Roasters". The business data is adapted from the validated visual-harness
// fixture; provenance is left empty because the layout tests assert on values,
// not on citations. Shapes are checked against DraftResponseSchema and
// KnowledgeBaseExportSchema in the test file itself.
import {
  createEmptyBusiness,
  createEmptyProvenance,
  type Business,
  type EntryKind,
  KnowledgeBaseExportSchema,
  type KnowledgeBaseExport,
} from "../../src/contracts";

export const COMPANY_ID = "00000000-0000-4000-8000-0000000c0001";
export const EMPTY_COMPANY_ID = "00000000-0000-4000-8000-0000000c0002";
export const SNAPSHOT_ID = "00000000-0000-4000-8000-0000000d0002";
export const OLDER_SNAPSHOT_ID = "00000000-0000-4000-8000-0000000d0001";
export const ACTOR = "00000000-0000-4000-8000-0000000a0001";
export const COMPANY_NAME = "Harbor & Pine Coffee Roasters";
export const SITE = "https://www.harborandpine.example";
const NOW = "2026-10-12T15:04:05.000Z";

let counter = 0x1000;
const uid = (): string =>
  `00000000-0000-4000-8000-${(counter++).toString(16).padStart(12, "0")}`;
const t = (text: string) => ({ id: uid(), text });
const ts = (...texts: string[]) => texts.map(t);
const address = (
  label: string,
  line1: string,
  line2: string | null,
  city: string,
  region: string,
  postal: string,
) => ({
  id: uid(),
  label,
  raw: [line1, line2, `${city}, ${region} ${postal}`, "USA"]
    .filter(Boolean)
    .join(", "),
  line1,
  line2,
  city,
  region,
  postal_code: postal,
  country: "US",
});

export const OVERVIEW =
  "Harbor & Pine Coffee Roasters is an independent specialty coffee roaster on the Portland, Maine waterfront. We source traceable, small-lot beans from farms we have visited, roast them in 15-kilo batches, and ship them fresh to homes, cafés and offices across New England and beyond.";
export const FOUNDING_STORY =
  "Maya Okafor and Tomas Lindqvist met at a Portland dock-side coffee cart in 2013. In 2014 they bought a secondhand 5-kilo roaster, set it up in a boatyard shed on Wharf Street, and sold their first bags at the Saturday farmers market.";
export const PITCH =
  "Coffee with a coastline in it. Harbor & Pine roasts small lots of traceable beans every week, so every cup tastes like the farm it came from.";
export const BUSINESS_MODEL =
  "Direct-to-consumer subscriptions and online sales, wholesale supply to cafés and offices, a flagship café on Wharf Street, and hands-on roasting workshops.";

export function buildBusiness(): Business {
  counter = 0x2000;
  const b = createEmptyBusiness();
  Object.assign(b.company_foundation, {
    overview: OVERVIEW,
    website: SITE,
    industry: "Specialty coffee roasting and retail",
    business_model: BUSINESS_MODEL,
    company_role: ts("Coffee roaster", "Wholesale supplier", "Café operator"),
    year_founded: 2014,
    legal_entity_type: "Limited Liability Company (LLC)",
    employee_count: {
      raw: "38 employees",
      exact: 38,
      min: null,
      max: null,
      as_of: "2026-03-01",
    },
    main_address: address(
      "Roastery & flagship café",
      "212 Wharf Street",
      "Suite 4",
      "Portland",
      "ME",
      "04101",
    ),
    other_locations: [
      address("Back Cove Café", "48 Baxter Boulevard", null, "Portland", "ME", "04101"),
      address("Wholesale warehouse", "9 Industrial Way", null, "Westbrook", "ME", "04092"),
    ],
    // Five on purpose: every banner count in the Customers section is distinct.
    service_locations: ts(
      "Maine",
      "New Hampshire",
      "Massachusetts",
      "Vermont",
      "Continental United States (shipping)",
    ),
    alternative_company_names: ts("Harbor & Pine", "H&P Coffee"),
  });
  Object.assign(b.positioning, {
    company_pitch: PITCH,
    founding_story: FOUNDING_STORY,
  });
  b.online_presence.social_media_links = [
    { id: uid(), platform: "Instagram", profile_url: "https://www.instagram.com/harborandpinecoffee" },
    { id: uid(), platform: "Facebook", profile_url: "https://www.facebook.com/harborandpinecoffee" },
    { id: uid(), platform: "LinkedIn", profile_url: "https://www.linkedin.com/company/harbor-and-pine-coffee-roasters" },
    { id: uid(), platform: "TikTok", profile_url: "https://www.tiktok.com/@harborandpine" },
  ] as Business["online_presence"]["social_media_links"];
  Object.assign(b.market_and_customers, {
    // 3 groupings, 4 buyers, 2 suppliers (service locations: 5, above).
    industry_groupings: ts("Specialty coffee", "Food and beverage manufacturing", "Subscription commerce"),
    target_buyers: ts(
      "Home coffee enthusiasts who buy whole beans online",
      "Independent cafés and restaurants in New England",
      "Offices and co-working spaces that stock premium coffee",
      "Gift buyers and corporate gifting teams",
    ),
    suppliers_and_partners: [
      { id: uid(), name: "Finca La Esperanza", relationship_type: "Green coffee supplier", relationship_text: "Direct-trade relationship since 2016.", url: null },
      { id: uid(), name: "Casco Bay Packaging", relationship_type: "Packaging partner", relationship_text: "Compostable bags made in Maine.", url: "https://www.cascobaypackaging.example" },
    ],
    customer_needs: ts(
      "Freshly roasted coffee with clear origin and roast-date information",
      "Reliable weekly supply with flexible wholesale ordering",
      "Barista training and equipment support",
    ),
    ideal_customer_personas: [
      { id: uid(), name: "Morning-ritual Mia", role: "Marketing manager and home brewer", organization_type: "Individual consumer", goals: ts("Taste something new every month"), pain_points: ts("Supermarket beans are stale") },
      { id: uid(), name: "Café-owner Carlos", role: "Owner of an independent café", organization_type: "Independent café", goals: ts("Serve a distinctive house espresso"), pain_points: ts("Minimum orders that are too big") },
    ],
    industry_outlook: [
      { id: uid(), text: "US specialty coffee continues to grow faster than the overall coffee category, driven by at-home premium consumption.", publisher: "Specialty Coffee Association", published_on: "2026-02-18" },
      { id: uid(), text: "Green coffee prices remain volatile, pushing roasters toward direct relationships.", publisher: "Coffee Trade Quarterly", published_on: "2026-06-03" },
    ],
    channels: [
      { id: uid(), channel_type: "Email", label: "hello@harborandpine.example", url: null },
      { id: uid(), channel_type: "Phone", label: "(207) 555-0142", url: null },
      { id: uid(), channel_type: "Contact form", label: "Wholesale enquiry form", url: `${SITE}/wholesale` },
    ],
    ctas: [
      { id: uid(), label: "Shop coffee", url: `${SITE}/shop`, purpose: "Drive first purchases" },
      { id: uid(), label: "Start a subscription", url: `${SITE}/subscribe`, purpose: "Convert visitors to recurring revenue" },
    ],
    funnels: [
      { id: uid(), name: "Subscription sign-up", steps: [
        { id: uid(), label: "Browse the monthly coffees", url: `${SITE}/shop` },
        { id: uid(), label: "Choose a plan and grind", url: `${SITE}/subscribe` },
      ] },
      { id: uid(), name: "Wholesale tasting kit", steps: [
        { id: uid(), label: "Read the wholesale overview", url: `${SITE}/wholesale` },
        { id: uid(), label: "Request a tasting kit", url: `${SITE}/wholesale/tasting-kit` },
      ] },
    ],
  });
  Object.assign(b.branding_and_style, {
    writing_style_description: "Warm, plainspoken and a little salty.",
  });
  b.key_people.push({
    id: uid(),
    name: "Maya Okafor",
    title: "Co-founder and CEO",
    role: "Leads sourcing and strategy.",
    gender: null,
    background_or_relevance: "Ten years buying green coffee.",
  } as Business["key_people"][number]);
  b.offerings.push({
    id: uid(),
    name: "Monthly Single-Origin Subscription",
    description: "A fresh bag of our featured single-origin coffee each month.",
    offering_type: "Subscription",
    category: "Coffee",
    features: ts("Roasted to order"),
    pricing: null,
    url: `${SITE}/subscribe`,
  } as Business["offerings"][number]);
  return b;
}

export type DraftEntry = {
  id: string;
  entry_id: string;
  company_id: string;
  kind: EntryKind;
  revision: number;
  current_revision: number;
  schema_version: "1.0.0";
  content: unknown;
  provenance: ReturnType<typeof createEmptyProvenance>;
  review_status: "approved" | "unreviewed" | "rejected";
  author_id: string;
  created_by: string;
  change_reason: string;
  created_at: string;
  saved_at: string;
};
export type Draft = {
  actorId: string;
  company: Record<string, unknown> & { id: string; name: string };
  draftGeneration: number;
  entries: DraftEntry[];
  sources: never[];
  citationContext: { claims: never[]; evidence: never[]; sources: never[] };
};

function draftEntry(
  companyId: string,
  kind: EntryKind,
  content: unknown,
  id: string,
  status: DraftEntry["review_status"],
): DraftEntry {
  return {
    id,
    entry_id: id,
    company_id: companyId,
    kind,
    revision: 2,
    current_revision: 2,
    schema_version: "1.0.0",
    content,
    provenance: createEmptyProvenance(),
    review_status: status,
    author_id: ACTOR,
    created_by: ACTOR,
    change_reason: "Reviewed against the captured website.",
    created_at: "2026-10-10T12:00:00.000Z",
    saved_at: NOW,
  };
}
export function companyRow(
  id: string,
  name: string,
  role: "owner" | "viewer" = "owner",
) {
  return {
    id,
    name,
    website_url: SITE,
    created_by: ACTOR,
    creation_request_id: "00000000-0000-4000-8000-0000000b0001",
    created_at: "2026-10-01T09:00:00.000Z",
    updated_at: NOW,
    archived_at: null,
    draft_generation: 7,
    next_snapshot_version: 3,
    role,
  };
}
const SINGLETON_IDS: Record<string, string> = {
  company_foundation: "00000000-0000-4000-8000-0000000e0001",
  positioning: "00000000-0000-4000-8000-0000000e0002",
  market_and_customers: "00000000-0000-4000-8000-0000000e0003",
  branding_and_style: "00000000-0000-4000-8000-0000000e0004",
  online_presence: "00000000-0000-4000-8000-0000000e0005",
};
export const FOUNDATION_ENTRY_ID = SINGLETON_IDS.company_foundation!;

/** A draft carrying the given business data, one approved entry per section. */
export function draftFrom(
  business: Business,
  opts: { companyId?: string; name?: string; role?: "owner" | "viewer" } = {},
): Draft {
  const companyId = opts.companyId ?? COMPANY_ID;
  const entries: DraftEntry[] = [
    ...(["company_foundation", "positioning", "market_and_customers", "branding_and_style", "online_presence"] as const).map(
      (kind) => draftEntry(companyId, kind, business[kind], SINGLETON_IDS[kind]!, "approved"),
    ),
    ...business.key_people.map((p) => draftEntry(companyId, "key_person", p, p.id, "approved")),
    ...business.offerings.map((o) => draftEntry(companyId, "offering", o, o.id, "approved")),
  ];
  return {
    actorId: ACTOR,
    company: companyRow(companyId, opts.name ?? COMPANY_NAME, opts.role ?? "owner"),
    draftGeneration: 7,
    entries,
    sources: [],
    citationContext: { claims: [], evidence: [], sources: [] },
  };
}
export const buildDraft = () => draftFrom(buildBusiness());

/** A company that exists but has no entries at all. */
export function buildEmptyDraft(): Draft {
  return {
    actorId: ACTOR,
    company: companyRow(EMPTY_COMPANY_ID, COMPANY_NAME),
    draftGeneration: 0,
    entries: [],
    sources: [],
    citationContext: { claims: [], evidence: [], sources: [] },
  };
}

export const VERSIONS = [
  { id: SNAPSHOT_ID, version_number: 2, created_at: "2026-10-05T10:00:00.000Z" },
  { id: OLDER_SNAPSHOT_ID, version_number: 1, created_at: "2026-09-20T10:00:00.000Z" },
];

/**
 * The saved snapshot a publication produces from a draft: only approved
 * entries contribute content (everything else keeps the section's empty
 * default, exactly as the assembler does). `rejected` entries are listed in the
 * snapshot's entry states as rejected; `absent` entries are not listed at all.
 */
export function snapshotFrom(
  draft: Draft,
  opts: { rejected?: EntryKind[]; absent?: EntryKind[] } = {},
): KnowledgeBaseExport {
  const business = createEmptyBusiness();
  const states: KnowledgeBaseExport["provenance"]["entries"] = [];
  for (const e of draft.entries) {
    const rejected = opts.rejected?.includes(e.kind) ?? false;
    const absent = opts.absent?.includes(e.kind) ?? false;
    if (!rejected && !absent) {
      if (e.kind === "key_person") business.key_people.push(e.content as never);
      else if (e.kind === "offering") business.offerings.push(e.content as never);
      else Object.assign(business, { [e.kind]: e.content });
    }
    if (!absent)
      states.push({
        entry_id: e.id,
        kind: e.kind,
        revision: e.revision,
        review_status: rejected ? "rejected" : "approved",
        author_id: ACTOR,
        saved_at: e.saved_at,
      });
  }
  return KnowledgeBaseExportSchema.parse({
    ...business,
    schema_version: "1.0.0",
    company_id: draft.company.id,
    knowledge_base_version_id: SNAPSHOT_ID,
    version: 2,
    saved_at: "2026-10-05T10:00:00.000Z",
    provenance: {
      company: { name: draft.company.name, website: SITE, snapshot_author_id: ACTOR },
      entries: states,
      sources: [],
      evidence: [],
      claims: [],
      coverage: [],
      operations: [],
    },
  });
}
