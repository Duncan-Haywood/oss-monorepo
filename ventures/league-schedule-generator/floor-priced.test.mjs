// A timetable search priced on the proved break floor (README "Pricing the break floor",
// carryover.mjs floorPricedSingleRounds) and the incremental floor it uses (orient.mjs floorTable).
import test from "node:test";
import assert from "node:assert/strict";
import { floorTable, leastBreaks, countBreaks } from "./orient.mjs";
import { floorPricedSingleRounds, threeRoundDeals, carryOverTry, carryOver, circleOpp } from "./carryover.mjs";
import { mulberry32 } from "./calc.mjs";

const coeOf = (rounds, n) => carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds }).value;
function oppOf(rounds, n) {
  const N = n % 2 ? n + 1 : n;
  return rounds.map((rd) => {
    const o = new Int16Array(N).fill(N - 1);
    for (const [a, b] of rd.matches) { o[a] = b; o[b] = a; }
    return o;
  });
}

test("floorTable prices a changed timetable as the whole programme does, rounds swapped and kept or undone", () => {
  for (const N of [6, 10, 14]) for (const n of [N, N - 1]) {
    const opp = circleOpp(N).map((o) => Int16Array.from(o));
    const R = opp.length, tb = floorTable(opp, n), rand = mulberry32(N * 7 + n);
    assert.equal(tb.floor, leastBreaks(opp, n, { budget: 0 }).floor);
    for (let i = 0; i < 60; i++) {
      const r = Math.floor(rand() * R), s = Math.floor(rand() * R);
      if (r === s) continue;
      [opp[r], opp[s]] = [opp[s], opp[r]];
      assert.equal(tb.trial(Math.min(r, s)), leastBreaks(opp, n, { budget: 0 }).floor, `${n} teams, move ${i}`);
      if (rand() < 0.5) tb.commit(); else [opp[r], opp[s]] = [opp[s], opp[r]];
    }
  }
});

test("floorTable refuses a timetable too big for the programme", () => {
  assert.equal(floorTable(circleOpp(28), 28), null);
});

for (const n of [8, 9, 12, 13]) {
  test(`floorPricedSingleRounds: a valid ${n}-team single round robin within its cap, recounted`, () => {
    const start = carryOverTry(n, 0, { seed: 1, weighted: 8 });
    const cap = Math.max(0, start.breaks - 2);
    const r = floorPricedSingleRounds(n, start, { seed: 2, maxBreaks: cap, iterations: 400 });
    assert.ok(r && r.floorPriced);
    const N = n % 2 ? n + 1 : n;
    assert.equal(r.rounds.length, N - 1);
    const met = new Set();
    for (const rd of r.rounds) {
      const seen = new Set();
      for (const [h, a] of rd.matches) {
        assert.ok(!seen.has(h) && !seen.has(a), "nobody twice in a round");
        seen.add(h); seen.add(a);
        const k = `${Math.min(h, a)}-${Math.max(h, a)}`;
        assert.ok(!met.has(k), "every pair once"); met.add(k);
      }
    }
    assert.equal(met.size, (n * (n - 1)) / 2);
    const opp = oppOf(r.rounds, n);
    const venues = r.rounds.map((rd) => { const v = new Uint8Array(N); for (const [h] of rd.matches) v[h] = 1; return v; });
    for (let t = 0; t < n; t++) {
      let h = 0, g = 0;
      for (let x = 0; x < opp.length; x++) if (opp[x][t] < n) { g++; h += venues[x][t]; }
      assert.ok(Math.abs(2 * h - g) <= 1, `team ${t} balanced`);
    }
    assert.equal(countBreaks(venues, opp, n), r.breaks);
    assert.equal(coeOf(r.rounds, n), r.coe);
    assert.ok(r.floor <= r.breaks);
    // the grounds are the least this timetable allows
    assert.equal(leastBreaks(opp, n).least, r.breaks);
    assert.ok(r.breaks <= cap || r.breaks <= start.breaks, "within the cap, or no worse than the start");
  });
}

test("floorPricedSingleRounds is seeded, and refuses what it cannot take", () => {
  const start = carryOverTry(10, 0, { seed: 1, weighted: 8 });
  const a = floorPricedSingleRounds(10, start, { seed: 3, maxBreaks: 6, iterations: 300 });
  const b = floorPricedSingleRounds(10, start, { seed: 3, maxBreaks: 6, iterations: 300 });
  assert.deepEqual(a, b);
  assert.throws(() => floorPricedSingleRounds(10, start, { maxBreaks: -1 }));
  assert.throws(() => floorPricedSingleRounds(26, start, { maxBreaks: 10 }));
  assert.throws(() => floorPricedSingleRounds(12, start, { maxBreaks: 10 }));
});

test("floorPricedSingleRounds at 20 teams: 360 / 50 to a 48-break cap gives 410 / 48 on swaps, 384 / 48 with re-deals (seed 1)", { timeout: 180000 }, () => {
  const start = carryOverTry(20, 0, { seed: 1, weighted: 8 });
  assert.equal(start.coe, 360);
  const swaps = floorPricedSingleRounds(20, start, { seed: 1, maxBreaks: 48, iterations: 6000, deals: 0 });
  assert.equal(`${swaps.coe}/${swaps.breaks}`, "410/48");
  assert.ok(swaps.leastProved);
  const dealt = floorPricedSingleRounds(20, start, { seed: 1, maxBreaks: 48, iterations: 6000 });
  assert.equal(`${dealt.coe}/${dealt.breaks}`, "384/48", "the default neighbourhood re-deals three rounds");
  assert.ok(dealt.leastProved);
});

test("floorPricedSingleRounds never returns more breaks than the season it started from", () => {
  for (const n of [9, 13]) {
    const start = carryOverTry(n, 0, { seed: 1, weighted: 8 });
    for (const deals of [0, 0.15]) {
      const r = floorPricedSingleRounds(n, start, { seed: 2, maxBreaks: Math.max(0, start.breaks - 2), iterations: 400, deals });
      assert.ok(r.breaks <= start.breaks, `${n} teams, deals ${deals}: ${r.breaks} breaks against the start's ${start.breaks}`);
    }
  }
});

test("carryOverFloorPriced: seasons into the widest gap, on the frontier, numbered after the results, seeded; none for home and away", async () => {
  const { carryOverFloorPriced } = await import("./carryover.mjs");
  const n = 12, tries = [];
  for (let i = 0; i < 12; i++) tries.push(carryOverTry(n, i, { seed: 1, weighted: 8 }));
  const out = carryOverFloorPriced(n, tries, { seed: 1, count: 2, minGap: 2, iterations: 400 });
  const again = carryOverFloorPriced(n, tries, { seed: 1, count: 2, minGap: 2, iterations: 400 });
  assert.deepEqual(out, again);
  out.forEach((s, k) => {
    assert.equal(s.index, tries.length + k);
    assert.ok(Number.isInteger(s.floorPricedFrom));
    assert.ok(!tries.some((t) => t.coe <= s.coe && t.breaks <= s.breaks), `${s.coe}/${s.breaks} is beaten by a try`);
  });
  const d = [carryOverTry(8, 0, { seed: 1, weighted: 8, double: true })];
  assert.deepEqual(carryOverFloorPriced(8, d, { seed: 1 }), []);
});

test("carryOverFloorPriced runs at 22 teams in the page, not at 23 (README \"A faster break floor\")", async () => {
  const { carryOverFloorPriced } = await import("./carryover.mjs");
  // a list whose frontier has a 10-break gap and empty timetables: at 23 the size gate returns [],
  // at 22 the call gets past it into the search, which throws on the empty timetable
  const fake = (n, coe, breaks, index) => ({ rounds: Array.from({ length: n % 2 ? n : n - 1 }, () => ({ matches: [] })), coe, breaks, index });
  assert.deepEqual(carryOverFloorPriced(23, [fake(23, 500, 50, 0), fake(23, 900, 40, 1)], { seed: 1 }), []);
  assert.throws(() => carryOverFloorPriced(22, [fake(22, 500, 50, 0), fake(22, 900, 40, 1)], { seed: 1, iterations: 1 }));
});

test("bestCarryOverRounds keeps its choice with floor-priced seasons, and buildSchedule rebuilds a kept one", async () => {
  const { bestCarryOverRounds, carryOverKeepText } = await import("./carryover.mjs");
  const { buildSchedule, readSpec, validateSchedule } = await import("./calc.mjs");
  const n = 10, opts = { seed: 1, tries: 4, capped: 2, gap: 2 };
  const plain = bestCarryOverRounds(n, opts);
  const withF = bestCarryOverRounds(n, { ...opts, floorPriced: 2 });
  assert.equal(withF.chosen, plain.chosen);
  assert.deepEqual(withF.rounds, plain.rounds);
  assert.throws(() => bestCarryOverRounds(n, { ...opts, floorPriced: -1 }), /floorPriced/);
  const at = withF.tries.length - 1;
  assert.ok(at >= plain.tries.length, "a floor-priced season is listed");
  const listed = withF.tries[at];
  assert.ok(!plain.tries.some((t) => t.coe <= listed.coe && t.breaks <= listed.breaks), "it joins the frontier");
  const fields = { teams: "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ", start: "2026-01-05", weekdays: ["Mon"], carryOver: true, double: false, seed: 1, carryOverKeep: carryOverKeepText(at, { n, double: false, seed: 1 }) };
  const { spec } = readSpec(fields);
  const s = buildSchedule({ ...spec, carryOverTries: 4, carryOverCapped: 2, carryOverGap: 2, carryOverFloorPriced: 2 });
  assert.deepEqual(validateSchedule(s).errors, []);
  assert.equal(s.carryOverSearch.chosen, at);
  assert.equal(s.stats.carryOver.value, listed.coe);
});

// Re-dealing three rounds at once (README "Re-dealing three rounds at once", threeRoundDeals).

test("threeRoundDeals lists every way to re-deal three rounds, the current one included", () => {
  for (const N of [6, 8, 10, 12]) {
    const opp = circleOpp(N).map((o) => Int16Array.from(o));
    const R = opp.length, rand = mulberry32(N * 31 + 5);
    for (let i = 0; i < 8; i++) {
      const rs = [];
      while (rs.length < 3) { const q = Math.floor(rand() * R); if (!rs.includes(q)) rs.push(q); }
      const deals = threeRoundDeals(opp, rs);
      assert.ok(deals.length >= 1, `${N} teams, rounds ${rs}: no deal`);
      const was = rs.map((q) => opp[q]);
      const keys = new Set();
      for (const d of deals) {
        assert.equal(d.length, 3);
        for (const p of d) {
          for (let x = 0; x < N; x++) {
            assert.equal(p[p[x]], x, "a partner array pairs both ways");
            assert.notEqual(p[x], x, "nobody plays themselves");
          }
        }
        // every team keeps its three opponents of these rounds, one in each round
        for (let x = 0; x < N; x++) {
          const got = [d[0][x], d[1][x], d[2][x]].slice().sort((a, b) => a - b);
          const had = rs.map((q) => opp[q][x]).sort((a, b) => a - b);
          assert.deepEqual(got, had, `${N} teams, team ${x}`);
        }
        keys.add(d.map((p) => p.join(",")).join(";"));
      }
      assert.equal(keys.size, deals.length, "no deal listed twice");
      assert.ok(keys.has(was.map((p) => [...p].join(",")).join(";")), "the rounds as they are are one of the deals");
    }
  }
});

test("threeRoundDeals keeps a valid round robin, and its cap holds", () => {
  const n = 10, opp = circleOpp(n).map((o) => Int16Array.from(o));
  const rs = [0, 4, 7];
  const deals = threeRoundDeals(opp, rs);
  for (const d of deals.slice(0, 20)) {
    const trial = opp.map((o) => Int16Array.from(o));
    for (let j = 0; j < 3; j++) trial[rs[j]].set(d[j]);
    const seen = new Set();
    for (const rd of trial) for (let x = 0; x < n; x++) if (x < rd[x]) seen.add(`${x}-${rd[x]}`);
    assert.equal(seen.size, (n * (n - 1)) / 2, "every pair still meets exactly once");
  }
  assert.ok(threeRoundDeals(opp, rs, 3).length <= 3, "the cap stops the list");
});

test("floorPricedSingleRounds with re-deals stays valid and seeded", () => {
  const n = 12, start = carryOverTry(n, 0, { seed: 1, weighted: 8 });
  const opts = { seed: 4, maxBreaks: 20, iterations: 300, deals: 0.2 };
  const a = floorPricedSingleRounds(n, start, opts);
  const b = floorPricedSingleRounds(n, start, opts);
  assert.ok(a, "a season came back");
  assert.deepEqual(JSON.stringify(b.rounds), JSON.stringify(a.rounds), "same seed, same season");
  const seen = new Set();
  for (const rd of a.rounds) {
    const played = new Set();
    for (const [h, v] of rd.matches) {
      assert.ok(!played.has(h) && !played.has(v), "nobody plays twice in a round");
      played.add(h); played.add(v);
      seen.add([h, v].sort((x, y) => x - y).join("-"));
    }
  }
  assert.equal(seen.size, (n * (n - 1)) / 2, "every pair meets once");
  const home = new Array(n).fill(0), away = new Array(n).fill(0);
  for (const rd of a.rounds) for (const [h, v] of rd.matches) { home[h]++; away[v]++; }
  for (let t = 0; t < n; t++) assert.ok(Math.abs(home[t] - away[t]) <= 1, `team ${t} balanced`);
  assert.equal(a.coe, coeOf(a.rounds, n), "carry-over recounted");
  const oppA = oppOf(a.rounds, n);
  const venA = a.rounds.map((rd) => { const v = new Uint8Array(n); for (const [h] of rd.matches) v[h] = 1; return v; });
  assert.equal(a.breaks, countBreaks(venA, oppA, n), "breaks recounted");
  assert.ok(a.dealt > 0, "some moves were re-deals");
});

test("floorTable.balanced gives leastBreaks' balanced least from the table it already holds, or null over the cap", () => {
  let unbalancedFloors = 0;
  for (const n of [8, 9, 12, 13, 14]) for (let i = 0; i < 6; i++) {
    const t = carryOverTry(n, i, { seed: 1, weighted: 8 });
    const opp = oppOf(t.rounds, n).map((o, r) => { if (t.rounds[r].bye != null) o[t.rounds[r].bye] = o.length - 1; return o; });
    const x = leastBreaks(opp, n, { seed: 1 });
    assert.ok(x && x.proved, `${n}/${i}: proved`);
    const tb = floorTable(opp, n);
    assert.equal(tb.floor, x.floor);
    if (x.least > x.floor) unbalancedFloors++;
    // at the cap the least sits on: found; one under it: proved none
    assert.equal(tb.balanced(x.least).least, x.least, `${n}/${i}: at the least`);
    assert.equal(tb.balanced(x.least + 3).least, x.least, `${n}/${i}: above the least`);
    if (x.least > x.floor) {
      const b = tb.balanced(x.least - 1);
      assert.equal(b.least, null);
      assert.equal(b.proved, true);
    }
    if (x.floor > 0) assert.deepEqual(tb.balanced(x.floor - 1), { least: null, proved: true, floor: x.floor });
    // after a trial it reads the trial's table, not the committed one
    [opp[0], opp[1]] = [opp[1], opp[0]];
    tb.trial(0);
    assert.equal(tb.balanced(40).least, leastBreaks(opp, n, { seed: 1 }).least, `${n}/${i}: trial`);
  }
  assert.ok(unbalancedFloors >= 1, "some timetable's balanced least sits above its floor");
});

test("floorPricedSingleRounds priced on the balanced least: within the cap where the floor alone ends over it (17 teams)", () => {
  const start = carryOverTry(17, 0, { seed: 1, weighted: 8 });
  const cap = start.breaks - 4;
  const off = floorPricedSingleRounds(17, start, { seed: 3, maxBreaks: cap, iterations: 1500, balanced: false });
  const on = floorPricedSingleRounds(17, start, { seed: 3, maxBreaks: cap, iterations: 1500 });
  assert.ok(on.walks > 0 && off.walks === 0);
  assert.ok(on.breaks <= cap, `balanced pricing within the cap (${on.coe}/${on.breaks}, cap ${cap})`);
  assert.ok(off.breaks > cap || on.coe <= off.coe, `floor alone: ${off.coe}/${off.breaks}`);
  const opp = oppOf(on.rounds, 17).map((o, r) => { if (on.rounds[r].bye != null) o[on.rounds[r].bye] = 17; return o; });
  const v = on.rounds.map((rd) => { const x = new Uint8Array(18); for (const [h] of rd.matches) x[h] = 1; return x; });
  assert.equal(countBreaks(v, opp, 17), on.breaks);
  assert.equal(coeOf(on.rounds, 17), on.coe);
});
