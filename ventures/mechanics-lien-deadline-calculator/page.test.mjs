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
  assert.match(page("index.html"), /not legal, tax, or financial advice/);
});

test("the page warns that lien rights are lost by missing a deadline", () => {
  assert.match(page("index.html"), /lien rights are lost by missing a deadline/i);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every input and select carries a visible <label>", () => {
  const html = page("index.html");
  for (const id of ["state", "project-type", "first-date", "last-date", "completion-date", "noc-date", "today-date"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page names all five modeled states and does not pretend to cover others", () => {
  const html = page("index.html");
  for (const s of ["California", "Texas", "Florida", "Arizona", "Washington"]) assert.match(html, new RegExp(s));
  assert.match(html, /Five states only/);
});

test("the usage events are counted separately", () => {
  const html = page("index.html");
  assert.match(html, /record\("deadlines_checked"\)/);
  assert.match(html, /record\("example_loaded"\)/);
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
  const calc = page("calc.mjs");
  const html = page("index.html");
  for (const src of [calc, html]) {
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
  }
});

test("the worked example in the page script matches calc.mjs's own arithmetic", async () => {
  const html = page("index.html");
  const { lienDeadlines, formatDate } = await import("./calc.mjs");
  const r = lienDeadlines({ state: "TX", projectType: "commercial", firstFurnishing: "2026-08-03", lastFurnishing: "2026-09-18", today: "2026-09-30" });
  assert.equal(formatDate(r.prelim.date), "Sun, Nov 15, 2026");
  assert.equal(formatDate(r.prelim.safeDate), "Fri, Nov 13, 2026");
  assert.equal(formatDate(r.lien.date), "Fri, Jan 15, 2027");
  assert.match(html, /els\.state\.value = "TX"/);
  assert.match(html, /els\.first\.value = "2026-08-03"/);
  assert.match(html, /els\.last\.value = "2026-09-18"/);
  assert.match(html, /2026-11-15[^"]*2026-11-13[^"]*2027-01-15/);
});

test("the linked sibling ventures exist", () => {
  for (const slug of ["late-invoice-collections-kit", "change-order-margin-calculator"]) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${slug}/index.html`, import.meta.url)), slug);
  }
});
