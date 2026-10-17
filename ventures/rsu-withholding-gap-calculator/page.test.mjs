import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["wages", "vest", "filing-status", "other-income", "deduction", "withholding-rate", "state-rate", "state-withheld", "salary-withheld", "prior-tax", "paychecks", "prior-over-150k"];

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

test("page states the 22% and 37% supplemental rates", () => {
  const html = page("index.html");
  assert.match(html, /22%/);
  assert.match(html, /37%/);
  assert.match(html, /W-4/);
});

test("worked example on the page matches the calculator", async () => {
  const { rsuGap } = await import("./calc.mjs");
  assert.equal(rsuGap({ wages: 180000, vest: 100000 }).federalGap, 7200.25);
  assert.match(page("index.html"), /Gap \$7,200\.25/);
});

test("ids used by the script all exist in the markup", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/\$\("#([\w-]+)"\)/g)) assert.match(html, new RegExp(`id="${m[1]}"`), `script uses #${m[1]}`);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
