import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServices, analyze, reportCsv, sampleServices, money, money2 } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const svc = (t) => { const p = parseServices(t); assert.ok(p.rows, p.error); return p.rows; };

test("parses services with header, tabs, defaults and skips", () => {
  const p = parseServices("service,price,minutes,supplies,per week\nBath,$55,60,4,6\nFull\t75\t90\t\t\nbad\nNeg,-5,30");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Bath", price: 55, minutes: 60, supplies: 4, perWeek: 6 });
  assert.deepEqual(p.rows[1], { name: "Full", price: 75, minutes: 90, supplies: 0, perWeek: 1 });
  assert.match(p.warnings.join(" "), /2 service line/);
  assert.ok(parseServices("").error);
});

test("per-service hand calculation", () => {
  // price 100, 50 min + 10 turnover = 1h slot, 3% fee, $5 supplies, overhead 2600/mo, 30 h x 50 wk
  const r = analyze(svc("Groom,100,50,5,2"), { overheadMonthly: 2600, bookableHoursPerWeek: 30, weeksPerYear: 50, cardFeePct: 3, turnoverMinutes: 10, targetHourly: 30 });
  const oh = (2600 * 12) / (30 * 50);
  near(r.overheadPerHour, oh);
  const l = r.lines[0];
  near(l.net, 97);
  near(l.contribution, 92);
  near(l.contributionPerHour, 92);
  near(l.profitPerHour, 92 - oh);
  near(l.floorPrice, ((30 + oh) * 1 + 5) / 0.97);
  // charging the floor price lands exactly on the target
  const at = analyze(svc(`Groom,${l.floorPrice},50,5,2`), { overheadMonthly: 2600, bookableHoursPerWeek: 30, weeksPerYear: 50, cardFeePct: 3, turnoverMinutes: 10, targetHourly: 30 });
  near(at.lines[0].profitPerHour, 30, 1e-7);
  assert.equal(at.lines[0].meetsTarget, true);
});

test("weekly totals and the three working models", () => {
  const r = analyze(svc("A,100,60,10,4\nB,50,30,2,6"), { overheadMonthly: 2000, weeksPerYear: 50, cardFeePct: 0, turnoverMinutes: 0, tipPct: 10, commissionPct: 50, boothRentWeekly: 300, bookableHoursPerWeek: 30 });
  assert.equal(r.week.dogs, 10);
  near(r.week.hoursUsed, 4 + 3);
  near(r.week.revenue, 700);
  near(r.week.supplies, 52);
  near(r.week.overheadWeekly, 480);
  near(r.week.ownShopWeekly, 700 - 52 - 480);
  const m = Object.fromEntries(r.models.map((x) => [x.key, x.weekly]));
  near(m.own, 168 + 70);
  near(m.booth, 700 - 52 - 300 + 70);
  near(m.commission, 350 + 70);
  assert.equal(r.best.key, "commission");
});

test("price-rise break-even loss: fixed overhead does not shrink", () => {
  const r = analyze(svc("A,100,60,0,10"), { cardFeePct: 0, overheadMonthly: 0, turnoverMinutes: 0, retentionIfRaised: 100 });
  const ten = r.raises.find((x) => x.pct === 10);
  near(ten.extraPerWeek, 100);
  near(ten.breakEvenLoss, 100 / 1100);
  near(ten.atRetention, 100);
  const lossy = analyze(svc("A,100,60,0,10"), { cardFeePct: 0, overheadMonthly: 0, turnoverMinutes: 0, retentionIfRaised: 90 });
  near(lossy.raises.find((x) => x.pct === 10).atRetention, 1100 * 0.9 - 1000);
});

test("verdict names the weakest service and flags a mix that does not fit", () => {
  const r = analyze(svc("Cheap,20,60,5,20\nGood,150,60,5,1"), { targetHourly: 40, bookableHoursPerWeek: 10, overheadMonthly: 0 });
  assert.match(r.verdict, /1 of 2/);
  assert.match(r.verdict, /Cheap/);
  assert.match(r.warnings.join(" "), /does not fit/);
});

test("rejects bad options", () => {
  assert.ok(analyze(svc("A,10,10"), { cardFeePct: 100 }).error);
  assert.ok(analyze(svc("A,10,10"), { bookableHoursPerWeek: 0 }).error);
  assert.ok(analyze(svc("A,10,10"), { targetHourly: "abc" }).error);
});

test("sample runs, CSV is well formed, formatters", () => {
  const r = analyze(svc(sampleServices()), { overheadMonthly: 2400 });
  assert.ok(!r.error);
  assert.ok(r.lines.length === 6);
  const csv = reportCsv(r);
  assert.match(csv, /^Service,Price/);
  assert.match(csv, /Commission/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});
