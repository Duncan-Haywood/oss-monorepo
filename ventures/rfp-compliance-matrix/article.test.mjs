import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./how-to-build-an-rfp-compliance-matrix.html", import.meta.url), "utf8");

test("guide links back to the tool and carries FAQ markup and disclaimers", () => {
  assert.match(html, /href="\.\/"/);
  assert.match(html, /FAQPage/);
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/);
  assert.match(html, /<link rel="canonical"/);
});

test("guide links the sibling tender tools", () => {
  assert.match(html, /href="\.\.\/tender-bid-readiness\/"/);
  assert.match(html, /href="\.\.\/tender-radar\/"/);
});

test("guide makes no overclaims", () => {
  assert.doesNotMatch(html, /guarantee|never miss|100% (accurate|compliant)/i);
  assert.match(html, /heuristic/);
});
