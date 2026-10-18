import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";
import { nameKey as normalizeName } from "./text";
import { exactSentences, hasNegation, selectExactSentences } from "./source-excerpts";

interface Section {
  heading: string | null;
  level: number;
  paragraphs: string[];
  listItems: string[];
  links: { url: string; label: string }[];
}
const generic = /^(?:(?:(?:our|all|professional|business|tax)\s+)?(?:services|products|offerings)|what we offer)$/i;
const utility = /^(?:learn more|read more|view|details|contact|click here|get started|book now)$/i;
const categoryLabel = /^(?:[\p{L}\p{N}-]+\s+){0,2}(?:services|products|representation|consulting)$/iu;
interface ContentList { heading: string | null; intro: string | null; items: string[] }
const actionable = /\b(?:we|I)\s+(?:(?:also|can|will|have|are|been|been providing|will also)\s+){0,3}(?:provide|offer|perform|handle|monitor|prepare|repair|inspect|train|support|help|assist|use|manage|maintain|deliver|simplify)|\bour\b|\bis here to help\b|^Let .{1,120}\b(?:do|handle|provide)\b/i;
const promotional = /(?:\b(?:please call|contact us|contact our|call us|advertisers?|competitors?)\b|^(?:many|other|most) (?:companies|firms|providers)\b|^we['’]ll explain\b|\?\s*$|:\s*$)/i;
function serviceDescription(paragraphs: string[], name: string): string[] {
  const tokens = normalizeName(name).split(" ").filter((token) => token.length > 3 && !/^(?:service|services|product|products|with|your|their)$/.test(token));
  const sentences = [...new Set(paragraphs.flatMap(exactSentences))];
  const ranked = sentences.map((sentence, index) => ({ sentence, index, score:
    (actionable.test(sentence) || /\bwe have (?:a (?:deep )?understanding|been providing)\b/i.test(sentence)) && !promotional.test(sentence)
      ? 2 + tokens.filter((token) => normalizeName(sentence).split(" ").includes(token)).length * 2 +
        (/\b(?:we|I)\s+(?:also\s+)?(?:provide|offer|perform|handle|repair|prepare|manage)\b|\bour\b[^.!?]{0,60}\bservices\b/i.test(sentence) ? 3 : 0)
      : 0,
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  if (!ranked.length) {
    return selectExactSentences(paragraphs[0] ?? "", { maxSentences: 1, maxCharacters: 500 });
  }
  const selected: typeof ranked = [];
  for (const item of ranked) {
    if (selected.length >= 2) {
      break;
    }
    if (selected.length && [...selected.map((s) => s.sentence), item.sentence].join(" ").length > 600) {
      continue;
    }
    selected.push(item);
  }
  return selected.sort((a, b) => a.index - b.index).map((item) => item.sentence);
}
const servicePath = (url: string) => /\/(?:services|products|offerings)\/[^/]+\/?$/i.test(new URL(url).pathname);
const topicPath = (url: string) => /\/(?:articles?|blog|news|resources?|learning-center)(?:\/|$)/i.test(new URL(url).pathname);
export const serviceEntityKey = (url: string, name: string) => `${url}|service:${normalizeName(name)}`;

/** Preserve authored service copy and its hierarchy; never summarize or complete a service. */
export function serviceTextCandidates(page: StoredCapture, observations: TechnicalObservation[]): FieldCandidate[] {
  const result: FieldCandidate[] = [];
  const raw = page.capture.observations.contentSections;
  const sections = Array.isArray(raw) ? raw.slice(0, 80) as Section[] : [];
  const finalUrl = page.capture.finalUrl;
  const rawLists = page.capture.observations.contentLists;
  const contentLists = Array.isArray(rawLists) ? rawLists as ContentList[] : [];
  const sameSite = (url: string) => new URL(url).hostname === new URL(finalUrl).hostname;
  const idsFor = (texts: string[]) => [...new Set(texts.flatMap((text) =>
    page.capture.segments.filter((segment) => segment.text.includes(text)).map((segment) => segment.id)))].slice(0, 30);
  const add = (field: string, value: unknown, entity_key: string, texts: string[], observation_ids: string[] = [], priority = 80) => {
    const segment_ids = idsFor(texts);
    if (!segment_ids.length && !observation_ids.length) {
      return;
    }
    result.push({ field: field.startsWith("/") ? field : "/offerings/@id/" + field, value, entity_key, origin: "source_backed",
      segment_ids, observation_ids: [...new Set([...observation_ids, ...observations.filter((o) =>
        o.property === "heading" && o.value && texts.includes(o.value)).map((o) => o.id)])].slice(0, 30),
      supporting_fields: [], note: null, priority } as FieldCandidate);
  };
  const linkEvidence = (url: string, label: string) => observations.filter((o) =>
    (o.property === "href" && o.value === url) ||
    (o.property === "anchor-label" && o.value === label && o.asset_url === url)).map((o) => o.id);
  const features = (entity: string, texts: string[], context: string[], priority = 90, excluded: string[] = []) => {
    for (const original of [...new Set(texts)].slice(0, 80)) {
      const first = exactSentences(original)[0] ?? "";
      const excerpt = selectExactSentences(original, { maxSentences: first.length < 80 ? 2 : 1, maxCharacters: 300 }).join(" ");
      // A "Term - description" paragraph always keeps its term, even when the description excerpt is unusable.
      const term = /^([^-–—:.!?]{2,60}?) [-–—] \S/.exec(original)?.[1];
      const usable = (text: string) => text && text.length <= 4000 && !excluded.includes(text) && !promotional.test(text) && !hasNegation(text);
      const text = usable(excerpt) ? excerpt : term && usable(term) ? term : "";
      if (text && idsFor([original]).length) {
        add("features", [{ text }], entity, [...context, original], [], priority);
      }
    }
  };

  // A destination identifies an offering across index, navigation and detail pages.
  for (const link of page.capture.links) {
    if (!sameSite(link.url) || !servicePath(link.url) || !link.label || link.label.length > 200 || utility.test(link.label)) {
      continue;
    }
    const evidence = linkEvidence(link.url, link.label);
    if (evidence.length < 2) {
      continue;
    }
    add("name", link.label, link.url, [], evidence, 30);
    add("url", link.url, link.url, [], evidence, 80);
    if (link.url === finalUrl) {
      const meta = observations.find((o) => o.property === "meta-description" && o.value);
      if (meta) {
        add("description", meta.value, link.url, [], [...evidence, meta.id], 20);
      }
    }
  }
  // Only a main-content section supplies a category; repeated menus do not.
  for (const section of sections) {
    for (const link of section.links ?? []) {
      if (!sameSite(link.url) || !servicePath(link.url) ||
          !categoryLabel.test(link.label) ||
          !(section.links ?? []).some((other) => other.url === link.url && normalizeName(other.label) !== normalizeName(link.label))) {
        continue;
      }
      const evidence = linkEvidence(link.url, link.label);
      if (evidence.length >= 2) {
        add("category", link.label, link.url, [link.label], evidence, 85);
      }
    }
    if (!section.heading || !categoryLabel.test(section.heading) ||
        /^(?:our\s+)?(?:services|products|offerings)$|^what we offer$/i.test(section.heading)) {
      continue;
    }
    for (const link of section.links ?? []) {
      if (!sameSite(link.url) || !servicePath(link.url) || utility.test(link.label) ||
          normalizeName(link.label) === normalizeName(section.heading)) {
        continue;
      }
      const evidence = linkEvidence(link.url, link.label);
      if (evidence.length >= 2) {
        add("category", section.heading, link.url, [section.heading], evidence, 90);
      }
    }
  }

  const headings = sections.filter((section) => section.heading && section.heading.length <= 200 && !generic.test(section.heading));
  const selfLabels = page.capture.links.filter((link) => link.url === finalUrl).map((link) => normalizeName(link.label));
  const slug = normalizeName(new URL(finalUrl).pathname.replace(/\/$/, "").split("/").at(-1) ?? "");
  const routeName = (name: string) => normalizeName(name).replace(/\band\b/g, "").replace(/\s+/g, " ").trim();
  const schemaNames = observations.filter((o) => o.property?.endsWith("/name") &&
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the filter above keeps only observations whose property ends with /name
    observations.some((kind) => kind.property === o.property!.slice(0, -5) + "/@type" && /^(?:Service|Product)$/.test(kind.value ?? "")))
    .map((o) => normalizeName(o.value ?? ""));
  const primary = servicePath(finalUrl) ? headings.map((section) => ({ section, score:
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- `headings` keeps only sections that have a heading
    selfLabels.includes(normalizeName(section.heading!)) ? 100 :
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- `headings` keeps only sections that have a heading
      routeName(section.heading!) === routeName(slug) ? 95 :
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- `headings` keeps only sections that have a heading
        schemaNames.some((name) => (" " + name + " ").includes(" " + normalizeName(section.heading!) + " ")) ? 90 :
          section.level === 1 ? 70 : 0,
  })).sort((a, b) => b.score - a.score).find((item) => item.score > 0)?.section : undefined;

  if (primary?.heading) {
    const at = sections.indexOf(primary);
    const detail: Section[] = [];
    for (const section of sections.slice(at)) {
      if (section !== primary && section.heading && section.level < primary.level) {
        break;
      }
      if (section.heading && /^(?:tax )?resources|related articles|latest articles|testimonials|contact us$/i.test(section.heading)) {
        break;
      }
      detail.push(section);
    }
    const context = [primary.heading];
    const urlEvidence = observations.filter((o) => o.property === "url" && o.value === finalUrl).map((o) => o.id);
    const sameName = result.findIndex((candidate) => candidate.field === "/offerings/@id/name" &&
      candidate.entity_key === finalUrl && candidate.value === primary.heading);
    if (sameName >= 0) {
      result.splice(sameName, 1);
    }
    add("name", primary.heading, finalUrl, context, [], 95);
    if (!result.some((candidate) => candidate.field === "/offerings/@id/url" && candidate.entity_key === finalUrl)) {
      add("url", finalUrl, finalUrl, context, urlEvidence, 95);
    }
    const authoredParagraphs = detail.flatMap((section) => section.paragraphs ?? []);
    const resourceAt = authoredParagraphs.findIndex((text) => /^(?:(?:tax|useful|helpful)\s+)?resources$/i.test(text));
    const paragraphs = [...new Set(resourceAt < 0 ? authoredParagraphs : authoredParagraphs.slice(0, resourceAt))]
      .filter((text) => text && idsFor([text]).length).slice(0, 25);
    const descriptionParts = serviceDescription(primary.paragraphs?.length ? primary.paragraphs : paragraphs, primary.heading);
    const description = descriptionParts.join("\n\n");
    if (description && description.length <= 20000) {
      add("description", description, finalUrl, [...context, ...paragraphs.filter((paragraph) => descriptionParts.some((part) => paragraph.includes(part)))], [], 95);
    }
    features(finalUrl, detail.flatMap((section) => [
      ...(section.listItems ?? []).filter((text) => !(section.links ?? []).some((link) => link.label === text && !sameSite(link.url))),
      ...(section !== primary ? (section.paragraphs ?? []).filter((text) => actionable.test(text)) : []),
    ]).concat(paragraphs.flatMap(exactSentences).filter((text) => !descriptionParts.includes(text) && /\b(?:we(?:[’']ll| will| can)?\s+(?:also\s+)?(?:perform|provide|handle|monitor|adhere|offer|help)|our (?:services|team)|(?:services|functions) (?:include|are))\b/i.test(text))), context, 90, descriptionParts);

    // A prose list ("such as a, b and c") in the offering's own detail page becomes features of that offering.
    for (const sentence of paragraphs.flatMap(exactSentences)) {
      const list = /\b(?:we|I)\s+(?:also\s+)?(?:perform|provide|offer|handle|manage)\b[^.!?]*?\b(?:such as|including)\s+([^.!?]+)$/i.exec(sentence.replace(/[.!?]$/, ""));
      const items = list ? list[1].split(/,\s*(?:and\s+)?|\s+and\s+(?=[^,]*$)/).map((item) => item.trim()).filter(Boolean) : [];
      if (items.length >= 3) {
        for (const item of items) {
          add("features", [{ text: item }], finalUrl, [...context, sentence], [], 90);
        }
      }
    }
  }

  // Company pages may declare an explicit service catalog or a restriction on
  // an existing linked service. The catalog's siblings never become child features.
  if (!topicPath(finalUrl)) {
    for (const list of primary ? [] : contentLists) {
      if (!list.intro || !/\b(?:our\s+)?services?\b[^.!?]{0,100}\b(?:include|following|offer)|\bwe\s+(?:offer|provide)\b/i.test(list.intro)) {
        continue;
      }
      const context = [list.intro, ...(list.heading ? [list.heading] : [])];
      for (const name of list.items) {
        if (!name || name.length > 200 || promotional.test(name)) {
          continue;
        }
        const linked = page.capture.links.find((link) => sameSite(link.url) && servicePath(link.url) && normalizeName(link.label) === normalizeName(name));
        if (linked || /\b(?:estate|gift|trust)\b/i.test(name) && /\breturns?\b/i.test(name)) {
          const entity = linked?.url ?? serviceEntityKey(finalUrl, name);
          add("name", name, entity, [...context, name], [], 96);
          if (linked) {
            add("url", linked.url, entity, [...context, name], linkEvidence(linked.url, linked.label));
          }
        }
      }
    }
    const authored = sections.flatMap((section) => section.paragraphs ?? []).flatMap(exactSentences);
    for (const sentence of authored) {
      if (!/\b(?:primarily|only|available (?:to|for)|existing clients|requires?|restricted|limited to)\b/i.test(sentence)) {
        continue;
      }
      for (const link of page.capture.links) {
        if (!sameSite(link.url) || !servicePath(link.url) || link.url === finalUrl || generic.test(link.label)) {
          continue;
        }
        const names = normalizeName(link.label).split(" ").filter((token) => token.length > 3 && !/^(?:services|service|products|product)$/.test(token));
        if (names.length && names.every((token) => normalizeName(sentence).split(" ").includes(token))) {
          features(link.url, [sentence], [sentence], 96);
        }
      }
    }
  }

  const blocks = page.capture.observations.offeringBlocks;
  if (Array.isArray(blocks)) {
    for (const block of blocks.slice(0, 30) as { name?: unknown; description?: unknown; url?: unknown }[]) {
    if (typeof block.name !== "string" || !block.name || block.name.includes("|") || !idsFor([block.name]).length) {
      continue;
    }
    const namedLinks = [...new Set(page.capture.links.filter((link) => sameSite(link.url) && servicePath(link.url) &&
      normalizeName(link.label) === normalizeName(block.name as string)).map((link) => link.url))];
    const entity = typeof block.url === "string" && page.capture.links.some((link) => link.url === block.url)
      ? block.url : namedLinks.length === 1 ? namedLinks[0] : serviceEntityKey(finalUrl, block.name);
    add("name", block.name, entity, [block.name], [], 85);
    if (typeof block.description === "string" && block.description && idsFor([block.description]).length) {
      add("description", block.description, entity, [block.name, block.description], [], 80);
    }
    if (typeof block.url === "string" && page.capture.links.some((link) => link.url === block.url)) {
      add("url", block.url, entity, [block.name], observations.filter((o) => o.property === "href" && o.value === block.url).map((o) => o.id));
    }
  }
  }

  // Generic structural offerings: they do not depend on the page address.
  const covered = new Set(result.filter((c) => c.field === "/offerings/@id/name").map((c) => normalizeName(String(c.value))));
  const navGroups = page.capture.observations.navGroups;
  for (const group of Array.isArray(navGroups) ? navGroups as { url: string; label: string }[][] : []) {
    // Sibling submenu pages named "<place> <shared trailing words>" are each a service offering.
    const links = group.filter((link) => sameSite(link.url) && link.label.length <= 100);
    const lastWord = (label: string) => label.toLowerCase().split(" ").at(-1) ?? "";
    for (const word of new Set(links.map((link) => lastWord(link.label)))) {
      const bucket = links.filter((link) => lastWord(link.label) === word);
      const words = bucket.map((link) => link.label.split(" "));
      let shared = 0;
      while (words.every((w) => w.length > shared + 1 && w.at(-1 - shared)?.toLowerCase() === words[0].at(-1 - shared)?.toLowerCase())) {
        shared++;
      }
      const leading = words.map((w) => w.slice(0, w.length - shared).join(" "));
      if (bucket.length < 2 || !shared || new Set(leading.map((l) => l.toLowerCase())).size !== bucket.length ||
          !words[0].slice(-shared).some((w) => w.length > 3)) {
        continue;
      }
      bucket.forEach((link, index) => {
        const evidence = linkEvidence(link.url, link.label);
        add("name", link.label, link.url, [], evidence, 85);
        add("category", "Service", link.url, [], evidence, 85);
        add("url", link.url, link.url, [], evidence, 80);
        add("/company_foundation/service_locations", [{ text: leading[index] }], link.url, [], evidence, 60);
        const first = link.url === finalUrl ? sections.find((section) => section.paragraphs?.length)?.paragraphs[0] : undefined;
        if (first) {
          add("description", first, link.url, [first], [], 80);
        }
        covered.add(normalizeName(link.label));
      });
    }
  }
  const cards = page.capture.observations.catalogueCards;
  for (const card of (Array.isArray(cards) ? cards : []).slice(0, 6) as { title: string; price: string }[]) {
    const entity = serviceEntityKey(finalUrl, card.title);
    add("name", card.title, entity, [card.title], [], 80);
    add("category", "Listing", entity, [card.title], [], 80);
    if (idsFor([card.price]).length && /\d/.test(card.price)) {
      const amount = card.price.replace(/[^\d.]/g, "");
      add("pricing", { kind: "paid", raw: card.price, amount, min_amount: null, max_amount: null, currency: null,
        billing_interval: null, pricing_model: null, qualifications: [], as_of: null }, entity, [card.title, card.price], [], 80);
    }
    covered.add(normalizeName(card.title));
  }
  const listHeading = sections.find((section) => section.level === 1 && section.heading);
  if (!primary && listHeading?.heading && /\b(?:services|solutions)\b/i.test(listHeading.heading)) {
    for (const section of sections.filter((item) => (item.level === 2 || item.level === 3) && item.heading && item.paragraphs?.length).slice(0, 30)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the filter above keeps only sections that have a heading
      const name = section.heading!;
      if (name.length > 200 || covered.has(normalizeName(name)) || utility.test(name) ||
          page.capture.links.some((link) => sameSite(link.url) && servicePath(link.url) && normalizeName(link.label) === normalizeName(name))) {
        continue;
      }
      const entity = serviceEntityKey(finalUrl, name);
      add("name", name, entity, [name], [], 80);
      const description = selectExactSentences(section.paragraphs[0], { maxSentences: 2, maxCharacters: 500 }).join(" ");
      if (description) {
        add("description", description, entity, [name, section.paragraphs[0]], [], 75);
      }
    }
  }
  return result;
}
