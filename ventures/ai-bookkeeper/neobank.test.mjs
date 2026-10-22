import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement, checkRunningBalance } from "./bank.mjs";

const read = (f) => readStatement(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

test("Revolut: completed rows only, fee taken off, balance chain holds", () => {
  const r = read("revolut-current.csv");
  assert.equal(r.bank, "revolut");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1500, 120000, -10150]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-03", "2026-03-04", "2026-03-05"]);
  assert.equal(r.problems.length, 2, "pending and reverted rows are reported, not imported");
  const c = checkRunningBalance(r.rows);
  assert.equal(c.checked, true);
  assert.deepEqual(c.breaks, []);
  assert.equal(c.opening, 200000);
});

test("Revolut: a file with two currencies is flagged", () => {
  const t = readFileSync(new URL("./fixtures/revolut-current.csv", import.meta.url), "utf8").replace("Figma,-15.00,0.00,EUR", "Figma,-15.00,0.00,USD");
  assert.ok(readStatement(t).problems.some((p) => /mixes currencies/.test(p)));
});

test("Wise: DD-MM-YYYY dates read day first, running balance chains", () => {
  const r = read("wise-statement.csv");
  assert.equal(r.bank, "wise");
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-13", "2026-03-12"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-2499, 100000]);
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("Monzo: day-first dates, merchant name as description", () => {
  const r = read("monzo-business.csv");
  assert.equal(r.bank, "monzo");
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-13"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-800, 150000]);
  assert.equal(r.rows[0].desc, "Notion");
});

test("Starling: counter party, currency-suffixed amount and balance chain", () => {
  const r = read("starling-business.csv");
  assert.equal(r.bank, "starling");
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-13"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-800, 150000]);
  assert.equal(r.rows[1].desc, "Client Ltd");
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("Mercury: pending rows are reported, not imported", () => {
  const r = read("mercury-checking.csv");
  assert.equal(r.bank, "mercury");
  assert.deepEqual(r.rows.map((x) => x.cents), [-12050, 500000]);
  assert.equal(r.problems.length, 1);
});

test("Discover card: charges positive, DIRECTPAY row settles the sign", () => {
  const r = read("discover-card.csv");
  assert.equal(r.bank, "discover");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4217, -5999, 10216]);
  assert.ok(r.inferred);
});

test("Citi card: debit and credit columns, Status column ignored", () => {
  const r = read("citi-card.csv");
  assert.equal(r.bank, "citi");
  assert.deepEqual(r.rows.map((x) => x.cents), [-3850, 3850, -1725]);
});

test("US Bank and Ally checking are recognised and signed as written", () => {
  const u = read("us-bank-checking.csv");
  assert.equal(u.bank, "us-bank");
  assert.deepEqual(u.rows.map((x) => x.cents), [-125000, 480000, -9640]);
  const a = read("ally-checking.csv");
  assert.equal(a.bank, "ally");
  assert.deepEqual(a.rows.map((x) => x.cents), [-4500, 250000, -1299]);
});

test("Apple Card: charges positive, the ACH deposit row settles the sign", () => {
  const r = read("apple-card.csv");
  assert.equal(r.bank, "apple-card");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4217, -5999, 10216]);
});

test("Lloyds: day-first dates, debit and credit columns, balance chain holds", () => {
  const r = read("lloyds-current.csv");
  assert.equal(r.bank, "lloyds");
  assert.deepEqual(r.rows.map((x) => x.cents), [-2450, 120000, -4500]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-04", "2026-03-05"]);
  assert.equal(checkRunningBalance(r.rows).checked, true);
});

test("Barclays: day-first dates, Memo as description, no dates dropped", () => {
  const r = read("barclays-current.csv");
  assert.equal(r.bank, "barclays");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-05", "2026-03-13", "2026-03-14"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-2499, 150000, -850]);
  assert.equal(r.rows[1].desc, "CLIENT LTD INV 114");
});

test("PNC: withdrawals and deposits columns, quoted thousands, balance chain holds", () => {
  const r = read("pnc-checking.csv");
  assert.equal(r.bank, "pnc");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 200000, -30000]);
  assert.equal(checkRunningBalance(r.rows).checked, true);
});
