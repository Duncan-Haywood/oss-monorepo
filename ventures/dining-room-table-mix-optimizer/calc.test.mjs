import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze, normalize, drawServices, evaluate, runService, search, toCsv, mulberry32, PARTY_SIZES,
  EXAMPLE_SHARED, EXAMPLE_TABLES, EXAMPLE_PARTIES, TABLE_DEFAULTS, PARTY_DEFAULTS,
} from "./calc.mjs";

const blankParties = () => PARTY_SIZES.map(() => ({ ...PARTY_DEFAULTS }));
function erlangB(A, c) {
  let b = 1;
  for (let k = 1; k <= c; k++) b = (A * b) / (k + A * b);
  return b;
}

test("simulator matches Erlang-B for one party size, one table type and no waiting", () => {
  // Loss systems are insensitive to the dwell distribution, so lognormal stays must still give Erlang-B on average.
  const c = 8, dwell = 60, windowMin = 60 * 40, rate = 0.12; // offered load 7.2 tables
  const A = rate * dwell;
  const services = drawServices({ n: 12, seed: 5, windowMin, ratePerMin: rate, sizeCdf: [1, 1, 1, 1, 1, 1, 1, 1] });
  const dwellMin = PARTY_SIZES.map(() => dwell);
  const tables = Array.from({ length: c }, () => ({ seats: 8 }));
  let lost = 0, parties = 0;
  for (const s of services) {
    const r = runService(s, tables, PARTY_SIZES, dwellMin, 0, false);
    lost += r.lost; parties += r.parties;
    assert.equal(r.guests, r.seated * 1);
  }
  assert.ok(Math.abs(lost / parties - erlangB(A, c)) < 0.02, `${lost / parties} vs ${erlangB(A, c)}`);
});

test("every party is either seated or lost, and waiting is only counted for seated parties", () => {
  const sh = { ...EXAMPLE_SHARED }, rows = EXAMPLE_TABLES, p = EXAMPLE_PARTIES;
  const n = normalize(rows, p, sh);
  const services = drawServices({ n: 20, seed: 9, windowMin: 180, ratePerMin: 62 / 180, sizeCdf: [0.1, 0.5, 0.6, 0.9, 0.95, 0.99, 0.995, 1] });
  const tables = [{ seats: 4 }, { seats: 4 }, { seats: 6 }];
  for (const s of services) {
    const r = runService(s, tables, PARTY_SIZES, n.dwells, 10, true);
    assert.equal(r.seated + r.lost, r.parties);
    assert.ok(r.waitMin >= 0 && r.waitMin <= r.seated * 10 + 1e-9);
  }
});

test("a party larger than any table is seated only by pushing two tables together", () => {
  const parties = [[1, 5, 1]]; // party of 6
  const dwell = PARTY_SIZES.map(() => 30);
  assert.equal(runService(parties, [{ seats: 4 }, { seats: 4 }], PARTY_SIZES, dwell, 0, false).guests, 0);
  assert.equal(runService(parties, [{ seats: 4 }, { seats: 4 }], PARTY_SIZES, dwell, 0, true).guests, 6);
});

test("services are deterministic for a seed", () => {
  const a = drawServices({ n: 3, seed: 1, windowMin: 120, ratePerMin: 0.3, sizeCdf: [0.5, 1, 1, 1, 1, 1, 1, 1] });
  const b = drawServices({ n: 3, seed: 1, windowMin: 120, ratePerMin: 0.3, sizeCdf: [0.5, 1, 1, 1, 1, 1, 1, 1] });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, drawServices({ n: 3, seed: 2, windowMin: 120, ratePerMin: 0.3, sizeCdf: [0.5, 1, 1, 1, 1, 1, 1, 1] }));
  const r = mulberry32(3);
  for (let i = 0; i < 100; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test("couples-heavy demand moves a room of four-tops to two-tops, and the gain is real", () => {
  const a = analyze(EXAMPLE_TABLES, EXAMPLE_PARTIES, EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.ok(a.recCounts[0] > 0, "recommends 2-tops");
  assert.ok(a.areaUsedRec <= 460 + 1e-9, "stays inside the floor");
  assert.ok(a.recCounts[2] <= 3 && a.recCounts[3] <= 1, "respects per-type maximums");
  assert.ok(a.deltaGuests > 0 && a.significant, `gain ${a.deltaGuests} +/- ${a.deltaSe}`);
  assert.ok(a.monthlyRevenue > 0);
});

test("search never returns a mix worse than where it started, on the data it searched", () => {
  const types = [{ seats: 2, sqft: 20, max: Infinity }, { seats: 4, sqft: 32, max: Infinity }];
  const score = (c) => c[0] * 2 + c[1] * 3; // linear: best is the better ratio that fits
  const r = search(types, 100, score, [0, 1]);
  assert.ok(r.score >= score([0, 1]) - 1e-3);
  assert.ok(r.counts[0] * 20 + r.counts[1] * 32 <= 100);
});

test("with all demand at two guests, a room is filled with two-tops", () => {
  const rows = [
    { name: "2-top", seats: "2", sqft: "20", count: "0", max: "" },
    { name: "4-top", seats: "4", sqft: "32", count: "3", max: "" },
  ];
  const parties = blankParties(); parties[1] = { share: "100", dwell: "60" };
  const a = analyze(rows, parties, { ...EXAMPLE_SHARED, areaSqFt: "100", partiesPerService: "40", combine: "no" });
  assert.ok(a.recCounts[0] >= 4, JSON.stringify(a.recCounts));
});

test("more demand never lowers the guests a fixed room serves", () => {
  const types = [{ seats: 4 }];
  const dwell = PARTY_SIZES.map(() => 60);
  const sizeCdf = [0, 0, 0, 1, 1, 1, 1, 1];
  const lo = evaluate([6], [{ seats: 4 }], drawServices({ n: 40, seed: 2, windowMin: 180, ratePerMin: 0.1, sizeCdf }), PARTY_SIZES, dwell, 10, false);
  const hi = evaluate([6], [{ seats: 4 }], drawServices({ n: 40, seed: 2, windowMin: 180, ratePerMin: 0.4, sizeCdf }), PARTY_SIZES, dwell, 10, false);
  assert.ok(hi.meanGuests >= lo.meanGuests);
  assert.equal(types.length, 1);
});

test("bad or missing inputs are named, not guessed", () => {
  const empty = analyze([{ ...TABLE_DEFAULTS }], blankParties(), {});
  assert.equal(empty.ok, false);
  assert.ok(empty.warnings.length >= 3);
  const bad = normalize([{ name: "x", seats: "2.5", sqft: "20", count: "1", max: "" }], EXAMPLE_PARTIES, EXAMPLE_SHARED);
  assert.equal(bad.ok, false);
  assert.match(bad.warnings.join(" "), /whole number/);
});

test("the CSV lists every type with today and recommended counts", () => {
  const a = analyze(EXAMPLE_TABLES, EXAMPLE_PARTIES, EXAMPLE_SHARED);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 1 + EXAMPLE_TABLES.length);
  assert.match(lines[0], /tables recommended/);
});
