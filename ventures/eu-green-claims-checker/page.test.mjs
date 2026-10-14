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

test("inputs have labels and nothing can send the figures anywhere", () => {
  const html = page("index.html");
  for (const id of ["role", "audience", "today", "generic", "offset", "future", "durability"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what it does not decide", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /national penalties/);
  assert.match(html, /sector-law conformity/);
});

test("every select option is a role, audience or claim the calculator knows", async () => {
  const { CLAIM_IDS, ROLES, AUDIENCES } = await import("./calc.mjs");
  const html = page("index.html");
  for (const r of ROLES) assert.match(html, new RegExp(`<option value="${r.id}">`));
  for (const a of Object.keys(AUDIENCES)) assert.match(html, new RegExp(`<option value="${a}">`));
  for (const id of CLAIM_IDS) assert.match(html, new RegExp(`<label for="${id}">`));
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

test("every input id the script reads exists, and every map key is a key the calculator reads", async () => {
  const html = page("index.html");
  const { SAMPLE } = await import("./calc.mjs");
  const map = html.match(/const map = \{([^}]*)\}/)[1];
  for (const [, id, key] of map.matchAll(/(\w+): "(\w+)"/g)) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.ok(key in SAMPLE, key);
  }
});

test("footer links the related EU tools and the page owns up to dates from memory", () => {
  const html = page("index.html");
  for (const slug of ["eu-packaging-regulation-checker", "gpsr-product-safety-checker", "eu-battery-regulation-checker", "eudr-scope-checker"]) assert.match(html, new RegExp(`href="\\.\\./${slug}/"`));
  assert.match(html, /written from memory/);
});

test("footer links the green claims copy scanner", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/eu-green-claims-copy-scanner\/"/);
});

test("footer links the ESPR readiness checker", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/eu-espr-readiness-checker\/"/);
});
