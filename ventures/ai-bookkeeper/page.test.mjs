import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const script = () => page("index.html").match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not modelled:/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
});

test("every form control has a label", () => {
  const html = page("index.html");
  for (const id of ["bank", "file", "auto", "paste", "invert", "dayfirst", "accept-min", "provider", "model", "apikey", "baseurl", "remember", "from", "to", "open", "rules", "coa"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
});

test("the page itself never calls the network; only the opt-in AI module may", () => {
  for (const f of ["engine.mjs", "bank.mjs", "ledger.mjs", "categorize.mjs", "example-data.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
  assert.doesNotMatch(script(), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(page("index.html"), /<script[^>]+src=["']https?:/);
});

test("statement text is never written as HTML", () => {
  assert.doesNotMatch(script(), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("the module scripts import only local files, and every imported name exists", async () => {
  const s = script();
  for (const m of s.matchAll(/import \{([^}]+)\} from "(\.\/[^"]+)"/g)) {
    const mod = await import(m[2]);
    for (const n of m[1].split(",").map((x) => x.trim())) assert.ok(n in mod, `${n} from ${m[2]}`);
  }
  assert.deepEqual([...s.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).filter((x) => !x.startsWith("./")), []);
});

test("the inline script parses once its imports are removed", () => {
  assert.doesNotThrow(() => new Function(script().replace(/^\s*import .*$/gm, "")));
});

test("every element id the script reads exists in the markup", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of script().matchAll(/\$\("#([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), `#${m[1]}`);
});

test("the measured claims on the page match the README", () => {
  const html = page("index.html"), readme = page("README.md");
  for (const claim of ["1,300 of 2,164", "542 of 642", "2,892 lines"]) { assert.ok(html.includes(claim), claim); assert.ok(readme.includes(claim), `README: ${claim}`); }
});

test("the invoice and bill loader and rule suggestions are wired to controls that exist", () => {
  const html = page("index.html");
  for (const id of ["docs-file", "docs-paste"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(script(), /addDocuments\(books/);
  assert.match(script(), /suggestRules\(books\)/);
});
