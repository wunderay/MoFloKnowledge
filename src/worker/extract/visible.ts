import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";
import { serviceTextCandidates } from "./services-text";
import { isPersonName, parseEmployeeCount } from "./text";
import { PRONOUN_GENDER_NOTE, pronounGender } from "../../contracts";

/** Explicit labels only: semantic categories are never guessed from prose. */
export function visibleCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
): FieldCandidate[] {
  const result: FieldCandidate[] = serviceTextCandidates(page, observations);
  const add = (field: string, value: unknown, segment_ids: string[],
    observation_ids: string[] = [], entity_key: string | null = null) => {
    result.push({ field, value, entity_key, origin: "source_backed",
      segment_ids, observation_ids, supporting_fields: [], note: null });
  };
  const labels: [RegExp, string, boolean][] = [
    [/^Industry\s*:\s*(.+)$/i, "/company_foundation/industry", false],
    [/^Business model\s*:\s*(.+)$/i, "/company_foundation/business_model", false],
    [/^Company pitch\s*:\s*(.+)$/i, "/positioning/company_pitch", false],
    [/^Target buyers\s*:\s*(.+)$/i, "/market_and_customers/target_buyers", true],
    [/^Service locations\s*:\s*(.+)$/i, "/company_foundation/service_locations", true],
  ];
  for (const segment of page.capture.segments) {
    // Anchoring each line prevents an unrelated paragraph containing a label from being reclassified.
    for (const line of segment.text.split("\n")) {
      for (const [pattern, field, collection] of labels) {
        const value = pattern.exec(line)?.[1]?.trim();
        if (value && value.length <= 4000) {
          add(field, collection ? [{ text: value }] : value, [segment.id]);
        }
      }
      const employee = /^Employee count\s*:\s*(.+)$/i.exec(line)?.[1]?.trim();
      if (employee && employee.length <= 4000) {
        add("/company_foundation/employee_count", parseEmployeeCount(employee), [segment.id]);
      }
      const founding = /^(?:Founded|Established)\s*(?::|in)?\s*(\d{4})(?:\b|$)/i.exec(line) ??
        /^Since\s+(\d{4})\.?$/i.exec(line);
      if (founding) {
        const year = Number(founding[1]);
        if (year >= 1000 && year <= new Date().getUTCFullYear()) {
          add("/company_foundation/year_founded", year, [segment.id]);
        }
      }
    }
  }
  // A homepage description is published overview metadata; inner-page descriptions often describe a single service.
  if (new URL(page.capture.finalUrl).pathname === "/") {
    const description = observations.find((o) => o.property === "meta-description");
    if (description?.value) {
      add("/company_foundation/overview", description.value, [], [description.id]);
    }
  }
  for (const address of observations.filter((o) => o.property === "address" && o.value)) {
    add("/company_foundation/main_address", {
      label: null, raw: address.value, line1: null, line2: null,
      city: null, region: null, postal_code: null, country: null,
    }, [], [address.id]);
  }
  // A named profile page must independently agree in its title and visible heading.
  // Copy only a role explicitly in that title, or a separate exact role heading.
  const profileTitle = page.capture.title &&
    /^(.+?)\s+[-—–|]\s+.+?\s+(Co-Founder|Founder|CEO|Chief Executive Officer|Owner|President|Director)$/i.exec(page.capture.title);
  const profileName = profileTitle?.[1].trim() ?? page.capture.title;
  const roleHeadings = observations.filter((o) => o.property === "heading" &&
    /^(?:Co-Founder|Founder|CEO|Chief Executive Officer|Owner|President|Director)$/i.test(o.value ?? ""));
  const roleHeading = roleHeadings.length === 1 ? roleHeadings[0] : undefined;
  const profileRole = profileTitle?.[2] ?? roleHeading?.value;
  const nameSlug = profileName ? encodeURIComponent(profileName.toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")) : null;
  const pageSlug = new URL(page.capture.finalUrl).pathname.replace(/\/$/, "").split("/").at(-1);
  if (profileName && isPersonName(profileName) && profileRole && (profileTitle || pageSlug?.toLowerCase() === nameSlug?.toLowerCase()) && /\/(?:team|people|staff|about-us|about)\/[^/]+\/?$/i.test(new URL(page.capture.finalUrl).pathname) &&
      !observations.some((o) => /\/@type(?:\/\d+)?$/.test(o.property ?? "") && /^(?:https?:\/\/schema\.org\/)?Person$/.test(o.value ?? ""))) {
    const name = profileName;
    const heading = observations.find((o) => o.property === "heading" &&
      (o.value === name || o.value?.startsWith(name + ",")));
    const source = page.capture.segments.find((s) => s.text.includes(name));
    const title = observations.find((o) => o.property === "page-title" && o.value === page.capture.title);
    if (heading && source && title && !name.includes("|") && (profileTitle || roleHeading?.id !== heading.id)) {
      const entity = `${page.capture.finalUrl}|${name}|${source.id}`;
      const cited = [title.id, heading.id, ...(!profileTitle && roleHeading ? [roleHeading.id] : [])];
      add("/key_people/@id/name", name, [source.id], cited, entity);
      add("/key_people/@id/title", profileRole, [source.id], cited, entity);
      const description = observations.find((o) => o.property === "meta-description" && o.value?.includes(name));
      if (description) {
        add("/key_people/@id/background_or_relevance", description.value,
        [source.id], [description.id], entity);
      }
    }
  }
  // Any other page whose first H1 is a person's name and which the site links to by that name is a profile.
  // The title is the short line right after the name (or a "Name, title of Company" metadata pattern);
  // the bio is the next paragraphs; gender is read only from third-person pronouns in that bio.
  const { pathname } = new URL(page.capture.finalUrl);
  const headings = page.capture.observations.headings;
  const firstH1 = Array.isArray(headings)
    ? (headings as { level: number; text: string }[]).find((h) => h.level === 1)?.text : undefined;
  const words = firstH1?.split(" ") ?? [];
  const link = firstH1 ? page.capture.links.find((item) => item.label === firstH1 &&
    item.url.replace(/[#?].*$/, "").replace(/\/$/, "") === page.capture.finalUrl.replace(/\/$/, "")) : undefined;
  const nameIndex = page.capture.segments.findIndex((s) => s.text === firstH1);
  const heading = observations.find((o) => o.property === "heading" && o.value === firstH1);
  if (!result.some((c) => c.field === "/key_people/@id/name") && firstH1 && link && heading && nameIndex >= 0 && pathname !== "/" && firstH1 !== page.capture.publisher &&
      words.length >= 2 && words.length <= 4 && isPersonName(firstH1) &&
      words.every((word) => /^(?:Mc|Mac|O['’])?\p{Lu}[\p{Ll}'’.-]*$/u.test(word) && !/^(?:Us|Our|Services|Team)$/.test(word)) &&
      !observations.some((o) => /\/@type(?:\/\d+)?$/.test(o.property ?? "") && /^(?:https?:\/\/schema\.org\/)?Person$/.test(o.value ?? ""))) {
    const name = firstH1;
    const after = page.capture.segments.slice(nameIndex + 1);
    const shortLine = (text: string) => text.split(" ").length <= 6 && !/[.!?]$/.test(text);
    const metadata = observations.filter((o) => o.property === "page-title" || o.property === "meta-description");
    const declared = metadata.map((o) => ({ o, text: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "\\s*(?:,|[-–—])\\s*(.+?)(?:\\s+(?:of|at)\\s|[.|]|$)").exec(o.value ?? "")?.[1]?.trim() }))
      .find((item) => item.text && shortLine(item.text));
    const adjacent = after[0] && shortLine(after[0].text) ? after[0] : undefined;
    const bio = after.slice(adjacent ? 1 : 0).filter((s) => s.text.length >= 40).slice(0, 3);
    const bioText = bio.map((s) => s.text).join("\n\n");
    // The bio sentences from the first one naming the person on; a lowercase use of the heading words in the
    // body ("our team", "contact us") means the heading is a topic, not a name.
    const sentences = bioText.split(/(?<=[.!?])\s+/);
    const named = sentences.findIndex((sentence) => sentence.includes(name));
    const fromName = named >= 0 ? sentences.slice(named).join(" ") : "";
    const asPhrase = page.capture.segments.some((s, i) => i !== nameIndex && s.text.toLowerCase().includes(name.toLowerCase()) &&
      s.text.split(name).join("").toLowerCase().includes(name.toLowerCase()));
    const gender = pronounGender(fromName);
    const declaredName = metadata.some((o) => new RegExp("^Meet\\s+" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(o.value ?? ""));
    // A "Name, title" / "Meet Name" statement is a signal on its own; otherwise the page must carry a team-group
    // label and either a pronoun in a sentence naming the person or a name-led bio under a short title line.
    const menuLabels = page.capture.observations.menuLabels;
    const teamGroup = [...(Array.isArray(menuLabels) ? menuLabels as string[] : []), ...page.capture.links.map((l) => l.label),
      ...page.capture.segments.map((s) => s.text)].some((label) => /^(?:our\s+)?(?:team|people|staff|leadership)$/i.test(label));
    const signal = Boolean(declared) || declaredName || (teamGroup &&
      (sentences.some((sentence) => sentence.includes(name) && pronounGender(sentence) !== null) ||
        Boolean(adjacent && sentences[0].startsWith(name))));
    if (bio.length && bioText.length <= 4000 && named >= 0 && !asPhrase && signal) {
      const entity = `${page.capture.finalUrl}|${name}|${page.capture.segments[nameIndex].id}`;
      const linkEvidence = observations.filter((o) =>
        (o.property === "href" && o.value === link.url) ||
        (o.property === "anchor-label" && o.value === link.label && o.asset_url === link.url));
      const evidenceIds = [heading.id, ...linkEvidence.map((o) => o.id)];
      add("/key_people/@id/name", name, [page.capture.segments[nameIndex].id], evidenceIds, entity);
      if (adjacent) {
        add("/key_people/@id/title", adjacent.text, [adjacent.id], [], entity);
      } else if (declared?.text) {
        add("/key_people/@id/title", declared.text, [], [declared.o.id], entity);
      }
      add("/key_people/@id/background_or_relevance", bioText, bio.map((s) => s.id), [], entity);
      if (gender) {
        const cited = bio.filter((s, i) => s.text.includes(name) || bio.slice(0, i).some((p) => p.text.includes(name)));
        result.push({ field: "/key_people/@id/gender", value: gender, entity_key: entity, origin: "source_backed",
          segment_ids: cited.map((s) => s.id), observation_ids: [], supporting_fields: [], note: PRONOUN_GENDER_NOTE });
      }
    }
  }
  return result;
}
