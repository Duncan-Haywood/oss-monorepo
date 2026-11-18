import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, independence note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Independent of the IRS/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "exp-records", "exp-total"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page and calc state every rule is from memory and unverified", () => {
  const html = page("index.html");
  assert.match(html, /from memory of public IRS IRIS template \/ Pub 5717-style guidance; unverified/);
  assert.match(html, /Not checked/);
  assert.match(html, /never changes a name, an address or an amount's value/);
  assert.match(page("calc.mjs"), /UNVERIFIED/);
  assert.match(page("VENTURE.yaml"), /from memory of public IRS IRIS template \/ Pub 5717-style guidance; unverified/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_checked", "example_loaded", "fixes_applied"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("the template's key columns are named on the page", async () => {
  const { TEMPLATE_NEC, TEMPLATE_MISC } = await import("./calc.mjs");
  const html = page("index.html").replace(/&amp;/g, "&");
  for (const c of ["Form Type", "Tax Year", "Payer TIN Type", "Payer Taxpayer ID Number", "Recipient Name Type", "Recipient Address Line 1", "Form Account Number", "2nd TIN Notice", "Box 1 - Nonemployee Compensation", "Combined Federal/State Filing (CF/SF)"]) { assert.ok(TEMPLATE_NEC.includes(c), c); assert.ok(html.includes(c), c); }
  assert.ok(TEMPLATE_MISC.includes("Box 1 - Rents") && html.includes("Box 1 - Rents"));
  assert.ok(html.includes(`${TEMPLATE_NEC.length} columns`) && html.includes(`${TEMPLATE_MISC.length} (A to BL)`));
});
