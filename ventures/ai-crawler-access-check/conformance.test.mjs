// Runs conformance-cases.mjs (RFC 9309 as Google's parser implements it)
// against audit.mjs. Old-vs-new scores: eval/conformance-2026-11-19.md.
import test from "node:test";
import assert from "node:assert/strict";
import { CASES } from "./conformance-cases.mjs";
import { parseRobotsTxt, isAllowed } from "./audit.mjs";

for (const g of CASES) {
  test(`conformance: ${g.group}`, () => {
    for (const [robots, agent, url, expected] of g.cases) {
      const got = isAllowed(parseRobotsTxt(robots).records, agent, url).allowed;
      assert.equal(got, expected, `${agent} ${url} on:\n${robots}`);
    }
  });
}

test("matcher stays fast on a pattern full of *", () => {
  const robots = `User-agent: GPTBot\nDisallow: /${"*a".repeat(200)}b\n`;
  const t = Date.now();
  isAllowed(parseRobotsTxt(robots).records, "GPTBot", "/" + "a".repeat(2000));
  assert.ok(Date.now() - t < 1000);
});
