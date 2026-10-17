# MoFlo Cloud interface

The application uses the owner's MoFlo Cloud screenshots as its visual reference: a compact header, a narrow icon navigation rail, blue accents, a light gray canvas, and white cards with rounded borders. The existing company knowledge, evidence and export functions remain the source of truth.

## Figma references

The following frames were read through the Figma connector:

- [Cloud workspace and company cards, frame 24:2697](https://www.figma.com/design/QwMAzEWQTK8nSiFjojBfQS/MoFlo?node-id=24-2697) documents the signed-in workspace, navigation, General Info, brand presentation and observed typography. It specifies Poppins for the application, a 30px / 37.5px company title at weight 600, and uppercase 14px / 20px card headings at weight 600.
- [Public Knowledge page audit, frame 7:300](https://www.figma.com/design/QwMAzEWQTK8nSiFjojBfQS/MoFlo?node-id=7-300) records the public marketing page's section layout and evidence. It describes a different page from the authenticated workspace.

These are design audit boards. Their Inter annotation typography and decorative board backgrounds are not application components. The owner's screenshots provide the application layout reference; the workspace audit supplies the documented typography and component observations. Poppins is served locally, while the existing Noto Sans files remain available to document exports.

## Navigation and page layout

- The shared header identifies MoFlo Cloud and provides the real account action. The rail links to the company list and, when a company is selected, its workspace and knowledge viewer.
- The company dashboard retains company search, creation, archive filtering and workspace access.
- The workspace uses a compact category selector instead of the previous large category sidebar. General Info presents company facts in a summary banner and grouped cards.
- Customers & Industry and Sales & Marketing organize existing fields into focused cards. They share the underlying Market & Customers entry; an entry's save and review controls apply to that whole entry, as explained in the interface.
- Business Offerings uses a selectable list and one offering editor at a time. Switching offerings preserves pending edits. Each offering retains its own review and history.
- Branding, people, source evidence, scrape controls, proposals, version publication and document exports remain available. Site Knowledge opens the existing knowledge viewer.
- Small screens stack cards and offering panels; navigation and actions remain accessible without requiring a desktop viewport.

## Knowledge viewer at `/knowledge/view`

- The viewer presents one company's knowledge, from the current draft or a saved version, in the same frame as the workspace: a top row with a "Company" tab on the left and the "Knowledge section" selector on the right, one large white card, and a tip bar beneath it.
- The selector lists General Info, Customers & Industry, Sales & Marketing, Business Offerings, Brand Identity, Site Knowledge and All sections. The `section` URL parameter (`general`, `customers`, `sales`, `offerings`, `brand`, `site`, `all`) selects one; a missing or unknown value opens General Info. The page reads it on the server, and changing the selector updates the URL without reloading.
- Each section opens with a pale-blue summary banner followed by a grid of cards. General Info shows the company name with Founded, Employees and Legal entity, then Headquarters, Alternate names, Overview and Founding story. Customers & Industry shows the industry with counts of groupings, locations, buyers and suppliers, then Business model, Company role, Industry outlook and chip cards for Industry groupings, Service locations, Buyers and Suppliers. Sales & Marketing shows the company name with one column per social link, then Pitch, Ideal persona, Customer needs, Channels, Calls to action and Funnels.
- Values are text, never form controls. A card with no value shows a dashed empty state with a "+ Add" link to the editor, opened on the entry kind that holds the field. Chip cards show one outlined chip per item and a dashed add chip. Missing banner stats show "+ year", "+ count" and similar links. Nothing is invented: there is no revenue figure because the data model has none.
- Evidence stays with the values. Each card, and each banner stat, carries the existing evidence control at its right edge, for the draft and for saved versions: it opens onto the exact source excerpt, source link, user correction and the "Historical generated" or "Historical inferred" label. Where a field is empty, partial or contested, the reason is printed in the card ("Unknown · Not assessed", "Partial", "Conflicting sources", "Not found in checked pages"), because unknown is not evidence of absence. The latest-crawl source-coverage panel sits under the tip bar. A persona with no name or role is shown under its organization type or a numbered neutral heading; no name is invented.
- Business Offerings, Brand Identity, Site Knowledge and All sections show a short notice until their content is built.
- The version selector, company switcher, display modes (Profile, Cards, Table, Detail, Json), document export, JSON download and "Open current draft" sit in a slim toolbar above the card. Profile is the reference layout; the other modes keep their search and filter row. In a draft, a collapsed "Review draft entries" list under the tip bar offers Edit draft, History and Remove from future versions for every entry.

## Scope

This is a presentation change. It does not add artificial intelligence, notification counts, external applications or placeholder content from the reference images. Company facts and counts come from the current draft. Existing membership permissions, conflict handling, citations, revisions, unsaved navigation warnings and immutable saved versions continue to apply.

Verification uses the existing unit suite, type checking, lint and production build, followed by a representative browser walkthrough of category navigation, offering selection, edits, save/review controls and exports. Screenshots record the resulting interface; visual details do not require snapshot tests.
