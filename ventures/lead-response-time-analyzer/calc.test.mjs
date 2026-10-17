import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, parseMinutes, parseOutcome, wilson, fitLogit, analyze, sampleText, reportCsv, BANDS } from "./calc.mjs";

const sig = (z) => 1 / (1 + Math.exp(-z));
function leads({ n = 500, a = 1.0, b = -0.35, seed = 3, never = 0 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const minutes = Math.round(Math.exp(Math.log(2) + rnd() * Math.log(1500)));
    out.push({ minutes, won: rnd() < sig(a + b * Math.log1p(minutes)) ? 1 : 0, value: null });
  }
  for (let i = 0; i < never; i++) out.push({ minutes: Infinity, won: 0, value: null });
  return out;
}

test("time formats", () => {
  assert.equal(parseMinutes("12"), 12);
  assert.equal(parseMinutes("12 min"), 12);
  assert.equal(parseMinutes("1h 30m"), 90);
  assert.equal(parseMinutes("1:30"), 90);
  assert.equal(parseMinutes("2 hours"), 120);
  assert.equal(parseMinutes("1 day"), 1440);
  assert.equal(parseMinutes(""), Infinity);
  assert.equal(parseMinutes("never"), Infinity);
  assert.ok(Number.isNaN(parseMinutes("soon")));
});

test("outcome words", () => {
  for (const w of ["1", "Won", "booked", "YES"]) assert.equal(parseOutcome(w), 1, w);
  for (const w of ["0", "lost", "no"]) assert.equal(parseOutcome(w), 0, w);
  assert.equal(parseOutcome("pending"), null);
});

test("parseRows reads a header in any order, money, and skips unreadable rows", () => {
  const p = parseRows("Date,Result,Minutes to first reply,Job value\n2026-01-01,won,7,\"$1,200\"\n2026-01-02,lost,never,\n2026-01-03,pending,5,\n2026-01-04,won,soon,100");
  assert.equal(p.leads.length, 2);
  assert.deepEqual(p.leads[0], { minutes: 7, won: 1, value: 1200 });
  assert.equal(p.leads[1].minutes, Infinity);
  assert.ok(p.warnings.some((w) => /skipped/.test(w)));
});

test("a header row is not mistaken for data when the column is named won", () => {
  const p = parseRows("minutes to first reply,won\n5,1\n60,0");
  assert.equal(p.leads.length, 2);
  assert.deepEqual(p.warnings, []);
});

test("headerless rows read minutes then outcome, tab and semicolon delimited", () => {
  assert.equal(parseRows("5,1\n90,0").leads.length, 2);
  assert.equal(parseRows("5\t1").leads[0].minutes, 5);
  assert.equal(parseRows("minutes;won\n5;yes").leads[0].won, 1);
});

test("empty and one-column input give an error", () => {
  assert.ok(parseRows("").error);
  assert.ok(parseRows("5\n6").error);
});

test("wilson interval matches the textbook value", () => {
  const w = wilson(8, 10);
  assert.ok(Math.abs(w.lo - 0.4902) < 0.002 && Math.abs(w.hi - 0.9433) < 0.002, JSON.stringify(w));
  assert.ok(Number.isNaN(wilson(0, 0).lo));
});

test("logistic fit recovers a known slope", () => {
  const L = leads({ n: 4000, a: 1.0, b: -0.35 });
  const f = fitLogit(L.map((l) => Math.log1p(l.minutes)), L.map((l) => l.won));
  assert.ok(Math.abs(f.b + 0.35) < 0.06, String(f.b));
  assert.ok(Math.abs(f.a - 1.0) < 0.25, String(f.a));
});

test("a log with a real trend finds a significant slope, a gain, and bands that fall", () => {
  const r = analyze(leads({ n: 600 }), { targetMin: 5, leadsPerMonth: 60, avgValue: 1500 });
  assert.ok(!r.error);
  assert.ok(r.fit.b < -0.2 && r.slopeSignificant);
  assert.ok(r.winsGained > 0 && r.winsLo <= r.winsGained && r.winsGained <= r.winsHi);
  assert.ok(r.bands[0].rate > r.bands[5].rate);
  assert.equal(r.revenuePerMonth, r.winsPerMonth * 1500);
  assert.ok(r.revenueLo <= r.revenuePerMonth && r.revenuePerMonth <= r.revenueHi);
});

test("a flat log shows no significant trend and says so", () => {
  const r = analyze(leads({ n: 300, b: 0 }), { targetMin: 5 });
  assert.ok(!r.error);
  assert.ok(!r.slopeSignificant);
  assert.ok(r.warnings.some((w) => /not distinguishable from noise/.test(w)));
});

test("a positive slope reports no gain rather than a negative one", () => {
  const r = analyze(leads({ n: 400, b: 0.3 }), { targetMin: 5 });
  assert.equal(r.winsGained, 0);
  assert.ok(r.warnings.some((w) => /slower replies won as often/.test(w)));
});

test("unanswered leads are reported apart and never enter the fit", () => {
  const base = leads({ n: 400 });
  const a = analyze(base, { targetMin: 5 }), b = analyze([...base, ...Array.from({ length: 60 }, () => ({ minutes: Infinity, won: 0, value: null }))], { targetMin: 5 });
  assert.equal(b.nNever, 60);
  assert.ok(Math.abs(a.fit.b - b.fit.b) < 1e-9);
  assert.equal(b.never.won, 0);
});

test("refuses thin, one-class, flat-time and bad-target input with a reason", () => {
  assert.match(analyze(leads({ n: 20 })).error, /at least 40/);
  assert.match(analyze(Array.from({ length: 60 }, () => ({ minutes: 5, won: 1, value: null }))).error, /won and/);
  assert.match(analyze(Array.from({ length: 60 }, (_, i) => ({ minutes: 5, won: i % 2, value: null }))).error, /barely vary/);
  assert.ok(analyze(leads({ n: 100 }), { targetMin: 0 }).error);
});

test("average job value comes from won leads when given, and an explicit one overrides", () => {
  const L = leads({ n: 300 }).map((l) => (l.won ? { ...l, value: 1000 } : l));
  assert.equal(analyze(L, { targetMin: 5 }).avgValue, 1000);
  assert.equal(analyze(L, { targetMin: 5, avgValue: 2000 }).avgValue, 2000);
});

test("the bootstrap is reproducible", () => {
  const L = leads({ n: 300 });
  assert.equal(analyze(L, { targetMin: 5 }).winsLo, analyze(L, { targetMin: 5 }).winsLo);
});

test("bands cover every reply time once", () => {
  for (const m of [0, 5, 6, 60, 61, 1440, 1441, 99999]) assert.equal(BANDS.filter((b, i) => m <= b.max && (i === 0 || m > BANDS[i - 1].max)).length, 1, String(m));
});

test("sample data parses cleanly and analyses", () => {
  const p = parseRows(sampleText());
  assert.deepEqual(p.warnings, []);
  assert.equal(p.leads.length, 240);
  const r = analyze(p.leads, { targetMin: 5, leadsPerMonth: 60 });
  assert.ok(!r.error && r.fit.b < 0);
  assert.match(reportCsv(r), /Never answered/);
});
