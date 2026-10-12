import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, financial-data note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, banking, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Financial data/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and nothing in the page or the code can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "kind", "date-order", "year", "layout", "out-date", "decimal"]) assert.match(html, new RegExp(`<label for="${id}">`));
  const net = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|navigator\.serviceWorker/;
  assert.doesNotMatch(html, net);
  for (const f of ["calc.mjs", "pdf-text.mjs", "pdf-parser.mjs", "inflate-browser.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), net, f);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./inflate-browser.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states its limits plainly: no OCR, untested on a library of real bank PDFs, layouts from memory", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /No OCR/);
  assert.match(html, /not on a library of real bank PDFs/);
  assert.match(html, /written from memory of their public import help/);
});

test("page states it is independent of banks and software vendors", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with any bank or software vendor/);
  assert.match(html, /not sponsored, endorsed or connected/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["statement_read", "example_loaded", "csv_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
  assert.ok(links.includes("bank-csv-to-qbo-converter"));
  for (const slug of links) assert.ok(existsSync(new URL(`../${slug}/VENTURE.yaml`, import.meta.url)), slug);
});

test("every FAQ question in the structured data is also visible on the page", () => {
  const html = page("index.html");
  const names = [...html.matchAll(/"name": ?"([^"]+\?)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 6);
  for (const n of names) assert.ok(html.includes(`<h3>${n}</h3>`), n);
});

test("every layout offered on the page exists in the code", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/<option value="(generic|split|xero|qbo3|qbo4)"/g)) assert.match(page("calc.mjs"), new RegExp(`${m[1]}:`));
});
