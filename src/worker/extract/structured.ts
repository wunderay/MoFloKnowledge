import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";

type ObjectValue = Record<string, unknown>;
type Node = { value: ObjectValue; path: string };
const object = (value: unknown): ObjectValue | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() && value.length <= 4000
    ? value.trim()
    : null;
const organizationTypes = new Set([
  "Organization", "Corporation", "LocalBusiness", "ProfessionalService",
  "AccountingService", "LegalService", "FinancialService", "MedicalBusiness",
  "Store", "Restaurant", "EducationalOrganization", "NGO",
]);
const types = (value: ObjectValue): string[] =>
  (Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/^https?:\/\/schema\.org\//, ""));

/** Only schema.org declarations with exact captured leaf observations are mapped. */
export function structuredCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
): FieldCandidate[] {
  const result: FieldCandidate[] = [];
  const nodes: Node[] = [];
  const visit = (value: unknown, path: string, depth = 0) => {
    if (depth > 8 || nodes.length >= 100) return;
    if (Array.isArray(value))
      value.slice(0, 30).forEach((v, i) => visit(v, path + "/" + i, depth + 1));
    else {
      const record = object(value);
      if (!record) return;
      nodes.push({ value: record, path });
      Object.entries(record).slice(0, 50).forEach(([key, v]) =>
        visit(v, path + "/" + key, depth + 1),
      );
    }
  };
  const jsonLd = page.capture.observations.jsonLd;
  if (Array.isArray(jsonLd))
    jsonLd.forEach((value, index) => visit(value, String(index)));
  const leaf = (path: string) =>
    observations.find((o) => o.property === "jsonld:" + path);
  const evidence = (path: string): TechnicalObservation[] =>
    observations.filter((o) =>
      o.property === "jsonld:" + path ||
      o.property?.startsWith("jsonld:" + path + "/"),
    );
  const add = (
    field: string, value: unknown, cited: TechnicalObservation[],
    entity_key: string | null = null,
  ) => {
    if (!cited.length || cited.length > 30) return;
    result.push({ field, value, entity_key, origin: "source_backed",
      segment_ids: [], observation_ids: [...new Set(cited.map((o) => o.id))],
      supporting_fields: [], note: null });
  };
  const addText = (
    field: string, value: unknown, path: string,
    entity: string | null = null, context: TechnicalObservation[] = [],
  ) => {
    const string = text(value), observed = leaf(path);
    if (string && observed?.value?.trim() === string)
      add(field, string, [...context, observed], entity);
  };
  const sameSite = (raw: unknown) => {
    if (typeof raw !== "string") return false;
    try {
      const host = new URL(raw, page.capture.finalUrl).hostname.replace(/^www\./, "");
      return host === new URL(page.capture.finalUrl).hostname.replace(/^www\./, "");
    } catch { return false; }
  };
  const organizations = nodes.filter(({ value }) =>
    types(value).some((type) => organizationTypes.has(type)) &&
    (value.url ? sameSite(value.url) :
      value["@id"] ? sameSite(value["@id"]) : true),
  );
  // Unrelated multiple organizations without a site identity are ambiguous.
  const selected = organizations.filter(({ value }) =>
    value.url || value["@id"] || organizations.length === 1,
  );
  for (const { value, path } of selected) {
    addText("/company_foundation/overview", value.description, path + "/description");
    const alternate = Array.isArray(value.alternateName) ? value.alternateName : [value.alternateName];
    alternate.forEach((name, index) => {
      const property = path + "/alternateName" + (Array.isArray(value.alternateName) ? "/" + index : "");
      const observed = leaf(property), string = text(name);
      if (string && observed?.value === string)
        add("/company_foundation/alternative_company_names", [{ text: string }], [observed]);
    });
    const addresses = Array.isArray(value.address) ? value.address : [value.address];
    addresses.forEach((rawAddress, index) => {
    const addressPath = path + "/address" + (Array.isArray(value.address) ? "/" + index : "");
    const address = object(rawAddress);
    if (address) {
      const mapped: Record<string, string | null> = {
        label: null, raw: null, line1: null, line2: null, city: null,
        region: null, postal_code: null, country: null,
      };
      const cited: TechnicalObservation[] = [];
      for (const [source, target] of Object.entries({ streetAddress: "line1",
        addressLocality: "city", addressRegion: "region", postalCode: "postal_code",
        addressCountry: "country" })) {
        const string = text(address[source]);
        const observed = leaf(addressPath + "/" + source);
        if (string && observed?.value === string) {
          mapped[target] = string;
          cited.push(observed);
        }
      }
      if (cited.length) add("/company_foundation/main_address", mapped, cited);
    } else if (text(rawAddress)) {
      const observed = leaf(addressPath);
      if (observed) add("/company_foundation/main_address", {
        label: null, raw: text(rawAddress), line1: null, line2: null,
        city: null, region: null, postal_code: null, country: null,
      }, [observed]);
    }
    });
    const areas = Array.isArray(value.areaServed) ? value.areaServed : [value.areaServed];
    areas.forEach((area, index) => {
      const prefix = path + "/areaServed" + (Array.isArray(value.areaServed) ? "/" + index : "");
      const name = text(area) ?? text(object(area)?.name);
      const observed = leaf(prefix + (typeof area === "string" ? "" : "/name"));
      if (name && observed?.value === name)
        add("/company_foundation/service_locations", [{ text: name }], [observed]);
    });
  }
  const organizationIds = new Set(selected.map(({ value }) => value["@id"]).filter(Boolean));
  const belongs = (value: unknown) => {
    const org = object(value);
    return org && (organizationIds.has(org["@id"]) || sameSite(org.url));
  };
  for (const node of nodes) {
    const { value, path } = node;
    const kind = types(value);
    const person = kind.includes("Person");
    const offering = kind.includes("Service") || kind.includes("Product");
    if (!person && !offering) continue;
    const name = text(value.name);
    if (!name) continue;
    const context = [leaf(path + "/name"), ...evidence(path + "/@type")]
      .filter((o): o is TechnicalObservation => Boolean(o));
    if (context.length < 2) continue;
    if (person) {
      const nested = selected.some((org) =>
        ["founder", "employee", "member"].some((relation) =>
          path.startsWith(org.path + "/" + relation + "/") || path === org.path + "/" + relation,
        ),
      );
      const referred = selected.some(({ value: org }) =>
        ["founder", "employee", "member"].some((relation) =>
          (Array.isArray(org[relation]) ? org[relation] : [org[relation]])
            .some((v) => object(v)?.["@id"] && object(v)?.["@id"] === value["@id"]),
        ),
      );
      const headingMatch = observations.some((o) => o.property === "heading" && o.value === name);
      if (!nested && !referred && !belongs(value.worksFor) && !headingMatch) continue;
    } else if ((value.provider && !belongs(value.provider)) ||
      (value.url && !sameSite(value.url)) || (value["@id"] && !sameSite(value["@id"]))) continue;
    const entity = page.capture.links.find((link) =>
      link.url !== page.capture.finalUrl &&
      (link.url === value.url || link.url === value["@id"]) &&
      sameSite(link.url),
    )?.url ?? `${page.capture.finalUrl}|jsonld:${path}`;
    const prefix = person ? "/key_people/@id/" : "/offerings/@id/";
    addText(prefix + "name", value.name, path + "/name", entity, context);
    addText(prefix + (person ? "background_or_relevance" : "description"),
      value.description, path + "/description", entity, context);
    if (person) addText(prefix + "title", value.jobTitle, path + "/jobTitle", entity, context);
    else {
      addText(prefix + "category", value.category, path + "/category", entity, context);
      if (value.url === page.capture.finalUrl || page.capture.links.some((l) => l.url === value.url))
        addText(prefix + "url", value.url, path + "/url", entity, context);
      const offers = Array.isArray(value.offers) ? value.offers : [value.offers];
      offers.forEach((rawOffer, i) => {
        const offer = object(rawOffer);
        if (!offer) return;
        const offerPath = path + "/offers" + (Array.isArray(value.offers) ? "/" + i : "");
        const price = offer.price;
        const raw = typeof price === "number" || typeof price === "string" ? String(price) : "";
        const priceObservation = leaf(offerPath + "/price");
        // A numeric zero is preserved as an explicit paid amount, never rewritten as free.
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw) || !priceObservation) return;
        const currency = text(offer.priceCurrency);
        const currencyObservation = leaf(offerPath + "/priceCurrency");
        const currencyIsExplicit = currency && /^[A-Z]{3}$/.test(currency) && currencyObservation?.value === currency;
        add(prefix + "pricing", {
          kind: "paid", raw, amount: raw, min_amount: null, max_amount: null,
          currency: currencyIsExplicit ? currency : null, billing_interval: null,
          pricing_model: null, qualifications: [], as_of: null,
        }, [...context, priceObservation, ...(currencyIsExplicit ? [currencyObservation] : [])], entity);
      });
    }
  }
  return result;
}
