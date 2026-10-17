import { expect, it } from "vitest";
import { factualBullets } from "../../src/knowledge/narrative-prose";

const texts = (tail: string) => factualBullets(`We provide ${tail}`, "Lumen Ledger").map((bullet) => bullet.text);

it("neutralises slash-joined and dot-joined prose while keeping literal tokens", () => {
  expect(texts("tools for our/their clients.")).toEqual(["tools for its/their clients."]);
  expect(texts("tools for our/our clients.")).toEqual(["tools for its/its clients."]);
  expect(texts("tools for our/their/our clients.")).toEqual(["tools for its/their/its clients."]);
  expect(texts("tools for our.clients today.")).toEqual(["tools for its.clients today."]);
  expect(texts("tools for our clients at example.com/our-team.")).toEqual(["tools for its clients at example.com/our-team."]);
});
