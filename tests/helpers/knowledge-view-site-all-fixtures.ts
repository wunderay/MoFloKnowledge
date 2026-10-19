// Fixtures for the Site Knowledge / All sections acceptance tests.
// Same fictional company as the other view tests (Harbor & Pine Coffee Roasters). Valid fixtures
// satisfy DraftResponseSchema / KnowledgeBaseExportSchema / validateProvenance (checked in
// knowledge-view-site-all-fixtures.test.ts). The "hostile" builders break the schema on purpose
// (a javascript: link, markup in titles) to prove the view stays safe against data the schema
// would normally reject.
import { createEmptyProvenance, type Business, type EntryProvenance } from "../../src/contracts";
import {
  ACTOR,
  COMPANY_ID,
  SITE,
  SNAPSHOT_ID,
  buildBusiness,
  companyRow,
  draftFrom,
  snapshotFrom,
  type Draft,
  type DraftEntry,
} from "./knowledge-view-fixtures";

export { ACTOR, COMPANY_ID, SITE, SNAPSHOT_ID };

const id = (prefix: string, n: number) => `00000000-0000-4000-8000-${prefix}${n.toString(16).padStart(12 - prefix.length, "0")}`;

export interface Link { id: string; title: string; url: string; note: string | null }
export const SITE_ENTRY_ID = id("0000000e", 6);
export const SITE_REVISION = 4;
export const siteAddHref = (companyId: string) => `/knowledge/view?companyId=${companyId}&category=site_links`;
export const SITE_HEADING = /^sitemap\s*\/\s*internal links$/i;

/** Stored order is deliberately neither alphabetical nor by URL. */
export const LINKS: Link[] = [
  { id: id("00000517", 1), title: "Order wholesale beans", url: `${SITE}/wholesale/order`, note: "Minimum order is one case of twelve bags." },
  { id: id("00000517", 2), title: "Careers at Harbor & Pine", url: `${SITE}/about/careers`, note: null },
  { id: id("00000517", 3), title: "Visit the Wharf Street roastery", url: `${SITE}/visit`, note: "Open Saturday 8am to 4pm." },
  { id: id("00000517", 4), title: "Brewing guides", url: `${SITE}/learn/brewing`, note: null },
];

export function manyLinks(count: number): Link[] {
  return Array.from({ length: count }, (_, i) => ({
    id: id("00000518", i + 1),
    title: `Generated page ${i + 1}`,
    url: `${SITE}/generated/${i + 1}`,
    note: null,
  }));
}

// ---- provenance of a site_links entry ----------------------------------------------------------
const AUTHORED = "2026-10-11T09:00:00.000Z";
export const COVERAGE_REASONS = {
  notFound: "No sitemap or navigation page was among the pages that were checked.",
  partial: "Only the footer navigation was captured.",
};
export interface SiteCoverage { status: "found" | "partial" | "conflict" | "not_checked" | "not_found"; reason: string | null }

export function userProvenance(
  links: Link[],
  coverage: SiteCoverage | null = { status: "found", reason: null },
  entryId: string = SITE_ENTRY_ID,
): EntryProvenance {
  let n = 0;
  const claim = (target: string) => ({
    id: id("0000a7", ++n + 0x1000),
    entry_id: entryId,
    targets: [target],
    origin: "user_provided" as const,
    evidence_ids: [] as string[],
    based_on_claim_ids: [] as string[],
    actor_id: ACTOR,
    authored_at: AUTHORED,
    note: "User-provided manual entry.",
  });
  const leaves = links.flatMap((link) => [
    `/site_links/links/@${link.id}/title`,
    `/site_links/links/@${link.id}/url`,
    ...(link.note === null ? [] : [`/site_links/links/@${link.id}/note`]),
  ]);
  // A provenance holds at most 500 claims, but one claim may name up to 1000 targets: a long list is one claim.
  const claims = links.length > 100 ? (leaves.length ? [{ ...claim(leaves[0]), targets: leaves }] : []) : leaves.map(claim);
  return {
    ...createEmptyProvenance(),
    claims,
    coverage: coverage ? [{ targets: ["/site_links/links"], status: coverage.status, job_id: null, reason: coverage.reason }] : [],
  } as EntryProvenance;
}

// ---- drafts ---------------------------------------------------------------------------------------
export function siteBusiness(links: Link[]): Business {
  const business = buildBusiness();
  business.site_links = { links: structuredClone(links) };
  return business;
}

export interface SiteDraftOptions {
  /** `null`: the company has no site_links entry at all (current revision 0). */
  links?: Link[] | null;
  revision?: number;
  provenance?: EntryProvenance;
  coverage?: SiteCoverage | null;
  role?: "owner" | "viewer";
  archived?: boolean;
  status?: DraftEntry["review_status"];
}

/** The standard draft plus a site_links entry (or none). */
export function siteDraft(opts: SiteDraftOptions = {}): Draft {
  const links = opts.links === undefined ? LINKS : opts.links;
  const business = siteBusiness(links ?? []);
  const draft = draftFrom(business, { role: opts.role });
  if (opts.archived) {
    draft.company = { ...draft.company, archived_at: "2026-10-14T08:00:00.000Z" };
  }
  if (links !== null) {
    const revision = opts.revision ?? SITE_REVISION;
    draft.entries.push({
      id: SITE_ENTRY_ID,
      entry_id: SITE_ENTRY_ID,
      company_id: draft.company.id,
      kind: "site_links",
      revision,
      current_revision: revision,
      schema_version: "1.0.0",
      content: { links: structuredClone(links) },
      provenance: opts.provenance ?? userProvenance(links, opts.coverage === undefined ? { status: "found", reason: null } : opts.coverage),
      review_status: opts.status ?? "approved",
      author_id: ACTOR,
      created_by: ACTOR,
      change_reason: "Listed by hand.",
      created_at: "2026-10-10T12:00:00.000Z",
      saved_at: "2026-10-12T15:04:05.000Z",
    });
  }
  return draft;
}
export const noSiteDraft = (opts: Omit<SiteDraftOptions, "links"> = {}) => siteDraft({ ...opts, links: null });
export const emptySiteDraft = (opts: Omit<SiteDraftOptions, "links"> = {}) => siteDraft({ ...opts, links: [] });

export const siteSnapshot = (draft: Draft = siteDraft()) => ({ payload: snapshotFrom(draft), versionId: SNAPSHOT_ID });

// ---- hostile data (schema-invalid on purpose) ------------------------------------------------------
export const HOSTILE = {
  js: "javascript:alert(document.cookie)",
  data: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  ftp: "ftp://files.harborandpine.example/menu.pdf",
  relative: "/internal/admin",
  protocolRelative: "//evil.example/steal",
  title: '<img src=x onerror="alert(1)">Press & <b>media</b>',
  note: '<script>alert("note")</script> "quoted" & done',
};
export function hostileLinks(): Link[] {
  return [
    { id: id("00000519", 1), title: "Javascript link", url: HOSTILE.js, note: null },
    { id: id("00000519", 2), title: "Data link", url: HOSTILE.data, note: null },
    { id: id("00000519", 3), title: "File transfer link", url: HOSTILE.ftp, note: null },
    { id: id("00000519", 4), title: "Relative link", url: HOSTILE.relative, note: null },
    { id: id("00000519", 5), title: "Protocol relative link", url: HOSTILE.protocolRelative, note: null },
    { id: id("00000519", 6), title: HOSTILE.title, url: `${SITE}/press`, note: HOSTILE.note },
    { id: id("00000519", 7), title: "Control link", url: `${SITE}/control`, note: null },
  ];
}

// ---- captured source pages (GET /api/companies/<id>/sources) -----------------------------------------
export interface Page {
  sourceId: string | null;
  url: string;
  title: string | null;
  state: "captured" | "failed" | "blocked" | "unsupported" | "pending" | "linked_not_selected" | "selected_no_capture";
  selected: boolean | null;
  retrievedAt: string | null;
  reason: string | null;
  score: number | null;
  depth: number | null;
}
const page = (n: number, state: Page["state"], url: string, title: string | null, reason: string | null = null): Page => ({
  sourceId: state === "captured" ? id("0000b5", n) : null,
  url,
  title,
  state,
  selected: state === "linked_not_selected" ? false : true,
  retrievedAt: state === "captured" ? "2026-10-10T12:00:00.000Z" : null,
  reason,
  score: null,
  depth: 1,
});
export const PAGES = {
  shop: page(1, "captured", `${SITE}/shop`, "Shop our coffees"),
  subscribe: page(2, "captured", `${SITE}/subscribe`, "Subscribe and save"),
  untitled: page(3, "captured", `${SITE}/gift-cards`, null),
  workshops: page(4, "captured", `${SITE}/workshops`, "Roasting workshops"),
  /** Captured, but its URL is already a stored link (LINKS[1]); the picker must leave it out. */
  careersCopy: page(5, "captured", LINKS[1].url, "Careers page (captured copy)"),
  failed: page(6, "failed", `${SITE}/press-archive`, "Failed press archive", "Source refused the request."),
  blocked: page(7, "blocked", `${SITE}/members`, "Blocked members area", "Destination blocked by policy."),
  unsupported: page(8, "unsupported", `${SITE}/menu.pdf`, "Unsupported menu download"),
  pending: page(9, "pending", `${SITE}/events`, "Pending events calendar", "Waiting in the recorded frontier."),
  linked: page(10, "linked_not_selected", `${SITE}/terms`, "Linked terms of service", "Document budget reached before this link was selected."),
  noCapture: page(11, "selected_no_capture", `${SITE}/returns`, "Selected returns policy"),
};
/** Titles of the pages the picker must NOT list, and why. */
export const NOT_LISTED = [PAGES.failed, PAGES.blocked, PAGES.unsupported, PAGES.pending, PAGES.linked, PAGES.noCapture, PAGES.careersCopy];
/** The captured pages that are not stored links yet, in inventory order. */
export const LISTED = [PAGES.shop, PAGES.subscribe, PAGES.untitled, PAGES.workshops];
export const labelOfPage = (p: Page) => p.title ?? p.url;

export function inventory(pages: Page[]) {
  return {
    job: {
      id: id("0000c5", 1),
      status: "succeeded" as const,
      createdAt: "2026-10-10T11:00:00.000Z",
      updatedAt: "2026-10-10T12:30:00.000Z",
      documentLimit: 12,
      progress: {
        stage: "succeeded" as const,
        discovered: pages.length,
        selected: pages.length,
        captured: pages.filter((p) => p.state === "captured").length,
        failed: 0,
        blocked: 0,
        extracted: 0,
        document_limit: 12,
        limits_reached: [] as string[],
      },
      limitsReached: [] as string[],
      errors: [] as { code: string; url: string | null; retryable: boolean; message: string }[],
    },
    pages,
  };
}
export const FULL_INVENTORY = () =>
  inventory([PAGES.shop, PAGES.failed, PAGES.subscribe, PAGES.blocked, PAGES.untitled, PAGES.careersCopy, PAGES.unsupported, PAGES.workshops, PAGES.pending, PAGES.linked, PAGES.noCapture]);

// ---- evidence: claims of every origin on individual links -----------------------------------------------
const SOURCE_ID = id("0000a8", 1);
const EVIDENCE_ID = id("0000a8", 2);
const source = {
  id: SOURCE_ID,
  url: `${SITE}/sitemap`,
  title: "Harbor & Pine site map",
  author: null,
  site_name: "Harbor & Pine",
  published_on: null,
  retrieved_at: "2026-10-10T12:00:00.000Z",
};
const evidence = [{ id: EVIDENCE_ID, source_page_id: SOURCE_ID, kind: "text" as const, excerpt: "Order wholesale beans. Visit the Wharf Street roastery.", technical: null }];

export interface SiteEvidenceOptions {
  links?: Link[];
  coverage?: SiteCoverage | null;
  /** Which links carry which origin on their title and url. Links not named are source-backed. */
  origins?: Record<number, "source_backed" | "user_provided" | "inferred" | "generated">;
}
/** Link 1 and 3 are source-backed, 2 and 4 are user-provided, unless `origins` says otherwise. */
export function buildSiteEvidence(opts: SiteEvidenceOptions = {}) {
  const links = opts.links ?? LINKS;
  const origins = opts.origins ?? { 0: "source_backed", 1: "user_provided", 2: "source_backed", 3: "user_provided" };
  const claims: any[] = [];
  let n = 0;
  const base = (link: Link, leaf: string, origin: string, basedOn: string[]) => ({
    id: id("0000a9", ++n),
    entry_id: SITE_ENTRY_ID,
    targets: [`/site_links/links/@${link.id}/${leaf}`],
    origin,
    evidence_ids: origin === "user_provided" ? [] : [EVIDENCE_ID],
    based_on_claim_ids: basedOn,
    actor_id: origin === "user_provided" ? ACTOR : null,
    authored_at: origin === "user_provided" ? AUTHORED : null,
    note: origin === "user_provided" ? "Corrected by the owner." : null,
  });
  // A generated claim rests on the first source-backed claim of the entry.
  const firstSupport = () => claims.find((c) => c.origin === "source_backed")?.id;
  links.forEach((link, index) => {
    const origin = origins[index] ?? "source_backed";
    for (const leaf of ["title", "url", ...(link.note === null ? [] : ["note"])]) {
      claims.push(base(link, leaf, origin, origin === "generated" && firstSupport() ? [firstSupport()] : []));
    }
  });
  const coverage = opts.coverage === undefined ? { status: "found" as const, reason: null } : opts.coverage;
  const draft = siteDraft({ links });
  const entry = draft.entries.find((e) => e.kind === "site_links")!;
  const usesEvidence = claims.some((c) => c.evidence_ids.length);
  entry.provenance = {
    ...createEmptyProvenance(),
    sources: usesEvidence ? [source] : [],
    evidence: usesEvidence ? evidence : [],
    claims,
    coverage: coverage ? [{ targets: ["/site_links/links"], status: coverage.status, job_id: null, reason: coverage.reason }] : [],
  } as never;
  draft.citationContext = { claims, evidence: usesEvidence ? evidence : [], sources: usesEvidence ? [source] : [] } as never;
  const snapshot = () => {
    const payload = snapshotFrom(draft);
    payload.provenance.sources = usesEvidence ? [source] : [];
    payload.provenance.evidence = usesEvidence ? evidence : [];
    payload.provenance.claims = claims as never;
    payload.provenance.coverage = (coverage ? [{ targets: ["/site_links/links"], status: coverage.status, job_id: null, reason: coverage.reason }] : []) as never;
    return { payload, versionId: SNAPSHOT_ID };
  };
  return { links, draft, claims, evidence, sources: [source], snapshot, entry };
}

/** Historical origins on links: the product's own registry allows only source-backed and user-provided claims
 *  for site_links, so these claims are schema-invalid by design (data from before the registry tightened). */
export const historicalOrigins = (): SiteEvidenceOptions["origins"] => ({ 0: "source_backed", 1: "inferred", 2: "generated", 3: "user_provided" });

export { companyRow };
export function viewerDraft(links: Link[] | null = LINKS) {
  return siteDraft({ links, role: "viewer" });
}
