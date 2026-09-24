import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /s-corp-reasonable-compensation-calculator\/<\/loc>/);
});

test("the page reads every field estimateReasonableCompensation accepts", () => {
  const html = page("index.html");
  for (const id of [
    "net-profit", "capital-invested", "required-return", "tax-year", "filing-status", "hours-per-week",
    "duty1-occupation", "duty1-percent", "duty2-occupation", "duty2-percent", "duty3-occupation", "duty3-percent",
    "optout",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /import \{ estimateReasonableCompensation, money, OCCUPATION_WAGES \} from "\.\/calc\.mjs"/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  const ids = [
    "net-profit", "capital-invested", "required-return", "tax-year", "filing-status", "hours-per-week",
    "duty1-occupation", "duty1-percent", "duty2-occupation", "duty2-percent", "duty3-occupation", "duty3-percent",
  ];
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}"`), `missing <label for="${id}">`);
  }
});

test("the FAQPage JSON-LD matches the visible common-questions text verbatim", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD");
  assert.ok(faq.mainEntity.length >= 4);
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(html.includes(name), `question not found verbatim: ${name}`);
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test("the SoftwareApplication JSON-LD is well-formed and free", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const app = blocks.find((b) => b["@type"] === "SoftwareApplication");
  assert.ok(app, "missing SoftwareApplication JSON-LD");
  assert.equal(app.offers.price, "0");
});

test("the worked example in the load-example button matches a real scenario", () => {
  const html = page("index.html");
  assert.match(html, /els\.netProfit\.value = "300000"/);
  assert.match(html, /els\.duty1Occ\.value = "general-operations-manager"/);
});

test("clicking calculate records range_calculated, not a different event name", () => {
  const html = page("index.html");
  assert.match(html, /record\("range_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("index links the qbi-deduction-calculator sibling in one hop", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/qbi-deduction-calculator\/"/);
});

test("the BLS reference-table caveat and the not-a-determination caveat both appear in visible copy", () => {
  const html = page("index.html");
  assert.match(html, /bls\.gov\/oes/);
  assert.match(html, /[Nn]ot a determination/);
});

test("occupation dropdowns are populated with every reference wage entry", () => {
  const html = page("index.html");
  assert.match(html, /import \{ estimateReasonableCompensation, money, OCCUPATION_WAGES \} from "\.\/calc\.mjs"/);
  assert.match(html, /OCCUPATION_WAGES\.map/);
});
