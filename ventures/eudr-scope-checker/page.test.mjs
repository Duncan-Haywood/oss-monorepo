import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /FAQPage/);
});

test("selects have labels and nothing can send the answers anywhere", () => {
  const html = page("index.html");
  for (const id of ["role", "size", "eu", "risk"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what it does not decide, including the date caveat", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /they have moved before/);
  assert.match(html, /8-digit/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "summary_downloaded", "csv_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("every option in calc.mjs has a checkbox or option on the page, and no extras", async () => {
  const html = page("index.html");
  const c = await import("./calc.mjs");
  for (const [name, list] of Object.entries({ products: c.PRODUCTS, outOfScope: c.OUT_OF_SCOPE })) {
    const onPage = [...html.matchAll(new RegExp(`name="${name}" value="(\\w+)"`, "g"))].map((m) => m[1]);
    assert.deepEqual(onPage.sort(), list.map((x) => x.id).sort(), name);
  }
  for (const list of [c.ROLES, c.SIZES, c.RISK, c.EU_LINK]) for (const r of list) assert.match(html, new RegExp(`<option value="${r.id}">`));
});

test("every flag id the script reads exists on the page", () => {
  const html = page("index.html");
  for (const id of ["eutr", "role", "size", "eu", "risk", "code-input"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("the sample loads through the same path the page uses", async () => {
  const { compute, SAMPLE } = await import("./calc.mjs");
  assert.equal(compute(SAMPLE).errors.length, 0);
});

test("footer links the NIS2 scope checker", () => {
  assert.match(page("index.html"), /href="\.\.\/nis2-scope-checker\/"/);
});
