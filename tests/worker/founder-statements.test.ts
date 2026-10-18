import { describe, expect, it } from "vitest";
import { runAccountIt } from "./account-it-run";

const sentence = "My experience includes years of public accounting, 14 years as a CFO/Controller, part-time CFO and, since 2003, my own accounting practice in South Florida.";
const leaf = (result: ReturnType<typeof runAccountIt>, path: string) => {
  const proposal = result.proposals.find((p) => p.kind === "company_foundation")!;
  const provenance = proposal.provenance as unknown as {
    claims: { targets: string[]; note: string | null; evidence_ids: string[] }[];
    evidence: { id: string; excerpt: string | null; source_page_id: string }[];
    sources: { id: string; url: string }[];
  };
  const claim = provenance.claims.find((c) => c.targets.some((t) => t.includes(path)))!;
  const evidence = provenance.evidence.filter((e) => claim.evidence_ids.includes(e.id));
  return { content: proposal.content as unknown as Record<string, unknown>, claim, evidence, sources: provenance.sources };
};

describe("founder statements", () => {
  it("fills the founding year and a service location from a founder's own sentence, marked as such", () => {
    const result = runAccountIt(["/about-us/doug-cohen"]);
    const year = leaf(result, "/year_founded");
    const place = leaf(result, "/service_locations");
    expect(year.content.year_founded).toBe(2003);
    expect(place.content.service_locations).toEqual([expect.objectContaining({ text: "South Florida" })]);
    for (const { claim, evidence, sources } of [year, place]) {
      expect(claim.note).toBe("From the founder's statement");
      expect(evidence.map((e) => e.excerpt)).toContain(sentence);
      expect(evidence.map((e) => sources.find((s) => s.id === e.source_page_id)?.url)).toEqual(["https://account-it.net/about-us/doug-cohen"]);
    }
  });

  it("lets an explicit company founding statement win", () => {
    const result = runAccountIt(["/about-us/doug-cohen", "/firm-background"], { "/firm-background": "Founded: 2010" });
    const year = leaf(result, "/year_founded");
    expect(year.content.year_founded).toBe(2010);
    expect(year.claim.note).not.toBe("From the founder's statement");
  });
});
