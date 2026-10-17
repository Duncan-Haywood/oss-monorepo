import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { detectKind, buildBooks, sampleFiles, toCsv, summaryText, scheduleWorksheet } from "./books.mjs";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} vs ${b}`);

test("each marketplace's own sample file is recognised as that marketplace", () => {
  const { files } = sampleFiles();
  assert.deepEqual(files.map((f) => detectKind(f.text)), ["ebay", "etsy", "poshmark", "whatnot", "shopify", "shopify-orders"]);
});

test("a Whatnot file is not read as a Poshmark file (their parsers accept each other's)", () => {
  const whatnot = sampleFiles().files[3];
  assert.equal(detectKind(whatnot.text), "whatnot");
  const r = buildBooks([whatnot]);
  assert.deepEqual(r.channels.map((c) => c.channel), ["whatnot"]);
});

test("an unrecognised file is named, not guessed at", () => {
  const r = buildBooks([{ name: "notes.csv", text: "a,b\n1,2\n" }]);
  assert.match(r.invalid, /No marketplace file could be recognised/);
  assert.deepEqual(r.unread, ["notes.csv"]);
  assert.equal(detectKind(""), null);
});

test("every month and the total reconcile: sales + refunds + deductions = net", () => {
  const s = sampleFiles();
  const r = buildBooks(s.files, { costs: s.costs });
  assert.equal(r.channels.length, 5);
  for (const m of r.months) near(m.sales + m.refunds + m.deductions, m.net, `month ${m.month}`);
  const t = r.total;
  near(t.sales + t.refunds + t.platformFees + t.labels + t.ads + t.other, t.net, "total");
  for (const c of r.channels) near(c.sales + c.refunds + c.platformFees + c.labels + c.ads + c.other, c.net, c.label);
  near(r.months.reduce((a, m) => a + m.net, 0), t.net, "months sum to total net");
  near(r.months.reduce((a, m) => a + m.sales, 0), t.sales, "months sum to total sales");
});

test("advertising is its own line and is not counted twice inside fees", () => {
  const r = buildBooks(sampleFiles().files);
  const ebay = r.channels.find((c) => c.channel === "ebay");
  assert.ok(ebay.ads < 0);
  near(ebay.platformFees + ebay.ads + ebay.labels + ebay.refunds + ebay.sales + ebay.other, ebay.net, "eBay");
  assert.ok(Math.abs(ebay.other) < 0.011, "nothing unexplained left over");
});

test("profit is blank, not overstated, until every sale on a channel has a cost", () => {
  const files = sampleFiles().files;
  const none = buildBooks([files[0]]);
  assert.equal(none.channels[0].profit, null);
  assert.equal(none.total.profit, null);
  const withCosts = buildBooks([files[0]], { costs: sampleFiles().costs });
  assert.ok(withCosts.channels[0].profit !== null);
  near(withCosts.channels[0].profit, withCosts.channels[0].net - withCosts.channels[0].cogs, "profit = net - cogs");
  const all = buildBooks(files, { costs: sampleFiles().costs });
  assert.equal(all.total.profit, null, "Etsy has no items file here, so the total is withheld");
  assert.match(all.channels.find((c) => c.channel === "etsy").notes.join(" "), /Sold Order Items/);
});

test("an Etsy items file alone is refused with a reason", () => {
  const items = "Sale Date,Item Name,Buyer,Quantity,Price,Order ID,SKU\n05/01/26,Mug,A,1,10,1,M1\n";
  assert.equal(detectKind(items), "etsy-items");
  const r = buildBooks([{ name: "items.csv", text: items }]);
  assert.match(r.invalid, /Payment Account statement/);
});

test("two files from the same marketplace are merged, not double-counted by detection", () => {
  const { files } = sampleFiles();
  const one = buildBooks([files[2]]);
  const two = buildBooks([files[2], { name: "again.csv", text: files[2].text }]);
  assert.equal(two.channels.length, 1);
  assert.equal(two.channels[0].orders, one.channels[0].orders * 2, "the same file given twice is counted twice; the page warns about it");
});

test("the Schedule C worksheet matches the totals, and labels cost of goods as unknown when it is", () => {
  const r = buildBooks(sampleFiles().files);
  const by = Object.fromEntries(r.schedule.map((x) => [x.label, x.amount]));
  near(by["Gross receipts or sales"], r.total.sales, "line 1");
  near(by["Commissions and fees"], -r.total.platformFees, "line 10");
  near(by["Advertising"], -r.total.ads, "line 8");
  assert.equal(by["Cost of goods sold"], null);
  assert.equal(scheduleWorksheet(r.channels, r.total).length, 7);
});

test("CSV and summary exports carry every channel and month", () => {
  const s = sampleFiles();
  const r = buildBooks(s.files, { costs: s.costs });
  const csv = toCsv(r);
  for (const c of r.channels) assert.ok(csv.includes(`"${c.label}"`));
  for (const m of r.months) assert.ok(csv.includes(m.month));
  assert.match(csv, /schedule_c_line/);
  assert.match(summaryText(r), /Reseller books: eBay, Etsy, Poshmark, Whatnot, Shopify/);
});

test("no network calls in the engine or the page", () => {
  for (const f of ["books.mjs", "index.html", "engines/ebay.mjs", "engines/etsy.mjs", "engines/poshmark.mjs", "engines/whatnot.mjs", "engines/shopify.mjs"]) {
    assert.doesNotMatch(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
  }
});

test("vendored engines are byte-identical to the analyzers they came from (checked while the sources exist)", () => {
  const pairs = {
    "engines/ebay.mjs": "../ebay-transaction-report-analyzer/calc.mjs",
    "engines/etsy.mjs": "../etsy-statement-profit-analyzer/calc.mjs",
    "engines/poshmark.mjs": "../poshmark-sales-report-analyzer/calc.mjs",
    "engines/whatnot.mjs": "../whatnot-sales-report-analyzer/calc.mjs",
    "engines/shopify.mjs": "../shopify-payout-profit-analyzer/calc.mjs",
  };
  for (const [copy, src] of Object.entries(pairs)) {
    const srcUrl = new URL(`./${src}`, import.meta.url);
    if (!existsSync(srcUrl)) continue; // deployed on its own
    assert.equal(readFileSync(new URL(`./${copy}`, import.meta.url), "utf8"), readFileSync(srcUrl, "utf8"), `${copy} drifted from ${src}; re-copy it`);
  }
});

test("Shopify: sales tax collected comes out of sales and payout when the Orders export is given", () => {
  const { files, costs } = sampleFiles();
  const [tx, orders] = [files[4], files[5]];
  const withOrders = buildBooks([tx, orders]).channels[0];
  const without = buildBooks([tx]).channels[0];
  assert.equal(withOrders.channel, "shopify");
  assert.ok(without.sales - withOrders.sales > 100, "tax removed from sales");
  near(without.net - withOrders.net, without.sales - withOrders.sales, "the same tax comes out of net");
  near(withOrders.sales + withOrders.refunds + withOrders.platformFees + withOrders.other, withOrders.net, "reconciles");
  assert.match(without.notes.join(" "), /include the sales tax/);
  assert.match(withOrders.notes.join(" "), /sales tax collected/);
  const r = buildBooks([tx, orders], { costs });
  for (const m of r.months) near(m.sales + m.refunds + m.deductions, m.net, `month ${m.month}`);
  const c = r.channels[0];
  near(c.profit, c.net - c.cogs, "profit = net - cogs");
});

test("Shopify: an Orders export alone is refused with a reason", () => {
  const r = buildBooks([sampleFiles().files[5]]);
  assert.match(r.invalid, /Transactions export|No marketplace/);
  assert.match(r.problems.join(" "), /Transactions export/);
});

test("Shopify: Shopify files are not mistaken for another marketplace", () => {
  const { files } = sampleFiles();
  for (const [i, kind] of [[4, "shopify"], [5, "shopify-orders"]]) assert.equal(detectKind(files[i].text), kind);
  for (const i of [0, 1, 2, 3]) assert.ok(!/shopify/.test(detectKind(files[i].text)));
});
