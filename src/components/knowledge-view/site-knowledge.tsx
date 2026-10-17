import Link from "next/link";
import { safeHref } from "../citation-popover";
import { textOrNull, type ViewSiteLinks } from "./data";
import { addHref, CoverageNote, ItemSource, Source } from "./parts";
import { SiteAddPage } from "./site-add-page";
import { SiteImport } from "./site-import";

const PATH = "/site_links/links";

/**
 * Site Knowledge: the company's internal pages. An editable draft adds pages from a dialog and can
 * "Import from website"; a saved snapshot or a viewer gets "+ Add page" as a link to the editor.
 */
export function SiteKnowledge({
  companyId,
  site,
  canEdit,
  actorId,
  website = null,
  importBlocked = false,
  onSaved,
  level: Heading = "h2",
}: {
  companyId: string;
  site: ViewSiteLinks;
  canEdit: boolean;
  actorId: string;
  /** The Company Foundation website: a page added here must be on this site. */
  website?: string | null;
  /** The view is older than a saved import; the picker stays disabled until it is reloaded. */
  importBlocked?: boolean;
  onSaved: () => Promise<void>;
  /** The card heading's level: h3 when the card sits under a section heading. */
  level?: "h2" | "h3";
}) {
  const { links, evidence } = site;
  return (
    <section className="knowledge-view__card knowledge-view__site">
      <div className="knowledge-view__site-head">
        <div className="knowledge-view__site-intro">
          <div className="knowledge-view__card-head">
            <Heading className="knowledge-view__card-title">Sitemap / Internal Links</Heading>
            <Source evidence={evidence} path={PATH} filled={links.length > 0} name="internal links" />
          </div>
          <p className="knowledge-view__card-subtitle">
            Pages on your site that content can link to, such as blog posts, emails and social posts.
          </p>
        </div>
        <div className="knowledge-view__site-actions">
          {canEdit && actorId ? (
            <>
              <SiteAddPage companyId={companyId} actorId={actorId} site={site} website={website} blocked={importBlocked} onSaved={onSaved} />
              <SiteImport companyId={companyId} actorId={actorId} site={site} blocked={importBlocked} onSaved={onSaved} />
            </>
          ) : (
            <Link className="knowledge-view__site-add" href={addHref(companyId, "site_links")}>+ Add page</Link>
          )}
        </div>
      </div>
      {links.length === 0 ? (
        <p className="knowledge-view__site-empty">
          No internal links yet. Add pages to list the places your content can link to.
        </p>
      ) : (
        <ul className="knowledge-view__site-list">
          {links.map((link) => {
            const href = safeHref(link.url);
            const note = textOrNull(link.note);
            return (
              <li key={link.id}>
                <strong className="knowledge-view__site-title">{link.title}</strong>
                <ItemSource evidence={evidence} path={`${PATH}/@${link.id}`} name={link.title.trim()} />
                {href ? (
                  <a className="knowledge-view__site-url" href={href} target="_blank" rel="noopener noreferrer">{link.url}</a>
                ) : (
                  <span className="knowledge-view__site-url">{link.url}</span>
                )}
                {note && <small className="knowledge-view__site-note">{note}</small>}
              </li>
            );
          })}
        </ul>
      )}
      <CoverageNote evidence={evidence} path={PATH} empty={links.length === 0} />
    </section>
  );
}
