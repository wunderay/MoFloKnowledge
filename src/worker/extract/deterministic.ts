import type { FieldCandidate } from "../model/schema";
import type { StoredCapture } from "../crawl/run-crawl";
import type { TechnicalObservation } from "../model/responses";
import { normalizeColor } from "./colors";
export function deterministicCandidates(
  page: StoredCapture,
  observations: TechnicalObservation[],
): FieldCandidate[] {
  const result: FieldCandidate[] = [];
  const add = (
    field: string,
    value: unknown,
    ids: string[],
    origin: FieldCandidate["origin"] = "source_backed",
    note: string | null = null,
  ) =>
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
  add("/company_foundation/website", page.capture.finalUrl, [
    observations[0].id,
  ]);
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
    if (["color", "background-color"].includes(o.property ?? "") && o.value) {
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
      /header|footer/i.test(o.selector ?? "") &&
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
