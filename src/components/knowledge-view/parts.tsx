import Link from "next/link";
import type { ReactNode } from "react";
import type { EntryKind } from "@/contracts";
import { Icon, type IconName } from "../icons";

/** Where "+ Add" leads: the editor, opened on the entry kind that holds the value. */
export const addHref = (companyId: string, kind: EntryKind) =>
  `/knowledge?companyId=${companyId}&category=${kind}`;

export function KnowledgeCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="knowledge-view__card">
      <h3 className="knowledge-view__card-title">{title}</h3>
      <p className="knowledge-view__card-subtitle">{subtitle}</p>
      {children}
    </section>
  );
}

export function EmptyBox({ title, hint, href }: { title: string; hint: string; href: string }) {
  return (
    <div className="knowledge-view__empty">
      <p className="knowledge-view__empty-title">{title}</p>
      <p className="knowledge-view__empty-hint">{hint}</p>
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
  children,
}: {
  label: string;
  title: string;
  placeholder?: boolean;
  icon?: IconName;
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
