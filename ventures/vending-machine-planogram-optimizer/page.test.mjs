import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHARED_DEFAULTS, PRODUCT_DEFAULTS, MAX_PRODUCTS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every input has a label or aria-label and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of Object.keys(SHARED_DEFAULTS)) assert.match(html, new RegExp(`<label for="${id}">`), id);
  for (let i = 0; i < MAX_PRODUCTS; i++) for (const k of Object.keys(PRODUCT_DEFAULTS)) assert.match(html, new RegExp(`id="p${i}_${k}"[^>]*aria-label=`), `p${i}_${k}`);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states what it does not decide and that its figures are placeholders", () => {
  assert.match(page("index.html"), /Not decided/);
  assert.match(page("index.html"), /placeholders, not/i);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const named = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});

test("a sibling restaurant tool links here, so the page is not an orphan", () => {
  const html = readFileSync(new URL("../vending-machine-route-margin/index.html", import.meta.url), "utf8");
  assert.ok(html.includes('href="../vending-machine-planogram-optimizer/"'));
});
