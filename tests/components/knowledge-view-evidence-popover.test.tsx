// The Sources control of each card opens onto the exact excerpt, the source
// URL, the historical-origin explanation and the coverage reason. The popover
// is forced open so its content can be read from static markup. Entries come
// from the viewer's own draft and snapshot paths.
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildEmptyDraft } from "../helpers/knowledge-view-fixtures";
import {
  EXCERPT,
  INFERRED_EXCERPT,
  ITEM_MARKS,
  OLD_EXCERPT,
  REASONS,
  SOURCE_URL,
  evidenceDraft,
  evidenceSnapshot,
  markOf,
  type EvidenceOptions,
} from "../helpers/knowledge-view-evidence";

vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  // Only the popovers hold a `false` state in this subtree: open them all.
  return {
    ...real,
    useState: (initial: unknown) => (initial === false ? [true, () => {}] : (real.useState as (v: unknown) => unknown[])(initial)),
  };
});

// vitest.config.ts has no "@/" alias, so point every "@/..." module at its file.
const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")
        ? [join(dir, entry.name)]
        : [],
  );
for (const file of sourceFiles(SRC)) {
  const id = "@/" + relative(SRC, file).replace(/\.tsx?$/, "").split(sep).join("/");
  for (const each of id.endsWith("/index") ? [id, id.slice(0, -"/index".length)] : [id]) {
    vi.doMock(each, () => import(/* @vite-ignore */ file));
  }
}
vi.doMock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));
const { SectionView } = await import("../../src/components/knowledge-view/section-view");
const { snapshotEntries } = await import("../../src/components/shared/knowledge-viewer");

const channelMark = markOf(ITEM_MARKS.find((m) => m.card === "Channels")!, 0);
const withInference: EvidenceOptions = { marks: [channelMark] };
const draft = evidenceDraft(withInference);
const views = {
  draft: (section: "general" | "customers" | "sales") =>
    renderToStaticMarkup(
      <SectionView
        section={section}
        companyId={draft.company.id}
        name={draft.company.name}
        entries={draft.entries as never}
        citationContext={draft.citationContext as never}
      />,
    ),
  snapshot: (section: "general" | "customers" | "sales") => {
    const { payload } = evidenceSnapshot(withInference);
    return renderToStaticMarkup(
      <SectionView section={section} companyId={payload.company_id} name={payload.provenance.company.name} entries={snapshotEntries(payload)} />,
    );
  },
};
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe.each(["draft", "snapshot"] as const)("Sources popover content (%s)", (source) => {
  it("a cited value opens onto its exact excerpt and a link to its source", () => {
    const html = views[source]("general");
    expect(text(html)).toContain(EXCERPT);
    expect(html).toContain(`href="${SOURCE_URL}"`);
    expect(text(html)).toContain("Website evidence");
  });

  it("a historical generated value says it was generated, not quoted from the source", () => {
    const html = text(views[source]("sales"));
    expect(html).toContain("Historical generated suggestion");
    expect(html).toContain("This historical wording was generated, not quoted from the source.");
    expect(html).toContain(OLD_EXCERPT);
    expect(html).toContain("Historical source-based inference");
    expect(html).toContain(INFERRED_EXCERPT);
  });

  it("partial, conflicting and not-found coverage appear with their reasons", () => {
    const customers = text(views[source]("customers"));
    expect(customers).toContain(`Coverage: partial — ${REASONS.partial}`);
    expect(customers).toContain(`Coverage: conflict — ${REASONS.conflict}`);
    expect(text(views[source]("general"))).toContain(`Coverage: not found — ${REASONS.notFound}`);
  });
});

describe("a company without provenance", () => {
  it("Edge case: empty fields with no assessment get no popover", () => {
    const empty = buildEmptyDraft();
    const html = renderToStaticMarkup(
      <SectionView section="general" companyId={empty.company.id} name={empty.company.name} entries={[]} />,
    );
    expect(html).not.toContain("citation-popover");
  });
});
