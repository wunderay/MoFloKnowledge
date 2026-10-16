import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";

type Section = {
  heading: string | null;
  level: number;
  paragraphs: string[];
  listItems: string[];
  links: { url: string; label: string }[];
};
const normalizeName = (value: string) => value.toLowerCase().replace(/&/g, " and ")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const generic = /^(?:(?:(?:our|all|professional|business|tax)\s+)?(?:services|products|offerings)|what we offer)$/i;
const utility = /^(?:learn more|read more|view|details|contact|click here|get started|book now)$/i;
const servicePath = (url: string) => /\/(?:services|products|offerings)\/[^/]+\/?$/i.test(new URL(url).pathname);
const topicPath = (url: string) => /\/(?:articles?|blog|news|resources?|learning-center)(?:\/|$)/i.test(new URL(url).pathname);
export const serviceEntityKey = (url: string, name: string) => `${url}|service:${normalizeName(name)}`;

/** Preserve authored service copy and its hierarchy; never summarize or complete a service. */
export function serviceTextCandidates(page: StoredCapture, observations: TechnicalObservation[]): FieldCandidate[] {
  const result: FieldCandidate[] = [];
  const raw = page.capture.observations.contentSections;
  const sections = Array.isArray(raw) ? raw.slice(0, 80) as Section[] : [];
  const finalUrl = page.capture.finalUrl;
  const sameSite = (url: string) => new URL(url).hostname === new URL(finalUrl).hostname;
  const idsFor = (texts: string[]) => [...new Set(texts.flatMap((text) =>
    page.capture.segments.filter((segment) => segment.text.includes(text)).map((segment) => segment.id)))].slice(0, 30);
  const add = (field: string, value: unknown, entity_key: string, texts: string[], observation_ids: string[] = [], priority = 80) => {
    const segment_ids = idsFor(texts);
    if (!segment_ids.length && !observation_ids.length) return;
    result.push({ field: "/offerings/@id/" + field, value, entity_key, origin: "source_backed",
      segment_ids, observation_ids: [...new Set([...observation_ids, ...observations.filter((o) =>
        o.property === "heading" && o.value && texts.includes(o.value)).map((o) => o.id)])].slice(0, 30),
      supporting_fields: [], note: null, priority } as FieldCandidate);
  };
  const linkEvidence = (url: string, label: string) => observations.filter((o) =>
    (o.property === "href" && o.value === url) ||
    (o.property === "anchor-label" && o.value === label && o.asset_url === url)).map((o) => o.id);
  const features = (entity: string, texts: string[], context: string[], priority = 90) => {
    for (const text of [...new Set(texts)].slice(0, 80))
      if (text && text.length <= 4000 && idsFor([text]).length)
        add("features", [{ text }], entity, [...context, text], [], priority);
  };

  // A destination identifies an offering across index, navigation and detail pages.
  for (const link of page.capture.links) {
    if (!sameSite(link.url) || !servicePath(link.url) || !link.label || link.label.length > 200 || utility.test(link.label)) continue;
    const evidence = linkEvidence(link.url, link.label);
    if (evidence.length < 2) continue;
    add("name", link.label, link.url, [], evidence, 30);
    add("url", link.url, link.url, [], evidence, 80);
    if (link.url === finalUrl) {
      const meta = observations.find((o) => o.property === "meta-description" && o.value);
      if (meta) add("description", meta.value, link.url, [], [...evidence, meta.id], 20);
    }
  }
  // Only a main-content section supplies a category; repeated menus do not.
  for (const section of sections) {
    for (const link of section.links ?? []) {
      if (!sameSite(link.url) || !servicePath(link.url) ||
          !/^(?:[\p{L}\p{N}-]+\s+){0,2}(?:services|representation|consulting)$/iu.test(link.label) ||
          !(section.links ?? []).some((other) => other.url === link.url && normalizeName(other.label) !== normalizeName(link.label))) continue;
      const evidence = linkEvidence(link.url, link.label);
      if (evidence.length >= 2) add("category", link.label, link.url, [link.label], evidence, 85);
    }
    if (!section.heading || !/\b(?:services|products|representation|consulting)\b/i.test(section.heading) ||
        /^(?:our\s+)?(?:services|products|offerings)$|^what we offer$/i.test(section.heading)) continue;
    for (const link of section.links ?? []) {
      if (!sameSite(link.url) || !servicePath(link.url) || utility.test(link.label) ||
          normalizeName(link.label) === normalizeName(section.heading)) continue;
      const evidence = linkEvidence(link.url, link.label);
      if (evidence.length >= 2) add("category", section.heading, link.url, [section.heading], evidence, 90);
    }
  }

  const headings = sections.filter((section) => section.heading && section.heading.length <= 200 && !generic.test(section.heading));
  const selfLabels = page.capture.links.filter((link) => link.url === finalUrl).map((link) => normalizeName(link.label));
  const slug = normalizeName(new URL(finalUrl).pathname.replace(/\/$/, "").split("/").at(-1) ?? "");
  const routeName = (name: string) => normalizeName(name).replace(/\band\b/g, "").replace(/\s+/g, " ").trim();
  const schemaNames = observations.filter((o) => o.property?.endsWith("/name") &&
    observations.some((kind) => kind.property === o.property!.slice(0, -5) + "/@type" && /^(?:Service|Product)$/.test(kind.value ?? "")))
    .map((o) => normalizeName(o.value ?? ""));
  const primary = servicePath(finalUrl) ? headings.map((section) => ({ section, score:
    selfLabels.includes(normalizeName(section.heading!)) ? 100 :
      routeName(section.heading!) === routeName(slug) ? 95 :
        schemaNames.some((name) => (" " + name + " ").includes(" " + normalizeName(section.heading!) + " ")) ? 90 :
          section.level === 1 ? 70 : 0,
  })).sort((a, b) => b.score - a.score).find((item) => item.score > 0)?.section : undefined;

  if (primary?.heading) {
    const at = sections.indexOf(primary);
    const detail: Section[] = [];
    for (const section of sections.slice(at)) {
      if (section !== primary && section.heading && section.level < primary.level) break;
      if (section.heading && /^(?:tax )?resources|related articles|latest articles|testimonials|contact us$/i.test(section.heading)) break;
      detail.push(section);
    }
    const context = [primary.heading];
    const urlEvidence = observations.filter((o) => o.property === "url" && o.value === finalUrl).map((o) => o.id);
    const sameName = result.findIndex((candidate) => candidate.field === "/offerings/@id/name" &&
      candidate.entity_key === finalUrl && candidate.value === primary.heading);
    if (sameName >= 0) result.splice(sameName, 1);
    add("name", primary.heading, finalUrl, context, [], 95);
    if (!result.some((candidate) => candidate.field === "/offerings/@id/url" && candidate.entity_key === finalUrl))
      add("url", finalUrl, finalUrl, context, urlEvidence, 95);
    const authoredParagraphs = detail.flatMap((section) => section.paragraphs ?? []);
    const resourceAt = authoredParagraphs.findIndex((text) => /^(?:(?:tax|useful|helpful)\s+)?resources$/i.test(text));
    const paragraphs = [...new Set(resourceAt < 0 ? authoredParagraphs : authoredParagraphs.slice(0, resourceAt))]
      .filter((text) => text && idsFor([text]).length).slice(0, 25);
    const description = paragraphs.join("\n\n");
    if (description && description.length <= 20000)
      add("description", description, finalUrl, [...context, ...paragraphs], [], 95);
    features(finalUrl, detail.flatMap((section) => [
      ...(section.listItems ?? []).filter((text) => !(section.links ?? []).some((link) => link.label === text && !sameSite(link.url))),
      ...(section !== primary && section.heading ? [section.heading, ...(section.paragraphs ?? [])] : []),
    ]).concat(paragraphs.filter((text) => /\b(?:we(?:[’']ll| will| can)?\s+(?:also\s+)?(?:perform|provide|handle|monitor|adhere|offer|help)|our (?:services|team)|(?:services|functions) (?:include|are))\b/i.test(text))), context);

    // A specialized named return or start-up service can be marketed within a broader
    // preparation page. Ordinary return variants remain features of the parent service.
    for (const name of detail.flatMap((section) => section.listItems ?? [])) {
      const specializedReturn = /\b(?:estate|gift|trust)\b/i.test(name) && /\b(?:returns?|preparation)\b/i.test(name);
      const startup = /\bbusiness start[- ]?ups?\b/i.test(name) && paragraphs.some((p) =>
        /\b(?:we|I)\s+(?:also\s+)?(?:offer|provide|help|assist)\b/i.test(p) && /\bstart[- ]?ups?\b/i.test(p));
      if (!specializedReturn && !startup) continue;
      const section = detail.find((s) => s.listItems?.includes(name));
      if (!section || ![...(section.paragraphs ?? []), ...(section.heading ? [section.heading] : [])]
        .some((text) => /\b(?:services? include|preparation|we (?:offer|provide))\b/i.test(text))) continue;
      const entity = serviceEntityKey(finalUrl, name);
      const childContext = [...context, name, ...(section.paragraphs ?? []).filter((p) => /services? include/i.test(p))];
      const childDescription = startup ? paragraphs.filter((p) => /\bstart[- ]?ups?\b/i.test(p)).join("\n\n") : name;
      add("name", name, entity, childContext, [], 85);
      add("description", childDescription || name, entity, [...childContext, ...(startup ? paragraphs.filter((p) => /\bstart[- ]?ups?\b/i.test(p)) : [])], [], 85);
      add("category", primary.heading, entity, childContext, [], 85);
      features(entity, paragraphs.filter((p) => startup && /\bstart[- ]?ups?\b/i.test(p)), childContext);
    }
  }

  // First-person professional biographies can explicitly market interim support.
  // A client-industry list, testimonial or article is never a provider declaration.
  if (!topicPath(finalUrl) && /\/(?:about(?:-us)?|team|people|staff)(?:\/|$)/i.test(new URL(finalUrl).pathname)) {
    for (const section of sections) for (const paragraph of section.paragraphs ?? []) {
      const match = /\b(?:I|we)\s+(?:can\s+)?(?:provide|offer)\s+((?:part[- ]time|interim)[^.!?]{4,160}?\bservices)\b/i.exec(paragraph);
      if (!match) continue;
      const name = match[1];
      const entity = serviceEntityKey(finalUrl, name);
      add("name", name, entity, [paragraph], [], 85);
      add("description", paragraph, entity, [paragraph], [], 95);
      features(entity, [paragraph], [name]);
    }
  }

  const blocks = page.capture.observations.offeringBlocks;
  if (Array.isArray(blocks)) for (const block of blocks.slice(0, 30) as { name?: unknown; description?: unknown; url?: unknown }[]) {
    if (typeof block.name !== "string" || !block.name || block.name.includes("|") || !idsFor([block.name]).length) continue;
    const namedLinks = [...new Set(page.capture.links.filter((link) => sameSite(link.url) && servicePath(link.url) &&
      normalizeName(link.label) === normalizeName(block.name as string)).map((link) => link.url))];
    const entity = typeof block.url === "string" && page.capture.links.some((link) => link.url === block.url)
      ? block.url : namedLinks.length === 1 ? namedLinks[0] : serviceEntityKey(finalUrl, block.name);
    add("name", block.name, entity, [block.name], [], 85);
    if (typeof block.description === "string" && block.description && idsFor([block.description]).length)
      add("description", block.description, entity, [block.name, block.description], [], 80);
    if (typeof block.url === "string" && page.capture.links.some((link) => link.url === block.url))
      add("url", block.url, entity, [block.name], observations.filter((o) => o.property === "href" && o.value === block.url).map((o) => o.id));
  }
  return result;
}
