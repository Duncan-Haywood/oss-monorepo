import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const pages = ["index.html", "can-an-owner-operator-deduct-per-diem.html"];

test("every page carries the no-warranty clause, a not-tax-advice line and independence from IRS, GSA and DOT", () => {
  for (const p of pages) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not (legal, )?tax/i, p);
    assert.match(html, /not affiliated with[^.]*IRS/i, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
});

test("the index tells the reader to verify rates and rules and does not assert W-2 rules", () => {
  const html = page("index.html");
  assert.match(html, /verify[^.]*current GSA[^.]*IRS/i);
  assert.match(html, /verify; rules changed under 2025 legislation/);
  assert.match(html, /\$80/);
  assert.match(html, /\$86/);
  assert.match(html, /80%/);
  assert.match(html, /75%/);
  assert.match(html, /15\.3%/);
});

test("nothing can be sent anywhere, and scripts import only local files", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
});

test("inputs are labelled and every id the script reads exists", () => {
  const html = page("index.html");
  const ids = ["fullDays", "partialDays", "dailyRate", "partialPct", "dotPct", "receipts", "netProfit", "otherWages", "wageBase", "marginalRate"];
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}">`), id);
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  for (const id of ["hero", "verdict", "optout"]) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["per_diem_calculated", "example_loaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`), e);
    assert.match(html, new RegExp(`<code>${e}</code>`), e);
  }
});

test("both siblings are cross-linked, and related links point at ventures that exist", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/owner-operator-cpm-calculator\/"/);
  assert.match(html, /href="\.\.\/ifta-quarterly-fuel-tax-calculator\/"/);
  const article = page("can-an-owner-operator-deduct-per-diem.html");
  assert.match(article, /href="\.\/"/);
  for (const m of [...html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)]) {
    assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
  }
  assert.match(html, /can-an-owner-operator-deduct-per-diem\.html/);
});

test("robots and sitemap let crawlers find both pages", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  const s = page("sitemap.xml");
  assert.match(s, /index\.html/);
  assert.match(s, /can-an-owner-operator-deduct-per-diem\.html/);
});
