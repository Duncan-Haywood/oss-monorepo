import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJobs, analyze, sampleJob, reportCsv, money, money2 } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const base = { ownerHourly: 40, cardFeePct: 0 };
const one = (txt) => parseJobs(txt).rows;

test("parser reads lines, skips a header and bad rows, and warns", () => {
  const p = parseJobs("job,work hours,materials,price\nA,2,10,150\nbad,x,1,1\nB,0,1,1\nC,1.5,,");
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].materials, 0);
  assert.equal(p.rows[1].price, 0);
  assert.match(p.warnings[0], /2 job line/);
  assert.match(parseJobs("").error, /Add at least one/);
});

test("hand-calculated: 2 work hours at $40, no overhead, no trip, no fee", () => {
  const l = analyze(base, one("A,2,10,120")).lines[0];
  near(l.cost, 90);
  near(l.floor, 90);
  near(l.profit, 30);
  near(l.effectiveHourly, (120 - 10) / 2);
  assert.equal(l.meetsFloor, true);
});

test("overhead is spread over billable hours and charged on work hours only", () => {
  const r = analyze({ ...base, overheadPerMonth: 500, billableHoursPerMonth: 100 }, one("A,2,0,200"));
  near(r.overheadPerHour, 5);
  near(r.lines[0].overhead, 10);
  near(r.lines[0].cost, 80 + 10);
});

test("trip time (drive both ways, estimate, supply run) is unpaid time at your pay target; mileage is per trip", () => {
  const r = analyze({ ...base, driveMinutesOneWay: 15, quoteMinutes: 15, supplyRunMinutes: 15, milesRoundTrip: 20, costPerMile: 0.5 }, one("A,1,0,200"));
  near(r.tripHours, 1);
  near(r.mileage, 10);
  near(r.tripCost, 50);
  const l = r.lines[0];
  near(l.totalHours, 2);
  near(l.cost, 40 + 40 + 10);
  near(l.effectiveHourly, (200 - 10) / 2);
});

test("price floor grows with the card fee: cost / (1 - fee)", () => {
  const r = analyze({ ownerHourly: 40, cardFeePct: 10 }, one("A,2,20,0"));
  near(r.lines[0].floor, 100 / 0.9);
  assert.equal(r.lines[0].hasPrice, false);
  assert.equal(r.lines[0].profit, null);
  assert.equal(r.lines[0].meetsFloor, null);
  assert.match(r.verdict, /No prices entered/);
});

test("minimum job at a quoted hourly rate: trip cost divided by the contribution of each hour", () => {
  // trip: 1 hour * 40 + $10 = 50. Contribution: 80*(1-0.1) - 40 - 5 = 27. Hours = 50/27.
  const r = analyze({ ownerHourly: 40, overheadPerMonth: 500, billableHoursPerMonth: 100, driveMinutesOneWay: 30, milesRoundTrip: 20, costPerMile: 0.5, cardFeePct: 10, quotedRate: 80 }, one("A,1,0,100"));
  near(r.tripCost, 50);
  near(r.minimumJob.contributionPerHour, 27);
  near(r.minimumJob.hours, 50 / 27);
  near(r.minimumJob.price, (50 / 27) * 80);
  // at exactly that many hours the effective hourly equals the pay target
  const h = r.minimumJob.hours;
  const keep = h * 80 * 0.9 - h * 5 - 10;
  near(keep / (h + r.tripHours), 40);
});

test("a quoted rate that cannot cover pay target and overhead warns and gives no minimum job", () => {
  const r = analyze({ ownerHourly: 40, overheadPerMonth: 500, billableHoursPerMonth: 100, quotedRate: 44, cardFeePct: 3 }, one("A,1,0,100"));
  assert.equal(r.minimumJob, null);
  assert.ok(r.warnings.some((w) => /no job size covers the trip/.test(w)));
});

test("ladder marks which job sizes reach the pay target at the quoted rate", () => {
  const r = analyze({ ownerHourly: 40, driveMinutesOneWay: 30, quotedRate: 80, cardFeePct: 0 }, one("A,1,0,100"));
  // trip 1h. 0.5h job: 40/(1.5) = 26.67; 2h job: 160/3 = 53.33
  const half = r.ladder.find((x) => x.hours === 0.5), two = r.ladder.find((x) => x.hours === 2);
  near(half.effectiveHourly, 40 / 1.5);
  assert.equal(half.coversTarget, false);
  near(two.effectiveHourly, 160 / 3);
  assert.equal(two.coversTarget, true);
});

test("under-floor jobs are called out in verdict and warnings", () => {
  const r = analyze(base, one("Cheap,2,0,50\nFine,2,0,200"));
  assert.equal(r.lines[0].meetsFloor, false);
  assert.equal(r.lines[1].meetsFloor, true);
  assert.match(r.verdict, /1 of 2 priced job/);
  assert.match(r.verdict, /Cheap/);
  assert.ok(r.warnings.some((w) => /Cheap/.test(w)));
});

test("input checks", () => {
  assert.match(analyze({}, one("A,1,0,0")).error, /hourly pay/);
  assert.match(analyze({ ownerHourly: 40, overheadPerMonth: 100 }, one("A,1,0,0")).error, /billable work hours/);
  assert.match(analyze({ ownerHourly: 40, cardFeePct: 100 }, one("A,1,0,0")).error, /under 100/);
  assert.match(analyze({ ownerHourly: "abc" }, one("A,1,0,0")).error, /ownerHourly/);
  assert.match(analyze({ ownerHourly: 40, driveMinutesOneWay: -5 }, one("A,1,0,0")).error, /driveMinutesOneWay/);
});

test("sample runs, produces a minimum job and a CSV with one row per job", () => {
  const s = sampleJob();
  const r = analyze(s.settings, parseJobs(s.jobs).rows);
  assert.ok(!r.error);
  assert.ok(r.minimumJob.hours > 0);
  const lines = reportCsv(r).trim().split("\n");
  assert.equal(lines.length, 1 + r.lines.length);
  assert.match(lines[0], /^Job,/);
});

test("money formatters", () => {
  assert.equal(money(1234.6), "$1,235");
  assert.equal(money2(-5), "-$5.00");
});
