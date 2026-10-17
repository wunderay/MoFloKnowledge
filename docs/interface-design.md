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

## Scope

This is a presentation change. It does not add artificial intelligence, notification counts, external applications or placeholder content from the reference images. Company facts and counts come from the current draft. Existing membership permissions, conflict handling, citations, revisions, unsaved navigation warnings and immutable saved versions continue to apply.

Verification uses the existing unit suite, type checking, lint and production build, followed by a representative browser walkthrough of category navigation, offering selection, edits, save/review controls and exports. Screenshots record the resulting interface; visual details do not require snapshot tests.
