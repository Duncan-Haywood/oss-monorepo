import { test } from "node:test";
import assert from "node:assert/strict";
import { check, parsePrice, parseQty, parseDate, parseCsv, parseLines, money, dollars, claimText, reportCsv, flagOf, sampleList } from "./calc.mjs";

const H = "Date,Supplier,Item,Unit,Qty,Unit price,Contract price\n";
const run = (rows, o) => check(H + rows, o);

test("prices keep fractions of a cent and refuse finer ones", () => {
  assert.equal(parsePrice("$0.4375"), 4375);
  assert.equal(parsePrice("38.4"), 384000);
  assert.equal(parsePrice("1,250.00"), 12500000);
  assert.equal(parsePrice("1.23456"), null);
  assert.equal(parsePrice("abc"), null);
  assert.equal(parseQty("2.5"), 2.5);
  assert.equal(parseQty("0"), null);
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("9/7/2026").toISOString().slice(0, 10), "2026-09-07");
  assert.equal(money(4375), "$0.4375");
  assert.equal(money(384000), "$38.40");
  assert.equal(dollars(12345678), "$1,234.57");
});

test("csv handles quotes, tabs and a BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\n"x, y",2\n'), [["a", "b"], ["x, y", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});

test("missing columns and bad rows are reported by row number", () => {
  assert.match(parseLines("Item,Qty\nA,1").errors.join(" "), /date/);
  const r = parseLines(H + "2026-01-01,S,A,case,2,10,\nnot a date,S,A,case,2,10,\n2026-01-02,S,,case,2,10,\n2026-01-03,S,A,case,0,10,\n2026-01-04,S,A,case,2,x,");
  assert.equal(r.lines.length, 1);
  assert.equal(r.errors.length, 4);
  assert.match(r.errors[0], /Row 3/);
});

test("total and qty stand in for a missing unit price", () => {
  const r = parseLines("Date,Item,Qty,Total\n2026-01-01,Flour,4,10.00");
  assert.equal(r.lines[0].price, 25000);
});

test("steady prices are not flagged", () => {
  const r = run("2026-01-01,S,A,case,2,10,\n2026-02-01,S,A,case,2,10,\n2026-03-01,S,A,case,2,10,");
  assert.equal(r.items[0].creeping, false);
  assert.equal(flagOf(r.items[0]), "steady");
  assert.equal(r.summary.annualImpact, 0);
});

test("creep is flagged at the threshold and annualised from the quantity bought before the last delivery", () => {
  // 100 days, qty 10+10+10 before the last delivery = 30 units, so 109.5 a year; 10 -> 12 is +$2 a unit.
  const r = run("2026-01-01,S,A,case,10,10,\n2026-02-01,S,A,case,10,11,\n2026-03-01,S,A,case,10,12,\n2026-04-11,S,A,case,10,12,");
  const i = r.items[0];
  assert.equal(i.changePct, 20);
  assert.equal(i.creeping, true);
  assert.equal(i.steps.length, 2);
  assert.equal(i.annualImpact, Math.round(20000 * 30 * (365 / 100)));
  assert.equal(flagOf(i), "creeping up");
  assert.equal(run("2026-01-01,S,A,case,10,10,\n2026-04-11,S,A,case,10,10.4,").items[0].creeping, false);
});

test("annual cost needs enough days between first and last invoice", () => {
  const r = run("2026-01-01,S,A,case,10,10,\n2026-01-08,S,A,case,10,15,");
  assert.equal(r.items[0].creeping, true);
  assert.equal(r.items[0].annualImpact, 0);
  assert.equal(r.summary.annualReliable, false);
});

test("a single bad invoice between two agreeing ones is a spike, not creep, and is excluded from the annual figure", () => {
  const r = run("2026-01-01,S,A,case,10,10,\n2026-02-01,S,A,case,10,10,\n2026-03-01,S,A,case,10,14,\n2026-04-01,S,A,case,10,10,\n2026-05-01,S,A,case,10,10,");
  const i = r.items[0];
  assert.equal(i.spikes.length, 1);
  assert.equal(i.spikes[0].excess, 40000 * 10);
  assert.equal(i.creeping, false);
  assert.equal(i.annualImpact, 0);
  assert.equal(i.paidExtra, 0);
  assert.equal(flagOf(i), "one-off spike");
});

test("a step that stays up is creep even when only the last two prices agree", () => {
  const r = run("2026-01-01,S,A,case,10,10,\n2026-02-01,S,A,case,10,14,\n2026-03-01,S,A,case,10,14,");
  assert.equal(r.items[0].spikes.length, 0);
  assert.equal(r.items[0].creeping, true);
});

test("contract overcharges are summed line by line and drafted into a claim per supplier", () => {
  const r = run("2026-01-01,Acme,A,case,10,10,10\n2026-02-01,Acme,A,case,5,10.5,10\n2026-03-01,Beta,B,case,1,5,5");
  assert.equal(r.items.find((i) => i.supplier === "Acme").overchargeTotal, 5 * 5000);
  assert.equal(r.summary.contractBreaches, 1);
  const text = claimText(r, { business: "Joe's" });
  assert.match(text, /To: Acme/);
  assert.doesNotMatch(text, /To: Beta/);
  assert.match(text, /\$2\.50/);
  assert.match(text, /Joe's/);
  assert.match(claimText(run("2026-01-01,S,A,case,1,1,\n2026-02-01,S,A,case,1,1,")), /nothing to send/);
});

test("items are matched per supplier, and by sku when there is one", () => {
  const r = parseLines("Date,Supplier,Item,SKU,Qty,Unit price\n2026-01-01,A,Flour,F1,1,2\n2026-01-02,B,Flour,F1,1,3\n2026-01-03,A,Flour 50lb,F1,1,2");
  assert.equal(new Set(r.lines.map((l) => l.key)).size, 2);
});

test("different unit labels for one item are flagged rather than compared silently", () => {
  const r = run("2026-01-01,S,A,case,1,10,\n2026-02-01,S,A,each,1,2,");
  assert.equal(r.items[0].unitMixup, true);
  assert.equal(r.summary.unitMixups, 1);
});

test("the supplier index weights by typical order, so a heavy item outweighs a cheap one", () => {
  const r = run("2026-01-01,S,Big,case,100,10,\n2026-02-01,S,Big,case,100,11,\n2026-01-01,S,Tiny,case,1,10,\n2026-02-01,S,Tiny,case,1,20,");
  assert.ok(r.suppliers[0].indexPct > 9.9 && r.suppliers[0].indexPct < 12);
});

test("items are ranked by annual cost and the CSV carries the flag", () => {
  const r = check(sampleList());
  assert.equal(r.items[0].label, "Roma tomato 25lb");
  assert.equal(r.summary.spikes, 1);
  assert.equal(r.summary.contractBreaches, 1);
  const csv = reportCsv(r).trim().split("\n");
  assert.equal(csv.length, 5);
  assert.match(csv[0], /Annualised impact/);
  assert.match(csv.join("\n"), /one-off spike/);
});
