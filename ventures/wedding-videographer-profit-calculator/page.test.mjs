import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /not legal, tax, or financial advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every static input has a visible label", () => {
  const html = page("index.html");
  for (const id of ["price", "target", "procPct", "shoot", "travelH", "prep", "editHi", "editCer", "editSp", "revInc", "revUsed", "revHrs", "revFee", "ssHrs", "ssRate", "travelC", "gear", "bookings", "delivery"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
    assert.match(html, new RegExp(`<label for="${id}">`), id);
  }
});

test("dynamic tier rows label every input they create", () => {
  const html = page("index.html");
  for (const k of ["tn", "tp", "te"]) assert.match(html, new RegExp(`<label for="${k}\\$\\{n\\}">`));
});

test("JSON-LD FAQ matches the visible copy exactly and the app is free", () => {
  const html = page("index.html");
  const parsed = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), qa.name);
    assert.ok(html.includes(qa.acceptedAnswer.text), qa.name);
  }
  assert.equal(parsed.find((p) => p["@type"] === "SoftwareApplication").offers.price, "0");
});

test("usage events are recorded and the script cannot reach the network", () => {
  const html = page("index.html");
  for (const e of ["profit_calculated", "example_loaded", "tier_added"]) assert.match(html, new RegExp(`record\\("${e}"\\)`));
  assert.doesNotMatch(html, /\bfetch\(|XMLHttpRequest/);
  assert.doesNotMatch(page("calc.mjs"), /\bfetch\(|XMLHttpRequest/);
});

test("the page tells the visitor the example figures are unverified", () => {
  assert.match(page("index.html"), /not verified/);
  assert.match(page("index.html"), /unverified approximations/);
});
