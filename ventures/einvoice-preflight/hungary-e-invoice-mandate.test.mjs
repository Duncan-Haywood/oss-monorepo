import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./hungary-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const table = fs.readFileSync(new URL("./e-invoicing-mandates-by-country.html", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the reporting dates and says it is not an exchange mandate", () => {
  assert.match(html, /Jul 2018/);
  assert.match(html, /Jul 2020/);
  assert.match(html, /Online Számla/);
  assert.match(html, /reporting, not a structured e-invoice exchange mandate/);
});

test("makes no price claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/hungary-e-invoice-mandate\.html">/);
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

test("linked from the tool page, the country table and the sitemap", () => {
  assert.match(indexHtml, /href="hungary-e-invoice-mandate\.html"/);
  assert.match(table, /href="hungary-e-invoice-mandate\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*hungary-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("every other country page links to the Hungary page and back", () => {
  for (const f of fs.readdirSync(new URL("./", import.meta.url)).filter((n) => /-mandate\.html$/.test(n))) {
    const page = fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    if (f.startsWith("hungary")) continue;
    assert.match(page, /href="hungary-e-invoice-mandate\.html"/, f);
    assert.ok(html.includes(`href="${f}"`), `hungary page links ${f}`);
  }
});
