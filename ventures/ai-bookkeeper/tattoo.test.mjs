// A tattoo artist's month (fixtures/tattoo-checking.csv, made up): Square deposits are sales; needles, ink, stencils, gloves and
// sharps pickup are supplies; booking and drawing apps are software; booth rent, the pathogens course and the health-department
// licence each land in their own account; the Venmo cash-out is an owner draw, not a cost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/tattoo-checking.csv", import.meta.url), "utf8");

test("tattoo lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SQUARE INC DEPOSIT/), "4000");
  assert.equal(code(/TATTOO SUPPLY/), "6100");
  assert.equal(code(/STENCIL STUFF/), "6100");
  assert.equal(code(/SHARPS/), "6100");
  assert.equal(code(/NITRILE/), "6100");
  assert.equal(code(/BOOKSY/), "6060");
  assert.equal(code(/PROCREATE/), "6060");
  assert.equal(code(/BOOTH RENT/), "6080");
  assert.equal(code(/BLOODBORNE/), "6170");
  assert.equal(code(/ARTIST LICENSE/), "6110");
  assert.equal(code(/INSTAGRAM/), "6000");
  assert.equal(code(/VENMO CASHOUT/), "3100");
});

test("every line has a suggestion and the worked month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 336500);
  assert.equal(Math.round(out * 100), 172633);
  assert.equal(Math.round((out - 400) * 100), 132633);
  assert.equal(Math.round((sales - out + 400) * 100), 203867);
});
