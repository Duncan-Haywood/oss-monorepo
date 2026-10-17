import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGigs, analyze, reportCsv, sampleGigs, money, money2 } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const gig = (t) => { const p = parseGigs(t); assert.ok(p.rows, p.error); return p.rows; };

test("parses packages with header, tabs, defaults and skips", () => {
  const p = parseGigs("package,price,hours,costs,per month\nWedding,$1800,5,120,3\nParty\t700\t3\t\t\nbad\nNeg,-5,3");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Wedding", price: 1800, hours: 5, costs: 120, perMonth: 3 });
  assert.deepEqual(p.rows[1], { name: "Party", price: 700, hours: 3, costs: 0, perMonth: 1 });
  assert.match(p.warnings.join(" "), /2 package line/);
  assert.ok(parseGigs("").error);
});

test("per-gig hand calculation counts setup and prep hours", () => {
  // price 1000, 4 event h + 2 setup + 1 prep = 7 h slot, 3% fee, $100 costs, overhead 1000/mo, 25 h x 50 wk
  const o = { overheadMonthly: 1000, bookableHoursPerWeek: 25, weeksPerYear: 50, cardFeePct: 3, setupHours: 2, prepHours: 1, targetHourly: 50 };
  const r = analyze(gig("Wedding,1000,4,100,2"), o);
  const oh = 12000 / 1250;
  near(r.overheadPerHour, oh);
  const l = r.lines[0];
  near(l.slotHours, 7);
  near(l.net, 970);
  near(l.contribution, 870);
  near(l.profitPerHour, 870 / 7 - oh);
  near(l.floorPrice, ((50 + oh) * 7 + 100) / 0.97);
  const at = analyze(gig(`Wedding,${l.floorPrice},4,100,2`), o);
  near(at.lines[0].profitPerHour, 50, 1e-7);
  assert.equal(at.lines[0].meetsTarget, true);
});

test("monthly gigs convert to a weekly mix and the three models", () => {
  const r = analyze(gig("A,1000,4,100,5\nB,500,3,50,10"), { overheadMonthly: 1200, weeksPerYear: 50, cardFeePct: 0, setupHours: 0, prepHours: 0, tipPct: 10, leadFeePct: 20, agencyKeepPct: 60, agencyOverheadPct: 50, bookableHoursPerWeek: 30 });
  const k = 12 / 50;
  near(r.week.gigs, 15 * k);
  near(r.week.hoursUsed, (20 + 30) * k);
  near(r.week.revenue, 10000 * k);
  near(r.week.costs, 1000 * k);
  near(r.week.overheadWeekly, 288);
  const rev = 10000 * k, costs = 1000 * k, tips = rev * 0.1;
  const m = Object.fromEntries(r.models.map((x) => [x.key, x.weekly]));
  near(m.own, rev - costs - 288 + tips);
  near(m.lead, rev * 0.8 - costs - 288 + tips);
  near(m.agency, rev * 0.6 + tips - costs - 144);
  assert.equal(r.best.key, "own");
});

test("price-rise break-even loss: fixed overhead does not shrink", () => {
  const base = { cardFeePct: 0, overheadMonthly: 0, setupHours: 0, prepHours: 0, weeksPerYear: 12 };
  const r = analyze(gig("A,100,1,0,10"), { ...base, retentionIfRaised: 100 });
  const ten = r.raises.find((x) => x.pct === 10);
  near(ten.extraPerWeek, 100);
  near(ten.breakEvenLoss, 100 / 1100);
  near(ten.atRetention, 100);
  const lossy = analyze(gig("A,100,1,0,10"), { ...base, retentionIfRaised: 90 });
  near(lossy.raises.find((x) => x.pct === 10).atRetention, 1100 * 0.9 - 1000);
});

test("verdict names the weakest package and flags a mix that does not fit", () => {
  const r = analyze(gig("Cheap,100,3,50,20\nGood,2000,3,50,1"), { targetHourly: 40, bookableHoursPerWeek: 5, overheadMonthly: 0 });
  assert.match(r.verdict, /1 of 2/);
  assert.match(r.verdict, /Cheap/);
  assert.match(r.warnings.join(" "), /does not fit/);
});

test("rejects bad options", () => {
  assert.ok(analyze(gig("A,10,1"), { cardFeePct: 100 }).error);
  assert.ok(analyze(gig("A,10,1"), { leadFeePct: 100 }).error);
  assert.ok(analyze(gig("A,10,1"), { agencyKeepPct: 120 }).error);
  assert.ok(analyze(gig("A,10,1"), { bookableHoursPerWeek: 0 }).error);
  assert.ok(analyze(gig("A,10,1"), { targetHourly: "abc" }).error);
});

test("sample runs, CSV is well formed, formatters", () => {
  const r = analyze(gig(sampleGigs()), { overheadMonthly: 1100 });
  assert.ok(!r.error);
  assert.equal(r.lines.length, 6);
  const csv = reportCsv(r);
  assert.match(csv, /^Package,Price/);
  assert.match(csv, /Agency subcontract/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});
