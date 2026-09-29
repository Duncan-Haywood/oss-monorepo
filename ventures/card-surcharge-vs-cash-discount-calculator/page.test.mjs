import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["monthly-sales", "card-share", "avg-ticket", "rate", "fee", "margin", "surcharge", "cash-discount", "shift", "lost"];

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every input has an id and a visible label", () => {
  const html = page("index.html");
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing label for ${id}`);
  }
});

test("page states the legal caveat and the model's omissions", () => {
  const html = page("index.html");
  assert.match(html, /3%/);
  assert.match(html, /debit/);
  assert.match(html, /Not modelled/);
  assert.match(html, /estimates that depend entirely on the inputs you enter/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("index links one hop to the card-processing-fee-audit sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/card-processing-fee-audit\/"/);
});
