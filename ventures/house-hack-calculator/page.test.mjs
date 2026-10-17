import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const IDS = ["loanType", "price", "downPct", "rate", "termYears", "units", "closingPct", "pmiOverridePct", "ownerUnitRent", "otherRents", "vacancyPct", "taxPct", "insuranceYr", "hoaMo", "utilitiesMo", "maintPct", "mgmtPct", "rentIfRenting", "liveYears", "holdYears", "rentGrowthPct", "appreciationPct", "sellCostPct"];

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /not a loan offer/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("every input has a label and the page never sends numbers anywhere", () => {
  const html = page("index.html");
  for (const id of IDS) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the script reads exactly the fields the page defines", () => {
  const html = page("index.html");
  const m = /const keys = \[(.*?)\]/s.exec(html);
  const keys = [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]);
  assert.deepEqual(keys, IDS);
  for (const k of keys) assert.match(html, new RegExp(`id="${k}"`));
});

test("page states the formulas and the limits", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /1\.75%/);
  assert.match(html, /self-sufficiency/);
});

test("JSON-LD blocks parse, the FAQ matches the visible questions, and the module script is valid", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.equal(blocks.length, 2);
  const [, faq] = blocks.map((b) => JSON.parse(b[1]));
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m);
  assert.doesNotThrow(() => new Function(m[1].replace(/^\s*import .*$/gm, "")));
});

test("the example runs end to end", async () => {
  const { plan, sampleInput } = await import("./calc.mjs");
  const r = plan(sampleInput());
  assert.ok(!r.error && r.years.length === 10);
});

test("sibling links resolve to real ventures", () => {
  for (const s of ["brrrr-calculator", "rental-dscr-calculator", "adu-payback-calculator", "rent-vs-buy-breakeven-calculator", "coast-fire-calculator"]) {
    assert.match(page("index.html"), new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(existsSync(new URL(`../${s}/index.html`, import.meta.url)), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
