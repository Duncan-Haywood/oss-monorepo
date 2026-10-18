import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal, or immigration advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /FAQPage/);
});

test("inputs have labels and nothing can send the answers anywhere", () => {
  const html = page("index.html");
  for (const id of ["stays", "taxYear", "priorResident", "exceptional", "fullTimeAbroad", "ukWorkDays", "ukFullTimeWork", "ukHome", "ukHomeDays", "overseasHome", "overseasHomeDays", "family", "accommodation", "prev1", "prev2", "mostElsewhere"]) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module script imports only local files", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what it does not decide and names HMRC's guidance", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /split-year/i);
  assert.match(html, /RDR3/);
});

test("every map id exists on the page and is read by the engine", async () => {
  const html = page("index.html");
  const { SAMPLE } = await import("./calc.mjs");
  const map = html.match(/const map = \{([^}]*)\}/)[1];
  const pairs = [...map.matchAll(/(\w+): "(\w+)"/g)];
  assert.ok(pairs.length >= 16);
  for (const [, id, key] of pairs) {
    assert.ok(html.includes(`id="${id}"`), id);
    assert.ok(key in SAMPLE, key);
  }
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "summary_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("robots and sitemap let crawlers find the page and the guide", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("sitemap.xml"), /uk-statutory-residence-test-ties-table\.html/);
});

test("sibling tools linked from the page exist", () => {
  for (const f of ["index.html", "uk-statutory-residence-test-ties-table.html"]) {
    for (const m of page(f).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(readFileSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
  }
});

test("the guide's tables and worked example are recomputed from the engine", async () => {
  const { TIE_TABLE, assess, SAMPLE } = await import("./calc.mjs");
  const html = page("uk-statutory-residence-test-ties-table.html");
  for (const kind of Object.keys(TIE_TABLE)) {
    for (const b of TIE_TABLE[kind]) if (b.needed) assert.ok(html.includes(`Resident with ${b.needed} or more ties`), `${kind} ${b.min}`);
  }
  const r = assess(SAMPLE);
  assert.ok(html.includes(`spends ${r.days} days in the UK`));
  assert.ok(html.includes(`${r.reduceBy} fewer days changes the answer`));
  assert.match(html, /No warranty/);
  assert.match(html, /FAQPage/);
});
