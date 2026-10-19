import type { CheerioAPI } from "cheerio";
import { normalizeText } from "./segments";

const price = /[$€£]\s?\d[\d,]*(?:\.\d+)?/;

/** Links grouped by the navigation submenu (a list nested in a navigation item) that holds them, with the parent item's label. */
export function captureNavGroups($: CheerioAPI): { parent: string; links: { url: string; label: string }[] }[] {
  const groups: { parent: string; links: { url: string; label: string }[] }[] = [];
  $('nav li > ul,[role="navigation"] li > ul').slice(0, 40).each((_i, list) => {
    const group = $(list).children("li").slice(0, 30).toArray().flatMap((item) => {
      const anchor = $(item).children("a[href]").first();
      const url = anchor.attr("href");
      const label = normalizeText(anchor.text()).slice(0, 200);
      return url && label ? [{ url, label }] : [];
    });
    if (group.length >= 2) {
      groups.push({ parent: normalizeText($(list).parent().children("a").first().text()).slice(0, 200), links: group });
    }
  });
  return groups;
}

/** Repeated sibling cards (3 or more of one element type) that each carry a title and a currency amount. */
export function captureCards($: CheerioAPI, root: ReturnType<CheerioAPI>): { title: string; price: string }[] {
  for (const parent of root.find("*").addBack().toArray()) {
    const byTag = new Map<string, ReturnType<CheerioAPI>[]>();
    for (const child of $(parent).children().toArray()) {
      const card = $(child);
      const title = normalizeText(card.find("h1,h2,h3,h4,h5,h6").first().text());
      if (title && price.test(card.text()) && !card.closest("blockquote").length) {
        byTag.set(child.tagName, [...(byTag.get(child.tagName) ?? []), card]);
      }
    }
    const cards = [...byTag.values()].find((items) => items.length >= 3);
    if (cards) {
      return cards.slice(0, 6).map((card) => ({
        title: normalizeText(card.find("h1,h2,h3,h4,h5,h6").first().text()).slice(0, 200),
        price: price.exec(card.text())?.[0] ?? "",
      }));
    }
  }
  return [];
}
