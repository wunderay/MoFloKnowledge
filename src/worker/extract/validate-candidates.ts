import { z } from "zod";
import {
  FIELD_REGISTRY,
  businessEntrySchemas,
  compareDecimal,
} from "../../contracts";
import type { StoredCapture } from "../crawl/run-crawl";
import type { TechnicalObservation } from "../model/responses";
import { fieldCandidateSchemas, type FieldCandidate } from "../model/schema";
import { stableId } from "./identity";
import { normalizeColor } from "./colors";
import { documentScope } from "../network/url-scope";
import { canonicalStringify } from "../../knowledge/canonical-json";
export type ValidatedCandidate = FieldCandidate & {
  id: string;
  kind: (typeof FIELD_REGISTRY)[number]["kind"];
  fieldName: string;
  entryId: string;
  value: unknown;
  page: StoredCapture;
  evidenceIds: string[];
  observations: TechnicalObservation[];
};
export function materialize(
  schema: z.ZodTypeAny,
  value: unknown,
  seed: string,
  path = "",
): unknown {
  if (schema instanceof z.ZodEffects)
    return materialize(schema.innerType(), value, seed, path);
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional)
    return value === null
      ? null
      : materialize(schema.unwrap(), value, seed, path);
  if (schema instanceof z.ZodArray)
    return (value as unknown[]).map((v) => {
      const identity =
        v && typeof v === "object" && "url" in v && v.url
          ? String(v.url)
          : canonicalStringify(v);
      return materialize(
        schema.element,
        v,
        stableId(seed, identity),
        `${path}/@item`,
      );
    });
  if (schema instanceof z.ZodObject) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(schema.shape))
      result[key] =
        key === "id"
          ? stableId(
              seed,
              path,
              path === "" ? canonicalStringify(value) : "item",
            )
          : materialize(
              child as z.ZodTypeAny,
              (value as Record<string, unknown>)[key],
              seed,
              `${path}/${key}`,
            );
    return result;
  }
  return value;
}
export function validateCandidates(
  input: FieldCandidate[],
  page: StoredCapture,
  observations: TechnicalObservation[],
  companyId: string,
): ValidatedCandidate[] {
  return input
    .filter(
      (c) =>
        c.value !== null && !(Array.isArray(c.value) && c.value.length === 0),
    )
    .map((original) => {
      const c = { ...original, observation_ids: [...original.observation_ids] };
      const index = FIELD_REGISTRY.findIndex((f) => f.path === c.field);
      if (index < 0) throw new Error("unknown_field");
      fieldCandidateSchemas[index].parse(c);
      const field = FIELD_REGISTRY[index];
      if (!field.allowedOrigins.includes(c.origin))
        throw new Error("invalid_origin");
      if (["key_person", "offering"].includes(field.kind) && !c.entity_key)
        throw new Error("missing_entity_key");
      if (c.origin !== "source_backed" && !c.note)
        throw new Error("interpretation_note_required");
      if (c.origin === "generated" && !c.supporting_fields.length)
        throw new Error("generated_support_required");
      const segments = c.segment_ids.map((id) => {
        const s = page.capture.segments.find((s) => s.id === id);
        if (!s) throw new Error("invalid_segment");
        return s;
      });
      if (field.field === "website" || field.field === "url") {
        const observed = observations.find(
          (o) =>
            o.value === String(c.value) &&
            (o.property === "url" || o.property === "href"),
        );
        if (observed && !c.observation_ids.includes(observed.id))
          c.observation_ids.push(observed.id);
      }
      const selected = c.observation_ids.map((id) => {
        const o = observations.find((o) => o.id === id);
        if (!o) throw new Error("invalid_observation");
        return o;
      });
      if (!segments.length && !selected.length)
        throw new Error("missing_evidence");
      const quotes = segments.map((s) => s.text).join("\n");
      if (
        field.field === "gender" &&
        (!/\b(?:I (?:identify|describe myself) as|self[- ]identif|self[- ]descri|gender\s*:)/i.test(
          quotes,
        ) ||
          !quotes.includes(String(c.value)))
      )
        throw new Error("gender_not_explicit");
      if (
        field.field === "year_founded" &&
        !new RegExp(
          `(?:founded|established|since)[^.!?]{0,50}\\b${c.value}\\b`,
          "i",
        ).test(quotes)
      )
        throw new Error("founding_not_explicit");
      if (
        field.field === "founding_story" &&
        !/\b(?:because|began|started|journey|mission|story|to solve)\b/i.test(
          quotes,
        )
      )
        throw new Error("story_not_supported");
      if (
        field.field === "legal_entity_type" &&
        !quotes.toLowerCase().includes(String(c.value).toLowerCase())
      )
        throw new Error("legal_not_explicit");
      if (field.field === "employee_count") {
        const v = c.value as {
          raw: string;
          exact: number | null;
          min: number | null;
          max: number | null;
        };
        if (
          !quotes.includes(v.raw) ||
          (v.exact !== null &&
            (/\d\s*(?:[-–—]|to)\s*\d/.test(v.raw) ||
              /about|approx|around|over|more than|less than/i.test(v.raw))) ||
          [v.exact, v.min, v.max].some(
            (number) =>
              number !== null &&
              !v.raw.replace(/,/g, "").includes(String(number)),
          )
        )
          throw new Error("employee_count_not_supported");
      }
      if (field.field === "pricing") {
        const v = c.value as {
          kind: string;
          raw: string;
          amount: string | null;
          min_amount: string | null;
          max_amount: string | null;
        };
        if (
          !quotes.includes(v.raw) ||
          (v.kind === "free" && !/\bfree\b|no (?:charge|cost)/i.test(v.raw)) ||
          (v.kind === "contact_for_pricing" &&
            !/contact|quote|call|inquir/i.test(v.raw)) ||
          (v.amount !== null && /\d\s*(?:[-–—]|to)\s*\d/.test(v.raw)) ||
          [v.amount, v.min_amount, v.max_amount].some(
            (a) =>
              a !== null &&
              !(v.raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []).some(
                (number) => compareDecimal(number, a) === 0,
              ),
          )
        )
          throw new Error("price_not_supported");
      }
      if (field.field === "suppliers_and_partners")
        for (const v of c.value as {
          relationship_type: string | null;
          relationship_text: string | null;
        }[])
          if ((v.relationship_type || v.relationship_text) && !segments.length)
            throw new Error("relationship_not_supported");
      if (field.field === "website" || field.field === "url") {
        const url = String(c.value);
        if (
          url !== page.capture.finalUrl &&
          !page.capture.links.some((l) => l.url === url)
        )
          throw new Error("url_not_observed");
      }
      if (
        field.field === "website" &&
        !documentScope(page.capture.finalUrl).includes(
          new URL(String(c.value)).hostname,
        )
      )
        throw new Error("website_out_of_scope");
      if (field.field === "brand_colors")
        for (const color of c.value as {
          hex: string;
          alpha: number;
          classification: string;
        }[]) {
          if (
            !selected.some((o) => {
              const observed = normalizeColor(o.value ?? "");
              return (
                observed?.hex === color.hex.toUpperCase() &&
                Math.abs(observed.alpha - color.alpha) < 0.001
              );
            })
          )
            throw new Error("color_not_observed");
          if (
            color.classification === "brand_guide_confirmed" &&
            !/brand (?:guide|guidelines)|official brand/i.test(quotes)
          )
            throw new Error("brand_confirmation_not_observed");
        }
      if (field.field === "logos")
        for (const logo of c.value as { url: string }[])
          if (
            !selected.some(
              (o) =>
                o.property === "logo" &&
                o.asset_url === logo.url &&
                /header|footer/i.test(o.selector ?? "") &&
                !/partner|favicon/i.test(o.value ?? ""),
            )
          )
            throw new Error("company_logo_not_observed");
      if (
        c.entity_key &&
        !page.capture.links.some((link) => link.url === c.entity_key) &&
        !(
          c.entity_key.startsWith(page.capture.finalUrl + "|") &&
          (() => {
            const parts = c.entity_key!.split("|");
            return (
              parts.length === 3 &&
              page.capture.segments.some(
                (s) => s.id === parts[2] && s.text.includes(parts[1]),
              )
            );
          })()
        )
      )
        throw new Error("entity_key_not_observed");
      if (field.field === "fonts")
        for (const font of c.value as {
          family: string;
          observations: string[];
          brand_confirmed: boolean;
        }[]) {
          if (
            font.brand_confirmed &&
            !/brand (?:guide|guidelines)|official brand/i.test(quotes)
          )
            throw new Error("brand_confirmation_not_observed");
          if (
            font.observations.includes("resource_loaded") &&
            !selected.some((o) => o.property === "font-resource")
          )
            throw new Error("font_load_not_observed");
          if (
            font.observations.includes("computed_family") &&
            !selected.some((o) => o.property === "font-family")
          )
            throw new Error("computed_font_not_observed");
          if (
            font.observations.includes("css_declared") &&
            !selected.some((o) => o.property === "stylesheet")
          )
            throw new Error("declared_font_not_observed");
        }
      if (field.field === "social_media_links")
        for (const social of c.value as {
          platform: string;
          profile_url: string;
        }[]) {
          const url = new URL(social.profile_url);
          if (
            /\/(?:share|intent|sharer|dialog)(?:\/|$)/i.test(url.pathname) ||
            !page.capture.links.some((l) => l.url === social.profile_url) ||
            !url.hostname
              .replace(/^www\./, "")
              .startsWith(social.platform.toLowerCase() + ".")
          )
            throw new Error("social_profile_not_observed");
        }
      if (c.origin === "source_backed") {
        const haystack = [quotes, ...selected.map((o) => o.value ?? "")]
          .join(" ")
          .replace(/\s+/g, " ")
          .toLowerCase();
        const skip = new Set([
          "kind",
          "classification",
          "observations",
          "amount",
          "min_amount",
          "max_amount",
        ]);
        const check = (value: unknown, key = "") => {
          if (skip.has(key)) return;
          if (typeof value === "string") {
            if (["hex", "platform"].includes(key)) return;
            if (/^https?:/.test(value)) {
              if (
                value !== page.capture.finalUrl &&
                !page.capture.links.some((link) => link.url === value) &&
                !selected.some(
                  (o) => o.asset_url === value || o.value === value,
                )
              )
                throw new Error("url_not_observed");
              return;
            }
            if (!haystack.includes(value.replace(/\s+/g, " ").toLowerCase()))
              throw new Error("value_not_in_evidence");
          } else if (Array.isArray(value))
            for (const item of value) check(item, key);
          else if (value && typeof value === "object")
            for (const [child, v] of Object.entries(value)) check(v, child);
        };
        check(c.value);
      }
      const entity = c.entity_key ?? "singleton";
      const entryId = stableId(companyId, field.kind, entity);
      let shape: z.ZodTypeAny = businessEntrySchemas[field.kind];
      while (shape instanceof z.ZodEffects) shape = shape.innerType();
      const value = materialize(
        (shape as z.AnyZodObject).shape[field.field],
        c.value,
        stableId(companyId, c.field, entity),
      );
      return {
        ...c,
        id: stableId(
          page.id,
          c.field,
          entity,
          canonicalStringify(c.value),
          c.origin,
        ),
        kind: field.kind,
        fieldName: field.field,
        entryId,
        value,
        page,
        evidenceIds: [
          ...segments.map((s) => stableId(page.id, "segment", s.id)),
          ...selected.map((o) => stableId(page.id, "observation", o.id)),
        ],
        observations: selected,
      };
    });
}
