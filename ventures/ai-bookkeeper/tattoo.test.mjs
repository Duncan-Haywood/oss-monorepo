// A tattoo artist's month (fixtures/tattoo-checking.csv, made up): Square deposits are sales; ink, needles, gloves,
// sharps pickup, drawing software, the health permit, safety training, association dues and booth rent each land in
// their own account; the Zelle from a person stays in review.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/tattoo-checking.csv", import.meta.url), "utf8");

test("tattoo studio lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SQUARE/), "4000");
  assert.equal(code(/INTENZE/), "6100");
  assert.equal(code(/NEEDLES/), "6100");
  assert.equal(code(/NITRILE/), "6100");
  assert.equal(code(/SHARPS/), "6100");
  assert.equal(code(/PROCREATE/), "6060");
  assert.equal(code(/BODY ART PERMIT/), "6110");
  assert.equal(code(/BLOODBORNE/), "6170");
  assert.equal(code(/TATTOOISTS/), "6170");
  assert.equal(code(/BOOTH RENT/), "6080");
  assert.equal(code(/INSTAGRAM/), "6000");
  assert.equal(code(/ZELLE/) ?? null, null);
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 229000);
  assert.equal(Math.round(costs * 100), 110824);
  assert.equal(Math.round((sales - costs) * 100), 118176);
});
