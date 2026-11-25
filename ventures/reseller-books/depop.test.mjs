import { test } from "node:test";
import assert from "node:assert/strict";
import { detectKind, buildBooks, soldUnits } from "./books.mjs";
import { normalizeReport, parseCsv, sampleCsv, isDepopHeader, depopNumber } from "./engines/depop.mjs";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} vs ${b}`);
const HEAD = sampleCsv().split("\n")[0];
const file = (name, ...lines) => ({ name, text: [HEAD, ...lines].join("\n") });

// The full header row printed from a real export in Juribu/Depop-Sales-Analysis
// (found by GitHub code search, 2026-11-25). A real file must be recognised.
const REAL_HEADER = ["Date of sale", "Time of sale", "Date of listing", "Bundle", "Buyer", "Brand", "Description", "Size", "Item price", "Buyer shipping cost", "Total", "USPS Cost", "Depop fee", "Depop Payments fee", "Buyer Marketplace Fee", "Boosting fee", "Payment type", "Estimated payout date", "Payout arrival date", "Category", "Name", "Address Line 1", "Address Line 2", "City", "State", "Post Code", "Country", "US Sales tax", "Refunded to buyer amount", "Fees refunded to seller", "Payout id", "Australia Sales tax", "Unknown Tax", "Canada Sales tax"];

test("the real export's header is recognised as Depop, not Poshmark (both have Brand)", () => {
  assert.equal(detectKind(REAL_HEADER.join(",") + "\n"), "depop");
  assert.equal(detectKind(sampleCsv()), "depop");
  assert.ok(isDepopHeader(["Date of sale", "Item price", "Depop fee"]));
  assert.ok(!isDepopHeader(["Order Date", "Brand", "Order Price", "Posh Fee"]));
});

test("every column of the sample is a column of the real header", () => {
  for (const h of HEAD.split(",")) assert.ok(REAL_HEADER.includes(h), h);
});

test("Excel-wrapped dashes and blanks are zero, wrapped numbers are read", () => {
  assert.equal(depopNumber('="-"'), 0);
  assert.equal(depopNumber("=-"), 0);
  assert.equal(depopNumber("$-"), 0);
  assert.equal(depopNumber(""), 0);
  assert.equal(depopNumber('="12.40"'), 12.4);
  assert.equal(depopNumber("$1,204.50"), 1204.5);
});

test("sales are item price plus buyer shipping; fees, label, boost and refunds are deducted", () => {
  const r = buildBooks([{ name: "depop.csv", text: sampleCsv() }]);
  const d = r.channels[0];
  assert.equal(d.channel, "depop");
  assert.equal(d.orders, 3);
  near(d.sales, 45 + 6.5 + 38 + 5.25 + 30 + 5.25, "item + buyer shipping");
  near(d.labels, -(6.5 + 5.25 + 5.25), "USPS Cost is postage");
  near(d.ads, -(3.6 + 2.4), "boosting is advertising, not a fee");
  near(d.platformFees, -(2.15 + 1.88 + 1.61) + 1.61, "payments fees less fees refunded");
  near(d.refunds, -30, "refunded to buyer");
  near(d.net, 39.25 + 36.12 - 2.4, "hand sum of the three rows");
  near(d.sales + d.refunds + d.platformFees + d.labels + d.ads + d.other, d.net, "reconciles");
  const notes = d.notes.join(" ");
  assert.match(notes, /no payout figure per sale/);
  assert.match(notes, /sales tax \$10\.40, Buyer Marketplace Fee \$5\.65/);
  assert.match(notes, /1 Depop sale\(s\) were refunded in full/);
  assert.deepEqual(r.months.map((m) => m.month), ["2026-03", "2026-04"]);
});

test("buyer-paid sales tax and marketplace fee never enter sales", () => {
  const a = buildBooks([file("a.csv", "05/02/2026,10:00,,No,b,X,Hat,OS,$20.00,$0.00,$20.00,$0.00,$0.00,$1.11,$0.00,$0.00,Card,,,Hats,$0.00,$0.00,$0.00")]);
  const b = buildBooks([file("b.csv", "05/02/2026,10:00,,No,b,X,Hat,OS,$20.00,$0.00,$31.60,$0.00,$0.00,$1.11,$9.99,$0.00,Card,,,Hats,$1.60,$0.00,$0.00")]);
  near(a.channels[0].sales, b.channels[0].sales, "same sales");
  near(a.channels[0].net, b.channels[0].net, "same net");
});

test("overlapping downloads count a sale once; identical rows in one file both count", () => {
  const row = "06/10/2026,12:30,,Yes,b,X,Plain tee,M,$10.00,$0.00,$10.00,$0.00,$0.00,$0.63,$0.00,$0.00,Card,,,Tops,$0.00,$0.00,$0.00";
  const r = buildBooks([file("q2.csv", row, row), file("q2-again.csv", row)]);
  assert.equal(r.channels[0].orders, 2);
  assert.match(r.channels[0].notes.join(" "), /1 Depop row\(s\) repeated a sale/);
  assert.match(r.channels[0].notes.join(" "), /part of a bundle/);
});

test("a UK export (day first) is booked in the right month", () => {
  const r = buildBooks([file("uk.csv", "25/03/2026,08:00,,No,b,X,Scarf,OS,£12.00,£3.00,£15.00,£3.00,£1.20,£0.60,£0.00,£0.00,Card,,,Acc,£0.00,£0.00,£0.00", "02/04/2026,08:00,,No,b,X,Belt,OS,£8.00,£3.00,£11.00,£3.00,£0.80,£0.40,£0.00,£0.00,Card,,,Acc,£0.00,£0.00,£0.00")]);
  assert.deepEqual(r.months.map((m) => m.month), ["2026-03", "2026-04"]);
  near(r.channels[0].platformFees, -(1.2 + 0.6 + 0.8 + 0.4), "selling + payments fees");
});

test("costs match on the description; profit only when every sale is costed", () => {
  const part = buildBooks([{ name: "d.csv", text: sampleCsv() }], { costs: "Vintage 501 jeans,12" });
  assert.equal(part.channels[0].profit, null);
  const all = buildBooks([{ name: "d.csv", text: sampleCsv() }], { costs: "Vintage 501 jeans,12\nWindbreaker jacket,9\nKnit sweater,6" });
  near(all.channels[0].profit, 72.97 - 27, "net less cost of goods");
});

test("a fully refunded sale sells no unit for Part III; buyer names and addresses are never kept", () => {
  const r = buildBooks([{ name: "d.csv", text: sampleCsv() }]);
  const units = soldUnits(r.details).filter((u) => u.channel === "Depop").map((u) => u.name);
  assert.deepEqual(units, ["Vintage 501 jeans", "Windbreaker jacket"]);
  const n = normalizeReport(parseCsv([REAL_HEADER.join(","), "03/04/2026,14:05,,No,someone,B,Thing,M,$5.00,$0,$5.00,$0,$0,$0.40,$0,$0,Card,,,Cat,Jane Doe,1 High St,,Town,ST,12345,US,$0,$0,$0,p1,$0,$0,$0"].join("\n")));
  assert.equal(n.rows.length, 1);
  assert.doesNotMatch(JSON.stringify(n.rows), /Jane Doe|High St|12345/);
});
