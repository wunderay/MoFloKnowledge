"use client";
import type { ReactNode } from "react";
import type {
  BusinessEntry,
  CitationContext,
  EntryKind,
  EntryProvenance,
  ReviewStatus,
} from "@/contracts";
import { CATEGORY_SPECS, labelOf } from "./business-fields";
import { CitationPopover, safeHref } from "./citation-popover";
import { StatusBadge } from "./ui";

type ProfileEntry = {
  id: string;
  kind: EntryKind;
  content: BusinessEntry;
  provenance: EntryProvenance;
  review_status: ReviewStatus;
};
type FieldGroup = { title: string; fields: string[] };
const GROUPS: Partial<Record<EntryKind, FieldGroup[]>> = {
  company_foundation: [
    { title: "Overview", fields: ["overview"] },
    { title: "Company details", fields: ["website", "industry", "business_model", "company_role", "year_founded", "legal_entity_type", "employee_count"] },
    { title: "Locations & names", fields: ["main_address", "other_locations", "service_locations", "alternative_company_names"] },
  ],
  positioning: [
    { title: "Pitch & story", fields: ["company_pitch", "founding_story"] },
  ],
  market_and_customers: [
    { title: "Who they serve", fields: ["target_buyers", "ideal_customer_personas", "industry_groupings"] },
    { title: "Customer needs", fields: ["customer_needs", "industry_outlook"] },
    { title: "Observed contact options", fields: ["channels", "ctas"] },
    { title: "Funnels", fields: ["funnels"] },
    { title: "Suppliers & partners", fields: ["suppliers_and_partners"] },
  ],
  offering: [
    { title: "Service or product", fields: ["description", "offering_type", "category", "features", "pricing", "url"] },
  ],
  key_person: [
    { title: "Professional profile", fields: ["title", "role", "background_or_relevance", "gender"] },
  ],
  branding_and_style: [
    { title: "Style", fields: ["writing_style_description", "art_style_description"] },
    { title: "Observed design", fields: ["fonts", "brand_colors", "logos"] },
  ],
  online_presence: [
    { title: "Company profiles", fields: ["social_media_links"] },
  ],
};
const ORDER: EntryKind[] = [
  "company_foundation", "positioning", "market_and_customers", "offering",
  "key_person", "branding_and_style", "online_presence",
];
const LABELS: Record<string, string> = {
  company_foundation: "Company", positioning: "Pitch & story",
  market_and_customers: "Market & customers", key_person: "People",
  offering: "Offerings", branding_and_style: "Branding & style",
  online_presence: "Online presence", ctas: "Calls to action",
  alternative_company_names: "Also known as", background_or_relevance: "Background",
  url: "Website", profile_url: "Profile", raw: "Original wording", line1: "Address line 1", line2: "Address line 2",
  brand_confirmed: "Confirmed brand guidance", observations: "Observation methods",
};
function fieldLabel(key: string) {
  return LABELS[key] ?? CATEGORY_SPECS[key]?.label ?? labelOf(key);
}
export function hasProfileValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasProfileValue);
  if (typeof value === "object")
    return Object.entries(value).some(([key, child]) => key !== "id" && hasProfileValue(child));
  return true;
}

/** A display-only prefix. The complete, unchanged value is always disclosed. */
export function passagePreview(text: string, limit = 360): string {
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit);
  const sentence = [...prefix.matchAll(/[.!?](?=\s)/g)].at(-1)?.index;
  if (sentence !== undefined && sentence > limit / 2)
    return text.slice(0, sentence + 1);
  const boundary = prefix.lastIndexOf(" ");
  return text.slice(0, boundary > 0 ? boundary : limit);
}
export function ProfilePassage({ text }: { text: string }) {
  const preview = passagePreview(text);
  if (preview === text) return <p className="company-profile__passage">{text}</p>;
  return (
    <div>
      <p className="company-profile__passage">{preview}…</p>
      <details className="company-profile__disclosure">
        <summary>Read full passage</summary>
        <p className="company-profile__passage">{text}</p>
      </details>
    </div>
  );
}
function itemPath(path: string, value: unknown, index: number) {
  return `${path}/${value && typeof value === "object" && "id" in value ? `@${value.id}` : index}`;
}
function ProfileValue({ value, path, entry, citationContext }: {
  value: unknown; path: string; entry: ProfileEntry; citationContext?: CitationContext;
}) {
  const source = (target: string) => (
    <CitationPopover path={target} provenance={entry.provenance}
      citationContext={citationContext} approved={entry.review_status === "approved"} />
  );
  if (Array.isArray(value)) {
    const items = value.map((item, index) => ({ item, index }))
      .filter(({ item }) => hasProfileValue(item));
    const list = (selection: typeof items) => (
      <ul className="company-profile__list">
        {selection.map(({ item, index }) => (
          <li key={itemPath(path, item, index)}>
            <ProfileValue value={item} path={itemPath(path, item, index)} entry={entry} citationContext={citationContext} />
          </li>
        ))}
      </ul>
    );
    return (
      <div>
        {list(items.slice(0, 6))}
        {items.length > 6 && (
          <details className="company-profile__disclosure">
            <summary>Show {items.length - 6} more items · {items.length} total</summary>
            {list(items.slice(6))}
          </details>
        )}
      </div>
    );
  }
  if (value && typeof value === "object") {
    const fields = Object.entries(value).filter(([key, child]) => key !== "id" && hasProfileValue(child));
    // Put the item's own human label first, without JSON wrapper labels.
    const primary = ["text", "name", "label", "family", "hex", "platform", "raw"]
      .map((key) => fields.find(([field]) => key === field)).find(Boolean);
    const remaining = fields.filter(([key]) => key !== primary?.[0]);
    return (
      <div>
        {primary && (
          <div className="company-profile__cited-text">
            {primary[0] === "hex" && /^#[0-9a-f]{6}$/i.test(String(primary[1])) && (
              <span className="company-profile__swatch" style={{ backgroundColor: String(primary[1]) }} aria-hidden="true" />
            )}
            <ProfileValue value={primary[1]} path={`${path}/${primary[0]}`} entry={entry} citationContext={citationContext} />
            {source(`${path}/${primary[0]}`)}
          </div>
        )}
        {remaining.length > 0 && (
          <dl className="company-profile__facts company-profile__facts--nested">
            {remaining.map(([key, child]) => (
              <div key={key}>
                <dt>{fieldLabel(key)} {source(`${path}/${key}`)}</dt>
                <dd><ProfileValue value={child} path={`${path}/${key}`} entry={entry} citationContext={citationContext} /></dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  }
  if (typeof value === "string" && /^https?:\/\//.test(value)) return (
    <a className="company-profile__link" href={safeHref(value)} target="_blank" rel="noopener noreferrer">{value} ↗</a>
  );
  if (typeof value === "string") {
    const isMetadata = /\/(?:classification|kind|channel_type|observations\/\d+)$/.test(path);
    return <ProfilePassage text={isMetadata ? labelOf(value) : value} />;
  }
  return <span>{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</span>;
}
function coverageFor(entry: ProfileEntry, path: string) {
  return entry.provenance.coverage.find((item) => item.targets.some(
    (target) => path === target || path.startsWith(`${target}/`),
  ));
}
function ProfileSection({ entry, citationContext, actions }: {
  entry: ProfileEntry; citationContext?: CitationContext; actions?: ReactNode;
}) {
  const root = entry.kind === "key_person" ? `/key_people/@${(entry.content as { id: string }).id}`
    : entry.kind === "offering" ? `/offerings/@${(entry.content as { id: string }).id}` : `/${entry.kind}`;
  const content = entry.content as Record<string, unknown>;
  const fields = Object.keys(CATEGORY_SPECS[entry.kind]!.fields).filter((key) => key !== "name");
  const groups = GROUPS[entry.kind] ?? [{ title: fieldLabel(entry.kind), fields }];
  const coveredFields = new Set(groups.flatMap((group) => group.fields));
  const extra = fields.filter((key) => !coveredFields.has(key));
  const allGroups = extra.length ? [...groups, { title: "More details", fields: extra }] : groups;
  const gaps = fields.filter((key) => {
    const assessment = coverageFor(entry, `${root}/${key}`);
    return !hasProfileValue(content[key]) || (assessment && assessment.status !== "found");
  });
  const title = typeof content.name === "string" && content.name ? content.name : fieldLabel(entry.kind);
  return (
    <article className="company-profile__entry">
      <div className="company-profile__entry-heading">
        <h3>
          {title}{" "}
          {"name" in content && (
            <CitationPopover path={`${root}/name`} provenance={entry.provenance}
              citationContext={citationContext} approved={entry.review_status === "approved"} />
          )}
        </h3>
        <StatusBadge value={entry.review_status} />
      </div>
      {entry.kind === "branding_and_style" && (
        <p className="company-profile__context">Website observations describe what was captured. They do not confirm brand guidance or assess visual meaning.</p>
      )}
      {entry.kind === "market_and_customers" && (
        <p className="company-profile__context">Contact options are observed website entry points. They do not establish a completed customer journey.</p>
      )}
      {allGroups.map((group) => {
        const populated = group.fields.filter((key) => hasProfileValue(content[key]));
        if (!populated.length) return null;
        return (
          <section className="company-profile__group" key={group.title}>
            <h4>{group.title}</h4>
            <dl className="company-profile__facts">
              {populated.map((key) => (
                <div key={key}>
                  <dt>{fieldLabel(key)} <CitationPopover path={`${root}/${key}`} provenance={entry.provenance} citationContext={citationContext} approved={entry.review_status === "approved"} /></dt>
                  <dd><ProfileValue value={content[key]} path={`${root}/${key}`} entry={entry} citationContext={citationContext} /></dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      {gaps.length > 0 && (
        <details className="company-profile__disclosure company-profile__disclosure--coverage">
          <summary>Coverage & unknowns · {gaps.length} fields</summary>
          <p>Unknown values are not evidence that a fact is absent.</p>
          <dl>
            {gaps.map((key) => {
              const assessment = coverageFor(entry, `${root}/${key}`);
              const status = assessment?.status;
              const statusLabel = status === "partial" ? "Partial" : status === "conflict" ? "Conflicting sources"
                : status === "not_found" ? "Not found in checked pages" : status === "found" ? "Unknown" : "Unknown · Not assessed";
              return (
                <div key={key}>
                  <dt>{fieldLabel(key)} — {statusLabel}</dt>
                  <dd>{assessment?.reason ?? "No assessment is recorded for this field."}</dd>
                </div>
              );
            })}
          </dl>
        </details>
      )}
      {actions && <div className="company-profile__actions">{actions}</div>}
    </article>
  );
}
export function CompanyProfile<T extends ProfileEntry>({ entries, citationContext, actions }: {
  entries: T[]; citationContext?: CitationContext; actions?: (entry: T) => ReactNode;
}) {
  const kinds = ORDER.filter((kind) => entries.some((entry) => entry.kind === kind));
  return (
    <div className="company-profile">
      <nav className="company-profile__nav" aria-label="Company profile sections">
        {kinds.map((kind) => <a key={kind} href={`#profile-${kind}`}>{fieldLabel(kind)}</a>)}
      </nav>
      <div className="company-profile__body">
        {kinds.map((kind) => (
          <section className="company-profile__section" id={`profile-${kind}`} key={kind}>
            <h2>{fieldLabel(kind)}</h2>
            {entries.filter((entry) => entry.kind === kind).map((entry) => (
              <ProfileSection key={entry.id} entry={entry} citationContext={citationContext} actions={actions?.(entry)} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
