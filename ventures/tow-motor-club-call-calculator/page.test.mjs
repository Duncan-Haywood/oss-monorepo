import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULTS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("page says rates vary by state and that it is arithmetic, not advice", () => {
  const html = page("index.html");
  assert.match(html, /vary by state and municipality/);
  assert.match(html, /Arithmetic on numbers you type/);
  assert.match(html, /Not affiliated with any motor club/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
});

test("every input and textarea has a label and the page makes no network calls", () => {
  const html = page("index.html");
  const ids = [...html.matchAll(/<(?:input|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 20);
  for (const id of ids) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|Date\.now|Math\.random/);
});

test("every default in calc.mjs that the form edits has a matching input with that value", () => {
  const html = page("index.html");
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (k === "afterHours") continue;
    assert.match(html, new RegExp(`id="${k}" value="${v}"`), k);
  }
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("the inline script parses once its imports are removed", () => {
  const src = page("index.html").match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("page documents the model and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Reconciles/);
  assert.match(html, /placeholders, not rates/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["call_evaluated", "batch_ranked"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("links the mobile tire van job picker, its one-van whole-day sibling", () => {
  assert.ok(page("index.html").includes('href="../mobile-tire-van-job-picker/"'));
});
