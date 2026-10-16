import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { z } from "zod";
import type { KnowledgeBaseExport, EntryProvenance, Claim } from "../contracts";
import type { DraftResponseSchema } from "../contracts/api-responses";
import { createEmptyBusiness } from "../contracts/defaults";
import { downloadFilename } from "./download-name";

export type DocumentInput =
  | { kind: "draft"; draft: z.infer<typeof DraftResponseSchema> }
  | { kind: "snapshot"; snapshot: KnowledgeBaseExport };
export type DocumentParagraph = {
  text: string;
  depth: number;
  heading?: "title" | "section" | "entry" | "field";
  label?: string;
  bullet?: boolean;
  muted?: boolean;
};
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
    return numbers.size ? ` [${[...numbers].sort((a, b) => a - b).join(", ")}]` : "";
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
  const renderValue = (value: unknown, title: string, path: string, depth = 0): void => {
    if (!populated(value)) return;
    if (Array.isArray(value)) {
      heading(title, "field");
      for (const [index, item] of value.entries()) {
        const itemPath = `${path}/${item && typeof item === "object" && "id" in item ? `@${item.id}` : index}`;
        if (item && typeof item === "object" && "text" in item) {
          add(String(item.text) + citations(`${itemPath}/text`), { bullet: true, depth });
          for (const [key, child] of Object.entries(item)) if (!["id", "text"].includes(key)) renderValue(child, label(key), `${itemPath}/${key}`, depth + 1);
        } else if (item && typeof item === "object") {
          const fields = Object.entries(item).filter(([key]) => key !== "id");
          const primary = ["name", "label", "family", "hex", "platform", "raw"].map((key) => fields.find(([field, child]) => field === key && populated(child))).find(Boolean);
          if (primary) add(String(primary[1]) + citations(`${itemPath}/${primary[0]}`), { heading: "entry", depth });
          for (const [key, child] of fields) if (key !== primary?.[0]) renderValue(child, label(key), `${itemPath}/${key}`, depth + 1);
        } else add(String(item) + citations(itemPath), { bullet: true, depth });
      }
    } else if (value && typeof value === "object") {
      heading(title, "field");
      for (const [key, child] of Object.entries(value)) if (key !== "id") renderValue(child, label(key), `${path}/${key}`, depth);
    } else {
      const formatted = typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
      const citation = citations(path);
      if (typeof value === "string" && value.length > 160) {
        heading(title + citation, "field");
        add(formatted, { depth });
      } else add(formatted + citation, { label: title, depth });
    }
  };
  const section = (title: string, content: unknown, path: string) => {
    heading(title);
    if (!populated(content)) add("Not established in the saved knowledge. See coverage notes.", { muted: true });
    else if (typeof content === "string") add(content + citations(path));
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
  const { overview: _overview, ...details } = business.company_foundation;
  section("Company details", details, "/company_foundation");
  section("Pitch", business.positioning.company_pitch, "/positioning/company_pitch");
  section("Market & customers", business.market_and_customers, "/market_and_customers");
  section("Founding story", business.positioning.founding_story, "/positioning/founding_story");
  section("Branding & style", business.branding_and_style, "/branding_and_style");
  if (populated(business.branding_and_style.fonts) || populated(business.branding_and_style.brand_colors)) add("Website observations are not confirmed brand guidelines unless explicitly marked as confirmed.", { muted: true });
  section("Online presence", business.online_presence, "/online_presence");
  for (const [key, title] of [["key_people", "Key people"], ["offerings", "Offerings"]] as const) {
    heading(title);
    if (!business[key].length) add("No entries recorded in the saved knowledge.", { muted: true });
    for (const item of business[key]) {
      const path = `/${key}/@${item.id}`;
      heading((item.name || (key === "offerings" ? "Unnamed offering" : "Unnamed person")) + citations(`${path}/name`), "entry");
      if (input.kind === "draft") {
        const entry = input.draft.entries.find((entry) => entry.id === item.id || ("id" in entry.content && entry.content.id === item.id));
        if (entry) add(`${label(entry.review_status)} · saved revision ${entry.current_revision}`, { muted: true });
      }
      for (const [field, value] of Object.entries(item)) {
        if (["id", "name"].includes(field)) continue;
        if (["description", "background_or_relevance"].includes(field) && typeof value === "string" && populated(value)) add(value + citations(`${path}/${field}`));
        else renderValue(value, label(field), `${path}/${field}`);
      }
    }
  }
  heading("Coverage & unknowns");
  add("Unknown means the saved evidence does not establish a value. It is not proof of absence. Partial or conflicting observations require review.", { muted: true });
  const coverage = input.kind === "snapshot" ? input.snapshot.provenance.coverage : roots.flatMap((item) => item.coverage);
  const groups = new Map<string, { explanation: string; fields: Set<string> }>();
  const addGap = (title: string, status: string, reason: string | null) => {
    const explanation = `${label(status)}${reason ? ` — ${reason}` : ". No additional reason recorded."}`;
    if (!groups.has(explanation)) groups.set(explanation, { explanation, fields: new Set() });
    groups.get(explanation)!.fields.add(title);
  };
  for (const item of coverage) if (item.status !== "found") for (const target of item.targets) {
    addGap(references.get(target) ?? target.split("/").filter((part) => part && !part.startsWith("@")).map(label).join(" / "), item.status, item.reason);
  }
  for (const [path, title] of unknowns) {
    if (!coverage.some((item) => item.targets.some((target) => path === target || path.startsWith(`${target}/`)))) addGap(title, "unknown", "No assessment recorded for this saved value.");
  }
  if (!groups.size) add("No unresolved coverage assessments recorded.");
  for (const group of groups.values()) add(`${[...group.fields].join("; ")}. ${group.explanation}`, { bullet: true });
  heading("Sources");
  add("Reference numbers identify the captured sources supporting the saved values. Full claims, exact supporting quotes, review states, and technical provenance are available in the JSON export; PDF also includes the original knowledge.json attachment.", { muted: true });
  if (!sources.length) add("No public website sources recorded. Human-provided values are not website quotations.");
  sources.forEach((source, index) => {
    add(`[${index + 1}] ${source.title || source.site_name || "Captured source"}`, { heading: "entry" });
    add(source.url);
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
    const printable = paragraph.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, (character) => `[U+${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}]`);
    const isTitle = paragraph.heading === "title";
    const isSection = paragraph.heading === "section";
    const isHeading = Boolean(paragraph.heading);
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
        ...(paragraph.label ? [new TextRun({ text: `${paragraph.label}: `, bold: true })] : []),
        ...printable.split(/\r\n|\r|\n/).map((line, index) => new TextRun({ text: line,
          bold: isHeading, color: isTitle ? NAVY : isSection ? BLUE : paragraph.muted ? "606A74" : "202A34",
          size: isTitle ? 42 : isSection ? 30 : isHeading ? 23 : paragraph.muted ? 19 : 22,
          ...(index ? { break: 1 } : {}),
        })),
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
