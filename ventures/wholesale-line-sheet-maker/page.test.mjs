import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

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
  const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => !["imp-file", "import-file"].includes(id));
  assert.ok(ids.length >= 25);
  for (const id of ids) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("user-typed text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  // Every template that builds markup from user text interpolates it through esc().
  for (const start of ["function prodRow", "function renderSheet", "function renderOrderRows", "function renderKpis", "function updateOrder"]) {
    const from = html.indexOf(start);
    assert.ok(from > 0, start);
    const body = html.slice(from, html.indexOf("\n    }\n", from));
    const raw = [...body.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).filter((x) => !/^esc\(|^term\(|^tiers|^b\.notes \?|^p\.msrpCents \? esc\(|^rows\.map|^m\(|^cells\.map|^i === 4 && s\.flagged|^i === 3 && o\.units|^o\.warnings\.map/.test(x.trim()));
    assert.deepEqual(raw, [], start);
  }
  assert.doesNotMatch(html, /\.innerHTML\s*=\s*[^;`]*\b(p\.name|b\.name|b\.contact)\b(?!.*esc)/);
});

test("page states the storage caveat, the model and its limits", () => {
  const html = page("index.html");
  assert.match(html, /clearing browser data clears them/);
  assert.match(html, /Not modelled/);
  assert.match(html, /@media print/);
  assert.match(html, /makes no claim about what any marketplace charges/);
});

test("the printed line sheet never contains cost or margin columns", () => {
  const html = page("index.html");
  const sheet = html.slice(html.indexOf("function renderSheet"), html.indexOf("function refresh"));
  assert.doesNotMatch(sheet, /costCents|grossMargin|retailerMargin|netCents/);
});

test("footer links sibling tools that exist", () => {
  const html = page("index.html");
  for (const s of ["candle-batch-cost-calculator", "etsy-profit-calculator", "marketplace-fee-compare", "invoice-maker"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
    assert.ok(existsSync(new URL(`../${s}/index.html`, import.meta.url)), `${s} exists`);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("footer links to the wholesale vs retail pricing calculator", () => {
  assert.match(page("index.html"), /href="\.\.\/wholesale-vs-retail-pricing-calculator\/"/);
});
