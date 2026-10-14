import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, SITUATIONS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /FAQPage/);
  assert.match(html, /ItemList/);
});

test("nothing can send the ticks anywhere", () => {
  assert.doesNotMatch(page("index.html"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module script imports only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("the static page lists every tool and every situation checkbox", () => {
  const html = page("index.html");
  for (const t of TOOLS) assert.ok(html.includes(`href="../${t[1]}/"`), t[1]);
  for (const [k] of SITUATIONS) assert.ok(html.includes(`value="${k}"`), k);
});

test("page says what it does not decide and tells the reader to verify", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /accountant or HMRC/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "summary_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("sibling tools linked from the page exist", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(readFileSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("the ItemList and every printed tool count match the catalogue", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const n = TOOLS.length;
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((j) => j["@type"] === "ItemList");
  assert.equal(ld.itemListElement.length, n);
  for (const m of html.matchAll(/\b(\d+) (?:free tools|UK tools)/g)) assert.equal(Number(m[1]), n, m[0]);
});
