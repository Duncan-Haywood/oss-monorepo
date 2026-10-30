// A personal trainer's month (fixtures/trainer-checking.csv, made up): Stripe transfers are sales; coaching apps,
// certification, gym-floor rent, equipment and insurance each land in their own account; the Venmo cash-out stays in review.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/trainer-checking.csv", import.meta.url), "utf8");

test("trainer lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/ST-4F2K9/), "4000");
  assert.equal(code(/TRAINERIZE/), "6060");
  assert.equal(code(/MYFITNESSPAL/), "6060");
  assert.equal(code(/NASM/), "6170");
  assert.equal(code(/GYM RENTAL/), "6080");
  assert.equal(code(/REP FITNESS/), "6100");
  assert.equal(code(/PROFESSIONAL LIABILITY/), "6030");
  assert.equal(code(/META ADS/), "6000");
  assert.equal(code(/VENMO/) ?? null, null);
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 465500);
  assert.equal(Math.round(costs * 100), 91738);
  assert.equal(Math.round((sales - costs) * 100), 373762);
});
