// Acceptance, Quest Q21 viewer-polish, item 3: Sales & Marketing hardening and removal of dead company-profile.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPANY_NAME, buildBusiness, draftFrom } from "../helpers/knowledge-view-fixtures";
import { banner, card, cardText } from "../helpers/knowledge-view-dom";
import { openSection, titlesOf } from "../helpers/knowledge-view-spec";

describe("Q21 sales-marketing polish", () => {
  it("a javascript: social profile link is not linked", async () => {
    const b = buildBusiness();
    b.online_presence.social_media_links = [
      { ...b.online_presence.social_media_links[0]!, platform: "Instagram", handle: "evilhandle", profile_url: "javascript:alert(1)" },
    ];
    const page = await openSection("Sales & Marketing", { draft: draftFrom(b) });
    const hrefs = page.$("a").toArray().map((a) => page.$(a).attr("href") ?? "");
    expect(hrefs.filter((h) => /^\s*javascript:/i.test(h))).toEqual([]);
    expect(banner(page, "Sales & Marketing", COMPANY_NAME)).not.toBeNull();
  });

  it("a channel with a blank url falls back to its type, and a padded url is shown trimmed", async () => {
    const b = buildBusiness();
    const base = b.market_and_customers.channels[0]!;
    b.market_and_customers.channels = [
      { ...base, id: "00000000-0000-4000-8000-000000000001", label: null, url: "   ", channel_type: "Newsletter" },
      { ...base, id: "00000000-0000-4000-8000-000000000002", label: null, url: "  https://channel.example/x  ", channel_type: null },
    ];
    const page = await openSection("Sales & Marketing", { draft: draftFrom(b) });
    const titles = titlesOf("Sales & Marketing");
    const el = card(page, "Channels", titles)!;
    const text = cardText(page, el);
    expect(text).toContain("Newsletter");
    expect(page.$(el).html() ?? "").not.toMatch(/>\s+https:\/\/channel\.example\/x|channel\.example\/x\s+</);
  });

  it("the unused company-profile component is gone", () => {
    expect(existsSync("src/components/company-profile.tsx")).toBe(false);
  });
});
