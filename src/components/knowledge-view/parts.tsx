import Link from "next/link";
import type { ReactNode } from "react";
import type { EntryKind } from "@/contracts";
import { CitationPopover } from "../citation-popover";
import { Icon, type IconName } from "../icons";
import { coverageFor, coverageLabel, fieldProvenance, hasClaim, type Evidence } from "./data";

/** Where "+ Add" leads: the editor, opened on the entry kind that holds the value. */
export const addHref = (companyId: string, kind: EntryKind) =>
  `/knowledge?companyId=${companyId}&category=${kind}`;

/**
 * The existing evidence control for a field: its sources and exact excerpts,
 * user corrections, historical generated/inferred labels and coverage reasons.
 * Shown for filled fields, and for empty ones only when coverage was assessed.
 */
export function Source({ evidence, path, filled }: { evidence: Evidence; path: string; filled: boolean }) {
  if (!filled && !coverageFor(evidence.provenance, path) && !hasClaim(evidence.provenance, path)) return null;
  return (
    <CitationPopover
      path={path}
      provenance={fieldProvenance(evidence.provenance, path)}
      approved={evidence.approved}
      citationContext={evidence.citationContext}
    />
  );
}

/** Why a field is unknown, partial or contested, in plain text. Shown for empty fields and for any field not fully found. */
export function CoverageNote({ evidence, path, empty }: { evidence: Evidence; path: string; empty: boolean }) {
  const assessment = coverageFor(evidence.provenance, path);
  if (!empty && (!assessment || assessment.status === "found")) return null;
  return (
    <p className="knowledge-view__coverage">
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

export function EmptyBox({ title, hint, href, note }: { title: string; hint: string; href: string; note?: ReactNode }) {
  return (
    <div className="knowledge-view__empty">
      <p className="knowledge-view__empty-title">{title}</p>
      <p className="knowledge-view__empty-hint">{hint}</p>
      {note}
      <Link className="knowledge-view__add" href={href}>+ Add</Link>
    </div>
  );
}

export type ChipItem = { id: string; label: string; detail?: string | null };

/** One outlined pill per item. An empty list is a single dashed "+ Add" pill; a filled list ends with a dashed "Add" pill. */
export function Chips({ items, href, noun }: { items: ChipItem[]; href: string; noun: string }) {
  if (items.length === 0)
    return (
      <div className="knowledge-view__chips">
        <Link className="knowledge-view__chip knowledge-view__chip--add" href={href}>+ Add</Link>
      </div>
    );
  return (
    <ul className="knowledge-view__chips">
      {items.map((item) => (
        <li className="knowledge-view__chip" key={item.id}>
          {item.label}
          {item.detail && <small>{item.detail}</small>}
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
  placeholder = false,
  icon,
  source,
  children,
}: {
  label: string;
  title: string;
  placeholder?: boolean;
  icon?: IconName;
  source?: ReactNode;
  children: ReactNode;
}) {
  // Label, heading and stats are siblings so the whole banner is one container.
  return (
    <div className={`knowledge-view__banner${icon ? " knowledge-view__banner--icon" : ""}`}>
      {icon && (
        <span className="knowledge-view__banner-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
      )}
      <p className="knowledge-view__banner-label">{label}</p>
      <h2 className={`knowledge-view__banner-title${placeholder ? " knowledge-view__banner-title--placeholder" : ""}`}>
        {title}
        {source}
      </h2>
      {children}
    </div>
  );
}

export type Stat = { label: string; icon: IconName; value: ReactNode };

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
