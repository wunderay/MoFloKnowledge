import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));
vi.mock("../../src/components/shared/ui", () => ({
  useHydrated: () => true, EmptyState: () => null, Notice: () => null,
  StatusBadge: () => null, Dialog: () => null,
}));
import { CompanyDashboard, companyHref } from "../../src/components/dashboard/company-dashboard";

const company = (id: string, latestJob: unknown) => ({
  id, name: `Co ${id}`, website_url: "https://example.com", draft_generation: 1,
  archived_at: null, role: "owner", latestJob, latestVersion: null,
});

it("reopens a workspace with its latest scrape job so pending proposals are listed", () => {
  const job = { id: "job-123", status: "succeeded", progress: {}, created_at: "2026-10-16T00:00:00Z" };
  const html = renderToStaticMarkup(
    <CompanyDashboard initialData={{ companies: [company("c1", job), company("c2", null)] as never, nextCursor: null }} />,
  );
  expect(html).toMatch(/href="\/knowledge\/view\?companyId=c1&(amp;)?jobId=job-123"/);
  expect(html).toMatch(/href="\/knowledge\/view\?companyId=c2"/);
});

it("an archived company's View history opens its latest saved version, without the scrape job", () => {
  const job = { id: "job-9", status: "succeeded", progress: {}, created_at: "2026-10-16T00:00:00Z" };
  const version = { id: "v-1", version_number: 1, created_at: "2026-10-16T00:00:00Z" };
  const archived = { ...company("c3", job), archived_at: "2026-10-17T00:00:00Z" };
  expect(companyHref({ ...archived, latestVersion: version } as never)).toBe("/knowledge/view?companyId=c3&versionId=v-1");
  expect(companyHref(archived as never)).toBe("/knowledge/view?companyId=c3");
  expect(companyHref(company("c1", job) as never)).toBe("/knowledge/view?companyId=c1&jobId=job-9");
});
