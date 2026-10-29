// A tutor's month (fixtures/tutor-checking.csv, made up): marketplace payouts are sales; software, lesson materials, exam fees and dues,
// room rent, fuel and flyers each land in their own account; the Venmo cash-out stays in review.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/tutor-checking.csv", import.meta.url), "utf8");

test("tutor lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/WYZANT/), "4000");
  assert.equal(code(/OUTSCHOOL/), "4000");
  assert.equal(code(/ZOOM/), "6060");
  assert.equal(code(/PRODIGY/), "6060");
  assert.equal(code(/TEACHERS PAY/), "6100");
  assert.equal(code(/WACOM/), "6100");
  assert.equal(code(/PRAXIS/), "6170");
  assert.equal(code(/NEA/), "6170");
  assert.equal(code(/LIBRARY/), "6080");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/VISTAPRINT/), "6000");
  assert.equal(code(/VENMO/) ?? null, null);
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 191650);
  assert.equal(Math.round(costs * 100), 38543);
  assert.equal(Math.round((sales - costs) * 100), 153107);
});
