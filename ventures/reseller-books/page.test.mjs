import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
});

test("inputs have labels", () => {
  const html = page("index.html");
  for (const id of ["files", "costlist", "feemode", "summary"]) assert.match(html, new RegExp(`<label for="${id}">`));
});

test("the page imports only local modules and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./books.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import[\s\S]*?from .*$/gm, "")));
});

test("page documents the model, reconciliation and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Reconciles/);
  assert.match(html, /estimates that depend entirely on the file you provide/);
  assert.match(html, /matched by alias from memory of each export/);
});

test("page states independence from all four marketplaces and links the single-channel analyzers", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with eBay, Etsy, Poshmark or Whatnot/);
  for (const s of ["ebay-transaction-report-analyzer", "etsy-statement-profit-analyzer", "poshmark-sales-report-analyzer", "whatnot-sales-report-analyzer"]) assert.match(html, new RegExp(`\\.\\./${s}/`));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["books_built", "example_loaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
