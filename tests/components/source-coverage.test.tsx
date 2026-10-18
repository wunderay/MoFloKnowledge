import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, api: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [harness.slots[index], (value: unknown) => { harness.slots[index] = value; }];
  },
}));
vi.mock("../../src/components/shared/api-client", async (original) => ({
  ...await original<typeof import("../../src/components/shared/api-client")>(), api: harness.api,
}));
vi.mock("../../src/components/shared/citation-popover", () => ({ safeHref: (value: string) => value }));
import { SourceCoverage } from "../../src/components/editor/source-coverage";

const inventory = {
  job: {
    id: "job", status: "partial", createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:01:00Z",
    documentLimit: 12, progress: {}, limitsReached: ["documents"],
    errors: [{ code: "capture_failed", url: "https://example.com/failed", retryable: false, message: "Source refused the request." }],
  },
  pages: [
    { sourceId: "retained-source", url: "https://example.com/unused", title: "Captured but not used in claims", state: "captured", selected: true, retrievedAt: null, reason: null, score: null, depth: null },
    { sourceId: null, url: "https://example.com/linked", title: null, state: "linked_not_selected", selected: false, retrievedAt: null, reason: "Document budget reached before this link was selected.", score: null, depth: null },
    { sourceId: null, url: "https://example.com/blocked", title: null, state: "blocked", selected: true, retrievedAt: null, reason: "Destination blocked by policy.", score: null, depth: null },
    { sourceId: null, url: "https://example.com/failed", title: null, state: "failed", selected: true, retrievedAt: null, reason: "Source refused the request.", score: null, depth: null },
    { sourceId: null, url: "https://example.com/pending", title: null, state: "pending", selected: true, retrievedAt: null, reason: "Waiting in the recorded frontier.", score: null, depth: null },
  ],
};
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return node;
  if (typeof node.type === "function") return expand((node.type as (props: unknown) => ReactNode)(node.props));
  return React.cloneElement(node, undefined, expand(node.props.children));
}
function elements(node: ReactNode): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function render() {
  harness.cursor = 0;
  const tree = expand(<SourceCoverage companyId="company-id" viewingSnapshot />);
  return { nodes: elements(tree), html: renderToStaticMarkup(tree) };
}
beforeEach(() => { harness.slots = []; });

it("loads on disclosure, identifies latest crawl separately from snapshots, and exposes the recorded frontier and limits", async () => {
  const initial = render();
  expect(harness.api).not.toHaveBeenCalled();
  expect(initial.html).toContain("Latest crawl · source coverage");
  harness.api.mockResolvedValueOnce(inventory);
  initial.nodes[0]!.props.onToggle({ currentTarget: { open: true } });
  await Promise.resolve();
  const loaded = render();
  expect(harness.api).toHaveBeenCalledWith("/api/companies/company-id/sources");
  expect(loaded.html).toContain("separate from the saved version");
  expect(loaded.html).toContain("not every page on the website");
  expect(loaded.html).toContain("Document limit</dt><dd>12");
  expect(loaded.html).toContain("Limits reached: Documents");
  for (const label of ["Captured but not used in claims", "Linked · not selected", "Blocked", "Failed", "Pending", "Waiting in the recorded frontier."])
    expect(loaded.html).toContain(label);
  expect(harness.api).toHaveBeenCalledTimes(1);
});

it("opens full retained text through the company route, escapes page content, and reports capture truncation", async () => {
  harness.api.mockResolvedValueOnce(inventory);
  render().nodes[0]!.props.onToggle({ currentTarget: { open: true } });
  await Promise.resolve();
  const text = '<script>alert("source")</script>\n' + "Exact retained text. ".repeat(100) + "Unique retained ending.";
  harness.api.mockResolvedValueOnce({
    id: "retained-source", jobId: "job", url: inventory.pages[0]!.url, title: "Source", capturedAt: null,
    captureStatus: "captured", text, segments: [], truncated: true, limitations: ["Capture byte limit was reached."],
  });
  const source = render().nodes.find((node) => node.type === "details" && node.props.className === "source-coverage__source")!;
  source.props.onToggle({ currentTarget: { open: true } });
  await Promise.resolve();
  const loaded = render();
  expect(harness.api).toHaveBeenLastCalledWith("/api/companies/company-id/sources/retained-source");
  expect(loaded.html).toContain("capture was truncated");
  expect(loaded.html).toContain("Capture byte limit was reached.");
  expect(loaded.html).toContain("&lt;script&gt;");
  expect(loaded.html).not.toContain("<script>");
  expect(loaded.html).toContain("Unique retained ending.");
  expect(loaded.html).toContain("not the original page HTML");
});

it("keeps an API failure visible and offers a coverage retry", async () => {
  harness.api.mockRejectedValueOnce(new Error("Coverage unavailable"));
  render().nodes[0]!.props.onToggle({ currentTarget: { open: true } });
  await Promise.resolve();
  const failed = render();
  expect(failed.html).toContain('role="alert"');
  expect(failed.html).toContain("Coverage unavailable");
  const retry = failed.nodes.find((node) => node.type === "button" && node.props.children === "Retry coverage")!;
  harness.api.mockResolvedValueOnce(inventory);
  await retry.props.onClick();
  expect(render().html).toContain("Captured but not used in claims");
});
