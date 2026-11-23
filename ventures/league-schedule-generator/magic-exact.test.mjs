// Magic numbers against a brute force: on random part-played leagues small enough to enumerate, the
// smallest e such that every total of e or more from a team's own games leaves it in a place (ties lost)
// must equal what playoffRace reports through the enumeration and through the branch and bound, and the
// magic number must be set wherever the old every-rival-wins-out bound set one.
import test from "node:test";
import assert from "node:assert/strict";
import { roundRobin, playoffRace, mulberry32 } from "./calc.mjs";
import { matchOutcomes, matchPoints } from "./standings.mjs";
import { exactMagic, canStopAt } from "./race-exact.mjs";

function league(rnd, maxLeft) {
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const n = int(3, 7);
  const teams = Array.from({ length: n }, (_, k) => `T${k + 1}`);
  const fixtures = roundRobin(n, { double: rnd() < 0.4 }).flatMap((r) => r.matches).map((m) => (Array.isArray(m) ? m : [m.home, m.away]));
  const order = fixtures.map((f) => [rnd(), f]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const nLeft = int(0, Math.min(maxLeft, order.length));
  const remaining = order.slice(0, nLeft);
  const results = order.slice(nLeft).map(([a, b]) => ({ a, b, ga: int(0, 3), gb: int(0, 3) }));
  const scoring = [{ win: 3, draw: 1, loss: 0 }, { win: 2, draw: 1, loss: 0 }, { win: 3, draw: 1, loss: 0, setScoring: true }][int(0, 2)];
  const adjustments = rnd() < 0.2 ? { [int(0, n - 1)]: int(-3, 3) } : {};
  return { teams, remaining, results, scoring, adjustments, spots: int(1, n) };
}

// brute force: for each team, the totals it can take and the totals after which some finish leaves it out
function bruteMagic(L) {
  const n = L.teams.length;
  const k = Math.max(1, Math.min(L.spots, n));
  const pts = Array.from({ length: n }, (_, i) => L.adjustments[i] ?? 0);
  for (const r of L.results) { const [pa, pb] = matchPoints(r.ga, r.gb, L.scoring); pts[r.a] += pa; pts[r.b] += pb; }
  const outcomes = matchOutcomes(L.scoring);
  const can = Array.from({ length: n }, () => new Set());
  const bad = Array.from({ length: n }, () => new Set());
  const cur = pts.slice();
  const walk = (f) => {
    if (f === L.remaining.length) {
      for (let i = 0; i < n; i++) {
        const e = cur[i] - pts[i];
        can[i].add(e);
        if (cur.filter((p, j) => j !== i && p >= cur[i]).length + 1 > k) bad[i].add(e);
      }
      return;
    }
    const [a, b] = L.remaining[f];
    for (const [x, y] of outcomes) { cur[a] += x; cur[b] += y; walk(f + 1); cur[a] -= x; cur[b] -= y; }
  };
  walk(0);
  return { pts, k, outcomes, magic: can.map((c, i) => {
    let m = null;
    for (const e of [...c].filter((e) => e >= 1).sort((x, y) => y - x)) { if (bad[i].has(e)) break; m = e; }
    return m;
  }) };
}

test("exact magic equals the brute force, through the enumeration and the branch and bound", () => {
  const rnd = mulberry32(21);
  let checked = 0, tighter = 0;
  for (let t = 0; t < 300; t++) {
    const L = league(rnd, 9);
    const B = bruteMagic(L);
    const opts = { ...L.scoring, adjustments: L.adjustments };
    const en = playoffRace(L.teams, L.results, L.remaining, L.spots, { ...opts, exactLimit: 12 });
    const bb = playoffRace(L.teams, L.results, L.remaining, L.spots, { ...opts, exactLimit: 0, nodeBudget: 1e6, magicBudget: 1e6 });
    for (const rows of [en, bb]) {
      for (const r of rows) {
        if (r.status !== "alive") { assert.equal(r.magic, null); continue; }
        assert.equal(r.magic, B.magic[r.index], `league ${t} team ${r.index} (${rows === en ? "enumeration" : "search"})`);
        if (r.magicBound != null) assert.ok(r.magic != null, `league ${t} team ${r.index}: the bound clinched, the search did not`);
        if (rows === bb) { checked++; if (r.magic != null && (r.magicBound == null || r.magic < r.magicBound)) tighter++; }
      }
    }
    // the search on its own, every team (alive or not), equals the brute force
    for (let i = 0; i < L.teams.length; i++) {
      const q = exactMagic(B.pts, L.remaining, i, B.k, B.outcomes, { budget: 1e6 });
      assert.ok(q.proved);
      if (q.magic !== B.magic[i]) assert.fail(`league ${t} team ${i}: search ${q.magic}, brute ${B.magic[i]}`);
    }
  }
  assert.ok(checked > 300, `only ${checked} alive rows`);
  assert.ok(tighter > 0, "the search never beat the bound");
});

test("a tiny budget never gives a magic number below the truth", () => {
  const rnd = mulberry32(22);
  for (let t = 0; t < 200; t++) {
    const L = league(rnd, 9);
    const B = bruteMagic(L);
    for (const budget of [1, 5, 30]) {
      const rows = playoffRace(L.teams, L.results, L.remaining, L.spots, { ...L.scoring, adjustments: L.adjustments, exactLimit: 0, nodeBudget: budget, magicBudget: budget });
      for (const r of rows) {
        if (r.magic == null || B.magic[r.index] == null) { if (r.magic != null) assert.fail(`league ${t} team ${r.index}: magic ${r.magic} where no total clinches`); continue; }
        assert.ok(r.magic >= B.magic[r.index], `league ${t} team ${r.index} budget ${budget}`);
      }
    }
  }
});

test("two chasers who meet: the leader needs fewer points than the bound says", () => {
  // Two places. A on 60 with three games left against the bottom two; B and C on 57 with three each:
  // two against each other and one against the bottom. The bound lets B and C both win out to 66, so A
  // "needs 7". But B and C share at most 6 points in their two meetings, so together they reach at most
  // 57 + 57 + 12 = 126: if A gets to 64 (4 points) they cannot both reach it. At 63 (3 points) they can,
  // each winning one meeting and its bottom game, and a tie at the cut counts against A. So 4.
  // B and C get 7 too (win out), where the bound had no number at all (A can reach 69).
  const teams = ["A", "B", "C", "D", "E"];
  const adjustments = { 0: 60, 1: 57, 2: 57, 3: 10, 4: 10 };
  const remaining = [[1, 2], [2, 1], [1, 3], [2, 4], [0, 3], [0, 4], [0, 3]];
  const rows = playoffRace(teams, [], remaining, 2, { adjustments, exactLimit: 0 });
  const a = rows.find((r) => r.index === 0);
  const truth = bruteMagic({ teams, remaining, results: [], scoring: { win: 3, draw: 1, loss: 0 }, adjustments, spots: 2 }).magic[0];
  assert.equal(a.magic, truth);
  assert.equal(a.magic, 4);
  assert.equal(a.magicBound, 7);
  const b = rows.find((r) => r.index === 1);
  assert.equal(b.magic, 7);
  assert.equal(b.magicBound, null);
  assert.ok(a.magic < a.magicBound, `magic ${a.magic} bound ${a.magicBound}`);
  assert.equal(canStopAt([60, 57, 57, 10, 10], remaining, 0, a.magic, 2, [[3, 0], [1, 1], [0, 3]]).stops, false);
});
