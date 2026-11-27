import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { answer, render, COUNTRIES } from "./whichapplies.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

test("Germany: 800,000 is the edge, above it 2027, at or under it 2028", () => {
  assert.equal(answer("DE", 800001).date, "2027-01-01");
  assert.equal(answer("DE", 800000).date, "2028-01-01");
  assert.equal(answer("DE", 0).date, "2028-01-01");
});
test("Spain: above 8 million is 6 Oct 2027, else 2028", () => {
  assert.equal(answer("ES", 8000001).date, "2027-10-06");
  assert.equal(answer("ES", 8000000).date, "2028-10-06");
});
test("UAE: 50 million or more is the first wave", () => {
  assert.equal(answer("AE", 50000000).date, "2027-01-01");
  assert.equal(answer("AE", 49999999).date, "2027-07-01");
});
test("Poland: above 200 million is February 2026, else April, smallest wave in the note", () => {
  assert.equal(answer("PL", 200000001).date, "2026-02-01");
  assert.equal(answer("PL", 200000000).date, "2026-04-01");
  assert.match(answer("PL", 1000).note, /1 January 2027/);
});
test("Oman and France", () => {
  assert.equal(answer("OM", 6e6).date, "2027-04-01");
  assert.equal(answer("OM", 5e6).date, "2027-10-01");
  assert.equal(answer("FR", "large").date, "2026-09-01");
  assert.equal(answer("FR", "small").date, "2027-09-01");
});
test("bad input is refused, not guessed", () => {
  for (const bad of [-1, NaN, Infinity, "5", null, undefined]) assert.throws(() => answer("DE", bad));
  assert.throws(() => answer("FR", 5));
  assert.throws(() => answer("XX", 5));
});
test("every wave date agrees with mandate-dates.json and every page exists", () => {
  const ev = JSON.parse(read("mandate-dates.json")).events;
  for (const [k, c] of Object.entries(COUNTRIES)) {
    assert.ok(fs.existsSync(new URL(`./${c.page}`, import.meta.url)), c.page);
    for (const w of c.waves) {
      if (k === "MY") continue; // the hub cell holds only the first date; MY is checked against its page below
      assert.ok(ev.some((e) => e.country === c.name && e.date === w.date), `${c.name} ${w.date} not in mandate-dates.json`);
    }
  }
});
test("the written page is the generated one, carries the disclaimer, is linked", () => {
  assert.equal(read("which-e-invoice-mandate-applies.html"), render());
  assert.match(render(), /<strong>No warranty\.<\/strong>/);
  assert.match(read("e-invoicing-mandates-by-country.html"), /href="which-e-invoice-mandate-applies\.html"/);
  assert.match(read("sitemap.xml"), /which-e-invoice-mandate-applies\.html<\/loc>/);
});
test("Malaysia: five turnover bands, edges per the country page table", () => {
  assert.equal(answer("MY", 100000001).date, "2024-08-01");
  assert.equal(answer("MY", 100000000).date, "2025-01-01");
  assert.equal(answer("MY", 25000000).date, "2025-01-01");
  assert.equal(answer("MY", 24999999).date, "2025-07-01");
  assert.equal(answer("MY", 5000000).date, "2025-07-01");
  assert.equal(answer("MY", 4999999).date, "2026-01-01");
  assert.equal(answer("MY", 1000000).date, "2026-01-01");
  assert.equal(answer("MY", 999999).date, "2026-07-01");
  assert.match(answer("MY", 10).what, /exempt/);
});
test("Malaysia wave dates appear in the phases table on its own page", () => {
  const html = read("malaysia-myinvois-e-invoice-mandate.html");
  const mon = { "01": "Jan", "07": "Jul", "08": "Aug" };
  for (const w of COUNTRIES.MY.waves) {
    const [y, m] = w.date.split("-");
    assert.ok(html.includes(`<td>1 ${mon[m]} ${y}</td>`), w.date);
  }
});
