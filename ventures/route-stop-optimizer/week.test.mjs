import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDays, parseCustomers, planWeekFor, weekCsv, weekSampleText, weekSampleDepot, weekMapsLink } from "./week.mjs";
import { parsePoint } from "./calc.mjs";

test("day lists", () => {
  assert.deepEqual(parseDays("Mon|Thu"), [0, 3]);
  assert.deepEqual(parseDays("M/W/F"), [0, 2, 4]);
  assert.deepEqual(parseDays("Mon-Fri"), [0, 1, 2, 3, 4]);
  assert.deepEqual(parseDays("Fri-Mon"), [0, 4, 5, 6]);
  assert.deepEqual(parseDays("tuesday thursday"), [1, 3]);
  assert.equal(parseDays(""), null);
  assert.equal(parseDays("any"), null);
  assert.ok(Number.isNaN(parseDays("someday")));
});

test("customer rows: header, defaults and errors", () => {
  const ok = parseCustomers("name,lat,lng,service_min,visits_per_week,allowed_days,current_days\nA,39.7,-104.9\nB,39.8,-104.8,30,2,,Mon|Thu");
  assert.equal(ok.customers.length, 2);
  assert.deepEqual([ok.customers[0].service, ok.customers[0].freq, ok.customers[0].allowed, ok.customers[0].current], [0, 1, null, null]);
  assert.deepEqual(ok.customers[1].current, [0, 3]);
  assert.match(parseCustomers("A,39.7,-104.9,10,9").error, /visits a week/);
  assert.match(parseCustomers("A,39.7,-104.9,10,1,Blursday").error, /allowed days/);
  assert.match(parseCustomers("A,99,-104.9").error, /latitude/);
  assert.match(parseCustomers("").error, /No customers/);
});

test("sample week: verified plan, saving against current days, moves listed", () => {
  const { customers } = parseCustomers(weekSampleText());
  const r = planWeekFor({ depot: parsePoint(weekSampleDepot), customers }, { iterations: 3000 });
  assert.equal(r.error, undefined);
  assert.ok(r.current, "every sample customer has current days");
  assert.ok(r.save.money > 0 && r.save.miles > 0);
  assert.ok(r.best.overtime <= r.current.overtime + 1e-9);
  assert.equal(r.moves.length, r.best.moved);
  // twice-a-week customers are on two days at least 3 apart
  for (let c = 1; c < r.nodes.length; c++) {
    const days = r.patterns[c][r.best.pattern[c]];
    assert.equal(days.length, r.nodes[c].freq);
    if (days.length === 2) assert.ok(days[1] - days[0] >= 3);
  }
  const csv = weekCsv(r).trim().split("\n");
  assert.equal(csv.length - 1, customers.reduce((a, c) => a + c.freq, 0));
  assert.ok(weekMapsLink(r, 0, 0)[0].startsWith("https://www.google.com/maps/dir/?api=1&origin=39.742"));
});

test("a high move charge keeps everyone on their days", () => {
  const { customers } = parseCustomers(weekSampleText());
  const r = planWeekFor({ depot: parsePoint(weekSampleDepot), customers }, { iterations: 2000, movePenalty: 10000 });
  assert.equal(r.moves.length, 0);
});

test("allowed days, impossible frequency, and CSV formula guard", () => {
  const depot = parsePoint("39.74,-104.98");
  const bad = parseCustomers("A,39.7,-104.9,10,3,Mon|Tue");
  assert.match(planWeekFor({ depot, customers: bad.customers }, {}).error, /needs 3 visits/);
  const { customers } = parseCustomers("=HYPERLINK(1),39.7,-104.9,10,1,Wed\nB,39.75,-104.95,10,1,Sat");
  const r = planWeekFor({ depot, customers }, { workdays: [0, 1, 2, 3, 4, 5], iterations: 200 });
  assert.deepEqual(r.patterns[1][r.best.pattern[1]], [2]);
  assert.deepEqual(r.patterns[2][r.best.pattern[2]], [5]);
  assert.match(weekCsv(r), /"'=HYPERLINK\(1\)"/);
});
