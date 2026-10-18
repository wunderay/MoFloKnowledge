import { describe, expect, it, vi } from "vitest";
import { loadCrawlAgentConfig } from "../../src/worker/agent/config";
import { pickLinks } from "../../src/worker/agent/client";

const env = {
  CRAWL_AGENT_ENABLED: "true",
  CRAWL_AGENT_API_KEY: "test-key-value",
  CRAWL_AGENT_MODEL: "some-model",
  CRAWL_AGENT_BASE_URL: "https://llm.example.com/v1/",
  CRAWL_AGENT_PROMPT: "pick.md",
};

describe("crawl agent config", () => {
  it("is off by default and unless the flag is exactly true", () => {
    expect(loadCrawlAgentConfig({}).status).toBe("disabled");
    expect(loadCrawlAgentConfig({ ...env, CRAWL_AGENT_ENABLED: "TRUE" }).status).toBe("disabled");
  });

  it("reports a problem without the key when enabled but incomplete", () => {
    const config = loadCrawlAgentConfig({ ...env, CRAWL_AGENT_API_KEY: "" }, () => "prompt");
    expect(config).toMatchObject({ status: "invalid" });
    expect(JSON.stringify(config)).toContain("CRAWL_AGENT_API_KEY");
    expect(JSON.stringify(loadCrawlAgentConfig(env, () => { throw new Error("missing"); }))).not.toContain("test-key-value");
  });

  it("requires an https base URL", () => {
    expect(loadCrawlAgentConfig({ ...env, CRAWL_AGENT_BASE_URL: "http://llm.example.com/v1" }, () => "p").status).toBe("invalid");
  });

  it("is ready with a complete setting and a prompt file", () => {
    expect(loadCrawlAgentConfig(env, () => "Choose links.")).toMatchObject({ status: "ready", baseUrl: "https://llm.example.com/v1" });
  });
});

describe("pickLinks", () => {
  const candidates = [
    { url: "https://example.com/about", label: "About" },
    { url: "https://example.com/team", label: "Team" },
  ];
  const config = { apiKey: "k", model: "m", baseUrl: "https://llm.example.com/v1", prompt: "p" };
  const reply = (content: string) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] })));

  it("keeps the agent's order and ignores links that were not offered", async () => {
    const fetcher = reply(JSON.stringify(["https://evil.example.net/x", "https://example.com/team", "https://example.com/about"]));
    const picked = await pickLinks(config, "https://example.com/", candidates, 5, fetcher);
    expect(picked?.map((link) => link.url)).toEqual(["https://example.com/team", "https://example.com/about"]);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://llm.example.com/v1/chat/completions");
  });

  it("returns null when nothing offered comes back", async () => {
    expect(await pickLinks(config, "https://example.com/", candidates, 5, reply('["https://other.example.org/"]'))).toBeNull();
  });
});
