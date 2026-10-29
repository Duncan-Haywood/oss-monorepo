// A massage therapist's month (fixtures/massage-checking.csv, made up): Square and Vagaro payouts are sales;
// booking software, lotions and linens, association dues, continuing education, the state licence and suite rent
// each land in their own account; the Zelle from a person stays in review.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/massage-checking.csv", import.meta.url), "utf8");

test("massage and esthetics lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SQUARE/), "4000");
  assert.equal(code(/VAGARO/), "4000");
  assert.equal(code(/MASSAGEBOOK/), "6060");
  assert.equal(code(/BIOTONE/), "6100");
  assert.equal(code(/LINEN/), "6100");
  assert.equal(code(/WAX/), "6100");
  assert.equal(code(/ABMP/), "6170");
  assert.equal(code(/NCBTMB/), "6170");
  assert.equal(code(/STATE BOARD/), "6110");
  assert.equal(code(/SUITE RENT/), "6080");
  assert.equal(code(/INSURANCE/), "6030");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/GOOGLE/), "6000");
  assert.equal(code(/ZELLE/) ?? null, null);
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 154750);
  assert.equal(Math.round(costs * 100), 112465);
  assert.equal(Math.round((sales - costs) * 100), 42285);
});
