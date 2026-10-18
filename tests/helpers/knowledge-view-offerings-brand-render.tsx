// Offerings / Brand views: the shared page render (knowledge-view-render) with the `offering` URL parameter,
// shown the way a viewer sees it.
import type { KnowledgeBaseExport } from "../../src/contracts";
import type { Draft } from "./knowledge-view-fixtures";
import { VERSIONS, buildDraft } from "./knowledge-view-fixtures";
import { parse, selectorItems, type Page } from "./knowledge-view-dom";
import { renderViewPage } from "./knowledge-view-render";

export interface OBRenderOptions {
  section?: string;
  /** Value for the `offering` URL parameter; omitted when undefined. */
  offering?: string;
  draft?: Draft;
  snapshot?: { payload: KnowledgeBaseExport; versionId: string };
}

// These read-only tests look at the view as a viewer sees it: an owner's draft edits in place (which has its own tests),
// and its controls are not part of what they check.
export const renderOB = (opts: OBRenderOptions): Promise<string> =>
  renderViewPage({ ...opts, versions: VERSIONS, asViewer: true });

/** The identifier the section selector submits for `label` (read from the rendered selector). */
export async function sectionIdOf(label: "Business Offerings" | "Brand Identity"): Promise<string> {
  const page = parse(await renderOB({ draft: buildDraft() }));
  const item = selectorItems(page).find((i) => i.label === label);
  if (!item?.value) {
    throw new Error(`the "Knowledge section" selector should list "${label}" with an identifier`);
  }
  return item.value;
}

export async function openOfferings(opts: Omit<OBRenderOptions, "section"> = {}): Promise<Page> {
  return parse(await renderOB({ ...opts, section: await sectionIdOf("Business Offerings") }));
}
export async function openBrand(opts: Omit<OBRenderOptions, "section" | "offering"> = {}): Promise<Page> {
  return parse(await renderOB({ ...opts, section: await sectionIdOf("Brand Identity") }));
}
