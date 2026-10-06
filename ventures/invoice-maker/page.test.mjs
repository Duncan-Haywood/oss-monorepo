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
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("every static form control has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const id of ["f-name", "f-email", "f-addr", "f-taxid", "c-name", "c-email", "c-addr", "i-number", "i-issued", "i-terms", "i-custom", "i-due", "i-currency", "i-tax", "i-dtype", "i-dval", "i-ship", "i-paid", "i-pay", "i-notes", "i-latepct", "i-lateflat"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("user-typed text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  // every template interpolation of an invoice field inside the preview goes through esc()
  const preview = html.slice(html.indexOf("function renderPreview"), html.indexOf("function renderDash"));
  const raw = [...preview.matchAll(/\$\{(?!esc\(|m\(|inv\.discountType|inv\.payInstructions \?|inv\.notes \?|inv\.fromTaxId \?|t\.discount \?|t\.shipping \?|t\.paid \?|Number\(inv\.taxRate\) \?|rows|disc)([^}]*)\}/g)].map((m) => m[1]);
  assert.deepEqual(raw, []);
});

test("page states the storage caveat, the model and its limits", () => {
  const html = page("index.html");
  assert.match(html, /clearing browser data clears them/);
  assert.match(html, /Not modelled/);
  assert.match(html, /@media print/);
});

test("footer links sibling invoice tools", () => {
  const html = page("index.html");
  for (const s of ["late-invoice-collections-kit", "invoice-aging-late-payer-analyzer", "invoice-payment-terms-calculator", "einvoice-preflight"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
