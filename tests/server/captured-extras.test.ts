// Captured FAQ answers and contact details are derived at read time from the
// company's captured source pages.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/authorize", () => ({ authorizeCompany: async () => ({ role: "member" }) }));

const COMPANY_ID = "00000000-0000-4000-8000-0000000c0001";
const FAQ_URL = "https://www.harborandpine.example/faq";
const CONTACT_URL = "https://www.harborandpine.example/contact";
const ABOUT_URL = "https://www.harborandpine.example/about";

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

const page = (id: string, url: string, content: string, observations: Record<string, unknown>) => ({
  id,
  company_id: COMPANY_ID,
  scrape_job_id: "job-1",
  normalized_url: url,
  final_url: url,
  title: null,
  retrieved_at: "2026-01-01T00:00:00.000Z",
  recorded_at: "2026-01-01T00:00:00.000Z",
  capture_status: "captured",
  cleaned_content: content,
  observations,
});

async function load() {
  const path = "@/server/captured-extras";
  const mod = (await import(/* @vite-ignore */ path).catch(() => null)) as {
    readCapturedExtras: (client: unknown, companyId: string) => Promise<{
      faqs: { question: string; answer: string; sources: string[] }[];
      contacts: { kind: string; value: string; sources: string[] }[];
    }>;
  } | null;
  expect(mod, "captured-extras module exists").not.toBeNull();
  return mod!;
}

describe("readCapturedExtras", () => {
  it("extracts a JSON-LD FAQPage answer and a question-heading section with their source URLs", async () => {
    const { readCapturedExtras } = await load();
    const client = fakeClient([
      page("s1", FAQ_URL, "Frequently asked questions.", {
        headings: [{ level: 1, text: "FAQ" }],
        contentSections: [
          { heading: "Do you roast to order?", paragraphs: ["Yes, every batch is roasted to order."], listItems: [], links: [] },
        ],
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Do you ship internationally?",
                acceptedAnswer: { "@type": "Answer", text: "We ship to Canada and the UK." },
              },
            ],
          },
        ],
      }),
    ]);
    const { faqs } = await readCapturedExtras(client, COMPANY_ID);
    const jsonLd = faqs.find((faq) => faq.question === "Do you ship internationally?");
    expect(jsonLd?.answer).toContain("We ship to Canada and the UK.");
    expect(jsonLd?.sources).toEqual([FAQ_URL]);
    const section = faqs.find((faq) => faq.question === "Do you roast to order?");
    expect(section?.answer).toContain("Yes, every batch is roasted to order.");
    expect(section?.sources).toEqual([FAQ_URL]);
  });

  it("extracts an email and a phone from page text with their source URL and dedupes repeats", async () => {
    const { readCapturedExtras } = await load();
    const client = fakeClient([
      page("s2", CONTACT_URL, "Write to hello@harborandpine.example or call +1 (206) 555-0142 today.", {
        headings: [], contentSections: [], jsonLd: [],
      }),
      page("s3", ABOUT_URL, "Questions? Email hello@harborandpine.example any time.", {
        headings: [], contentSections: [], jsonLd: [],
      }),
    ]);
    const { contacts } = await readCapturedExtras(client, COMPANY_ID);
    const emails = contacts.filter((contact) => contact.kind === "email");
    expect(emails).toHaveLength(1);
    expect(emails[0].value).toBe("hello@harborandpine.example");
    expect(emails[0].sources).toEqual(expect.arrayContaining([CONTACT_URL, ABOUT_URL]));
    const phones = contacts.filter((contact) => contact.kind === "phone");
    expect(phones).toHaveLength(1);
    expect(phones[0].value.replace(/\D/g, "")).toBe("12065550142");
    expect(phones[0].sources).toEqual([CONTACT_URL]);
  });
});
