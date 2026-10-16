import type { StoredCapture } from "../crawl/run-crawl";
import type { TechnicalObservation } from "../model/responses";
import type { RenderResult } from "../../contracts/render-task";
export function technicalObservations(
  page: StoredCapture,
): TechnicalObservation[] {
  const result: TechnicalObservation[] = [];
  const add = (
    selector: string | null,
    property: string,
    value: string,
    asset_url: string | null = null,
  ) => {
    const observation = {
      id: `o${result.length + 1}`,
      selector,
      property,
      value,
      asset_url,
    };
    result.push(observation);
    return observation.id;
  };
  add(null, "url", page.capture.finalUrl);
  for (const link of page.capture.links) add(null, "href", link.url, link.url);
  const design = page.capture.observations.design as RenderResult | undefined;
  if (design) {
    for (const style of design.styles) {
      add(style.selector, "font-family", style.fontFamily);
      add(style.selector, "color", style.color);
      add(style.selector, "background-color", style.backgroundColor);
    }
    for (const sheet of design.stylesheets)
      if (sheet.status === "available")
        add(null, "stylesheet", sheet.declarations, sheet.url);
    for (const font of design.fonts)
      if (font.loaded) add(null, "font-resource", font.url, font.url);
    for (const logo of design.logos)
      add(logo.context, "logo", `${logo.alt} | ${logo.context}`, logo.url);
  }
  return result;
}
