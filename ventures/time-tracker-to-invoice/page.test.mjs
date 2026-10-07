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
  assert.ok(blocks.find((b) => b["@type"] === "SoftwareApplication"));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 5);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("every static form control has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const id of ["t-client", "t-desc", "t-rate", "m-date", "m-client", "m-dur", "m-desc", "m-rate", "m-bill", "c-name", "c-rate", "c-email", "c-tax", "s-round", "s-currency", "s-next", "s-group", "f-range"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("user-typed text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  const script = html.slice(html.indexOf('<script type="module">'));
  // Text assigned with textContent, confirm() or a filename is not parsed as HTML; everything
  // else that interpolates a user-typed field must go through esc().
  const lines = script.split("\n").filter((l) => l.includes("${") && !/textContent|confirm\(|download\(|setTimeout/.test(l));
  for (const l of lines) {
    for (const m of l.matchAll(/\$\{([^}]*)\}/g)) {
      assert.doesNotMatch(m[1], /^(e|c|x|run)\.(desc|client|name|email|rate|taxRate|invoiceId|id)\b(?! \?)/, `unescaped: ${m[1]}`);
    }
  }
});

test("page states the storage caveat, the model and its limits", () => {
  const html = page("index.html");
  assert.match(html, /clearing browser data clears it/);
  assert.match(html, /Not modelled/);
  assert.match(html, /marked as billed|marked as invoiced|marks those entries/);
});

test("footer links the siblings that exist", () => {
  const html = page("index.html");
  for (const s of ["invoice-maker", "estimate-maker", "invoice-aging-late-payer-analyzer", "client-profitability-time-analyzer"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
