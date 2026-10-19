// Fixtures for the Key People acceptance tests. Same fictional company as the other
// view tests (Harbor & Pine Coffee Roasters). Valid fixtures satisfy DraftResponseSchema /
// KnowledgeBaseExportSchema (checked in knowledge-view-people-fixtures.test.ts); the hostile
// builder breaks the schema on purpose to prove the view never trusts a stored URL.
import { createEmptyProvenance, type Business } from "../../src/contracts";
import {
  COMPANY_ID,
  SNAPSHOT_ID,
  buildBusiness,
  draftFrom,
  snapshotFrom,
  type Draft,
} from "./knowledge-view-fixtures";

const id = (n: number) => `00000000-0000-4000-8000-00000ee${n.toString(16).padStart(5, "0")}`;
export type Person = Business["key_people"][number];

export const PERSON_IDS = [id(0x100), id(0x101), id(0x102), id(0x103)] as const;
export const PORTRAIT_ID = id(0x900);
export const PORTRAIT = {
  id: PORTRAIT_ID,
  path: `portraits/${COMPANY_ID}/${PORTRAIT_ID}.png`,
  content_type: "image/png" as const,
  size_bytes: 20480,
};
/** The only image address the view may build from the reference above. */
export const PORTRAIT_URL = `/api/companies/${COMPANY_ID}/uploads/${PORTRAIT_ID}`;

export const PEOPLE: Business["key_people"] = [
  {
    // everything filled, with a portrait
    id: PERSON_IDS[0],
    name: "Maya Okafor",
    title: "Co-founder and CEO",
    role: "Leads sourcing and strategy.",
    gender: "Female",
    background_or_relevance: "Ten years buying green coffee for specialty roasters before founding Harbor & Pine.",
    age: 41,
    nationality: "American",
    portrait: PORTRAIT,
  },
  {
    // age 0 is a real value, not an empty state; no portrait
    id: PERSON_IDS[1],
    name: "Tomas Lindqvist",
    title: "Co-founder and Head Roaster",
    role: null,
    gender: "Male",
    background_or_relevance: "Trained as a roaster in Gothenburg.",
    age: 0,
    nationality: "Swedish",
    portrait: null,
  },
  {
    // only a name: every other field is an empty state
    id: PERSON_IDS[2],
    name: "Priya Nair",
    title: null,
    role: null,
    gender: null,
    background_or_relevance: null,
    age: null,
    nationality: null,
    portrait: null,
  },
  {
    // no name: listed as "Untitled person ..."
    id: PERSON_IDS[3],
    name: null,
    title: "Barista trainer",
    role: null,
    gender: null,
    background_or_relevance: "Runs the Saturday workshops.",
    age: null,
    nationality: null,
    portrait: null,
  },
];
export const [MAYA, TOMAS, PRIYA, UNNAMED] = PEOPLE as [Person, Person, Person, Person];

export function peopleBusiness(people: Business["key_people"] = PEOPLE): Business {
  const b = buildBusiness();
  b.key_people = structuredClone(people);
  return b;
}
export const peopleDraft = (people?: Business["key_people"], role: "owner" | "viewer" = "owner"): Draft =>
  draftFrom(peopleBusiness(people), { role });
export const viewerDraft = () => peopleDraft(undefined, "viewer");
export const peopleSnapshot = (draft: Draft = peopleDraft()) => ({ payload: snapshotFrom(draft), versionId: SNAPSHOT_ID });
export const noPeopleDraft = () => peopleDraft([]);

export const personAddHref = (companyId: string) => `/knowledge/view?companyId=${companyId}&category=key_person`;

/**
 * A draft whose first person carries stored data a schema would reject: a portrait whose path and an
 * extra `url` are arbitrary addresses, and markup in the text fields.
 */
export const HOSTILE = {
  name: '<img src=x onerror="alert(1)">Eve <script>alert(2)</script>',
  title: '"><svg onload=alert(3)>',
  evilUrl: "https://evil.example/tracker.png",
  jsUrl: "javascript:alert(document.cookie)",
};
export function hostileDraft(): Draft {
  const people = structuredClone(PEOPLE);
  Object.assign(people[0], {
    name: HOSTILE.name,
    title: HOSTILE.title,
    background_or_relevance: `<b>bold</b> ${HOSTILE.jsUrl}`,
    portrait: { ...PORTRAIT, url: HOSTILE.evilUrl, src: HOSTILE.jsUrl, path: HOSTILE.evilUrl },
  });
  return peopleDraft(people);
}

// ---- evidence ----------------------------------------------------------------------------
const ACTOR = "00000000-0000-4000-8000-0000000a0001";
export const SOURCE_ID = "00000000-0000-4000-8000-0000000a7001";
export const EVIDENCE_ID = "00000000-0000-4000-8000-0000000a7002";
const source = {
  id: SOURCE_ID,
  url: "https://www.harborandpine.example/about-us",
  title: "Harbor & Pine about page",
  author: null,
  site_name: "Harbor & Pine",
  published_on: null,
  retrieved_at: "2026-10-10T12:00:00.000Z",
};
const evidence = [
  { id: EVIDENCE_ID, source_page_id: SOURCE_ID, kind: "text" as const, excerpt: "Maya Okafor, co-founder and CEO.", technical: null },
];
const at = (index: number, leaf: string) => `/key_people/@${PERSON_IDS[index]}/${leaf}`;
type Origin = "source_backed" | "inferred" | "user_provided";
/** The claims every evidence fixture carries. */
export const MARKS: { target: string; origin: Origin }[] = [
  { target: at(0, "name"), origin: "source_backed" },
  { target: at(0, "title"), origin: "user_provided" },
  { target: at(1, "background_or_relevance"), origin: "inferred" },
];
export const REASONS = {
  description: "Only the about page describes this person.",
  noAge: "No page states anyone's age.",
  noGender: "No page states this person's gender.",
};
const COVERAGE = [
  { target: at(0, "background_or_relevance"), status: "partial" as const, reason: REASONS.description },
  { target: at(2, "age"), status: "not_found" as const, reason: REASONS.noAge },
  { target: at(2, "gender"), status: "not_checked" as const, reason: REASONS.noGender },
];

export function evidenceFixture() {
  const business = peopleBusiness();
  const draft = draftFrom(business);
  const claims = MARKS.map((m, i) => {
    const person = business.key_people.find((p) => m.target.startsWith(`/key_people/@${p.id}/`))!;
    const user = m.origin === "user_provided";
    return {
      id: `00000000-0000-4000-8000-0000000a8${String(i).padStart(3, "0")}`,
      entry_id: person.id,
      targets: [m.target],
      origin: m.origin,
      evidence_ids: user ? [] : [EVIDENCE_ID],
      based_on_claim_ids: [] as string[],
      actor_id: user ? ACTOR : null,
      authored_at: user ? "2026-10-11T09:00:00.000Z" : null,
      note: user ? "Corrected by the owner." : null,
    };
  });
  const coverage = COVERAGE.map((c) => ({ targets: [c.target], status: c.status, job_id: null, reason: c.reason }));
  for (const entry of draft.entries) {
    const root = `/key_people/@${entry.id}`;
    const own = claims.filter((c) => c.entry_id === entry.id);
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
  return { business, draft, claims, coverage, snapshot };
}
