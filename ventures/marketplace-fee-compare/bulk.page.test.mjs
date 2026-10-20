import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./bulk.html", import.meta.url), "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

test("every element id the script reads exists in the markup", () => {
  for (const [, id] of script.matchAll(/el\("([^"]+)"\)/g)) assert.ok(ids.includes(id), id);
});

test("carries the disclaimers, support link, licence and opt-out", () => {
  for (const text of ["No warranty", "no SLA", "not tax, financial, or business advice", "Do Not Track", "sponsors/Duncan-Haywood", "MIT"]) {
    assert.ok(html.includes(text), text);
  }
});

test("renders user text only through escapeHtml and never counts content", () => {
  assert.ok(script.includes("escapeHtml(r.name)"));
  assert.ok(!/innerHTML\s*=\s*el\("catalog"\)/.test(script));
  assert.match(script, /recordUsage\(localStorage,[^;]*"catalog_compared"\)/);
});

test("has a title, description and canonical", () => {
  assert.match(html, /<title>[^<]{20,}<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{60,}"/);
  assert.match(html, /rel="canonical"/);
});
