import type {
  Source,
  Origin,
  Claim,
  CoverageAssessment,
} from "../contracts/provenance";
export interface APACitation {
  citation: string;
  reference: string;
  retrievedAt: string;
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function suffix(index: number): string {
  let result = "";
  do {
    result = String.fromCharCode(97 + (index % 26)) + result;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return result;
}
function author(source: Source): string {
  return source.author ?? source.title ?? "Untitled page";
}
function year(source: Source): string {
  return source.published_on?.slice(0, 4) ?? "n.d.";
}
function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date.length === 10 ? `${date}T00:00:00Z` : date));
}
export function formatAPACitations(
  sources: Source[],
  options: { changeableSourceIds?: Iterable<string> } = {},
): Map<string, APACitation> {
  const groups = new Map<string, Source[]>();
  for (const source of sources) {
    const key = `${author(source)}\u0000${year(source)}`;
    const group = groups.get(key) ?? [];
    group.push(source);
    groups.set(key, group);
  }
  const changing = new Set(options.changeableSourceIds ?? []);
  const result = new Map<string, APACitation>();
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        compare(a.url, b.url) ||
        compare(a.title ?? "", b.title ?? "") ||
        compare(a.id, b.id),
    );
    group.forEach((source, index) => {
      const label = author(source),
        base = year(source),
        letter = group.length > 1 ? suffix(index) : "",
        yearLabel = letter
          ? base === "n.d."
            ? `${base}-${letter}`
            : `${base}${letter}`
          : base;
      const fullDate = source.published_on
        ? `${year(source)}${letter}, ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(`${source.published_on}T00:00:00Z`))}`
        : yearLabel;
      const site =
        source.site_name && source.site_name !== label
          ? `${source.site_name}. `
          : "";
      const title = source.author ? `${source.title ?? "Untitled page"}. ` : "";
      const retrieval = changing.has(source.id)
        ? `Retrieved ${longDate(source.retrieved_at)}, from `
        : "";
      result.set(source.id, {
        citation: `(${label}, ${yearLabel})`,
        reference: `${label}. (${fullDate}). ${title}${site}${retrieval}${source.url}`,
        retrievedAt: source.retrieved_at,
      });
    });
  }
  return result;
}
export function originLabel(
  origin: Origin | undefined,
  approved = false,
): string {
  switch (origin) {
    case "generated":
      return `Generated suggestion${approved ? " — approved" : ""}`;
    case "inferred":
      return "Labeled inference";
    case "user_provided":
      return "User-provided correction";
    case "source_backed":
      return "Website source";
    default:
      return "Unknown";
  }
}
export function attributionDetails(
  claim: Claim | undefined,
  coverage?: CoverageAssessment,
  approved = false,
): {
  label: string;
  note: string;
  actorId: string | null;
  authoredAt: string | null;
  evidenceIds: string[];
} {
  if (!claim) {
    return {
      label: "Unknown",
      note:
        coverage?.reason ?? "No value established within the checked material.",
      actorId: null,
      authoredAt: null,
      evidenceIds: [],
    };
  }
  return {
    label: originLabel(claim.origin, approved),
    note:
      claim.origin === "generated"
        ? "Proposed wording is not a source quote. Supporting facts are cited."
        : claim.origin === "inferred"
          ? "Interpretation grounded in the cited evidence."
          : (claim.note ?? ""),
    actorId: claim.actor_id,
    authoredAt: claim.authored_at,
    evidenceIds: claim.origin === "user_provided" ? [] : claim.evidence_ids,
  };
}
