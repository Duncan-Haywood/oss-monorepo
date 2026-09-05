import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const page = readFileSync(new URL("./vs-printful.html", import.meta.url), "utf8");

test("the tool page links to its Printful comparison page", () => {
  assert.match(index, /href="vs-printful\.html"/);
});

test("the vs-Printful page names what each tool is for, disclaims affiliation, and carries the standard disclaimer", () => {
  assert.match(page, /<title>This tool vs\. Printful/);
  assert.match(page, /name="description"/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
  assert.match(page, /printful\.com/);
  assert.match(page, /rel="nofollow noopener"/);
  assert.match(page, /not affiliated with, endorsed by, or sponsored by Printful/i);
  assert.match(page, /No warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /GitHub Sponsors/);
});

test("no unverifiable price or resolution threshold is claimed for Printful", () => {
  // printful.com is not reachable from this session (the egress proxy blocks
  // arbitrary hosts), so no current price or published DPI/resolution
  // threshold could be confirmed against a primary source. Only Printful's
  // well-documented identity and category (print-on-demand fulfillment,
  // founded 2013, connected to a seller's own store) are stated -- same
  // discipline as the vs-jobber.html pages across the bid calculators.
  assert.doesNotMatch(page, /Printful[^.]*\$\d/);
  assert.doesNotMatch(page, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo|order)/i);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the comparison page links back to the tool and to the resolution walkthrough", () => {
  assert.match(page, /<a href="\.\/">/);
  assert.match(page, /href="what-resolution-do-i-need-to-print-my-artwork\.html"/);
});

test("the vs-Printful page never claims a network call, matching every other page on this static site", () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test("the vs-Printful page states artwork is never uploaded, same claim the tool itself makes", () => {
  assert.match(page, /never (leaves your device|uploaded|transmits the artwork)/i);
});
