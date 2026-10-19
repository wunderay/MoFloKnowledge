import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import type { EntryKind } from "@/contracts";
import { CitationPopover } from "../shared/citation-popover";
import { Icon, type IconName } from "../shared/icons";
import { coverageFor, coverageLabel, fieldProvenance, hasClaim, hasMarkedOrigin, type Evidence } from "./data";

/** Where "+ Add" leads: the editor, opened on the entry kind that holds the value. */
export const addHref = (companyId: string, kind: EntryKind) =>
  `/knowledge/view?companyId=${companyId}&category=${kind}`;

/**
 * Whether the evidence layer (source controls, item markers and coverage notes) is shown. The saved-version view shows it;
 * the Scrape & Build hub at /knowledge hides it, as the MoFlo reference has none.
 */
const EvidenceShown = createContext(true);
export const EvidenceVisibility = EvidenceShown.Provider;
/** True outside the hub. The hub (evidence hidden) also edits lists and people in place, where the saved-version view links to the hub. */
export const useEvidenceShown = () => useContext(EvidenceShown);

/**
 * The existing evidence control for a field: its sources and exact excerpts,
 * user corrections, historical generated/inferred labels and coverage reasons.
 * Shown for filled fields, and for empty ones only when coverage was assessed.
 */
export function Source({
  evidence,
  path,
  filled,
  name,
}: {
  evidence: Evidence;
  path: string;
  filled: boolean;
  name?: string;
}) {
  const shown = useContext(EvidenceShown);
  if (!shown || (!filled && !coverageFor(evidence.provenance, path) && !hasClaim(evidence.provenance, path))) {
    return null;
  }
  return (
    <CitationPopover
      path={path}
      provenance={fieldProvenance(evidence.provenance, path)}
      approved={evidence.approved}
      citationContext={evidence.citationContext}
      name={name}
    />
  );
}

/**
 * A per-item marker for list fields: shown only on the items whose own claims are
 * user corrections or historical generated/inferred wording, so the closed view
 * says which item carries which origin. Items backed by sources rely on the field's control.
 */
export function ItemSource({ evidence, path, name }: { evidence: Evidence; path: string; name: string }) {
  if (!hasMarkedOrigin(evidence.provenance, path)) {
    return null;
  }
  // The path ends in an item id, so the control is named by the item's own text instead.
  return <Source evidence={evidence} path={path} filled name={name} />;
}

/** Why a field is unknown, partial or contested, in plain text. Shown for empty fields and for any field not fully found. */
export function CoverageNote({
  evidence,
  path,
  empty,
  label,
}: {
  evidence: Evidence;
  path: string;
  empty: boolean;
  label?: string;
}) {
  const shown = useContext(EvidenceShown);
  const assessment = coverageFor(evidence.provenance, path);
  if (!shown || (!empty && (!assessment || assessment.status === "found"))) {
    return null;
  }
  return (
    <p className="knowledge-view__coverage">
      {label && <>{label}: </>}
      <strong>{coverageLabel(assessment?.status)}</strong>
      {" — "}
      {assessment?.reason ?? "No assessment is recorded for this field."}
    </p>
  );
}

export function KnowledgeCard({
  title,
  subtitle,
  source,
  children,
}: {
  title: string;
  subtitle: string;
  source?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="knowledge-view__card">
      <div className="knowledge-view__card-head">
        <h3 className="knowledge-view__card-title">{title}</h3>
        {source}
      </div>
      <p className="knowledge-view__card-subtitle">{subtitle}</p>
      {children}
    </section>
  );
}

/**
 * A dashed empty state. An editable draft passes `action`, the control that adds the value in place; a read-only view passes
 * `href`, a link to the hub where the draft is edited.
 */
export function EmptyBox({
  title,
  hint,
  href,
  action,
  note,
}: {
  title: string;
  hint: string;
  href?: string;
  action?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="knowledge-view__empty">
      <p className="knowledge-view__empty-title">{title}</p>
      <p className="knowledge-view__empty-hint">{hint}</p>
      {note}
      {action ?? (href && <Link className="knowledge-view__add" href={href}>+ Add</Link>)}
    </div>
  );
}

/** One labelled value in a detail panel: an optional icon, the label with its evidence control, and the value or its empty state. */
export function Field({
  label,
  icon,
  source,
  children,
}: {
  label: string;
  icon?: IconName;
  source: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="knowledge-view__field">
      {icon && (
        <span className="knowledge-view__field-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
      )}
      <div className="knowledge-view__field-body">
        <p className="knowledge-view__mini-label">{label}{source}</p>
        {children}
      </div>
    </div>
  );
}

export interface ChipItem { id: string; label: string; detail?: string | null; mark?: ReactNode }

/** One outlined pill per item. An empty list is a single dashed "+ Add" pill; a filled list ends with a dashed "Add" pill. */
export function Chips({ items, href, noun }: { items: ChipItem[]; href: string; noun: string }) {
  if (items.length === 0) {
    return (
      <div className="knowledge-view__chips">
        <Link className="knowledge-view__chip knowledge-view__chip--add" href={href}>+ Add</Link>
      </div>
    );
  }
  return (
    <ul className="knowledge-view__chips">
      {items.map((item) => (
        <li className="knowledge-view__chip" key={item.id}>
          {item.label}
          {item.detail && <small>{item.detail}</small>}
          {item.mark}
        </li>
      ))}
      <li className="knowledge-view__chip-slot">
        <Link
          className="knowledge-view__chip knowledge-view__chip--add knowledge-view__chip--add-more"
          href={href}
          aria-label={`Add ${noun}`}
        >
          Add
        </Link>
      </li>
    </ul>
  );
}

export function Banner({
  label,
  title,
  titleFeedback,
  caption,
  placeholder = false,
  icon,
  source,
  note,
  children,
}: {
  label: string;
  /** The heading: text, or the control that edits it in place. */
  title: ReactNode;
  /** What saving the heading reports, shown under it (outside the heading, whose text it would change). */
  titleFeedback?: ReactNode;
  /** Small text under the heading; label, heading and caption then form one first cell. */
  caption?: string;
  placeholder?: boolean;
  icon?: IconName;
  source?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  // Label, heading and stats are siblings so the whole banner is one container.
  const lead = (
    <>
      <p className="knowledge-view__banner-label">{label}</p>
      <h2 className={`knowledge-view__banner-title${placeholder ? " knowledge-view__banner-title--placeholder" : ""}`}>
        {title}
        {source}
      </h2>
      {titleFeedback !== undefined && <div className="knowledge-view__banner-feedback">{titleFeedback}</div>}
      {caption && <p className="knowledge-view__banner-caption">{caption}</p>}
    </>
  );
  return (
    <div className={`knowledge-view__banner${icon ? " knowledge-view__banner--icon" : ""}`}>
      {icon && (
        <span className="knowledge-view__banner-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
      )}
      {caption ? <div className="knowledge-view__banner-lead">{lead}</div> : lead}
      {children}
      {note}
    </div>
  );
}

/** A count in a banner: the number, which a screen reader hears with its noun in the right form ("1 Buyer", "2 Buyers"). */
export function Count({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <span>
      {n}
      <span className="sr-only"> {n === 1 ? one : many}</span>
    </span>
  );
}

export interface Stat { label: string; icon: IconName; value: ReactNode }

export function Stats({ stats, counts = false }: { stats: Stat[]; counts?: boolean }) {
  return (
    <dl className={`knowledge-view__stats${counts ? " knowledge-view__stats--counts" : ""}`}>
      {stats.map((stat) => (
        <div className="knowledge-view__stat" key={stat.label}>
          <dt>
            {!counts && <Icon name={stat.icon} size={14} />}
            {stat.label}
          </dt>
          <dd>
            {counts && <span className="knowledge-view__stat-icon"><Icon name={stat.icon} size={16} /></span>}
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StatAdd({ href, children }: { href: string; children: string }) {
  return <Link className="knowledge-view__stat-add" href={href}>{children}</Link>;
}
