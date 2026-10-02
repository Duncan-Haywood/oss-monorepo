import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCalendar, plan, optimise, evaluate, gapValue, dayNumber, isoDay, summarize } from "./engine.mjs";

const OPTS = { turnover: 60, nightValue: 50, minStay: 3 };
const fixture = readFileSync(new URL("./fixtures/calendar.csv", import.meta.url), "utf8");

test("parseCalendar reads both kinds, skips header and comments, reports line errors", () => {
  const p = parseCalendar("kind,a,b,c\n# note\nbooked,2026-07-01,2026-07-05,$1200\nrequest,2026-07-05,2026-07-07,260,Dana, 2 nights");
  assert.equal(p.errors.length, 0);
  assert.equal(p.booked.length, 1);
  assert.equal(p.booked[0].price, 1200);
  const q = parseCalendar("request,2026-07-05,2026-07-07,260,Dana, 2 nights");
  assert.equal(q.requests[0].label, "Dana, 2 nights");
  const bad = parseCalendar("hold,2026-07-05,2026-07-07,1\nrequest,2026-02-30,2026-03-02,5\nrequest,2026-07-07,2026-07-05,5\nrequest,2026-07-05,2026-07-07,abc");
  assert.equal(bad.errors.length, 4);
  assert.match(bad.errors[0], /line 1/);
});

test("dayNumber rejects impossible dates and round-trips", () => {
  assert.ok(Number.isNaN(dayNumber("2026-02-30")));
  assert.ok(Number.isNaN(dayNumber("07/01/2026")));
  assert.equal(isoDay(dayNumber("2026-12-31")), "2026-12-31");
  assert.equal(dayNumber("2026-03-01") - dayNumber("2026-02-28"), 1);
});

test("gapValue: nothing for gaps under the minimum stay", () => {
  assert.equal(gapValue(2, { minStay: 3, nightValue: 50 }), 0);
  assert.equal(gapValue(3, { minStay: 3, nightValue: 50 }), 150);
  assert.equal(gapValue(0, { minStay: 1, nightValue: 50 }), 0);
});

test("the trap: the first and the priciest request strands nights, the plan avoids it", () => {
  const p = plan(parseCalendar(fixture), OPTS);
  const labels = p.chosen.map((c) => c.label);
  assert.deepEqual(labels, ["Dana 4 nights", "Lee 3 nights", "Park 2 nights"]);
  assert.ok(p.totals.plan > p.totals.firstComeFirstServed);
  assert.ok(p.totals.plan > p.totals.highestPriceFirst);
  assert.equal(p.totals.upliftVsFirstComeFirstServed, 275);
  assert.match(p.declined.find((d) => d.label.startsWith("Ito")).reason, /confirmed booking/);
  assert.equal(summarize(p).status, "gain");
});

test("back-to-back stays on the same day are not a clash", () => {
  const p = parseCalendar("booked,2026-07-01,2026-07-05,500\nrequest,2026-07-05,2026-07-08,400,A");
  assert.equal(plan(p, { turnover: 0, nightValue: 0, minStay: 1 }).chosen.length, 1);
});

test("a request worth less than its turnover is declined", () => {
  const p = parseCalendar("request,2026-07-05,2026-07-06,40,Tiny");
  const r = plan(p, { turnover: 60, nightValue: 0, minStay: 1 });
  assert.equal(r.chosen.length, 0);
  assert.equal(r.totals.plan, 0);
});

test("confirmed bookings are never dropped, and overlapping requests are never both chosen", () => {
  const p = plan(parseCalendar(fixture), OPTS);
  for (const c of p.chosen) assert.ok(!p.booked.some((b) => c.start < b.end && b.start < c.end));
  for (let i = 1; i < p.chosen.length; i += 1) assert.ok(p.chosen[i].start >= p.chosen[i - 1].end);
});

test("dead gaps in the confirmed calendar are reported", () => {
  const p = plan(parseCalendar("booked,2026-07-01,2026-07-05,500\nbooked,2026-07-07,2026-07-09,300\nrequest,2026-08-01,2026-08-03,100"), { minStay: 3 });
  assert.equal(p.deadGaps.length, 1);
  assert.equal(p.deadGaps[0].nights, 2);
  assert.equal(p.findings[0].rule, "dead-gap-in-calendar");
});

test("exact: DP matches brute force over every subset on random calendars", () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let trial = 0; trial < 300; trial += 1) {
    const booked = [];
    let cursor = rnd(3);
    for (let k = 0; k < rnd(3); k += 1) {
      const start = cursor + rnd(6);
      const end = start + 1 + rnd(4);
      booked.push({ start, end, nights: end - start, price: 100 * (end - start), label: "b" });
      cursor = end;
    }
    const requests = [];
    for (let k = 0; k < 2 + rnd(7); k += 1) {
      const start = rnd(24);
      const nights = 1 + rnd(5);
      requests.push({ id: k, start, end: start + nights, nights, price: 20 + rnd(300), label: `r${k}`, line: k });
    }
    const opts = { turnover: rnd(80), nightValue: rnd(120), minStay: 1 + rnd(4) };
    const best = optimise(booked, requests, opts);
    let brute = -Infinity;
    for (let mask = 0; mask < 1 << requests.length; mask += 1) {
      const subset = requests.filter((_, i) => mask & (1 << i));
      const ev = evaluate(booked, subset, opts);
      if (ev) brute = Math.max(brute, ev.value);
    }
    // Edge gaps are not scored, so compare on the same objective.
    assert.ok(Math.abs(best.value - brute) < 1e-6, `trial ${trial}: dp ${best.value} brute ${brute}`);
  }
});

test("counter-offers only appear when the plan really improves", () => {
  const p = plan(parseCalendar(fixture), OPTS);
  assert.ok(p.counterOffers.length >= 1);
  for (const o of p.counterOffers) {
    assert.ok(o.gain > 0);
    assert.ok(o.before + o.after <= 2);
  }
});

test("sensitivity says whether the plan holds when empty nights are worth nothing", () => {
  const p = plan(parseCalendar(fixture), OPTS);
  assert.equal(p.sensitivity.length, 3);
  assert.equal(p.sensitivity[0].factor, 0);
});
