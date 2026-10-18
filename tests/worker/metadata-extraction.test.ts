import { describe, expect, it } from "vitest";
import { runRows, type Row } from "./account-it-run";

const org = { "@context": "https://schema.org", "@type": "Organization", name: "Acme Co", url: "https://example.com/" };
/** One home page with hand-built observations, run through the same steps as a crawl. */
const run = (observations: Record<string, unknown>) => {
  const row: Row = {
    normalized_url: "https://example.com/", final_url: "https://example.com/", title: "Acme",
    observations: { segments: [{ id: "s1", text: "Welcome." }], links: [], ...observations },
  };
  return runRows([row], ["/"]);
};
const content = (result: ReturnType<typeof run>, kind: string) =>
  (result.proposals.find((p) => p.kind === kind)?.content ?? {}) as Record<string, unknown>;
const texts = (value: unknown) => ((value as { text: string }[] | undefined) ?? []).map((item) => item.text);

describe("metadata extraction", () => {
  it("maps JSON-LD foundingDate to the founding year", () => {
    const result = run({ jsonLd: [{ ...org, foundingDate: "2005-03-01" }] });
    expect(content(result, "company_foundation").year_founded).toBe(2005);
  });

  it("maps a microdata organization foundingDate to the founding year", () => {
    const result = run({ microdata: [{ type: "https://schema.org/Organization", props: { name: ["Acme Co"], url: ["https://example.com/"], foundingDate: ["2007"] } }] });
    expect(content(result, "company_foundation").year_founded).toBe(2007);
  });

  it("maps numberOfEmployees to an exact count or a range", () => {
    const exact = run({ jsonLd: [{ ...org, numberOfEmployees: 40 }] });
    expect(content(exact, "company_foundation").employee_count).toMatchObject({ raw: "40", exact: 40, min: null, max: null });
    const range = run({ jsonLd: [{ ...org, numberOfEmployees: "25-50" }] });
    expect(content(range, "company_foundation").employee_count).toMatchObject({ raw: "25-50", exact: null, min: 25, max: 50 });
  });

  it("maps sameAs to social links", () => {
    const result = run({ jsonLd: [{ ...org, sameAs: ["https://www.linkedin.com/company/acme", "https://www.facebook.com/acme"] }] });
    const links = (content(result, "online_presence").social_media_links as { platform: string; profile_url: string }[] | undefined) ?? [];
    expect(links.map((l) => `${l.platform} ${l.profile_url}`).sort()).toEqual([
      "facebook https://www.facebook.com/acme", "linkedin https://www.linkedin.com/company/acme"]);
  });

  it("maps slogan to the company pitch, verbatim", () => {
    const result = run({ jsonLd: [{ ...org, slogan: "Widgets that last." }] });
    expect(content(result, "positioning").company_pitch).toBe("Widgets that last.");
  });

  it("maps knowsAbout to industry groupings", () => {
    const result = run({ jsonLd: [{ ...org, knowsAbout: ["Water treatment", "Irrigation"] }] });
    expect(texts(content(result, "market_and_customers").industry_groupings).sort()).toEqual(["Irrigation", "Water treatment"]);
  });

  it("maps makesOffer to an offering with description and price", () => {
    const offer = { "@type": "Offer", price: "150", priceCurrency: "USD",
      itemOffered: { "@type": "Service", name: "Tax Preparation", description: "Annual returns for households." } };
    const result = run({ jsonLd: [{ ...org, makesOffer: [offer] }] });
    expect(result.proposals.filter((p) => p.kind === "offering").map((p) => p.content)).toEqual([
      expect.objectContaining({ name: "Tax Preparation", description: "Annual returns for households.",
        pricing: expect.objectContaining({ kind: "paid", amount: "150", currency: "USD" }) })]);
  });

  it("maps a JSON-LD email to a contact channel", () => {
    const result = run({ jsonLd: [{ ...org, email: "hello@example.com" }] });
    const channels = (content(result, "market_and_customers").channels as { channel_type: string; label: string }[] | undefined) ?? [];
    expect(channels).toEqual([expect.objectContaining({ channel_type: "Email", label: "hello@example.com" })]);
  });

  it("maps og:site_name and application-name to an alternate name when they differ from the host label", () => {
    const names = (metaTags: unknown[]) => texts(content(run({ metaTags }), "company_foundation").alternative_company_names);
    expect(names([{ attribute: "property", name: "og:site_name", content: "Acme Labs" }])).toEqual(["Acme Labs"]);
    expect(names([{ attribute: "name", name: "application-name", content: "Acme Portal" }])).toEqual(["Acme Portal"]);
    expect(names([{ attribute: "property", name: "og:site_name", content: "Example" }])).toEqual([]);
  });

  it("maps mailto and tel links to a contact channel and the phone", () => {
    const result = run({ mailtoLinks: [{ value: "office@example.com", text: "Email us" }], telLinks: [{ value: "+13055550142", text: "Call" }] });
    const channels = (content(result, "market_and_customers").channels as { channel_type: string; label: string }[] | undefined) ?? [];
    expect(channels).toEqual([expect.objectContaining({ channel_type: "Email", label: "office@example.com" })]);
    expect(content(result, "online_presence").phone).toBe("3055550142");
  });
});
