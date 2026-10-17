// Acceptance tests for Quest Q1 "sitelinks-model": the save path (manual creation provenance) accepts site_links (C4).
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { prepareManualCreation } from "../../src/server/revisions";
import { entryBusiness, validateProvenance, type EntryKind } from "../../src/contracts";

const KIND = "site_links" as string as EntryKind;
const actor = "11111111-1111-4111-8111-111111111111";
const request = "22222222-2222-4222-8222-222222222222";
const L1 = "a3000000-0000-4000-8000-000000000001";
const L2 = "a3000000-0000-4000-8000-000000000002";
const content = {
  links: [
    { id: L1, title: "Careers", url: "https://acme.example/careers", note: null },
    { id: L2, title: "Press kit", url: "https://acme.example/press", note: "Logos and boilerplate" },
  ],
};

describe("C4 [behavioural] manual creation of a site_links entry", () => {
  it("records user-provided claims for every populated link field, and coverage for /site_links/links", () => {
    const provenance = prepareManualCreation(KIND, content as never, request, actor);
    const targets = provenance.claims.flatMap((claim) => claim.targets).sort();
    expect(targets).toEqual(
      [
        `/site_links/links/@${L1}/title`, `/site_links/links/@${L1}/url`,
        `/site_links/links/@${L2}/title`, `/site_links/links/@${L2}/url`, `/site_links/links/@${L2}/note`,
      ].sort(),
    );
    for (const claim of provenance.claims) expect(claim).toMatchObject({ origin: "user_provided", entry_id: request, actor_id: actor });
    const coverage = provenance.coverage.flatMap((item) => item.targets);
    expect(coverage.filter((target) => target === "/site_links/links")).toHaveLength(1);
  });

  it("produces provenance that validates against the entry's business view", () => {
    const provenance = prepareManualCreation(KIND, content as never, request, actor);
    expect(validateProvenance(entryBusiness(KIND, content as never), provenance)).toEqual([]);
  });

  it("is deterministic for the same request (retry-safe claim ids)", () => {
    const first = prepareManualCreation(KIND, content as never, request, actor);
    const second = prepareManualCreation(KIND, content as never, request, actor);
    expect(first.claims.length).toBeGreaterThan(0);
    expect(first.claims.map((claim) => claim.id)).toEqual(second.claims.map((claim) => claim.id));
  });

  it("Edge case: an empty links list still gets a coverage assessment and validates", () => {
    const empty = { links: [] };
    const provenance = prepareManualCreation(KIND, empty as never, request, actor);
    expect(provenance.claims).toEqual([]);
    expect(provenance.coverage.flatMap((item) => item.targets)).toEqual(["/site_links/links"]);
    expect(validateProvenance(entryBusiness(KIND, empty as never), provenance)).toEqual([]);
  });
});
