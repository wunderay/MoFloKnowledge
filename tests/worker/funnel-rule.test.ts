import { describe, expect, it } from "vitest";
import { runRows, type Row } from "./account-it-run";

const site = "https://account-it.net";
const heading = (text: string) => ({ text, level: 2 });
/** A captured page with the observation shapes the extraction pipeline reads, run through the same steps as a crawl. */
function page(path: string, options: {
  title?: string;
  headings?: { text: string; level: number }[];
  forms?: Record<string, unknown>[];
  segments?: string[];
} = {}): Row {
  const segments = (options.segments ?? []).map((text, index) => ({ id: `s${index + 1}`, text }));
  return {
    normalized_url: site + path, final_url: site + path, title: options.title ?? "Account-it Consulting Services, LLC",
    observations: { segments, links: [], headings: options.headings ?? [], forms: options.forms ?? [] },
  };
}
const contactForm = {
  action: null, method: "GET", heading: "Get In Touch With Account-it Consulting Services, LLC",
  context: "If you're ready to get started, just fill out this form and we'll be in touch.",
  labels: ["First name", "Last name", "Email", "Phone Number", "Message"], submitLabels: ["Submit"],
};
const newsletterForm = {
  action: null, method: "GET", heading: "Latest Articles",
  context: "Get weekly articles in your inbox on the latest tax law changes and tips for your financial health.",
  labels: ["Email address"], submitLabels: ["Notify me"],
};

/** Funnel names and the page URLs that evidence them, read from the reduced market and customers proposal. */
function funnels(result: ReturnType<typeof runRows>) {
  const proposal = result.proposals.find((p) => p.kind === "market_and_customers");
  const content = (proposal?.content ?? {}) as { funnels?: { name: string | null }[] };
  const provenance = proposal?.provenance;
  const evidenceUrls = (provenance?.claims ?? [])
    .filter((claim) => claim.targets.some((target) => target.startsWith("/funnels/") || target.includes("/funnels/")))
    .flatMap((claim) => claim.evidence_ids)
    .map((id) => provenance?.evidence.find((item) => item.id === id)?.source_page_id)
    .map((pageId) => provenance?.sources.find((source) => source.id === pageId)?.url);
  return { names: (content.funnels ?? []).map((funnel) => funnel.name), evidenceUrls };
}

describe("funnel rule", () => {
  it("gives a contact form with a message field the funnel Contact form, evidenced by the page", () => {
    const contact = page("/contact", { headings: [heading("Get In Touch With Account-it Consulting Services, LLC")], forms: [contactForm] });
    const result = runRows([contact], ["/contact"]);
    const { names, evidenceUrls } = funnels(result);
    expect(names).toContain("Contact form");
    expect(evidenceUrls).toContain(site + "/contact");
  });

  it("gives a newsletter subscribe form the funnel Newsletter signup", () => {
    const home = page("/", { headings: [heading("Latest Articles")], forms: [newsletterForm] });
    const { names } = funnels(runRows([home], ["/"]));
    expect(names).toContain("Newsletter signup");
  });

  it("gives an appointment page the funnel Appointment scheduler", () => {
    const appointment = page("/appointment", { title: "Make an Appointment", headings: [heading("Make an Appointment")],
      segments: ["Make an Appointment", "Pick a date and time that suits you."] });
    const { names } = funnels(runRows([appointment], ["/appointment"]));
    expect(names).toContain("Appointment scheduler");
  });

  it("gives a referrals page the funnel Client referrals", () => {
    const referrals = page("/firm-background/referrals", { headings: [heading("Client Referrals")],
      segments: ["Client Referrals", "Tell a friend about our tax services."] });
    const { names } = funnels(runRows([referrals], ["/firm-background/referrals"]));
    expect(names).toContain("Client referrals");
  });

  it("adds nothing to buyers or customer needs from a blog post", () => {
    const sentences = ["Small businesses need help with payroll.", "We help small businesses with payroll."];
    // Control: the same buyer sentence on a services page does declare a buyer, so an empty blog result is meaningful.
    const control = runRows([page("/services/payroll", { segments: sentences.slice(1) })], ["/services/payroll"]);
    expect(control.buyers).toEqual(["small businesses"]);
    const blog = page("/blog/payroll-basics", { title: "Payroll Basics",
      headings: [heading("Payroll Basics")], segments: ["Payroll Basics", ...sentences] });
    const result = runRows([blog], ["/blog/payroll-basics"]);
    const content = (result.proposals.find((p) => p.kind === "market_and_customers")?.content ?? {}) as
      { target_buyers?: { text: string }[]; customer_needs?: { text: string }[] };
    expect(content.target_buyers ?? []).toEqual([]);
    expect(content.customer_needs ?? []).toEqual([]);
  });
});
