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

test("inputs have labels and nothing sends the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "sign", "order", "min", "summary"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("the inline script parses once its imports are removed", () => {
  const src = page("index.html").match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the page imports from calc.mjs is exported", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((n) => n.trim());
  const mod = await import("./calc.mjs");
  for (const n of names) assert.ok(n in mod, `${n} is not exported by calc.mjs`);
});

test("page documents the model and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Reconciles/);
  assert.match(html, /estimates that depend entirely on the files you provide/);
  assert.match(html, /unverified against real bank exports/);
});

test("page states it is independent of banks, issuers and services", () => {
  assert.match(page("index.html"), /Not affiliated with any bank, card issuer or service/);
  assert.match(page("index.html"), /not sponsored, endorsed or connected to any of them/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["csv_analyzed", "example_loaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("the sample-data button, the cancel what-if and the CSV download are wired", () => {
  const html = page("index.html");
  assert.match(html, /id="load-example"/);
  assert.match(html, /id="download"/);
  assert.match(html, /reportCsv\(last\)/);
  assert.match(html, /savings\(last, picked\)/);
});

test("page links reciprocally to the subscription price impact calculator, which links back", () => {
  assert.match(page("index.html"), /href="\.\.\/subscription-price-impact\/"/);
  const other = readFileSync(new URL("../subscription-price-impact/index.html", import.meta.url), "utf8");
  assert.match(other, /href="\.\.\/subscription-audit-from-statement\/"/);
});
