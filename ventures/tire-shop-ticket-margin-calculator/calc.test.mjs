import { test } from "node:test";
import assert from "node:assert/strict";
import { parseItems, analyze, reportCsv, sampleItems, money, money2, pct } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const rows = (t) => { const p = parseItems(t); assert.ok(p.rows, p.error); return p.rows; };
// Two lines, no card fee, $30/h labor: tire set (100 price, 60 parts, 30 min, every ticket)
// and an add-on (50 price, 10 parts, 20 min, 40% of tickets).
const TWO = "Tires,100,60,30,100\nAdd-on,50,10,20,40";
const OPTS = { ticketsPerMonth: 100, laborCostPerHour: 30, cardFeePct: 0, overheadMonthly: 2000, bays: 1, hoursPerBayDay: 8, daysPerMonth: 25, liftPoints: 5 };

test("parses lines with header, tabs, blank attach and skips", () => {
  const p = parseItems("item,price,cost,minutes,attach\nTires,$720,520,50,100\nAlign\t120\t8\t40\t30\nFee,20,6\nbad\nNeg,-1,0,0,50\nOver,10,1,1,150");
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows[0], { name: "Tires", price: 720, cost: 520, minutes: 50, attach: 100 });
  assert.deepEqual(p.rows[1], { name: "Align", price: 120, cost: 8, minutes: 40, attach: 30 });
  assert.deepEqual(p.rows[2], { name: "Fee", price: 20, cost: 6, minutes: 0, attach: 100 });
  assert.match(p.warnings.join(" "), /3 line/);
  assert.ok(parseItems("").error);
});

test("per-line hand calculation", () => {
  const r = analyze(rows(TWO), OPTS);
  const [a, b] = r.lines;
  near(a.gross, 40); near(a.labor, 15); near(a.net, 25); near(a.marginPct, 0.25);
  near(a.grossPerBayHour, 80);
  near(b.gross, 40); near(b.labor, 10); near(b.net, 30); near(b.perTicketNet, 12);
  near(b.monthlySales, 40); near(b.monthlyNet, 1200);
  near(b.grossPerBayHour, 120);
});

test("card fee reduces gross on the price only", () => {
  const r = analyze(rows("T,100,60,0,100"), { ...OPTS, cardFeePct: 3 });
  near(r.lines[0].gross, 100 * 0.97 - 60);
  assert.equal(r.lines[0].grossPerBayHour, null);
});

test("ticket, store net, break-even tickets and capacity", () => {
  const r = analyze(rows(TWO), OPTS);
  near(r.ticket.revenue, 120);
  near(r.ticket.net, 37);
  near(r.ticket.minutes, 38);
  near(r.ticket.marginPct, 37 / 120);
  near(r.store.revenue, 12000);
  near(r.store.contribution, 3700);
  near(r.store.net, 1700);
  near(r.store.annual, 20400);
  near(r.store.breakEvenTickets, 2000 / 37);
  near(r.store.capacityMinutes, 12000);
  near(r.store.demandMinutes, 3800);
  near(r.store.utilization, 3800 / 12000);
  near(r.store.maxTickets, 12000 / 38);
  near(r.store.netPerBayHour, 3700 / (3800 / 60));
});

test("attach lift is capped at 100 percent of tickets", () => {
  const r = analyze(rows(TWO), OPTS);
  const [a, b] = r.lifts;
  assert.equal(a.to, 100); near(a.extraSales, 0); near(a.extraNet, 0);
  assert.equal(b.to, 45); near(b.extraSales, 5); near(b.extraNet, 150); near(b.extraMinutes, 100);
  const hi = analyze(rows("A,50,10,20,98"), { ...OPTS, liftPoints: 5 });
  assert.equal(hi.lifts[0].to, 100);
  near(hi.lifts[0].extraSales, 2);
  assert.match(r.verdict, /Add-on/);
});

test("discount break-even volume holds net per ticket", () => {
  const r = analyze(rows(TWO), OPTS);
  const tires10 = r.discounts[0].cuts[1];
  near(tires10.perTicketLoss, 10);
  near(tires10.volumeGain, 37 / 27 - 1);
  assert.equal(tires10.fits, true);
  const add5 = r.discounts[1].cuts[0];
  near(add5.perTicketLoss, 1);
  near(add5.volumeGain, 37 / 36 - 1);
  // At the extra volume the ticket net times tickets equals today's contribution.
  near(100 * (1 + tires10.volumeGain) * 27, 3700);
  // A cut that wipes out the ticket cannot be recovered by volume.
  const flat = analyze(rows("T,100,95,0,100"), { ...OPTS, laborCostPerHour: 0 });
  assert.equal(flat.discounts[0].cuts[1].volumeGain, null);
});

test("fits flag turns false when the extra volume exceeds the bays", () => {
  const r = analyze(rows(TWO), { ...OPTS, ticketsPerMonth: 300 });
  assert.equal(r.discounts[0].cuts[1].fits, false);
});

test("warnings: over capacity, losing lines, free labor", () => {
  const over = analyze(rows(TWO), { ...OPTS, ticketsPerMonth: 400 });
  assert.match(over.warnings.join(" "), /do not fit/);
  const loser = analyze(rows("T,100,90,60,100"), OPTS);
  assert.match(loser.warnings.join(" "), /loses money/);
  assert.match(loser.verdict, /loses money/);
  const free = analyze(rows(TWO), { ...OPTS, laborCostPerHour: 0 });
  assert.match(free.warnings.join(" "), /Labor cost per hour is zero/);
});

test("rejects bad options", () => {
  assert.ok(analyze(rows(TWO), { ...OPTS, ticketsPerMonth: 0 }).error);
  assert.ok(analyze(rows(TWO), { ...OPTS, cardFeePct: 100 }).error);
  assert.ok(analyze(rows(TWO), { ...OPTS, bays: 0 }).error);
  assert.ok(analyze(rows(TWO), { ...OPTS, daysPerMonth: 32 }).error);
  assert.ok(analyze(rows(TWO), { ...OPTS, overheadMonthly: -1 }).error);
  assert.ok(analyze(rows(TWO), { ...OPTS, liftPoints: "x" }).error);
});

test("sample data parses and produces a profitable ticket", () => {
  const r = analyze(rows(sampleItems()), { ...OPTS, ticketsPerMonth: 220, overheadMonthly: 9000, laborCostPerHour: 28, cardFeePct: 3, bays: 2, daysPerMonth: 26 });
  assert.ok(r.ticket.net > 0);
  assert.equal(r.lines.length, 5);
  assert.ok(r.store.utilization > 0 && r.store.utilization < 1);
});

test("CSV and formatters", () => {
  const csv = reportCsv(analyze(rows("Tires,100,60,30,100"), OPTS));
  assert.ok(csv.startsWith("Item,Price"));
  const quoted = reportCsv(analyze([{ name: 'Tires, "set"', price: 100, cost: 60, minutes: 30, attach: 100 }], OPTS));
  assert.match(quoted, /"Tires, ""set"""/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(12.5), "$12.50");
  assert.equal(pct(0.1234), "12.3%");
});
