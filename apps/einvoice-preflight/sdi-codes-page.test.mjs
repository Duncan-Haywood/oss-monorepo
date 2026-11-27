import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { renderPage } from "./build-sdi-codes-page.mjs";
import { SDI_CODES } from "./sdi-receipt.mjs";

const html = fs.readFileSync(new URL("./sdi-error-codes.html", import.meta.url), "utf8");

test("the committed page is what build-sdi-codes-page.mjs writes (run it after changing SDI_CODES)", () => {
  assert.equal(html, renderPage());
});

test("lists every code in the table with an anchor", () => {
  for (const code of Object.keys(SDI_CODES)) assert.ok(html.includes(`<tr id="e${code}">`), code);
});

test("carries the disclaimer and makes no price claim", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.doesNotMatch(html, /\$\d/);
});

test("FAQPage schema matches the visible questions", () => {
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text));
  }
});

test("linked from the tool page and the Italy page, and in the sitemap", () => {
  for (const f of ["index.html", "italy-sdi-e-invoice-mandate.html"]) {
    assert.match(fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /href="sdi-error-codes\.html"/, f);
  }
  assert.match(fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /<loc>[^<]*sdi-error-codes\.html<\/loc>/);
});
