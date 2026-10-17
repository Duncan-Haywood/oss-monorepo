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

test("index page states this is not insurance, legal, tax, or financial advice", () => {
  assert.match(page("index.html"), /Not insurance, legal, tax, or financial advice/);
  assert.match(page("index.html"), /not legal, tax, or financial advice/);
});

test("the page says it ships no rates and does not decide who is right", () => {
  assert.match(page("index.html"), /No rate or class-code lookup/);
  assert.match(page("index.html"), /does not decide who is right/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every fixed input carries a visible <label> and table inputs an aria-label", () => {
  const html = page("index.html");
  for (const id of ["mod", "schedule", "discount", "surcharge", "otmult", "policy"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
  assert.match(html, /cell\("c-apay", "Audited payroll"/);
  assert.match(html, /aria-label="Dispute note"/);
});

test("the usage events are counted separately", () => {
  const html = page("index.html");
  for (const e of ["audit_checked", "example_loaded", "note_copied"]) assert.match(html, new RegExp(`record\\("${e}"\\)`));
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
  const { auditDispute } = await import("./calc.mjs");
  const r = auditDispute({
    mod: 1.1,
    classes: [{ label: "Roofing", auditedPayroll: 300000, rate: 20, auditedOvertime: 0, ownPayroll: 300000, ownOvertime: 30000 }],
    subs: [{ label: "Ace Electric", amount: 40000, rate: 6, certificate: true }],
    officers: [{ name: "Owner", auditedPayroll: 150000, minPayroll: 50000, maxPayroll: 120000, rate: 20 }],
  });
  assert.equal(r.claimable, 11440);
  assert.match(html, /apay: 300000, rate: 20, aot: 0, opay: 300000, oot: 30000/);
  assert.match(html, /amt: 40000, rate: 6, cert: true/);
  assert.match(html, /pay: 150000, min: 50000, max: 120000, rate: 20/);
  assert.match(html, /\$\("#mod"\)\.value = "1\.10"/);
});

test("the linked sibling ventures exist", () => {
  for (const slug of ["workers-comp-premium-calculator", "coi-expiry-gap-checker", "employee-cost-calculator", "business-insurance-policy-reader"]) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${slug}/index.html`, import.meta.url)), slug);
  }
});
