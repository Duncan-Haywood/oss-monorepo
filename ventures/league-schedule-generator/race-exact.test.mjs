// race-exact.mjs against the full enumeration: on random part-played leagues small enough to enumerate,
// the branch and bound's best and worst ranks must equal the enumeration's when it says it proved them,
// and under a tiny budget it must never claim a "clinched" or "eliminated" the enumeration denies.
import test from "node:test";
import assert from "node:assert/strict";
import { roundRobin, playoffRace, mulberry32 } from "./calc.mjs";
import { extremeCount, monotone } from "./race-exact.mjs";

function league(rnd, maxLeft) {
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const n = int(3, 8);
  const teams = Array.from({ length: n }, (_, k) => `T${k + 1}`);
  const fixtures = roundRobin(n, { double: rnd() < 0.4 }).flatMap((r) => r.matches).map((m) => (Array.isArray(m) ? m : [m.home, m.away]));
  const order = fixtures.map((f) => [rnd(), f]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const nLeft = int(0, Math.min(maxLeft, order.length));
  const remaining = order.slice(0, nLeft);
  const results = order.slice(nLeft).map(([a, b]) => ({ a, b, ga: int(0, 3), gb: int(0, 3) }));
  const scoring = [{ win: 3, draw: 1, loss: 0 }, { win: 2, draw: 1, loss: 0 }, { win: 3, draw: 1, loss: 0, setScoring: true }][int(0, 2)];
  const adjustments = rnd() < 0.2 ? { [int(0, n - 1)]: int(-3, 3) } : {};
  return { teams, remaining, results, opts: { ...scoring, adjustments }, spots: int(1, n) };
}

test("monotone point systems", () => {
  assert.ok(monotone([[3, 0], [1, 1], [0, 3]]));
  assert.ok(monotone([[3, 0], [1, 1], [0, 3], [2, 1], [1, 2]]));
  assert.ok(!monotone([[3, 0], [2, 2], [0, 2]]));
});

test("branch and bound equals the enumeration when proved", () => {
  const rnd = mulberry32(11);
  let provedRows = 0;
  for (let t = 0; t < 400; t++) {
    const L = league(rnd, 10);
    const truth = playoffRace(L.teams, L.results, L.remaining, L.spots, { ...L.opts, exactLimit: 12 });
    if (!truth.exact) continue; // set scoring has five outcomes, so fewer fixtures enumerate
    const bb = playoffRace(L.teams, L.results, L.remaining, L.spots, { ...L.opts, exactLimit: 0, nodeBudget: 1e6 });
    const byIndex = new Map(truth.map((r) => [r.index, r]));
    assert.ok(bb.proved, `league ${t} not proved`);
    for (const r of bb) {
      const e = byIndex.get(r.index);
      assert.equal(r.bestRank, e.bestRank, `league ${t} team ${r.index} best`);
      assert.equal(r.worstRank, e.worstRank, `league ${t} team ${r.index} worst`);
      assert.equal(r.status, e.status, `league ${t} team ${r.index} status`);
      assert.equal(r.clinchedUnlessTied, e.clinchedUnlessTied, `league ${t} team ${r.index} unless tied`);
      provedRows++;
    }
  }
  assert.ok(provedRows > 1000);
});

test("a tiny budget never claims what the enumeration denies", () => {
  const rnd = mulberry32(12);
  for (let t = 0; t < 300; t++) {
    const L = league(rnd, 12);
    const truth = playoffRace(L.teams, L.results, L.remaining, L.spots, { ...L.opts, exactLimit: 12 });
    if (!truth.exact) continue;
    const byIndex = new Map(truth.map((r) => [r.index, r]));
    for (const budget of [1, 5, 30]) {
      const bb = playoffRace(L.teams, L.results, L.remaining, L.spots, { ...L.opts, exactLimit: 0, nodeBudget: budget });
      for (const r of bb) {
        const e = byIndex.get(r.index);
        assert.ok(r.bestRank <= e.bestRank && r.worstRank >= e.worstRank, `league ${t} team ${r.index} budget ${budget}`);
        if (r.status !== "alive") assert.equal(r.status, e.status);
      }
    }
  }
});

test("two chasers who still meet twice cannot both pass the leader: bounds said alive, the search says clinched", () => {
  // A has 61 and is done. B and C have 54 and three games each: two against each other, one against the
  // bottom group. Either can reach 63 alone; together they share at most 12 points and need 14.
  // 14 more fixtures among the bottom five push the table past the 12-fixture enumeration.
  const teams = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const base = [61, 54, 54, 10, 10, 9, 8, 7];
  const results = [];
  // points through walkovers of 3-0 against a ninth "ghost" would distort the table, so set them directly
  const adjustments = Object.fromEntries(base.map((p, i) => [i, p]));
  const remaining = [[1, 2], [2, 1], [1, 3], [2, 4]];
  const low = [3, 4, 5, 6, 7];
  for (let x = 0; x < low.length; x++) for (let y = x + 1; y < low.length; y++) remaining.push([low[x], low[y]]);
  remaining.push([3, 4], [5, 6], [6, 7], [3, 7]);
  assert.ok(remaining.length > 12);
  const bounds = playoffRace(teams, results, remaining, 2, { adjustments, nodeBudget: 0 });
  const exact = playoffRace(teams, results, remaining, 2, { adjustments });
  const a = (rows) => rows.find((r) => r.index === 0);
  assert.equal(a(bounds).status, "alive");
  assert.equal(a(bounds).worstRank, 3);
  assert.equal(a(exact).status, "clinched");
  assert.equal(a(exact).worstRank, 2);
  assert.ok(exact.proved);
});
