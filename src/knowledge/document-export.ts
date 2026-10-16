import { AlignmentType, Bookmark, BorderStyle, Document, ExternalHyperlink, HeadingLevel, InternalHyperlink, Packer, Paragraph, TextRun } from "docx";
import type { z } from "zod";
import type { KnowledgeBaseExport, EntryProvenance, Claim } from "../contracts";
import type { DraftResponseSchema } from "../contracts/api-responses";
import { createEmptyBusiness } from "../contracts/defaults";
import { downloadFilename } from "./download-name";

export type DocumentInput =
  | { kind: "draft"; draft: z.infer<typeof DraftResponseSchema> }
  | { kind: "snapshot"; snapshot: KnowledgeBaseExport };
export type DocumentTextRun = { text: string; citations?: number[]; bold?: boolean; href?: string };
export type DocumentParagraph = {
  text: string;
  depth: number;
  heading?: "title" | "section" | "entry" | "field";
  label?: string;
  bullet?: boolean;
  muted?: boolean;
  swatch?: string;
  citations?: number[];
  runs?: DocumentTextRun[];
  anchor?: string;
  href?: string;
};
/** Source references are semantic metadata; literal bracketed user text is never reinterpreted. */
export function documentRuns(paragraph: DocumentParagraph): DocumentTextRun[] {
  return [
    ...(paragraph.label ? [{ text: `${paragraph.label}: `, bold: true }] : []),
    ...(paragraph.runs ?? [{ text: paragraph.text, citations: paragraph.citations, href: paragraph.href }]),
  ];
}
const LABELS: Record<string, string> = {
  company_foundation: "Company details", positioning: "Pitch & story",
  market_and_customers: "Market & customers", branding_and_style: "Branding & style",
  online_presence: "Online presence", key_people: "Key people", offerings: "Offerings",
  ctas: "Calls to action", alternative_company_names: "Also known as",
  background_or_relevance: "Background", raw: "Original wording", url: "Website",
  profile_url: "Profile URL", line1: "Address line 1", line2: "Address line 2",
  brand_confirmed: "Confirmed brand guidance", observations: "Observation methods",
  min: "Minimum", max: "Maximum", exact: "Exact count", as_of: "As of",
};
function label(key: string) {
  return LABELS[key] ?? key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
function populated(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(populated);
  if (typeof value === "object") return Object.entries(value).some(([key, item]) => key !== "id" && populated(item));
  return true;
}
const pointer = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");
export function documentFilename(name: string, version: number | "draft") {
  const filename = downloadFilename(name, version === "draft" ? 1 : version);
  return version === "draft" ? filename.replace(/-v1\.json$/, "-draft.docx") : filename.replace(/\.json$/, ".docx");
}
export function documentData(input: DocumentInput) {
  return input.kind === "draft" ? input.draft : input.snapshot;
}

/** A company profile, using complete stored wording rather than a technical serialization. */
export function documentParagraphs(input: DocumentInput): DocumentParagraph[] {
  const paragraphs: DocumentParagraph[] = [];
  const add = (text: string, options: Partial<DocumentParagraph> = {}) => paragraphs.push({ text, depth: 0, ...options });
  const heading = (text: string, level: DocumentParagraph["heading"] = "section") => add(text, { heading: level });
  const prose = (runs: DocumentTextRun[], options: Partial<DocumentParagraph> = {}) => {
    const merged: DocumentTextRun[] = [];
    for (const run of runs) {
      const previous = merged.at(-1);
      if (previous?.citations?.length && run.citations?.length && previous.citations.join() === run.citations.join()
        && !previous.href && !run.href && previous.bold === run.bold) previous.text += run.text;
      else merged.push({ ...run });
    }
    add(merged.map((run) => run.text).join(""), { ...options, runs: merged });
  };
  const business = input.kind === "snapshot" ? input.snapshot : createEmptyBusiness();
  const roots: EntryProvenance[] = input.kind === "draft" ? input.draft.entries.map((entry) => entry.provenance) : [];
  if (input.kind === "draft") {
    for (const entry of input.draft.entries) {
      if (entry.kind === "key_person") business.key_people.push(entry.content as (typeof business.key_people)[number]);
      else if (entry.kind === "offering") business.offerings.push(entry.content as (typeof business.offerings)[number]);
      else Object.assign(business, { [entry.kind]: entry.content });
    }
  }
  const provenance = input.kind === "snapshot" ? [input.snapshot.provenance] : [...roots, input.draft.citationContext];
  const sources = [...new Map(provenance.flatMap((item) => item.sources).map((source) => [source.id, source])).values()];
  const evidence = new Map(provenance.flatMap((item) => item.evidence).map((item) => [item.id, item]));
  const claims = new Map(provenance.flatMap((item) => item.claims).map((item) => [item.id, item]));
  const activeClaims = input.kind === "snapshot" ? input.snapshot.provenance.claims : roots.flatMap((item) => item.claims);
  function citations(path: string) {
    const numbers = new Set<number>();
    const visited = new Set<string>();
    const visit = (claim: Claim) => {
      if (visited.has(claim.id)) return;
      visited.add(claim.id);
      for (const id of claim.evidence_ids) {
        const sourceId = evidence.get(id)?.source_page_id;
        const index = sources.findIndex((source) => source.id === sourceId);
        if (index >= 0) numbers.add(index + 1);
      }
      for (const id of claim.based_on_claim_ids) {
        const support = claims.get(id);
        if (support) visit(support);
      }
    };
    for (const claim of activeClaims) {
      if (claim.targets.some((target) => target === path || target.startsWith(`${path}/`) || path.startsWith(`${target}/`))) visit(claim);
    }
    // Narrative passages may use three sources; basic structured facts need only one.
    const limit = /\/(?:overview|business_model|company_pitch|founding_story|description|background_or_relevance|writing_style_description|art_style_description|relationship_text|purpose)$|\/(?:customer_needs|features|qualifications|goals|pain_points|industry_outlook)\/[^/]+\/text$/.test(path) ? 3 : 1;
    return [...numbers].sort((a, b) => a - b).slice(0, limit);
  }
  const references = new Map<string, string>();
  const unknowns = new Map<string, string>();
  const collect = (value: unknown, path: string, title: string): void => {
    references.set(path, title);
    if (!populated(value) && (value === null || typeof value !== "object" || (Array.isArray(value) && !value.length))) unknowns.set(path, title);
    if (Array.isArray(value)) value.forEach((item, index) => {
      const id = item && typeof item === "object" && "id" in item ? `@${item.id}` : index;
      const named = item && typeof item === "object" ? ["name", "label", "family", "platform", "text", "hex"].map((key) => (item as Record<string, unknown>)[key]).find((item) => typeof item === "string" && item) : null;
      collect(item, `${path}/${id}`, typeof named === "string" && named.length < 100 ? `${title} — ${named}` : title);
    });
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => {
      if (key !== "id") collect(child, `${path}/${pointer(key)}`, `${title} / ${label(key)}`);
    });
  };
  for (const key of ["company_foundation", "positioning", "market_and_customers", "branding_and_style", "online_presence", "key_people", "offerings"] as const) collect(business[key], `/${key}`, label(key));
  const fact = (text: string, path: string): DocumentTextRun => ({ text, citations: citations(path) });
  const sentence = (text: string) => /[.!?]$/.test(text.trim()) ? text : `${text}.`;
  const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
  const overview = normalized(business.company_foundation.overview ?? "");
  const withoutOverviewDuplicates = (text: string) => text.split(/\n+/).filter((part) => {
    const exact = normalized(part);
    return exact && !overview.includes(exact);
  }).join("\n\n");
  const listRuns = (items: { text: string; path: string }[]): DocumentTextRun[] => items.flatMap((item, index) => [
    ...(index ? [{ text: index === items.length - 1 ? "; and " : "; " }] : []), fact(item.text, item.path),
  ]);
  const address = (value: Record<string, unknown>, path: string, prefix: string) => {
    const parts = [value.line1, value.line2, [value.city, [value.region, value.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", "), value.country]
      .filter((part): part is string => typeof part === "string" && Boolean(part));
    const raw = typeof value.raw === "string" ? value.raw : "";
    const comparable = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const coversParts = raw && parts.every((part) => comparable(raw).includes(comparable(part)));
    const wording = coversParts ? raw : [raw, parts.join(", ")].filter(Boolean).join(" — ");
    const locationLabel = typeof value.label === "string" && value.label ? `${value.label}: ` : "";
    if (wording) prose([fact(sentence(`${prefix}${locationLabel}${wording}`), path)]);
  };
  const displayedLinks = new Set<string>();
  const renderValue = (value: unknown, title: string, path: string, depth = 0): void => {
    if (!populated(value)) return;
    if (path === "/company_foundation/main_address" && value && typeof value === "object") {
      address(value as Record<string, unknown>, path, "The main address is ");
      return;
    }
    if (Array.isArray(value) && path === "/company_foundation/other_locations") {
      value.forEach((item) => address(item, `${path}/@${item.id}`, "Another recorded location is "));
      return;
    }
    if (Array.isArray(value) && ["target_buyers", "company_role", "service_locations", "alternative_company_names", "industry_groupings"].includes(path.split("/").at(-1)!)) {
      const introductions: Record<string, string> = { target_buyers: "Its customers include ", company_role: "It operates as ",
        service_locations: "Its service locations include ", alternative_company_names: "It is also known as ", industry_groupings: "It serves these industry groups: " };
      const items = value.filter((item) => typeof item.text === "string").map((item) => ({ text: path.endsWith("/company_role") ? `${/^[aeiou]/i.test(item.text) ? "an" : "a"} ${item.text}` : item.text, path: `${path}/@${item.id}/text` }));
      if (items.length) prose([{ text: introductions[path.split("/").at(-1)!] }, ...listRuns(items), { text: "." }]);
      return;
    }
    if (Array.isArray(value) && path.endsWith("/fonts")) {
      for (const item of value) {
        const root = `${path}/@${item.id}`;
        const methods: Record<string, string> = { css_declared: "declared CSS", resource_loaded: "loaded resources", computed_family: "computed font family" };
        const runs = [fact(`${item.family} is an observed website font`, `${root}/family`)];
        if (item.observations.length) runs.push(fact(` (${item.observations.map((method: string) => methods[method] ?? method).join(", ")})`, `${root}/observations`));
        if (item.apparent_use) runs.push(fact(`, with apparent use: ${item.apparent_use}`, `${root}/apparent_use`));
        runs.push(fact(item.brand_confirmed ? ". It is confirmed as brand guidance." : ". It is not confirmed as brand guidance.", `${root}/brand_confirmed`));
        prose(runs);
      }
      return;
    }
    if (Array.isArray(value) && path.endsWith("/brand_colors")) {
      for (const item of value) {
        const root = `${path}/@${item.id}`;
        const runs = [fact(item.hex, `${root}/hex`), fact(` is ${item.classification === "brand_guide_confirmed" ? "a brand-guide-confirmed color" : "an observed website color"}`, `${root}/classification`),
          fact(` with opacity ${item.alpha}`, `${root}/alpha`)];
        if (item.apparent_role) runs.push(fact(`; apparent role: ${item.apparent_role}`, `${root}/apparent_role`));
        runs.push({ text: "." });
        prose(runs, { swatch: item.hex });
      }
      return;
    }
    if (Array.isArray(value) && path.endsWith("/social_media_links")) {
      for (const item of value) {
        const root = `${path}/@${item.id}`;
        prose([fact(`The company-linked ${item.platform} profile`, `${root}/platform`), { text: " is " }, fact(item.profile_url, `${root}/profile_url`), { text: "." }]);
      }
      return;
    }
    if (Array.isArray(value) && path.endsWith("/logos")) {
      for (const item of value) {
        const root = `${path}/@${item.id}`;
        const runs = [fact("A company logo was observed at ", `${root}/kind`), fact(item.url, `${root}/url`)];
        if (item.variant) runs.push(fact(` (${item.variant})`, `${root}/variant`));
        runs.push({ text: "." });
        prose(runs);
      }
      return;
    }
    if (Array.isArray(value)) {
      if (/\/(?:customer_needs|goals|pain_points|industry_outlook)$/.test(path)) {
        value = value.filter((item) => !(typeof item?.text === "string" && /[.!?]$/.test(item.text.trim()) && overview.includes(normalized(item.text))));
        if (!(value as unknown[]).length) return;
      }
      heading(title, "field");
      for (const [index, item] of (value as unknown[]).entries()) {
        const itemPath = `${path}/${item && typeof item === "object" && "id" in item ? `@${item.id}` : index}`;
        if (item && typeof item === "object" && "text" in item) {
          add(String(item.text), { citations: citations(`${itemPath}/text`), bullet: true, depth });
          for (const [key, child] of Object.entries(item)) if (!["id", "text"].includes(key)) renderValue(child, label(key), `${itemPath}/${key}`, depth + 1);
        } else if (item && typeof item === "object") {
          const fields = Object.entries(item).filter(([key]) => key !== "id");
          const primary = ["name", "label", "family", "hex", "platform", "raw"].map((key) => fields.find(([field, child]) => field === key && populated(child))).find(Boolean);
          if (primary && typeof (item as Record<string, unknown>).url === "string") {
            const linkKey = JSON.stringify([primary[1], (item as Record<string, unknown>).url]);
            const extraFacts = fields.some(([key, child]) => key !== primary[0] && key !== "url" && populated(child));
            if (displayedLinks.has(linkKey) && !extraFacts) continue;
            displayedLinks.add(linkKey);
            prose([fact(String(primary[1]), `${itemPath}/${primary[0]}`), { text: " — " }, fact(String((item as Record<string, unknown>).url), `${itemPath}/url`)], { depth });
            for (const [key, child] of fields) if (key !== primary[0] && key !== "url") renderValue(child, label(key), `${itemPath}/${key}`, depth);
            continue;
          }
          if (primary) add(String(primary[1]), {
            citations: citations(`${itemPath}/${primary[0]}`), heading: "entry", depth,
            ...(primary[0] === "hex" && /^#[0-9a-f]{6}$/i.test(String(primary[1])) ? { swatch: String(primary[1]) } : {}),
          });
          for (const [key, child] of fields) if (key !== primary?.[0]) renderValue(child, label(key), `${itemPath}/${key}`, depth + 1);
        } else add(String(item), { citations: citations(itemPath), bullet: true, depth });
      }
    } else if (value && typeof value === "object") {
      heading(title, "field");
      for (const [key, child] of Object.entries(value)) if (key !== "id") renderValue(child, label(key), `${path}/${key}`, depth);
    } else {
      const formatted = typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
      const citation = citations(path);
      if (typeof value === "string" && value.length > 160) {
        heading(title, "field");
        add(formatted, { depth, citations: citation });
      } else {
        const field = path.split("/").at(-1)!;
        const templates: Record<string, string> = { title: `The professional title is ${formatted}`, role: `The role is ${formatted}`,
          offering_type: `This is a ${formatted}`, category: `It is listed under ${formatted}`, gender: `The stated gender is ${formatted}`,
          organization_type: `This audience includes ${formatted}`, purpose: `The stated purpose is ${formatted}`, url: `The website is ${formatted}` };
        if (templates[field]) add(sentence(templates[field]), { depth, citations: citation });
        else add(formatted, { label: title, depth, citations: citation });
      }
    }
  };
  const section = (title: string, content: unknown, path: string) => {
    if (!populated(content)) return;
    heading(title);
    if (typeof content === "string") add(content, { citations: citations(path) });
    else if (content && typeof content === "object" && !Array.isArray(content)) for (const [key, value] of Object.entries(content)) if (key !== "id") renderValue(value, label(key), `${path}/${key}`);
  };
  const name = input.kind === "draft" ? input.draft.company.name : input.snapshot.provenance.company.name;
  const website = input.kind === "draft" ? input.draft.company.website_url : input.snapshot.provenance.company.website;
  heading(name, "title");
  add(website, { muted: true });
  if (input.kind === "draft") {
    const states = [...new Set(input.draft.entries.map((entry) => entry.review_status))].map(label);
    add(`Current saved draft · ${states.join(", ") || "No saved entries"}. Exporting does not approve or publish these values.`, { muted: true });
  } else add(`Saved version ${input.snapshot.version} · ${input.snapshot.saved_at.slice(0, 10)} · immutable reviewed snapshot`, { muted: true });
  if ([...claims.values()].some((claim) => claim.origin === "generated" || claim.origin === "inferred")) add("Includes historical generated or inferred material; consult the JSON provenance for each field’s origin.", { muted: true });
  section("Overview", business.company_foundation.overview, "/company_foundation/overview");
  const foundation = business.company_foundation;
  const details: DocumentTextRun[] = [];
  if (foundation.industry) details.push(fact(sentence(`The company works in ${foundation.industry}`), "/company_foundation/industry"));
  if (foundation.legal_entity_type) details.push(fact(sentence(`Its legal structure is ${foundation.legal_entity_type}`), "/company_foundation/legal_entity_type"));
  if (foundation.year_founded !== null) details.push(fact(`It was founded in ${foundation.year_founded}.`, "/company_foundation/year_founded"));
  if (foundation.website) details.push(fact(sentence(`Its website is ${foundation.website}`), "/company_foundation/website"));
  const model = foundation.business_model ? withoutOverviewDuplicates(foundation.business_model) : "";
  if (details.length || model || Object.entries(foundation).some(([key, value]) => !["overview", "industry", "legal_entity_type", "year_founded", "website", "business_model"].includes(key) && populated(value))) {
    heading("Company details");
    if (details.length) prose(details.flatMap((run, index) => [...(index ? [{ text: " " }] : []), run]));
    if (model) add(model, { citations: citations("/company_foundation/business_model") });
    for (const [key, value] of Object.entries(foundation)) if (!["overview", "industry", "legal_entity_type", "year_founded", "website", "business_model"].includes(key)) renderValue(value, label(key), `/company_foundation/${key}`);
  }
  const pitch = business.positioning.company_pitch ? withoutOverviewDuplicates(business.positioning.company_pitch) : "";
  section("Pitch", pitch.length <= 500 ? normalized(pitch) : pitch, "/positioning/company_pitch");
  section("Market & customers", business.market_and_customers, "/market_and_customers");
  section("Founding story", business.positioning.founding_story, "/positioning/founding_story");
  section("Branding & style", business.branding_and_style, "/branding_and_style");
  if (populated(business.branding_and_style.fonts) || populated(business.branding_and_style.brand_colors)) add("Website observations are not confirmed brand guidelines unless explicitly marked as confirmed.", { muted: true });
  section("Online presence", business.online_presence, "/online_presence");
  for (const [key, title] of [["key_people", "Key people"], ["offerings", "Offerings"]] as const) {
    if (!business[key].length) continue;
    heading(title);
    for (const item of business[key]) {
      const path = `/${key}/@${item.id}`;
      add(item.name || (key === "offerings" ? "Unnamed offering" : "Unnamed person"), { heading: "entry", citations: citations(`${path}/name`) });
      const detailRuns: DocumentTextRun[] = [];
      const fields = item as Record<string, unknown>;
      if (key === "key_people") {
        if (fields.title) detailRuns.push(fact(sentence(`${item.name || "This person"} is listed as ${fields.title}`), `${path}/title`));
        if (fields.role) detailRuns.push(fact(sentence(`Their role is ${fields.role}`), `${path}/role`));
        if (fields.gender) detailRuns.push(fact(sentence(`Their stated gender is ${fields.gender}`), `${path}/gender`));
      } else {
        if (fields.offering_type) detailRuns.push(fact(sentence(`The offering type is ${fields.offering_type}`), `${path}/offering_type`));
        if (fields.category) detailRuns.push(fact(sentence(`This offering is listed under ${fields.category}`), `${path}/category`));
      }
      if (detailRuns.length) prose(detailRuns.flatMap((run, index) => [...(index ? [{ text: " " }] : []), run]));
      for (const [field, value] of Object.entries(item)) {
        if (["id", "name", ...(key === "key_people" ? ["title", "role", "gender"] : ["offering_type", "category"])].includes(field)) continue;
        if (["description", "background_or_relevance"].includes(field) && typeof value === "string" && populated(value)) add(value, { citations: citations(`${path}/${field}`) });
        else renderValue(value, label(field), `${path}/${field}`);
      }
    }
  }
  heading("Coverage & unknowns");
  add("Unknown means the saved evidence does not establish a value. It is not proof of absence. Partial or conflicting observations require review.", { muted: true });
  const coverage = input.kind === "snapshot" ? input.snapshot.provenance.coverage : roots.flatMap((item) => item.coverage);
  const groups = new Map<string, { section: string; explanation: string; fields: Set<string> }>();
  const addGap = (title: string, status: string, reason: string | null, path: string) => {
    const explanation = `${label(status)}${reason ? ` — ${reason}` : ". No additional reason recorded."}`;
    const section = label(path.split("/")[1] ?? "Other");
    const key = `${section}\0${explanation}`;
    if (!groups.has(key)) groups.set(key, { section, explanation, fields: new Set() });
    groups.get(key)!.fields.add(title.startsWith(`${section} / `) ? title.slice(section.length + 3) : title);
  };
  for (const item of coverage) if (item.status !== "found") for (const target of item.targets) {
    addGap(references.get(target) ?? target.split("/").filter((part) => part && !part.startsWith("@")).map(label).join(" / "), item.status, item.reason, target);
  }
  for (const [path, title] of unknowns) {
    if (!coverage.some((item) => item.targets.some((target) => path === target || path.startsWith(`${target}/`)))) addGap(title, "unknown", "No assessment recorded for this saved value.", path);
  }
  if (!groups.size) add("No unresolved coverage assessments recorded.");
  for (const section of new Set([...groups.values()].map((group) => group.section))) {
    heading(section, "field");
    for (const group of groups.values()) if (group.section === section) add(`${[...group.fields].join("; ")}. ${group.explanation}`, { bullet: true });
  }
  heading("Sources");
  add("Reference numbers identify the captured sources supporting the saved values. Full claims, exact supporting quotes, review states, and technical provenance are available in the JSON export; PDF also includes the original knowledge.json attachment.", { muted: true });
  if (!sources.length) add("No public website sources recorded. Human-provided values are not website quotations.");
  sources.forEach((source, index) => {
    add(`[${index + 1}] ${source.title || source.site_name || "Captured source"}`, { heading: "entry", anchor: `source_${index + 1}` });
    add(source.url, { href: /^https?:\/\//i.test(source.url) ? source.url : undefined });
    const metadata = [source.author, source.published_on ? `Published ${source.published_on}` : null, `Retrieved ${source.retrieved_at}`].filter(Boolean);
    add(metadata.join(" · "), { muted: true });
  });
  return paragraphs;
}

const NAVY = "173B5C";
const BLUE = "21699B";
/** Native Word headings, bold fact labels and bullets; no markup or external assets. */
export async function renderKnowledgeDocument(input: DocumentInput): Promise<Buffer> {
  const paragraphs = documentParagraphs(input).map((paragraph) => {
    const printable = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, (character) => `[U+${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}]`);
    const isTitle = paragraph.heading === "title";
    const isSection = paragraph.heading === "section";
    const isHeading = Boolean(paragraph.heading);
    const citationStyle = { size: 14, superScript: true, color: BLUE };
    const content = documentRuns(paragraph).flatMap((run) => {
      const textRuns = printable(run.text).split(/\r\n|\r|\n/).map((line, index) => new TextRun({ text: line,
        bold: isHeading || run.bold, color: run.href ? BLUE : isTitle ? NAVY : isSection ? BLUE : paragraph.muted ? "606A74" : "202A34",
        size: isTitle ? 42 : isSection ? 30 : isHeading ? 23 : paragraph.muted ? 19 : 22,
        ...(index ? { break: 1 } : {}),
      }));
      return [
        ...(run.href ? [new ExternalHyperlink({ link: run.href, children: textRuns })] : textRuns),
        ...(run.citations?.length ? [new TextRun({ text: " [", ...citationStyle }),
          ...run.citations.flatMap((number, index) => [
            ...(index ? [new TextRun({ text: ",", ...citationStyle })] : []),
            new InternalHyperlink({ anchor: `source_${number}`, children: [new TextRun({ text: String(number), ...citationStyle })] }),
          ]), new TextRun({ text: "]", ...citationStyle })] : []),
      ];
    });
    return new Paragraph({
      heading: isTitle ? HeadingLevel.TITLE : isSection ? HeadingLevel.HEADING_1
        : paragraph.heading === "entry" ? HeadingLevel.HEADING_2 : paragraph.heading === "field" ? HeadingLevel.HEADING_3 : undefined,
      alignment: isTitle ? AlignmentType.CENTER : undefined,
      ...(isTitle ? { border: { bottom: { color: BLUE, style: BorderStyle.SINGLE, size: 6, space: 12 } } } : {}),
      ...(paragraph.bullet ? { bullet: { level: Math.min(paragraph.depth, 3) } } : {}),
      indent: paragraph.bullet ? undefined : { left: Math.min(paragraph.depth, 4) * 120 },
      keepNext: isHeading,
      spacing: { before: isSection ? 280 : isTitle ? 0 : isHeading ? 140 : 0, after: isTitle ? 220 : isHeading ? 100 : 120, line: 280 },
      children: [
        ...(paragraph.swatch ? [new TextRun({ text: "\u00a0\u00a0", size: 20,
          shading: { fill: paragraph.swatch.slice(1) },
          border: { color: "88929B", style: BorderStyle.SINGLE, size: 4 },
        }), new TextRun({ text: "  " })] : []),
        ...(paragraph.anchor ? [new Bookmark({ id: paragraph.anchor, children: content })] : content),
      ],
    });
  });
  const name = input.kind === "draft" ? input.draft.company.name : input.snapshot.provenance.company.name;
  return Packer.toBuffer(new Document({
    title: `${name} — company profile`, creator: "MoFloKnowledge",
    description: "Complete company profile and source references",
    styles: { default: { document: { run: { font: "Arial", size: 22, color: "202A34" } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 864, bottom: 864, left: 864, right: 864 } } }, children: paragraphs }],
  }));
}
