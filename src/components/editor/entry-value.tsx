"use client";
import { ArrowUpRight } from "../shared/icons";
import type { CitationContext, EntryProvenance } from "@/contracts";
import { CitationPopover, safeHref } from "../shared/citation-popover";
import { labelOf } from "./business-fields";
export function ValueView({
  value,
  path,
  provenance,
  citationContext,
  approved,
  label,
}: {
  value: unknown;
  path: string;
  provenance: EntryProvenance;
  citationContext?: CitationContext;
  approved: boolean;
  label?: string;
}) {
  if (Array.isArray(value)) {
    return (
      <div className="entry-value">
        <div className="entry-value__label">
          {label}
          <CitationPopover
            path={path}
            provenance={provenance}
            citationContext={citationContext}
            approved={approved}
          />
        </div>
        {value.length ? (
          value.map((item, i) => (
            <div
              className="entry-value__children"
              key={
                item && typeof item === "object" && "id" in item
                  ? String(item.id)
                  : i
              }
            >
              <ValueView
                value={item}
                path={`${path}/${item && typeof item === "object" && "id" in item ? `@${item.id}` : i}`}
                provenance={provenance}
                citationContext={citationContext}
                approved={approved}
              />
            </div>
          ))
        ) : (
          <span className="muted">No values recorded</span>
        )}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div>
        {Object.entries(value)
          .filter(([key]) => key !== "id")
          .map(([key, child]) => (
            <ValueView
              key={key}
              value={child}
              path={`${path}/${key}`}
              provenance={provenance}
              citationContext={citationContext}
              approved={approved}
              label={labelOf(key)}
            />
          ))}
      </div>
    );
  }
  return (
    <div className="entry-value">
      <span className="entry-value__label">
        {label}
        <CitationPopover
          path={path}
          provenance={provenance}
          citationContext={citationContext}
          approved={approved}
        />
      </span>
      <span className="entry-value__text">
        {value === null ? (
          <span className="muted">Unknown</span>
        ) : typeof value === "string" && /^https?:\/\//.test(value) ? (
          <a href={safeHref(value)} target="_blank" rel="noopener noreferrer">
            {value} <ArrowUpRight />
          </a>
        ) : typeof value === "boolean" ? (
          value ? (
            "Yes"
          ) : (
            "No"
          )
        ) : (
          String(value)
        )}
      </span>
    </div>
  );
}
