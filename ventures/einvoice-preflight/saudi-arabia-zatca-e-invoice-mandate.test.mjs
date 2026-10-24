import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./saudi-arabia-zatca-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the date and the format", () => {
  assert.match(html, /1 Feb 2027/);
  assert.match(html, /30 Jun 2026/);
  assert.match(html, /UBL 2\.1/);
  assert.match(html, /SAR 187,500/);
});

test("makes no price claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/saudi-arabia-zatca-e-invoice-mandate\.html">/);
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
  assert.match(indexHtml, /href="saudi-arabia-zatca-e-invoice-mandate\.html"/);
  assert.match(sitemap, /saudi-arabia-zatca-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to the German and French pages and the sitemap entry is its own url block", () => {
  assert.match(html, /href="germany-e-invoice-mandate\.html"/);
  assert.match(html, /href="france-e-invoice-mandate\.html"/);
  assert.match(html, /href="croatia-e-invoice-mandate\.html"/);
  assert.match(html, /href="belgium-e-invoice-mandate\.html"/);
  assert.match(html, /href="poland-ksef-e-invoice-mandate\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*saudi-arabia-zatca-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("every other country page links to the Saudi page", () => {
  for (const f of fs.readdirSync(new URL("./", import.meta.url)).filter((n) => /-mandate\.html$/.test(n) && !n.startsWith("saudi"))) {
    const page = fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.match(page, /href="saudi-arabia-zatca-e-invoice-mandate\.html"/, f);
  }
});
