import { expect, it } from "vitest";
import { exactSentences, selectExactSentences, isExplicitServiceProviderSentence } from "../../src/worker/extract/source-excerpts";

it("selects whole original sentences with qualifications, punctuation and source order", () => {
  const first = "We offer inspections for $12.50 per visit, only for existing clients.";
  const second = "Other firms may provide unrelated services.";
  const third = "We provide weekend appointments when requested.";
  const source = first + " " + second + "\n" + third;
  const selected = selectExactSentences(source, { accept: (sentence) => sentence.startsWith("We ") });
  expect(selected).toEqual([first, third]);
  expect(selected.every((sentence) => source.includes(sentence))).toBe(true);
  expect(exactSentences("Authorized work (subject to review); ask us first.")).toEqual([
    "Authorized work (subject to review); ask us first.",
  ]);
});

it("recognizes explicit current-company service predicates without classifying comparisons or conditions", () => {
  expect(isExplicitServiceProviderSentence("We also provide online design services.")).toBe(true);
  expect(isExplicitServiceProviderSentence("Cedar Studio offers bridge survey services.", ["Cedar Studio"])).toBe(true);
  expect(isExplicitServiceProviderSentence("Many companies offer this type of professional service.")).toBe(false);
  expect(isExplicitServiceProviderSentence("If requested, we might offer engineering services.")).toBe(false);
  expect(isExplicitServiceProviderSentence("We do not provide legal services.")).toBe(false);
  expect(isExplicitServiceProviderSentence("Another Studio provides engineering services.", ["Cedar Studio"])).toBe(false);
});

it("deduplicates exact wording without clipping a unique oversized source claim", () => {
  const claim = "We provide inspections only after the owner confirms access to every restricted area.";
  expect(selectExactSentences(claim + " " + claim, { maxCharacters: 20 })).toEqual([claim]);
  expect(selectExactSentences("Contact us. " + claim, { accept: (s) => s.startsWith("We "), maxCharacters: 20 })).toEqual([claim]);
});
