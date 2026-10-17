import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rateOutcome } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["truck-payment", "insurance", "driver-hourly", "billable-hours", "fuel-price", "mpg", "maint-per-mile",
  "hookup", "included-miles", "rate-per-mile", "loaded-miles", "deadhead-miles", "avg-mph", "on-scene-minutes",
  "after-hours-fee", "weather-fee", "winch-fee", "winch-minutes", "storage-days", "storage-fee", "storage-cost", "target-margin"];

test("index page carries the disclaimer, regulation caveat, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /rotation-list/);
  assert.match(html, /private-property/);
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

test("page documents the model and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /true cost/);
});

test("worked example on the page matches the calculator", () => {
  const r = rateOutcome({});
  assert.equal(r.trueCost, 81);
  assert.equal(r.revenue, 185);
  assert.match(page("index.html"), /\$81\.00/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
