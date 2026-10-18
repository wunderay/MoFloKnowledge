// Provenance fixtures for the evidence tests: a draft and a saved snapshot that
// carry the same sources, exact excerpts, origins and coverage notes. The claims
// follow the field registry (see knowledge-view-evidence-fixtures.test.ts), so
// they describe provenance the product could really hold.
import { createEmptyProvenance, type Business } from "../../src/contracts";
import {
  SNAPSHOT_ID,
  buildBusiness,
  draftFrom,
  snapshotFrom,
} from "./knowledge-view-fixtures";

export const SOURCE_ID = "00000000-0000-4000-8000-0000000a1001";
export const SOURCE_URL = "https://www.harborandpine.example/about-us";
export const EXCERPT = "We are an independent specialty coffee roaster on the Portland waterfront.";
export const OLD_EXCERPT = "Historical wording for the pitch.";
export const INFERRED_EXCERPT = "Wholesale accounts and gift buyers are mentioned on the orders page.";
const ACTOR = "00000000-0000-4000-8000-0000000a0001";
const EVIDENCE = {
  overview: "00000000-0000-4000-8000-0000000a1002",
  pitch: "00000000-0000-4000-8000-0000000a1003",
  inferred: "00000000-0000-4000-8000-0000000a1004",
};

const source = {
  id: SOURCE_ID,
  url: SOURCE_URL,
  title: "About Harbor & Pine",
  author: null,
  site_name: "Harbor & Pine",
  published_on: null,
  retrieved_at: "2026-10-10T12:00:00.000Z",
};
const evidence = [
  { id: EVIDENCE.overview, source_page_id: SOURCE_ID, kind: "text" as const, excerpt: EXCERPT, technical: null },
  { id: EVIDENCE.pitch, source_page_id: SOURCE_ID, kind: "text" as const, excerpt: OLD_EXCERPT, technical: null },
  { id: EVIDENCE.inferred, source_page_id: SOURCE_ID, kind: "text" as const, excerpt: INFERRED_EXCERPT, technical: null },
];

export type Origin = "source_backed" | "inferred" | "generated" | "user_provided";
/** A claim about one value: `target` is built from the business so it can name an item by id. */
export interface Mark { target: (b: Business) => string; origin: Origin }
export interface Coverage {
  target: string;
  status: "found" | "partial" | "conflict" | "not_checked" | "not_found";
  reason: string | null;
}
export interface EvidenceOptions {
  /** Edit the business before provenance is built (e.g. empty a field). */
  business?: (b: Business) => void;
  /** Item-level claims added to the base ones. */
  marks?: Mark[];
  /** Replaces DEFAULT_COVERAGE. */
  coverage?: Coverage[];
}

export const REASONS = {
  partial: "Only the homepage was checked.",
  conflict: "The homepage and a press page name different industries.",
  notFound: "No founding story appears on the pages that were checked.",
  notChecked: "No supplier page was assessed.",
};
export const DEFAULT_COVERAGE: Coverage[] = [
  { target: "/company_foundation/business_model", status: "partial", reason: REASONS.partial },
  { target: "/company_foundation/industry", status: "conflict", reason: REASONS.conflict },
  { target: "/positioning/founding_story", status: "not_found", reason: REASONS.notFound },
  { target: "/market_and_customers/suppliers_and_partners", status: "not_checked", reason: REASONS.notChecked },
];

/** Refill what evidenceBusiness empties, for fixtures that need every list populated. */
export function refillLists(b: Business) {
  const full = buildBusiness();
  b.positioning.founding_story = full.positioning.founding_story;
  b.market_and_customers.suppliers_and_partners = full.market_and_customers.suppliers_and_partners;
  b.market_and_customers.customer_needs = full.market_and_customers.customer_needs;
}

/** The default business: founding story, suppliers and customer needs are empty. */
export function evidenceBusiness(): Business {
  const b = buildBusiness();
  b.positioning.founding_story = null;
  b.market_and_customers.suppliers_and_partners = [];
  b.market_and_customers.customer_needs = [];
  return b;
}

let counter = 0;
const claimId = () => `00000000-0000-4000-8000-0000000a2${String(++counter).padStart(3, "0")}`;

export function buildEvidence(opts: EvidenceOptions = {}) {
  counter = 0;
  const business = evidenceBusiness();
  opts.business?.(business);
  const draft = draftFrom(business);
  const entryOf = (kind: string) => draft.entries.find((e) => e.kind === kind)!.id;
  const overviewClaim = claimId();
  const base = (target: string, kind: string, origin: Origin, basedOn: string[] = []) => {
    const id = target === "/company_foundation/overview" ? overviewClaim : claimId();
    const evidenceIds =
      origin === "user_provided"
        ? []
        : [target === "/positioning/company_pitch" ? EVIDENCE.pitch : target === "/company_foundation/overview" ? EVIDENCE.overview : EVIDENCE.inferred];
    return {
      id,
      entry_id: entryOf(kind),
      targets: [target],
      origin,
      evidence_ids: evidenceIds,
      based_on_claim_ids: basedOn,
      actor_id: origin === "user_provided" ? ACTOR : null,
      authored_at: origin === "user_provided" ? "2026-10-11T09:00:00.000Z" : null,
      note: origin === "user_provided" ? "Corrected by the owner." : null,
    };
  };
  const kindOf = (target: string) => target.split("/")[1];
  const claims = [
    base("/company_foundation/overview", "company_foundation", "source_backed"),
    // Generated wording must rest on supporting fact claims (here the overview's).
    base("/positioning/company_pitch", "positioning", "generated", [overviewClaim]),
    ...(opts.marks ?? []).map((mark) => {
      const target = mark.target(business);
      return base(target, kindOf(target), mark.origin, mark.origin === "generated" ? [overviewClaim] : []);
    }),
  ];
  const coverage = (opts.coverage ?? DEFAULT_COVERAGE).map((c) => ({ targets: [c.target], status: c.status, job_id: null, reason: c.reason }));
  for (const entry of draft.entries) {
    const mine = (target: string) => kindOf(target) === entry.kind;
    const own = claims.filter((c) => mine(c.targets[0]));
    const used = new Set(own.flatMap((c) => c.evidence_ids));
    const items = evidence.filter((e) => used.has(e.id));
    entry.provenance = {
      ...createEmptyProvenance(),
      sources: items.length ? [source] : [],
      evidence: items,
      claims: own,
      coverage: coverage.filter((c) => mine(c.targets[0])),
    } as never;
  }
  // Like the real draft, a lookup of every cited claim, excerpt and source rides along.
  draft.citationContext = { claims, evidence, sources: [source] } as never;
  // Built on demand: a snapshot must satisfy the export schema (UUID ids), a draft need not.
  const snapshot = () => {
    const payload = snapshotFrom(draft);
    payload.provenance.sources = [source];
    payload.provenance.evidence = evidence;
    payload.provenance.claims = claims as never;
    payload.provenance.coverage = coverage as never;
    return { payload, versionId: SNAPSHOT_ID };
  };
  return {
    business,
    draft: draft,
    get snapshot() {
      return snapshot();
    },
    claims,
    evidence,
    sources: [source],
    coverage,
  };
}

export const evidenceDraft = (opts?: EvidenceOptions) => buildEvidence(opts).draft;
export const evidenceSnapshot = (opts?: EvidenceOptions) => buildEvidence(opts).snapshot;

// ---- item markers: one registry-allowed claim per list field -----------------
const item = (b: Business, field: string, index: number): string =>
  (b as unknown as Record<string, Record<string, { id: string }[]>>)[field.split("/")[0]][field.split("/")[1]][index].id;
const at = (field: string, index: number, leaf: string): Mark["target"] =>
  (b) => `/${field}/@${item(b, field, index)}/${leaf}`;

/** Every list field with a claim target and an origin its field allows. */
export const ITEM_MARKS = [
  { card: "Buyers", section: "Customers & Industry", field: "market_and_customers/target_buyers", leaf: "text", origin: "inferred", label: "Historical inferred" },
  { card: "Suppliers", section: "Customers & Industry", field: "market_and_customers/suppliers_and_partners", leaf: "name", origin: "user_provided", label: "User correction" },
  { card: "Industry groupings", section: "Customers & Industry", field: "market_and_customers/industry_groupings", leaf: "text", origin: "inferred", label: "Historical inferred" },
  { card: "Service locations", section: "Customers & Industry", field: "company_foundation/service_locations", leaf: "text", origin: "user_provided", label: "User correction" },
  { card: "Company role", section: "Customers & Industry", field: "company_foundation/company_role", leaf: "text", origin: "inferred", label: "Historical inferred" },
  { card: "Industry outlook", section: "Customers & Industry", field: "market_and_customers/industry_outlook", leaf: "text", origin: "user_provided", label: "User correction" },
  { card: "Alternate names", section: "General Info", field: "company_foundation/alternative_company_names", leaf: "text", origin: "user_provided", label: "User correction" },
  { card: "Headquarters", section: "General Info", field: "company_foundation/other_locations", leaf: "raw", origin: "user_provided", label: "User correction" },
  { card: "Customer needs", section: "Sales & Marketing", field: "market_and_customers/customer_needs", leaf: "text", origin: "inferred", label: "Historical inferred" },
  { card: "Channels", section: "Sales & Marketing", field: "market_and_customers/channels", leaf: "label", origin: "inferred", label: "Historical inferred" },
  { card: "Calls to action", section: "Sales & Marketing", field: "market_and_customers/ctas", leaf: "purpose", origin: "inferred", label: "Historical inferred" },
  { card: "Funnels", section: "Sales & Marketing", field: "market_and_customers/funnels", leaf: "name", origin: "inferred", label: "Historical inferred" },
  { card: "Ideal persona", section: "Sales & Marketing", field: "market_and_customers/ideal_customer_personas", leaf: "name", origin: "generated", label: "Historical generated" },
] as const;
export type ItemMark = (typeof ITEM_MARKS)[number];
export const markOf = (m: ItemMark, index: number): Mark => ({ target: at(m.field, index, m.leaf), origin: m.origin });
export const itemId = item;
