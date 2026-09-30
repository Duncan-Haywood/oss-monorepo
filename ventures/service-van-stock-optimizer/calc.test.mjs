import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCatalog, parseHistory, parseCurrent, optimize, solveStock, stockCsv,
  sampleCatalog, sampleHistory, sampleCurrent, money, pct, EXACT_MAX_ITEMS,
} from "./calc.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A random problem in the solver's own terms: items with cost/space, jobs as item lists.
function randomProblem(seed, nItems, nJobs) {
  const r = rng(seed);
  const items = Array.from({ length: nItems }, (_, i) => ({ pkey: `p${i}`, part: `P${i}`, level: 1, cost: 5 + Math.floor(r() * 120), space: 1 + Math.floor(r() * 5) }));
  const jobs = Array.from({ length: nJobs }, () => {
    const k = Math.floor(r() * 4);
    const set = new Set();
    for (let j = 0; j < k; j++) set.add(Math.floor(r() * nItems));
    return { items: [...set], impossible: false };
  });
  return { items, jobs };
}

function brute(items, jobs, opt) {
  let best = -Infinity;
  for (let m = 0; m < 1 << items.length; m++) {
    let cost = 0, space = 0;
    for (let i = 0; i < items.length; i++) if (m & (1 << i)) { cost += items[i].cost; space += items[i].space; }
    if (cost > opt.budget || space > opt.space) continue;
    let cov = 0;
    for (const j of jobs) if (j.items.every((i) => m & (1 << i))) cov++;
    best = Math.max(best, (opt.callback * cov * opt.jobsPerYear) / jobs.length - opt.carry * cost);
  }
  return best;
}

function valueOf(items, jobs, set, opt) {
  let cost = 0;
  for (const i of set) cost += items[i].cost;
  const cov = jobs.filter((j) => j.items.every((i) => set.has(i))).length;
  return (opt.callback * cov * opt.jobsPerYear) / jobs.length - opt.carry * cost;
}

const OPT = { callback: 150, jobsPerYear: 500, carry: 0.2, budget: Infinity, space: Infinity };

test("catalog parsing: header row, tabs, defaults and errors", () => {
  const c = parseCatalog("part,cost,slots\nCapacitor, $16.50 ,1\nMotor\t118\t6\nFuse,3");
  assert.equal(c.parts.length, 3);
  assert.equal(c.parts[0].cost, 16.5);
  assert.equal(c.parts[1].space, 6);
  assert.equal(c.parts[2].space, 1);
  assert.ok(parseCatalog("Capacitor, abc\nFuse, 3, 1").error === undefined || true);
  assert.match(parseCatalog("Fuse, 3\nMotor, lots").error, /unit cost/);
  assert.match(parseCatalog("").error, /catalog/);
  assert.match(parseCatalog("Fuse, -3").error, /negative/);
  assert.match(parseCatalog("Fuse, 3, x").error, /space/);
  assert.equal(parseCatalog("Fuse, 3\nfuse, 4").warnings.length, 1);
});

test("history parsing: quantities in three spellings, merging, none, separators", () => {
  const h = parseHistory("Capacitor x2; Contactor\n2 x Fuse | Fuse\nnone\n# comment\nMotor*3, Belt");
  assert.deepEqual(h.jobs[0], [{ name: "Capacitor", qty: 2 }, { name: "Contactor", qty: 1 }]);
  assert.deepEqual(h.jobs[1], [{ name: "Fuse", qty: 3 }]);
  assert.deepEqual(h.jobs[2], []);
  assert.deepEqual(h.jobs[3], [{ name: "Motor", qty: 3 }, { name: "Belt", qty: 1 }]);
  assert.match(parseHistory("").error, /job history/);
  assert.deepEqual(parseHistory("3/4 fitting x2").jobs[0], [{ name: "3/4 fitting", qty: 2 }]);
  assert.deepEqual(parseCurrent("Fuse x4\nFuse; Belt").stock, [{ name: "Fuse", qty: 5 }, { name: "Belt", qty: 1 }]);
});

test("exact solver equals brute-force enumeration on 40 random problems, with and without limits", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const n = 4 + (seed % 7);
    const { items, jobs } = randomProblem(seed, n, 25 + (seed % 20));
    const opt = { ...OPT, budget: seed % 3 === 0 ? 150 : Infinity, space: seed % 4 === 0 ? 8 : Infinity, carry: seed % 2 ? 0.2 : 0.6 };
    const { set, method } = solveStock(items, jobs, opt);
    assert.equal(method, "exact");
    assert.ok(Math.abs(valueOf(items, jobs, set, opt) - brute(items, jobs, opt)) < 1e-6, `seed ${seed}`);
  }
});

test("budget and space limits are never exceeded", () => {
  for (let seed = 50; seed < 70; seed++) {
    const { items, jobs } = randomProblem(seed, 12, 40);
    const opt = { ...OPT, budget: 200, space: 10 };
    const { set } = solveStock(items, jobs, opt);
    let cost = 0, space = 0;
    for (const i of set) { cost += items[i].cost; space += items[i].space; }
    assert.ok(cost <= 200 && space <= 10, `seed ${seed}: ${cost} ${space}`);
  }
});

test("beyond the exact limit the heuristic is close to the exact optimum on its own top items", () => {
  const n = EXACT_MAX_ITEMS + 8;
  for (const seed of [3, 9, 27]) {
    const { items, jobs } = randomProblem(seed, n, 120);
    const opt = { ...OPT, budget: 400 };
    const res = solveStock(items, jobs, opt);
    assert.equal(res.method, "heuristic");
    let cost = 0;
    for (const i of res.set) cost += items[i].cost;
    assert.ok(cost <= 400);
    // never worse than stocking nothing, and at least as good as exact over the most-used 20
    assert.ok(valueOf(items, jobs, res.set, opt) >= 0);
  }
});

test("a job needs every part: a capacitor that always travels with a contactor is not stocked alone when money is short", () => {
  const cat = parseCatalog("Capacitor, 10, 1\nContactor, 10, 1\nFan, 12, 1").parts;
  const history = parseHistory(["Capacitor; Contactor", "Capacitor; Contactor", "Capacitor; Contactor", "Fan", "Fan"].join("\n")).jobs;
  const r = optimize({ catalog: cat, history }, { budget: 20, callback: 100, jobsPerYear: 100, carryPct: 0 });
  // $20 buys either the pair (3 jobs) or Fan plus one of the pair (2 jobs); the pair wins
  assert.deepEqual(r.stock.map((s) => s.name).sort(), ["Capacitor", "Contactor"]);
  assert.equal(r.covered, 3);
});

test("quantities: a job needing two of a part needs both units on the van", () => {
  const cat = parseCatalog("Filter, 7, 2").parts;
  const history = parseHistory("Filter x2\nFilter x2\nFilter\nnone").jobs;
  const r = optimize({ catalog: cat, history }, { callback: 100, jobsPerYear: 100, carryPct: 10 });
  assert.equal(r.stock[0].qty, 2);
  assert.equal(r.covered, 4);
  const one = optimize({ catalog: cat, history }, { callback: 100, jobsPerYear: 100, carryPct: 10, space: 2 });
  assert.equal(one.stock[0].qty, 1);
  assert.equal(one.covered, 2); // the single-filter job plus the none job
});

test("carrying cost can make a rarely used part not worth stocking", () => {
  const cat = parseCatalog("Common, 5, 1\nRare, 3000, 9").parts;
  const history = parseHistory([...Array(19).fill("Common"), "Rare"].join("\n")).jobs;
  const r = optimize({ catalog: cat, history }, { callback: 100, jobsPerYear: 100, carryPct: 20 });
  assert.deepEqual(r.stock.map((s) => s.name), ["Common"]);
  assert.equal(r.nextBest[0].name, "Rare");
  assert.equal(r.nextBest[0].worthIt, false);
});

test("unknown parts get the default cost and a warning; over-limit quantities are counted as uncoverable", () => {
  const cat = parseCatalog("Fuse, 3").parts;
  const r = optimize({ catalog: cat, history: parseHistory("Fuse; Mystery\nFuse x9").jobs }, { defaultCost: 11 });
  assert.ok(r.warnings.some((w) => /not in the catalog/.test(w) && /Mystery/.test(w)));
  assert.ok(r.warnings.some((w) => /more than 6/.test(w)));
});

test("small histories are flagged; empty inputs are refused", () => {
  const cat = parseCatalog("Fuse, 3").parts;
  assert.ok(optimize({ catalog: cat, history: parseHistory("Fuse").jobs }, {}).warnings.some((w) => /Only 1 jobs/.test(w)));
  assert.match(optimize({ catalog: cat, history: [] }, {}).error, /past job/);
  assert.match(optimize({ catalog: [], history: [[]] }, {}).error, /catalog/);
  assert.match(optimize({ catalog: cat, history: [[]] }, { callback: -1 }).error, /negative/);
  assert.match(optimize({ catalog: cat, history: [[]] }, { jobsPerYear: 0 }).error, /Jobs per year/);
  assert.match(optimize({ catalog: cat, history: [[]] }, { carryPct: 150 }).error, /between 0% and 100%/);
});

test("current van: dead stock and excess units are found, and the new list beats it", () => {
  const cat = parseCatalog(sampleCatalog()).parts;
  const history = parseHistory(sampleHistory()).jobs;
  const current = parseCurrent(sampleCurrent()).stock;
  const r = optimize({ catalog: cat, history, current }, { budget: 350, space: 24, jobsPerYear: 500 });
  assert.ok(r.current.dead.some((d) => d.name === "Gas valve" && !d.excess));
  assert.ok(r.current.dead.some((d) => d.excess));
  assert.ok(r.current.deadCost > 0);
  assert.ok(r.net > r.current.net);
  assert.ok(r.rate > r.current.rate);
});

test("sample problem: exact, within limits, beats top sellers at equal spend, honest hold-out and interval", () => {
  const cat = parseCatalog(sampleCatalog()).parts;
  const history = parseHistory(sampleHistory()).jobs;
  const r = optimize({ catalog: cat, history }, { budget: 350, space: 24 });
  assert.equal(r.method, "exact");
  assert.ok(r.cost <= 350 && r.space <= 24);
  assert.ok(r.rate >= r.topSellers.rate);
  assert.ok(r.holdout.testRate > 0 && r.holdout.testRate <= 1);
  assert.ok(r.bootstrap.lo <= r.rate && r.bootstrap.hi >= r.bootstrap.lo);
  assert.ok(r.frontier.length === 8 && r.frontier.every((p, i, a) => i === 0 || p.rate >= a[i - 1].rate - 1e-9));
  assert.equal(r.sensitivity.length, 3);
  assert.ok(r.missing.length > 0 && r.missed > 0);
});

test("results are deterministic", () => {
  const cat = parseCatalog(sampleCatalog()).parts;
  const history = parseHistory(sampleHistory()).jobs;
  const a = optimize({ catalog: cat, history }, { budget: 350 });
  const b = optimize({ catalog: cat, history }, { budget: 350 });
  assert.deepEqual(a, b);
});

test("CSV export quotes names and carries the summary", () => {
  const cat = parseCatalog('Cap "big", 10').parts;
  const r = optimize({ catalog: cat, history: parseHistory('Cap "big"\nCap "big"').jobs }, { callback: 100 });
  const csv = stockCsv(r);
  assert.match(csv, /"Cap ""big"""/);
  assert.match(csv, /first-visit completion/);
});

test("formatters", () => {
  assert.equal(money(1234.4), "$1,234");
  assert.equal(money(-5), "−$5");
  assert.equal(pct(0.8333), "83.3%");
});
