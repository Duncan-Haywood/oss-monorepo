import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRooms, parseExpenses, analyze, reportCsv, sampleRooms, sampleExpenses, timePct } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const rooms = (t) => { const p = parseRooms(t); assert.ok(p.rows, p.error); return p.rows; };
const exps = (t) => parseExpenses(t).rows;

test("parses rooms with a header, exclusive flags and tabs", () => {
  const p = parseRooms("room,sq ft,exclusive\nPlayroom,150,exclusive\nKitchen,180\nHall\t60\t");
  assert.deepEqual(p.rows, [
    { name: "Playroom", sqft: 150, exclusive: true },
    { name: "Kitchen", sqft: 180, exclusive: false },
    { name: "Hall", sqft: 60, exclusive: false },
  ]);
  assert.ok(parseRooms("").error);
  assert.match(parseRooms("A,-5\nB,x").error, /at least one room/);
});

test("parses expenses, keeping commas inside names and counting skips", () => {
  const p = parseExpenses('"Tax, property",$3,900\nUtilities,4200\nbad line\nNeg,-5');
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].amount, 3900);
  assert.match(p.warnings.join(" "), /2 expense line/);
});

test("time share is hours in business over hours available", () => {
  const t = timePct({ hoursPerWeek: 50, prepHoursPerWeek: 5, weeksOpen: 50, daysAvailable: 365 });
  assert.equal(t.hours, 2750);
  assert.equal(t.available, 8760);
  near(t.pct, 2750 / 8760);
  assert.equal(timePct({ hoursPerWeek: 168, prepHoursPerWeek: 0, weeksOpen: 52, daysAvailable: 100 }).pct, 1);
});

test("regular-use rooms use space x time; hand calculation", () => {
  // 600 of 1500 sq ft = 40%; time 2750/8760; effective = 0.4 * 0.31393
  const r = analyze(rooms("a,300\nb,300"), exps("Interest,10000"), { homeSqft: 1500 });
  near(r.effective, 0.4 * 2750 / 8760);
  near(r.totals.business, 10000 * 0.4 * 2750 / 8760);
  near(r.totals.business + r.totals.personal, 10000);
});

test("exclusive rooms count at full space share with no time factor", () => {
  const r = analyze(rooms("play,150,exclusive\nliving,300"), exps("Interest,10000"), { homeSqft: 1500 });
  near(r.effective, 150 / 1500 + (300 / 1500) * (2750 / 8760));
  const allExcl = analyze(rooms("play,300,exclusive"), exps("X,1000"), { homeSqft: 1500 });
  near(allExcl.effective, 0.2);
});

test("simplified method: rate x area, area scaled by time share, capped", () => {
  const r = analyze(rooms("a,600"), exps("X,1000"), { homeSqft: 1500 });
  near(r.simplified.allowableArea, 600 * 2750 / 8760);
  near(r.simplified.amount, Math.min(600 * 2750 / 8760, 300) * 5);
  assert.equal(r.simplified.capBinds, false);
  const big = analyze(rooms("a,900,exclusive"), exps("X,1000"), { homeSqft: 1500 });
  assert.equal(big.simplified.cappedArea, 300);
  assert.equal(big.simplified.amount, 1500);
  assert.equal(big.simplified.capBinds, true);
  const custom = analyze(rooms("a,900,exclusive"), exps("X,1000"), { homeSqft: 1500, simplifiedRate: 6, simplifiedCapSqft: 400 });
  assert.equal(custom.simplified.amount, 2400);
});

test("direct expenses are added unprorated", () => {
  const r = analyze(rooms("a,300"), exps("X,1000"), { homeSqft: 1500, directExpenses: 2000 });
  near(r.totals.regularPlusDirect, r.totals.business + 2000);
  near(r.simplified.plusDirect, r.simplified.amount + 2000);
});

test("sensitivity table and the worth of one more weekly hour", () => {
  const r = analyze(rooms("a,300"), exps("X,10000"), { homeSqft: 1500 });
  assert.equal(r.sensitivity.length, 5);
  assert.deepEqual(r.sensitivity.map((s) => s.hoursPerWeek), [40, 45, 50, 55, 60]);
  assert.ok(r.sensitivity[4].deduction > r.sensitivity[0].deduction);
  // one more hour: 10000 * 0.2 * 50/8760
  near(r.perExtraHour, 10000 * 0.2 * 50 / 8760);
});

test("validation errors", () => {
  const rm = rooms("a,300");
  assert.match(analyze(rm, [], {}).error, /square feet of your home/);
  assert.match(analyze(rooms("a,2000"), [], { homeSqft: 1500 }).error, /more than/);
  assert.match(analyze(rm, [], { homeSqft: 1500, weeksOpen: 60 }).error, /52/);
  assert.match(analyze(rm, [], { homeSqft: 1500, hoursPerWeek: 160, prepHoursPerWeek: 20 }).error, /168/);
  assert.match(analyze(rm, [], { homeSqft: 1500, daysAvailable: 400 }).error, /366/);
  assert.match(analyze(rm, [], { homeSqft: 1500, hoursPerWeek: "abc" }).error, /hoursPerWeek/);
  assert.match(analyze(rm, [], { homeSqft: 1500, directExpenses: -1 }).error, /directExpenses/);
});

test("warns on a high time share and says which method is larger", () => {
  const hi = analyze(rooms("a,300"), exps("X,1000"), { homeSqft: 1500, hoursPerWeek: 110, prepHoursPerWeek: 10 });
  assert.match(hi.warnings.join(" "), /high/);
  const none = analyze(rooms("a,300"), [], { homeSqft: 1500 });
  assert.match(none.verdict, /Add home expenses/);
  const big = analyze(rooms("a,300,exclusive"), exps("X,50000"), { homeSqft: 1500 });
  assert.match(big.verdict, /Regular method is larger/);
});

test("sample data runs and the CSV round-trips the totals", () => {
  const r = analyze(rooms(sampleRooms()), parseExpenses(sampleExpenses()).rows, { homeSqft: 1500 });
  assert.ok(!r.error);
  assert.ok(r.effective > 0 && r.effective < 1);
  const csv = reportCsv(r);
  assert.match(csv, /^Expense,Annual amount/);
  assert.match(csv, /Total home expenses,27200\.00/);
  assert.match(csv, /Simplified method,/);
});
