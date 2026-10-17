import type { FieldCandidate, TechnicalObservation } from "./types";
import type { StoredCapture } from "../crawl/run-crawl";
import { normalizeColor } from "./colors";
import { structuredCandidates } from "./structured";
import { visibleCandidates } from "./visible";
import { companyTextCandidates, COMPANY_TEXT_FIELDS } from "./company-text";
import { marketTextCandidates, MARKET_TEXT_SUPPORTED_FIELDS } from "./market-text";
export const SUPPORTED_FIELDS: readonly string[] = [
  ...COMPANY_TEXT_FIELDS, ...MARKET_TEXT_SUPPORTED_FIELDS,
  "/offerings/@id/features",
  "/company_foundation/website", "/company_foundation/overview",
  "/company_foundation/industry", "/company_foundation/business_model",
  "/company_foundation/year_founded", "/company_foundation/employee_count", "/company_foundation/main_address",
  "/company_foundation/service_locations", "/company_foundation/alternative_company_names",
  "/positioning/company_pitch", "/market_and_customers/target_buyers",
  "/key_people/@id/name", "/key_people/@id/title", "/key_people/@id/background_or_relevance",
  "/offerings/@id/name", "/offerings/@id/description", "/offerings/@id/category",
  "/offerings/@id/url", "/offerings/@id/pricing",
  "/online_presence/social_media_links", "/branding_and_style/fonts",
  "/branding_and_style/brand_colors", "/branding_and_style/logos",
];
export function deterministicCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
): FieldCandidate[] {
  const result: FieldCandidate[] = [
    ...structuredCandidates(page, observations),
    ...visibleCandidates(page, observations),
    ...companyTextCandidates(page, observations),
    ...marketTextCandidates(page, observations),
  ];
  const add = (
    field: string,
    value: unknown,
    ids: string[],
    origin: FieldCandidate["origin"] = "source_backed",
    note: string | null = null,
  ) => {
    if (field === "/branding_and_style/fonts") {
      value = (value as { family: string }[]).flatMap((font) => {
        const family = font.family.replace(/\s*!important\s*$/i, "").trim();
        return !family || /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(family) || /^var\(/i.test(family)
          ? [] : [{ ...font, family }];
      });
      if (!(value as unknown[]).length) return;
    }
    result.push({
      field,
      entity_key: null,
      value,
      origin,
      segment_ids: [],
      observation_ids: ids,
      supporting_fields: [],
      note,
    });
  };
  const urlObservation = observations.find((o) => o.property === "url" && o.value === page.capture.finalUrl);
  if (urlObservation) add("/company_foundation/website", page.capture.finalUrl, [urlObservation.id]);
  for (const o of observations) {
    if (o.property === "font-family" && o.value)
      add(
        "/branding_and_style/fonts",
        [
          {
            family: o.value,
            apparent_use: null,
            observations: ["computed_family"],
            brand_confirmed: false,
          },
        ],
        [o.id],
      );
    if (o.property === "stylesheet" && o.value)
      for (const match of o.value.matchAll(/font-family\s*:\s*([^;}]+)/gi))
        add(
          "/branding_and_style/fonts",
          [
            {
              family: match[1].trim(),
              apparent_use: null,
              observations: ["css_declared"],
              brand_confirmed: false,
            },
          ],
          [o.id],
        );
    if (o.property === "stylesheet" && o.value)
      for (const face of o.value.matchAll(/@font-face\s*\{([^}]+)\}/gi)) {
        const family = /font-family\s*:\s*([^;}]+)/i.exec(face[1])?.[1]?.trim();
        const resource = /url\(\s*['"]?([^)'"\s]+)/i.exec(face[1])?.[1];
        if (family && resource) {
          let url: string;
          try {
            url = new URL(resource, o.asset_url ?? page.capture.finalUrl).href;
          } catch {
            continue;
          }
          const loaded = observations.find(
            (item) =>
              item.property === "font-resource" && item.asset_url === url,
          );
          if (loaded)
            add(
              "/branding_and_style/fonts",
              [
                {
                  family,
                  apparent_use: null,
                  observations: ["css_declared", "resource_loaded"],
                  brand_confirmed: false,
                },
              ],
              [o.id, loaded.id],
            );
        }
      }
    if (["color", "background-color", "declared-color", "declared-background-color"].includes(o.property ?? "") && o.value) {
      const color = normalizeColor(o.value);
      if (color)
        add(
          "/branding_and_style/brand_colors",
          [
            {
              ...color,
              apparent_role: null,
              classification: "observed_website_color",
            },
          ],
          [o.id],
        );
    }
    if (
      o.property === "logo" &&
      o.asset_url &&
      /header|footer|^jsonld:(?:Organization|LocalBusiness)\/logo$/i.test(o.selector ?? "") &&
      !/partner|favicon/i.test(o.value ?? "")
    )
      add(
        "/branding_and_style/logos",
        [{ url: o.asset_url, variant: null, kind: "company_logo" }],
        [o.id],
      );
  }
  for (const link of page.capture.links) {
    const url = new URL(link.url);
    if (/\/(?:share|intent|sharer|dialog)(?:\/|$)/i.test(url.pathname))
      continue;
    const platform =
      /^(?:www\.)?(linkedin|facebook|instagram|youtube|twitter|x|tiktok)\.com$/.exec(
        url.hostname,
      )?.[1];
    if (platform === "linkedin" && !/^\/(?:company|school|showcase)\/[^/]+/i.test(url.pathname)) continue;
    // Links to other companies' profiles (partners, sponsors, clients) are not the company's own.
    // Judged by the heading of the section the link sits in, not by words in its label or handle.
    if (platform && link.label && page.capture.segments.some((segment) => segment.text === link.label &&
      /\b(?:partners?|sponsors?|clients?|suppliers?|vendors?|affiliates?)\b/i.test(segment.heading ?? ""))) continue;
    if (platform && url.pathname !== "/") {
      const o = observations.find(
        (o) => o.property === "href" && o.value === link.url,
      );
      if (o)
        add(
          "/online_presence/social_media_links",
          [{ platform, profile_url: link.url }],
          [o.id],
        );
    }
  }
  return result;
}
