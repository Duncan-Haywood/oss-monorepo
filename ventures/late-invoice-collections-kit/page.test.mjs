import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
});

test("inputs have labels and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const id of ["amount", "due", "today", "ctype", "state", "basis", "cmonthly", "annual", "flat", "grace", "cname", "inv", "you", "pay", "o1", "o2", "o3", "o4", "limit", "fee", "svc", "hours", "rate", "win", "coll", "afee", "arec", "summary"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
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

test("page is not legal advice, and marks state rates as reference to verify", () => {
  const html = page("index.html");
  assert.match(html, /This is not legal advice/);
  assert.match(html, /Verify with your state statute/);
  assert.match(html, /Not modelled/);
  assert.match(html, /Not affiliated with any court or agency/);
  assert.match(html, /not sponsored, endorsed or connected to any of them/);
});

test("the state select offers exactly the states the calculator has rates for, plus other", () => {
  const html = page("index.html");
  const opts = [...html.match(/<select id="state">([\s\S]*?)<\/select>/)[1].matchAll(/value="([A-Z]{2}|other)"/g)].map((m) => m[1]).sort();
  const calc = page("calc.mjs");
  const keys = [...calc.match(/export const STATE_RATES = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s{2}([A-Z]{2}):/gm)].map((m) => m[1]);
  assert.deepEqual(opts, [...keys, "other"].sort());
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["plan_built", "example_loaded", "ics_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("page links to the sibling tools it names, and those tools exist", () => {
  const html = page("index.html");
  for (const slug of ["invoice-aging-late-payer-analyzer", "invoice-payment-terms-calculator", "freelance-retainer-calculator", "client-profitability-time-analyzer"]) {
    assert.match(html, new RegExp(`href="\\.\\./${slug}/"`));
    assert.ok(readFileSync(new URL(`../${slug}/index.html`, import.meta.url), "utf8").length > 0);
  }
});

test("the plan downloads and copy buttons are wired", () => {
  const html = page("index.html");
  for (const id of ["build", "load-example", "download-ics", "download-txt", "copy"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /icsText\(last\.i, last\.p/);
});
