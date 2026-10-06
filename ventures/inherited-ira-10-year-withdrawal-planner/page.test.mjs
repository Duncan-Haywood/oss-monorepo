import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["balance", "growth", "years", "rmd", "age", "factor", "status", "income-now", "change-year", "income-later"];

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

test("page states the rules it relies on", () => {
  const html = page("index.html");
  assert.match(html, /10-year rule/);
  assert.match(html, /25% excise tax/);
  assert.match(html, /eligible|Spouses, minor children/);
});

test("page names the exact IRS table for the factor", () => {
  assert.match(page("index.html"), /Publication 590-B|Pub\. 590-B/);
});

test("worked example text matches the calculator", async () => {
  const { plan, incomePath } = await import("./calc.mjs");
  const r = plan({ balance: 500000, growth: 0.06, years: 10, rmdRequired: false, beneficiaryAge: 50, status: "single", otherIncome: incomePath(150000, 4, 40000, 10) });
  assert.ok(r.plans.best.wealth > r.wait.wealth);
  assert.match(page("index.html"), /\$500,000 inherited IRA, \$150,000 income that drops to \$40,000 in year 4/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("sibling tools exist at the linked paths", () => {
  const html = page("index.html");
  for (const slug of ["roth-conversion-bracket-fill-calculator", "rmd-calculator", "retirement-withdrawal-sequencer", "medicare-irmaa-cliff-calculator"]) {
    assert.match(html, new RegExp(`href="\\.\\./${slug}/"`));
    assert.ok(readFileSync(new URL(`../${slug}/index.html`, import.meta.url), "utf8").length > 0);
  }
});
