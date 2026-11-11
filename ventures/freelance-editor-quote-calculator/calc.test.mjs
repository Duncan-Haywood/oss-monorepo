import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, dollars, LEVELS } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("sample: 80k-word copyedit at 1000 wph is 80 edit hours, 3 extra, 15% admin", () => {
  const r = compute(raw());
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.editHours - 80) < 1e-9);
  assert.ok(Math.abs(r.billable - 83 * 1.15) < 1e-9);
  assert.equal(r.fee, Math.round(83 * 1.15 * 45 * 100) / 100);
});

test("per-word and per-page rates follow from the fee", () => {
  const r = compute(raw());
  assert.ok(Math.abs(r.perWord * 80000 - r.fee) < 1e-6);
  assert.ok(Math.abs(r.perPage * 320 - r.fee) < 1e-6);
});

test("a rough manuscript costs more than a clean one", () => {
  assert.ok(compute(raw({ condition: "rough" })).fee > compute(raw({ condition: "clean" })).fee);
});

test("a pace override replaces the level default", () => {
  const r = compute(raw({ pace: "2000", extraHours: "0", overhead: "0" }));
  assert.ok(Math.abs(r.editHours - 40) < 1e-9);
});

test("rush surcharge applies only when the deadline is inside the rush window", () => {
  const base = compute(raw({ workDays: "30" })).fee;
  const rushed = compute(raw({ workDays: "5", rushDays: "7", rushPct: "25", hoursPerDay: "40" }));
  assert.equal(rushed.rush, true);
  assert.ok(Math.abs(rushed.fee - base * 1.25) < 0.02);
  assert.equal(compute(raw({ workDays: "10", rushDays: "7" })).rush, false);
});

test("a deadline shorter than the hours need is a high finding", () => {
  const r = compute(raw({ workDays: "5" }));
  assert.ok(r.findings.some((f) => f.severity === "high"));
});

test("editing slower than planned shows the real hourly under a flat fee", () => {
  const r = compute(raw({ slower: "25" }));
  // edit hours grow by 1/0.75 but the fixed extra hours do not, so it lands just above 45*0.75
  const expected = (83 * 1.15 * 45) / ((80 / 0.75 + 3) * 1.15);
  assert.ok(Math.abs(r.slowEff - expected) < 0.01);
  assert.ok(r.slowEff < 45 * 0.8);
});

test("rough proofread draws a warning", () => {
  assert.ok(compute(raw({ level: "proofread", condition: "rough" })).findings.some((f) => /copyedit/.test(f.title)));
});

test("validation names the bad field and does not compute", () => {
  assert.ok(parse(raw({ words: "" })).errors[0].includes("words"));
  assert.ok(compute(raw({ rate: "0" })).errors.length > 0);
  assert.ok(compute(raw({ level: "x" })).errors.length > 0);
  assert.ok(compute(raw({ overhead: "-1" })).errors.length > 0);
});

test("sweep covers every level and gets pricier as the edit gets deeper", () => {
  const s = compute(raw()).sweep;
  assert.equal(s.length, Object.keys(LEVELS).length);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].fee > s[i - 1].fee);
});

test("dollars, summary and csv render", () => {
  const r = compute(raw());
  assert.equal(dollars(1234.5), "$1,234.50");
  assert.match(summaryText(r), /Quote: \$/);
  assert.equal(sweepCsv(r).split("\n").length, 5);
});

test("summary states every figure, and lists warnings but not the info line", () => {
  const r = compute(raw({ workDays: "5" }));
  const t = summaryText(r);
  assert.match(t, /Edit quote: Copyediting, 80,000 words \(320 pages\), average manuscript/);
  assert.match(t, /edit time 80\.0 h; billable incl\. 15% admin and 3 extra h: 95\.4 h/);
  assert.ok(t.includes(`Quote: ${dollars(r.fee)} flat (${dollars(r.perWord)}/word, ${dollars(r.perPage)}/page) at a target $45.00/h`));
  assert.match(t, /Working days needed: 19\.1 at 5 h\/day/);
  assert.ok(t.includes("- The job needs about 19.1 working days"));
  assert.ok(!t.includes("Quote $"), "the info finding is not repeated in the summary");
});

test("sweep rows carry the level pace, hours, fee and per-word rate", () => {
  const r = compute(raw());
  const c = r.sweep.find((x) => x.key === "copyedit");
  assert.equal(c.pace, 1000);
  assert.ok(Math.abs(c.hours - 95.45) < 1e-9);
  assert.equal(c.fee, r.fee);
  assert.ok(Math.abs(c.perWord - r.fee / 80000) < 1e-9);
  const lines = sweepCsv(r).split("\n");
  assert.equal(lines[2], `Copyediting,1000,95.45,${r.fee.toFixed(2)},${(r.fee / 80000).toFixed(4)}`);
});

test("the slower-pace risk is capped at 90 percent and money inputs accept $ and commas", () => {
  const capped = compute(raw({ slower: "500" }));
  const ninety = compute(raw({ slower: "90" }));
  assert.equal(capped.slowEff, ninety.slowEff);
  const r = compute(raw({ words: "80,000", rate: "$45" }));
  assert.equal(r.input.words, 80000);
  assert.equal(r.input.rate, 45);
});

test("rush needs both a deadline and a window, and dollars shows negatives", () => {
  assert.equal(compute(raw({ workDays: "", rushDays: "7" })).rush, false);
  assert.equal(compute(raw({ workDays: "5", rushDays: "" })).rush, false);
  assert.equal(compute(raw({ workDays: "7", rushDays: "7", hoursPerDay: "40" })).rush, true);
  assert.equal(dollars(-5), "-$5.00");
});

test("a level or condition that is an Object key (constructor, toString) is not a level", () => {
  for (const name of ["constructor", "toString", "__proto__"]) {
    const p = parse(raw({ level: name }));
    assert.equal(p.level, null, name);
    assert.ok(p.errors.includes("Choose a level of edit."), name);
    assert.equal(parse(raw({ condition: name })).condition, "average", name);
  }
});
