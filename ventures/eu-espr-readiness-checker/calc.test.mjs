import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, destruction, PRODUCTS, TREATMENTS, DPP_ITEMS, SAMPLE, summaryText, checklistCsv, parseDate } from "./calc.mjs";

const base = { product: "apparel", role: "manufacturer", size: "large", sellsInEu: "yes", now: "2026-10-13" };

test("large apparel brand is under the ban and the disclosure duty after 19 July 2026", () => {
  const r = compute(base);
  assert.equal(r.destruction.ban.status, "inForce");
  assert.equal(r.destruction.disclosure.status, "inForce");
});

test("before the date the ban is upcoming with a day count", () => {
  const r = compute({ ...base, now: "2026-07-09" });
  assert.equal(r.destruction.ban.status, "upcoming");
  assert.equal(r.destruction.ban.daysLeft, 10);
});

test("medium firms face the ban in 2030, micro and small are exempt", () => {
  assert.equal(compute({ ...base, size: "medium" }).destruction.ban.status, "upcoming");
  assert.equal(compute({ ...base, size: "medium", now: "2030-07-19" }).destruction.ban.status, "inForce");
  assert.equal(compute({ ...base, size: "small" }).destruction.ban.status, "exempt");
  assert.equal(compute({ ...base, size: "micro" }).destruction.ban.status, "exempt");
});

test("non-apparel products are outside the ban; no EU sales is outside everything", () => {
  assert.equal(compute({ ...base, product: "furniture" }).destruction.ban.status, "none");
  const out = compute({ ...base, sellsInEu: "no" });
  assert.equal(out.destruction.ban.status, "out");
  assert.equal(out.destruction.disclosure.status, "none");
  assert.equal(out.passportRelevant, false);
});

test("SMEs are not bound by public disclosure", () => {
  assert.equal(compute({ ...base, size: "medium" }).destruction.disclosure.status, "notRequired");
});

test("passport lanes by product, batteries point elsewhere", () => {
  assert.equal(compute({ ...base, product: "apparel" }).dpp.status, "soon");
  assert.equal(compute({ ...base, product: "furniture" }).dpp.status, "later");
  assert.equal(compute({ ...base, product: "battery" }).dpp.status, "own");
  assert.equal(compute({ ...base, product: "battery" }).passportRelevant, false);
  assert.equal(compute({ ...base, product: "other" }).dpp.status, "none");
});

test("open passport items fall as items are marked ready", () => {
  assert.equal(compute(base).open.length, DPP_ITEMS.length);
  const r = compute({ ...base, identifier: "1", carrier: "1" });
  assert.equal(r.open.length, DPP_ITEMS.length - 2);
  assert.ok(!r.open.some((d) => d.id === "carrier"));
});

test("disclosure table totals and shares", () => {
  const r = compute({ ...base, units_reuse: "60", kg_reuse: "30", units_recycle: "30", kg_recycle: "15", units_energy: "10", kg_energy: "5" });
  assert.equal(r.table.units, 100);
  assert.equal(r.table.kg, 50);
  assert.equal(r.table.rows.find((x) => x.id === "reuse").shareUnits, 60);
  assert.equal(r.table.destroyedUnits, 10);
  assert.equal(r.table.destroyedKg, 5);
  assert.ok(r.findings.some((f) => f.severity === "high" && /10 units/.test(f.title)));
});

test("destroying nothing raises no destruction finding", () => {
  const r = compute({ ...base, units_reuse: "5", kg_reuse: "2" });
  assert.ok(!r.findings.some((f) => /energy recovery or disposal/.test(f.title)));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...base, product: "" }).errors);
  assert.ok(compute({ ...base, units_reuse: "-3" }).errors);
  assert.ok(compute({ ...base, kg_reuse: "abc" }).errors);
  assert.ok(compute({ ...base, kg_reuse: "4" }).errors, "weight without units");
  assert.ok(compute({ ...base, size: "giant" }).errors);
  assert.ok(compute({ ...base, now: "2026-02-31" }).errors);
});

test("parseDate is strict", () => {
  assert.ok(parseDate("2026-07-19"));
  assert.equal(parseDate("2026-7-19"), null);
  assert.equal(parseDate("2026-13-01"), null);
});

test("sample runs and the exports are complete", () => {
  const r = compute(SAMPLE);
  assert.equal(r.errors, undefined);
  assert.equal(r.table.units, 52800);
  assert.match(summaryText(r), /52800 units/);
  const csv = checklistCsv(r).split("\n");
  assert.equal(csv[0], "kind,item,detail,status");
  assert.equal(csv.length, 1 + TREATMENTS.length + 1 + DPP_ITEMS.length);
  assert.ok(PRODUCTS.every((p) => p.dppNote));
});

test("reasons text is carried into the CSV with quotes escaped", () => {
  const r = compute({ ...base, units_reuse: "1", reasons: 'End of "season"' });
  assert.match(checklistCsv(r), /End of ""season""/);
  assert.equal(parse({ ...base, reasons: "x".repeat(900) }).reasons.length, 400);
});
