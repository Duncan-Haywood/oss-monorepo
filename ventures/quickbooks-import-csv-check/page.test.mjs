import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, independence note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Not affiliated with Intuit/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["kind", "file", "paste"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states what is read from memory and what is not checked", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /read from memory of Intuit's public import help pages/);
  assert.match(html, /a clean result is not a promise/i);
});

test("every import kind in the code is a choice on the page", async () => {
  const { KINDS } = await import("./calc.mjs");
  const html = page("index.html");
  for (const id of Object.keys(KINDS)) assert.ok(html.includes(`value="${id}"`), id);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_checked", "example_loaded", "fixes_applied", "split_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("related venture pages link back to this tool", () => {
  for (const slug of ["bank-csv-to-qbo-converter", "1099-vendor-csv-checker", "xero-invoice-csv-check"]) {
    assert.match(readFileSync(new URL(`../${slug}/index.html`, import.meta.url), "utf8"), /href="\.\.\/quickbooks-import-csv-check\/"/, slug);
  }
});

test("the FAQ in the structured data matches the visible questions", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((o) => o["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 6);
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
