import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOB_DEFAULTS, BID_DEFAULTS, SHARED_DEFAULTS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every default has a labelled input and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of Object.keys(SHARED_DEFAULTS)) assert.match(html, new RegExp(`<label for="${id}">`), id);
  for (let i = 0; i < 5; i++) for (const k of Object.keys(JOB_DEFAULTS)) assert.match(html, new RegExp(`<label for="j${i}_${k}">`), `j${i}_${k}`);
  for (let i = 0; i < 6; i++) for (const k of Object.keys(BID_DEFAULTS)) assert.match(html, new RegExp(`<label for="b${i}_${k}">`), `b${i}_${k}`);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states what it does not decide", () => {
  assert.match(page("index.html"), /Not decided/);
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

test("page says its defaults are placeholders and not any surety's rates", () => {
  assert.match(page("index.html"), /placeholders, not/i);
  assert.match(page("index.html"), /not your surety's rates/);
});

test("the page's tier defaults are the module's tier defaults", () => {
  const html = page("index.html");
  for (const [k, v] of Object.entries(SHARED_DEFAULTS)) {
    const m = html.match(new RegExp(`<input id="${k}" type="number" step="any" value="([^"]*)"`));
    assert.ok(m, k);
    assert.equal(Number(m[1]), v, k);
  }
});

test("FAQ in the markup and in the structured data are the same questions", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((j) => j["@type"] === "FAQPage");
  const shown = [...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].replace(/&#x27;/g, "'"));
  assert.deepEqual(ld.mainEntity.map((q) => q.name), shown);
});

test("a sibling page links here, so the page is not an orphan", () => {
  const sibling = readFileSync(new URL("../contractor-wip-schedule/index.html", import.meta.url), "utf8");
  assert.ok(sibling.includes('href="../surety-bond-capacity-calculator/"'));
});
