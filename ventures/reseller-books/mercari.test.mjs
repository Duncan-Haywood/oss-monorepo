import { test } from "node:test";
import assert from "node:assert/strict";
import { detectKind, buildBooks, scheduleWorksheet } from "./books.mjs";
import { normalizeReport, analyze, parseCsv, sampleCsv, isMercariHeader } from "./engines/mercari.mjs";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} vs ${b}`);
const HEAD = sampleCsv().split("\n")[0];
const file = (...lines) => ({ name: "mercari.csv", text: [HEAD, ...lines].join("\n") });

test("the header is the help centre's 20 fields, and it is recognised as Mercari", () => {
  assert.equal(HEAD.split(",").length, 20);
  assert.equal(detectKind(sampleCsv()), "mercari");
  assert.ok(isMercariHeader(["Item ID", "Item Title", "Net Seller Proceeds"]));
  // A Poshmark or Whatnot file is not taken for Mercari.
  assert.ok(!isMercariHeader(["Order Date", "Product Name", "Sold Price", "Commission"]));
});

test("only completed orders are booked; in-progress and canceled are reported", () => {
  const r = buildBooks([{ name: "m.csv", text: sampleCsv() }]);
  const m = r.channels[0];
  assert.equal(m.channel, "mercari");
  assert.equal(m.orders, 3);
  near(m.sales, 48 + 30 + 62, "item prices of the three completed");
  near(m.net, 34.01 + 24.7 + 40.44, "net is the file's Net Seller Proceeds");
  near(m.platformFees, -(4.8 + 1.74 + 3 + 1.2 + 6.2 + 2.16), "selling + processing fees");
  near(m.labels, -(7.45 + 13.2), "seller-paid shipping is postage");
  near(m.other, -1.1, "the shipping adjustment");
  near(m.sales + m.platformFees + m.labels + m.other, m.net, "reconciles");
  const notes = m.notes.join(" ");
  assert.match(notes, /1 Mercari order\(s\) \(\$22\.00 at item price\) were still in progress/);
  assert.match(notes, /1 canceled Mercari order/);
  assert.match(notes, /Buyers also paid/);
  assert.doesNotMatch(notes, /do not explain/);
  assert.deepEqual(r.months.map((x) => x.month), ["2026-03", "2026-04"]);
});

test("a sale is booked in its completion month, when the proceeds arrive", () => {
  const r = buildBooks([file("m1,03/30/2026,,04/02/2026,Lamp,Completed,CA,OH,20.00,0,0,2.00,0.88,0,17.12,0,0,0,0,0")]);
  assert.deepEqual(r.months.map((x) => x.month), ["2026-04"]);
});

test("overlapping downloads count a sale once, keeping the settled status", () => {
  const early = file("m9,04/27/2026,,,Wool scarf,In Progress,IL,OH,22.00,6.49,0,2.20,0.96,0,18.84,0,0,0,0,0", "m1,03/02/2026,,03/06/2026,Jacket,Completed,CA,OH,48.00,0,7.45,4.80,1.74,0,34.01,0,0,0,0,0");
  const later = file("m9,04/27/2026,,05/01/2026,Wool scarf,Completed,IL,OH,22.00,6.49,0,2.20,0.96,0,18.84,0,0,0,0,0", "m1,03/02/2026,,03/06/2026,Jacket,Completed,CA,OH,48.00,0,7.45,4.80,1.74,0,34.01,0,0,0,0,0");
  const r = buildBooks([early, later]);
  const m = r.channels[0];
  assert.equal(m.orders, 2);
  near(m.net, 34.01 + 18.84, "each sale once");
  assert.match(m.notes.join(" "), /2 Mercari row\(s\) repeated an Item ID/);
  assert.doesNotMatch(m.notes.join(" "), /in progress/);
});

test("buyer-paid shipping, tax and fees are never sales", () => {
  const r = buildBooks([file("m1,03/02/2026,,03/06/2026,Jacket,Completed,CA,OH,48.00,9.00,0,4.80,1.74,0,41.46,3.96,1.00,0,1.92,0")]);
  near(r.channels[0].sales, 48, "item price only");
  near(r.total.sales, 48, "Schedule C line 1 source");
  assert.equal(scheduleWorksheet(r.channels, r.total)[0].amount, 48);
  assert.match(r.channels[0].notes.join(" "), /shipping \$9\.00, sales tax \$3\.96, buyer fees \$2\.92/);
});

test("a row whose fees do not explain its net keeps the file's net and says so", () => {
  const r = buildBooks([file("m1,03/02/2026,,03/06/2026,Jacket,Completed,CA,OH,48.00,0,7.45,4.80,1.74,0,30.00,0,0,0,0,0")]);
  const m = r.channels[0];
  near(m.net, 30, "file's net");
  near(m.other, 30 - (48 - 7.45 - 4.8 - 1.74), "gap in other");
  assert.match(m.notes.join(" "), /1 Mercari row\(s\) have a Net Seller Proceeds that the listed fees do not explain/);
});

test("fees written as negatives read as the same deductions", () => {
  const a = buildBooks([file("m1,03/02/2026,,03/06/2026,Jacket,Completed,CA,OH,48.00,0,-7.45,-4.80,-1.74,0,34.01,0,0,0,0,0")]);
  assert.doesNotMatch(a.channels[0].notes.join(" "), /do not explain/);
});

test("costs match by Item ID or title; profit only when every sale is costed", () => {
  const f = { name: "m.csv", text: sampleCsv() };
  const part = buildBooks([f], { costs: "m10000000001,12\nCeramic planter set,6" });
  assert.equal(part.channels[0].profit, null);
  assert.match(part.channels[0].notes.join(" "), /2 of 3 Mercari sales have a cost/);
  const all = buildBooks([f], { costs: "m10000000001,12\nCeramic planter set,6\nBoard game bundle,15" });
  near(all.channels[0].cogs, 33, "cogs");
  near(all.channels[0].profit, 34.01 + 24.7 + 40.44 - 33, "profit");
  near(all.total.profit, all.channels[0].profit, "total");
});

test("a report with no completed orders is refused with a reason", () => {
  const r = buildBooks([file("m9,04/27/2026,,,Wool scarf,In Progress,IL,OH,22.00,6.49,0,2.20,0.96,0,18.84,0,0,0,0,0")]);
  assert.match(r.invalid, /no completed orders \(1 still in progress/);
});

test("quoted titles with commas, a BOM, ISO dates and a totals line", () => {
  const text = "﻿" + HEAD + '\nm1,2026-03-02,,2026-03-06,"Jacket, denim",Completed,CA,OH,"$1,048.00",0,0,104.80,30.89,0,912.31,0,0,0,0,0\nTotal,,,,,,,,1048.00,,,,,,912.31,,,,,';
  const n = normalizeReport(parseCsv(text));
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].title, "Jacket, denim");
  assert.equal(n.rows[0].price, 1048);
  assert.equal(n.skipped.length, 0);
  assert.equal(analyze(n.rows).summary.unreconciled, 0);
});

test("an item titled like an Object property is not given a phantom cost", () => {
  const head = sampleCsv().split("\n")[0];
  const r = buildBooks([{ name: "m.csv", text: head + "\nm1,03/02/2026,,03/06/2026,constructor,Completed,CA,OH,10.00,0,0,1.00,0.50,0,8.50,0,0,0,0,0" }], { costs: "other,1" });
  assert.equal(r.channels[0].cogs, null);
  assert.equal(r.channels[0].profit, null);
});
