import "server-only";
import type { verifiedSession } from "../lib/supabase/server";
import { authorizeCompany } from "./authorize";
import { checked } from "./read-model";
import { HttpError } from "./http";

type Client = Awaited<ReturnType<typeof verifiedSession>>["client"];
interface Headline { text: string; level: number | null; sources: string[] }
interface Cta { text: string; href: string | null; sources: string[] }
interface Hours { value: string; sources: string[] }
export interface CapturedHooks { headlines: Headline[]; ctas: Cta[]; leadMagnets: Cta[]; hours: Hours[] }
interface PageRow { normalized_url: string; title: string | null; cleaned_content: string | null; observations: unknown }

const LIMIT = 50;
const LEAD = /\b(?:newsletter|subscribe|ebook|guide|download|webinar|book|schedule|consult|free)\b/i;
const HOURS_LABEL = /(?:opening hours|hours)\s*:\s*([^\n]{3,120})/gi;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

function add<T extends { sources: string[] }>(map: Map<string, T>, key: string, item: T, source: string) {
  if (!key) { return; }
  const existing = map.get(key);
  if (!existing) { map.set(key, { ...item, sources: [source] }); }
  else if (!existing.sources.includes(source)) { existing.sources.push(source); }
}

function jsonLdHours(node: unknown, found: string[], depth = 0) {
  if (depth > 6) { return; }
  if (Array.isArray(node)) { for (const item of node) { jsonLdHours(item, found, depth + 1); } return; }
  const object = record(node);
  jsonLdHours(object["@graph"], found, depth + 1);
  for (const value of list(object.openingHours).concat(object.openingHours)) {
    const hours = text(value);
    if (hours) { found.push(hours); }
  }
  for (const spec of list(object.openingHoursSpecification).concat(object.openingHoursSpecification)) {
    const { dayOfWeek, opens, closes } = record(spec);
    const days = list(dayOfWeek).concat(dayOfWeek).map((day) => text(day).replace(/^.*\//, "")).filter(Boolean);
    const range = [text(opens), text(closes)].filter(Boolean).join("-");
    const hours = [...new Set(days)].join(", ") + (range ? ` ${range}` : "");
    if (hours.trim()) { found.push(hours.trim()); }
  }
}

/** Headlines, calls to action, lead magnets and opening hours in the company's captured pages, newest capture per URL. */
export async function readCapturedHooks(client: Client, companyId: string): Promise<CapturedHooks> {
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) { throw new HttpError(404, "unavailable", "Resource unavailable."); }
  await authorizeCompany(client, companyId, auth.user.id);
  const rows = (await checked(client.from("source_pages")
    .select("normalized_url,title,cleaned_content,observations")
    .eq("company_id", companyId).eq("capture_status", "captured")
    .order("recorded_at", { ascending: false }).limit(200))) as PageRow[] | null;
  const headlines = new Map<string, Headline>();
  const ctas = new Map<string, Cta>();
  const leads = new Map<string, Cta>();
  const hours = new Map<string, Hours>();
  const seen = new Set<string>();
  const key = (value: string) => value.toLowerCase();
  for (const row of rows ?? []) {
    const url = row.normalized_url;
    if (seen.has(url)) { continue; }
    seen.add(url);
    const observations = record(row.observations);
    for (const heading of list(observations.headings)) {
      const { level, text: value } = record(heading);
      const headline = text(value);
      if (level === 1 || level === 2) { add(headlines, key(headline), { text: headline, level, sources: [] }, url); }
    }
    for (const value of [text(row.title), text(observations.metaDescription)]) {
      add(headlines, key(value), { text: value, level: null, sources: [] }, url);
    }
    const addLead = (value: string, href: string | null) => {
      if (LEAD.test(value)) { add(leads, key(value), { text: value, href, sources: [] }, url); }
    };
    for (const cta of list(observations.ctas)) {
      const { label, destination } = record(cta);
      const value = text(label);
      const href = text(destination) || null;
      add(ctas, `${key(value)}|${href ?? ""}`, { text: value, href, sources: [] }, url);
      addLead(value, href);
    }
    for (const form of list(observations.forms)) {
      const { heading, submitLabels, action } = record(form);
      const value = [text(heading), ...list(submitLabels).map(text)].filter(Boolean).join(" - ");
      addLead(value, text(action) || null);
    }
    const found: string[] = [];
    jsonLdHours(observations.jsonLd, found);
    for (const match of (row.cleaned_content ?? "").matchAll(HOURS_LABEL)) { found.push(text(match[1])); }
    for (const value of found) { add(hours, key(value), { value, sources: [] }, url); }
  }
  const top = <T,>(map: Map<string, T>) => [...map.values()].slice(0, LIMIT);
  return { headlines: top(headlines), ctas: top(ctas), leadMagnets: top(leads), hours: top(hours) };
}
