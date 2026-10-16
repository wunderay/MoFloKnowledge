import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";
import { exactSentences } from "./source-excerpts";

const root = "/market_and_customers/";
export const MARKET_TEXT_SUPPORTED_FIELDS = [
  "target_buyers", "customer_needs", "ideal_customer_personas",
  "industry_groupings", "channels", "ctas", "suppliers_and_partners",
].map((field) => root + field);

type Section = {
  heading: string | null;
  paragraphs: string[];
  listItems: string[];
};
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const problem = /\b(?:stress(?:ful)?|difficult|complex(?:ities)?|headaches?|burden|costly mistakes|delays|problems?|worry|overlook(?:ing)?|struggl\w*)\b/i;
const benefit = /\b(?:save|saving|reduce|reducing|minimi[sz]e|maximi[sz]e|simplify|improve|resolve|ensur(?:e|ing)|protect|secure|focus on|comp[l]?iant|compliance|peace of mind|keep you)\b/i;
const customer = /\b(?:you|your|clients?|customers?|business(?:es)?|companies|individuals|start-ups)\b/i;
const actionable = /^(?:get started|schedule\b|book\b|make an appointment\b|contact\b|request\b|sign up\b|subscribe\b|notify me\b|submit\b|send\b|start (?:a|your)\b|join\b|buy\b|shop\b|order\b|try\b|download\b|refer\b|referrals\b|call\b)/i;
const buyerNoun = /\b(?:(?:(?:brand[- ]new|small and (?:mid|medium)[- ]sized|small(?:er)?|mid[- ]sized|medium[- ]sized|large|growing|established|start[- ]up|mature|local)\s+){0,3}(?:businesses|business owners|business|companies|corporations|corporation|individuals|entrepreneurs|start-ups|families|homeowners|nonprofits|retirees))(?:\s+(?:with\s+\d+\s*(?:to|[-–—])\s*\d+\s+employees|nearing retirement))?\b/gi;
/** Identity normalization only: the displayed audience always remains an exact source phrase. */
export const buyerIdentityKey = (text: string) => clean(text).toLowerCase()
  .replace(/\bbusinesses\b/g, "business").replace(/\bcompanies\b/g, "company")
  .replace(/\bcorporations\b/g, "corporation").replace(/\bindividuals\b/g, "individual")
  .replace(/\bstart-ups\b/g, "start-up").replace(/[^\p{L}\p{N}]+/gu, "");
const needText = (text: string) => text.length >= 35 && text.length <= 500 &&
  /\b(?:you|your|clients?|customers?)\b/i.test(text) && (problem.test(text) || benefit.test(text)) &&
  !/:$|^(?:copyright|terms|privacy|before you|it is important|these |this |perhaps most importantly)|\b(?:cookie|advertis(?:ing|ement)|third[- ]party|our (?:staff|employees|team)|top[- ]rated|expertise|our knowledge)|(?:with problem areas|tackle the burden)\.?$/i.test(text) &&
  !/\b(?:contact(?:ing)?|call|schedule|subscribe|sign up)\b|\b(?:these|those) (?:updates|regulations|improvements)|\b(?:we['’]ll|we will) stay\b/i.test(text) &&
  !/\b(?:not|never)\s+(?:be\s+)?(?:looking\s+to\s+)?(?:save|improve|reduce|simplify|secure)\b/i.test(text);
const sentences = exactSentences;

/** Literal passages and observed controls only. These rules never invent a buyer or a conversion step. */
export function marketTextCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
): FieldCandidate[] {
  const result: FieldCandidate[] = [];
  const seen = new Set<string>();
  const buyers = new Map<string, { text: string; passages: Set<string> }>();
  const needs = new Map<string, { text: string; score: number }>();
  const personas = new Map<string, { buyer: string; goals: Set<string>; pains: Set<string>; passages: Set<string> }>();
  const segmentsFor = (text: string) => page.capture.segments
    .filter((segment) => clean(segment.text).includes(clean(text)))
    .slice(0, 3).map((segment) => segment.id);
  const add = (field: string, value: unknown, texts: string[] = [], ids: string[] = [], note: string | null = null, priority = 0) => {
    const segment_ids = [...new Set(texts.flatMap(segmentsFor))].slice(0, 30);
    if ((!segment_ids.length && !ids.length) || texts.some((text) => !segmentsFor(text).length)) return;
    const key = field + JSON.stringify(value);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ field: root + field, entity_key: null, value,
      origin: "source_backed", segment_ids, observation_ids: [...new Set(ids)].slice(0, 30),
      supporting_fields: [], note, priority });
  };
  const textItem = (field: string, text: string, context = text) => {
    if (field === "target_buyers") {
      const key = buyerIdentityKey(text);
      const buyer = buyers.get(key) ?? { text, passages: new Set<string>() };
      if (text.length > buyer.text.length) buyer.text = text;
      buyer.passages.add(context);
      buyers.set(key, buyer);
      return;
    }
    if (text && text.length <= 1000) add(field, [{ text }], [context]);
  };
  const raw = page.capture.observations;
  const sections = Array.isArray(raw.contentSections)
    ? (raw.contentSections as Section[]).slice(0, 80) : [];
  const prose = [...new Set(sections.length ? sections
    .filter((section) => !/\b(?:articles|latest news|testimonials|reviews|privacy|terms)\b/i.test(section.heading ?? ""))
    // Lists keep their declared section role (features, issues, audiences, etc.).
    // Only explicit customer-needs headings below classify a list as customer needs.
    .flatMap((section) => [section.heading ?? "", ...section.paragraphs])
    : page.capture.segments.map((segment) => segment.text))]
    .filter((text) => text.length >= 15 && text.length <= 8000);
  // Editorial articles, search results and legal notices do not declare the firm's target market.
  const marketing = !/\/(?:blog|articles?|news|learning-center|privacy(?:-policy)?|terms(?:-of-service)?)(?:\/|$)/i
    .test(new URL(page.capture.finalUrl).pathname);
  const splitList = (text: string) => text.replace(/[.;]$/, "").split(/\s*,\s*(?:and\s+)?|\s*;\s*/)
    .map((item) => item.trim()).filter((item) => item.length > 1 && item.length <= 160);

  if (marketing) {
    for (const section of sections) {
      const heading = section.heading ?? "";
      if (/^(?:(?:our|the)\s+)?(?:industries(?: we serve)?|industry (?:groupings|sectors)|sectors(?: we serve)?)\s*:?$/i.test(heading))
        for (const item of section.listItems) textItem("industry_groupings", item);
      if (/^(?:(?:our|ideal|target)\s+)?(?:customers|clients|buyers|audience)(?:\s+we\s+(?:serve|help))?\s*:?$|^who we (?:serve|help|work with)\s*:?$/i.test(heading))
        for (const item of section.listItems) {
          textItem("target_buyers", item);
        }
      if (/^(?:customer|client) (?:needs|goals|pain points)\s*:?$/i.test(heading))
        for (const item of [...section.paragraphs, ...section.listItems]) textItem("customer_needs", item);
      if (/^(?:our\s+)?(?:suppliers|partners|vendors)\s*:?$/i.test(heading))
        for (const name of section.listItems.filter((item) => item.length <= 160))
          add("suppliers_and_partners", [{ name, relationship_type: heading,
            relationship_text: null, url: null }], [heading, name]);
    }
    for (const paragraph of prose) {
      // A literal client-industry list is retained as published, without mapping to a taxonomy.
      const industries = /(?:worked|work|working) with (?:a (?:wide )?variety of )?(?:businesses|clients|companies|industries),?\s+including\s*:\s*([^.!?]+)/i.exec(paragraph);
      if (industries) for (const item of splitList(industries[1])) textItem("industry_groupings", item, industries[0]);
      const declaredBuyers = /^(?:target (?:buyers|customers)|our (?:clients|customers) include|we serve)\s*:?\s+([^.!?]+)/i.exec(paragraph);
      if (declaredBuyers) for (const item of splitList(declaredBuyers[1])) textItem("target_buyers", item, declaredBuyers[0]);
      const declaredPartners = /\bour (suppliers|partners|vendors) (?:include|are)\s+(.+?)(?:[.!?](?:\s|$)|$)/i.exec(paragraph);
      if (declaredPartners) for (const name of splitList(declaredPartners[2]))
        add("suppliers_and_partners", [{ name, relationship_type: declaredPartners[1],
          relationship_text: declaredPartners[0], url: null }], [declaredPartners[0]]);

      // Restrict buyer phrases to a first-party service declaration, not incidental staff counts or commentary.
      const buyerDeclaration = /\b(?:we (?:serve|help|work|offer|provide|cater|speciali[sz]e)|I (?:serve|help|work|offer|provide)|our (?:services|clients|customers)|whether you are|for [^.!?]{1,100}, I can provide|we (?:can |will )?(?:also )?(?:assist|help)|services (?:for|to))\b/i.test(paragraph);
      if (buyerDeclaration && !/\b(?:we (?:do not|don't)|not (?:for|intended for)|never serve)\b/i.test(paragraph))
        for (const match of paragraph.matchAll(buyerNoun)) {
          const buyer = match[0];
          const before = paragraph.slice(Math.max(0, match.index! - 100), match.index);
          if (!/\b(?:for|serve|help|assist|clients|customers|whether you are|as well as|or a|a growing)\b[^.!?]*$/i.test(before)) continue;
          if (/^business(?:es)?$/i.test(buyer) && !/\b(?:for(?: both)?|serve|and)\s*$/i.test(before)) continue;
          textItem("target_buyers", buyer, paragraph);
          // An audience label alone is not a persona. Require a concrete same-passage goal or pain point.
          const key = buyerIdentityKey(buyer);
          const attributes = sentences(paragraph).filter(needText);
          if (!attributes.length) continue;
          const persona = personas.get(key) ?? { buyer, goals: new Set<string>(), pains: new Set<string>(), passages: new Set<string>() };
          for (const text of attributes) {
            if (benefit.test(text)) persona.goals.add(text);
            if (problem.test(text) && !benefit.test(text)) persona.pains.add(text);
          }
          persona.passages.add(paragraph);
          personas.set(key, persona);
        }
      // Preserve an explicitly qualified customer lifecycle as written, including any stated client headcount.
      const lifecycle = buyerDeclaration && /\bfrom\s+([^.!?]*\bbusinesses\s+to\s+those nearing retirement[^.!?]*)/i.exec(paragraph);
      if (lifecycle) {
        const buyer = lifecycle[1].trim();
        personas.set(buyerIdentityKey(buyer), { buyer, goals: new Set(), pains: new Set(), passages: new Set([paragraph]) });
      }
      // Copy a complete source sentence, retaining the benefit/problem wording and its qualifications.
      for (const text of sentences(paragraph))
        if (customer.test(text) && needText(text)) needs.set(clean(text).toLowerCase(), {
          text, score: (problem.test(text) ? 2 : 0) + (/\b(?:preparing|managing|doing|your own|you need|you require)\b/i.test(text) ? 2 : 0),
        });
    }
  }
  for (const buyer of buyers.values()) add("target_buyers", [{ text: buyer.text }], [...buyer.passages]);
  // Representative exact problem/outcome passages; the full unabridged captures remain available as evidence.
  const rankedNeeds = [...needs.values()].sort((a, b) => b.score - a.score);
  const representativeNeeds = [...new Set([
    ...rankedNeeds.filter((need) => problem.test(need.text) && !benefit.test(need.text)).slice(0, 1),
    ...rankedNeeds.filter((need) => benefit.test(need.text)).slice(0, 2), ...rankedNeeds,
  ])].slice(0, 3);
  for (const need of representativeNeeds)
    textItem("customer_needs", need.text);
  for (const persona of personas.values())
    add("ideal_customer_personas", [{ name: null, role: null, organization_type: persona.buyer,
      goals: [...persona.goals].map((text) => ({ text })), pain_points: [...persona.pains].map((text) => ({ text })) }], [...persona.passages]);
  const labelEvidence = (label: string, url: string | null) => observations.filter((item) =>
    ["cta-label", "anchor-label"].includes(item.property ?? "") && item.value === label &&
    (!url || item.asset_url === url)).map((item) => item.id);
  const channels = new Map<string, { label: string; url: string; ids: Set<string>; texts: Set<string>; priority: number; note: string | null }>();
  const channel = (key: string, label: string, url: string, ids: string[], texts: string[] = [], priority = 80, note: string | null = null) => {
    const previous = channels.get(key);
    const item = previous ?? { label, url, ids: new Set<string>(), texts: new Set<string>(), priority, note };
    if (priority > item.priority) Object.assign(item, { label, priority, note });
    ids.forEach((id) => item.ids.add(id));
    texts.forEach((text) => item.texts.add(text));
    channels.set(key, item);
  };
  const conversion = (label: string, url: string | null, ids: string[], includeChannel = true) => {
    if (!actionable.test(label) || label.length > 500 || !ids.length) return;
    add("ctas", [{ label, url, purpose: null }], [], ids);
    if (url && includeChannel) channel(url, label, url, ids, [], /^(?:get started|submit|send)\b/i.test(label) ? 20 : 80);
  };
  for (const link of page.capture.links)
    conversion(link.label, link.url, labelEvidence(link.label, link.url));
  if (Array.isArray(raw.ctas))
    for (const item of raw.ctas as { label?: string; destination?: string | null }[]) {
      if (!item.label) continue;
      const label = item.label.split(/\n/)[0].trim();
      // A button may include a hidden loading label; retain only the actual first visible label.
      conversion(label, item.destination ?? null, labelEvidence(item.label, item.destination ?? null));
    }
  // Form fields are inputs, not conversion stages. Only the form's observed submit controls are CTAs.
  // A funnel remains unassessed until an explicit stage/transition extraction rule exists.
  if (Array.isArray(raw.forms))
    for (const form of raw.forms as { action?: string | null; submitLabels?: string[]; heading?: string | null; context?: string | null }[]) {
      const submitEvidence = (label: string) => observations.filter((item) =>
        item.property === "form-submit-label" && item.value === label &&
        (!form.action || item.asset_url === form.action)).map((item) => item.id);
      for (const originalLabel of form.submitLabels ?? [])
        conversion(originalLabel.split(/\n/)[0].trim(), form.action ?? null, submitEvidence(originalLabel), false);
      const context = form.context && segmentsFor(form.context).length ? form.context : null;
      const heading = form.heading && segmentsFor(form.heading).length ? form.heading : null;
      const ids = (form.submitLabels ?? []).flatMap(submitEvidence);
      if (!ids.length) continue;
      const notification = context && /\b(?:newsletter|subscribe|weekly articles|email updates)\b/i.test(context);
      const contact = /\b(?:contact|conversation|get in touch|reach out|inquir|fill out this form)\b/i.test([heading, context].join(" "));
      const contactLink = contact && page.capture.links.find((link) => /^contact(?: us)?$/i.test(link.label));
      if (contactLink) channel(contactLink.url, contactLink.label, contactLink.url, ids,
        [heading, context].filter((text): text is string => Boolean(text)));
      else if (notification || (heading && actionable.test(heading))) {
        const label = notification ? context! : heading!;
        const url = form.action ?? page.capture.finalUrl;
        channel(`${url}|${label}`, label, url, ids, [label], 90,
          form.action ? "Observed form entrypoint; submission was not performed." :
            "Observed form location; its submission destination was unavailable. Submission was not performed.");
      }
    }
  for (const item of channels.values())
    add("channels", [{ channel_type: null, label: item.label, url: item.url }], [...item.texts], [...item.ids], item.note, item.priority);
  return result;
}
