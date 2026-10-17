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
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and the page never sends the files anywhere", () => {
  const html = page("index.html");
  for (const id of ["tx-file", "tx-paste", "orders-file", "orders-paste", "costs", "tp-rate"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("page documents the model and what it leaves out, and is not a Shopify-affiliated claim", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /estimates that depend entirely on the files you provide/);
  assert.match(html, /not affiliated with, endorsed by or sponsored by Shopify/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("page script parses and every element id it reads exists", () => {
  const html = page("index.html");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script.replace(/^\s*import .*$/gm, "").replace(/await /g, "")) && undefined, undefined);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of script.matchAll(/\$\("#([a-z-]+)"\)/g)) assert.ok(ids.has(m[1]), `missing #${m[1]}`);
});

test("the venture never calls out of the browser", () => {
  for (const f of ["calc.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\//);
});

test("page links to the inventory reorder planner", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/shopify-inventory-reorder-planner\/"/);
});
