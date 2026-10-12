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

test("structured data parses and the FAQ in JSON-LD matches the visible FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 5);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("every static form control has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const id of ["t-project", "t-desc", "m-project", "m-date", "m-dur", "m-desc", "r-range", "s-rate", "s-round", "s-currency", "s-name"]) {
    assert.match(html, new RegExp(`<label for="${id}"`), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("user-typed text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  const script = html.slice(html.indexOf('<script type="module">'));
  // every ${...} inside an innerHTML assignment must be escaped, a money/hours formatter, or arithmetic/flags
  const stmts = script.split(/\.innerHTML\s*=/).slice(1).map((t) => t.slice(0, t.search(/;\n/)));
  assert.ok(stmts.length >= 6);
  const safe = /^(esc\(|money\(|hours\(|Math\.round\(|c\.unbilled > 0|e\.billed \?|e\.billable === false \?|run \?|\["Mon"|data\.settings\.name \?|sel\.value \?|inc$|t\.rows\.map\(|r\.billable \?)/;
  const raw = stmts.flatMap((t) => [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1])).filter((x) => !safe.test(x.trim()) && !/^(ids\.size)$/.test(x.trim()));
  assert.deepEqual(raw, []);
});

test("page states the storage caveat, the rounding rule and its limits", () => {
  const html = page("index.html");
  assert.match(html, /Clearing site data removes it/);
  assert.match(html, /Not modelled/);
  assert.match(html, /rounded up to your increment/);
});

test("footer links the invoice and estimate siblings that exist", () => {
  const html = page("index.html");
  for (const s of ["invoice-maker", "estimate-maker", "client-profitability-time-analyzer", "quote-margin-check"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("printable timesheet prints only itself and records a local event", () => {
  const html = page("index.html");
  assert.match(html, /id="timesheet-card"/);
  assert.match(html, /@media print/);
  assert.match(html, /<label for="ts-client"/);
  assert.match(html, /timesheet_printed/);
});
