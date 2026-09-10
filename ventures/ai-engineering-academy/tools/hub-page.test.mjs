// Page-level assertions for the electronics hub, which is this venture's
// published entry point (`ENTRY_OVERRIDES['ai-engineering-academy'] = 'tools'`
// in platform/pages/build.mjs), so it is served at /tools/ai-engineering-academy/
// and its sibling links resolve one level up, not two.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// Reciprocal of the link in 3d-print-price-calculator's footer: one maker, the
// printed enclosure and the circuit inside it.
test("hub links one hop to the 3d-print-price-calculator sibling", () => {
  assert.match(
    html,
    /href="\.\.\/3d-print-price-calculator\/"/,
    "hub must link ../3d-print-price-calculator/ so a maker reaches it in one hop",
  );
});

// Guards the depth the override implies. `../../<slug>/` would resolve above
// the catalogue root once published, producing a dead link that only a browser
// check would catch -- and only if it happened to crawl this page.
test("no sibling link escapes the catalogue root", () => {
  assert.doesNotMatch(
    html,
    /href="\.\.\/\.\.\/[a-z0-9-]+\//,
    "a ../../ sibling href would resolve above the published catalogue root",
  );
});
