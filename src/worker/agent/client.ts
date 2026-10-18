import { logError } from "../../server/log";
import { loadCrawlAgentConfig } from "./config";

export interface CandidateLink {
  url: string;
  label: string;
}

export type LinkPicker = (pageUrl: string, candidates: CandidateLink[], remaining: number) => Promise<CandidateLink[]>;

const TIMEOUT_MS = 10_000;

/**
 * Asks an OpenAI-compatible chat completions endpoint which of the candidate links to visit next, best first.
 * Only links that were offered come back: anything else in the reply is ignored. Returns null when the reply
 * holds no usable link, so the caller keeps its normal order.
 */
export async function pickLinks(
  config: { apiKey: string; model: string; baseUrl: string; prompt: string },
  pageUrl: string,
  candidates: CandidateLink[],
  remaining: number,
  fetcher: typeof fetch = fetch,
): Promise<CandidateLink[] | null> {
  const response = await fetcher(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        { role: "system", content: config.prompt },
        { role: "user", content: JSON.stringify({ page: pageUrl, remainingPages: remaining, links: candidates }) },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`crawl agent request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }
  const parsed: unknown = JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  const urls = Array.isArray(parsed) ? parsed : (parsed as { links?: unknown } | null)?.links;
  if (!Array.isArray(urls)) {
    return null;
  }
  const byUrl = new Map(candidates.map((link) => [link.url, link]));
  const picked = new Set<CandidateLink>();
  for (const url of urls) {
    const link = typeof url === "string" ? byUrl.get(url) : undefined;
    if (link) {
      picked.add(link);
    }
  }
  return picked.size ? [...picked] : null;
}

/** Returns undefined when the agent is off, so the crawl runs exactly as it does without it. */
export function createLinkPicker(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): LinkPicker | undefined {
  const config = loadCrawlAgentConfig(env);
  if (config.status === "disabled") {
    return undefined;
  }
  if (config.status === "invalid") {
    logError(config.problem);
    return undefined;
  }
  let failed = false;
  return async (pageUrl, candidates, remaining) => {
    if (failed || !candidates.length) {
      return candidates;
    }
    try {
      return (await pickLinks(config, pageUrl, candidates, remaining, fetcher)) ?? candidates;
    } catch (error) {
      // One error per crawl; the rest of the crawl keeps its normal order.
      failed = true;
      logError("crawl agent failed; using the normal link order", { error: error instanceof Error ? new Error(error.name) : undefined });
      return candidates;
    }
  };
}
