import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, parseNumber, detectDelimiter, decodeBuffer, findColumns, normalizeSales, parseCostList, analyze, reportCsv, summaryText, sampleCsv } from "./calc.mjs";

const rows = (csv, o) => normalizeSales(parseCsv(csv, detectDelimiter(csv)), o);
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const item = (name, qty, sales, extra = {}) => ({ line: 1, name, category: "", qty, sales, cost: null, ...extra });

test("parseNumber handles $, thousands separators, parentheses, negatives and decimal commas", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("($12.00)"), -12);
  assert.equal(parseNumber("-$5.25"), -5.25);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.equal(parseNumber(""), 0);
  assert.ok(Number.isNaN(parseNumber("abc")));
});

test("delimiter detection and utf-16 decoding", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a\tb\n1\t2"), "\t");
  const text = "Item,Qty,Net Sales\nBurger,2,20";
  const le = new Uint8Array([0xff, 0xfe, ...[...text].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(le.buffer), "﻿".slice(0, 0) + text);
});

test("header aliases: Toast, Square and Clover style names all resolve", () => {
  for (const h of ["Menu Item,Menu Group,Item Qty,Net Amount", "Item,Category,Qty,Net Sales", "Item Name,Category,Quantity Sold,Revenue"]) {
    const r = rows(`${h}\nBurger,Mains,2,20`);
    assert.equal(r.error, undefined, h);
    assert.deepEqual([r.items[0].name, r.items[0].category, r.items[0].qty, r.items[0].sales], ["Burger", "Mains", 2, 20]);
  }
  assert.deepEqual(findColumns(["Net Sales", "Gross Sales"], { sales: ["net sales", "gross sales"] }), { sales: 0 });
});

test("preamble rows before the header are skipped and a missing header gives a clear error", () => {
  assert.equal(rows("Sales report\nJan 1 - Jan 31\nItem,Qty,Net Sales\nBurger,2,20").items.length, 1);
  assert.match(rows("foo,bar\n1,2").error, /No header row/);
  assert.match(normalizeSales([]).error, /empty/);
});

test("semicolon files use decimal commas; thousands separators and $ signs parse", () => {
  const r = rows("Item;Qty;Net Sales\nBurger;1.200;\"14.400,50\"\nFries;3;$9,00", { decimalComma: true });
  assert.equal(r.items[0].qty, 1200);
  assert.equal(r.items[0].sales, 14400.5);
  assert.equal(r.items[1].sales, 9);
  const r2 = rows("Item,Qty,Net Sales\nBurger,\"1,200\",\"$14,400.50\"");
  assert.equal(r2.items[0].qty, 1200);
  assert.equal(r2.items[0].sales, 14400.5);
});

test("voided, modifier and total rows are skipped and reported, not netted", () => {
  const r = rows("Item,Qty,Net Sales,Void\nBurger,10,100,\nBurger,5,50,TRUE\n+ Extra cheese,9,9,\nTotal,15,150,");
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.skipped.map((s) => s.reason), ["voided row", "modifier row", "total row"]);
  const t = rows("Item,Type,Qty,Net Sales\nBurger,Item,10,100\nCheese,Modifier,9,9");
  assert.equal(t.items.length, 1);
});

test("unreadable numbers are skipped with a reason", () => {
  const r = rows("Item,Qty,Net Sales\nBurger,10,100\nFries,many,5");
  assert.equal(r.items.length, 1);
  assert.equal(r.skipped[0].reason, "quantity or sales not readable");
});

test("duplicate item rows merge: quantity and sales sum, cost is quantity-weighted", () => {
  const a = analyze([item("Burger", 10, 100, { cost: 3 }), item("burger ", 30, 300, { cost: 4 }), item("Fries", 20, 60), item("Wings", 20, 200), item("Soup", 20, 120)], { defaultCostPct: 30 });
  const b = a.rows.find((x) => x.name === "Burger");
  assert.equal(b.qty, 40);
  assert.equal(b.sales, 400);
  near(b.price, 10);
  near(b.unitCost, 3.75);
  assert.equal(a.rows.length, 4);
  assert.equal(a.summary.rowsMerged, 1);
});

test("same name in different categories stays two items", () => {
  const a = analyze([item("Fries", 10, 50, { category: "Sides" }), item("Fries", 10, 60, { category: "Kids" })]);
  assert.equal(a.rows.length, 2);
});

test("refunds net against the item: quantity, sales, popularity and price all reflect them", () => {
  const a = analyze([item("Burger", 10, 120), item("Burger", -1, -12), item("Fries", 9, 45)], { defaultCostPct: 25 });
  const b = a.rows.find((x) => x.name === "Burger");
  assert.equal(b.qty, 9);
  assert.equal(b.sales, 108);
  near(b.price, 12);
  assert.equal(a.summary.refundUnits, 1);
  assert.ok(a.findings.some((f) => /refunded unit/.test(f.title)));
});

test("an item refunded to zero or below is left out and named", () => {
  const a = analyze([item("Burger", 5, 50), item("Burger", -5, -50), item("Fries", 9, 45), item("Wings", 3, 30)]);
  assert.equal(a.rows.length, 2);
  assert.equal(a.excluded[0].name, "Burger");
  assert.ok(a.findings.some((f) => /left out/.test(f.title)));
  assert.match(analyze([item("A", -1, -5)]).invalid, /nothing to classify/);
});

test("classification boundaries: exactly 70% of an even share is popular, exactly the average margin is high", () => {
  // 10 items, 100 plates: the bar is 7.00% => 7 plates. Item A sells exactly 7.
  const mk = (n, q, price) => item(n, q, q * price);
  const items = [mk("A", 7, 10), mk("B", 6, 10), mk("C", 10, 10), mk("D", 10, 10), mk("E", 10, 10), mk("F", 10, 10), mk("G", 10, 10), mk("H", 10, 10), mk("I", 10, 10), mk("J", 17, 10)];
  const a = analyze(items, { defaultCostPct: 40 });
  assert.equal(a.summary.units, 100);
  near(a.thresholds.popularityPct, 7);
  const cls = (n) => a.rows.find((x) => x.name === n);
  assert.equal(cls("A").popular, true, "7 of 100 sits on the bar");
  assert.equal(cls("B").popular, false, "6 of 100 is under it");
  // Every price is 10 at 40% cost, so every margin equals the weighted average: all high margin.
  assert.ok(a.rows.every((x) => x.highMargin));
  assert.equal(cls("A").cls, "Star");
  assert.equal(cls("B").cls, "Puzzle");
});

test("all four classes come out of one menu, using the weighted (not simple) average margin", () => {
  const a = analyze([
    item("Star", 40, 40 * 20, { cost: 6 }),       // cm 14, popular
    item("Horse", 40, 40 * 8, { cost: 5 }),       // cm 3, popular
    item("Puzzle", 4, 4 * 30, { cost: 10 }),      // cm 20, rare
    item("Dog", 4, 4 * 9, { cost: 6 }),           // cm 3, rare
  ]);
  const c = Object.fromEntries(a.rows.map((x) => [x.name, x.cls]));
  assert.deepEqual(c, { Star: "Star", Horse: "Plowhorse", Puzzle: "Puzzle", Dog: "Dog" });
  // weighted average = (40*14 + 40*3 + 4*20 + 4*3) / 88, not (14+3+20+3)/4
  near(a.thresholds.avgCm, (560 + 120 + 80 + 12) / 88);
});

test("cost precedence: export column beats pasted list beats the default percentage", () => {
  const list = parseCostList("Burger,9\nFries,1.5").map;
  const a = analyze([item("Burger", 10, 100, { cost: 3 }), item("Fries", 10, 50), item("Wings", 10, 100), item("Soup", 10, 60, { cost: null })], { costList: list, defaultCostPct: 30 });
  const by = (n) => a.rows.find((x) => x.name === n);
  assert.deepEqual([by("Burger").costSource, by("Fries").costSource, by("Wings").costSource], ["export", "list", "default"]);
  near(by("Burger").unitCost, 3);
  near(by("Fries").unitCost, 1.5);
  near(by("Wings").unitCost, 3);
  assert.ok(a.findings.some((f) => f.severity === "high" && /placeholder/.test(f.title)));
  assert.equal(a.summary.bySource.default, 2);
});

test("cost column variants: per-unit, total and percent columns", () => {
  assert.equal(rows("Item,Qty,Net Sales,Food Cost\nBurger,10,100,3.25").items[0].cost, 3.25);
  assert.equal(rows("Item,Qty,Net Sales,Total Cost\nBurger,10,100,30").items[0].cost, 3);
  near(rows("Item,Qty,Net Sales,Food Cost %\nBurger,10,100,35%").items[0].cost, 3.5);
  assert.equal(rows("Item,Qty,Net Sales,Food Cost\nBurger,10,100,").items[0].cost, null);
});

test("a blank cost in the export falls through to the list", () => {
  const n = rows("Item,Qty,Net Sales,Food Cost\nBurger,10,100,\nFries,10,50,1");
  const a = analyze(n.items, { costList: parseCostList("Burger,4").map });
  assert.equal(a.rows.find((x) => x.name === "Burger").costSource, "list");
});

test("zero cost is flagged, and so is a cost above the price", () => {
  const a = analyze([item("Water", 10, 30, { cost: 0 }), item("Steak", 10, 100, { cost: 14 }), item("Fries", 10, 50, { cost: 1 }), item("Wings", 10, 100, { cost: 3 })]);
  assert.equal(a.rows.find((x) => x.name === "Water").zeroCost, true);
  assert.equal(a.rows.find((x) => x.name === "Steak").costAbovePrice, true);
  assert.ok(a.findings.some((f) => /food cost of zero/.test(f.title)));
  assert.ok(a.findings.some((f) => /cost more to make/.test(f.title)));
  assert.match(reportCsv(a), /zero cost/);
});

test("price-increase math on Plowhorses, with a typed volume loss", () => {
  const a = analyze([
    item("Horse", 100, 100 * 10, { cost: 6 }),   // cm 4, popular, below avg
    item("Star", 100, 100 * 30, { cost: 6 }),    // cm 24
    item("Rare", 2, 2 * 12, { cost: 6 }),
    item("Rare2", 2, 2 * 12, { cost: 6 }),
  ], { priceIncreasePct: 10, volumeLossPct: 5, periodWeeks: 4 });
  const p = a.priceMove.items.find((x) => x.name === "Horse");
  assert.ok(p);
  near(p.newPrice, 11);
  near(p.newQty, 95);
  // before: 4 * 100 = 400; after: (11 - 6) * 95 = 475
  near(p.gain, 75);
  near(a.priceMove.gain, 75 + a.priceMove.items.filter((x) => x.name !== "Horse").reduce((s, x) => s + x.gain, 0));
  near(a.priceMove.gainPerYear, a.priceMove.gain * 13);
  // break-even loss: (4 + 1)(1 - L) = 4 => L = 20%
  near(p.breakEvenLossPct, 20);
});

test("a large enough volume loss turns the price rise negative", () => {
  const a = analyze([item("Horse", 100, 1000, { cost: 6 }), item("Star", 100, 3000, { cost: 6 }), item("Rare", 2, 24, { cost: 6 }), item("Rare2", 2, 24, { cost: 6 })], { priceIncreasePct: 10, volumeLossPct: 25 });
  assert.ok(a.priceMove.items.find((x) => x.name === "Horse").gain < 0);
  assert.equal(a.priceMove.gainPerYear, null);
});

test("invalid inputs are refused rather than computed", () => {
  const it = [item("A", 1, 10)];
  assert.match(analyze(it, { defaultCostPct: 100 }).invalid, /food cost/);
  assert.match(analyze(it, { priceIncreasePct: -1 }).invalid, /Price increase/);
  assert.match(analyze(it, { volumeLossPct: 100 }).invalid, /Volume loss/);
});

test("cut and re-promote lists come from Dogs and Puzzles", () => {
  const a = analyze([item("Star", 40, 800, { cost: 6 }), item("Horse", 40, 320, { cost: 5 }), item("Puzzle", 4, 120, { cost: 10 }), item("Dog", 4, 36, { cost: 6 })]);
  assert.deepEqual(a.cut.map((x) => x.name), ["Dog"]);
  assert.deepEqual(a.promote.map((x) => x.name), ["Puzzle"]);
});

test("category rollup adds up to the totals", () => {
  const a = analyze([item("A", 10, 100, { category: "Mains", cost: 3 }), item("B", 10, 80, { category: "Mains", cost: 3 }), item("C", 10, 40, { category: "Sides", cost: 1 }), item("D", 10, 30)]);
  const sum = (k) => a.categories.reduce((s, c) => s + c[k], 0);
  near(sum("sales"), a.summary.sales);
  near(sum("qty"), a.summary.units);
  near(sum("cmTotal"), a.summary.cm);
  near(sum("mixPct"), 100);
  assert.ok(a.categories.some((c) => c.category === "Uncategorised"));
});

test("pasted cost list: delimiters, header line, quoted names with commas, bad lines", () => {
  const l = parseCostList("item,cost\n\"Mac, Cheese\",\"$3.20\"\nBurger;4,10\nbroken\nFries,abc");
  assert.equal(l.map.get("mac, cheese"), 3.2);
  assert.equal(l.skipped.length >= 1, true);
  assert.equal(parseCostList("Burger;4,10\nFries;1,5").map.get("burger"), 4.1);
  assert.equal(parseCostList("").map.size, 0);
});

test("CSV output neutralises formula cells and quotes commas", () => {
  const a = analyze([item("=SUM(A1)", 10, 100, { cost: 3 }), item("Mac, Cheese", 10, 100, { cost: 3 }), item("Fries", 10, 50, { cost: 1 }), item("Wings", 10, 60, { cost: 2 })]);
  const csv = reportCsv(a);
  assert.match(csv, /'=SUM\(A1\)/);
  assert.match(csv, /"Mac, Cheese"/);
  assert.equal(csv.split("\n").length, 5);
});

test("the sample runs end to end and exercises every handling path", () => {
  const s = sampleCsv();
  const n = normalizeSales(parseCsv(s.sales));
  const a = analyze(n.items, { costList: parseCostList(s.costs).map });
  assert.equal(n.skipped.length, 2);
  assert.equal(n.refundRows, 1);
  assert.ok(a.summary.rowsMerged >= 1 && a.summary.bySource.default > 0 && a.rows.some((x) => x.zeroCost));
  for (const c of ["Star", "Plowhorse", "Puzzle", "Dog"]) assert.ok(a.summary.classes[c] > 0, c);
  assert.match(summaryText(a), /Plowhorse/);
});

test("no network: the calculation module makes no requests", () => {
  const src = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  const saved = globalThis.fetch;
  let called = 0;
  globalThis.fetch = () => { called++; throw new Error("network"); };
  try {
    const s = sampleCsv();
    analyze(normalizeSales(parseCsv(s.sales)).items, { costList: parseCostList(s.costs).map });
  } finally { globalThis.fetch = saved; }
  assert.equal(called, 0);
});
