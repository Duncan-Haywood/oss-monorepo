import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const IDS = ["spend", "leads", "booked", "show", "extra", "target-roi", "fixed", "segments"];

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
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

test("every input has a matching visible label", () => {
  const html = page("index.html");
  for (const id of IDS) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing label for ${id}`);
  }
});

test("usage events are counted and the opt-out is wired", () => {
  const html = page("index.html");
  assert.match(html, /record\("patients_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
  assert.match(html, /id="optout"/);
});

test("the page makes no network calls", () => {
  const all = page("index.html") + page("calc.mjs") + page("usage.mjs");
  assert.doesNotMatch(all, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("FAQ JSON-LD matches visible copy", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), qa.name);
    assert.ok(html.includes(qa.acceptedAnswer.text), qa.name);
  }
  assert.ok(blocks.find((p) => p["@type"] === "SoftwareApplication"));
});

test("hidden grids stay hidden (.grid[hidden])", () => {
  assert.match(page("index.html"), /\.grid\[hidden\]/);
});

test("the page states what it does not cover", () => {
  const html = page("index.html");
  assert.match(html, /Referrals and word of mouth/);
  assert.match(html, /Clinical appropriateness/);
});
