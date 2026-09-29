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
  assert.match(html, /information, not advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("inputs exist and each has a label", () => {
  const html = page("index.html");
  for (const id of ["filing", "people", "magi", "baseline", "planned", "partd", "hasPartD", "event", "estimate", "draft"]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, new RegExp(`<label for="${id}">`));
  }
});

test("page names the 2026 figures and says when they were checked", () => {
  const html = page("index.html");
  assert.match(html, /\$109,000/);
  assert.match(html, /\$218,000/);
  assert.match(html, /\$391,000/);
  assert.match(html, /\$202\.90/);
  assert.match(html, /checked 2026-09-29/);
  assert.match(html, /medicare\.gov/);
});

test("usage events are counted", () => {
  const html = page("index.html");
  assert.match(html, /record\("irmaa_calculated"\)/);
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

test("nothing can reach the network and there is no payment code", () => {
  for (const f of ["calc.mjs", "usage.mjs", "index.html"]) {
    const s = page(f);
    assert.doesNotMatch(s, /\bfetch\(/);
    assert.doesNotMatch(s, /XMLHttpRequest/);
    assert.doesNotMatch(s, /stripe|paypal/i);
  }
});

test("worked example in the page matches calc.mjs", async () => {
  const { analyze } = await import("./calc.mjs");
  const r = analyze({ filing: "single", lookbackMagi: 120_000, baselineMagi: 90_000, plannedAmount: 25_000 });
  assert.equal(r.next.roomUp, 17_000);
  assert.equal(r.planned.fits, false);
  assert.match(page("index.html"), /\$17,000 under the \$137,000 cliff/);
  assert.match(page("index.html"), /\$25,000 Roth conversion on top of \$90,000 would cross the \$109,000 cliff/);
});

test("links to sibling tools resolve", () => {
  const html = page("index.html");
  for (const s of ["roth-conversion-bracket-fill-calculator", "aca-subsidy-cliff-calculator"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
    readFileSync(new URL(`../${s}/index.html`, import.meta.url));
  }
});
