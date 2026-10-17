import { expect, it } from "vitest";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { documentData, documentParagraphs } from "../../src/knowledge/document-export";
import { factualBullets } from "../../src/knowledge/narrative-prose";

it("formats actual company services as factual sentence bullets without dropping audiences or payroll qualifications", () => {
  const company = "Account-it Consulting Services, LLC";
  const opening = `Welcome to ${company}, a trusted partner for comprehensive tax and accounting services based in Boynton Beach, Florida.`;
  const service = "QuickBooks Online services, assisting business owners with seamless financial management solutions.";
  const qualified = "While payroll services are available, they are primarily offered to existing clients or those transitioning to a tax setup that requires payroll.";
  expect(factualBullets("We specialize in tax preparation and planning for both individuals and businesses, ensuring our clients navigate the complexities of the tax system with confidence.", company))
    .toEqual([{ text: "tax preparation and planning for both individuals and businesses, ensuring its clients navigate the complexities of the tax system with confidence.", label: "Specialty" }]);
  expect(factualBullets(`${opening} We also provide ${service} ${qualified}`, company)).toEqual([
    { text: "Comprehensive tax and accounting services based in Boynton Beach, Florida." },
    { text: "QuickBooks Online services", label: "Additional services provided" },
    { text: "Assisting business owners with seamless financial management solutions." },
    { text: qualified },
  ]);
  expect(factualBullets("We can help simplify the payroll process to help you more effectively manage your Florida small business.", company))
    .toEqual([{ text: "Can help simplify the payroll process to help you more effectively manage your Florida small business." }]);
});

it("keeps full ambiguous, personal, quoted, negative and conditional statements instead of parsing their predicates", () => {
  for (const text of [
    "We offer training and can work remotely.", "We provide tools, sell training.", "We do not provide advice.",
    "We offer no legal advice.", "We provide tools or offer training.", "We provide tools and process applications.", "We can help clients but need payment.",
    "We offer services, such as planning, and sell software.", "We provide tools; offer training.",
    "We can help clients, from setup to filing if eligible.", "We can help clients, from setup to filing as long as they qualify.",
    "We can provide tools, assisting clients if eligible.", "We have used this system for years.",
    "My experience matters. We provide tools for our clients.", 'We provide tools with a "we know best" message.',
  ]) expect(factualBullets(text, "Lumen Ledger").map((bullet) => bullet.text).join(" ")).toBe(text);
  expect(factualBullets("We provide tools for our clients.", "Lumen Ledger"))
    .toEqual([{ text: "tools for its clients.", label: "Services provided" }]);
  expect(factualBullets("My experience matters. I have worked with clients.", "Lumen Ledger", true))
    .toEqual([{ text: "My experience matters." }, { text: "I have worked with clients." }]);
  expect(factualBullets("We will provide a list if eligible.", "Lumen Ledger"))
    .toEqual([{ text: "Will provide a list if eligible." }]);
});

it("uses the shared factual bullets for unrelated company profiles while preserving named personal statements and original data", () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  snapshot.offerings[0].description = "We offer training for our clients. Support is available only by appointment.";
  snapshot.key_people[0].background_or_relevance = "We offer training for our clients.";
  const before = structuredClone(snapshot);
  const input = { kind: "snapshot", snapshot } as const;
  const paragraphs = documentParagraphs(input);
  expect(paragraphs.some((bullet) => bullet.text === "training for its clients." && bullet.label === "Services offered" && bullet.bullet)).toBe(true);
  expect(paragraphs.some((bullet) => bullet.text === "Support is available only by appointment." && bullet.bullet)).toBe(true);
  expect(paragraphs.some((bullet) => bullet.text === snapshot.key_people[0].background_or_relevance && bullet.bullet)).toBe(true);
  expect(documentData(input)).toEqual(before);
  expect(snapshot).toEqual(before);
});


it("omits whitespace segments between factual and verbatim paragraphs while keeping every statement", () => {
  const text = "  First complete fact.\n\n \t\nSecond qualified fact.\r\n\r\n  ";
  for (const verbatim of [false, true]) {
    expect(factualBullets(text, "Lumen Ledger", verbatim)).toEqual([
      { text: "First complete fact." }, { text: "Second qualified fact." },
    ]);
    expect(factualBullets(" \n\r\n\t ", "Lumen Ledger", verbatim)).toEqual([]);
  }
});
