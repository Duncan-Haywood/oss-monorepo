// A yoga or Pilates studio's month (fixtures/yogastudio-checking.csv, made up): class-marketplace and booking-platform payouts and a corporate Zelle are sales;
// the lease is rent; props are supplies; booking software and music streaming are software; a Gusto payroll debit is wages, not software.
// One line, a warehouse-club run, has no suggestion on purpose.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/yogastudio-checking.csv", import.meta.url), "utf8");

test("studio lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/CLASSPASS PAYOUT/), "4000");
  assert.equal(code(/MOMENCE PAYOUT/), "4000");
  assert.equal(code(/WALLA PAYOUT/), "4000");
  assert.equal(code(/CORPORATE WELLNESS/), "4000");
  assert.equal(code(/STUDIO LEASE/), "6080");
  assert.equal(code(/MANDUKA/), "6100");
  assert.equal(code(/MOMENCE SUBSCRIPTION/), "6060");
  assert.equal(code(/SPOTIFY/), "6060");
  assert.equal(code(/BMI MUSIC/), "6110");
  assert.equal(code(/GUSTO PAYROLL/), "6150");
  assert.equal(code(/HISCOX/), "6030");
  assert.equal(code(/YOGA ALLIANCE/), "6170");
  assert.equal(code(/ZELLE TRANSFER TO OWNER/), "3100");
});

test("only the warehouse-club run is left for review and the month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const open = b.transactions.filter((t) => !t.suggestion?.account);
  assert.equal(open.length, 1);
  assert.match(open[0].desc ?? open[0].description, /COSTCO/);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 585500);
  assert.equal(Math.round(out * 100), 566454);
  assert.equal(Math.round((out - 1200) * 100), 446454);
  assert.equal(Math.round((sales - out + 1200) * 100), 139046);
});
