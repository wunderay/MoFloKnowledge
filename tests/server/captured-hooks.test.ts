// Captured headlines, calls to action, lead magnets and opening hours are derived
// at read time from the company's captured source pages.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/authorize", () => ({ authorizeCompany: async () => ({ role: "member" }) }));

const COMPANY_ID = "00000000-0000-4000-8000-0000000c0001";
const HOME_URL = "https://www.harborandpine.example/";
const SHOP_URL = "https://www.harborandpine.example/shop";
const CONTACT_URL = "https://www.harborandpine.example/contact";
const TASTING_URL = "https://www.harborandpine.example/tasting";
const GUIDE_URL = "https://www.harborandpine.example/guides/coffee-guide";
const ABOUT_URL = "https://www.harborandpine.example/about";

interface CapturedHooks {
  headlines: { text: string; level: number | null; sources: string[] }[];
  ctas: { text: string; href: string | null; sources: string[] }[];
  leadMagnets: { text: string; href: string | null; sources: string[] }[];
  hours: { value: string; sources: string[] }[];
}

interface HooksModule {
  readCapturedHooks?: (client: unknown, companyId: string) => Promise<CapturedHooks>;
}

// A chainable fake: any select/eq/in/order/limit chain resolves to the same rows.
function fakeClient(rows: Record<string, unknown>[]) {
  const result = { data: rows, error: null };
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
  };
  for (const method of ["select", "eq", "neq", "in", "is", "not", "gte", "lte", "order", "limit", "range"]) {
    builder[method] = () => builder;
  }
  return {
    from: () => builder,
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  };
}

const page = (
  id: string,
  url: string,
  title: string | null,
  observations: Record<string, unknown>,
) => ({
  id,
  company_id: COMPANY_ID,
  scrape_job_id: "job-1",
  normalized_url: url,
  final_url: url,
  title,
  retrieved_at: "2026-01-01T00:00:00.000Z",
  recorded_at: "2026-01-01T00:00:00.000Z",
  capture_status: "captured",
  cleaned_content: "",
  observations,
});

async function load() {
  const path = "@/server/captured-hooks";
  const mod = (await import(/* @vite-ignore */ path).catch(() => ({}))) as HooksModule;
  expect(typeof mod.readCapturedHooks, "captured-hooks exports readCapturedHooks as a function").toBe("function");
  return mod.readCapturedHooks!;
}

describe("readCapturedHooks", () => {
  it("lists H1/H2 headlines, the page title and meta description, deduplicated across pages", async () => {
    const readCapturedHooks = await load();
    const client = fakeClient([
      page("s1", HOME_URL, "Harbor & Pine Coffee", {
        headings: [
          { level: 1, text: "Small-batch coffee, roasted to order" },
          { level: 2, text: "Our roasting process" },
        ],
        metaDescription: "Small-batch coffee roasted in Seattle.",
        contentSections: [],
        jsonLd: [],
        ctas: [],
        forms: [],
      }),
      page("s2", SHOP_URL, "Shop | Harbor & Pine", {
        headings: [{ level: 1, text: "Small-batch coffee, roasted to order" }],
        metaDescription: null,
        contentSections: [],
        jsonLd: [],
        ctas: [],
        forms: [],
      }),
    ]);
    const { headlines } = await readCapturedHooks(client, COMPANY_ID);
    const repeated = headlines.filter((item) => item.text === "Small-batch coffee, roasted to order");
    expect(repeated, "duplicate headline appears once").toHaveLength(1);
    expect(repeated[0].sources).toEqual(expect.arrayContaining([HOME_URL, SHOP_URL]));
    expect(repeated[0].sources).toHaveLength(2);
    const process = headlines.find((item) => item.text === "Our roasting process");
    expect(process?.level).toBe(2);
    expect(process?.sources).toEqual([HOME_URL]);
    expect(headlines.map((item) => item.text), "page title is a headline").toContain("Harbor & Pine Coffee");
    expect(headlines.map((item) => item.text), "meta description is a headline").toContain(
      "Small-batch coffee roasted in Seattle.",
    );
  });

  it("lists calls to action with their text and href, deduplicated with every source page", async () => {
    const readCapturedHooks = await load();
    const client = fakeClient([
      page("s3", HOME_URL, "Harbor & Pine Coffee", {
        headings: [], metaDescription: null, contentSections: [], jsonLd: [], forms: [],
        ctas: [{ label: "Book a tasting", destination: TASTING_URL }],
      }),
      page("s4", SHOP_URL, "Shop | Harbor & Pine", {
        headings: [], metaDescription: null, contentSections: [], jsonLd: [], forms: [],
        ctas: [
          { label: "Book a tasting", destination: TASTING_URL },
          { label: "Add to cart", destination: `${SHOP_URL}/cart` },
        ],
      }),
    ]);
    const { ctas } = await readCapturedHooks(client, COMPANY_ID);
    const tasting = ctas.filter((item) => item.text === "Book a tasting");
    expect(tasting, "repeated call to action appears once").toHaveLength(1);
    expect(tasting[0].href).toBe(TASTING_URL);
    expect(tasting[0].sources).toEqual(expect.arrayContaining([HOME_URL, SHOP_URL]));
    const cart = ctas.find((item) => item.text === "Add to cart");
    expect(cart?.href).toBe(`${SHOP_URL}/cart`);
    expect(cart?.sources).toEqual([SHOP_URL]);
  });

  it("keeps only lead magnets: CTAs and forms whose text or heading names a lead offer", async () => {
    const readCapturedHooks = await load();
    const client = fakeClient([
      page("s5", HOME_URL, "Harbor & Pine Coffee", {
        headings: [], metaDescription: null, contentSections: [], jsonLd: [], forms: [],
        ctas: [
          { label: "Download our free coffee guide", destination: GUIDE_URL },
          { label: "About us", destination: ABOUT_URL },
        ],
      }),
      page("s6", CONTACT_URL, "Contact | Harbor & Pine", {
        headings: [], metaDescription: null, contentSections: [], jsonLd: [], ctas: [],
        forms: [
          {
            action: null,
            method: "POST",
            labels: ["Email address"],
            heading: "Subscribe to our newsletter",
            submitLabels: ["Subscribe"],
          },
        ],
      }),
    ]);
    const { leadMagnets } = await readCapturedHooks(client, COMPANY_ID);
    const guide = leadMagnets.find((item) => item.text === "Download our free coffee guide");
    expect(guide, "free guide CTA is a lead magnet").toBeDefined();
    expect(guide?.href).toBe(GUIDE_URL);
    expect(guide?.sources).toEqual([HOME_URL]);
    const newsletter = leadMagnets.find((item) => item.text.includes("Subscribe to our newsletter"));
    expect(newsletter, "newsletter form is a lead magnet").toBeDefined();
    expect(newsletter?.sources).toEqual([CONTACT_URL]);
    expect(
      leadMagnets.map((item) => item.text).some((text) => text.includes("About us")),
      "a plain navigation CTA is not a lead magnet",
    ).toBe(false);
  });

  it("lists opening hours from JSON-LD openingHours with their source page", async () => {
    const readCapturedHooks = await load();
    const client = fakeClient([
      page("s7", CONTACT_URL, "Contact | Harbor & Pine", {
        headings: [], metaDescription: null, contentSections: [], ctas: [], forms: [],
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: "Harbor & Pine Coffee",
            openingHours: ["Mo-Fr 07:00-16:00"],
          },
        ],
      }),
    ]);
    const { hours } = await readCapturedHooks(client, COMPANY_ID);
    const weekdays = hours.find((item) => item.value.includes("Mo-Fr 07:00-16:00"));
    expect(weekdays, "JSON-LD opening hours are listed").toBeDefined();
    expect(weekdays?.sources).toEqual([CONTACT_URL]);
  });
});
