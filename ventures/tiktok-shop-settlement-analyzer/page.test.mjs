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
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and the page never sends the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "hourslist"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files, so nothing is loaded from a network host", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page documents the model and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Reconciles/);
  assert.match(html, /estimates that depend entirely on the file you provide/);
});

test("page states the column names are assumed and matched by alias", () => {
  const html = page("index.html");
  assert.match(html, /matched by alias/);
  assert.match(html, /These are assumed names, not TikTok Shop's documented ones/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the option inputs are labelled", () => {
  const html = page("index.html");
  for (const id of ["feemode", "feepct", "from", "to", "cost", "hoursdefault", "target", "targethourly"]) assert.match(html, new RegExp(`<label for="${id}">`));
});

test("page states it is independent of TikTok Shop and links to sibling fee tools", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with TikTok Shop/);
  assert.match(html, /not sponsored, endorsed or connected to TikTok Shop, Inc\./);
  assert.match(html, /\.\.\/patreon-fee-calculator\//);
  assert.match(html, /\.\.\/upwork-earnings-fee-analyzer\//);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["csv_analyzed", "example_loaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("hours are never guessed: the page says so and per-hour output needs user input", () => {
  assert.match(page("index.html"), /the tool does not guess it/);
});
