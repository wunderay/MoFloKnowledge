import { expect, it } from "vitest";
import { parseExtractionResponse } from "../../src/worker/model/responses";
import { PageModelOutputSchema } from "../../src/worker/model/schema";
it("accepts typed identifier-free nested values and rejects injected authority", () => {
  const output = {
    candidates: [
      {
        field: "/company_foundation/service_locations",
        entity_key: null,
        value: [{ text: "Pacific Northwest" }],
        origin: "source_backed",
        segment_ids: ["s1"],
        observation_ids: [],
        supporting_fields: [],
        note: null,
      },
    ],
    limitations: [],
  };
  expect(
    parseExtractionResponse({
      status: "completed",
      output_text: JSON.stringify(output),
    }),
  ).toEqual(output);
  expect(
    PageModelOutputSchema.safeParse({ ...output, actor_id: "forged" }).success,
  ).toBe(false);
  expect(
    PageModelOutputSchema.safeParse({
      candidates: [
        {
          ...output.candidates[0],
          value: [{ id: "model-assigned", text: "Pacific Northwest" }],
        },
      ],
      limitations: [],
    }).success,
  ).toBe(false);
});
it("rejects recorded refused, incomplete and malformed structured responses", () => {
  expect(() =>
    parseExtractionResponse({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "declined" }],
        },
      ],
    }),
  ).toThrow("model_refusal");
  expect(() =>
    parseExtractionResponse({ status: "incomplete", output_text: "{}" }),
  ).toThrow("incomplete_output");
  expect(() =>
    parseExtractionResponse({
      status: "completed",
      output_text: '{"candidates":[{"field":"invented"}],"limitations":[]}',
    }),
  ).toThrow("invalid_output");
});
