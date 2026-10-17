import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, parseNumber, parseWhen, detectDelimiter, decodeBuffer, normalizeRows, analyze, sampleCsv, MIN_ORDERS } from "./calc.mjs";

const HEAD = "Order ID,Platform,Order date,Status,Subtotal,Commission,Delivery fee,Marketing fees,Ad spend,Error charges,Net payout\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("CSV parsing handles quoted fields, embedded commas, quotes and newlines", () => {
  const rows = parseCsv('a,b\n"Joe\'s, Main St","say ""hi"""\n"line\nbreak",3\n');
  assert.deepEqual(rows[1], ["Joe's, Main St", 'say "hi"']);
  assert.deepEqual(rows[2], ["line\nbreak", "3"]);
  assert.equal(parseCsv("﻿x,y\r\n1,2\r\n")[0][0], "x");
});

test("money and dates parse common formats; delimiters and UTF-16 are detected", () => {
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("(45.00)"), -45);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.ok(Number.isNaN(parseNumber("n/a")));
  assert.deepEqual(parseWhen("06/03/2026 7:30 PM"), { t: Date.UTC(2026, 5, 3, 19, 30), hasTime: true });
  assert.equal(parseWhen("2026-06-03").hasTime, false);
  assert.equal(parseWhen("02/30/2026"), null);
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Order date"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "Order date");
});

test("an order is read with platform, charges as positive costs and the payout", () => {
  const n = load("D1,DoorDash,2026-06-01 18:30,Delivered,40.00,-10.00,-1.20,-4.00,-1.50,-6.00,17.30\n");
  assert.equal(n.platformSource, "column");
  const o = n.orders[0];
  assert.equal(o.platform, "doordash");
  assert.equal(o.gross, 40); assert.equal(o.commission, 10); assert.equal(o.delivery, 1.2);
  assert.equal(o.marketing, 4); assert.equal(o.ads, 1.5); assert.equal(o.errors, 6);
  assert.equal(o.payout, 17.3); assert.equal(o.hour, 18);
});

test("header aliases with a pipe or parenthesis tail still match, and platform comes from the header or file name", () => {
  const head = "DoorDash order ID,Timestamp local time,Subtotal,Commission,Marketing fees | (including any applicable taxes),Net total\n";
  const n = load("A1,2026-06-01 12:00,30,-7.5,-2,20.5\n", head);
  assert.equal(n.orders[0].marketing, 2);
  assert.equal(n.orders[0].platform, "doordash");
  assert.equal(n.platformSource, "header");
  const u = load("1,2026-06-01 12:00,30,-9\n", "Order ID,Order date,Food sales,Marketplace fee\n");
  assert.equal(u.orders[0].platform, "ubereats");
  const g = load("1,2026-06-01 12:00,30,-6\n", "Order ID,Order date,Subtotal,Commission\n", { hint: "grubhub-payouts-june.csv" });
  assert.equal(g.orders[0].platform, "grubhub");
  assert.equal(g.platformSource, "filename");
  const c = load("1,2026-06-01 12:00,30,-6\n", "Order ID,Order date,Subtotal,Commission\n", { platform: "ubereats" });
  assert.equal(c.orders[0].platform, "ubereats");
  assert.equal(load("1,2026-06-01 12:00,30,-6\n", "Order ID,Order date,Subtotal,Commission\n").orders[0].platform, "other");
});

test("day-first dates are detected and status words flag cancelled orders", () => {
  const n = load("A,DoorDash,25/06/2026 12:00,Delivered,20,-5,0,0,0,0,15\nB,DoorDash,03/06/2026 12:00,Cancelled by customer,0,0,0,0,0,0,0\n");
  assert.equal(n.dmy, true);
  assert.equal(n.orders[0].t, Date.UTC(2026, 5, 25, 12));
  assert.equal(n.cancelledCount, 1);
});

test("unreadable rows are skipped with a reason, and missing headers or empty files give errors", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,20,-5,0,0,0,0,15\nB,DoorDash,not a date,Delivered,20,-5,0,0,0,0,15\nC,DoorDash,2026-06-02 12:00,Delivered,abc,-5,0,0,0,0,15\nTotal,,,,,,,,,,\nD,DoorDash,2026-06-03 12:00,Delivered,,,,,,,\n");
  assert.equal(n.orders.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.reason).sort(), ["amount not a number", "date not readable", "no amount", "total row"]);
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2\n")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
  assert.match(load("x,y,nope,,,1,1\n").error, /No usable rows/);
});

const body = (p, n, gross, comm, extra = "0,0,0", day = 1, hour = 12) =>
  Array.from({ length: n }, (_, i) => `${p}${i},${p},2026-06-${String(day + (i % 3)).padStart(2, "0")} ${hour}:00,Delivered,${gross},-${comm},${extra},`).join("\n") + "\n";

test("take rate is every charge over food sales; net cash reconciles across platforms", () => {
  const n = load("D1,DoorDash,2026-06-01 12:00,Delivered,40,-10,-1,-4,-1,-6,18\nU1,Uber Eats,2026-06-02 12:00,Delivered,20,-6,0,0,0,0,14\n");
  const r = analyze(n.orders, {});
  const dd = r.byPlatform.find((b) => b.key === "doordash");
  near(dd.charges, 22); near(dd.takeRate, 22 / 40, 1e-9); near(dd.net, 18);
  near(r.summary.takeRate, 28 / 60, 1e-9);
  near(r.byPlatform.reduce((s, b) => s + b.net, 0), r.summary.net, 1e-9);
  assert.equal(r.byPlatform.reduce((s, b) => s + b.orders, 0), r.summary.orders);
  assert.equal(r.summary.payoutGap, 0);
});

test("net after costs takes food cost off the in-store price and packaging per order", () => {
  const n = load("D1,DoorDash,2026-06-01 12:00,Delivered,44,-11,0,0,0,0,33\n");
  const r = analyze(n.orders, { foodPct: 30, packaging: 1, markupNow: 10 });
  const o = r.worstOrders[0];
  near(o.base, 40); near(o.foodCost, 12); near(o.netAfter, 33 - 12 - 1);
  assert.equal(r.summary.costsEntered, true);
});

test("orders that lose money after costs are counted and listed worst first", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,12,-4,-1,-4,0,0,3\nB,DoorDash,2026-06-01 13:00,Delivered,50,-10,0,0,0,0,40\nC,DoorDash,2026-06-02 13:00,Delivered,10,-3,0,0,0,-8,-1\n");
  const r = analyze(n.orders, { foodPct: 35, packaging: 0.5 });
  assert.equal(r.summary.lossOrders, 2);
  assert.equal(r.worstOrders[0].id, "C");
  assert.ok(r.worstOrders[0].netAfter < r.worstOrders[1].netAfter);
  assert.ok(r.findings.some((f) => /2 of 3 orders lost money/.test(f.title)));
});

test("without food cost or packaging the findings say the net is overstated", () => {
  const r = analyze(load(body("D", 6, 20, 5, "0,0,0")).orders, {});
  assert.ok(r.findings.some((f) => /No food cost or packaging/.test(f.title)));
  assert.ok(!r.findings.some((f) => /lost money after food cost/.test(f.title)));
});

test("promo and ad return is profit before spend per dollar, in the best case that every order was new", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,30,-7.5,0,-3,-2,0,17.5\nB,DoorDash,2026-06-02 12:00,Delivered,30,-7.5,0,0,0,0,22.5\n");
  const r = analyze(n.orders, { foodPct: 30, packaging: 0 });
  const p = r.promo;
  near(p.spend, 5); assert.equal(p.orders, 1); assert.equal(p.plainOrders, 1);
  near(p.grossPerDollar, 6);
  // net after = 17.5 - 9 = 8.5; before spend = 13.5; per $ = 2.7
  near(p.profitBeforeSpendPerDollar, 2.7, 1e-9);
  assert.equal(analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,30,-7.5,0,0,0,0,22.5\n").orders, {}).promo, null);
  const bad = analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,20,-6,0,-9,0,0,5\n").orders, { foodPct: 40 });
  assert.ok(bad.promo.profitBeforeSpendPerDollar < 1);
  assert.ok(bad.findings.some((f) => f.severity === "high" && /Promotions and ads/.test(f.title)));
});

test("weekday and daypart findings ignore groups under five orders", () => {
  // Monday 2026-06-01 lunch and Friday 2026-06-05 dinner, six each, plus a lone Sunday
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(`L${i},DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24`);
  for (let i = 0; i < 6; i++) rows.push(`D${i},DoorDash,2026-06-05 19:00,Delivered,30,-12,0,0,0,0,18`);
  rows.push("S,DoorDash,2026-06-07 12:00,Delivered,30,0,0,0,0,0,30");
  const r = analyze(load(rows.join("\n") + "\n").orders, { foodPct: 30 });
  assert.equal(MIN_ORDERS, 5);
  assert.ok(r.findings.some((f) => /Monday orders left the most; Friday the least/.test(f.title)));
  assert.ok(r.findings.some((f) => /Lunch orders left the most per order; Dinner the least/.test(f.title)));
  assert.ok(!r.findings.some((f) => /Sunday/.test(f.title)), "one Sunday order is not a pattern");
  const few = analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24\nB,DoorDash,2026-06-05 19:00,Delivered,30,-12,0,0,0,0,18\n").orders, { foodPct: 30 });
  assert.ok(!few.findings.some((f) => /left the most/.test(f.title)));
});

test("a file with dates but no times has no daypart view", () => {
  const r = analyze(load("A,DoorDash,2026-06-01,Delivered,30,-6,0,0,0,0,24\n").orders, {});
  assert.equal(r.byDaypart.length, 0);
  assert.ok(r.findings.some((f) => /No times of day/.test(f.title)));
});

test("markup needed restores in-store dollars per order, and is null when the platform nets nothing", () => {
  // menu 40, food 30% = 12, packaging 1, net on platform 26 (35% charges)
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,40,-14,0,0,0,0,26\n");
  const r = analyze(n.orders, { foodPct: 30, packaging: 1 });
  near(r.summary.markup.total, (40 + 1) / 26 - 1, 1e-9);
  // at that markup, scaled net minus food cost equals in-store margin
  const m = r.summary.markup.total;
  near(26 * (1 + m) - 12, 40 - 12 + 1, 1e-9);
  const zero = analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,10,-10,0,0,0,0,0\n").orders, { foodPct: 30 });
  assert.equal(zero.summary.markup, null);
  // a markup already charged lowers the extra needed but not the total
  const withNow = analyze(n.orders, { foodPct: 30, packaging: 1, markupNow: 10 });
  near(withNow.summary.markup.extra, withNow.summary.markup.total - 0.1, 1e-9);
});

test("direct ordering comparison applies the typed fee to the same sales", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,40,-14,0,0,0,0,26\nB,DoorDash,2026-06-02 12:00,Delivered,20,-7,0,0,0,0,13\n");
  const r = analyze(n.orders, { foodPct: 30, packaging: 1, directPct: 3, directFlat: 0.3 });
  const d = r.summary.direct;
  near(d.fee, 60 * 0.03 + 0.6);
  near(d.net, 60 - d.fee);
  near(d.gain, d.netAfter - r.summary.netAfter);
  near(d.netAfter, d.net - 18 - 2);
  assert.ok(d.gain > 0);
  assert.ok(r.findings.some((f) => /own ordering at 3.0%/.test(f.title)));
});

test("cancelled orders: empty ones are dropped and counted, ones with a charge stay as cost only", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24\nB,DoorDash,2026-06-02 12:00,Cancelled,0,0,0,0,0,0,0\nC,DoorDash,2026-06-03 12:00,Cancelled by store,0,0,0,0,0,-5,-5\n");
  const r = analyze(n.orders, { foodPct: 30, packaging: 1 });
  assert.equal(r.summary.cancelledDropped, 1);
  assert.equal(r.summary.cancelledKept, 1);
  assert.equal(r.summary.orders, 1);
  near(r.summary.packaging, 1);
  near(r.summary.charges, 11);
});

test("a payout column that disagrees with the arithmetic is reported, not used", () => {
  const r = analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,27\n").orders, {});
  near(r.summary.net, 24);
  near(r.summary.payoutGap, 3);
  assert.ok(r.findings.some((f) => /payout column differs/.test(f.title)));
});

test("a date range filters orders and bad options are rejected", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24\nB,DoorDash,2026-06-10 12:00,Delivered,30,-6,0,0,0,0,24\n");
  assert.equal(analyze(n.orders, { from: Date.UTC(2026, 5, 10), to: Date.UTC(2026, 5, 10) }).summary.orders, 1);
  assert.match(analyze(n.orders, { from: Date.UTC(2027, 0, 1) }).invalid, /No orders/);
  assert.match(analyze(n.orders, { foodPct: 100 }).invalid, /Food cost/);
  assert.match(analyze(n.orders, { packaging: -1 }).invalid, /Packaging/);
});

test("the synthetic example reads cleanly, spans three platforms and reconciles", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.ok(!n.error);
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.orders, { foodPct: 32, packaging: 0.8 });
  assert.equal(r.byPlatform.length, 3);
  assert.ok(r.summary.lossOrders >= 1);
  assert.ok(r.byDaypart.length >= 2);
  near(r.byPlatform.reduce((s, b) => s + b.netAfter, 0), r.summary.netAfter, 1e-6);
  assert.ok(Math.abs(r.summary.payoutGap) < 1, "example payouts equal food sales minus charges");
});

test("calc.mjs makes no network calls", () => {
  const src = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
});
