import React, { type ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { createEmptyProvenance, createEntryDefault } from "../../src/contracts";

// Exercise the editor's event handlers and rendered controls with native React
// elements; the hook harness lets a draft read remain pending without a DOM.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  state: { category: "company_foundation", values: {}, provenance: {}, dirty: [] } as any,
  dispatch: vi.fn(),
  api: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) {
      harness.slots[index] = initial;
    }
    return [harness.slots[index], (next: unknown) => {
      harness.slots[index] = typeof next === "function"
        ? next(harness.slots[index]) : next;
    }];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));
vi.mock("../../src/components/editor/company-draft-context", () => ({
  CompanyDraftProvider: () => null,
  useCompanyDraft: () => ({ state: harness.state, dispatch: harness.dispatch }),
}));
vi.mock("../../src/components/shared/api-client", async (original) => ({
  ...await original<typeof import("../../src/components/shared/api-client")>(),
  api: harness.api,
}));
vi.mock("@/contracts", () => import("../../src/contracts"));
vi.mock("@/knowledge/conflict-decisions", () => import("../../src/knowledge/conflict-decisions"));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("../../src/components/editor/unsaved-navigation", () => ({ useUnsavedNavigation: () => () => true }));
vi.mock("../../src/components/shared/ui", () => ({
  useHydrated: () => true, EmptyState: () => null, Notice: () => null, StatusBadge: () => null,
}));
vi.mock("../../src/components/editor/entry-value", () => ({ ValueView: () => null }));
vi.mock("../../src/components/shared/citation-popover", () => ({ CitationPopover: () => null }));
vi.mock("../../src/components/editor/business-form", () => ({ BusinessField: () => null }));
vi.mock("../../src/components/editor/scrape-progress", () => ({ ScrapeProgress: () => null }));
vi.mock("../../src/components/editor/entry-history", () => ({ EntryHistory: () => null }));
vi.mock("../../src/components/editor/publication-dialog", () => ({ PublicationDialog: () => null }));
vi.mock("../../src/components/editor/company-settings", () => ({ CompanySettings: () => null }));
vi.mock("../../src/components/editor/proposal-review", () => ({ ProposalReview: () => null }));
import { KnowledgeEditor } from "../../src/components/editor/knowledge-editor";

function elements(node: React.ReactNode): ReactElement<any>[] {
  if (Array.isArray(node)) {
    return node.flatMap(elements);
  }
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return [];
  }
  return [node, ...elements(node.props.children)];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const original = {
  id: "entry", kind: "company_foundation" as const, current_revision: 1,
  content: createEntryDefault("company_foundation"),
  provenance: createEmptyProvenance(), review_status: "unreviewed" as const,
};
const selected = {
  ...original.content,
  main_address: { id: "11111111-1111-4111-8111-111111111111", label: null, raw: "400 River Street", line1: "400 River Street", line2: null, city: "Austin", region: "TX", postal_code: "78701", country: "US" },
};
const savedProvenance = createEmptyProvenance();
savedProvenance.decisions.push({
  id: "decision", conflict_id: "address-conflict",
  target: "/company_foundation/main_address", action: "select",
  candidate_id: "river-street", actor_id: "reviewer",
  decided_at: "2026-10-16T00:00:00Z", note: "Selected River Street.",
});
const authoritative = {
  company: { name: "Test", role: "owner", archived_at: null },
  entries: [{ ...original, current_revision: 2, content: selected, provenance: savedProvenance }],
  draftGeneration: 2,
};
function render(entries: any[] = [original]) {
  harness.cursor = 0;
  const wrapper = KnowledgeEditor({
    companyId: "company",
    initialDraft: { ...authoritative, entries } as any,
  });
  const content = wrapper.props.children as ReactElement<any>;
  return elements((content.type as (props: unknown) => React.ReactNode)(content.props));
}
function button(tree: ReactElement<any>[], text: string) {
  const found = tree.find((node) => node.type === "button" && node.props.children === text);
  expect(found, text).toBeDefined();
  return found!;
}
function field(tree: ReactElement<any>[], name: string) {
  return tree.find((node) => node.props.name === name)!;
}
function text(tree: ReactElement<any>[]) {
  return tree.map((node) => node.props.children).flat(Infinity).filter((value) => typeof value === "string").join(" ");
}
beforeEach(() => {
  harness.slots = [];
  harness.state = {
    category: "company_foundation", values: { entry: selected },
    provenance: {}, dirty: ["entry"],
  };
  harness.dispatch.mockImplementation((action) => {
    if (action.type === "saved") {
      delete harness.state.values[action.id];
      delete harness.state.provenance[action.id];
      harness.state.dirty = harness.state.dirty.filter((id: string) => id !== action.id);
    } else if (action.type === "edit") {
      harness.state.values[action.id] = action.content;
      harness.state.dirty.push(action.id);
    }
  });
});

it("waits for the authoritative draft before enabling an unrelated edit and a second save", async () => {
  const read = deferred<typeof authoritative>();
  harness.api.mockResolvedValueOnce({}).mockReturnValueOnce(read.promise);
  const saving = button(render(), "Save draft").props.onClick();
  await Promise.resolve();
  const pending = render();
  expect(field(pending, "overview").props.disabled).toBe(true);
  expect(button(pending, "Saving…").props.disabled).toBe(true);
  expect(harness.dispatch).not.toHaveBeenCalledWith({ type: "saved", id: "entry" });
  expect(text(pending)).not.toContain("Draft saved.");

  read.resolve(authoritative);
  await saving;
  const loaded = render();
  expect(text(loaded)).toContain("Draft saved.");
  expect(field(loaded, "overview").props.disabled).toBe(false);
  field(loaded, "overview").props.onChange("Only overview changed");
  harness.api.mockResolvedValueOnce({}).mockResolvedValueOnce(authoritative);
  await button(render(), "Save and approve").props.onClick();
  const secondSave = JSON.parse(harness.api.mock.calls[2][1].body);
  expect(secondSave.expectedRevision).toBe(2);
  expect(secondSave.content.main_address).toEqual(selected.main_address);
  expect(secondSave.content.overview).toBe("Only overview changed");
  expect(secondSave.provenance.decisions).toEqual(savedProvenance.decisions);
});

it("preserves edits and blocks stale saves when the committed revision cannot be refreshed, then recovers", async () => {
  harness.state.values.other = { overview: "Keep this unrelated edit" };
  harness.state.dirty.push("other");
  harness.api.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Draft read unavailable"));
  await button(render(), "Save draft").props.onClick();
  const failed = render();
  expect(text(failed)).toContain("Draft read unavailable");
  expect(text(failed)).not.toContain("Draft saved.");
  expect(field(failed, "overview").props.disabled).toBe(true);
  expect(button(failed, "Save draft").props.disabled).toBe(true);
  expect(harness.state.values.entry).toEqual(selected);
  expect(harness.dispatch).not.toHaveBeenCalledWith({ type: "saved", id: "entry" });

  harness.api.mockResolvedValueOnce(authoritative);
  await button(failed, "Load saved revision").props.onClick();
  const recovered = render();
  expect(field(recovered, "overview").props.disabled).toBe(false);
  expect(field(recovered, "main_address").props.value).toEqual(selected.main_address);
  expect(harness.state.values.other).toEqual({ overview: "Keep this unrelated edit" });
  expect(harness.state.dirty).toEqual(["other"]);
  expect(text(recovered)).not.toContain("Draft read unavailable");
});

it("keeps local edits and the API error when the save itself fails", async () => {
  harness.api.mockRejectedValueOnce(new Error("Revision write unavailable"));
  await button(render(), "Save draft").props.onClick();
  const failed = render();
  expect(text(failed)).toContain("Revision write unavailable");
  expect(text(failed)).not.toContain("Draft saved.");
  expect(button(failed, "Save draft").props.disabled).toBe(false);
  expect(harness.state.values.entry).toEqual(selected);
  expect(harness.dispatch).not.toHaveBeenCalledWith({ type: "saved", id: "entry" });
  expect(harness.api).toHaveBeenCalledTimes(1);
});


it("selects one offering at a time while preserving each offering's unsaved fields", () => {
  const offerings = ["First service", "Second service"].map((name, index) => ({
    ...original, id: `offering-${index}`, kind: "offering",
    content: { ...createEntryDefault("offering", `offering-${index}`), name },
  }));
  harness.state = { category: "offering", values: {}, provenance: {}, dirty: [] };
  const selectOffering = (tree: ReactElement<any>[], name: string) => tree.find((node) =>
    node.type === "button" && elements(node).some((child) => child.type === "strong" && child.props.children === name),
  )!;
  expect(field(render(offerings), "name").props.value).toBe("First service");
  selectOffering(render(offerings), "Second service").props.onClick();
  const second = render(offerings);
  expect(second.filter((node) => node.props.name === "name")).toHaveLength(1);
  expect(field(second, "name").props.value).toBe("Second service");
  field(second, "description").props.onChange("Local second description");
  selectOffering(render(offerings), "First service").props.onClick();
  expect(field(render(offerings), "description").props.value).toBeNull();
  selectOffering(render(offerings), "Second service").props.onClick();
  expect(field(render(offerings), "description").props.value).toBe("Local second description");
  expect(harness.state.dirty).toContain("offering-1");
});

it("selects a newly added offering without discarding the previous offering's edits", () => {
  const offering = {
    ...original, id: "existing", kind: "offering",
    content: { ...createEntryDefault("offering", "existing"), name: "Existing service" },
  };
  harness.state = { category: "offering", values: {}, provenance: {}, dirty: [] };
  field(render([offering]), "description").props.onChange("Keep this description");
  const add = render([offering]).find((node) => node.type === "button" &&
    Array.isArray(node.props.children) && node.props.children.includes("offering"))!;
  add.props.onClick();
  const added = render([offering]);
  expect(field(added, "name").props.value).toBeNull();
  expect(added.filter((node) => node.props.name === "name")).toHaveLength(1);
  expect(harness.state.values.existing.description).toBe("Keep this description");
  const selectedButton = added.find((node) => node.type === "button" && node.props["aria-current"] === "true")!;
  expect(text(elements(selectedButton))).toContain("Untitled offering 2");
});
