// A photographer's month (fixtures/photographer-checking.csv, made up): Stripe transfers are sales; gallery software, trade-body dues,
// the second shooter, the print lab, insurance, fuel and ads each land in their own account; the couple's Zelle stays in review.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/photographer-checking.csv", import.meta.url), "utf8");

test("photographer lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/ST-7H2D4/), "4000");
  assert.equal(code(/ADOBE/), "6060");
  assert.equal(code(/PIC-TIME/), "6060");
  assert.equal(code(/LIGHTROOM/), "6060");
  assert.equal(code(/WHCC/), "6100");
  assert.equal(code(/SECOND SHOOTER/), "6020");
  assert.equal(code(/PPA PROFESSIONAL/), "6170");
  assert.equal(code(/HARTFORD/), "6030");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/META ADS/), "6000");
  assert.equal(code(/ZELLE FROM/) ?? null, null);
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 500000);
  assert.equal(Math.round(costs * 100), 226358);
  assert.equal(Math.round((sales - costs) * 100), 273642);
});
