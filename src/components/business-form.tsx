"use client";
import { useId } from "react";
import type { CitationContext, EntryProvenance } from "@/contracts";
import { CitationPopover } from "./citation-popover";
import { labelOf, newValue, type FieldSpec } from "./business-fields";
type Props = {
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  name: string;
  path: string;
  disabled?: boolean;
  provenance: EntryProvenance;
  citationContext?: CitationContext;
  approved?: boolean;
};
export function BusinessField({
  spec,
  value,
  onChange,
  name,
  path,
  disabled,
  provenance,
  citationContext,
  approved,
}: Props) {
  const id = useId();
  const label = spec.label ?? labelOf(name);
  const assessment = provenance.coverage.find((item) =>
    item.targets.some(
      (target) => target === path || path.startsWith(`${target}/`),
    ),
  );
  const missingLabel =
    assessment?.status === "not_found"
      ? "Not found in checked pages"
      : assessment?.status === "partial"
        ? "Partially checked — review coverage"
        : "Could not check";
  const evidence = (
    <CitationPopover
      path={path}
      provenance={provenance}
      citationContext={citationContext}
      approved={approved}
    />
  );
  if (spec.items) {
    const list = (Array.isArray(value) ? value : []) as Record<
      string,
      unknown
    >[];
    return (
      <fieldset className="knowledge-editor__group" disabled={disabled}>
        <legend>{label}</legend>
        <div className="section-heading">
          <span className="field__hint">
            {list.length
              ? `${list.length} item${list.length === 1 ? "" : "s"}`
              : missingLabel}
          </span>
          {evidence}
        </div>
        {list.map((item, index) => (
          <div className="knowledge-editor__repeatable" key={String(item.id)}>
            <div className="knowledge-editor__repeatable-heading">
              <strong>
                {label} {index + 1}
              </strong>
              <div className="actions">
                <button
                  type="button"
                  className="button button--quiet"
                  aria-label={`Move ${label} ${index + 1} up`}
                  disabled={disabled || index === 0}
                  onClick={() => {
                    const next = [...list];
                    [next[index - 1], next[index]] = [
                      next[index]!,
                      next[index - 1]!,
                    ];
                    onChange(next);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  aria-label={`Move ${label} ${index + 1} down`}
                  disabled={disabled || index === list.length - 1}
                  onClick={() => {
                    const next = [...list];
                    [next[index + 1], next[index]] = [
                      next[index]!,
                      next[index + 1]!,
                    ];
                    onChange(next);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button button--quiet button--danger"
                  disabled={disabled}
                  onClick={() => onChange(list.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            </div>
            <BusinessField
              spec={spec.items!}
              value={item}
              name={name}
              path={`${path}/@${item.id}`}
              disabled={disabled}
              provenance={provenance}
              citationContext={citationContext}
              approved={approved}
              onChange={(next) =>
                onChange(list.map((v, i) => (i === index ? next : v)))
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="button"
          disabled={disabled}
          onClick={() => onChange([...list, newValue(spec.items!, true)])}
        >
          ＋ Add {label.toLowerCase()}
        </button>
      </fieldset>
    );
  }
  if (spec.fields) {
    if (value === null || value === undefined)
      return (
        <div className="field">
          <span className="field__label">
            {label}
            {evidence}
          </span>
          <span className="field__hint">{missingLabel}</span>
          <button
            type="button"
            className="button"
            style={{ alignSelf: "start" }}
            disabled={disabled}
            onClick={() =>
              onChange(
                newValue(
                  spec,
                  ["main_address", "other_locations"].includes(name),
                ),
              )
            }
          >
            ＋ Add {label.toLowerCase()}
          </button>
        </div>
      );
    const object = value as Record<string, unknown>;
    return (
      <fieldset className="knowledge-editor__group" disabled={disabled}>
        <legend>{label}</legend>
        {spec.hint && <p className="field__hint">{spec.hint}</p>}
        <div className="field-grid">
          {Object.entries(spec.fields).map(([key, child]) => (
            <BusinessField
              key={key}
              spec={child}
              value={object[key]}
              name={key}
              path={`${path}/${key}`}
              disabled={disabled}
              provenance={provenance}
              citationContext={citationContext}
              approved={approved}
              onChange={(next) => onChange({ ...object, [key]: next })}
            />
          ))}
        </div>
        {["main_address", "employee_count", "pricing"].includes(name) && (
          <button
            type="button"
            className="button button--quiet button--danger"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Clear {label.toLowerCase()}
          </button>
        )}
      </fieldset>
    );
  }
  if (name === "observations") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="knowledge-editor__group">
        <legend>{label}</legend>
        <div className="section-heading">
          <span className="field__hint">
            Keep each observed method distinct.
          </span>
          {evidence}
        </div>
        {spec.options?.map((option) => (
          <div className="field" key={option}>
            <div className="field__label">
              <label htmlFor={`${id}-${option}`}>
                <input
                  id={`${id}-${option}`}
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(option)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...new Set([...selected, option])].sort()
                        : selected.filter((value) => value !== option),
                    )
                  }
                />{" "}
                {labelOf(option)}
              </label>
              {selected.includes(option) && (
                <CitationPopover
                  path={`${path}/${selected.indexOf(option)}`}
                  provenance={provenance}
                  citationContext={citationContext}
                  approved={approved}
                />
              )}
            </div>
          </div>
        ))}
      </fieldset>
    );
  }
  return (
    <div className={`field${spec.type === "long" ? " field--wide" : ""}`}>
      <span className="field__label">
        <label htmlFor={id}>{label}</label>
        {evidence}
      </span>
      {spec.type === "boolean" ? (
        <label>
          <input
            id={id}
            type="checkbox"
            disabled={disabled}
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />{" "}
          Confirmed by a brand guide
        </label>
      ) : spec.type === "select" ? (
        <select
          id={id}
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Unknown</option>
          {spec.options?.map((option) => (
            <option key={option} value={option}>
              {labelOf(option)}
            </option>
          ))}
        </select>
      ) : spec.type === "long" ? (
        <textarea
          id={id}
          disabled={disabled}
          value={String(value ?? "")}
          placeholder={missingLabel}
          onChange={(e) => onChange(e.target.value || null)}
        />
      ) : (
        <input
          id={id}
          disabled={disabled}
          type={
            spec.type === "number"
              ? "number"
              : spec.type === "date"
                ? "date"
                : spec.type === "url"
                  ? "url"
                  : "text"
          }
          value={String(value ?? "")}
          placeholder={missingLabel}
          step={name === "alpha" ? ".01" : undefined}
          min={name === "alpha" ? 0 : undefined}
          max={name === "alpha" ? 1 : undefined}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? null
                : spec.type === "number"
                  ? Number(e.target.value)
                  : e.target.value,
            )
          }
        />
      )}{" "}
      {spec.hint && <span className="field__hint">{spec.hint}</span>}
    </div>
  );
}
