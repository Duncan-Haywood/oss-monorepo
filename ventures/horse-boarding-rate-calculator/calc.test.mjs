import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("rate follows the stated rule on the sample", () => {
  const r = compute(raw());
  const D = 365 / 12;
  const variable = (20 * D * 320) / 2000 + 45 + 70;
  const fixed = 5 * D * 18 + 2400 + 4800 / 12 + 450 + 6000 / 12;
  const expect = (((fixed + 20000 / 12) / (16 * 0.88)) + variable) / 0.97;
  assert.ok(Math.abs(r.rate - expect) < 0.01);
  assert.ok(Math.abs(r.fixed - fixed) < 0.01);
});

test("charging the computed rate earns the target", () => {
  const r = compute(raw({ currentRate: "" }));
  const back = compute(raw({ currentRate: String(r.rate) }));
  assert.ok(Math.abs(back.current.profitYear - 20000) < 5);
});

test("break-even rate gives zero profit and sits below the target rate", () => {
  const r = compute(raw());
  assert.ok(r.breakEven < r.rate);
  const back = compute(raw({ currentRate: String(r.breakEven) }));
  assert.ok(Math.abs(back.current.profitYear) < 5);
});

test("a low rate is flagged with the profit gap and break-even occupancy", () => {
  const r = compute(raw({ currentRate: "650" }));
  assert.ok(r.current.profitYear < 20000);
  assert.ok(r.findings.some((f) => /against your/.test(f.title)));
  assert.ok(r.findings.some((f) => /occupancy just to cover costs/.test(f.title)));
  assert.ok(r.current.breakEvenOccupancy > 88);
});

test("a rate below feed and bedding cost loses money even when full", () => {
  const r = compute(raw({ currentRate: "100" }));
  assert.equal(r.current.breakEvenOccupancy, null);
  assert.ok(r.findings.some((f) => /even when every stall is full/.test(f.title)));
});

test("a generous rate raises no shortfall finding", () => {
  const r = compute(raw({ currentRate: "1200" }));
  assert.ok(!r.findings.some((f) => f.severity !== "info"));
});

test("emptier barns need a higher rate", () => {
  const s = compute(raw()).sweep;
  for (let i = 1; i < s.length; i++) assert.ok(s[i].rate < s[i - 1].rate);
});

test("optional fields can be blank", () => {
  const r = compute(raw({ hayLbs: "", hayTon: "", grain: "", bedding: "", laborHrs: "", wage: "", insuranceYear: "", utilities: "", repairsYear: "", feePct: "", currentRate: "" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.current, null);
});

test("validation names the bad field and does not compute", () => {
  assert.ok(parse(raw({ stalls: "" })).errors[0].includes("stalls"));
  assert.ok(compute(raw({ stalls: "2.5" })).errors.length > 0);
  assert.ok(compute(raw({ occupancy: "0" })).errors.length > 0);
  assert.ok(compute(raw({ occupancy: "101" })).errors.length > 0);
  assert.ok(compute(raw({ feePct: "60" })).errors.length > 0);
});

test("dollars, summary and csv render", () => {
  const r = compute(raw());
  assert.equal(dollars(1234.5), "$1,234.50");
  assert.match(summaryText(r), /per stall per month/);
  assert.equal(sweepCsv(r).split("\n").length, r.sweep.length + 1);
});
