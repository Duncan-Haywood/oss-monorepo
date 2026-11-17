// Traps from the transtractor fixtures (eval/README.md, "Round 2"), each
// rebuilt here from synthetic lines so the tests carry no outside file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatement, parseAmountWord } from "./calc.mjs";
import { joinPieces } from "./pdf-text.mjs";

const L = (page, key, ...items) => ({ page, key, items: items.map(([text, x]) => ({ text, x, xEnd: x + text.length * 4.5 })) });
const HEAD = (key) => L(1, key, ["Date", 40], ["Description", 120], ["Debit", 300], ["Credit", 370], ["Balance", 460]);

test("runs that touch are joined only when the font gives their widths", () => {
  const run = (text, x, width, exact = true) => ({ text, x, width, size: 10, exact });
  // "1" + "3 J" + "an": a writer that places a few glyphs at a time.
  assert.deepEqual(joinPieces([run("1", 77, 5.6), run("3 J", 82.6, 14), run("an", 96.7, 11), run("Transaction 25", 149, 70)]).map((r) => r.text), ["13 Jan", "Transaction 25"]);
  // A column gap is never closed, and estimated widths never join anything.
  assert.equal(joinPieces([run("20", 370, 11), run(".00", 381.5, 13)]).length, 1);
  assert.equal(joinPieces([run("20", 370, 11, false), run(".00", 381.5, 13, false)]).length, 2);
  assert.equal(joinPieces([run("Transaction 1", 149, 60), run("50,000.00", 346, 40)]).length, 2);
  // A run of spaces is not glued to a number.
  assert.equal(joinPieces([run(" ", 343, 3), run("1,350.00", 346, 40)]).length, 2);
});

test("a whole-number balance is money only with CR or DR on it", () => {
  assert.deepEqual(parseAmountWord("90,350CR"), { abs: 9035000, neg: false, tag: "CR", text: "90,350CR", whole: true });
  assert.equal(parseAmountWord("120DR").abs, 12000);
  assert.equal(parseAmountWord("90,350"), null);
  assert.equal(parseAmountWord("2025"), null);
});

test("a round balance printed without decimals keeps its row", () => {
  const lines = [
    L(1, -10, ["Opening balance", 40], ["$52,000.00 CR", 260]),
    L(1, -20, ["Closing balance", 40], ["$88,350.00 CR", 260]),
    HEAD(-30),
    L(1, -40, ["01 Jan", 40], ["Deposit", 120], ["40,000.00", 370]),
    L(1, -55, ["Fee", 120], ["3,000.00", 300]),
    L(1, -70, ["Interest", 120], ["1,350.00", 370], ["90,350 CR", 450]),
    L(1, -85, ["02 Jan", 40], ["Card", 120], ["2,000.00", 300], ["88,350.00 CR", 450]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.deepEqual(r.transactions.map((t) => t.amount), [4000000, -300000, 135000, -200000]);
  assert.equal(r.transactions[2].balance, 9035000);
  assert.equal(r.reconcile.ok, true);
  assert.ok(!r.findings.some((f) => f.severity === "error"));
});

test("rows after an end-of-transactions line are left out, with a note", () => {
  const lines = [
    L(1, -10, ["Opening balance", 40], ["100.00", 260]),
    L(1, -20, ["Closing balance", 40], ["90.00", 260]),
    HEAD(-30),
    L(1, -40, ["01 Jan", 40], ["Coffee", 120], ["10.00", 300], ["90.00", 450]),
    L(1, -60, ["Transactions stop here. Continue banking with us.", 40]),
    HEAD(-80),
    L(1, -90, ["01 Jan", 40], ["Sample row", 120], ["500.00", 370], ["590.00", 450]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.equal(r.transactions.length, 1);
  assert.equal(r.reconcile.ok, true);
  assert.ok(r.findings.some((f) => /left out/.test(f.title) && /1 dated line/.test(f.detail)));
});

test("an account title after the end line starts reading again", () => {
  const lines = [
    HEAD(-30),
    L(1, -40, ["01 Jan", 40], ["Coffee", 120], ["10.00", 300], ["90.00", 450]),
    L(1, -60, ["End of transactions", 40]),
    L(1, -70, ["Savings Account 1234-5678", 40]),
    HEAD(-80),
    L(1, -90, ["01 Jan", 40], ["Transfer in", 120], ["500.00", 370], ["1,500.00", 450]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.equal(r.transactions.length, 2);
});

test("a misprinted running balance is told apart from a missing row", () => {
  const lines = [
    L(1, -10, ["Opening balance", 40], ["1,000.00", 260]),
    L(1, -20, ["Closing balance", 40], ["1,150.00", 260]),
    HEAD(-30),
    L(1, -40, ["01 Jan", 40], ["Pay", 120], ["200.00", 370], ["1,200.00", 450]),
    // The statement drops a digit: 1,170.00 printed as 170.00.
    L(1, -55, ["02 Jan", 40], ["Fuel", 120], ["30.00", 300], ["170.00", 450]),
    L(1, -70, ["03 Jan", 40], ["Shop", 120], ["20.00", 300], ["1,150.00", 450]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.deepEqual(r.transactions.map((t) => t.amount), [20000, -3000, -2000]);
  assert.equal(r.reconcile.ok, true);
  const m = r.findings.find((f) => /looks misprinted/.test(f.title));
  assert.ok(m, "named as a misprint");
  assert.match(m.detail, /reach 1,170\.00/);
  assert.ok(!r.findings.some((f) => /running balance breaks/.test(f.title)), "not reported as a missing row");
});

test("a real gap is still a break, not a misprint", () => {
  const lines = [
    L(1, -10, ["Opening balance", 40], ["1,000.00", 260]),
    L(1, -20, ["Closing balance", 40], ["1,100.00", 260]),
    HEAD(-30),
    L(1, -40, ["01 Jan", 40], ["Pay", 120], ["200.00", 370], ["1,200.00", 450]),
    // A 50.00 row is missing between these two.
    L(1, -55, ["02 Jan", 40], ["Fuel", 120], ["30.00", 300], ["1,120.00", 450]),
    L(1, -70, ["03 Jan", 40], ["Shop", 120], ["20.00", 300], ["1,100.00", 450]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.ok(r.findings.some((f) => /running balance breaks/.test(f.title)));
  assert.ok(!r.findings.some((f) => /misprinted/.test(f.title)));
});

test("a description printed above its amount moves down when the spacing says so", () => {
  // Lines of one transaction 13.8 apart, transactions 14.8 or more apart.
  const lines = [
    HEAD(-400),
    L(1, -420, ["04 Jan", 40], ["Rent", 120], ["900.00", 300]),
    L(1, -436.6, ["Groceries", 120], ["80.00", 300]),
    L(1, -451.4, ["Refund from", 120]),
    L(1, -465.2, ["the hardware store", 120], ["60.35", 370]),
    L(1, -481.8, ["Bus", 120], ["4.00", 300]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.deepEqual(r.transactions.map((t) => t.description), ["Rent", "Groceries", "Refund from the hardware store", "Bus"]);
});

test("evenly spaced wrapped lines stay with the row above", () => {
  const lines = [
    HEAD(-400),
    L(1, -420, ["04 Jan", 40], ["Rent", 120], ["900.00", 300]),
    L(1, -434, ["Groceries", 120], ["80.00", 300]),
    L(1, -448, ["Market Street store", 120]),
    L(1, -462, ["Refund", 120], ["60.35", 370]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.deepEqual(r.transactions.map((t) => t.description), ["Rent", "Groceries Market Street store", "Refund"]);
});

test("a row still waiting for its amount runs on to the next page", () => {
  const lines = [
    HEAD(-400),
    L(1, -420, ["17 Jan", 40], ["Transfer", 120]),
    L(2, -760, ["to savings", 120]),
    L(2, -745, ["account", 120], ["250.00", 300]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].description, "Transfer to savings account");
});
