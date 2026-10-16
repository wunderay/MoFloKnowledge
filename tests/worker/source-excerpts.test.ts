import { expect, it } from "vitest";
import { exactSentences, selectExactSentences } from "../../src/worker/extract/source-excerpts";

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

it("deduplicates exact wording without clipping a unique oversized source claim", () => {
  const claim = "We provide inspections only after the owner confirms access to every restricted area.";
  expect(selectExactSentences(claim + " " + claim, { maxCharacters: 20 })).toEqual([claim]);
  expect(selectExactSentences("Contact us. " + claim, { accept: (s) => s.startsWith("We "), maxCharacters: 20 })).toEqual([claim]);
});
