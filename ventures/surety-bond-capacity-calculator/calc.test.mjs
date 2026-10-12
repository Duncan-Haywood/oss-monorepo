import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze, backlogAt, bestSet, cleanBids, cleanJobs, cleanShared, earliestFitMonth, expectedProfit, limits,
  overcommitProbability, premiumFor, solvePrice, toCsv, workingCapitalNeeded,
  EXAMPLE_BIDS, EXAMPLE_JOBS, EXAMPLE_SHARED, SHARED_DEFAULTS,
} from "./calc.mjs";

const sh = cleanShared(EXAMPLE_SHARED);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("premium charges each slice of the price at its own rate", () => {
  near(premiumFor(100000, sh), 2500); // 100 x $25
  near(premiumFor(500000, sh), 2500 + 400 * 15); // + 400 x $15
  near(premiumFor(1000000, sh), 2500 + 6000 + 500 * 12);
  near(premiumFor(6000000, sh), 2500 + 6000 + 2000 * 12 + 2500 * 10 + 1000 * 7.5);
  assert.equal(premiumFor(0, sh), 0);
});

test("credit adjustment scales the premium and the minimum premium floors it", () => {
  const up = cleanShared({ ...EXAMPLE_SHARED, rateAdjustPct: 20 });
  near(premiumFor(100000, up), 3000);
  const floor = cleanShared({ ...EXAMPLE_SHARED, minPremium: 750 });
  assert.equal(premiumFor(10000, floor), 750); // 10 x $25 = $250 would be below the floor
});

test("tier breakpoints can only rise and rates are kept non-negative", () => {
  const s = cleanShared({ upTo1: 500, upTo2: 100, rate1: -5 });
  assert.ok(s.upTo[1] >= s.upTo[0]);
  assert.equal(s.rates[0], 0);
});

test("the solved price recovers the bond and earns the margin on the final price", () => {
  for (const [C, m] of [[1650000, 0.08], [50000, 0.15], [12000000, 0.05], [90000, 0]]) {
    const P = solvePrice(C, m, true, sh);
    near(P * (1 - m) - premiumFor(P, sh) - C, 0, 1e-4);
    assert.ok(P > C / (1 - m)); // costs more than the same bid with no bond
  }
  near(solvePrice(1000, 0.1, false, sh), 1000 / 0.9);
});

test("a schedule that eats the whole margin is reported as impossible", () => {
  const rawCrazy = { ...EXAMPLE_SHARED, rate1: 200, rate2: 200, rate3: 200, rate4: 200, rate5: 200, rateAdjustPct: 300 };
  const crazy = cleanShared(rawCrazy);
  assert.equal(solvePrice(100000, 0.3, true, crazy), null); // 80 percent of the price goes to the bond
  near(solvePrice(100000, 0.1, true, crazy), 1000000); // 0.9P - 0.8P = 100000 is still solvable
  const a = analyze(rawCrazy, [], [{ name: "x", directCost: 100000, marginPct: 30 }, { name: "y", directCost: 0 }].map((b) => ({ ...b, winPct: 50 })));
  assert.equal(a.ok, false);
  assert.ok(a.warnings.some((w) => /no price that earns the margin/.test(w)));
});

test("limits come from working capital and backlog is the uncompleted share of each contract", () => {
  const { jobs } = cleanJobs(EXAMPLE_JOBS);
  assert.equal(jobs[0].backlog, 1200000 * 0.6);
  const lim = limits(sh, jobs);
  assert.equal(lim.single, 2000000);
  assert.equal(lim.aggregate, 4000000);
  assert.equal(lim.backlog, 720000 + 160000);
  assert.equal(lim.headroom, 3120000);
  assert.equal(lim.maxJob, 2000000);
});

test("backlog burns down in a straight line and capacity returns as it does", () => {
  const { jobs } = cleanJobs(EXAMPLE_JOBS);
  assert.equal(backlogAt(jobs, 0), 880000);
  near(backlogAt(jobs, 4), 720000 * 0.5 + 0);
  assert.equal(backlogAt(jobs, 100), 0);
  const lim = limits(sh, jobs);
  assert.equal(earliestFitMonth(2000000, lim, jobs), 0);
  const heavy = cleanJobs([{ name: "big", contract: 3000000, pctComplete: 0, monthsLeft: 6 }]).jobs;
  const hl = limits(sh, heavy); // backlog 3.0M against a 4.0M aggregate: a 2.0M job fits once backlog is down to 2.0M
  const m = earliestFitMonth(2000000, hl, heavy);
  assert.equal(m, 2);
  assert.ok(backlogAt(heavy, m) + 2000000 <= hl.aggregate && backlogAt(heavy, m - 1) + 2000000 > hl.aggregate);
  assert.equal(earliestFitMonth(2000001, lim, jobs), null); // over the single-job limit: waiting never helps
});

test("a job with no months left stays in the backlog", () => {
  const { jobs, warnings } = cleanJobs([{ name: "stuck", contract: 100, pctComplete: 0, monthsLeft: 0 }]);
  assert.equal(backlogAt(jobs, 50), 100);
  assert.match(warnings[0], /no months left/);
});

test("overcommit probability matches a hand count", () => {
  const priced = [
    { price: 3, p: 0.5, bonded: true }, { price: 3, p: 0.5, bonded: true }, { price: 100, p: 1, bonded: false },
  ];
  const lim = { backlog: 0, aggregate: 5 };
  near(overcommitProbability([0, 1, 2], priced, lim), 0.25); // only both won; the unbonded job is ignored
  near(overcommitProbability([0, 2], priced, lim), 0);
  near(overcommitProbability([], priced, lim), 0);
});

// Independent oracle: enumerate by recursion instead of bitmasks.
function oracle(priced, lim, tol) {
  const n = priced.length;
  let best = 0;
  const rec = (i, chosen) => {
    if (i === n) {
      if (chosen.some((k) => priced[k].bonded && priced[k].price > lim.single)) return;
      let risk = 0;
      const bonded = chosen.filter((k) => priced[k].bonded);
      const go = (j, p, sum) => {
        if (j === bonded.length) { if (lim.backlog + sum > lim.aggregate) risk += p; return; }
        go(j + 1, p * priced[bonded[j]].p, sum + priced[bonded[j]].price);
        go(j + 1, p * (1 - priced[bonded[j]].p), sum);
      };
      go(0, 1, 0);
      if (risk <= tol + 1e-12) best = Math.max(best, chosen.reduce((s, k) => s + priced[k].p * priced[k].profit, 0));
      return;
    }
    rec(i + 1, chosen); rec(i + 1, [...chosen, i]);
  };
  rec(0, []);
  return best;
}

test("bestSet agrees with an independent search on random portfolios", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let trial = 0; trial < 60; trial++) {
    const n = 2 + Math.floor(rnd() * 5);
    const priced = Array.from({ length: n }, () => {
      const price = 200000 + Math.floor(rnd() * 2500000);
      return { price, p: 0.1 + rnd() * 0.8, bonded: rnd() > 0.2, profit: price * (0.04 + rnd() * 0.1) };
    });
    const lim = { single: 1800000 + rnd() * 800000, aggregate: 2500000 + rnd() * 3000000, backlog: rnd() * 1500000 };
    for (const tol of [0, 0.1, 0.3]) {
      near(bestSet(priced, lim, tol).profit, oracle(priced, lim, tol), 1e-6);
      assert.ok(bestSet(priced, lim, tol).risk <= tol + 1e-9);
    }
  }
});

test("zero tolerance means the set fits even if every bid is won", () => {
  const a = analyze(EXAMPLE_SHARED, EXAMPLE_JOBS, EXAMPLE_BIDS);
  const bonded = a.sets.safe.idx.filter((i) => a.priced[i].bonded).reduce((s, i) => s + a.priced[i].price, 0);
  assert.ok(a.lim.backlog + bonded <= a.lim.aggregate);
  assert.ok(a.sets.safe.profit <= a.sets.tolerant.profit + 1e-9);
});

test("example: the fire station is over the single-job limit and bidding on everything else carries real risk", () => {
  const a = analyze(EXAMPLE_SHARED, EXAMPLE_JOBS, EXAMPLE_BIDS);
  assert.equal(a.ok, true);
  const fire = a.priced.find((b) => b.name === "Fire station addition");
  assert.equal(fire.fitsSingle, false);
  assert.equal(fire.month, null);
  assert.ok(!a.sets.all.idx.includes(a.priced.indexOf(fire)));
  assert.ok(a.sets.all.risk > 0 && a.sets.all.risk < 0.1);
  near(workingCapitalNeeded(fire.price, a.lim.backlog, sh), Math.max(fire.price / 10, (a.lim.backlog + fire.price) / 20));
  assert.ok(a.wcAll > sh.workingCapital);
});

test("an unbonded bid uses no capacity and pays no premium", () => {
  const a = analyze(EXAMPLE_SHARED, EXAMPLE_JOBS, [{ name: "private", directCost: 5000000, marginPct: 10, winPct: 50, bonded: "no" }]);
  assert.equal(a.priced[0].premium, 0);
  assert.equal(a.priced[0].fitsNow, true);
  assert.deepEqual(a.sets.safe.idx, [0]);
});

test("working capital sensitivity grows the limits in proportion", () => {
  const a = analyze(EXAMPLE_SHARED, EXAMPLE_JOBS, EXAMPLE_BIDS);
  assert.equal(a.sens[0].single, 2000000);
  assert.equal(a.sens[4].single, 4000000);
  for (let i = 1; i < a.sens.length; i++) assert.ok(a.sens[i].fits >= a.sens[i - 1].fits);
});

test("missing working capital or bids produce a warning, not numbers", () => {
  assert.equal(analyze({}, [], EXAMPLE_BIDS).ok, false);
  assert.equal(analyze(EXAMPLE_SHARED, [], []).ok, false);
  const { bids, warnings } = cleanBids([{ name: "no cost" }, { name: "big", directCost: 100, marginPct: 90 }]);
  assert.equal(bids.length, 1);
  assert.equal(bids[0].m, 0.6);
  assert.equal(warnings.length, 2);
});

test("backlog above the aggregate limit is called out", () => {
  const a = analyze({ ...EXAMPLE_SHARED, workingCapital: 30000 }, EXAMPLE_JOBS, EXAMPLE_BIDS);
  assert.ok(a.warnings.some((w) => /already above the aggregate limit/.test(w)));
  assert.deepEqual(a.sets.safe.idx.filter((i) => a.priced[i].bonded), []);
});

test("CSV has one row per bid and quotes names", () => {
  const a = analyze(EXAMPLE_SHARED, EXAMPLE_JOBS, [{ name: 'He said "hi"', directCost: 100000, marginPct: 10, winPct: 50 }]);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith('"He said ""hi"""'));
});

test("defaults leave the page empty, not pre-filled with someone's figures", () => {
  assert.equal(SHARED_DEFAULTS.workingCapital, 0);
  assert.equal(expectedProfit([], []), 0);
});
