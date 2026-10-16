import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PageModelOutputSchema, type PageModelOutput } from "./schema";
import { EXTRACTION_INSTRUCTIONS, PROMPT_VERSION } from "./prompt";
import type { StoredCapture } from "../crawl/run-crawl";
export type TechnicalObservation = {
  id: string;
  selector: string | null;
  property: string | null;
  value: string | null;
  asset_url: string | null;
};
export interface PageExtractor {
  model: string;
  extract(
    page: StoredCapture,
    observations: TechnicalObservation[],
    signal: AbortSignal,
  ): Promise<PageModelOutput & { tokensUsed?: number }>;
}
export class ExtractionFailure extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class ResponsesPageExtractor implements PageExtractor {
  private client: OpenAI;
  constructor(
    public readonly model: string,
    key: string,
    private readonly maxTokens = 12000,
  ) {
    this.client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 45000 });
  }
  async extract(
    page: StoredCapture,
    observations: TechnicalObservation[],
    signal: AbortSignal,
  ): Promise<PageModelOutput & { tokensUsed?: number }> {
    const schema = zodToJsonSchema(PageModelOutputSchema, {
      $refStrategy: "none",
    });
    const input = JSON.stringify({
      envelope: "UNTRUSTED_WEBSITE_DATA",
      prompt_version: PROMPT_VERSION,
      page_url: page.capture.finalUrl,
      segments: page.capture.segments,
      observations,
    });
    if (Buffer.byteLength(input) > 100000)
      throw new ExtractionFailure("input_budget");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.client.responses.create(
          {
            model: this.model,
            instructions: EXTRACTION_INSTRUCTIONS,
            input,
            max_output_tokens: this.maxTokens,
            text: {
              format: {
                type: "json_schema",
                name: "company_page_candidates",
                strict: true,
                schema: schema as Record<string, unknown>,
              },
            },
          },
          { signal },
        );
        return {
          ...parseExtractionResponse(response),
          tokensUsed:
            response.usage?.total_tokens === undefined
              ? undefined
              : response.usage.total_tokens +
                (attempt > 0
                  ? Buffer.byteLength(input) + this.maxTokens + 8000
                  : 0),
        };
      } catch (error) {
        if (
          error instanceof ExtractionFailure ||
          signal.aborted ||
          attempt === 1
        )
          throw error;
        const status = (error as { status?: number }).status;
        if (
          status !== 429 &&
          !(status && status >= 500) &&
          !(error instanceof OpenAI.APIConnectionError)
        )
          throw error;
      }
    }
    throw new ExtractionFailure("provider_unavailable");
  }
}

export function parseExtractionResponse(response: {
  status?: string;
  output?: unknown[];
  output_text?: string;
}): PageModelOutput {
  if (response.status !== "completed")
    throw new ExtractionFailure("incomplete_output");
  if (
    response.output?.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "message" &&
        "content" in item &&
        Array.isArray(item.content) &&
        item.content.some((c) => c.type === "refusal"),
    )
  )
    throw new ExtractionFailure("model_refusal");
  try {
    const parsed = PageModelOutputSchema.safeParse(
      JSON.parse(response.output_text ?? ""),
    );
    if (!parsed.success) throw new Error();
    return parsed.data as PageModelOutput;
  } catch {
    throw new ExtractionFailure("invalid_output");
  }
}
