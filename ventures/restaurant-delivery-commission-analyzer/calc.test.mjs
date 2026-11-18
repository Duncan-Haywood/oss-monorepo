import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, parseNumber, parseWhen, detectDelimiter, detectDecimalComma, decodeBuffer, normalizeRows, analyze, sampleCsv, MIN_ORDERS, DAYPARTS, detectDmy, pct, money } from "./calc.mjs";

const HEAD = "Order ID,Platform,Order date,Status,Subtotal,Commission,Delivery fee,Marketing fees,Ad spend,Error charges,Net payout\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("CSV parsing handles quoted fields, embedded commas, quotes and newlines", () => {
  const rows = parseCsv('a,b\n"Joe\'s, Main St","say ""hi"""\n"line\nbreak",3\n');
  assert.deepEqual(rows[1], ["Joe's, Main St", 'say "hi"']);
  assert.deepEqual(rows[2], ["line\nbreak", "3"]);
  assert.equal(parseCsv("\uFEFFx,y\r\n1,2\r\n")[0][0], "x");
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

// Quality audit 2026-11-13 (portfolio/quality/audits/2026-11-13-restaurant-delivery-commission-analyzer.json,
// defect 0): every amount went through Math.abs, so a reversal doubled a charge
// and a refund row added food sales and an order.
test("a charge reversal is a credit and a refund row reduces sales without adding an order", () => {
  const n = load(
    "A,DoorDash,2026-06-01 12:00,Delivered,40,-10,0,0,0,-6,24\n" +
    "B,DoorDash,2026-06-02 12:00,Delivered,30,-6,0,0,0,0,24\n" +
    "A-adj,DoorDash,2026-06-03 12:00,Adjustment,0,0,0,0,0,6,6\n" +
    "R1,DoorDash,2026-06-04 12:00,Delivered,-15,3,0,0,0,0,-12\n");
  const o = n.orders;
  assert.equal(o[2].errors, -6, "a +6 reversal in a column of negative charges is a $6 credit");
  assert.equal(o[3].refund, true);
  assert.equal(o[3].commission, -3, "commission handed back on a refund is a credit");
  const r = analyze(o, { foodPct: 30, packaging: 1 });
  // Sales 40 + 30 - 15 = 55; charges 10 + 6 + 6 - 6 - 3 = 13; net 42.
  near(r.summary.gross, 55);
  near(r.summary.errors, 0);
  near(r.summary.charges, 13);
  near(r.summary.net, 42);
  assert.equal(r.summary.orders, 2, "the adjustment and refund rows are not orders");
  near(r.byPlatform[0].packaging, 2); // summary.packaging is the typed per-order cost
  near(r.summary.foodCost, 21, 0.01); // 30% of 70, the two real orders only
  assert.equal(r.summary.refunds, 1);
  near(r.summary.payoutGap, 0);
  assert.ok(r.findings.some((f) => /1 refund row took \$15\.00 off food sales/.test(f.title)));
});

test("a file that shows charges as positive numbers reads a negative one as a credit", () => {
  const n = load(
    "A,Uber Eats,2026-06-01 12:00,Delivered,40,12,2,0,0,0,26\n" +
    "B,Uber Eats,2026-06-02 12:00,Delivered,20,6,0,0,0,3,11\n" +
    "C,Uber Eats,2026-06-03 12:00,Delivered,0,0,0,0,0,-3,3\n");
  assert.deepEqual(n.orders.map((x) => x.errors), [0, 3, -3]);
  assert.equal(n.orders[0].commission, 12);
  const r = analyze(n.orders, {});
  near(r.summary.charges, 20);
  near(r.summary.net, 40);
  near(r.summary.takeRate, 20 / 60);
});

// Red-team 2026-11-14: defects and escaped mutants from the campaign on calc.mjs.
test("a minus sign after a currency symbol or code still makes the amount negative", () => {
  assert.equal(parseNumber("$-12.50"), -12.5);
  assert.equal(parseNumber("USD -3.00"), -3);
  assert.equal(parseNumber("€-1.234,50", true), -1234.5);
  assert.equal(parseNumber("-$4"), -4);
  assert.equal(parseNumber("$4"), 4);
  // In a file of negative charges, a "$-" charge is a cost, not a credit.
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,20,-5,0,0,0,0,15\nB,DoorDash,2026-06-02 12:00,Delivered,20,$-5.00,0,0,0,0,15\n");
  assert.deepEqual(n.orders.map((o) => o.commission), [5, 5]);
});

test("an order that breaks even to the cent is not a loss, and no amount prints as -$0.00", () => {
  // 10.10 - 0.30 - 9.80 is -1.8e-15 in floating point.
  const rows = Array.from({ length: 6 }, (_, i) => `O${i},DoorDash,2026-06-0${i + 1} 12:00,Delivered,10.10,-0.30,0,0,0,0,9.80`).join("\n");
  const r = analyze(load(rows + "\n").orders, { packaging: 9.8 });
  assert.equal(r.summary.lossOrders, 0);
  assert.equal(r.lossOrders.count, 0);
  assert.ok(r.findings.some((f) => /No order lost money/.test(f.title)));
  for (const f of r.findings) assert.doesNotMatch(f.title + f.detail, /-\$0\.00/);
});

test("zero amounts print without a minus sign in the findings", () => {
  const r = analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,20,-5,0,0,0,0,15\n").orders, {});
  const take = r.findings.find((f) => /kept .* of food sales/.test(f.title));
  assert.match(take.detail, /ad spend \$0\.00/);
});

test("an order with food sales under a dollar still counts as an order", () => {
  const r = analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,0.75,-0.20,0,0,0,0,0.55\n").orders, {});
  assert.equal(r.summary.orders, 1);
});

test("the summary date range runs from the first order's day to the last's", () => {
  const r = analyze(load("A,DoorDash,2026-06-03 12:00,Delivered,20,-5,0,0,0,0,15\nB,DoorDash,2026-06-01 09:00,Delivered,20,-5,0,0,0,0,15\nC,DoorDash,2026-06-09 23:30,Delivered,20,-5,0,0,0,0,15\n").orders, {});
  assert.equal(new Date(r.summary.from).toISOString().slice(0, 10), "2026-06-01");
  assert.equal(new Date(r.summary.to).toISOString().slice(0, 10), "2026-06-09");
});

test("a single losing order gets the loss finding", () => {
  const r = analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,10,-3,0,0,0,-8,-1\nB,DoorDash,2026-06-02 12:00,Delivered,50,-10,0,0,0,0,40\n").orders, { foodPct: 30 });
  assert.equal(r.summary.lossOrders, 1);
  assert.ok(r.findings.some((f) => /^1 of 2 orders lost money/.test(f.title)));
});

test("the example file is stable: same sales, orders and dates every load", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).orders, {});
  assert.equal(r.summary.gross.toFixed(2), "6259.53");
  assert.equal(r.summary.orders, 246);
});

// Red-team 2026-11-14 (second campaign): the decimal format came from the
// delimiter, so a tab-delimited European export read "12,50" as 1250 and a
// semicolon file with dot decimals read "1,234.56" as 1.23.
test("the decimal format is read from the amounts, not from the delimiter", () => {
  const tab = "Order date\tSubtotal\tCommission\n01.06.2026 12:00\t12,50\t-3,13\n02.06.2026 12:00\t1.234,56\t-308,64\n";
  const t = parseCsv(tab, detectDelimiter(tab));
  assert.equal(detectDecimalComma(t), true);
  const n = normalizeRows(t, { decimalComma: "auto" });
  assert.deepEqual(n.orders.map((o) => [o.gross, o.commission]), [[12.5, 3.13], [1234.56, 308.64]]);

  const semi = "Order date;Subtotal;Commission\n2026-06-01 12:00;1,234.56;-308.64\n2026-06-02 12:00;20.00;-5.00\n";
  const s = parseCsv(semi, ";");
  assert.equal(detectDecimalComma(s), false);
  assert.deepEqual(normalizeRows(s, { decimalComma: "auto" }).orders.map((o) => o.gross), [1234.56, 20]);

  // No telling digit pattern: the delimiter decides, as before.
  const whole = "Order date;Subtotal;Commission\n2026-06-01 12:00;20;-5\n";
  assert.equal(detectDecimalComma(parseCsv(whole, ";"), ";"), true);
  assert.equal(detectDecimalComma(parseCsv(whole.replace(/;/g, ",")), ","), false);
});

test("the page asks for the decimal format to be detected", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /decimalComma: "auto"/);
});

test("two platforms with the same take rate are both named in the comparison", () => {
  const body = Array.from({ length: 10 }, (_, i) => `O${i},${i % 2 ? "DoorDash" : "Grubhub"},2026-06-0${(i % 9) + 1} 12:00,Delivered,20,-5,0,0,0,0,15`).join("\n");
  const f = analyze(load(body + "\n").orders, {}).findings.find((x) => / cost .* of sales; /.test(x.title));
  assert.ok(f, "comparison finding present");
  assert.match(f.title, /DoorDash/);
  assert.match(f.title, /Grubhub/);
});

test("an 11:00 order is lunch, not morning", () => {
  const body = Array.from({ length: 6 }, (_, i) => `O${i},DoorDash,2026-06-0${i + 1} 11:30,Delivered,20,-5,0,0,0,0,15`).join("\n");
  const r = analyze(load(body + "\n").orders, {});
  assert.deepEqual(r.byDaypart.map((d) => d.key), ["lunch"]);
  assert.equal(DAYPARTS.find((p) => p.key === "morning").to, 11);
});

test("a blank direct-order fee falls back to 3% + $0.30, not 0%", () => {
  const orders = load("A,DoorDash,2026-06-01 12:00,Delivered,100,-25,0,0,0,0,75\n").orders;
  for (const blankPct of ["", undefined, null]) {
    const r = analyze(orders, { directPct: blankPct, directFlat: "" });
    near(r.summary.directPct, 0.03, 1e-9);
    near(r.summary.direct.fee, 3.3, 1e-9);
  }
});

test("the example's ad charges span the $1 to $3.50 range the generator draws", () => {
  const ads = normalizeRows(parseCsv(sampleCsv())).orders.map((o) => o.ads).filter((v) => v > 0);
  assert.ok(ads.length > 10);
  assert.ok(Math.max(...ads) > 2.5, `largest ad charge ${Math.max(...ads)}`);
  assert.ok(Math.min(...ads) >= 1);
});

// Red-team 2026-11-14: guards for mutants that escaped the suite, and a crash.
test("a clock time with minute 60 is not a time", () => {
  assert.equal(parseWhen("2026-06-01 12:60"), null);
  assert.equal(parseWhen("2026-06-01 12:59").t, Date.UTC(2026, 5, 1, 12, 59));
});

test("a 21:00 order is late, not dinner", () => {
  const body = Array.from({ length: 6 }, (_, i) => `O${i},DoorDash,2026-06-0${i + 1} 21:15,Delivered,20,-5,0,0,0,0,15`).join("\n");
  const r = analyze(load(body + "\n").orders, {});
  assert.deepEqual(r.byDaypart.map((d) => d.key), ["late"]);
});

test("average ticket is food sales over orders", () => {
  const r = analyze(load("A,DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24\nB,DoorDash,2026-06-02 12:00,Delivered,10,-2,0,0,0,0,8\n").orders, {});
  near(r.summary.avgTicket, 20);
  near(r.byPlatform[0].avgTicket, 20);
});

test("a direct-order fee of 100% or more is rejected", () => {
  const orders = load("A,DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24\n").orders;
  assert.match(analyze(orders, { directPct: 100 }).invalid, /Direct-order fee/);
  assert.match(analyze(orders, { directPct: 150 }).invalid, /Direct-order fee/);
  assert.match(analyze(orders, { directPct: -1 }).invalid, /Direct-order fee/);
});

test("the loss finding states the food sales of the losing orders to the cent", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,12,-4,-1,-4,0,0,3\nB,DoorDash,2026-06-01 13:00,Delivered,50,-10,0,0,0,0,40\nC,DoorDash,2026-06-02 13:00,Delivered,10,-3,0,0,0,-8,-1\n");
  const r = analyze(n.orders, { foodPct: 35, packaging: 0.5 });
  assert.equal(r.lossOrders.gross, 22);
  const f = r.findings.find((x) => /lost money after food cost/.test(x.title));
  assert.match(f.detail, / on \$22\.00 of food sales/);
});

test("the example has orders with no ad spend, and Grubhub runs no ads", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).orders, {});
  assert.equal(r.byPlatform.find((b) => b.key === "grubhub").ads, 0);
});

test("a file with 200,000 orders is analysed, not a stack overflow", () => {
  const start = Date.UTC(2025, 0, 1);
  const orders = Array.from({ length: 200000 }, (_, i) => ({ line: i + 2, id: `O${i}`, platform: "doordash", store: "", t: start + i * 120000, hasTime: true, hour: 12, cancelled: false, refund: false, gross: 20, commission: 5, delivery: 0, marketing: 0, ads: 0, errors: 0, payout: null }));
  const r = analyze(orders, {});
  assert.equal(r.summary.orders, 200000);
  assert.equal(r.summary.from, start);
  assert.equal(r.summary.to, Math.floor((start + 199999 * 120000) / 86400000) * 86400000);
});

// Red-team 2026-11-14: guards for mutants that escaped the suite, and two
// real defects (a three-digit year was read as year 123; a non-numeric
// own-ordering fee passed validation and printed "NaN%").
test("dates: December, 7:30 AM, two- and four-digit years only", () => {
  assert.deepEqual(parseWhen("2026-12-05"), { t: Date.UTC(2026, 11, 5), hasTime: false });
  assert.deepEqual(parseWhen("12/05/2026"), { t: Date.UTC(2026, 11, 5), hasTime: false });
  assert.equal(new Date(parseWhen("06/03/2026 7:30 AM").t).getUTCHours(), 7);
  assert.equal(new Date(parseWhen("06/03/2026 12:15 AM").t).getUTCHours(), 0);
  assert.equal(new Date(parseWhen("06/03/26").t).getUTCFullYear(), 2026);
  // a mistyped year is a skipped row, not an order in year 123 or 2100
  assert.equal(parseWhen("1/2/123"), null);
  assert.equal(parseWhen("1/2/100"), null);
  assert.equal(parseWhen("06/03/2026 24:00"), null);
});

test("a first part of exactly 12 does not make a file day-first", () => {
  assert.equal(detectDmy(["12/05/2026", "03/04/2026"]), false);
  assert.equal(detectDmy(["13/05/2026", "03/04/2026"]), true);
  const n = load("A,DoorDash,12/05/2026,Delivered,20,-5,0,0,0,0,15\nB,DoorDash,03/04/2026,Delivered,20,-5,0,0,0,0,15\n");
  assert.equal(n.dmy, false);
  assert.equal(new Date(n.orders[0].t).getUTCMonth(), 11);
});

test("a tied charge column takes the file's majority sign, even by one", () => {
  // commission: one charge and its reversal (tied); delivery: one positive cost.
  // Pooled: 1 negative, 2 positive, so the tied column reads positives as costs.
  const n = load("A,DoorDash,2026-06-01,Delivered,40,10,1.20,0,0,0,28.80\nB,DoorDash,2026-06-02,Delivered,40,-10,0,0,0,0,50\n");
  assert.equal(n.orders[0].commission, 10);
  assert.equal(n.orders[1].commission, -10);
});

test("markup is computed for a platform that nets under a dollar", () => {
  const n = load("A,DoorDash,2026-06-01,Delivered,20,-19.50,0,0,0,0,0.50\n");
  const r = analyze(n.orders, { foodPct: 30 });
  assert.ok(r.summary.markup, "net of $0.50 still has a break-even markup");
  near(r.summary.markup.total, 20 / 0.5 - 1, 1e-9);
});

test("own-ordering fee is validated: 100% or more and non-numbers are refused", () => {
  const n = load("A,DoorDash,2026-06-01,Delivered,20,-5,0,0,0,0,15\n");
  assert.match(analyze(n.orders, { directPct: 100 }).invalid, /Direct-order/);
  assert.match(analyze(n.orders, { directPct: 150 }).invalid, /Direct-order/);
  assert.match(analyze(n.orders, { directPct: "abc" }).invalid, /Direct-order/);
  assert.match(analyze(n.orders, { directFlat: "abc" }).invalid, /Direct-order/);
  assert.equal(analyze(n.orders, { directPct: "", directFlat: "" }).summary.directPct, 0.03);
});

test("promotion that exactly earns back its spend is not flagged high", () => {
  // food 20, promo 5, packaging 15: profit before spend = 5, per $1 spent = 1.
  const n = load("A,DoorDash,2026-06-01,Delivered,20,0,0,-5,0,0,15\n");
  const r = analyze(n.orders, { packaging: 15 });
  near(r.promo.profitBeforeSpendPerDollar, 1, 1e-9);
  const f = r.findings.find((x) => /^Promotions and ads/.test(x.title));
  assert.equal(f.severity, "info");
});

test("percentages print to one decimal", () => {
  assert.equal(pct(0.1234), "12.3%");
  assert.equal(pct(null), "–");
});

test("a weekday with exactly MIN_ORDERS orders counts; the example's dates are plain minutes", () => {
  const rows = [];
  for (let i = 0; i < MIN_ORDERS; i++) rows.push(`L${i},DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24`);
  for (let i = 0; i < MIN_ORDERS; i++) rows.push(`D${i},DoorDash,2026-06-05 19:00,Delivered,30,-12,0,0,0,0,18`);
  const r = analyze(load(rows.join("\n") + "\n").orders, { foodPct: 30 });
  assert.ok(r.findings.some((f) => /Monday orders left the most; Friday the least/.test(f.title)), "five orders is enough, not under five");
  const dates = sampleCsv().trim().split("\n").slice(1).map((l) => l.split(",")[2]);
  assert.ok(dates.length > 0 && dates.every((d) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(d)), dates.find((d) => !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(d)));
});

// Red team 2026-11-15: guards for mutants that escaped, and two real defects.
test("a skipped row reports its own file line number", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,20,-5,0,0,0,0,15\nB,DoorDash,not a date,Delivered,20,-5,0,0,0,0,15\n");
  assert.deepEqual(n.skipped, [{ line: 3, reason: "date not readable" }]);
  assert.equal(n.orders[0].line, 2);
});

test("worst orders are capped at ten", () => {
  const body = Array.from({ length: 12 }, (_, i) => `O${i},DoorDash,2026-06-01 12:00,Delivered,${20 + i},-5,0,0,0,0,${15 + i}`).join("\n") + "\n";
  assert.equal(analyze(load(body).orders).worstOrders.length, 10);
});

test("the daypart finding names the best daypart first, not the order rows happened to sort in", () => {
  const lunch = Array.from({ length: 5 }, (_, i) => `L${i},DoorDash,2026-06-0${i + 1} 12:00,Delivered,20,-8,0,0,0,0,12`);
  const dinner = Array.from({ length: 5 }, (_, i) => `D${i},DoorDash,2026-06-0${i + 1} 18:00,Delivered,20,-2,0,0,0,0,18`);
  const r = analyze(load([...lunch, ...dinner].join("\n") + "\n").orders);
  const f = r.findings.find((x) => /left the most per order/.test(x.title));
  assert.ok(f, "daypart finding present");
  assert.match(f.title, /^Dinner orders left the most per order; Lunch the least/);
});

test("the example file has varied minutes and mostly no error charges", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  const minutes = new Set(n.orders.map((o) => new Date(o.t).getUTCMinutes()));
  assert.ok(minutes.size > 30, `only ${minutes.size} distinct minutes`);
  const withErrors = n.orders.filter((o) => o.errors !== 0).length;
  assert.ok(withErrors < n.orders.length * 0.15, `${withErrors} of ${n.orders.length} rows carry an error charge`);
});

test("a row with only an ad or marketing charge stays in the totals instead of being skipped", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,20,-5,0,0,0,0,15\nADS,DoorDash,2026-06-02,Ad charge,,,,,-50,,-50\nPR,DoorDash,2026-06-03,Adjustment,,,,-7.5,,,-7.5\n");
  assert.deepEqual(n.skipped, []);
  const r = analyze(n.orders);
  near(r.summary.ads, 50);
  near(r.summary.marketing, 7.5);
  assert.equal(r.summary.orders, 1);
});

test("dot-separated dates are read day-first even when every day is 12 or under", () => {
  assert.equal(detectDmy(["03.06.2026 12:00", "05.06.2026 12:00"]), true);
  // a second part above 12 still means month-first
  assert.equal(detectDmy(["03.13.2026"]), false);
  // slashes keep the US default
  assert.equal(detectDmy(["03/06/2026"]), false);
  const n = load("A,Uber Eats,03.06.2026 12:00,Delivered,20,-5,0,0,0,0,15\n");
  assert.equal(n.orders[0].t, Date.UTC(2026, 5, 3, 12));
});

// Red-team 2026-11-15: four mutants escaped, and two break-even cases read as
// losses because float noise was compared against zero (and one) directly.
test("a three-letter word in a cell is text, not an amount, when voting on the decimal format", () => {
  // "Ref 1.25" is a note, not a dot-decimal amount; only "12,50" votes.
  assert.equal(detectDecimalComma([["Subtotal", "Note"], ["12,50", "Ref 1.25"]]), true);
});

test("one digit after a decimal comma is a vote for decimal comma", () => {
  assert.equal(detectDecimalComma([["Subtotal"], ["12,5"]]), true);
});

test("promo spend is split into promotions and ads, each a positive sum", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,30,-7.5,0,-3,-2,0,17.5\nB,DoorDash,2026-06-02 12:00,Delivered,30,-7.5,0,-1,0,0,21.5\n");
  const p = analyze(n.orders, {}).promo;
  near(p.marketing, 4); near(p.ads, 2); near(p.spend, 6);
});

test("delivery that exactly breaks even after costs is not called a loss overall", () => {
  // 20 - 5 = 15 payout, 15 packaging: net after costs is exactly 0.
  const exact = analyze(load("A,DoorDash,2026-06-01,Delivered,20,-5,0,0,0,0,15\n").orders, { packaging: 15 });
  assert.equal(exact.summary.netAfter, 0);
  assert.ok(!exact.findings.some((f) => /lost money overall/.test(f.title)));
  // Three orders of 10.10 - 0.30 = 9.80 with 9.80 packaging sum to -5e-15.
  const body = [1, 2, 3].map((i) => `O${i},DoorDash,2026-06-0${i} 12:00,Delivered,10.1,-0.3,0,0,0,0,9.8`).join("\n") + "\n";
  const r = analyze(load(body).orders, { packaging: 9.8 });
  assert.ok(r.findings.some((f) => /No order lost money/.test(f.title)));
  assert.ok(!r.findings.some((f) => /lost money overall/.test(f.title)), "break-even read as a loss");
});

test("a promotion that earns back its spend to the cent is not flagged high, whatever the float noise", () => {
  // Profit before spend equals spend (ratio 0.99999999999999 in floats).
  const body = [1, 2, 3].map((i) => `O${i},DoorDash,2026-06-0${i} 12:00,Delivered,10.1,-0.1,0,-0.2,0,0,9.8`).join("\n") + "\n";
  const r = analyze(load(body).orders, { packaging: 9.8 });
  near(r.promo.profitBeforeSpend, r.promo.spend, 1e-9);
  const f = r.findings.find((x) => /^Promotions and ads/.test(x.title));
  assert.equal(f.severity, "info");
  assert.ok(!/cost more than/.test(f.detail));
});

// Red-team 2026-11-16: guards for escaped mutants and two real defects.
test("a UTF-16 big-endian file (BOM FE FF) is decoded", () => {
  const be = new Uint8Array([0xfe, 0xff, ...[..."Order date"].flatMap((c) => [0, c.charCodeAt(0)])]);
  assert.equal(decodeBuffer(be.buffer), "Order date");
});

test("dates with a two-digit year are not read as amounts when picking the decimal mark", () => {
  // One date and one decimal-comma amount per row: a date counted as an amount
  // ("03.06.26" ends in .26) would tie the vote and fall back to a decimal point.
  const t = [["Order date", "Subtotal"], ["03.06.26", "12,50"], ["04.06.26", "8,75"]];
  assert.equal(detectDecimalComma(t, ","), true);
});

test("one-digit dotted dates are day-first", () => {
  assert.equal(detectDmy(["3.6.2026", "4.6.2026"]), true);
});

test("the promotion view averages the tickets of orders with no spend", () => {
  const body = "A,DoorDash,2026-06-01,Delivered,20,-5,0,-2,0,0,13\nB,DoorDash,2026-06-02,Delivered,30,-7,0,0,0,0,23\nC,DoorDash,2026-06-03,Delivered,10,-2,0,0,0,0,8\n";
  const p = analyze(load(body).orders, {}).promo;
  near(p.avgTicketWith, 20);
  near(p.avgTicketWithout, 20);
  near(p.netAfterPerOrderWithout, 15.5);
});

test("the example's promotions span the $2 to $7 range the generator draws", () => {
  const m = normalizeRows(parseCsv(sampleCsv())).orders.map((o) => o.marketing).filter((v) => v > 0);
  assert.ok(m.length > 10);
  assert.ok(Math.max(...m) > 6, `largest promotion ${Math.max(...m)}`);
  assert.ok(Math.max(...m) <= 7, `largest promotion ${Math.max(...m)}`);
  assert.ok(Math.min(...m) >= 2);
});

test("year-first dates with slashes or dots are read (2026/06/01, 2026.06.01)", () => {
  assert.deepEqual(parseWhen("2026/06/01 12:30"), { t: Date.UTC(2026, 5, 1, 12, 30), hasTime: true });
  assert.deepEqual(parseWhen("2026.06.01"), { t: Date.UTC(2026, 5, 1), hasTime: false });
  assert.equal(parseWhen("2026/02/30"), null);
  const n = normalizeRows(parseCsv("Order date,Subtotal,Commission\n2026/06/01 12:30,20.00,-5.00\n2026/06/02 18:10,30.00,-7.50\n"), { decimalComma: "auto" });
  assert.equal(n.error, undefined);
  assert.equal(n.orders.length, 2);
});

test("an en or em dash before an amount is a minus sign", () => {
  assert.equal(parseNumber("–5.00"), -5);
  assert.equal(parseNumber("— $12.50"), -12.5);
  assert.equal(parseNumber("–"), 0);
  // A refund written with an en dash is a refund, not a sale.
  const n = load("A,DoorDash,2026-06-01,Delivered,20,-5,0,0,0,0,15\nB,DoorDash,2026-06-02,Delivered,–12.50,0,0,0,0,0,–12.50\n");
  assert.equal(n.orders[1].refund, true);
  assert.equal(n.orders[1].gross, -12.5);
});

// Red-team guards (2026-11-16): each pins a behaviour a seeded mutant changed
// without any test noticing.
test("January dates, 12 pm and three-digit day or month parts are read correctly", () => {
  assert.equal(parseWhen("2026-01-15").t, Date.UTC(2026, 0, 15));
  assert.equal(parseWhen("01/15/2026").t, Date.UTC(2026, 0, 15));
  assert.deepEqual(parseWhen("06/03/2026 12:30 PM"), { t: Date.UTC(2026, 5, 3, 12, 30), hasTime: true });
  assert.deepEqual(parseWhen("06/03/2026 12:05 am"), { t: Date.UTC(2026, 5, 3, 0, 5), hasTime: true });
  assert.equal(parseWhen("012/04/2026"), null, "a three-digit month is a typo, not December");
});

test("decimal comma is detected from amounts that contain zeros", () => {
  assert.equal(detectDecimalComma([["Subtotal"], ["1.000,00"], ["20,00"]]), true);
  assert.equal(detectDecimalComma([["Subtotal"], ["1,000.00"], ["20.00"]]), false);
});

test("money signs follow the rounded cents, symmetric for losses and gains", () => {
  assert.equal(money(0), "0.00");
  assert.equal(money(-1.8e-15), "0.00");
  assert.equal(money(-12.5), "-12.50");
  assert.equal(money(0.005), "0.01");
  // a half-cent loss printed "0.01", a gain, before 2026-11-16
  assert.equal(money(-0.005), "-0.01");
  assert.equal(money(-1234.5), "-1,234.50");
});

test("the per-platform payout gap is reported when every row has a payout", () => {
  const n = load("D1,DoorDash,2026-06-01 12:00,Delivered,40,-10,0,0,0,0,27\nD2,DoorDash,2026-06-02 12:00,Delivered,20,-5,0,0,0,0,15\n");
  const dd = analyze(n.orders, {}).byPlatform.find((b) => b.key === "doordash");
  near(dd.payoutGap, -3); // payout 42 against net 45
  const noPay = normalizeRows(parseCsv("Order date,Platform,Subtotal,Commission\n2026-06-01 12:00,DoorDash,40,-10\n"));
  assert.equal(analyze(noPay.orders, {}).byPlatform[0].payoutGap, null);
});

test("the markup finding prints whole percentages", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,40,-14,0,0,0,0,26\n");
  const f = analyze(n.orders, { foodPct: 30, packaging: 1, markupNow: 10 }).findings.find((x) => /menu prices on delivery/.test(x.title));
  assert.match(f.title, /about 58% above in-store/);
  assert.match(f.detail, /You entered 10% now, so about 48% more/);
});

test("the example file writes amounts to the cent", () => {
  const rows = parseCsv(sampleCsv()).slice(1);
  for (const r of rows) for (const v of r.slice(4)) assert.match(v, /^-?\d+\.\d{2}$/);
});

// Red-team run 2026-11-16 (prompts/runs/2026-11-16-session_01EhTJVMmK8A31TEs5kfnuRS.json).
test("a skipped row names its file line even after a blank line or a quoted line break", () => {
  const n = load('A,DoorDash,2026-06-01 12:00,Delivered,20,-5,0,0,0,0,15\n\n"B\nnote",DoorDash,2026-06-01 12:30,Delivered,20,-5,0,0,0,0,15\nC,DoorDash,not a date,Delivered,20,-5,0,0,0,0,15\n');
  assert.deepEqual(n.skipped, [{ line: 6, reason: "date not readable" }]);
  assert.deepEqual(n.orders.map((o) => o.line), [2, 4]);
});

test("the last row is read when the file has no trailing newline", () => {
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.equal(load("A,DoorDash,2026-06-01 12:00,Delivered,20,-5,0,0,0,0,15").orders.length, 1);
});

test("a lone carriage return ends a row without eating the next line's first character", () => {
  assert.deepEqual(parseCsv("a\rb\nc"), [["a"], ["b"], ["c"]]);
});

test("one-digit month and day parts are read (6/3/2026)", () => {
  assert.deepEqual(parseWhen("6/3/2026"), { t: Date.UTC(2026, 5, 3), hasTime: false });
});

test("the header is found as far down as the tenth row, and not past it", () => {
  const order = "A,DoorDash,2026-06-01 12:00,Delivered,20,-5,0,0,0,0,15\n";
  const pre = (k) => "Report,x\n".repeat(k);
  assert.equal(normalizeRows(parseCsv(pre(9) + HEAD + order)).orders.length, 1);
  assert.ok(normalizeRows(parseCsv(pre(10) + HEAD + order)).error);
});

test("an order whose promotion and ad charges are equal still counts as promoted", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,30,-7.5,0,-2,-2,0,18.5\nB,DoorDash,2026-06-02 12:00,Delivered,30,-7.5,0,0,0,0,22.5\n");
  const p = analyze(n.orders, {}).promo;
  assert.equal(p.orders, 1);
  assert.equal(p.plainOrders, 1);
});

test("the direct-order gain per order is the gain divided by orders", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,40,-14,0,0,0,0,26\nB,DoorDash,2026-06-02 12:00,Delivered,20,-7,0,0,0,0,13\n");
  const d = analyze(n.orders, { directPct: 3, directFlat: 0.3 }).summary.direct;
  near(d.gainPerOrder, d.gain / 2);
});

test("the example's error charges span the $6 to $26 range the generator draws", () => {
  const errs = normalizeRows(parseCsv(sampleCsv())).orders.map((o) => o.errors).filter((e) => e !== 0);
  assert.ok(errs.length > 0);
  for (const e of errs) assert.ok(e >= 6 && e <= 26, `error charge ${e}`);
  // Pinned like the example's sales: the same draws give the same charges.
  assert.equal(errs.length, 11);
  assert.equal(errs.reduce((s, e) => s + e, 0).toFixed(2), "160.87");
});

// Red team 2026-11-16: a cancelled order whose row still lists the subtotal
// (no charge, nothing paid out) added its food sales to sales and net cash, so
// one $25 cancellation turned a 20% take rate into 10.9%.
test("a cancelled order's listed subtotal is not food sales; its charges stay as cost", () => {
  const n = load("A,DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24\nB,DoorDash,2026-06-02 12:00,Cancelled,25,0,0,0,0,0,0\nC,DoorDash,2026-06-03 12:00,Cancelled by store,18,0,0,0,0,-5,-5\n");
  const r = analyze(n.orders, { foodPct: 30, packaging: 1 });
  near(r.summary.gross, 30);
  near(r.summary.net, 30 - 6 - 5);
  near(r.summary.takeRate, 11 / 30);
  assert.equal(r.summary.cancelledDropped, 1, "B carries no charge, so it is dropped");
  assert.equal(r.summary.cancelledKept, 1);
  near(r.byPlatform[0].gross, 30);
  near(r.summary.payoutGap, 0); // payouts 24 - 5 match the net once the cancelled subtotals are out
  // A refunded row keeps its negative food sales: "Refunded" is a cancel word.
  const f = load("A,DoorDash,2026-06-01 12:00,Delivered,30,-6,0,0,0,0,24\nR,DoorDash,2026-06-02 12:00,Refunded,-10,0,0,0,0,0,-10\n");
  near(analyze(f.orders, {}).summary.gross, 20);
});

test("edge inputs the parsers must reject or read one way", () => {
  // A UTF-8 (or Latin-1) file is never read as UTF-16 because of one byte.
  assert.equal(decodeBuffer(new Uint8Array([0x41, 0xff, 0x42])).charAt(0), "A");
  assert.equal(decodeBuffer(new Uint8Array([0xfe, 0x41, 0x42])).charAt(1), "A");
  // "12.50" alone votes for a decimal point, even in a semicolon file.
  assert.equal(detectDecimalComma([["Subtotal"], ["12.50"], ["8.25"]], ";"), false);
  // A three-digit day or month is a typo, not day 11.
  assert.equal(parseWhen("2026-06-011"), null);
  assert.equal(parseWhen("6/011/2026"), null);
  assert.equal(detectDmy(["13/5/2026", "5/013/2026"]), true, "a malformed second part does not veto day-first");
});

// Red team 2026-11-16: guards for two escaped mutants and one real defect.
test("a three-decimal grouped amount votes for decimal point", () => {
  // "1,234.500" ends in three digits, so only the "1,234." grouping pattern
  // tells it is decimal point; without that vote a semicolon file reads it as
  // decimal comma (1.2345).
  assert.equal(detectDecimalComma([["1,234.500"]], ";"), false);
  assert.equal(detectDecimalComma([["1.234,500"]], ","), true);
});

test("the worked example spans the same three months on every load", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).orders, {});
  assert.equal(new Date(r.summary.from).toISOString().slice(0, 10), "2026-06-01");
  assert.equal(new Date(r.summary.to).toISOString().slice(0, 10), "2026-08-29");
  assert.deepEqual(r.byWeekday.map((d) => d.orders), [26, 38, 41, 33, 31, 41, 36]);
});

test("a partly refunded or refund-requested order still sold its food", () => {
  // Any status containing "refund" read as cancelled, so a delivered order
  // marked "Partially refunded" lost its food sales and kept only its charges:
  // four $40 orders came out at $40 of sales and -$8 net cash.
  const csv = "Order ID,Order date,Status,Subtotal,Commission,Error charges\n" +
    "1,2026-06-01 12:00,Delivered,40.00,-10.00,0\n" +
    "2,2026-06-01 12:30,Partially refunded,40.00,-10.00,-8.00\n" +
    "3,2026-06-01 13:00,Refund requested,40.00,-10.00,0\n" +
    "4,2026-06-01 13:30,Refunded,40.00,-10.00,0\n" +
    "5,2026-06-01 14:00,Fully Refunded,40.00,-10.00,0\n";
  const n = normalizeRows(parseCsv(csv));
  assert.deepEqual(n.orders.map((o) => o.cancelled), [false, false, false, true, true]);
  const r = analyze(n.orders, {});
  assert.equal(r.summary.orders, 3);
  assert.equal(r.summary.gross, 120);
  assert.equal(r.summary.net, 120 - 50 - 8);
});
