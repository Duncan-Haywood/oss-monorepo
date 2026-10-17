import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, analyze, reportCsv, sampleText, money, pct } from "./calc.mjs";

const base = { revenue: 18, varCost: 2, instructorCost: 70, capacity: 20 };
const sample = () => parseRows(sampleText()).rows;

test("parses headers, tabs, and skips bad rows with a warning", () => {
  const p = parseRows("class\tpeople\tmax\nMon 6am\t7\t20\nTue 6pm\tx\t20\n\nWed 6pm\t12\t15");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[1], { slot: "Wed 6pm", attended: 12, capacity: 15 });
  assert.match(p.warnings[0], /1 row/);
  assert.ok(parseRows("").error);
});

test("headerless rows read as slot, attended", () => {
  const p = parseRows("Mon,5\nTue,6");
  assert.deepEqual(p.rows, [{ slot: "Mon", attended: 5, capacity: null }, { slot: "Tue", attended: 6, capacity: null }]);
});

test("sample: empty slots are cut candidates, busy ones kept, full one flagged", () => {
  const r = analyze(sample(), base);
  const v = Object.fromEntries(r.rows.map((s) => [s.slot, s.verdict]));
  assert.equal(v["Tue 12pm"], "cut or move");
  assert.equal(v["Fri 5pm"], "cut or move");
  assert.equal(v["Sat 9am"], "full: add a class");
  assert.equal(v["Wed 6pm"], "keep");
  assert.equal(r.rows[0].verdict, "cut or move"); // sorted by cut gain
  assert.ok(r.totalCutGain > 0);
});

test("break-even attendance and per-class contribution are exact", () => {
  const r = analyze(sample(), base);
  assert.equal(r.breakEven, 70 / 16);
  const s = r.rows.find((x) => x.slot === "Sat 9am");
  assert.ok(Math.abs(s.perClass - (s.adjMean * 16 - 70)) < 1e-9);
});

test("cut gain equals instructor cost minus non-transferring margin", () => {
  const r = analyze(sample(), { ...base, transfer: 0.5 });
  const s = r.rows[0];
  assert.ok(Math.abs(s.cutGain - (70 - 0.5 * s.adjMean * 16)) < 1e-9);
});

test("full transfer makes every cut a pure saving, zero transfer makes cuts rarer", () => {
  const all = analyze(sample(), { ...base, transfer: 1 });
  const none = analyze(sample(), { ...base, transfer: 0 });
  assert.ok(all.flagged >= none.flagged);
  assert.equal(all.flagged, all.rows.length);
  assert.ok(all.warnings.some((w) => /spare spots/.test(w)));
});

test("shrinkage pulls a thin slot toward the studio mean", () => {
  const rows = [];
  for (const s of ["A", "B", "C", "D"]) for (let i = 0; i < 10; i++) rows.push({ slot: s, attended: 10 + (i % 3), capacity: 20 });
  rows.push({ slot: "E", attended: 0, capacity: 20 }, { slot: "E", attended: 0, capacity: 20 }, { slot: "E", attended: 0, capacity: 20 });
  const e = analyze(rows, base).rows.find((s) => s.slot === "E");
  assert.equal(e.rawMean, 0);
  assert.ok(e.adjMean > 1, "three empty classes are not proof the slot draws zero");
});

test("seeded: same input gives the same ranges", () => {
  assert.deepEqual(analyze(sample(), base).rows[0].cutGainRange80, analyze(sample(), base).rows[0].cutGainRange80);
});

test("refuses thin or malformed input", () => {
  assert.match(analyze(sample().slice(0, 10), base).error, /at least 20 classes/);
  const few = [];
  for (const s of ["A", "B"]) for (let i = 0; i < 15; i++) few.push({ slot: s, attended: 5, capacity: 20 });
  assert.match(analyze(few, base).error, /at least 4 slots/);
  assert.match(analyze(sample(), { ...base, revenue: 0 }).error, /revenue/i);
  assert.match(analyze(sample(), { ...base, varCost: 18 }).error, /below revenue/);
  assert.match(analyze(sample(), { ...base, transfer: 2 }).error, /between 0 and 1/);
  assert.match(analyze(sample().map((r) => ({ ...r, capacity: null })), { ...base, capacity: undefined }).error, /No capacity/);
});

test("attendance above capacity is capped with a warning; thin slots get no verdict", () => {
  const rows = sample();
  rows.push({ slot: "Odd", attended: 30, capacity: 20 }, { slot: "Odd", attended: 3, capacity: 20 });
  const r = analyze(rows, base);
  assert.ok(r.warnings.some((w) => /more attendees than capacity/.test(w)));
  assert.ok(r.warnings.some((w) => /fewer than 3 classes/.test(w)));
  assert.ok(!r.rows.some((s) => s.slot === "Odd"));
});

test("csv and formatters", () => {
  const csv = reportCsv(analyze(sample(), base));
  assert.equal(csv.trim().split("\n").length, 9);
  assert.match(csv, /^slot,classes,/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(0.456), "46%");
});
