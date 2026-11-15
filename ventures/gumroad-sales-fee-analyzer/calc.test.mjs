import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseWhen, detectDmy, detectDelimiter, decodeBuffer, normalizeRows, parseHoursList, analyze, sampleCsv } from "./calc.mjs";

const HEAD = "Date,Order ID,Type,Status,Product,Buyer,Amount,Service Fee,Net\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("CSV parsing handles quoted fields, embedded commas, quotes and newlines", () => {
  const rows = parseCsv('a,b\n"Logo, flat","say ""hi"""\n"line\nbreak",3\n');
  assert.deepEqual(rows[1], ["Logo, flat", 'say "hi"']);
  assert.deepEqual(rows[2], ["line\nbreak", "3"]);
});

test("money, dates, delimiters and UTF-16 are handled", () => {
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("(45.00)"), -45);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.ok(Number.isNaN(parseNumber("n/a")));
  assert.equal(parseWhen("Jun 3, 2026"), null);
  assert.deepEqual(parseWhen("2026-06-03"), { t: Date.UTC(2026, 5, 3), hasTime: false });
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Date"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "Date");
});

test("with a fee column the fee is observed, not assumed", () => {
  const n = load("2026-06-01,A1,Order,Cleared,Logo,amy,100,20,80\n2026-06-02,A2,Order,Cleared,Logo,bob,50,10,40\n");
  assert.equal(n.feeSource, "column");
  const r = analyze(n.rows);
  near(r.summary.feeRate, 0.2);
  assert.equal(r.summary.gross, 150);
  assert.equal(r.summary.net, 120);
});

test("an observed rate that is not 20 percent is reported as observed", () => {
  const n = load("2026-06-01,A1,Order,Cleared,Logo,amy,100,25,75\n");
  const r = analyze(n.rows);
  near(r.summary.feeRate, 0.25);
  assert.ok(r.findings.some((f) => /25\.0%/.test(f.title) && f.severity === "medium"));
});

test("amount and earnings without a fee column give the fee by difference", () => {
  const n = load("2026-06-01,A1,Order,Cleared,Logo,amy,100,80\n", "Date,Order ID,Type,Status,Product,Buyer,Amount,Earnings\n");
  assert.equal(n.feeSource, "difference");
  near(analyze(n.rows).summary.fee, 20);
});

test("a lone amount is treated as before-fee and the assumed percentage is applied", () => {
  const n = load("2026-06-01,A1,Order,Cleared,Logo,amy,100\n", "Date,Order ID,Type,Status,Product,Buyer,Amount\n", { feePct: 20, feeFixed: 0 });
  assert.equal(n.feeSource, "percent");
  near(analyze(n.rows).summary.net, 80);
  const m = load("2026-06-01,A1,Order,Cleared,Logo,amy,80\n", "Date,Order ID,Type,Status,Product,Buyer,Earnings\n", { feePct: 20, feeFixed: 0 });
  assert.equal(m.feeSource, "grossup");
  near(analyze(m.rows).summary.gross, 100);
});

test("refunds, cancellations, withdrawals, tips and pending rows are separated", () => {
  const n = load([
    "2026-06-01,A1,Order,Cleared,Logo,amy,100,20,80",
    "2026-06-02,A2,Order,Pending clearance,Logo,bob,50,10,40",
    "2026-06-03,A2-T,Tip,Cleared,Logo,bob,10,2,8",
    "2026-06-04,A3,Order,Cancelled,Blog,cy,60,0,0",
    "2026-06-05,A1-R,Refund,Completed,Logo,amy,-100,-20,-80",
    "2026-06-10,W1,Withdrawal,Completed,,,100,2.5,97.5",
  ].join("\n") + "\n");
  const s = analyze(n.rows).summary;
  assert.equal(s.orders, 2); assert.equal(s.tips, 1);
  assert.equal(s.net, 128);
  assert.equal(s.refunds, 1); assert.equal(s.refundNet, 80);
  assert.equal(s.cancelled, 1); assert.equal(s.cancelledValue, 60);
  assert.equal(s.withdrawals, 1); assert.equal(s.moveFees, 2.5);
  assert.equal(s.pendingNet, 40); assert.equal(s.pendingCount, 1);
  near(s.takeHome, 128 - 80 - 2.5);
  near(s.takeHomePerOrder, (128 - 80 - 2.5) / 2);
});

test("a withdrawal fee is read from the gap between the two amounts when there is no fee column", () => {
  const n = load("2026-06-10,W1,Withdrawal,Completed,,,100,96\n2026-06-01,A1,Order,Cleared,Logo,amy,100,80\n", "Date,Order ID,Type,Status,Product,Buyer,Amount,Earnings\n");
  const s = analyze(n.rows).summary;
  near(s.moveFees, 4);
  assert.equal(s.moveFeesKnown, 1);
});

test("negative amounts with no type are refunds; total rows and bad rows are skipped with a reason", () => {
  const n = load("2026-06-01,A1,,Cleared,Logo,amy,100,20,80\n2026-06-02,A2,,,Logo,amy,-10,,-8\nnot a date,A3,Order,,,,1,0,1\n2026-06-04,A4,Order,,,,abc,0,1\n2026-06-05,A5,Order,,,,,,\nTotal,,,,,,,,\n");
  assert.equal(n.rows.length, 2);
  assert.equal(n.rows[1].kind, "refund");
  assert.deepEqual(n.skipped.map((s) => s.reason).sort(), ["amount not a number", "date not readable", "no amount", "total row"]);
});

test("per-product and per-buyer figures reconcile with the totals; repeat-buyer share is computed", () => {
  const n = load([
    "2026-06-01,1,Order,Cleared,Logo,amy,100,20,80",
    "2026-06-02,2,Order,Cleared,Logo,amy,100,20,80",
    "2026-06-03,3,Order,Cleared,Blog,bob,50,10,40",
  ].join("\n") + "\n");
  const r = analyze(n.rows, { costPerOrder: 5 });
  assert.equal(r.byProduct.length, 2);
  assert.equal(r.byProduct.reduce((s, g) => s + g.net, 0), r.summary.net);
  assert.equal(r.byProduct.reduce((s, g) => s + g.cost, 0), r.summary.orderCosts);
  near(r.byProduct.reduce((s, g) => s + g.takeHome, 0), r.summary.takeHome);
  assert.equal(r.repeat.buyers, 2); assert.equal(r.repeat.repeatBuyers, 1);
  near(r.repeat.shareOfNet, 160 / 200);
  assert.equal(r.byMonth.length, 1);
});

test("no buyer column means no repeat-buyer figure, not a zero", () => {
  const n = load("2026-06-01,1,Order,Cleared,80,100,20\n", "Date,Order ID,Type,Status,Net,Amount,Fee\n");
  assert.equal(analyze(n.rows).repeat, null);
});

test("per-hour ranking appears only when hours are supplied by the user or the file", () => {
  const body = "2026-06-01,1,Order,Cleared,Logo,amy,100,20,80\n2026-06-02,2,Order,Cleared,Blog,bob,60,12,48\n";
  const none = analyze(load(body).rows);
  assert.equal(none.byProduct.every((g) => g.netPerHour === null), true);
  assert.ok(none.findings.some((f) => /No hours entered/.test(f.title)));
  assert.ok(!none.findings.some((f) => /lowest take-home per hour/.test(f.title)));
  const some = analyze(load(body).rows, { hoursList: "Logo, 4\nBlog, 1\nGhost, 2\nbad line\nBlog2, x" });
  assert.equal(some.byProduct.find((g) => g.label === "Logo").netPerHour, 20);
  assert.equal(some.byProduct.find((g) => g.label === "Blog").netPerHour, 48);
  assert.ok(some.findings.some((f) => /Logo has the lowest take-home per hour/.test(f.title)));
  assert.equal(some.unmatchedHours.length, 1);
  assert.equal(some.hoursBad.length, 2);
  const col = analyze(load("2026-06-01,1,Order,Cleared,Logo,amy,100,20,80,2\n2026-06-02,2,Order,Cleared,Blog,bob,60,12,48,4\n", HEAD.replace("Net", "Net,Hours")).rows);
  assert.equal(col.byProduct.find((g) => g.label === "Logo").netPerHour, 40);
});

test("a default hours figure fills products the list does not name", () => {
  const r = analyze(load("2026-06-01,1,Order,Cleared,Logo,amy,100,20,80\n2026-06-02,2,Order,Cleared,Blog,bob,60,12,48\n").rows, { hoursDefault: 2 });
  assert.equal(r.byProduct.find((g) => g.label === "Logo").netPerHour, 40);
});

test("break-even price solves for the target take-home", () => {
  const r = analyze(load("2026-06-01,1,Order,Cleared,Logo,amy,100,20,80\n").rows, { target: 40, costPerOrder: 4, feeFixed: 0 });
  near(r.breakEven.price, 55);
  const price = r.breakEven.price;
  near(price * (1 - 0.2) - 4, 40);
  const withRefund = analyze(load("2026-06-01,1,Order,Cleared,Logo,amy,100,20,80\n2026-06-02,1-R,Refund,Done,Logo,amy,-20,-4,-16\n").rows, { target: 40, feeFixed: 0 });
  near(withRefund.breakEven.refundShare, 0.2);
  near(withRefund.breakEven.priceWithRefunds, 40 / (0.8 * 0.8));
  const hourly = analyze(load("2026-06-01,1,Order,Cleared,Logo,amy,100,20,80\n").rows, { targetHourly: 30, hoursDefault: 2 });
  near(hourly.breakEven.target, 60);
  assert.equal(analyze(load("2026-06-01,1,Order,Cleared,Logo,amy,100,20,80\n").rows).breakEven, null);
});

test("date range filters, and invalid states return messages", () => {
  const n = load("2026-06-01,1,Order,Cleared,Logo,amy,100,20,80\n2026-07-01,2,Order,Cleared,Logo,amy,100,20,80\n");
  assert.equal(analyze(n.rows, { from: Date.UTC(2026, 6, 1), to: Date.UTC(2026, 6, 31) }).summary.orders, 1);
  assert.match(analyze(n.rows, { from: Date.UTC(2027, 0, 1) }).invalid, /No rows/);
  assert.match(analyze(n.rows, { costPerOrder: -1 }).invalid, /zero or more/);
  assert.match(analyze(load("2026-06-01,1,Withdrawal,Done,,,10,1,9\n").rows).invalid, /No order or tip/);
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2\n")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("parseHoursList reads lines and reports bad ones", () => {
  const r = parseHoursList("Logo, 3\n\nnope\nBlog, -1\nVoice; 0.5");
  assert.equal(r.list.length, 2);
  assert.equal(r.bad.length, 2);
});

test("the sample file parses fully and produces every section", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.deepEqual(n.skipped.map((x) => x.reason), ["total row"]);
  assert.equal(n.feeSource, "column");
  const r = analyze(n.rows, { hoursDefault: 2, target: 50 });
  assert.ok(r.summary.orders > 20);
  assert.ok(r.summary.refunds > 0 && r.summary.discoverOrders > 0);
  // The sample's fees follow the standard schedule, so observed equals scheduled.
  near(r.summary.fee, r.summary.scheduleFee, 0.005 * r.summary.orders); // per-row rounding
  assert.ok(r.repeat && r.breakEven && r.byMonth.length >= 3);
});

// Gumroad's sales export header, verbatim from PURCHASE_FIELDS in Gumroad's
// open-source app/services/exports/purchase_export_service.rb (first 30 columns, plus Discover?).
const GUMROAD_HEAD = "Purchase ID,Item Name,Buyer Name,Purchase Email,Buyer Email,Do not contact?,Purchase Date,Purchase Time (UTC timezone),Subtotal ($),Taxes ($),Tax Type,Shipping ($),Sale Price ($),Fees ($),Net Total ($),Tip ($),Tax Included in Price?,Street Address,City,Zip Code,State,Country,Referrer,Refunded?,Partial Refund ($),Fully Refunded?,Disputed?,Dispute Won?,Access Revoked?,Variants,Discover?\n";
// Fees by Gumroad's purchase.rb calculate_fees: direct 12.9% + $0.80, Discover 30%.
const gRow = (id, price, fee, { refunded = 0, partial = 0, full = 0, disputed = 0, won = 0, discover = 0, state = "CA" } = {}) =>
  `${id},Preset pack,Ann,ann@example.com,ann@example.com,0,2026-06-0${id},2026-06-0${id} 10:00:00 UTC,${price},0,,0,${price},${fee},${(price - fee).toFixed(2)},0,0,1 Main St,Town,90210,${state},United States,direct,${refunded},${partial},${full},${disputed},${won},0,,${discover}\n`;

test("Gumroad's real sales export is read: headers with ($), fees, refund, dispute and Discover flags", () => {
  const body = gRow(1, 10, 2.09) + gRow(2, 100, 13.7) + gRow(3, 25, 7.5, { discover: 1 }) + gRow(4, 10, 2.09, { refunded: 1, full: 1 }) + gRow(5, 4, 1.32, { refunded: 1, partial: 2 }) + gRow(6, 20, 3.38, { disputed: 1 }) + gRow(7, 20, 3.38, { disputed: 1, won: 1 }) + "Totals,,,,,,,,,,,,189,33.46,155.54\n";
  const n = normalizeRows(parseCsv(GUMROAD_HEAD + body));
  assert.equal(n.error, undefined);
  assert.equal(n.feeSource, "column");
  assert.equal(n.columns.status, undefined, "the State address column is not a status");
  assert.deepEqual(n.skipped.map((x) => x.reason), ["total row"]);
  const r = analyze(n.rows);
  assert.equal(r.summary.orders, 7);
  near(r.summary.gross, 189);
  near(r.summary.fee, 33.46);
  near(r.summary.feeRate, 33.46 / 189);
  assert.equal(r.summary.refunds, 3);
  // full refund 7.91, half of 2.68 net = 1.34, lost dispute 16.62
  near(r.summary.refundNet, 7.91 + 1.34 + 16.62);
  near(r.summary.takeHome, 155.54 - (7.91 + 1.34 + 16.62));
  assert.equal(r.summary.discoverOrders, 1);
  near(r.summary.scheduleFee, 33.46, 0.02);
  assert.ok(r.findings.some((f) => /Discover/.test(f.title)));
});

test("the break-even uses Gumroad's fixed fee: $10 sales at 12.9% + $0.80 price a $50 take-home at $58.32", () => {
  const n = normalizeRows(parseCsv(GUMROAD_HEAD + gRow(1, 10, 2.09) + gRow(2, 10, 2.09)));
  const r = analyze(n.rows, { target: 50 });
  near(r.breakEven.feeRate, 0.129);
  near(r.breakEven.price, 50.8 / 0.871);
  near(r.breakEven.price * (1 - 0.129) - 0.8, 50);
  // the old percent-only formula gave 50 / (1 - 0.209) = 63.21
  assert.ok(r.breakEven.price < 60);
});

test("with no fee in the file the default is Gumroad's direct schedule, not a flat 20%", () => {
  const n = load("2026-06-01,A1,Order,Cleared,Logo,amy,100\n", "Date,Order ID,Type,Status,Product,Buyer,Amount\n");
  near(analyze(n.rows).summary.fee, 13.7);
  const z = load("2026-06-01,A1,Order,Cleared,Logo,amy,0\n", "Date,Order ID,Type,Status,Product,Buyer,Amount\n");
  near(analyze(z.rows).summary.fee, 0);
});

// Red team 2026-11-15 (second campaign): five mutants escaped this suite.
test("a month above 12 is refused, not rolled into next year", () => {
  assert.equal(parseWhen("2026-13-05"), null);
  assert.equal(parseWhen("13/05/2026"), null);
  assert.equal(parseWhen("00/05/2026"), null);
});

test("a slash date with a first part above 12 is day-first even without dots", () => {
  assert.equal(detectDmy(["25/03/2026", "04/03/2026"]), true);
  assert.equal(detectDmy(["03/25/2026"]), false);
  assert.equal(detectDmy(["04.03.2026"]), true);
});

test("a lone amount line above the header is not taken as the header", () => {
  const n = normalizeRows(parseCsv("Amount,180\n" + HEAD + "2026-06-01,1,Order,Cleared,Logo,amy,100,20,80\n"));
  assert.equal(n.error, undefined);
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].net, 80);
});

test("a refund lands on its own product, and the repeat share is a share of buyers", () => {
  const n = load([
    "2026-06-01,1,Order,Cleared,Logo,amy,100,20,80",
    "2026-06-02,2,Order,Cleared,Logo,amy,100,20,80",
    "2026-06-03,3,Order,Cleared,Blog,bob,50,10,40",
    "2026-06-04,1-R,Refund,Completed,Logo,amy,-100,-20,-80",
  ].join("\n") + "\n");
  const r = analyze(n.rows);
  assert.equal(r.byProduct.find((g) => g.label === "Logo").refundNet, 80);
  assert.equal(r.byProduct.find((g) => g.label === "Blog").refundNet, 0);
  assert.equal(r.byProduct.some((g) => g.label === "all products"), false);
  near(r.repeat.shareOfBuyers, 0.5);
});

test("a date with a stray digit is refused, not read as a nearby day (red team 2026-11-15)", () => {
  assert.equal(parseWhen("2026-06-031"), null);
  assert.equal(parseWhen("06/03/20261"), null);
  assert.deepEqual(parseWhen("06/03/2026 10:00"), { t: Date.UTC(2026, 5, 3, 10, 0), hasTime: true });
});
