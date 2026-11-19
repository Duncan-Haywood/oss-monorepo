import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "gtfs-errors-explained.html"];

test("every page carries the disclaimer, independence note and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /Not affiliated with any platform/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
    assert.match(html, /<script type="application\/ld\+json">/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("neither the page nor the engine can send the feed anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "today"]) assert.match(html, new RegExp(`<label for="${id}">`));
  for (const src of [html, page("calc.mjs"), page("zip.mjs")]) assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ["./calc.mjs", "./usage.mjs", "./zip.mjs"]);
});

test("the page names its source and what it does not check", () => {
  const html = page("index.html");
  assert.match(html, /GTFS Schedule Reference \(revised 2026-04-27\)/);
  assert.match(html, /Not checked yet/);
  assert.match(html, /MobilityData GTFS Validator/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["feed_checked", "example_loaded", "findings_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("the explainer lists every finding code the engine can emit", () => {
  const codes = new Set([...page("calc.mjs").matchAll(/F\.add\("(?:error|warning|info)", "([a-z0-9_]+)"/g)].map((m) => m[1]));
  for (const t of ["url", "email", "timezone", "lang", "lat", "lon", "color", "date", "time", "uint", "pint", "float", "ufloat", "enum"]) codes.add(`invalid_${t}`);
  codes.delete("invalid_route_type"); // route_type is checked by its own rule
  const html = page("gtfs-errors-explained.html");
  const missing = [...codes].filter((c) => !html.includes(`<code>${c}</code>`));
  assert.deepEqual(missing, []);
});

test("robots and sitemap let crawlers find both pages", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  for (const p of PAGES) assert.match(page("sitemap.xml"), new RegExp(p.replace(".", "\\.")));
});
