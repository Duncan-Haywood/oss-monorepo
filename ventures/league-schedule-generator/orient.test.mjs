// The exact break programme (orient.mjs): the least breaks a fixed timetable allows, in the page.
import test from "node:test";
import assert from "node:assert/strict";
import { leastBreaks, countBreaks, relaxedBreakFloor } from "./orient.mjs";
import { carryOverTry, polishSeasonVenues, circleOpp } from "./carryover.mjs";

function oppOf(rounds, n) {
  const N = n % 2 ? n + 1 : n;
  return rounds.map((rd) => {
    const o = new Int16Array(N).fill(N - 1);
    for (const [a, b] of rd.matches) { o[a] = b; o[b] = a; }
    return o;
  });
}
function balanced(venues, opp, n, span = opp.length) {
  for (let t = 0; t < n; t++) {
    let h = 0, g = 0;
    for (let r = 0; r < span; r++) if (opp[r][t] < n) { g++; h += venues[r][t]; }
    if (Math.abs(2 * h - g) > 1) return false;
  }
  return true;
}
// every host choice of a small timetable, counted: the programme must agree with brute force
function brute(opp, n) {
  const ms = [];
  opp.forEach((o, r) => { for (let t = 0; t < n; t++) if (o[t] < n && t < o[t]) ms.push([r, t, o[t]]); });
  let floor = Infinity, least = Infinity;
  for (let x = 0; x < 1 << ms.length; x++) {
    const v = opp.map((o) => new Uint8Array(o.length));
    ms.forEach(([r, a, b], k) => { const h = (x >>> k) & 1; v[r][a] = h; v[r][b] = 1 - h; });
    const b = countBreaks(v, opp, n);
    if (b < floor) floor = b;
    if (b < least && balanced(v, opp, n)) least = b;
  }
  return { floor, least };
}

test("leastBreaks agrees with every host choice counted, 6 teams and 5 teams (byes)", () => {
  for (const n of [5, 6]) for (let i = 0; i < 6; i++) {
    const t = carryOverTry(n, i, { seed: 1 + i, weighted: 8 });
    const opp = oppOf(t.rounds, n);
    const r = leastBreaks(opp, n, { seed: i + 1 });
    const b = brute(opp, n);
    assert.equal(r.floor, b.floor, `${n}/${i} floor`);
    assert.equal(r.least, b.least, `${n}/${i} least`);
    assert.ok(r.proved);
    assert.equal(countBreaks(r.venues, opp, n), r.least);
    assert.ok(balanced(r.venues, opp, n));
  }
});

test("the circle method allows the textbook n - 2 breaks", () => {
  for (const n of [8, 10, 12]) {
    const r = leastBreaks(circleOpp(n), n);
    assert.equal(r.least, n - 2);
    assert.ok(r.proved && r.balanced);
  }
});

test("20 teams' 360 timetable: 50 breaks, as eval/orient-maxsat.py proved, in the page", () => {
  const t = carryOverTry(20, 0, { seed: 1, weighted: 8 });
  assert.equal(t.coe, 360);
  const opp = oppOf(t.rounds, 20);
  const r = leastBreaks(opp, 20);
  assert.equal(r.least, 50);
  assert.ok(r.proved && r.balanced);
  assert.equal(countBreaks(r.venues, opp, 20), 50);
  assert.ok(balanced(r.venues, opp, 20));
});

test("an unbalanced floor: the least balanced host choice is proved above it (14 teams, try 4)", () => {
  const t = carryOverTry(14, 4, { seed: 1, weighted: 8 });
  const r = leastBreaks(oppOf(t.rounds, 14), 14);
  assert.equal(r.floor, 18);
  assert.equal(r.least, 20); // eval/orient-maxsat.py: 20
  assert.ok(r.proved);
});

test("too big or out of budget: null, or the floor with least null", () => {
  assert.equal(leastBreaks(circleOpp(26), 26), null);
  const t = carryOverTry(20, 5, { seed: 1, weighted: 8 });
  const r = leastBreaks(oppOf(t.rounds, 20), 20, { budget: 1000 });
  assert.equal(r.floor, 34);
  assert.equal(r.least, null);
  assert.equal(r.proved, false);
  assert.equal(r.breaks, 34);
});

test("relaxedBreakFloor never exceeds a home-and-away season's breaks", () => {
  for (const n of [8, 9, 10]) {
    const t = carryOverTry(n, 0, { seed: 1, weighted: 8, double: true });
    const f = relaxedBreakFloor(oppOf(t.rounds, n), n);
    assert.ok(f <= t.breaks, `${n}: ${f} > ${t.breaks}`);
  }
});

test("polishSeasonVenues reaches 18 teams' 348 / 38 and 20 teams' 360 / 50, proved", () => {
  for (const [n, coe, least] of [[18, 348, 38], [20, 360, 50]]) {
    const t = carryOverTry(n, 0, { seed: 1, weighted: 8 });
    assert.equal(t.coe, coe);
    const p = polishSeasonVenues(n, t, { seed: 1 });
    assert.ok(p, `${n} regrounded`);
    assert.equal(p.breaks, least);
    assert.equal(p.coe, coe);
    assert.equal(p.leastProved, true);
  }
});
