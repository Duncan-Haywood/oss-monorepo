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

test("index page states this is not legal, tax, or financial advice", () => {
  assert.match(page("index.html"), /Not legal, tax, or financial advice/);
  assert.match(page("index.html"), /not legal, tax, or financial advice/);
});

test("the page says it does not read the lease and does not decide who is right", () => {
  assert.match(page("index.html"), /No lease reading/);
  assert.match(page("index.html"), /does not decide who is right/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every fixed input carries a visible <label> and table inputs an aria-label", () => {
  const html = page("index.html");
  for (const id of ["rate", "mode", "base", "art", "cap", "lsales", "billed", "paid", "sdate", "window", "osales", "tenant", "period", "clause"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
  assert.match(html, /aria-label="Amount included in gross sales"/);
  assert.match(html, /aria-label="Review note"/);
});

test("the usage events are counted separately", () => {
  const html = page("index.html");
  for (const e of ["statement_checked", "example_loaded", "note_copied"]) assert.match(html, new RegExp(`record\\("${e}"\\)`));
});

test("the FAQPage and SoftwareApplication JSON-LD matches visible copy exactly", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
  assert.equal(blocks.find((p) => p["@type"] === "SoftwareApplication").offers.price, "0");
});

test("no module in this venture can reach the network", () => {
  for (const src of [page("calc.mjs"), page("index.html")]) {
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
  }
});

test("the worked example in the page matches calc.mjs's own arithmetic", async () => {
  const html = page("index.html");
  const { auditPercentageRent } = await import("./calc.mjs");
  const r = auditPercentageRent({
    ratePct: 6, baseRent: 60000, landlordSales: 1250000, ownSales: 1240000, billed: 15600, paid: 0,
    statementDate: "2026-03-01", auditWindowDays: 90,
    exclusions: [{ label: "Refunds and returns", amount: 20000 }, { label: "Gift card sales", amount: 8000 }, { label: "Third-party delivery fees", amount: 5000, leaseExcludes: false }],
  });
  assert.equal(r.overcharge, 2880);
  assert.match(html, /\$\("#lsales"\)\.value = "1250000"; \$\("#billed"\)\.value = "15600"/);
  assert.match(html, /\$\("#osales"\)\.value = "1240000"/);
  assert.match(html, /\$\("#rate"\)\.value = "6"/);
  assert.match(html, /\$\("#base"\)\.value = "60000"/);
  assert.match(html, /label: "Refunds and returns", amount: 20000/);
  assert.match(html, /label: "Gift card sales", amount: 8000/);
  assert.match(html, /label: "Third-party delivery fees", amount: 5000, exclude: false/);
  assert.match(html, /\$\("#window"\)\.value = "90"/);
});

test("the linked sibling ventures exist", () => {
  for (const slug of ["commercial-lease-effective-rent-calculator", "commercial-lease-abstract-reader", "cam-reconciliation-check"]) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${slug}/index.html`, import.meta.url)), slug);
  }
});
