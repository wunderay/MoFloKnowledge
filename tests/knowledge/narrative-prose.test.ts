import { expect, it } from "vitest";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { documentData, documentParagraphs } from "../../src/knowledge/document-export";
import { varyCompanyNarrative } from "../../src/knowledge/narrative-prose";

it("varies actual company sentence structures while retaining the complete list, capability and qualifications", () => {
  const company = "Account-it Consulting Services, LLC";
  const functions = "accounts payable/receivable, payroll, general ledger accounting, bank reconciliations, financial statement preparation and financial analysis.";
  expect(varyCompanyNarrative(`We perform vital accounting functions, such as ${functions}`, company))
    .toBe(`We perform vital accounting functions, such as ${functions}`);
  expect(varyCompanyNarrative("We can handle it all, from your payroll needs to banking and check writing.", company))
    .toBe("From your payroll needs to banking and check writing, we can handle it all.");
  const service = "QuickBooks Online services, assisting business owners with seamless financial management solutions.";
  expect(varyCompanyNarrative(`We also provide ${service}`, company)).toBe(`In addition, we provide ${service}`);
  const qualified = "While payroll services are available, they are primarily offered to existing clients or those transitioning to a tax setup that requires payroll.";
  expect(varyCompanyNarrative(qualified, company)).toBe(qualified);
});

it("keeps sentence agreement, negation and modals, with stable choices and unchanged ambiguous or personal voice", () => {
  const vary = (text: string) => varyCompanyNarrative(text, "Lumen Ledger");
  expect(vary("We provide tools for our customers.")).toBe("It provides tools for its customers.");
  expect(vary("We also offer training for our clients.")).toBe("In addition, it offers training for its clients.");
  expect(vary("We can help our clients and may work remotely.")).toBe("It can help its clients and may work remotely.");
  expect(vary("We do not provide financial advice.")).toBe("The company does not provide financial advice.");
  expect(vary("We also provide tools for our clients, with support.")).toBe("In addition, we provide tools for our clients, with support.");
  for (const text of [
    "We provide software and train staff.", "We can help clients and need payment.", "We are experts in inventory.",
    "We provide tools or offer training.", "We can help clients but need payment.",
    "We do not provide tools nor offer training.", "We provide tools yet need training.", "We provide tools; offer training.",
    "We offer services, such as planning, but do not provide advice.",
    "We offer services, such as budgeting and do not provide legal advice.",
    "We offer services, such as planning, and sell software.",
    "We provide software, sell tools.",
    "We can help clients, from setup to filing if eligible.", "We can help clients, from setup to filing until approved.",
    "We can help clients, from setup to filing provided approval is granted.", "We can help clients, from setup to filing as long as they qualify.",
    "We have used this system for years.", "We'll also monitor laws that may affect your tax filings.",
    "My experience matters. We provide tools for our clients.", "I have worked with clients. We offer tools.",
    'We provide tools with a "we know best" message.', "We offer tools. ‘We do not promise results,’ the customer said.",
    "We can help you, from time to time, but cannot handle everything.",
  ]) expect(vary(text)).toBe(text);
});

it("applies the same display projection to unrelated saved company narratives without changing personal fields or original data", () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  snapshot.offerings[0].description = "We offer training for our clients.";
  snapshot.key_people[0].background_or_relevance = "We offer training for our clients.";
  const before = structuredClone(snapshot);
  const input = { kind: "snapshot", snapshot } as const;
  const text = documentParagraphs(input).map((paragraph) => paragraph.text);
  expect(text).toContain("The company offers training for its clients.");
  expect(text).toContain(snapshot.key_people[0].background_or_relevance);
  expect(text).toContain(snapshot.positioning.company_pitch);
  expect(documentData(input)).toEqual(before);
  expect(snapshot).toEqual(before);
});
