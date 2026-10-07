import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, yearly, netAt, breakEvenWeekly, crossovers, sampleInput, reportCsv, parseNum, parseInput } from "./calc.mjs";

const C = { services: 2200, retail: 150, tipPct: 15, weeks: 48, hours: 36 };
const COMM = { mode: "commission", keep: 50, retailKeep: 20, rent: 0, rentWeeks: 52, supplies: 0, card: 0, fixed: 0, se: 0 };
const RENT = { mode: "rent", keep: 0, retailKeep: 0, rent: 300, rentWeeks: 52, supplies: 6, card: 2.9, fixed: 120, se: 14.1 };

test("parseNum strips currency formatting and rejects junk", () => {
  assert.equal(parseNum("$1,250.50"), 1250.5);
  assert.equal(parseNum("22%"), 22);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("commission keeps the entered share of services and retail plus all tips", () => {
  // services 105,600 * .5 + retail 7,200 * .2 + tips 15,840
  assert.equal(netAt(COMM, C), 52800 + 1440 + 15840);
});

test("chair rent keeps everything and pays rent, supplies, card fees, fixed costs and tax", () => {
  const y = yearly(RENT, C);
  assert.equal(y.rent, 15600);
  assert.equal(y.fixed, 1440);
  assert.ok(Math.abs(y.supplies - 6336) < 1e-6);
  assert.ok(Math.abs(y.card - 0.029 * 112800) < 1e-6);
  assert.ok(Math.abs(y.pretax - 101992.8) < 1e-6);
  assert.ok(Math.abs(y.net - 101992.8 * (1 - 0.141)) < 1e-6);
});

test("rent is charged on weeks not worked", () => {
  const r = analyze({ ...sampleInput() });
  assert.equal(r.detail[1].offWeeksRent, 1200);
  assert.ok(r.findings.some((f) => /\$1,200 of rent for weeks you are not working/.test(f.title)));
});

test("break-even weekly services just covers rent and fixed costs", () => {
  const be = breakEvenWeekly(RENT, C);
  const scale = be / C.services;
  assert.ok(Math.abs(yearly(RENT, C, scale).pretax) < 1e-6);
  assert.equal(breakEvenWeekly(COMM, C), 0);
});

test("crossover is where the two nets are equal", () => {
  const cs = crossovers(COMM, RENT, C, 3);
  assert.equal(cs.length, 1);
  assert.ok(Math.abs(netAt(COMM, C, cs[0]) - netAt(RENT, C, cs[0])) < 5);
});

test("rent loses when bookings are low and wins when they are high", () => {
  assert.ok(netAt(RENT, C, 0.2) < netAt(COMM, C, 0.2));
  assert.ok(netAt(RENT, C, 1.5) > netAt(COMM, C, 1.5));
});

test("hybrid pays rent and keeps the entered share", () => {
  const H = { ...COMM, mode: "hybrid", keep: 80, rent: 100, rentWeeks: 52 };
  const y = yearly(H, C);
  assert.equal(y.rent, 5200);
  assert.equal(y.take, 105600 * 0.8 + 7200 * 0.2 + 15840);
});

test("analyze validates input and reports on the sample", () => {
  assert.match(analyze({}).error, /service revenue/);
  assert.match(analyze({ ...sampleInput(), keepA: "150" }).error, /cannot be above 100/);
  assert.match(analyze({ ...sampleInput(), rentB: "" }).error, /weekly rent/);
  const r = analyze(sampleInput());
  assert.equal(r.error, null);
  assert.equal(Math.round(r.detail[0].net), 70080);
  assert.equal(Math.round(r.detail[1].net), 87612);
  assert.equal(r.scenarios.length, 7);
  assert.equal(parseInput({ ...sampleInput(), rentWeeksB: "" }).p.b.rentWeeks, 52);
});

test("CSV has a header and one row per scenario", () => {
  const csv = reportCsv(analyze(sampleInput()));
  assert.equal(csv.trim().split("\n").length, 8);
  assert.match(csv, /^"scenario","weekly_services"/);
});
