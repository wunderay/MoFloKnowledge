import type { StoredCapture } from "../crawl/run-crawl";
import type { FieldCandidate, TechnicalObservation } from "./types";
import { isPersonName, nameKey as normalizedName, parseEmployeeCount } from "./text";
import { serviceEntityKey } from "./services-text";
import { bareTenDigitPhone, stripTrackingParams } from "./identity";
import { structuredData } from "./structured-data";
import { legalSuffix } from "./company-text";

export const nameKey = (name: string) =>
  name.replace(new RegExp(legalSuffix.source, "gi"), "").replace(/\bco\.?(?=\s*$)/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");

type ObjectValue = Record<string, unknown>;
interface Node { value: ObjectValue; path: string }
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
    if (depth > 8 || nodes.length >= 100) {
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 30).forEach((v, i) => { visit(v, path + "/" + i, depth + 1); });
    } else {
      const record = object(value);
      if (!record) {
        return;
      }
      nodes.push({ value: record, path });
      Object.entries(record).slice(0, 50).forEach(([key, v]) =>
        { visit(v, path + "/" + key, depth + 1); },
      );
    }
  };
  structuredData(page.capture.observations).forEach((value, index) => { visit(value, String(index)); });
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
    if (!cited.length || cited.length > 30) {
      return;
    }
    result.push({ field, value, entity_key, origin: "source_backed",
      segment_ids: field.startsWith("/offerings/") ? page.capture.segments.filter((segment) =>
        cited.some((o) => o.property === "heading" && o.value && segment.text.includes(o.value))).map((segment) => segment.id).slice(0, 30) : [],
      observation_ids: [...new Set(cited.map((o) => o.id))],
      supporting_fields: [], note: null,
      ...(field.startsWith("/offerings/") ? { priority: field.endsWith("/description") ? 70 : 90 } : {}),
    });
  };
  const addText = (
    field: string, value: unknown, path: string,
    entity: string | null = null, context: TechnicalObservation[] = [],
  ) => {
    const string = text(value), observed = leaf(path);
    if (string && observed?.value?.trim() === string) {
      add(field, string, [...context, observed], entity);
    }
  };
  const sameSite = (raw: unknown) => {
    if (typeof raw !== "string") {
      return false;
    }
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
      if (string && observed?.value === string) {
        add("/company_foundation/alternative_company_names", [{ text: string }], [observed]);
      }
    });
    // The declared business name and legal name are verbatim alternative names.
    // A name that is only the site's own host label (optionally with a legal suffix) adds nothing.
    const hostLabel = nameKey(new URL(page.capture.finalUrl).hostname.replace(/^www\./, "").split(".")[0]);
    for (const key of ["name", "legalName"]) {
      const string = text(value[key]), observed = leaf(path + "/" + key);
      if (string && observed?.value === string && nameKey(string) !== hostLabel) {
        add("/company_foundation/alternative_company_names", [{ text: string }], [observed]);
      }
    }
    // Declared facts are mapped only when the exact value was captured as a leaf observation.
    const scalar = (raw: unknown) => (typeof raw === "number" ? String(raw) : text(raw));
    const founded = scalar(value.foundingDate), foundedLeaf = leaf(path + "/foundingDate");
    const foundedYear = founded ? /^(\d{4})(?:-|$)/.exec(founded) : null;
    if (foundedYear && foundedLeaf?.value === founded && Number(foundedYear[1]) >= 1000 &&
      Number(foundedYear[1]) <= new Date().getUTCFullYear()) {
      add("/company_foundation/year_founded", Number(foundedYear[1]), [foundedLeaf]);
    }
    const staff = object(value.numberOfEmployees), staffPath = path + "/numberOfEmployees" + (staff ? "/value" : "");
    const staffRaw = scalar(staff ? staff.value : value.numberOfEmployees), staffLeaf = leaf(staffPath);
    const employeeCount = staffRaw ? parseEmployeeCount(staffRaw) : null;
    if (employeeCount && (employeeCount.exact !== null || employeeCount.min !== null) && staffLeaf?.value === staffRaw) {
      add("/company_foundation/employee_count", employeeCount, [staffLeaf]);
    }
    addText("/positioning/company_pitch", value.slogan, path + "/slogan");
    const listed = (raw: unknown): { item: unknown; at: string }[] => (Array.isArray(raw) ? raw as unknown[] : [raw]).map((item, i) =>
      ({ item, at: Array.isArray(raw) ? "/" + i : "" }));
    for (const { item, at } of listed(value.knowsAbout)) {
      const topic = text(item), observed = leaf(path + "/knowsAbout" + at);
      if (topic && observed?.value === topic) {
        add("/market_and_customers/industry_groupings", [{ text: topic }], [observed]);
      }
    }
    for (const { item, at } of listed(value.sameAs)) {
      const url = text(item), observed = leaf(path + "/sameAs" + at);
      const link = url && observed?.value === url && stripTrackingParams(url) === url && URL.canParse(url) ? new URL(url) : null;
      const platform = link ? /^(?:www\.)?(linkedin|facebook|instagram|youtube|twitter|x|tiktok)\.com$/.exec(link.hostname)?.[1] : null;
      if (url && observed && link && platform && link.pathname !== "/" && !/\/(?:share|intent|sharer|dialog)(?:\/|$)/i.test(link.pathname) &&
        (platform !== "linkedin" || /^\/(?:company|school|showcase)\/[^/]+/i.test(link.pathname))) {
        add("/online_presence/social_media_links", [{ platform, profile_url: url }], [observed]);
      }
    }
    const email = text(value.email), emailLeaf = leaf(path + "/email");
    if (email && emailLeaf?.value === email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      add("/market_and_customers/channels", [{ channel_type: "Email", label: email, url: null }], [emailLeaf]);
    }
    const telephone = text(value.telephone), phoneObserved = leaf(path + "/telephone");
    const phone = telephone ? bareTenDigitPhone(telephone) : null;
    if (phone && phoneObserved?.value === telephone) {
      add("/online_presence/phone", phone, [phoneObserved]);
    }
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
      if (cited.length) {
        add("/company_foundation/main_address", mapped, cited);
      }
    } else if (text(rawAddress)) {
      const observed = leaf(addressPath);
      if (observed) {
        add("/company_foundation/main_address", {
        label: null, raw: text(rawAddress), line1: null, line2: null,
        city: null, region: null, postal_code: null, country: null,
      }, [observed]);
      }
    }
    });
    const areas = Array.isArray(value.areaServed) ? value.areaServed : [value.areaServed];
    areas.forEach((area, index) => {
      const prefix = path + "/areaServed" + (Array.isArray(value.areaServed) ? "/" + index : "");
      const name = text(area) ?? text(object(area)?.name);
      const observed = leaf(prefix + (typeof area === "string" ? "" : "/name"));
      if (name && observed?.value === name) {
        add("/company_foundation/service_locations", [{ text: name }], [observed]);
      }
    });
  }
  const organizationIds = new Set(selected.map(({ value }) => value["@id"]).filter(Boolean));
  const belongs = (value: unknown) => {
    const org = object(value);
    return org && (organizationIds.has(org["@id"]) || sameSite(org.url));
  };
  const services = nodes.filter(({ value }) => types(value).includes("Service"));
  for (const node of nodes) {
    const { value, path } = node;
    const kind = types(value);
    const person = kind.includes("Person");
    const offering = kind.includes("Service") || kind.includes("Product");
    if (!person && !offering) {
      continue;
    }
    const name = text(value.name);
    if (!name || (person && !isPersonName(name))) {
      continue;
    }
    const context = [leaf(path + "/name"), ...evidence(path + "/@type")]
      .filter((o): o is TechnicalObservation => Boolean(o));
    if (context.length < 2) {
      continue;
    }
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
      const headingMatch = observations.some((o) => o.property === "heading" &&
        (o.value === name || o.value?.split(/\n+/)[0] === name));
      if (!nested && !referred && !belongs(value.worksFor) && !headingMatch) {
        continue;
      }
    } else if ((value.provider && !belongs(value.provider)) ||
      (value.url && !sameSite(value.url)) || (value["@id"] && !sameSite(value["@id"]))) {
      continue;
    }
    // A single Service can identify the current detail page even when its metadata URL is stale.
    // Require an observed self-link whose exact label is also a heading, and that whole heading
    // appears in the declared service name. Catalog entries and products keep their own identities.
    const primaryLink = offering && kind.includes("Service") && services.length === 1
      ? page.capture.links.find((link) => link.url === page.capture.finalUrl &&
        link.label.length >= 3 && observations.some((o) =>
          o.property === "heading" && o.value === link.label) &&
        (" " + normalizedName(name) + " ").includes(" " + normalizedName(link.label) + " "))
      : undefined;
    const primaryEvidence = primaryLink ? [
      observations.find((o) => o.property === "href" && o.value === primaryLink.url),
      observations.find((o) => o.property === "anchor-label" && o.value === primaryLink.label && o.asset_url === primaryLink.url),
      observations.find((o) => o.property === "heading" && o.value === primaryLink.label),
    ].filter((o): o is TechnicalObservation => Boolean(o)) : [];
    const primaryHeading = offering && kind.includes("Service") && services.length === 1 &&
      /\/(?:services|products|offerings)\/[^/]+\/?$/i.test(new URL(page.capture.finalUrl).pathname)
      ? observations.find((o) => o.property === "heading" && o.value && o.value.length >= 3 &&
        (" " + normalizedName(name) + " ").includes(" " + normalizedName(o.value) + " ") &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the predicate above requires a non-empty value; narrowing is lost in the nested callback
        page.capture.segments.some((segment) => segment.text.includes(o.value!))) : undefined;
    const primary = (primaryLink && primaryEvidence.length === 3) || primaryHeading;
    if (primary) {
      context.push(...primaryEvidence);
    }
    if (primaryHeading) {
      context.push(primaryHeading);
    }
    const declaredUrl = text(value.url);
    const declaredUrlObservation = leaf(path + "/url");
    if (offering && declaredUrl && declaredUrlObservation?.value === declaredUrl) {
      context.push(declaredUrlObservation);
    }
    const entity = primary ? page.capture.finalUrl : page.capture.links.find((link) =>
      link.url !== page.capture.finalUrl &&
      (link.url === value.url || link.url === value["@id"]) &&
      sameSite(link.url),
    )?.url ?? (offering ? (declaredUrl && sameSite(declaredUrl) ? declaredUrl :
      serviceEntityKey(page.capture.finalUrl, name)) : `${page.capture.finalUrl}|jsonld:${path}`);
    const prefix = person ? "/key_people/@id/" : "/offerings/@id/";
    addText(prefix + "name", value.name, path + "/name", entity, context);
    addText(prefix + (person ? "background_or_relevance" : "description"),
      value.description, path + "/description", entity, context);
    if (person) {
      addText(prefix + "title", value.jobTitle, path + "/jobTitle", entity, context);
    } else {
      addText(prefix + "category", value.category, path + "/category", entity, context);
      if (primary) {
        add(prefix + "url", page.capture.finalUrl, context, entity);
      } else if (value.url === page.capture.finalUrl || page.capture.links.some((l) => l.url === value.url)) {
        addText(prefix + "url", value.url, path + "/url", entity, context);
      }
      // Offers declared on the offering, or the Offer that presents it (makesOffer/itemOffered).
      const parentPath = path.endsWith("/itemOffered") ? path.slice(0, -"/itemOffered".length) : null;
      const offers: [unknown, string][] = [
        ...(Array.isArray(value.offers) ? value.offers : [value.offers]).map((o, i): [unknown, string] =>
          [o, path + "/offers" + (Array.isArray(value.offers) ? "/" + i : "")]),
        ...(parentPath ? nodes.filter((n) => n.path === parentPath).map((n): [unknown, string] => [n.value, parentPath]) : []),
      ];
      offers.forEach(([rawOffer, offerPath]) => {
        const offer = object(rawOffer);
        if (!offer) {
          return;
        }
        const price = offer.price;
        const raw = typeof price === "number" || typeof price === "string" ? String(price) : "";
        const priceObservation = leaf(offerPath + "/price");
        // A numeric zero is preserved as an explicit paid amount, never rewritten as free.
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw) || !priceObservation) {
          return;
        }
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
