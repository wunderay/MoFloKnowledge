import { expect, it } from "vitest";
import { factualBullets } from "../../src/knowledge/narrative-prose";

const texts = (tail: string) => factualBullets(`We provide ${tail}`, "Lumen Ledger").map((bullet) => bullet.text);

it("neutralises slash-joined and dot-joined prose while keeping literal tokens", () => {
  expect(texts("tools for our/their clients.")).toEqual(["tools for its/their clients."]);
  expect(texts("tools for our/our clients.")).toEqual(["tools for its/its clients."]);
  expect(texts("tools for our/their/our clients.")).toEqual(["tools for its/their/its clients."]);
  expect(texts("tools for our clients at example.com/our-team.")).toEqual(["tools for its clients at example.com/our-team."]);
  expect(texts("tools for our clients at our.com today.")).toEqual(["tools for its clients at our.com today."]);
  expect(texts("tools for our clients at our.com.")).toEqual(["tools for its clients at our.com."]);
  for (const token of ["our.studio", "our.cloud", "our.xn--p1ai", "our.co.za", "our.com#top", "our.com#", "our.clients", "#our-team", "@our-brand",
    "@our.brand", "#our-team2", "#our-team's", "our@localhost", "our@example.com/our", "our.com…"]) {
    expect(texts(`tools for our clients at ${token}`).join(" ")).toBe(`tools for its clients at ${token}`);
  }
});

it("does not backtrack catastrophically on long punctuation runs", () => {
  for (const run of [`a${".".repeat(50000)}x`, "…".repeat(50000)]) {
    const started = performance.now();
    factualBullets(`We provide ${run}`, "Lumen Ledger");
    expect(performance.now() - started).toBeLessThan(200);
  }
});
