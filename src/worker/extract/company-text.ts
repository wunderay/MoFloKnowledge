import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";
import { structuredCandidates } from "./structured";
import { visibleCandidates } from "./visible";
import { exactSentences, selectExactSentences, isExplicitServiceProviderSentence } from "./source-excerpts";

export const COMPANY_TEXT_FIELDS: readonly string[] = [
  "/company_foundation/overview", "/company_foundation/industry",
  "/company_foundation/business_model", "/company_foundation/company_role",
  "/company_foundation/legal_entity_type", "/company_foundation/year_founded",
  "/company_foundation/alternative_company_names", "/company_foundation/service_locations",
  "/positioning/company_pitch", "/positioning/founding_story",
  "/key_people/@id/name", "/key_people/@id/title", "/key_people/@id/role",
  "/key_people/@id/background_or_relevance",
];

type Section = {
  heading: string | null;
  level: number;
  paragraphs: string[];
};
type RankedCandidate = FieldCandidate & { priority?: number };
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const excluded = /\b(?:articles?|news|blog|testimonials?|reviews?|privacy|terms|cookies?|accessibility)\b/i;
const companyRoute = /^\/(?:$|(?:services|products|offerings)\/?$|(?:about(?:-us)?|company|firm(?:-background)?|our-story|contact|team|people|staff)(?:\/|$))/i;
const legalSuffix = /\b(?:L\.?L\.?C\.?|L\.?L\.?P\.?|Ltd\.?|Limited|Inc\.?|Incorporated|Corporation|Corp\.?|P\.?L\.?L\.?C\.?)\b\.?/i;

/** Extract published passages. Rules select source text; they never rewrite a firm's claims. */
export function companyTextCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
): FieldCandidate[] {
  const result: RankedCandidate[] = [];
  const url = new URL(page.capture.finalUrl);
  if (!companyRoute.test(url.pathname)) return result;
  const capture = page.capture;
  const source = normalized(capture.segments.map((s) => s.text).join("\n"));
  const evidence = (text: string): string[] => {
    const needle = normalized(text), start = source.indexOf(needle);
    if (!needle || start < 0) return [];
    let offset = 0;
    return capture.segments.filter((segment) => {
      const length = normalized(segment.text).length;
      const overlaps = offset < start + needle.length && offset + length > start;
      offset += length + 1;
      return overlaps;
    }).map((s) => s.id);
  };
  const add = (field: string, value: unknown, passages: string[], priority = 70,
    entity_key: string | null = null, observed: TechnicalObservation[] = [], note: string | null = null) => {
    if (passages.some((text) => !evidence(text).length)) return;
    const segment_ids = [...new Set(passages.flatMap(evidence))];
    if (!segment_ids.length && !observed.length) return;
    if (result.some((c) => c.field === field && c.entity_key === entity_key &&
      JSON.stringify(c.value) === JSON.stringify(value))) return;
    result.push({ field, value, entity_key, priority, origin: "source_backed",
      segment_ids, observation_ids: observed.map((o) => o.id), supporting_fields: [], note });
  };
  const rawSections = capture.observations.contentSections;
  const sections: Section[] = Array.isArray(rawSections)
    ? rawSections.filter((item): item is Section => Boolean(item && typeof item === "object" &&
      Array.isArray(item.paragraphs) && item.paragraphs.every((p: unknown) => typeof p === "string")))
    : capture.segments.map((s) => ({ heading: s.heading ?? null, level: 2,
      paragraphs: s.text.split(/\n\n/).filter((p) => p.length >= 40) }));
  const primary = sections.filter((s) => !excluded.test(s.heading ?? ""));
  const paragraphs = primary.flatMap((section) => section.paragraphs.map((text) => ({
    text: text.trim(), section,
  }))).filter(({ text }) => text.length >= 20 && text.length <= 4000 && evidence(text).length);

  // Match declared organizations to this site before accepting any legal suffix or name.
  const orgNames: { text: string; observed: TechnicalObservation[] }[] = [];
  const organizationType = /^(?:https?:\/\/schema\.org\/)?(?:Organization|Corporation|LocalBusiness|ProfessionalService|AccountingService|LegalService|FinancialService|MedicalBusiness|Store|Restaurant|EducationalOrganization|NGO)$/;
  const organizationCount = new Set(observations.filter((o) =>
    /\/@type(?:\/\d+)?$/.test(o.property ?? "") && organizationType.test(o.value ?? ""))
    .map((o) => o.property!.replace(/\/@type(?:\/\d+)?$/, ""))).size;
  for (const o of observations.filter((item) => /^jsonld:.*\/name$/.test(item.property ?? ""))) {
    const prefix = o.property!.slice(0, -"/name".length);
    const atPath = (key: string) => observations.filter((item) => item.property === prefix + "/" + key ||
      (key === "@type" && item.property?.startsWith(prefix + "/@type/")));
    if (!atPath("@type").some((type) => organizationType.test(type.value ?? ""))) continue;
    const identity = [...atPath("url"), ...atPath("@id")].filter((item) => item.value);
    if (!identity.length && organizationCount !== 1) continue;
    if (identity.length && !identity.some((item) => {
      try { return new URL(item.value!, capture.finalUrl).hostname.replace(/^www\./, "") === url.hostname.replace(/^www\./, ""); }
      catch { return false; }
    })) continue;
    if (o.value) orgNames.push({ text: o.value, observed: [o, ...atPath("@type"), ...identity] });
  }
  // A title supplies a legal name only when its initial identity contains the suffix.
  // Prose mentioning a supplier or competitor cannot establish the site's legal identity.
  const titleObservation = observations.find((o) => o.property === "page-title");
  const titleIdentity = capture.title?.replace(/^(?:Contact|Welcome to|About)\s+/i, "");
  const suffix = titleIdentity && legalSuffix.exec(titleIdentity);
  if (!orgNames.length && suffix && titleObservation && suffix.index < 120 &&
    !/[.!?]/.test(titleIdentity!.slice(0, suffix.index))) {
    const name = titleIdentity!.slice(0, suffix.index + suffix[0].length).trim();
    if (!/\s[-–—|]\s/.test(name)) orgNames.push({ text: name, observed: [titleObservation] });
  }
  for (const identity of orgNames) {
    const legal = legalSuffix.exec(identity.text)?.[0];
    if (legal)
      add("/company_foundation/legal_entity_type", legal, [], 90, null, identity.observed);
  }
  const names = orgNames.map((o) => o.text);
  const companySubject = (text: string) => /^(?:we\b|our\s+(?:firm|company|business|team|practice)\b)/i.test(text) ||
    names.some((name) => text.toLowerCase().includes(name.toLowerCase()));
  const existing = [...structuredCandidates(page, observations), ...visibleCandidates(page, observations)];
  const people = existing.filter((c) => c.field === "/key_people/@id/name" && typeof c.value === "string");
  const profilePeople = people.filter((person) => primary.some((s) => s.heading &&
    (s.heading === person.value || s.heading.startsWith(String(person.value) + ","))));
  const person = profilePeople.length === 1 ? profilePeople[0] : undefined;
  const profile = Boolean(person && /\/(?:about(?:-us)?|team|people|staff)\/[^/]+\/?$/i.test(url.pathname));
  const currentPractice = profile && existing.some((c) => c.entity_key === person?.entity_key &&
    c.field === "/key_people/@id/title" && /\b(?:founder|owner)\b/i.test(String(c.value))) &&
    paragraphs.some(({ text }) => /\b(?:my|our) own\s+(?:[\p{L}-]+\s+){0,3}(?:practice|firm|company|business)\b/iu.test(text) &&
      !/\b(?:former|previous|prior|old|sold|closed|before joining)\b/i.test(text));
  const action = /\b(?:provid(?:e|es|ing)|offer(?:s|ing)?|specializ(?:e|es|ing)|help(?:s|ing)?|deliver(?:s|ing)?|design(?:s|ing)?|manufactur(?:e|es|ing)|build(?:s|ing)?|develop(?:s|ing)?|sell(?:s|ing)?|serv(?:e|es|ing)|support(?:s|ing)?|count on us for)\b/i;
  const business = paragraphs.filter(({ text, section }) =>
    action.test(text) && (companySubject(text) || /\b(?:about|welcome|firm background|who we are|what we do|what we offer|our company|our story|contact|get in touch)\b/i.test(section.heading ?? "") ||
      /\b(?:you can count on us|our (?:services|products)|we['’]re|we are)\b/i.test(text) ||
      (currentPractice && /\bI(?:['’]m| am)? (?:can |am able to |able to )?(?:provide|offer)\b/i.test(text))));
  const biography = /\b(?:founder|career|years (?:of|as)|my experience|AICPA|certified|degree)\b/i;
  const comparison = /^(?:many|other|some|larger) (?:companies|firms|providers)\b/i;
  const offeringScope = /\b(?:services|products|planning|software|consultancy|manufacturer|practice|inspections|surveys|engineering)\b/i;
  const providerAction = /\b(?:provid(?:e|es|ing)|offer(?:s|ing)?|specializ(?:e|es|ing)|design(?:s|ing)?|manufactur(?:e|es|ing)|build(?:s|ing)?|develop(?:s|ing)?|sell(?:s|ing)?|count on us for)\b/i;
  const instruction = /\b(?:fill out|contact us|call us|this form|contact us today)\b/i;
  const descriptions = business.flatMap(({ text: paragraph }) => {
    const paragraphCompany = companySubject(paragraph) || /^Welcome to\b/i.test(paragraph);
    const accept = (sentence: string) => {
      if (biography.test(sentence) || comparison.test(sentence) || instruction.test(sentence)) return false;
      const subject = companySubject(sentence) || /^(?:Welcome to|We['’]re|You can count on us)\b/i.test(sentence) ||
        (currentPractice && /\bI(?:['’]m| am)? (?:can |am able to |able to )?(?:provide|offer)\b/i.test(sentence));
      const continuation = (paragraphCompany || currentPractice) && /\b(?:services|support|payroll)\b/i.test(sentence) &&
        /\b(?:available|primarily|only|as you need|as needed|without|full-time|salary|benefits)\b/i.test(sentence);
      return (subject && (offeringScope.test(sentence) || providerAction.test(sentence))) || continuation;
    };
    const passages = selectExactSentences(paragraph, { accept, maxSentences: 4, maxCharacters: 1200 });
    if (!passages.length) return [];
    const operating = passages.filter((sentence) => providerAction.test(sentence) ||
      /\b(?:as you need|as needed|primarily|full-time|salary|benefits|overhead|lower rate)\b/i.test(sentence));
    const firmPage = /^\/(?:about(?:-us)?|company|firm(?:-background)?|our-story)\/?$/i.test(url.pathname);
    const priority = profile ? 83 : firmPage ? (passages.length > 1 ? 99 : 94) : operating.length ? 88 : 80;
    const text = normalized(paragraph).includes(normalized(passages.join(" ")))
      ? passages.join(" ") : passages.join("\n\n");
    return [{ text, passages, priority, operating }];
  });
  if (descriptions.length) {
    const best = Math.max(...descriptions.map((d) => d.priority));
    const passages = [...new Set(descriptions.filter((d) => d.priority === best).flatMap((d) => d.passages))];
    const overview = descriptions.filter((d) => d.priority === best).map((d) => d.text).join("\n\n");
    if (overview.length <= 4000)
      add("/company_foundation/overview", overview, passages, best);
    const operations = [...new Set(descriptions.flatMap((d) => d.operating))].slice(0, 3);
    if (operations.length && operations.join("\n\n").length <= 4000)
      add("/company_foundation/business_model", operations.join("\n\n"), operations, best);
  }
  // Catalog prose describes the company; link labels remain individual offering names.
  if (/^\/(?:services|products|offerings)\/?$/i.test(url.pathname)) {
    const intro = paragraphs.find(({ text, section }) => action.test(text) &&
      /\b(?:services|products|offerings|what we offer|our solutions)\b/i.test(section.heading ?? ""));
    if (intro) {
      const passages = selectExactSentences(intro.text, { maxSentences: 2 });
      add("/company_foundation/overview", passages.join("\n\n"), passages, 96);
    }
  }
  if (!profile) {
    for (const { text: paragraph } of paragraphs)
      for (const sentence of exactSentences(paragraph))
        if (isExplicitServiceProviderSentence(sentence, names))
          add("/company_foundation/company_role", [{ text: "Service provider" }], [sentence], 90, null, [],
            "Normalized company role from an explicit current-company service statement.");
  }
  for (const [index, { text }] of descriptions.entries()) {
    // An explicit description of what the firm is, not a guessed standardized label.
    const industry = /\b(?:we are|is|as)\s+(?:an?\s+)?(?:independent\s+)?([^.!?;]{3,90}?\b(?:firm|agency|consultancy|manufacturer|retailer|studio|practice|service provider))\b/i.exec(text)?.[1];
    if (industry && !/\b(?:you|your|our|other|another)\b/i.test(industry)) {
      add("/company_foundation/industry", industry, [text], (profile ? 65 : 80) - index);
      add("/company_foundation/company_role", [{ text: industry }], [text], 75);
    }
    // Keep a published service category verbatim, including its exact spelling.
    const category = /\b(?:specializ(?:e|es|ing) in|provid(?:e|es|ing)|offer(?:s|ing)?|comprehensive|reliable)\s+([^.!?;]{3,90}?\b(?:services|solutions|software|products))\b/i.exec(text)?.[1];
    if (category && !/\b(?:you|your|our|other|these|this|the best)\b/i.test(category))
      add("/company_foundation/industry", category, [text], (profile ? 60 : /^\/(?:about(?:-us)?|company|firm(?:-background)?)\/?$/i.test(url.pathname) ? 75 : 70) - index);
    const role = /\b(?:we are|is)\s+(?:an?\s+)?(service provider|manufacturer|retailer|wholesaler|distributor|consultancy)\b/i.exec(text)?.[1];
    if (role && !profile) add("/company_foundation/company_role", [{ text: role }], [text], 80);
  }

  // Published positioning comes from an introductory heading or an explicit promise.
  const introductory = primary.filter((s) => s.level === 1).slice(0, 3);
  if (introductory.length >= 2 && introductory[0].paragraphs.length === 0) {
    const heading = introductory.map((s) => s.heading).filter(Boolean).join("\n");
    if (heading.length <= 400 && /[!:]|\b(?:your|you|help|better|maximi|minimi)\b/i.test(heading))
      add("/positioning/company_pitch", heading, [heading], 95);
  }
  for (const section of primary.slice(0, 5)) {
    const heading = section.heading;
    if (heading && heading.length >= 25 && heading.length <= 400 &&
      section.level <= 2 && /[!:]|\b(?:your|you|help|better|together|confidence|simplify|maximi|minimi)\b/i.test(heading) &&
      !/\b(?:contact|conversation|schedule|appointment|touch|clients love|customers say|testimonials?|reviews?)\b/i.test(heading))
      add("/positioning/company_pitch", heading, [heading], 90);
  }
  for (const { text } of business.slice(0, 2))
    if (/\b(?:you can count on us|our mission|we help|committed to|our goal|we believe)\b/i.test(text))
      add("/positioning/company_pitch", text, [text], 78);

  if (!profile) {
    for (const [index, context] of paragraphs.entries()) {
      const named = /\b(?:our|the) (?:co-)?founder,?\s+([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){1,3})/u.exec(context.text);
      if (!named) continue;
      const name = named[1], firstName = name.split(" ")[0];
      const link = capture.links.find((item) => {
        try { return new URL(item.url).hostname === url.hostname &&
          /\/(?:about(?:-us)?|team|people|staff)\/[^/]+\/?$/i.test(new URL(item.url).pathname) &&
          item.label.toLowerCase().includes(name.toLowerCase()); } catch { return false; }
      });
      const credential = paragraphs[index + 1]?.text;
      if (!link || !credential) continue;
      const sentences = selectExactSentences(credential, { maxSentences: 2, accept: (sentence) =>
        new RegExp("^(?:" + escape(name) + "|" + escape(firstName) + ")\\s+(?:is|has|holds|earned)\\b", "i").test(sentence) &&
        /\b(?:CPA|member|certifi|degree|licen[cs]e|treasurer|president)\b/i.test(sentence) });
      const linkEvidence = observations.filter((o) =>
        (o.property === "href" && o.value === link.url) ||
        (o.property === "anchor-label" && o.value === link.label && o.asset_url === link.url));
      if (!sentences.length || linkEvidence.length < 2) continue;
      add("/key_people/@id/name", name, [context.text], 85, link.url, linkEvidence);
      add("/key_people/@id/background_or_relevance", sentences.join("\n\n"),
        [context.text, ...sentences], 90, link.url, linkEvidence, "Additional explicitly named founder background.");
    }
  }

  if (person && profile) {
    const identityEvidence = person.observation_ids.map((id) => observations.find((o) => o.id === id))
      .filter((o): o is TechnicalObservation => Boolean(o));
    const bio = paragraphs.filter(({ text }) =>
      /\b(?:my|I|experience|years|career|certified|qualifi|degree|graduat|worked|founded|established)\b/i.test(text));
    const detailed = bio.filter(({ text }) => /\b(?:my experience|\d+\s+years|certified|qualifi|degree|graduat)\b/i.test(text));
    const selected = (detailed.length ? detailed : bio.filter(({ text }) =>
      /\b(?:experience|years|career)\b/i.test(text))).slice(0, 3);
    if (selected.length) add("/key_people/@id/background_or_relevance",
      selected.map(({ text }) => text).join("\n\n"), selected.map(({ text }) => text), 92, person.entity_key, identityEvidence);
    for (const section of primary.slice(0, 5)) {
      const title = section.heading;
      if (title && title !== person.value && !title.startsWith(String(person.value) + ",") && title.length <= 150 &&
        /\b(?:CEO|CFO|CPA|CTO|COO|president|founder|owner|director|controller|partner|engineer|architect|attorney|principal)\b/i.test(title) &&
        !/[!?]/.test(title))
        add("/key_people/@id/title", title, [title], 90, person.entity_key, identityEvidence);
    }
    for (const title of existing.filter((c) => c.entity_key === person.entity_key && c.field === "/key_people/@id/title"))
      if (/^(?:co-founder|founder|owner|president|director)$/i.test(String(title.value)))
        add("/key_people/@id/role", title.value, [], 85, person.entity_key,
          title.observation_ids.map((id) => observations.find((o) => o.id === id)).filter((o): o is TechnicalObservation => Boolean(o)));
  }

  for (const { text, section } of paragraphs) {
    const firmContext = companySubject(text) || profile || /\b(?:our story|firm background|company history)\b/i.test(section.heading ?? "");
    if (!firmContext) continue;
    const alternate = /\b(?:also known as|trading as|d\/?b\/?a)\s+[“"]?([^.!?;“”"]{2,120})/i.exec(text)?.[1]?.trim();
    if (alternate && companySubject(text))
      add("/company_foundation/alternative_company_names", [{ text: alternate }], [text], 90);
    const ownPractice = /\bsince\s+(\d{4})\s*,?\s*(?:I (?:have|had)|my own|our own)\s+(?:[\p{L}-]+\s+){0,3}(?:practice|firm|company|business)\b/iu.exec(text);
    const namedSubject = names.length ? "(?:" + names.map(escape).join("|") + ")" : "(?!)";
    const established = new RegExp("(?:(?:" + namedSubject + "|(?:our|the) (?:firm|company|business|practice))\\s+(?:was |were )?(?:founded|established|started|launched|opened|began)|we were (?:founded|established))[^.!?]{0,45}?\\b(\\d{4})\\b", "i").exec(text);
    const startedOwn = /\b(?:I|we)\s+(?:founded|established|started|opened|began)\s+(?:my|our)\s+(?:own\s+)?(?:[\p{L}-]+\s+){0,3}(?:practice|firm|company|business)\b[^.!?]{0,45}?\b(\d{4})\b/iu.exec(text);
    const pastPractice = /\b(?:former|previous|old|prior)\s+(?:[\p{L}-]+\s+){0,2}(?:practice|firm|company|business)\b|\b(?:practice|firm|company|business)\b[^.!?]{0,35}\b(?:before joining|until \d{4}|closed|sold)\b/iu.test(text);
    const founding = pastPractice ? null : established;
    const practiceHistory = pastPractice ? null : ownPractice ?? startedOwn;
    if (founding) {
      const year = Number(founding[1]);
      if (year >= 1000 && year <= new Date().getUTCFullYear()) {
        add("/company_foundation/year_founded", year, [text], 90);
        add("/positioning/founding_story", text, [text], 88);
      }
    } else if (practiceHistory) {
      // A founder's practice history does not establish this company's founding date.
      add("/positioning/founding_story", text, [text], 88);
    } else if (/\b(?:our story|firm background|company history)\b/i.test(section.heading ?? "") &&
      /\b(?:we|our|I|my)\b/.test(text) && /\b(?:began|started|founded|established|because|mission)\b/i.test(text))
      add("/positioning/founding_story", text, [text], 80);
    const area = /\b(?:we|our (?:firm|company|practice|team))\s+(?:serve|serves|operate(?:s)? in|work(?:s)? (?:across|throughout))\s+([^.!?;]{3,120})/i.exec(text)?.[1];
    if (area && !/\b(?:businesses|clients|customers|individuals|people|companies|needs)\b/i.test(area))
      add("/company_foundation/service_locations", [{ text: area }], [text], 80);
    // The geographic scope of an explicitly current own practice is also an explicit service area.
    if (ownPractice) {
      const area = /\bmy own\s+(?:[\p{L}-]+\s+){0,3}practice in\s+([^.!?;]{3,100})/iu.exec(text)?.[1];
      if (area) add("/company_foundation/service_locations", [{ text: area }], [text], 85);
    }
  }
  return result;
}
