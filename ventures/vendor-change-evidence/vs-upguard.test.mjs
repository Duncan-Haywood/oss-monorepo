import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./vs-upguard.html", import.meta.url), "utf8");

test("states both tools' scope without inventing UpGuard pricing", () => {
  assert.match(page, /UpGuard/);
  assert.match(page, /portfolio/i);
  assert.doesNotMatch(page, /UpGuard[^.]*\$\d/);
});

test("carries the not-affiliated disclaimer", () => {
  assert.match(page, /not affiliated with, endorsed by, or sponsored by UpGuard/i);
});

test("links back to the tool and the SEO explainer page", () => {
  assert.match(page, /href="\.\/"/);
  assert.match(page, /href="how-do-i-track-vendor-policy-changes\.html"/);
});

test("carries the no-warranty and nothing-leaves-your-browser clauses", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /Nothing leaves your browser/);
});

test("index.html links to the comparison page", () => {
  const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(index, /href="\.\/vs-upguard\.html"/);
});
