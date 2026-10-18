import { readFileSync } from "node:fs";
import type { StoredCapture } from "../../src/worker/crawl/run-crawl";
import type { PageCapture } from "../../src/worker/capture/html";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";
import { reduceCandidates } from "../../src/worker/extract/reduce";

interface Row { normalized_url: string; final_url: string; title: string; observations: Record<string, unknown> }
const rows = JSON.parse(readFileSync(new URL("../fixtures/account-it/pages.json", import.meta.url), "utf8")) as Row[];
const companyId = "11111111-1111-4111-8111-111111111111";

export const pageUrls = rows.map((row) => row.final_url);
/** Runs the stored rows of the named pages through the same candidate, validation and reduce steps as a crawl. */
export function runAccountIt(paths: string[], extraLines: Record<string, string> = {}) {
  const captures: StoredCapture[] = rows.filter((row) => paths.includes(new URL(row.final_url).pathname)).map((row, index) => {
    const base = row.observations.segments as PageCapture["segments"];
    const extra = extraLines[new URL(row.final_url).pathname];
    const segments = extra ? [...base, { id: "extra", text: extra }] : base;
    return { id: "00000000-0000-4000-8000-00000000000" + index, retrievedAt: "2026-10-18T00:00:00Z", capture: {
      normalizedUrl: row.normalized_url, finalUrl: row.final_url, title: row.title, author: null, publisher: null,
      publishedAt: null, updatedAt: null, segments, text: segments.map((s) => s.text).join("\n"), contentHash: "x",
      observations: row.observations, links: row.observations.links as PageCapture["links"], requiresRender: false, truncated: false } };
  });
  const validated = captures.flatMap((page) => {
    const observations = technicalObservations(page);
    return deterministicCandidates(page, observations).flatMap((candidate) => {
      try { return validateCandidates([candidate], page, observations, companyId); } catch { return []; }
    });
  });
  const proposals = reduceCandidates(validated, { companyId, jobId: "22222222-2222-4222-8222-222222222222", partial: false });
  const offerings = proposals.filter((p) => p.kind === "offering").map((p) => p.content as unknown as
    { name: string; category?: string | null; url?: string | null; features?: { text: string }[] });
  const market = proposals.filter((p) => p.kind === "market_and_customers").map((p) => p.content as unknown as
    { target_buyers?: { text: string }[] });
  return { proposals, offerings, buyers: market.flatMap((m) => m.target_buyers ?? []).map((b) => b.text) };
}
