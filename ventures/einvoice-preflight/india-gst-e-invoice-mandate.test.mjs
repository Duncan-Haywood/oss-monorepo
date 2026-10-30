import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./india-gst-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the thresholds and the scope limit", () => {
  assert.match(html, /₹5 crore/);
  assert.match(html, /₹10 crore/);
  assert.match(html, /INV-01/);
  assert.match(html, /No\. India uses its own INV-01/);
});

test("makes no price claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/india-gst-e-invoice-mandate\.html">/);
});

test("FAQPage schema is valid JSON and matches visible h3 headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context".*?\})<\/script>/s);
  assert.ok(match, "no schema");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  for (const q of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text));
  }
});

test("linked from the tool page and listed in the sitemap", () => {
  assert.match(indexHtml, /href="india-gst-e-invoice-mandate\.html"/);
  assert.match(sitemap, /india-gst-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("page wires the calculator to india.mjs", () => {
  assert.match(html, /from"\.\/india\.mjs"/);
});

test("links to the German, French and Singapore pages and the sitemap entry is its own url block", () => {
  assert.match(html, /href="germany-e-invoice-mandate\.html"/);
  assert.match(html, /href="france-e-invoice-mandate\.html"/);
  assert.match(html, /href="singapore-invoicenow-e-invoice-mandate\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*india-gst-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("every other country page links to the India page", () => {
  for (const f of fs.readdirSync(new URL("./", import.meta.url)).filter((n) => /-mandate\.html$/.test(n) && !n.startsWith("india-gst"))) {
    const page = fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.match(page, /href="india-gst-e-invoice-mandate\.html"/, f);
  }
});

test("page wires the INV-01 payload check to the module", () => {
  assert.match(html, /id="p-json"/);
  assert.match(html, /import\{checkInv01\}from"\.\/india-inv01\.mjs"/);
});
