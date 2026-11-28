// Supplier price lists into the plan (pricelist.mjs). Every expected figure is worked by hand in
// the comment beside it. The price lists are invented examples, not any yard's prices.
import test from "node:test";
import assert from "node:assert/strict";
import { readPriceList, applyPriceList, readLumber, yardLength, yardPrice, parseCsv } from "./pricelist.mjs";
import { samplePlan, takeoff } from "./engine.mjs";
import { main } from "./cli.mjs";

test("yard lengths: bare 24 or under is feet, fractions and over 24 are inches", () => {
  assert.equal(yardLength("8"), 96);
  assert.equal(yardLength("16'"), 192);
  assert.equal(yardLength("12 ft"), 144);
  assert.equal(yardLength("92-5/8"), 92.625);
  assert.equal(yardLength("104 5/8"), 104.625);
  assert.equal(yardLength("96"), 96);
  assert.equal(yardLength('20"'), 20);
  assert.equal(yardLength("8' 6"), 102);
  assert.ok(Number.isNaN(yardLength("long")));
});

test("yard prices: dollar sign, decimal comma, thousands comma", () => {
  assert.equal(yardPrice("$4.12"), 4.12);
  assert.equal(yardPrice("4,12"), 4.12);
  assert.equal(yardPrice("1,234.50"), 1234.5);
  assert.ok(Number.isNaN(yardPrice("call")));
  assert.ok(Number.isNaN(yardPrice("")));
});

test("lumber descriptions as yards write them", () => {
  assert.deepEqual(readLumber("2x4-8' SPF #2"), { size: "2x4", length: 96 });
  assert.deepEqual(readLumber("2X6X16 SPF"), { size: "2x6", length: 192 });
  assert.deepEqual(readLumber("2 x 4 x 92-5/8 PET"), { size: "2x4", length: 92.625 });
  assert.deepEqual(readLumber("2x10 #2 SYP 12ft"), { size: "2x10", length: 144 });
  assert.deepEqual(readLumber("SPF #2", "2x4", "14"), { size: "2x4", length: 168 });
  assert.equal(readLumber("2x4 SPF"), null, "no length, no board");
  assert.equal(readLumber("Hurricane tie H2.5A"), null);
});

test("CSV: quotes, doubled quotes, CRLF, BOM, semicolons", () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x, ""y""",2\r\n'), [["a", "b"], ['x, "y"', "2"]]);
  assert.deepEqual(parseCsv("a;b\n2x4;4,12\n"), [["a", "b"], ["2x4", "4,12"]]);
});

const LIST = `Smith Lumber quote 1182
description,price,unit
2x4-8' SPF #2,4.12,EA
2x4x12 SPF,6.20,EA
2x4 92-5/8 precut stud,3.98,EA
2x4x10 PT ground contact,9.45,EA
2x10x12 SYP,610,MBF
2x6x16,0.90,LF
2x8x20,30,EA
7/16 OSB 4x8 wall sheathing,17.25,EA
5/8 CDX 4x8,31,EA
Architectural shingles,38.50,BDL
Hip & ridge cap,62,BDL
Ice & water shield,72,RL
Delivery,75,EA
2x4x14 SPF,call,EA
2x4x16,9,BDL
`;

test("a price list is read row by row, every row used or named", () => {
  const r = readPriceList(LIST);
  assert.equal(r.ok, true);
  const b = (/** @type {number} */ line) => r.boards.find((x) => x.line === line);
  assert.deepEqual(b(3), { line: 3, text: "2x4-8' SPF #2", size: "2x4", length: 96, price: 4.12, precut: false });
  assert.equal(b(5)?.precut, true);
  assert.equal(b(5)?.length, 92.625);
  assert.equal(b(6)?.size, "2x4 PT");
  assert.equal(b(7)?.price, 12.2, "2 x 10 x 12 ft / 12 = 20 board feet at 610 per 1,000 = 12.20");
  assert.equal(b(8)?.price, 14.4, "16 ft at 0.90 a foot = 14.40");
  assert.equal(b(9)?.length, 240, "a 20 ft board the stock does not have");
  assert.deepEqual(r.prices.map((p) => [p.line, p.key, p.price]), [[10, "wallSheet", 17.25], [12, "shingleBundle", 38.5], [13, "ridgeBundle", 62], [14, "iceShieldRoll", 72]]);
  assert.deepEqual(r.skipped.map((s) => s.line), [11, 15, 16, 17], "CDX with no use, delivery, a 'call' price, a bundle unit");
  assert.match(r.skipped[0].why, /no use named/);
  assert.match(r.skipped[2].why, /not a number/);
  assert.match(r.skipped[3].why, /not EA, LF or MBF/);
  assert.equal(r.boards.length + r.prices.length + r.skipped.length, 15, "15 product rows, none lost");
});

test("a key column names the price outright and wins over the words", () => {
  const r = readPriceList("description,price,key\n5/8 CDX 4x8,31,roofSheet\n2x4x8,4,\nanything,1,notAKey\n");
  assert.deepEqual(r.prices, [{ line: 2, text: "5/8 CDX 4x8", key: "roofSheet", price: 31 }]);
  assert.equal(r.boards.length, 1);
  assert.match(r.skipped[0].why, /not a price name/);
});

test("refuses a list it cannot read, with a reason", () => {
  for (const bad of [null, undefined, 5, "", "foo,bar\n1,2\n", "description,price\nDelivery,75\n"]) {
    const r = readPriceList(/** @type {any} */ (bad));
    assert.equal(r.ok, false, String(bad));
    assert.ok(r.errors.length);
  }
  assert.throws(() => applyPriceList(samplePlan(), /** @type {any} */ (null)), /readPriceList/);
});

test("applying: listed boards repriced or added, unlisted lengths of a priced size dropped, unpriced sizes named", () => {
  const plan = samplePlan();
  const a = applyPriceList(plan, readPriceList(LIST));
  const s = (/** @type {string} */ size) => a.plan.stock.filter((/** @type {any} */ x) => x.size === size).map((/** @type {any} */ x) => [x.length, x.price, x.label ?? ""]).sort((p, q) => p[0] - q[0]);
  assert.deepEqual(s("2x4"), [[92.625, 3.98, "precut stud"], [96, 4.12, ""], [144, 6.2, ""]]);
  assert.deepEqual(s("2x8"), [[240, 30, ""]], "8-16 ft placeholders dropped, the 20 ft added");
  assert.deepEqual(s("2x12"), samplePlan().stock.filter((x) => x.size === "2x12").map((x) => [x.length, x.price, ""]), "not on the list: kept");
  assert.ok(a.unpricedSizes.includes("2x12") && a.unpricedSizes.includes("2x6 PT"));
  assert.ok(!a.unpricedSizes.includes("2x4"));
  assert.equal(a.added, 1);
  assert.equal(a.plan.prices.wallSheet, 17.25);
  assert.ok(a.notes.some((n) => /no price for .*2x12/.test(n)));
  assert.ok(a.notes.some((n) => /4 rows not read/.test(n)));
  assert.equal(plan.stock.find((x) => x.size === "2x4" && x.length === 96)?.price, 8, "the plan passed in is not changed");
});

test("the order is optimised on the yard's prices: the takeoff runs and costs the listed boards", () => {
  const list = readPriceList("description,price\n2x4x8,4.12\n2x4x10,5.35\n2x4x12,6.20\n2x4x16,8.90\n2x4 92-5/8 precut,3.98\n2x4x8 PT,6.10\n2x4x12 PT,8.70\n2x4x16 PT,11.60\n2x6x8,6.40\n2x6x12,9.80\n2x6x16,13.90\n2x8x8,8.10\n2x8x12,12.40\n2x8x16,16.90\n2x10x12,12.20\n2x10x16,16.70\n2x12x12,22.40\n2x12x16,30.10\n");
  const a = applyPriceList(samplePlan(), list);
  const r = takeoff(a.plan);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const priced = new Map(list.boards.map((b) => [`${b.size}|${b.length}`, b.price]));
  let sum = 0;
  for (const o of r.orders) for (const l of o.lines) {
    const p = priced.get(`${o.size}|${Math.round(l.length * 1000) / 1000}`);
    assert.ok(p != null, `${o.size} ${l.length} in is a board on the list`);
    sum += l.qty * p;
  }
  assert.ok(Math.abs(sum - r.orders.reduce((t, o) => t + o.lines.reduce((u, l) => u + l.qty * l.price, 0), 0)) < 0.01);
});

test("CLI: --price-list reprices the material list, notes what it did, refuses a bad file", () => {
  const plan = JSON.stringify(samplePlan());
  const files = { "plan.json": plan, "yard.csv": "description,price\n2x4x8,4.12\n2x4x12,6.20\n2x4x16,8.90\n2x4 92-5/8 precut,3.98\nDelivery,75\n", "bad.csv": "nothing here\n" };
  const read = (/** @type {string} */ p) => { if (!(p in files)) throw new Error("no such file"); return files[/** @type {keyof typeof files} */ (p)]; };
  const r = main(["plan.json", "--material-list", "--priced", "--price-list=yard.csv"], read);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Price list: 4 board prices replaced/);
  assert.match(r.out, /line 6 "Delivery"/);
  assert.match(r.out, /2x4 precut stud x 7' 8-5\/8".*\d+\.\d\d/);
  const bad = main(["plan.json", "--price-list=bad.csv"], read);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /could not be used/);
  assert.equal(main(["plan.json", "--price-list=missing.csv"], read).code, 2);
});

test("bench: on the example house, optimising on the prices costs less than optimising on length when the list is not flat per foot", async () => {
  const { measure, SHAPES } = await import("./pricelist-bench.mjs");
  const plan = samplePlan();
  const flat = measure(plan, SHAPES[0][1]);
  assert.ok(Math.abs(flat.saving) < 0.005, `flat list: nothing to gain (${flat.saving})`);
  const both = measure(plan, SHAPES[3][1]);
  assert.ok(both.saving > 0.02, `precut discount and long-board premium: over 2% saved (${both.saving})`);
});
