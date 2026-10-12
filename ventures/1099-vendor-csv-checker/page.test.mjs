import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, taxpayer-data note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, payroll, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Taxpayer data/);
  assert.match(html, /TINs are masked to their last four digits/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "year"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states it is independent of the IRS and what it does not check", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with the IRS/);
  assert.match(html, /Not checked/);
  assert.match(html, /only the IRS TIN Matching program/);
});

test("thresholds stated on the page match the code", async () => {
  const { NEC_THRESHOLD, BACKUP_WITHHOLDING_RATE } = await import("./calc.mjs");
  const html = page("index.html");
  assert.match(html, /\$2,000 for payments made after 2025, \$600 for 2025 and earlier/);
  assert.match(html, /2026 \(threshold \$2,000\)/);
  assert.match(html, /2025 \(threshold \$600\)/);
  assert.equal(NEC_THRESHOLD[2026], 2000);
  assert.equal(NEC_THRESHOLD[2025], 600);
  assert.equal(BACKUP_WITHHOLDING_RATE, 0.24);
  assert.match(html, /24%/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const named = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]);
  assert.deepEqual(named.sort(), ["example_loaded", "file_checked", "list_downloaded"]);
  for (const ev of named) assert.match(html, new RegExp(`record\\("${ev}"\\)`));
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([^/"]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("links to the Xero invoice CSV check, its sibling pre-flight tool", () => {
  assert.match(page("index.html"), /href="\.\.\/xero-invoice-csv-check\/"/);
});
