import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, wage-data note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, payroll, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Wage data/);
  assert.match(html, /SSNs are masked to their last four digits/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page documents the model, its limits, and that the layout is read from memory", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /read by position from memory of the public SSA EFW2 specification/);
  assert.match(html, /no SSA validator was available/);
  assert.match(html, /never edits an RW/);
});

test("page states it is independent of SSA and the IRS", () => {
  assert.match(page("index.html"), /Not affiliated with SSA or the IRS/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_validated", "example_loaded", "controls_rebuilt"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("the wage-base table stated on the page matches the code", async () => {
  const { SS_WAGE_BASE } = await import("./calc.mjs");
  const html = page("index.html");
  assert.match(html, /\$184,500 for 2026, \$176,100 for 2025, \$168,600 for 2024/);
  assert.equal(SS_WAGE_BASE[2026], 184500);
  assert.equal(SS_WAGE_BASE[2025], 176100);
  assert.equal(SS_WAGE_BASE[2024], 168600);
});
