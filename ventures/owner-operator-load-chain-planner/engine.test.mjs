import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CITIES, resolvePlace, haversineMiles, parseLoads, normalizeOptions, drive, evaluateChain, bruteForce,
  plan, summarize, money, pct, clock, MAX_LOADS,
} from "./engine.mjs";

const fixture = readFileSync(new URL("./fixtures/loads.csv", import.meta.url), "utf8");
const base = { start: "Dallas TX", horizon: 120 };

test("city table resolves names, bare unambiguous cities and coordinates", () => {
  assert.ok(CITIES.length >= 80);
  assert.equal(resolvePlace("dallas tx").name, "Dallas TX");
  assert.equal(resolvePlace("Dallas").name, "Dallas TX");
  assert.equal(resolvePlace("St. Louis MO").name, "St. Louis MO");
  assert.equal(resolvePlace("@32.78/-96.80").lat, 32.78);
  assert.equal(resolvePlace("@95/10"), null);
  assert.equal(resolvePlace("Atlantis"), null);
  assert.equal(resolvePlace(""), null);
  const d = haversineMiles(resolvePlace("Dallas TX"), resolvePlace("Houston TX"));
  assert.ok(d > 220 && d < 240, String(d));
});

test("parseLoads reads rows, headers, comments and reports line numbers", () => {
  const p = parseLoads(fixture);
  assert.deepEqual(p.errors, []);
  assert.equal(p.loads.length, 11);
  assert.equal(p.loads[0].close, 10);
  assert.equal(p.loads[1].deliverBy, 40);
  assert.equal(p.loads[0].extra, 25);
  assert.equal(p.loads[2].miles, null);
  const bad = parseLoads("a,Dallas TX,Nowhere,100\nb,Dallas TX,Houston TX,abc\nc,Dallas TX\nd,Dallas TX,Houston TX,100,,10,5\ne,Dallas TX,Houston TX,100,,x");
  assert.equal(bad.errors.length, 5);
  assert.match(bad.errors[0], /line 1: drop "Nowhere"/);
  assert.match(bad.errors[1], /line 2: rate/);
  assert.match(bad.errors[2], /line 3: expected/);
  assert.match(bad.errors[3], /before pickup_open/);
  assert.match(bad.errors[4], /pickup_open "x"/);
  assert.equal(parseLoads("").loads.length, 0);
  const many = Array.from({ length: MAX_LOADS + 1 }, (_, i) => `l${i},Dallas TX,Houston TX,500`).join("\n");
  assert.match(parseLoads(many).errors[0], /limit/);
});

test("options validate and default", () => {
  assert.throws(() => normalizeOptions({}), /start city/);
  assert.throws(() => normalizeOptions({ start: "Nowhere" }), /not a known city/);
  assert.throws(() => normalizeOptions({ start: "Dallas TX", mph: 0 }), /speed/);
  assert.throws(() => normalizeOptions({ start: "Dallas TX", roadFactor: 0.5 }), /Road factor/);
  assert.throws(() => normalizeOptions({ start: "Dallas TX", objective: "x" }), /Objective/);
  const o = normalizeOptions({ start: "Dallas TX", fuel: "4.2", mpg: "7" });
  assert.equal(o.fuel, 4.2);
  assert.equal(o.hos, true);
  assert.equal(normalizeOptions({ start: "Dallas TX", hos: false }).hos, false);
  assert.ok(Math.abs(o.varPerMile - (4.2 / 7 + 0.25)) < 1e-12);
});

test("drive applies the drive/rest rule exactly", () => {
  const o = normalizeOptions({ start: "Dallas TX" });
  assert.deepEqual(drive(o, 0, 0, 5), { t: 5, d: 5, rests: 0 });
  const r = drive(o, 0, 0, 12);
  assert.equal(r.t, 12 + 10);
  assert.equal(r.rests, 1);
  assert.equal(r.d, 1);
  const r2 = drive(o, 0, 8, 5);
  assert.equal(r2.t, 3 + 10 + 2);
  const r3 = drive(o, 0, 0, 23);
  assert.equal(r3.rests, 2);
  assert.equal(r3.t, 23 + 20);
  const off = normalizeOptions({ start: "Dallas TX", hos: false });
  assert.deepEqual(drive(off, 3, 9, 30), { t: 33, d: 0, rests: 0 });
});

test("a single load's profit is hand-checkable", () => {
  const p = parseLoads("one,Dallas TX,Houston TX,900,240");
  const r = plan(p, { ...base, fuel: 4, mpg: 8, perMile: 0.5, dwell: 1, hos: false, mph: 60 });
  assert.equal(r.chain.length, 1);
  // 240 loaded miles, no deadhead (starts at the pickup): 900 - 240 * (4/8 + 0.5)
  assert.ok(Math.abs(r.totals.profitBeforeFixed - (900 - 240)) < 1e-9);
  assert.ok(Math.abs(r.totals.elapsedHours - (4 + 2)) < 1e-9);
  assert.ok(Math.abs(r.chain[0].walkAway - 240) < 1e-9, String(r.chain[0].walkAway));
});

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const CITY_NAMES = ["Dallas TX", "Houston TX", "Atlanta GA", "Memphis TN", "Chicago IL", "Kansas City MO", "Denver CO", "Nashville TN", "Oklahoma City OK", "St. Louis MO"];

function randomLoads(rand, n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const a = CITY_NAMES[Math.floor(rand() * CITY_NAMES.length)];
    let b = CITY_NAMES[Math.floor(rand() * CITY_NAMES.length)];
    if (b === a) b = CITY_NAMES[(CITY_NAMES.indexOf(a) + 1) % CITY_NAMES.length];
    const rate = Math.round(500 + rand() * 2500);
    const open = Math.floor(rand() * 60);
    const close = open + Math.floor(rand() * 40);
    const by = rand() < 0.4 ? open + 20 + Math.floor(rand() * 70) : "";
    rows.push(`L${i},${a},${b},${rate},,${open},${close},${by},${Math.floor(rand() * 40)}`);
  }
  return parseLoads(rows.join("\n"));
}

test("the exact search equals every ordered subset, both objectives, HOS on and off, with and without returning home", () => {
  const rand = rng(20261002);
  let compared = 0;
  let nonEmpty = 0;
  for (let trial = 0; trial < 60; trial += 1) {
    const n = 3 + (trial % 4);
    const p = randomLoads(rand, n);
    assert.deepEqual(p.errors, []);
    const opts = {
      start: CITY_NAMES[trial % CITY_NAMES.length], horizon: 70 + (trial % 5) * 25,
      objective: trial % 2 ? "perDay" : "total", hos: trial % 3 !== 0, returnHome: trial % 4 === 1,
      dwell: trial % 2 ? 1 : 2.5, mph: 45 + (trial % 4) * 5,
    };
    const exact = plan(p, opts);
    const brute = bruteForce(p.loads, opts);
    assert.ok(Math.abs(exact.objective - brute.obj) < 1e-6, `trial ${trial}: ${exact.objective} vs ${brute.obj}`);
    if (exact.status === "chain") {
      nonEmpty += 1;
      const order = exact.chain.map((c) => p.loads.findIndex((l) => l.name === c.name));
      const trace = evaluateChain(p.loads, order, opts);
      assert.ok(trace, "the reported chain must be feasible when replayed");
      assert.ok(Math.abs(trace.obj - exact.objective) < 1e-6);
      assert.ok(Math.abs(trace.V - exact.totals.profitBeforeFixed) < 1e-6);
    } else {
      assert.equal(brute.order.length, 0);
    }
    compared += 1;
  }
  assert.equal(compared, 60);
  assert.ok(nonEmpty > 30, `only ${nonEmpty} non-empty plans; the generator is too tight to test anything`);
});

test("no baseline ever beats the exact plan, and the uplift is the gap to the best one", () => {
  const rand = rng(77);
  for (let trial = 0; trial < 25; trial += 1) {
    const r = plan(randomLoads(rand, 6), { start: "Dallas TX", horizon: 96, objective: trial % 2 ? "perDay" : "total" });
    for (const b of r.baselines) assert.ok(b.obj <= r.objective + 1e-6, `${b.label}: ${b.obj} > ${r.objective}`);
    const best = Math.max(0, ...r.baselines.map((b) => b.obj));
    assert.ok(Math.abs(r.upliftVsBest - (r.objective - best)) < 1e-6);
  }
});

test("walk-away rate is exact: at it the load is a coin flip, one dollar under it drops out of the plan", () => {
  const rand = rng(5150);
  let checked = 0;
  for (let trial = 0; trial < 40 && checked < 25; trial += 1) {
    const rows = randomLoads(rand, 5);
    const opts = { start: "Dallas TX", horizon: 110, objective: trial % 2 ? "perDay" : "total", returnHome: trial % 3 === 0 };
    const r = plan(rows, opts);
    if (r.status !== "chain") continue;
    for (const c of r.chain) {
      if (c.walkAway <= 0.0001) continue; // clamped: it earns its place at any rate
      const idx = rows.loads.findIndex((l) => l.name === c.name);
      const withRate = (rate) => ({ loads: rows.loads.map((l, i) => (i === idx ? { ...l, rate } : l)) });
      const under = plan(withRate(c.walkAway - 1), opts);
      assert.ok(!under.chain.some((x) => x.name === c.name), `${c.name} should drop out at walk-away minus $1`);
      const over = plan(withRate(c.walkAway + 1), opts);
      assert.ok(over.chain.some((x) => x.name === c.name), `${c.name} should stay in at walk-away plus $1`);
      checked += 1;
    }
  }
  assert.ok(checked >= 15, `only ${checked} walk-away rates were checked`);
});

test("a pickup window that closes before you can get there makes a load impossible", () => {
  const p = parseLoads("far,Houston TX,Dallas TX,2000,,0,1\nnear,Dallas TX,Fort Worth TX,300");
  const r = plan(p, { ...base, hos: true });
  assert.equal(r.chain.length, 1);
  assert.equal(r.chain[0].name, "near");
  const far = r.others.find((o) => o.name === "far");
  assert.equal(far.impossible, true);
  assert.match(far.reason, /cannot be reached/);
});

test("waiting for a window to open is paid for in clock time and a long wait resets the drive clock", () => {
  const p = parseLoads("late,Dallas TX,Houston TX,1000,,30,40");
  const r = plan(p, { ...base, horizon: 100, hos: true });
  assert.equal(r.chain[0].waitHours, 30);
  assert.equal(r.chain[0].pickupAt, 30);
  assert.equal(r.totals.waitHours, 30);
  // 4.8 h at 50 mph over ~286 road miles after a 30 h wait, no rest forced
  assert.equal(r.totals.restBreaks, 0);
});

test("deadlines and the window both prune", () => {
  const p = parseLoads("tight,Dallas TX,Atlanta GA,2000,,0,5,10");
  assert.equal(plan(p, { ...base }).status, "none");
  assert.equal(plan(parseLoads("long,Dallas TX,Los Angeles CA,3000"), { ...base, horizon: 20 }).status, "none");
  assert.equal(plan(parseLoads("long,Dallas TX,Los Angeles CA,3000"), { ...base, horizon: 100 }).status, "chain");
});

test("loads that never pay for their miles produce no plan", () => {
  const r = plan(parseLoads("bad,Dallas TX,Houston TX,100"), base);
  assert.equal(r.status, "none");
  assert.equal(summarize(r).status, "none");
  assert.ok(r.findings.some((f) => f.rule === "no-plan"));
});

test("returning home charges the empty leg and can change the plan", () => {
  const p = parseLoads("out,Dallas TX,Chicago IL,2000\nlocal,Dallas TX,Houston TX,800");
  const a = plan(p, { ...base, horizon: 150 });
  const b = plan(p, { ...base, horizon: 150, returnHome: true });
  assert.ok(b.totals.profitBeforeFixed <= a.totals.profitBeforeFixed + 1e-9 || b.chain.length !== a.chain.length);
  assert.ok(b.totals.returnMiles >= 0);
});

test("the worked list: exact numbers the page and guide quote", () => {
  const p = parseLoads(fixture);
  const r = plan(p, { start: "Dallas TX", horizon: 120 });
  assert.deepEqual(r.chain.map((c) => c.name), ["Dallas to Atlanta dry van", "Memphis to Chicago", "Chicago to Dallas"]);
  assert.equal(money(r.totals.profitBeforeFixed), "$3,174.19");
  assert.equal(money(r.totals.revenue), "$5,630.00");
  assert.equal(r.totals.elapsedHours.toFixed(1), "118.3");
  assert.equal(pct(r.totals.emptyShare, 0), "14%");
  assert.equal(money(r.upliftVsBest), "$454.36");
  assert.equal(money(r.baselines[0].profit), "$2,719.83");
  assert.equal(money(r.chain[0].walkAway), "$2,264.63");
  assert.equal(r.status, "chain");
  assert.equal(summarize(r).status, "gain");
  const h = plan(p, { start: "Dallas TX", horizon: 120, returnHome: true });
  assert.equal(h.chain.length, 3);
  assert.equal(clock(32), "day 2 08:00");
});

test("a 14-load list solves exactly and quickly", () => {
  const rand = rng(14);
  const p = randomLoads(rand, 14);
  const t0 = Date.now();
  const r = plan(p, { start: "Dallas TX", horizon: 168 });
  assert.equal(r.truncated, false);
  assert.ok(Date.now() - t0 < 20000, `took ${Date.now() - t0} ms`);
});
