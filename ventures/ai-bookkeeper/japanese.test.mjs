import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Japanese-header CSV as I remember bank exports; rows are made up, so this
// is not a real bank download. Yen has no minor unit, so amounts are booked
// x100 like any currency here.
const split = [
  "取引日,摘要,出金金額,入金金額,残高",
  "2026/03/15,セブンイレブン,540,,99460",
  "2026/03/12,給与 カ）サンプル,,100000,100000",
].join("\n");

test("Japanese withdrawal/deposit headers sign the amounts and read the description", () => {
  const r = readStatement(split);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [
    ["2026-03-15", -54000, "セブンイレブン"],
    ["2026-03-12", 10000000, "給与 カ）サンプル"],
  ]);
});

test("年月日 dates parse", () => {
  const r = readStatement(["日付,お取引内容,金額", "2026年3月5日,振込手数料,-220", "2026年03月06日,利息,12"].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [
    ["2026-03-05", -22000, "振込手数料"],
    ["2026-03-06", 1200, "利息"],
  ]);
});
