import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDate, parseMoney, normalizeStatement, normalizeItems, classify, analyze, parseCosts, sampleData } from "./calc.mjs";

const sample = () => {
  const d = sampleData();
  const st = normalizeStatement(parseCsv(d.statement));
  const it = normalizeItems(parseCsv(d.items));
  assert.equal(st.error, null);
  assert.equal(it.error, null);
  return { d, st, it, costs: parseCosts(d.costs).costs };
};

test("parseDate reads Etsy's long month names, ISO and month-first slashes", () => {
  assert.deepEqual(parseDate("September 1, 2026"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("1 September 2026"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("2026-09-01"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("09/30/2026"), { y: 2026, mo: 8, d: 30 });
  assert.equal(parseDate("nope"), null);
});

test("parseMoney treats -- as zero and keeps the sign of -$1.20", () => {
  assert.equal(parseMoney("--"), 0);
  assert.equal(parseMoney(""), 0);
  assert.equal(parseMoney("-$1.20"), -1.2);
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(5.00)"), -5);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("statement without a Net column rebuilds it from Amount + Fees & Taxes", () => {
  const csv = 'Date,Type,Title,Info,Currency,Amount,Fees & Taxes\n"March 3, 2026",Sale,Payment for Order #1234567,,USD,$30.00,-$1.00';
  const n = normalizeStatement(parseCsv(csv));
  assert.equal(n.rows[0].net, 29);
  assert.equal(n.rows[0].orderId, "1234567");
});

test("bad files give a helpful error and unreadable rows are listed by line", () => {
  assert.match(normalizeStatement(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeItems(parseCsv("a,b\n1,2")).error, /Item Name/);
  const csv = 'Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net\nnope,Sale,x,,USD,1,0,1\n"May 1, 2026",Sale,y,,USD,zz,0,1\n"May 1, 2026",Sale,z,,USD,1,0,1';
  const n = normalizeStatement(parseCsv(csv));
  assert.equal(n.rows.length, 1);
  assert.equal(n.skipped.length, 2);
  assert.equal(n.skipped[0].line, 2);
});

test("classify sorts credits before the fee they reverse, and separates Offsite from on-site ads", () => {
  const c = (type, title) => classify({ typeKey: type.toLowerCase(), titleKey: title.toLowerCase() });
  assert.equal(c("Fee", "Credit for transaction fee"), "credit");
  assert.equal(c("Fee", "Transaction fee: Mug"), "transaction");
  assert.equal(c("Fee", "Processing fee"), "processing");
  assert.equal(c("Fee", "Offsite Ads fee"), "offsite");
  assert.equal(c("Marketing", "Etsy Ads"), "ads");
  assert.equal(c("Fee", "Listing fee (auto-renew)"), "listing");
  assert.equal(c("Deposit", "Deposit to bank"), "deposit");
  assert.equal(c("Refund", "Refund to buyer for Order #123456"), "refund");
});

test("every statement row is counted exactly once: waterfall reconciles to the month totals", () => {
  const { st, it, costs } = sample();
  const r = analyze(st.rows, it.items, { costs });
  const s = r.summary;
  const built = s.sales + s.refunds + s.feeTotal;
  assert.ok(Math.abs(built - s.operating) < 0.01);
  const nonDeposit = st.rows.filter((x) => classify(x) !== "deposit" && classify(x) !== "tax").reduce((a, x) => a + x.net, 0);
  assert.ok(Math.abs(nonDeposit - s.operating) < 0.01);
  const monthNet = r.months.reduce((a, m) => a + m.net, 0);
  assert.ok(Math.abs(monthNet - s.operating) < 0.01);
});

test("deposits are payouts, not costs", () => {
  const { st, it } = sample();
  const s = analyze(st.rows, it.items).summary;
  assert.equal(s.payouts, 1600);
});

test("shipping labels stay out of the take rate", () => {
  const { st, it } = sample();
  const s = analyze(st.rows, it.items).summary;
  assert.ok(s.feeBuckets.labels < 0);
  assert.ok(Math.abs(s.platformFees - (s.feeTotal - s.feeBuckets.labels)) < 0.001);
  assert.ok(s.takeRate > 0.1 && s.takeRate < 0.3);
});

test("per-listing net sums to the attributed order net, and account-level rows stay separate", () => {
  const { st, it, costs } = sample();
  const r = analyze(st.rows, it.items, { costs });
  const listingNet = r.listings.reduce((a, l) => a + l.net, 0);
  assert.ok(Math.abs(listingNet - r.summary.attributedNet) < 0.01);
  assert.equal(r.summary.matchedOrders, 241);
  assert.equal(r.summary.unmatchedOrders, 0);
  // Etsy Ads and the auto-renew listing fees are not tied to an order.
  assert.ok(r.summary.shopLevel < 0);
  assert.ok(Math.abs(r.summary.listingNet + r.summary.shopLevel - r.summary.operating) < 0.01);
});

test("order fees are split across the items in an order by revenue", () => {
  const st = normalizeStatement(parseCsv([
    "Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net",
    '"May 1, 2026",Sale,Payment for Order #1000001,,USD,$40.00,--,$40.00',
    '"May 1, 2026",Fee,Processing fee,Order #1000001,USD,-$2.00,--,-$2.00',
  ].join("\n")));
  const it = normalizeItems(parseCsv([
    "Sale Date,Item Name,Quantity,Price,Discount Amount,Order ID",
    '"May 1, 2026",Big,1,$30.00,$0.00,1000001',
    '"May 1, 2026",Small,1,$10.00,$0.00,1000001',
  ].join("\n")));
  const r = analyze(st.rows, it.items, { costs: { Big: 5, Small: 2 } });
  const big = r.listings.find((l) => l.name === "Big"), small = r.listings.find((l) => l.name === "Small");
  assert.ok(Math.abs(big.net - 28.5) < 0.001);
  assert.ok(Math.abs(small.net - 9.5) < 0.001);
  assert.ok(Math.abs(big.profit - 23.5) < 0.001);
});

test("a fully refunded order returns its units to stock unless the box is unticked", () => {
  const st = normalizeStatement(parseCsv([
    "Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net",
    '"May 1, 2026",Sale,Payment for Order #1000002,,USD,$20.00,--,$20.00',
    '"May 2, 2026",Refund,Refund to buyer for Order #1000002,,USD,-$20.00,--,-$20.00',
  ].join("\n")));
  const it = normalizeItems(parseCsv("Item Name,Quantity,Price,Order ID\nMug,1,$20.00,1000002"));
  const kept = analyze(st.rows, it.items, { costs: { Mug: 6 } }).listings[0];
  assert.equal(kept.unitsRefunded, 1);
  assert.equal(kept.cogs, 0);
  const lost = analyze(st.rows, it.items, { costs: { Mug: 6 }, returnsResellable: false }).listings[0];
  assert.equal(lost.cogs, 6);
  assert.equal(lost.profit, -6);
});

test("orders missing from the statement are reported, not counted as free", () => {
  const st = normalizeStatement(parseCsv("Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net\n\"May 1, 2026\",Sale,Payment for Order #1000003,,USD,$20.00,--,$20.00"));
  const it = normalizeItems(parseCsv("Item Name,Quantity,Price,Order ID\nMug,1,$20.00,1000003\nOld,1,$9.00,9999999"));
  const r = analyze(st.rows, it.items);
  assert.equal(r.summary.unmatchedOrders, 1);
  assert.equal(r.listings.length, 1);
  assert.ok(r.findings.some((f) => /not in the statement/.test(f.title)));
});

test("statement alone still gives the waterfall and asks for the items file", () => {
  const { st } = sample();
  const r = analyze(st.rows, []);
  assert.equal(r.listings.length, 0);
  assert.ok(r.findings.some((f) => /Sold Order Items/.test(f.title)));
  assert.ok(r.summary.sales > 0);
});

test("findings fire on the sample: Offsite Ads, Etsy Ads and refunds are named", () => {
  const { st, it, costs } = sample();
  const r = analyze(st.rows, it.items, { costs });
  assert.ok(r.summary.profit > 0);
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /kept \d/);
  assert.ok(r.findings.every((f) => ["high", "medium", "info"].includes(f.severity)));
});

test("a loss-making listing is flagged", () => {
  const { st, it, costs } = sample();
  const r = analyze(st.rows, it.items, { costs: { ...costs, "Custom Pet Portrait Print": 60 } });
  assert.ok(r.findings.some((f) => /lose money/.test(f.title) && /Custom Pet Portrait Print/.test(f.detail)));
});

test("parseCosts reads name,cost lines (commas inside names allowed) and reports bad ones", () => {
  const { costs, bad } = parseCosts("name,cost\nMug, large,4.5\nTote,3\nbroken\nX,-2");
  assert.equal(costs["Mug, large"], 4.5);
  assert.equal(costs.Tote, 3);
  assert.deepEqual(bad, [4, 5]);
});
