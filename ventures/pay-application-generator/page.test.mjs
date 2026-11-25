import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /Not affiliated with the American Institute of Architects/);
});

test("inputs have labels and nothing can send the schedule anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "ret", "sret", "reduce-at", "reduced", "prev", "project", "appno", "period", "contractor", "owner"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(page("sheet.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/);
  assert.doesNotMatch(page("workbook.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./sheet.mjs", "./usage.mjs", "./workbook.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what it does not decide and does not pose as the AIA form", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /not the AIA G702\/G703 form/);
  assert.match(html, /FAQPage/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

// pay-app-guides (2026-11-24) is the free front door for the pay-app billing
// bet; this is its inbound sibling link (platform/pages/siblings-budget.json).
test("index links one hop to the pay-app-guides sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/pay-app-guides\/"/);
});

test("next-month carry-forward is on the page and the suite pitch claims no sale or price", () => {
  const html = page("index.html");
  assert.match(html, /id="next-start"/);
  assert.match(html, /id="next-dl"/);
  assert.match(html, /next_period_started/);
  const suite = /<section class="card" id="suite">([\s\S]*?)<\/section>/.exec(html)[1];
  assert.match(suite, /in development/);
  assert.match(suite, /not on sale yet/);
  assert.doesNotMatch(suite, /\$\s?\d/);
  assert.match(suite, /https:\/\/marisstella\.app\/feedback\/\?type=idea&amp;tool=pay-application-generator/);
});

test("an Excel workbook can be chosen and the import is explained on the page", () => {
  const html = page("index.html");
  assert.match(html, /accept="\.xlsx,\.xlsm,\.csv/);
  assert.match(html, /id="import-notes"/);
  assert.match(html, /workbook_imported/);
  assert.match(html, /Can I use the Excel continuation sheet I already have\?/);
  assert.match(html, /"name": "Can I use the Excel continuation sheet I already have\?"/);
});

test("the Excel template section is on the page, tracked, and says it is not the AIA form", () => {
  const html = page("index.html");
  const sec = /<section class="card" id="template">([\s\S]*?)<\/section>/.exec(html)[1];
  assert.match(sec, /id="dl-template"/);
  assert.match(sec, /not the AIA G702\/G703 form/);
  assert.match(html, /id="dl-xlsx"/);
  for (const ev of ["workbook_downloaded", "template_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${ev}"\\)`));
    assert.match(html, new RegExp(`<code>${ev}</code>`));
  }
});
