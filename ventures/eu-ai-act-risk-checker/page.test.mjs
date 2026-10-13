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
  for (const id of ["role", "eu", "gpai"]) assert.match(html, new RegExp(`<label for="${id}">`));
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
  assert.match(html, /postponement has been proposed/);
  assert.match(html, /Article 6\(3\)/);
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
  const groups = { exclusions: c.EXCLUSIONS, prohibited: c.PROHIBITED, annex3: c.ANNEX_III, transparency: c.TRANSPARENCY };
  for (const [name, list] of Object.entries(groups)) {
    const onPage = [...html.matchAll(new RegExp(`name="${name}" value="(\\w+)"`, "g"))].map((m) => m[1]);
    assert.deepEqual(onPage.sort(), list.map((x) => x.id).sort(), name);
  }
  for (const r of c.ROLES) assert.match(html, new RegExp(`<option value="${r.id}">`));
  for (const g of c.GPAI) assert.match(html, new RegExp(`<option value="${g.id}">`));
});

test("every flag id the script reads exists on the page", () => {
  const html = page("index.html");
  for (const id of ["profiling", "narrow", "annex1", "openSource", "role", "eu", "gpai"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("the sample loads through the same path the page uses", async () => {
  const { compute, SAMPLE } = await import("./calc.mjs");
  assert.equal(compute(SAMPLE).errors.length, 0);
});

test("footer links the whistleblower channel checker", () => {
  assert.match(page("index.html"), /href="\.\.\/eu-whistleblower-channel-checker\/"/);
});

test("footer links the platform work and product liability directive checkers", () => {
  assert.match(page("index.html"), /href="\.\.\/eu-platform-work-directive-checker\/"/);
  assert.match(page("index.html"), /href="\.\.\/eu-product-liability-directive-checker\/"/);
});

test("footer links the DORA readiness checker", () => {
  assert.match(page("index.html"), /href="\.\.\/eu-dora-readiness-checker\/"/);
});
