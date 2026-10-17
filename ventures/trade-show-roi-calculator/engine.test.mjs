import test from "node:test";
import assert from "node:assert/strict";
import { parseShows, plan, summarize, showCost, showEconomics, breakEven, dayNumber, quarterOf, money } from "./engine.mjs";

const OPTS = { leadQual: 30, close: 20, dealValue: 12000, margin: 60, budget: 40000, maxPerQuarter: 0, downside: 70 };

test("parse reports line numbers and never throws", () => {
  const r = parseShows("name,date\nExpo,2027-13-40,100\nOK,2027-03-01,1000,0,0,0,0,0,10\nBad,2027-03-01,abc,0,0,0,0,0,10\nNoLeads,2027-03-01,100");
  assert.equal(r.shows.length, 1);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /^line 2: date must be YYYY-MM-DD/);
  assert.match(r.errors[1], /^line 4: booth fee must be a number/);
  assert.match(r.errors[2], /^line 5: expected leads must be a number/);
  assert.equal(parseShows("").shows.length, 0);
});

test("quarters follow the calendar", () => {
  assert.equal(quarterOf(dayNumber("2027-03-31")), "2027-Q1");
  assert.equal(quarterOf(dayNumber("2027-04-01")), "2027-Q2");
});

test("cost, funnel, ROI and break-even agree with hand arithmetic", () => {
  const s = parseShows("Alpha Expo,2027-03-10,8000,2000,2,3,400,1000,60").shows[0];
  const o = { leadQual: 30, close: 20, dealValue: 10000, margin: 60, cycleMonths: 6, ltv: 1, budget: 0, maxPerQuarter: 0, downside: 70 };
  assert.equal(showCost(s), 13400);
  const e = showEconomics(s, o);
  assert.ok(Math.abs(e.qualified - 18) < 1e-9);
  assert.ok(Math.abs(e.deals - 3.6) < 1e-9);
  assert.ok(Math.abs(e.grossProfit - 21600) < 1e-6);
  assert.ok(Math.abs(e.net - 8200) < 1e-6);
  assert.ok(Math.abs(e.roi - 61.194) < 0.001);
  assert.equal(money(e.costPerQualified), "$744.44");
  const b = breakEven(s, o);
  assert.ok(Math.abs(b.leads - 13400 / 360) < 1e-9);
  assert.ok(Math.abs(showEconomics({ ...s, leads: b.leads }, o).net) < 1e-6);
  assert.ok(Math.abs(showEconomics(s, { ...o, close: b.closeRate }).net) < 1e-6);
  assert.ok(Math.abs(b.deals * 6000 - 13400) < 1e-6);
});

test("lifetime multiplier scales gross profit", () => {
  const s = parseShows("A,2027-03-10,1000,0,0,0,0,0,100").shows[0];
  const base = { leadQual: 50, close: 10, dealValue: 1000, margin: 50, budget: 0, maxPerQuarter: 0 };
  const a = plan({ shows: [s] }, base).ranked[0].grossProfit;
  const b = plan({ shows: [s] }, { ...base, ltv: 3 }).ranked[0].grossProfit;
  assert.ok(Math.abs(b - 3 * a) < 1e-9);
});

test("a show that loses money is skipped with the lead count that flips it", () => {
  const p = plan(parseShows("Loser,2027-03-10,13000,0,0,0,0,0,20\nWinner,2027-06-10,2000,0,0,0,0,0,50"), OPTS);
  assert.deepEqual(p.chosen.map((c) => c.name), ["Winner"]);
  const sk = p.skipped[0];
  assert.match(sk.reason, /loses .* needs 31 leads to break even \(you listed 20\)/);
  assert.ok(p.findings.some((f) => f.rule === "loses-money" && /31 leads/.test(f.message)));
});

test("budget forces a choice and the plan beats cheapest-first", () => {
  const p = plan(parseShows("Big,2027-02-10,20000,0,0,0,0,0,100\nSmall1,2027-05-10,9000,0,0,0,0,0,30\nSmall2,2027-08-10,9000,0,0,0,0,0,30"), { ...OPTS, budget: 20000 });
  assert.deepEqual(p.chosen.map((c) => c.name), ["Big"]);
  assert.ok(p.totals.upliftVsCheapestFirst > 0);
  assert.equal(p.totals.everyShowWithinBudget, false);
  assert.match(p.skipped[0].reason, /swapping it in would cost/);
});

test("a show dearer than the whole budget says so", () => {
  const p = plan(parseShows("Huge,2027-02-10,50000,0,0,0,0,0,1000"), { ...OPTS, budget: 10000 });
  assert.equal(p.chosen.length, 0);
  assert.match(p.skipped[0].reason, /more than the whole \$10,000\.00 budget/);
  assert.equal(summarize(p).status, "none");
});

test("quarter cap limits shows per calendar quarter", () => {
  const rows = "A,2027-01-10,1000,0,0,0,0,0,50\nB,2027-02-10,1000,0,0,0,0,0,60\nC,2027-03-10,1000,0,0,0,0,0,70\nD,2027-04-10,1000,0,0,0,0,0,40";
  const p = plan(parseShows(rows), { ...OPTS, budget: 0, maxPerQuarter: 2 });
  assert.deepEqual(p.chosen.map((c) => c.name), ["B", "C", "D"]);
});

test("downside re-check flags shows that lose at fewer leads", () => {
  const p = plan(parseShows("Thin,2027-03-10,5000,0,0,0,0,0,15"), { ...OPTS, budget: 0 });
  assert.equal(p.chosen.length, 1);
  assert.ok(p.chosen[0].downsideNet < 0);
  assert.ok(p.findings.some((f) => f.rule === "downside-loss"));
});

// Deterministic PRNG so failures reproduce.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bruteForce(shows, o) {
  const eco = shows.map((s) => showEconomics(s, o));
  let best = 0;
  for (let mask = 0; mask < 1 << shows.length; mask += 1) {
    let spend = 0;
    let net = 0;
    const q = new Map();
    let ok = true;
    for (let i = 0; i < shows.length && ok; i += 1) {
      if (!(mask & (1 << i))) continue;
      spend += eco[i].cost;
      net += eco[i].net;
      q.set(shows[i].quarter, (q.get(shows[i].quarter) || 0) + 1);
      if (o.maxPerQuarter > 0 && q.get(shows[i].quarter) > o.maxPerQuarter) ok = false;
    }
    if (o.budget > 0 && spend > o.budget + 1e-9) ok = false;
    if (ok && net > best) best = net;
  }
  return best;
}

test("branch-and-bound equals brute force on 300 random years", () => {
  const r = rng(20271);
  for (let n = 0; n < 300; n += 1) {
    const count = 3 + Math.floor(r() * 8);
    const lines = [];
    for (let i = 0; i < count; i += 1) {
      const month = 1 + Math.floor(r() * 12);
      const booth = Math.round(1000 + r() * 15000);
      const travel = Math.round(r() * 4000);
      const leads = Math.round(5 + r() * 150);
      lines.push(`S${i},2027-${String(month).padStart(2, "0")}-15,${booth},${travel},${1 + Math.floor(r() * 3)},${1 + Math.floor(r() * 4)},${Math.round(300 + r() * 300)},${Math.round(r() * 3000)},${leads}`);
    }
    const o = { leadQual: 20 + r() * 30, close: 10 + r() * 20, dealValue: 5000 + r() * 15000, margin: 40 + r() * 40, budget: r() < 0.2 ? 0 : Math.round(10000 + r() * 50000), maxPerQuarter: Math.floor(r() * 4), downside: 70 };
    const parsed = parseShows(lines.join("\n"));
    const p = plan(parsed, o);
    const want = bruteForce(parsed.shows, p.options);
    assert.ok(Math.abs(p.totals.plan - want) < 1e-6, `case ${n}: ${p.totals.plan} vs ${want}`);
    assert.ok(p.totals.plan + 1e-6 >= p.totals.cheapestFirst);
  }
});

test("too many shows is a clear error, not a hang", () => {
  const lines = Array.from({ length: 41 }, (_, i) => `S${i},2027-03-10,1000,0,0,0,0,0,10`).join("\n");
  assert.throws(() => plan(parseShows(lines), OPTS), /up to 40/);
});
