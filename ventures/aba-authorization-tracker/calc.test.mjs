import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, parseAuths, parseDate, fmtDate, parseCents, parseCsv, money, reportCsv, sampleList, DAY } from "./calc.mjs";

const H = "Client,CPT,Units approved,Start,End,Units used,Units per week,Rate\n";
const asOf = parseDate("2026-06-01");
const run = (rows, o = {}) => calculate(H + rows, { asOf, ...o });

test("dates parse in both formats and reject impossible ones", () => {
  assert.equal(fmtDate(parseDate("3/31/2026")), "2026-03-31");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("soon"), null);
  assert.equal(parseCents("$18.75"), 1875);
  assert.equal(parseCents("18.755"), null);
  assert.equal(money(123456), "$1,234.56");
  assert.deepEqual(parseCsv('a,b\n"x, y",2'), [["a", "b"], ["x, y", "2"]]);
});

test("header aliases and bad rows", () => {
  assert.match(parseAuths("Client,Units\nA,5").errors[0], /code/);
  const r = parseAuths("Patient ID,Service,Authorized,From,Through,Billed units\nAB,97153,100,2026-01-01,2026-06-30,10\n,97153,1,2026-01-01,2026-02-01,0\nCD,97153,x,2026-01-01,2026-02-01,0\nEF,97153,5,2026-03-01,2026-02-01,0");
  assert.equal(r.auths.length, 1);
  assert.equal(r.errors.length, 3);
});

test("pace, projection and run-out date from the scheduled rate", () => {
  // 100 days: Mar 1 to Jun 8; as of Jun 1 -> 7 days left. 700 approved, 600 used, 70 a week scheduled.
  const r = run("A.B.,97153,700,2026-03-01,2026-06-08,630,70,10").rows[0];
  assert.equal(r.remainingDays, 7);
  assert.equal(r.projectedEnd, 700);
  assert.equal(r.runOutDay, null);
  const s = run("A.B.,97153,700,2026-03-01,2026-06-08,600,140,10").rows[0];
  assert.ok(s.projectedEnd > 700);
  assert.equal(fmtDate(s.runOutDay), "2026-06-06");
  assert.ok(s.flags.some((f) => /run out/.test(f.text)));
});

test("under-use puts a dollar figure on unused units", () => {
  // 180 day auth, half elapsed, 25% used, observed pace -> ~50% used at end.
  const r = run("C.D.,97153,1000,2026-03-03,2026-08-29,250,,20").rows[0];
  assert.ok(r.projectedUnused > 400);
  assert.equal(r.atRiskCents, Math.round(r.projectedUnused * 2000));
  assert.ok(r.flags.some((f) => /expire unused/.test(f.text)));
});

test("reauthorization lead time", () => {
  const late = run("E.F.,97153,100,2026-01-01,2026-06-20,90,,1").rows[0];
  assert.ok(late.flags.some((f) => /lead time has already passed/.test(f.text)));
  const soon = run("E.F.,97153,100,2026-01-01,2026-07-10,60,,1", { leadDays: 30 }).rows[0];
  assert.ok(soon.flags.some((f) => /should go in by 2026-06-10/.test(f.text)));
  const fine = run("E.F.,97153,100,2026-01-01,2026-12-31,60,,1").rows[0];
  assert.ok(!fine.flags.some((f) => /Reauthorization/.test(f.text)));
});

test("expired, not started and over-used", () => {
  const e = run("G.H.,97153,100,2026-01-01,2026-05-01,60,,1").rows[0];
  assert.ok(e.expired && e.flags.some((f) => /never used/.test(f.text)));
  const n = run("G.H.,97153,100,2026-07-01,2026-12-01,0,,1").rows[0];
  assert.ok(!n.started && n.flags.some((f) => /Starts/.test(f.text)));
  const o = run("G.H.,97153,100,2026-01-01,2026-12-01,110,,1").rows[0];
  assert.ok(o.flags.some((f) => /beyond what was approved/.test(f.text)));
});

test("rows sort most urgent first and the summary counts them", () => {
  const res = calculate(sampleList(asOf), { asOf });
  assert.equal(res.rows.length, 7);
  assert.ok(res.rows[0].urgency <= res.rows[res.rows.length - 1].urgency);
  assert.ok(res.summary.needAttention >= 3);
  assert.ok(res.summary.atRiskCents > 0);
  assert.equal(res.errors.length, 0);
});

test("report csv has one line per row plus a header", () => {
  const res = calculate(sampleList(asOf), { asOf });
  assert.equal(reportCsv(res).trim().split("\n").length, 8);
});

test("a one-day authorization does not divide by zero", () => {
  const r = run("Z.Z.,97153,10,2026-06-01,2026-06-01,0,,1").rows[0];
  assert.ok(Number.isFinite(r.pctTime) && Number.isFinite(r.projectedEnd));
  assert.equal(DAY, 86400000);
});
