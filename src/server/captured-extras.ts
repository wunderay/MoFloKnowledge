import "server-only";
import type { verifiedSession } from "../lib/supabase/server";
import { authorizeCompany } from "./authorize";
import { checked } from "./read-model";
import { HttpError } from "./http";

type Client = Awaited<ReturnType<typeof verifiedSession>>["client"];
interface CapturedFaq { question: string; answer: string; sources: string[] }
interface CapturedContact { kind: "email" | "phone"; value: string; sources: string[] }
export interface CapturedExtras { faqs: CapturedFaq[]; contacts: CapturedContact[] }
interface PageRow { normalized_url: string; cleaned_content: string | null; observations: unknown }

const LIMIT = 50;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{5,}\d/g;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

function jsonLdQuestions(node: unknown, found: { question: string; answer: string }[], depth = 0) {
  if (depth > 6) { return; }
  for (const item of list(node)) { jsonLdQuestions(item, found, depth + 1); }
  const object = record(node);
  if (Array.isArray(node)) { return; }
  jsonLdQuestions(object["@graph"], found, depth + 1);
  const types = list(object["@type"]).concat(object["@type"]);
  if (types.includes("Question")) {
    const question = text(object.name);
    const answer = text(record(list(object.acceptedAnswer)[0] ?? object.acceptedAnswer).text);
    if (question && answer) { found.push({ question, answer }); }
  }
  if (types.includes("FAQPage")) { jsonLdQuestions(object.mainEntity, found, depth + 1); }
}

function add<T extends { sources: string[] }>(map: Map<string, T>, key: string, item: T, source: string) {
  const existing = map.get(key);
  if (!existing) { map.set(key, { ...item, sources: [source] }); }
  else if (!existing.sources.includes(source)) { existing.sources.push(source); }
}

/** FAQ answers and contact details found in the company's captured pages, newest capture per URL. */
export async function readCapturedExtras(client: Client, companyId: string): Promise<CapturedExtras> {
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) { throw new HttpError(404, "unavailable", "Resource unavailable."); }
  await authorizeCompany(client, companyId, auth.user.id);
  const rows = (await checked(client.from("source_pages")
    .select("normalized_url,cleaned_content,observations")
    .eq("company_id", companyId).eq("capture_status", "captured")
    .order("recorded_at", { ascending: false }).limit(200))) as PageRow[] | null;
  const faqs = new Map<string, CapturedFaq>();
  const contacts = new Map<string, CapturedContact>();
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const url = row.normalized_url;
    if (seen.has(url)) { continue; }
    seen.add(url);
    const observations = record(row.observations);
    const found: { question: string; answer: string }[] = [];
    jsonLdQuestions(observations.jsonLd, found);
    for (const section of list(observations.contentSections)) {
      const { heading, paragraphs } = record(section);
      const question = text(heading);
      const answer = list(paragraphs).map(text).filter(Boolean).join(" ");
      if (question.endsWith("?") && answer) { found.push({ question, answer }); }
    }
    for (const { question, answer } of found) {
      add(faqs, question.toLowerCase(), { question, answer, sources: [] }, url);
    }
    const content = row.cleaned_content ?? "";
    for (const email of content.match(EMAIL) ?? []) {
      add(contacts, `email:${email.toLowerCase()}`, { kind: "email", value: email.toLowerCase(), sources: [] }, url);
    }
    for (const phone of content.match(PHONE) ?? []) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        add(contacts, `phone:${digits}`, { kind: "phone", value: phone.trim(), sources: [] }, url);
      }
    }
  }
  return { faqs: [...faqs.values()].slice(0, LIMIT), contacts: [...contacts.values()].slice(0, LIMIT) };
}
