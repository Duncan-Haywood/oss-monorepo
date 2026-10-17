import test from "node:test";
import assert from "node:assert/strict";
import { parseDemand, plan, summarize, erlangC, serviceLevel, averageSpeedOfAnswer, agentsNeeded, normalizeOptions, candidateShifts, minCostCover, clock, money } from "./engine.mjs";

// Erlang C straight from the textbook sum, no recursion.
function erlangCDirect(n, a) {
  let fact = 1; let sum = 0;
  for (let k = 0; k < n; k += 1) { if (k > 0) fact *= k; sum += a ** k / fact; }
  fact *= n; // n!
  const top = (a ** n / fact) * (n / (n - a));
  return top / (sum + top);
}

test("parse reports line numbers and never throws", () => {
  const r = parseDemand("day,start,contacts\nMon,25:00,5\nMon,09:00,abc\nMon,09:00,5,0\nMon,09:00,5,300\nMon,09:00,6\n,09:30,4\nTue,09:00,7");
  assert.equal(r.rows.length, 2);
  assert.equal(r.errors.length, 5);
  assert.match(r.errors[0], /^line 2: start must be HH:MM/);
  assert.match(r.errors[1], /^line 3: contacts must be a number/);
  assert.match(r.errors[2], /^line 4: handle time must be a positive/);
  assert.match(r.errors[3], /^line 6: Mon 09:00 appears twice/);
  assert.match(r.errors[4], /^line 7: the row needs a day label/);
  assert.equal(parseDemand("").rows.length, 0);
});

test("Erlang C matches the textbook formula", () => {
  for (const [n, a] of [[11, 10], [5, 3.2], [30, 24], [2, 0.5], [60, 55]]) {
    assert.ok(Math.abs(erlangC(n, a) - erlangCDirect(n, a)) < 1e-9, `${n},${a}`);
  }
  assert.equal(erlangC(5, 5), 1);
  assert.equal(erlangC(5, 0), 0);
});

test("service level, speed of answer and agents needed are consistent", () => {
  // 10 erlangs, 11 agents, 300s calls: wait probability ~68%, 20s target.
  const c = erlangCDirect(11, 10);
  assert.ok(Math.abs(c - 0.6821) < 0.001);
  assert.ok(Math.abs(serviceLevel(11, 10, 300, 20) - (1 - c * Math.exp(-(1 * 20) / 300))) < 1e-12);
  assert.ok(Math.abs(averageSpeedOfAnswer(11, 10, 300) - c * 300) < 1e-9);
  const o = normalizeOptions({ maxOccupancy: 0 });
  const n = agentsNeeded(10, 300, o);
  assert.ok(serviceLevel(n, 10, 300, 20) >= 0.8);
  assert.ok(serviceLevel(n - 1, 10, 300, 20) < 0.8);
  assert.equal(agentsNeeded(0, 300, o), 0);
  // The occupancy cap can only add agents.
  assert.ok(agentsNeeded(10, 300, normalizeOptions({ maxOccupancy: 70 })) >= n);
  assert.ok(10 / agentsNeeded(10, 300, normalizeOptions({ maxOccupancy: 70 })) <= 0.7 + 1e-9);
});

test("options are validated", () => {
  assert.throws(() => normalizeOptions({ shifts: "abc" }), /shifts must be/);
  assert.throws(() => normalizeOptions({ shifts: "8,3.3" }), /whole number/);
  assert.throws(() => normalizeOptions({ intervalMinutes: 7 }), /divides a day/);
  assert.throws(() => normalizeOptions({ startStepMinutes: 45 }), /multiple/);
  assert.throws(() => normalizeOptions({ serviceLevel: 100 }), /service level/);
  assert.equal(normalizeOptions({}).serviceLevel, 80);
});

test("shrinkage and hand arithmetic for one interval", () => {
  // 30 contacts of 300s in 30 minutes = 5 erlangs.
  const p = plan(parseDemand("Mon,09:00,30\nMon,09:30,30\nMon,10:00,30\nMon,10:30,30\nMon,11:00,30\nMon,11:30,30"), { shifts: "3", minShiftHours: 3, shrinkage: 20, maxOccupancy: 0 });
  const s = p.days[0].slots[0];
  assert.equal(s.erlangs, 5);
  const n = agentsNeeded(5, 300, normalizeOptions({ maxOccupancy: 0 }));
  assert.equal(s.onQueue, n);
  assert.equal(s.required, Math.ceil(n / 0.8));
  assert.equal(p.totals.shifts * 3, p.totals.paidHours);
  assert.equal(p.totals.cost, p.totals.paidHours * 22);
});

test("the schedule covers every interval and never costs more than flat peak staffing", () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    let x = seed * 9301 + 49297;
    const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    const rows = [];
    for (let i = 0; i < 16 + Math.floor(rnd() * 10); i += 1) {
      const m = 7 * 60 + i * 30;
      rows.push(`Mon,${clock(m)},${Math.floor(rnd() * 60)}`);
    }
    const p = plan(parseDemand(rows.join("\n")), { shifts: "8,6,4", shrinkage: 25 });
    for (const s of p.days[0].slots) assert.ok(s.scheduled >= s.required, `seed ${seed} ${s.time}`);
    assert.ok(p.totals.cost <= p.totals.flatPeak + 1e-6, `seed ${seed}`);
  }
});

test("min-cost flow equals trying every combination of shifts", () => {
  let checked = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    let x = seed * 7919 + 13;
    const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    const T = 4 + Math.floor(rnd() * 3);
    const demand = Array.from({ length: T }, () => Math.floor(rnd() * 4));
    const o = normalizeOptions({ intervalMinutes: 60, startStepMinutes: 60, shifts: "2,3", minShiftHours: 1, wage: 10 });
    const cands = candidateShifts(T, o, o.shifts);
    const got = minCostCover(demand, cands, o.wage);
    // brute force
    const top = Math.max(...demand);
    let best = Infinity;
    const counts = new Array(cands.length).fill(0);
    const rec = (i) => {
      if (i === cands.length) {
        const cov = new Array(T).fill(0);
        cands.forEach((c, j) => { for (let t = c.start; t < c.end; t += 1) cov[t] += counts[j]; });
        if (cov.every((v, t) => v >= demand[t])) best = Math.min(best, counts.reduce((a, n, j) => a + n * cands[j].hours * o.wage, 0));
        return;
      }
      for (let n = 0; n <= Math.min(top, 3); n += 1) { counts[i] = n; rec(i + 1); }
    };
    if (cands.length <= 11) rec(0);
    else continue;
    checked += 1;
    if (best === Infinity) assert.equal(got, null, `seed ${seed}`);
    else assert.equal(got.cost, best, `seed ${seed} demand ${demand}`);
  }
  assert.ok(checked >= 30, `only ${checked} cases were small enough to brute force`);
});

test("a window shorter than the shortest shift cannot be staffed and says so", () => {
  assert.throws(() => plan(parseDemand("Mon,09:00,20\nMon,09:30,20"), {}), /No allowed shift can cover Mon/);
});

test("comparisons, cost curve and what-ifs move the right way", () => {
  const text = [];
  for (let i = 0; i < 18; i += 1) text.push(`Mon,${clock(8 * 60 + i * 30)},${[10, 20, 35, 40, 38, 30, 25, 28, 30, 32, 30, 24, 20, 18, 14, 10, 8, 5][i]}`);
  const parsed = parseDemand(text.join("\n"));
  const p = plan(parsed, {});
  for (let i = 1; i < p.curve.length; i += 1) assert.ok(p.curve[i].cost >= p.curve[i - 1].cost);
  assert.equal(p.curve.find((c) => c.current).cost, p.totals.cost);
  assert.ok(p.totals.flatPeak >= p.totals.cost);
  assert.ok(p.totals.fullShiftOnly >= p.totals.cost);
  const byLabel = Object.fromEntries(p.whatIf.map((w) => [w.label, w]));
  assert.ok(byLabel["Handle time 10% shorter"].delta <= 0);
  assert.ok(byLabel["Contacts 10% higher"].delta >= 0);
  assert.ok(byLabel["Shrinkage 5 points higher"].delta >= 0);
  assert.ok(byLabel["Shrinkage 5 points lower"].delta <= 0);
  assert.ok(p.totals.occupancyRuleMissedIntervals > 0);
  assert.ok(p.totals.occupancyRuleWorstServiceLevel < 80);
  assert.match(summarize(p).text, /^Staff \d+ shifts?/);
  // Delivered service level meets the target in every interval that has contacts.
  for (const s of p.days[0].slots) if (s.contacts > 0) assert.ok(s.serviceLevel >= 80 - 1e-9);
});

test("rows off the interval grid are refused, gaps count as zero contacts", () => {
  assert.throws(() => plan(parseDemand("Mon,09:10,5"), {}), /not on the 30-minute grid/);
  const p = plan(parseDemand("Mon,09:00,30\nMon,12:00,30\nMon,12:30,30\nMon,13:00,30"), { shifts: "3", minShiftHours: 2 });
  assert.equal(p.days[0].slots.length, 9);
  assert.equal(p.days[0].slots[3].contacts, 0);
});

test("money formatter", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-3), "-$3.00");
});
