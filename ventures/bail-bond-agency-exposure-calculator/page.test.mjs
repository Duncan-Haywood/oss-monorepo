import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("the page says it is not legal, tax, or financial advice and ships no schedule", () => {
  const html = page("index.html");
  assert.match(html, /Not legal, tax, or financial advice/);
  assert.match(html, /No premium schedule or forfeiture-deadline lookup/);
  assert.match(html, /does not decide who to bond/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every fixed input has a visible <label> and every table input an aria-label", () => {
  const html = page("index.html");
  for (const id of ["premium", "surety", "buf", "fta", "recovery", "limit", "reserve", "window", "today"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const l of ["Label", "Bond amount", "Premium rate percent", "Collateral held", "Next court date"]) assert.ok(html.includes(`"${l}"`), l);
  assert.match(html, /aria-label="Court-date call list"/);
});

test("the usage events are counted separately", () => {
  const html = page("index.html");
  for (const e of ["book_checked", "example_loaded", "list_copied"]) assert.match(html, new RegExp(`record\\("${e}"\\)`));
});

test("the FAQPage JSON-LD matches visible copy exactly", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${qa.name}</h3>`), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(`<p>${qa.acceptedAnswer.text}</p>`), `visible answer missing for: ${qa.name}`);
  }
  assert.equal(blocks.find((p) => p["@type"] === "SoftwareApplication").offers.price, "0");
});

test("no module in this venture can reach the network", () => {
  for (const src of [page("calc.mjs"), page("index.html")]) {
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
  }
});

test("the example in the page uses the terms the calc test counts by hand", () => {
  const html = page("index.html");
  for (const s of ['["premium", "10"]', '["surety", "20"]', '["buf", "10"]', '["fta", "5"]', '["recovery", "50"]', '["limit", "200000"]', '["reserve", "15000"]']) assert.ok(html.includes(s), s);
  assert.match(html, /face: 10000, col: 0, date: d\(8\)/);
  assert.match(html, /face: 50000, col: 25000, date: d\(49\)/);
  assert.match(html, /face: 5000, col: 5000, date: d\(-7\)/);
});

test("the linked sibling ventures exist", () => {
  for (const slug of ["business-insurance-policy-reader", "employee-cost-calculator"]) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${slug}/index.html`, import.meta.url)), slug);
  }
});
