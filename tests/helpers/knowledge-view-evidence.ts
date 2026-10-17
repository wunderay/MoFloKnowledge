// Provenance fixtures for the evidence tests: a draft and a saved snapshot that
// carry the same sources, exact excerpts, historical origins and coverage notes.
import { createEmptyProvenance } from "../../src/contracts";
import {
  SNAPSHOT_ID,
  buildBusiness,
  draftFrom,
  snapshotFrom,
  type Draft,
} from "./knowledge-view-fixtures";

export const SOURCE_ID = "00000000-0000-4000-8000-0000000a1001";
export const EVIDENCE_ID = "00000000-0000-4000-8000-0000000a1002";
export const SOURCE_URL = "https://www.harborandpine.example/about-us";
export const EXCERPT = "We are an independent specialty coffee roaster on the Portland waterfront.";
export const OLD_EXCERPT = "Historical wording for the buyers list.";
const ACTOR = "00000000-0000-4000-8000-0000000a0001";
const FOUNDATION = "00000000-0000-4000-8000-0000000e0001";
const MARKET = "00000000-0000-4000-8000-0000000e0003";

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
  { id: EVIDENCE_ID, source_page_id: SOURCE_ID, kind: "text" as const, excerpt: EXCERPT, technical: null },
  { id: "00000000-0000-4000-8000-0000000a1003", source_page_id: SOURCE_ID, kind: "text" as const, excerpt: OLD_EXCERPT, technical: null },
];
const claim = (n: number, entry: string, target: string, origin: "source_backed" | "generated" | "inferred", evidenceId: string) => ({
  id: `00000000-0000-4000-8000-0000000a2${String(n).padStart(3, "0")}`,
  entry_id: entry,
  targets: [target],
  origin,
  evidence_ids: [evidenceId],
  based_on_claim_ids: [],
  actor_id: origin === "source_backed" ? null : ACTOR,
  authored_at: null,
  note: null,
});
const coverage = (target: string, status: "partial" | "conflict" | "not_checked" | "not_found", reason: string) => ({
  targets: [target],
  status,
  job_id: null,
  reason,
});

export const REASONS = {
  partial: "Only the homepage was checked.",
  conflict: "The homepage and a press page name different industries.",
  notFound: "No founding story appears on the pages that were checked.",
  notChecked: "No supplier page was assessed.",
};

/** A business where the founding story and suppliers are empty, so their reasons are what shows. */
export function evidenceBusiness() {
  const b = buildBusiness();
  b.positioning.founding_story = null;
  b.market_and_customers.suppliers_and_partners = [];
  return b;
}

export function evidenceDraft(): Draft {
  const b = evidenceBusiness();
  const draft = draftFrom(b);
  const buyer = b.market_and_customers.target_buyers[0]!.id;
  const channel = b.market_and_customers.channels[0]!.id;
  const claims = [
    claim(1, FOUNDATION, "/company_foundation/overview", "source_backed", EVIDENCE_ID),
    claim(2, MARKET, `/market_and_customers/target_buyers/@${buyer}/text`, "generated", evidence[1]!.id),
    claim(3, MARKET, `/market_and_customers/channels/@${channel}/label`, "inferred", evidence[1]!.id),
  ];
  const notes = [
    coverage("/company_foundation/business_model", "partial", REASONS.partial),
    coverage("/company_foundation/industry", "conflict", REASONS.conflict),
    coverage("/positioning/founding_story", "not_found", REASONS.notFound),
    coverage("/market_and_customers/suppliers_and_partners", "not_checked", REASONS.notChecked),
  ];
  for (const entry of draft.entries) {
    const mine = (target: string) => target.startsWith(`/${entry.kind}`);
    entry.provenance = {
      ...createEmptyProvenance(),
      claims: claims.filter((c) => mine(c.targets[0]!)),
      coverage: notes.filter((n) => mine(n.targets[0]!)),
    } as never;
  }
  // A draft carries its sources and excerpts in the response's citation lookup.
  draft.citationContext = { claims: [], evidence, sources: [source] } as never;
  return draft;
}

export function evidenceSnapshot() {
  const draft = evidenceDraft();
  const payload = snapshotFrom(draft);
  payload.provenance.sources = [source];
  payload.provenance.evidence = evidence;
  payload.provenance.claims = draft.entries.flatMap((e) => e.provenance.claims) as never;
  payload.provenance.coverage = draft.entries.flatMap((e) => e.provenance.coverage) as never;
  return { payload, versionId: SNAPSHOT_ID };
}
