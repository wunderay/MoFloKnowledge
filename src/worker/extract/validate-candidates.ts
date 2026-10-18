/* eslint-disable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- zod 3 schema introspection (.innerType/.unwrap/.shape/.element) is typed any; String() on loosely typed candidate values is intentional */
import { z } from "zod";
import {
  FIELD_REGISTRY,
  businessEntrySchemas,
  compareDecimal,
} from "../../contracts";
import type { StoredCapture } from "../crawl/run-crawl";
import type { TechnicalObservation, FieldCandidate } from "./types";
import { fieldCandidateSchemas } from "./candidate-schema";
import { stableId } from "./identity";
import { normalizeColor } from "./colors";
import { documentScope } from "../network/url-scope";
import { canonicalStringify } from "../../knowledge/canonical-json";
import { exactSentences, isExplicitServiceProviderSentence } from "./source-excerpts";
import { buyerIdentityKey } from "./market-text";
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
const normalizeText = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const normalizeIdentity = (value: string) => normalizeText(value).replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Identity excludes enrichment such as font observation methods. */
function itemIdentity(value: unknown, fieldPath = "", note: string | null = null): string {
  if (!value || typeof value !== "object") {
    return canonicalStringify(value);
  }
  const item = value as Record<string, unknown>;
  if (fieldPath === "/market_and_customers/target_buyers" && item.text) {
    return "buyer:" + buyerIdentityKey(String(item.text));
  }
  if (fieldPath === "/market_and_customers/channels" && item.url && !note?.startsWith("Observed form")) {
    return "channel:" + String(item.url);
  }
  if (item.family) {
    return "family:" + normalizeIdentity(String(item.family));
  }
  if (item.hex) {
    return "color:" + String(item.hex).toUpperCase() + ":" + String(item.alpha);
  }
  if (item.profile_url) {
    return "profile:" + String(item.profile_url);
  }
  if (item.url) {
    return "url:" + String(item.url) + (item.label ? ":" + normalizeIdentity(String(item.label)) : "");
  }
  if (item.text) {
    return "text:" + normalizeIdentity(String(item.text));
  }
  return canonicalStringify(value);
}
function materialize(
  schema: z.ZodTypeAny,
  value: unknown,
  seed: string,
  path = "",
  fieldPath = "",
  note: string | null = null,
): unknown {
  if (schema instanceof z.ZodEffects) {
    return materialize(schema.innerType(), value, seed, path, fieldPath, note);
  }
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    return value === null
      ? null
      : materialize(schema.unwrap(), value, seed, path, fieldPath, note);
  }
  if (schema instanceof z.ZodArray) {
    return (value as unknown[]).map((v) => {
      const identity = itemIdentity(v, fieldPath, note);
      return materialize(
        schema.element,
        v,
        stableId(seed, identity),
        `${path}/@item`, fieldPath, note,
      );
    });
  }
  if (schema instanceof z.ZodObject) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(schema.shape)) {
      result[key] =
        key === "id"
          ? stableId(
              seed,
              path,
              path === "" ? itemIdentity(value, fieldPath, note) : "item",
            )
          : materialize(
              child as z.ZodTypeAny,
              (value as Record<string, unknown>)[key],
              seed,
              `${path}/${key}`, fieldPath, note,
            );
    }
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
      if (index < 0) {
        throw new Error("unknown_field");
      }
      fieldCandidateSchemas[index].parse(c);
      const field = FIELD_REGISTRY[index];
      if (!field.allowedOrigins.includes(c.origin)) {
        throw new Error("invalid_origin");
      }
      if (["key_person", "offering"].includes(field.kind) && !c.entity_key) {
        throw new Error("missing_entity_key");
      }
      const segments = c.segment_ids.map((id) => {
        const s = page.capture.segments.find((s) => s.id === id);
        if (!s) {
          throw new Error("invalid_segment");
        }
        return s;
      });
      if (field.field === "website" || field.field === "url") {
        const observed = observations.find(
          (o) =>
            o.value === String(c.value) &&
            (o.property === "url" || o.property === "href"),
        );
        if (observed && !c.observation_ids.includes(observed.id)) {
          c.observation_ids.push(observed.id);
        }
      }
      const selected = c.observation_ids.map((id) => {
        const o = observations.find((o) => o.id === id);
        if (!o) {
          throw new Error("invalid_observation");
        }
        return o;
      });
      if (!segments.length && !selected.length) {
        throw new Error("missing_evidence");
      }
      const quotes = segments.map((s) => s.text).join("\n");
      if (
        field.field === "gender" &&
        (!/\b(?:I (?:identify|describe myself) as|self[- ]identif|self[- ]descri|gender\s*:)/i.test(
          quotes,
        ) ||
          !quotes.includes(String(c.value)))
      ) {
        throw new Error("gender_not_explicit");
      }
      if (field.field === "gender") {
        c.note = "Explicit public self-description observed in cited text.";
      }
      if (field.field === "year_founded") {
        const year = String(c.value);
        const explicitYear = new RegExp(`(?:founded|established)[^.!?]{0,50}\\b${year}\\b`, "i").test(quotes) ||
          segments.some((segment) => new RegExp(`^Since\\s+${year}[.!]?$`, "i").test(segment.text.trim()));
        const declaredDate = selected.some((o) => /jsonld:.*\/foundingDate$/.test(o.property ?? "") && new RegExp(`^${year}(?:-|$)`).test(o.value ?? ""));
        if (!explicitYear && !declaredDate) {
          throw new Error("founding_not_explicit");
        }
      }
      if (field.field === "founding_story" &&
        !/\b(?:because|began|started|journey|mission|story|to solve)\b|\bsince\s+\d{4}[^.!?]{0,80}\b(?:my|our) (?:own )?(?:[\p{L}-]+\s+){0,3}practice\b/iu.test(quotes)) {
        throw new Error("story_not_supported");
      }
      if (field.field === "legal_entity_type") {
        const identity = [quotes, ...selected.filter((o) => o.property === "page-title" || /jsonld:.*\/(?:name|legalName)$/.test(o.property ?? "")).map((o) => o.value ?? "")].join(" ");
        const escaped = String(c.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`\\b${escaped}\\b`, "i").test(identity)) {
          throw new Error("legal_not_explicit");
        }
      }
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
        ) {
          throw new Error("employee_count_not_supported");
        }
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
          !(
            quotes.includes(v.raw) ||
            selected.some((o) =>
              o.property?.startsWith("jsonld:") &&
              /\/(?:price|lowPrice|highPrice)$/.test(o.property) &&
              o.value === v.raw,
            )
          ) ||
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
        ) {
          throw new Error("price_not_supported");
        }
      }
      if (field.field === "suppliers_and_partners") {
        for (const v of c.value as {
          relationship_type: string | null;
          relationship_text: string | null;
        }[]) {
          if ((v.relationship_type || v.relationship_text) && !segments.length) {
            throw new Error("relationship_not_supported");
          }
        }
      }
      if (field.field === "website" || field.field === "url") {
        const url = String(c.value);
        if (
          url !== page.capture.finalUrl &&
          !page.capture.links.some((l) => l.url === url) &&
          !selected.some((o) =>
            o.property?.startsWith("jsonld:") && o.value === url,
          )
        ) {
          throw new Error("url_not_observed");
        }
      }
      if (
        field.field === "website" &&
        !documentScope(page.capture.finalUrl).includes(
          new URL(String(c.value)).hostname,
        )
      ) {
        throw new Error("website_out_of_scope");
      }
      if (field.field === "brand_colors") {
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
          ) {
            throw new Error("color_not_observed");
          }
          if (
            color.classification === "brand_guide_confirmed" &&
            !/brand (?:guide|guidelines)|official brand/i.test(quotes)
          ) {
            throw new Error("brand_confirmation_not_observed");
          }
        }
      }
      if (field.field === "logos") {
        for (const logo of c.value as { url: string }[]) {
          if (
            !selected.some(
              (o) =>
                o.property === "logo" &&
                o.asset_url === logo.url &&
                /header|footer|^jsonld:(?:Organization|LocalBusiness)\/logo$/i.test(o.selector ?? "") &&
                !/partner|favicon/i.test(o.value ?? ""),
            )
          ) {
            throw new Error("company_logo_not_observed");
          }
        }
      }
      // Structured entities need a cited name and an explicit supported type at
      // the same JSON-LD object path, so unrelated metadata cannot name an entity.
      const structuredEntity = (path: string) => {
        const prefix = "jsonld:" + path;
        const supportedType = field.kind === "key_person"
          ? /^(?:https?:\/\/schema\.org\/)?Person$/
          : /^(?:https?:\/\/schema\.org\/)?(?:Product|Service|Offer)$/;
        return selected.some((o) =>
          o.property === prefix + "/name" && Boolean(o.value),
        ) && selected.some((o) =>
          (o.property === prefix + "/@type" ||
            o.property?.startsWith(prefix + "/@type/")) &&
          supportedType.test(o.value ?? ""),
        );
      };
      const structuredPrefix = page.capture.finalUrl + "|jsonld:";
      const serviceHeading = field.kind === "offering" && segments.some((segment) =>
        selected.some((o) => o.property === "heading" && o.value &&
          normalizeText(segment.text).includes(normalizeText(o.value))) &&
        /\b(?:service|product|offering|tax|payroll|accounting|bookkeeping|quickbooks|repair|consulting|controller|cfo)\b/i.test(segment.text),
      );
      const structuredServiceKey = field.kind === "offering" && c.entity_key?.startsWith(page.capture.finalUrl + "|service:") &&
        selected.some((o) => o.property?.startsWith("jsonld:") && o.property.endsWith("/name") && o.value &&
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the surrounding logic; a runtime check would change failure behaviour
          normalizeIdentity(o.value) === normalizeIdentity(c.entity_key!.slice((page.capture.finalUrl + "|service:").length)) &&
          structuredEntity(o.property.slice("jsonld:".length, -"/name".length)));
      const listedService = field.kind === "offering" && c.entity_key?.startsWith(page.capture.finalUrl + "|service:") &&
        (() => {
          const expected = normalizeIdentity(c.entity_key.slice((page.capture.finalUrl + "|service:").length));
          const sections = page.capture.observations.contentSections;
          if (!segments.some((s) => normalizeIdentity(s.text) === expected)) {
            return false;
          }
          const lists = page.capture.observations.contentLists;
          if (Array.isArray(lists) && lists.some((list: { intro?: unknown; items?: unknown }) =>
            typeof list.intro === "string" && /\bservices?\b[^.!?]{0,100}\b(?:include|following|offer)|\bwe\s+(?:offer|provide)\b/i.test(list.intro) &&
            segments.some((segment) => normalizeText(segment.text).includes(normalizeText(list.intro as string))) &&
            Array.isArray(list.items) && list.items.some((name) => typeof name === "string" && normalizeIdentity(name) === expected))) {
            return true;
          }
          if (!Array.isArray(sections)) {
            return false;
          }
          return sections.some((section: { heading?: unknown; paragraphs?: unknown; listItems?: unknown }) =>
            Array.isArray(section.listItems) && section.listItems.some((name) => typeof name === "string" && normalizeIdentity(name) === expected) &&
            Array.isArray(section.paragraphs) && section.paragraphs.some((paragraph) => typeof paragraph === "string" &&
              /\b(?:services? include|we (?:offer|provide))\b/i.test(paragraph) &&
              segments.some((s) => normalizeText(s.text).includes(normalizeText(paragraph)))));
        })();
      const narrativeService = field.kind === "offering" && c.entity_key?.startsWith(page.capture.finalUrl + "|service:") &&
        (() => {
          const expected = c.entity_key.slice((page.capture.finalUrl + "|service:").length);
          return segments.some((segment) => {
            const names = [segment.text, ...selected.filter((o) => o.property === "heading" || o.property === "anchor-label").map((o) => o.value ?? "")];
            return names.some((name) => (" " + normalizeIdentity(name) + " ").includes(" " + normalizeIdentity(expected) + " ")) &&
              /\b(?:service|product|offering|tax|payroll|accounting|bookkeeping|quickbooks|repair|consulting|controller|cfo)\b/i.test(segment.text);
          });
        })();
      if (
        c.entity_key &&
        !(c.entity_key === page.capture.finalUrl && serviceHeading) &&
        !narrativeService && !listedService && !structuredServiceKey &&
        !page.capture.links.some((link) =>
          link.url === c.entity_key && (
            link.url !== page.capture.finalUrl || (
              selected.some((o) => o.property === "href" && o.value === link.url) &&
              selected.some((o) => o.property === "anchor-label" && o.asset_url === link.url && Boolean(o.value))
            )
          ),
        ) &&
        !(
          c.entity_key.startsWith(structuredPrefix) &&
          structuredEntity(c.entity_key.slice(structuredPrefix.length))
        ) &&
        !selected.some((o) =>
          o.property?.startsWith("jsonld:") && o.property.endsWith("/url") &&
          o.value === c.entity_key &&
          structuredEntity(o.property.slice("jsonld:".length, -"/url".length)),
        ) &&
        !(
          c.entity_key.startsWith(page.capture.finalUrl + "|") &&
          (() => {
            const parts = c.entity_key.split("|");
            return parts.length === 3 && page.capture.segments.some((s) =>
              s.id === parts[2] && s.text.includes(parts[1]),
            );
          })()
        )
      ) {
        throw new Error("entity_key_not_observed");
      }
      if (field.field === "fonts") {
        for (const font of c.value as {
          family: string;
          observations: string[];
          brand_confirmed: boolean;
        }[]) {
          if (
            font.brand_confirmed &&
            !/brand (?:guide|guidelines)|official brand/i.test(quotes)
          ) {
            throw new Error("brand_confirmation_not_observed");
          }
          if (
            font.observations.includes("resource_loaded") &&
            !selected.some((o) => o.property === "font-resource")
          ) {
            throw new Error("font_load_not_observed");
          }
          if (
            font.observations.includes("computed_family") &&
            !selected.some((o) => o.property === "font-family")
          ) {
            throw new Error("computed_font_not_observed");
          }
          if (
            font.observations.includes("css_declared") &&
            !selected.some((o) => o.property === "stylesheet")
          ) {
            throw new Error("declared_font_not_observed");
          }
        }
      }
      if (field.field === "social_media_links") {
        for (const social of c.value as {
          platform: string;
          profile_url: string;
        }[]) {
          const url = new URL(social.profile_url);
          if (
            /\/(?:share|intent|sharer|dialog)(?:\/|$)/i.test(url.pathname) ||
            (social.platform.toLowerCase() === "linkedin" && !/^\/(?:company|school|showcase)\/[^/]+/i.test(url.pathname)) ||
            !(
              page.capture.links.some((l) => l.url === social.profile_url) ||
              selected.some((o) =>
                o.property?.startsWith("jsonld:") && o.value === social.profile_url,
              )
            ) ||
            !url.hostname
              .replace(/^www\./, "")
              .startsWith(social.platform.toLowerCase() + ".")
          ) {
            throw new Error("social_profile_not_observed");
          }
        }
      }
      const roleCompanyNames = observations.filter((observation) =>
        /jsonld:.*\/(?:name|legalName)$/.test(observation.property ?? "") && observation.value &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the surrounding logic; a runtime check would change failure behaviour
        observations.some((kind) => kind.property === observation.property!.replace(/\/(?:name|legalName)$/, "/@type") &&
          /^(?:Organization|Corporation|LocalBusiness|ProfessionalService|AccountingService)$/.test(kind.value ?? "")) &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the surrounding logic; a runtime check would change failure behaviour
        observations.some((url) => url.property === observation.property!.replace(/\/(?:name|legalName)$/, "/url") &&
          (() => { try { return new URL(url.value ?? "").hostname.replace(/^www\./, "") === new URL(page.capture.finalUrl).hostname.replace(/^www\./, ""); } catch { return false; } })()))
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the surrounding logic; a runtime check would change failure behaviour
        .map((observation) => observation.value!);
      const normalizedServiceRole = c.field === "/company_foundation/company_role" &&
        c.note === "Normalized company role from an explicit current-company service statement." &&
        !/\/(?:articles?|blog|news|resources?)(?:\/|$)/i.test(new URL(page.capture.finalUrl).pathname) &&
        segments.some((segment) => exactSentences(segment.text).some((sentence) => isExplicitServiceProviderSentence(sentence, roleCompanyNames)));
      if (c.origin === "source_backed") {
        const haystack = [quotes, ...selected.map((o) => o.value ?? "")]
          .join(" ")
          .normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
        const skip = new Set([
          "kind",
          "classification",
          "observations",
          "amount",
          "min_amount",
          "max_amount",
        ]);
        const check = (value: unknown, key = "") => {
          if (skip.has(key)) {
            return;
          }
          if (typeof value === "string") {
            if (normalizedServiceRole && key === "text" && value === "Service provider") {
              return;
            }
            if (["hex", "platform"].includes(key)) {
              return;
            }
            if (/^https?:/.test(value)) {
              if (
                value !== page.capture.finalUrl &&
                !page.capture.links.some((link) => link.url === value) &&
                !selected.some(
                  (o) => o.asset_url === value || o.value === value,
                )
              ) {
                throw new Error("url_not_observed");
              }
              return;
            }
            // Multi-paragraph extracts may join nonadjacent exact passages. Every
            // paragraph must remain grounded; joining never permits paraphrasing.
            if (!value.split(/\n\s*\n/).every((paragraph) => haystack.includes(normalizeText(paragraph)))) {
              throw new Error("value_not_in_evidence");
            }
          } else if (Array.isArray(value)) {
            for (const item of value) {
              check(item, key);
            }
          } else if (value && typeof value === "object") {
            for (const [child, v] of Object.entries(value)) {
              check(v, child);
            }
          }
        };
        check(c.value);
      }
      let entity = c.entity_key ?? "singleton";
      if (field.kind === "key_person" && c.entity_key) {
        const legacyName = c.entity_key.startsWith(page.capture.finalUrl + "|")
          ? c.entity_key.split("|")[1] : null;
        const structuredName = selected.find((o) => o.property?.startsWith("jsonld:") && o.property.endsWith("/name"))?.value;
        const name = legacyName?.startsWith("jsonld:") ? structuredName : legacyName ?? structuredName;
        // A corroborated profile heading identifies the page independently of
        // paragraph order or JSON-LD array positions. Home-page people retain
        // their declared linked identities.
        if (name && /\/(?:team|people|staff|about-us|about)\/[^/]+\/?$/i.test(new URL(page.capture.finalUrl).pathname) &&
          observations.some((o) => o.property === "heading" && o.value &&
            (normalizeIdentity(o.value) === normalizeIdentity(name) || normalizeIdentity(o.value).startsWith(normalizeIdentity(name) + " ")))) {
          entity = page.capture.finalUrl;
        }
      }
      const entryId = stableId(companyId, field.kind, entity);
      let shape: z.ZodTypeAny = businessEntrySchemas[field.kind];
      while (shape instanceof z.ZodEffects) {
        shape = shape.innerType();
      }
      const value = materialize(
        (shape as z.AnyZodObject).shape[field.field],
        c.value,
        stableId(companyId, c.field, entity), "", c.field, c.note,
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
