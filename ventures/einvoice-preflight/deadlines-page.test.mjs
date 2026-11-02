import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { build, pick, render, FROM, TO } from "./deadlines-page.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const events = JSON.parse(read("mandate-dates.json")).events;

test("the written page is the generated one", () => {
  assert.equal(read("e-invoicing-deadlines-2027.html"), build());
});

test("lists exactly the dated milestones in the window, in date order", () => {
  const list = pick(events);
  assert.ok(list.length >= 10);
  assert.ok(list.every((e) => e.date >= FROM && e.date <= TO));
  const html = read("e-invoicing-deadlines-2027.html");
  assert.equal((html.match(/<li><strong>/g) || []).length, list.length);
  const dates = [...html.matchAll(/<li><strong>(\d+ \w+ \d{4})<\/strong>/g)].map((m) => Date.parse(m[1] + " UTC"));
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
});

test("every row links a country page that exists", () => {
  for (const e of pick(events)) assert.ok(fs.existsSync(new URL(`./${e.page}`, import.meta.url)), e.page);
});

test("escapes markup in notes and carries the disclaimer", () => {
  const html = render([{ date: "2027-01-01", country: "X<b>", page: "uae-e-invoice-mandate.html", note: "a & <script>", status: "S" }]);
  assert.ok(!html.includes("<script>a"));
  assert.match(html, /X&lt;b&gt;/);
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
});

test("is linked from the hub and the sitemap", () => {
  assert.match(read("e-invoicing-mandates-by-country.html"), /href="e-invoicing-deadlines-2027\.html"/);
  assert.match(read("sitemap.xml"), /e-invoicing-deadlines-2027\.html<\/loc>/);
});
