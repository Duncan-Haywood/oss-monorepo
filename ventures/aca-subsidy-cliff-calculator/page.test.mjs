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
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("inputs exist and each has a label", () => {
  const html = page("index.html");
  for (const id of ["household", "region", "magi", "benchmark", "plan", "deductions"]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, new RegExp(`<label for="${id}">`));
  }
});

test("page names the 2026 cliff figures", () => {
  const html = page("index.html");
  assert.match(html, /\$62,600/);
  assert.match(html, /\$84,600/);
  assert.match(html, /Rev\. Proc\. 2025-25/);
});

test("usage events are counted", () => {
  const html = page("index.html");
  assert.match(html, /record\("credit_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("FAQPage JSON-LD matches visible copy exactly", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), qa.name);
    assert.ok(html.includes(qa.acceptedAnswer.text), qa.name);
  }
  assert.equal(blocks.find((p) => p["@type"] === "SoftwareApplication").offers.price, "0");
});

test("nothing can reach the network", () => {
  for (const f of ["calc.mjs", "usage.mjs", "index.html"]) {
    const s = page(f);
    assert.doesNotMatch(s, /\bfetch\(/);
    assert.doesNotMatch(s, /XMLHttpRequest/);
  }
});

test("worked example in the page matches calc.mjs", async () => {
  const { analyze } = await import("./calc.mjs");
  const r = analyze({ magi: 68_000, benchmarkMonthly: 620, planMonthly: 540, deductionsAvailable: 8_000 });
  assert.equal(r.overBy, 5_400);
  assert.equal(r.credit, 0);
  assert.match(page("index.html"), /\$5,400 over the \$62,600 cliff/);
});

test("links to sibling tools resolve", () => {
  const html = page("index.html");
  for (const s of ["hsa-contribution-limit-calculator", "solo-401k-contribution-calculator"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
    readFileSync(new URL(`../${s}/index.html`, import.meta.url));
  }
});
