import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./how-to-answer-a-security-questionnaire.html", import.meta.url), "utf8");

test("guide links back to the tool and carries FAQ markup and disclaimers", () => {
  assert.match(html, /href="\.\/"/);
  assert.match(html, /FAQPage/);
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/);
  assert.match(html, /<link rel="canonical"/);
});

test("guide links sibling tools and makes no overclaims", () => {
  assert.match(html, /href="\.\.\/soc2-readiness-checker\/"/);
  assert.doesNotMatch(html, /guarantee|never miss|100% (accurate|compliant)|pass (your )?audit/i);
  assert.match(html, /heuristic/);
});
