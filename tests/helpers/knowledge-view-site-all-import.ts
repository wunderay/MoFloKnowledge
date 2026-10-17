// Helpers for driving the "Import from website" picker through the interactive runtime, and for
// checking what the UI sent to the entries API against the same contracts the server enforces.
import { expect } from "vitest";
import { entryBusiness, parseBusinessEntry, validateProvenance, EntryProvenanceSchema } from "../../src/contracts";
import { CreateEntrySchema, SaveEntrySchema } from "../../src/contracts/api-entries";
import { openView, type FakeServer, type HNode, type OpenOptions, type Req, type View } from "./knowledge-view-site-all-runtime";
import { COMPANY_ID, SITE_ENTRY_ID, inventory, labelOfPage, siteDraft, type Link, type Page } from "./knowledge-view-site-all-fixtures";

export const ENTRIES_PATH = `/api/companies/${COMPANY_ID}/entries`;
export const REVISIONS_PATH = `/api/companies/${COMPANY_ID}/entries/${SITE_ENTRY_ID}/revisions`;
export const SOURCES_PATH = `/api/companies/${COMPANY_ID}/sources`;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ImportOpen = Omit<OpenOptions, "section" | "server"> & { pages?: Page[]; inventory?: unknown; configure?: (server: FakeServer) => void };

/** The Site Knowledge section of an editable draft whose latest crawl captured `pages`. */
export function openSite(opts: ImportOpen = {}): Promise<View> {
  return openView({
    section: "Site Knowledge",
    draft: opts.draft ?? siteDraft(),
    snapshot: opts.snapshot,
    server: (server) => {
      server.sources = opts.inventory ?? inventory(opts.pages ?? []);
      opts.configure?.(server);
    },
  });
}

export function importButton(view: View): HNode {
  const buttons = view.byRole("button", /^import from website$/i);
  expect(buttons, 'one "Import from website" button').toHaveLength(1);
  return buttons[0]!;
}
/** Click "Import from website" and return the dialog that opens. */
export async function openPicker(view: View): Promise<HNode> {
  await view.click(importButton(view));
  await view.settle();
  const dialogs = view.dialogs();
  expect(dialogs, "the import button opens exactly one dialog").toHaveLength(1);
  return dialogs[0]!;
}
export const pickerDialog = (view: View): HNode | undefined => view.dialogs()[0];
export const confirmButton = (view: View, dialog: HNode): HNode | undefined => view.byRole("button", /^add selected/i, dialog)[0];
export const cancelButton = (view: View, dialog: HNode): HNode | undefined => view.byRole("button", /^cancel$/i, dialog)[0];

export type Box = { name: string; node: HNode };
export function boxes(view: View, dialog: HNode): Box[] {
  return view.byRole("checkbox", undefined, dialog).map((node) => ({ name: view.nameOf(node), node }));
}
export function boxFor(view: View, dialog: HNode, page: Page): HNode | undefined {
  const label = labelOfPage(page).toLowerCase();
  return boxes(view, dialog).find((b) => b.name.toLowerCase().includes(label))?.node;
}
export const isChecked = (node: HNode) =>
  node.props.checked === true || node.props["aria-checked"] === true || node.props["aria-checked"] === "true";
/** Check these pages' boxes, the way a person would (a disabled box does nothing). */
export async function selectPages(view: View, pages: Page[]): Promise<void> {
  for (const page of pages) {
    const dialog = pickerDialog(view)!;
    const box = boxFor(view, dialog, page);
    expect(box, `a checkbox labelled by "${labelOfPage(page)}"`).toBeDefined();
    await view.check(box!, true);
  }
  await view.settle();
}
/** Click "Add selected" and let the request finish. */
export async function confirm(view: View): Promise<boolean> {
  const dialog = pickerDialog(view);
  expect(dialog, "the picker is open").toBeDefined();
  const button = confirmButton(view, dialog!);
  expect(button, 'an "Add selected" button').toBeDefined();
  const fired = await view.click(button!);
  await view.settle();
  return fired;
}

// ---- what was sent ---------------------------------------------------------------------------------------------
export type Sent = { req: Req; kind: "create" | "revise"; content: { links: Link[] }; provenance: ReturnType<typeof EntryProvenanceSchema.parse>; body: any };
/** The only write of a flow, validated against the API's request schema, content schema and provenance rules. */
export function sentWrite(server: FakeServer, which: "create" | "revise"): Sent {
  const writes = server.writesTo(which === "create" ? "entries" : "revisions");
  expect(writes, `exactly one write to ${which === "create" ? "POST /entries" : "POST /entries/<id>/revisions"}`).toHaveLength(1);
  return validated(writes[0]!, which);
}
export function validated(req: Req, which: "create" | "revise"): Sent {
  expect(req.method).toBe("POST");
  const body = which === "create" ? CreateEntrySchema.parse(req.body) : SaveEntrySchema.parse(req.body);
  if (which === "create") expect(body).toMatchObject({ kind: "site_links" });
  const content = parseBusinessEntry("site_links", body.content) as { links: Link[] };
  const issues = validateProvenance(entryBusiness("site_links", content as never), body.provenance);
  expect(issues, "the sent provenance validates against the sent content").toEqual([]);
  return { req, kind: which, content, provenance: body.provenance, body };
}
/** Every write the UI sent, whatever its shape, for the "nothing was sent" and ">500" checks. */
export const linkCountsSent = (server: FakeServer): number[] =>
  server.writes.map((w) => (w.body?.content?.links as unknown[] | undefined)?.length ?? 0);

export const urlsOf = (links: Link[]) => links.map((l) => l.url);
export const titlesOf = (links: Link[]) => links.map((l) => l.title);
