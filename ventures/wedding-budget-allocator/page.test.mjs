import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { weddingPlan, CATEGORIES } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["budget", "guests", "region", "season"];

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every input has an id and a visible label", () => {
  const html = page("index.html");
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing label for ${id}`);
  }
});

test("a priority checkbox exists for every category", () => {
  const html = page("index.html");
  for (const c of CATEGORIES) assert.match(html, new RegExp(`class="prio" value="${c.key}"`), c.key);
});

test("page documents the model and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /7% is held back/);
  assert.match(html, /not quotes/);
});

test("worked example on the page lands in a sensible band", () => {
  const r = weddingPlan({ budget: 35000, guests: 100, region: "mid", season: "standard", priorities: ["photo", "music"] });
  assert.equal(r.band, "realistic");
  assert.ok(Math.abs(r.contingency - 2450) < 0.01);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
