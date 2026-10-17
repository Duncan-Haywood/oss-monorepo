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
  for (const id of ["x-date", "x-vendor", "x-amount", "x-cat", "x-biz", "x-note", "x-months", "i-file", "i-text", "r-year", "r-rate", "f-cat", "f-q", "restore"]) {
    assert.match(html, new RegExp(`<label for="${id}"`), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("user-typed text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  const script = html.slice(html.indexOf('<script type="module">'));
  const stmts = script.split(/\.innerHTML\s*=/).slice(1).map((t) => t.slice(0, t.search(/;\n/)));
  assert.ok(stmts.length >= 6);
  const safe = /^(esc\(|money\(|catOptions|y\b|r\.skipped|r\.bad|pending\.length|picked\.length|s\.missing|i\b|i \+ 1|rows\.map\(|pending\.map\(|s\.byMonth\.map\(|\[1, 2, 3, 4\]\.map\(|\["J"|years\(\)|p\b|v\b|m\b|Math\.round\(|e\.dup \?|e\.note \?|needsReceipt\(e\) \?|e\.receipt \?|errs\.map|warnings\(|r\.problem|\(m\)|\(e, i\)|\(r\)|\(p\)|\(v\)|\(y\)|\(e\))/;
  const raw = stmts.flatMap((t) => [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1])).filter((x) => !safe.test(x.trim()));
  assert.deepEqual(raw, []);
});

test("page states the storage caveat and what is not modelled", () => {
  const html = page("index.html");
  assert.match(html, /Clearing site data removes your entries/);
  assert.match(html, /Not modelled/);
  assert.match(html, /\$75/);
});

test("footer links the siblings that exist", () => {
  const html = page("index.html");
  for (const s of ["time-tracker", "invoice-maker", "mileage-log", "self-employed-schedule-c-categorizer", "home-office-deduction-calculator", "quarterly-estimated-tax-calendar"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("worksheet prints only itself and records a local event", () => {
  const html = page("index.html");
  assert.match(html, /id="sc-card"/);
  assert.match(html, /@media print/);
  assert.match(html, /worksheet_printed/);
});
