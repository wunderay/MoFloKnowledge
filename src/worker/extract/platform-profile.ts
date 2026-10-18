import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";
import { nameKey } from "./text";

/** A company whose start URL has a path prefix is a profile on a shared platform (host/<handle>). */
export interface ProfileScope { host: string; prefix: string }
interface Section { heading: string | null; paragraphs: string[] }

const hostKey = (host: string) => host.replace(/^www\./, "").toLowerCase();

/** The start URL's host and path prefix; null for a site root, where nothing here applies. */
export function profileScope(startUrl: string | undefined): ProfileScope | null {
  if (!startUrl) {
    return null;
  }
  try {
    const url = new URL(startUrl);
    const prefix = url.pathname.replace(/\/+$/, "");
    return prefix ? { host: hostKey(url.hostname), prefix } : null;
  } catch {
    return null;
  }
}

/** True when the link stays on the start host and at or below the start path. */
export function inProfileScope(scope: ProfileScope, url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostKey(hostname) === scope.host && (pathname === scope.prefix || pathname.startsWith(scope.prefix + "/"));
  } catch {
    return false;
  }
}

const card = /^(\S+) \1 (?:Public|Private)$/;
const usable = (text: string) => text.length > 0 && text.length <= 4000;

interface Context {
  page: StoredCapture;
  observations: TechnicalObservation[];
  scope: ProfileScope;
  sections: Section[];
  result: FieldCandidate[];
  add: (field: string, value: unknown, entity: string | null, segmentIds: string[], observationIds: string[], priority?: number) => void;
  segmentsWith: (text: string) => string[];
  observed: (property: string, value: string, assetUrl?: string) => string[];
}

/** The handle (last path segment) is an alternate name only when it differs from the display name. */
function handleName({ page, observations, scope, add, segmentsWith, observed }: Context) {
  const handle = scope.prefix.split("/").at(-1)?.toLowerCase() ?? "";
  const heading = observations.find((o) => o.property === "heading" && o.value?.split(/\n+/).length === 2 &&
    o.value.split(/\n+/)[1].toLowerCase() === handle);
  const title = page.capture.title ? /^(\S+) \((.+)\) [·|\-–—] \S/.exec(page.capture.title) : null;
  const lines = heading?.value?.split(/\n+/);
  const named = heading && lines
    ? { name: lines[0], handle: lines[1], ids: [heading.id], text: heading.value ?? "" }
    : title?.[1].toLowerCase() === handle
      ? { name: title[2], handle: title[1], ids: observed("page-title", page.capture.title ?? ""), text: "" }
      : null;
  if (named && nameKey(named.handle) !== nameKey(named.name)) {
    add("/company_foundation/alternative_company_names", [{ text: named.handle }], null,
      named.text ? segmentsWith(named.text) : [], named.ids);
  }
}

/** Pinned repository cards: "<repo> <repo> Public", then an optional description and the language. */
function pinnedRepositories({ page, scope, sections, add, segmentsWith, observed }: Context) {
  for (const paragraph of sections.flatMap((section) => section.paragraphs)) {
    const lines = paragraph.split(/\n{2,}/).map((line) => line.trim());
    lines.forEach((line, index) => {
      const name = card.exec(line)?.[1];
      const link = name ? page.capture.links.find((l) => l.label === name && /^\/[^/]+\/[^/]+$/.test(new URL(l.url).pathname) &&
        hostKey(new URL(l.url).hostname) === scope.host) : undefined;
      if (!name || !link) {
        return;
      }
      const rest = lines.slice(index + 1);
      const end = rest.findIndex((next) => card.test(next));
      const following = (end < 0 ? rest : rest.slice(0, end)).filter((next) => !/^\d+$/.test(next));
      const linkIds = [...observed("href", link.url), ...observed("anchor-label", name, link.url)];
      add("/offerings/@id/name", name, link.url, segmentsWith(line), linkIds, 90);
      add("/offerings/@id/url", link.url, link.url, [], linkIds, 90);
      // Two lines mean description then language; a single line is the language alone.
      if (following.length === 2 && usable(following[0])) {
        add("/offerings/@id/description", following[0], link.url, segmentsWith(following[0]), linkIds, 90);
      }
    });
  }
}

/** A repository page: its About text, else the first paragraph under a README heading, describes the offering. */
function repositoryPage({ page, sections, add, segmentsWith, observed }: Context, slug: string) {
  const section = sections.find((s) => s.heading && /^About$/i.test(s.heading) && s.paragraphs[0] && !/^No description/i.test(s.paragraphs[0])) ??
    sections.find((s) => s.heading && /^README(?:\.md)?$/i.test(s.heading) && s.paragraphs[0]) ??
    // A README whose first heading is just the repository name.
    sections.find((s) => s.heading && nameKey(s.heading) === nameKey(slug) && s.paragraphs[0]);
  const description = section?.paragraphs[0].trim();
  // A link from the page to itself, with its label, is what identifies the page as that offering.
  const self = page.capture.links.find((l) => l.url === page.capture.finalUrl && l.label.trim());
  if (!description || !usable(description) || !self) {
    return;
  }
  const entity = page.capture.finalUrl;
  const ids = [...observed("href", entity), ...observed("anchor-label", self.label, entity)];
  add("/offerings/@id/description", description, entity, segmentsWith(description), ids, 95);
  add("/offerings/@id/url", entity, entity, [], ids, 90);
  if (self.label === slug) {
    add("/offerings/@id/name", slug, entity, [], ids, 90);
  }
}

/** Handle, pinned repositories, repository descriptions and the meta description of a profile page. */
export function platformProfileCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
  scope: ProfileScope,
): FieldCandidate[] {
  const result: FieldCandidate[] = [];
  const path = new URL(page.capture.finalUrl).pathname.replace(/\/+$/, "");
  const rawSections = page.capture.observations.contentSections;
  const segmentsWith = (text: string) => page.capture.segments.filter((s) => s.text.includes(text)).map((s) => s.id).slice(0, 30);
  const context: Context = {
    page, observations, scope, result, segmentsWith,
    sections: Array.isArray(rawSections) ? rawSections.slice(0, 80) as Section[] : [],
    add: (field, value, entity, segmentIds, observationIds, priority) => {
      if (segmentIds.length || observationIds.length) {
        result.push({ field, value, entity_key: entity, origin: "source_backed", segment_ids: segmentIds,
          observation_ids: [...new Set(observationIds)].slice(0, 30), supporting_fields: [], note: null,
          ...(priority === undefined ? {} : { priority }) });
      }
    },
    observed: (property, value, assetUrl) => observations.filter((o) =>
      o.property === property && o.value === value && (assetUrl === undefined || o.asset_url === assetUrl)).map((o) => o.id),
  };
  if (path === scope.prefix) {
    handleName(context);
    pinnedRepositories(context);
    const meta = observations.find((o) => o.property === "meta-description" && o.value);
    if (meta) {
      context.add("/company_foundation/overview", meta.value, null, [], [meta.id]);
    }
  } else if (path.startsWith(scope.prefix + "/") && path.split("/").length === scope.prefix.split("/").length + 1) {
    repositoryPage(context, path.split("/").at(-1) ?? "");
  }
  return result;
}
