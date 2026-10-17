import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, payment-data note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, banking, payments, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Payment data/);
  assert.match(html, /IBANs are masked in the report/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "prior"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|DOMParser|import\(/);
});

test("the module scripts import only local files, so nothing is loaded from a network host", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^import /m);
});

test("page documents the model, its limits, and that reference data is from memory", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /read from memory of public sources/);
  assert.match(html, /no bank's own validator was available/);
  assert.match(html, /never edits an IBAN, an amount/);
});

test("page states it is independent of the EPC and banks", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with the EPC or any bank/);
  assert.match(html, /not sponsored, endorsed or connected to the European Payments Council/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_validated", "example_loaded", "file_repaired"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 1);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("every id the script reads exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([a-z-]+)"\)|getElementById\("([a-z-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 10);
  for (const id of used) assert.ok(ids.has(id), id);
});

test("the FAQ in the structured data matches the visible questions", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 6);
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("the footer links the pain.002 status reader for the bank's answer", () => {
  assert.match(page("index.html"), /href="\.\.\/sepa-pain002-status-reader\/"/);
});
