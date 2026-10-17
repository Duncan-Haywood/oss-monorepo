import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULTS, PRESETS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, veterinary, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("every default has a labelled input and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const id of Object.keys(DEFAULTS)) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(html, /<label for="preset">/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("preset options match the PRESETS the calculator exports", () => {
  const html = page("index.html");
  for (const k of Object.keys(PRESETS)) assert.match(html, new RegExp(`<option value="${k}">`));
});

test("JSON-LD blocks parse and module script parses", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.equal(blocks.length, 2);
  for (const b of blocks) JSON.parse(b[1]);
  const mod = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  new Function(mod.replace(/^\s*import .*$/gm, "").replace(/export /g, ""));
});

test("page links to the veterinary siblings", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/veterinary-dental-estimate-calculator\/"/);
  assert.match(html, /href="\.\.\/veterinary-wellness-plan-pricing-calculator\/"/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
