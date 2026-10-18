// Key people / All sections views: the shared page render (knowledge-view-render) with the `person` URL parameter.
import type { KnowledgeBaseExport } from "../../src/contracts";
import { VERSIONS, buildDraft, type Draft } from "./knowledge-view-fixtures";
import { parse, selectorItems, type Page } from "./knowledge-view-dom";
import { renderViewPage } from "./knowledge-view-render";

export interface PeopleRenderOptions {
  section?: string;
  /** Value for the `person` URL parameter; omitted when undefined. */
  person?: string;
  draft?: Draft;
  snapshot?: { payload: KnowledgeBaseExport; versionId: string };
}

export const renderPeople = (opts: PeopleRenderOptions): Promise<string> =>
  renderViewPage({ ...opts, versions: VERSIONS });

/** The identifier the section selector submits for `label` (read from the rendered selector). */
export async function sectionIdFor(label: "Key People" | "All sections"): Promise<string> {
  const page = parse(await renderPeople({ draft: buildDraft() }));
  const item = selectorItems(page).find((i) => i.label === label);
  if (!item?.value) {
    throw new Error(`the "Knowledge section" selector should list "${label}" with an identifier`);
  }
  return item.value;
}
export async function openPeople(opts: Omit<PeopleRenderOptions, "section"> = {}): Promise<Page> {
  return parse(await renderPeople({ ...opts, section: await sectionIdFor("Key People") }));
}
export async function openAll(opts: Omit<PeopleRenderOptions, "section"> = {}): Promise<Page> {
  return parse(await renderPeople({ ...opts, section: await sectionIdFor("All sections") }));
}
