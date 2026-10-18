import { readFileSync } from "node:fs";
import { join } from "node:path";

export type CrawlAgentConfig =
  | { status: "disabled" }
  | { status: "invalid"; problem: string }
  | { status: "ready"; apiKey: string; model: string; baseUrl: string; prompt: string };

type Env = Record<string, string | undefined>;

// A prompt is a plain file name under prompts/, never a path.
const PROMPT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function readPrompt(name: string): string {
  return readFileSync(join(process.cwd(), "prompts", name), "utf8");
}

/**
 * The crawl agent is off unless CRAWL_AGENT_ENABLED is exactly "true". When on, it needs an API key, a model,
 * an OpenAI-compatible base URL and a prompt file in prompts/. The problem text never contains the key.
 */
export function loadCrawlAgentConfig(env: Env = process.env, read: (name: string) => string = readPrompt): CrawlAgentConfig {
  if (env.CRAWL_AGENT_ENABLED !== "true") {
    return { status: "disabled" };
  }
  const apiKey = env.CRAWL_AGENT_API_KEY?.trim();
  const model = env.CRAWL_AGENT_MODEL?.trim();
  const baseUrl = env.CRAWL_AGENT_BASE_URL?.trim().replace(/\/+$/, "");
  const promptName = env.CRAWL_AGENT_PROMPT?.trim();
  const missing = [
    ["CRAWL_AGENT_API_KEY", apiKey],
    ["CRAWL_AGENT_MODEL", model],
    ["CRAWL_AGENT_BASE_URL", baseUrl],
    ["CRAWL_AGENT_PROMPT", promptName],
  ].flatMap(([name, value]) => (value ? [] : [name]));
  if (missing.length || !apiKey || !model || !baseUrl || !promptName) {
    return { status: "invalid", problem: `crawl agent is enabled but ${missing.join(", ")} is not set` };
  }
  if (!/^https?:\/\//i.test(baseUrl) || !URL.canParse(baseUrl)) {
    return { status: "invalid", problem: "CRAWL_AGENT_BASE_URL is not an http(s) URL" };
  }
  if (!PROMPT_NAME.test(promptName)) {
    return { status: "invalid", problem: "CRAWL_AGENT_PROMPT must be a file name in prompts/" };
  }
  let prompt: string;
  try {
    prompt = read(promptName);
  } catch {
    return { status: "invalid", problem: `prompts/${promptName} could not be read` };
  }
  if (!prompt.trim()) {
    return { status: "invalid", problem: `prompts/${promptName} is empty` };
  }
  return { status: "ready", apiKey, model, baseUrl, prompt };
}
