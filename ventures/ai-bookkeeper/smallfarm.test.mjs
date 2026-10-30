// A small farm's month (fixtures/smallfarm-checking.csv, made up): CSA-platform payouts, Square, market and co-op deposits are sales; feed and seed are supplies;
// the vet, the tractor-loan interest, the farm policy, the pasture lease, CSA software, farm diesel and the state licence each land in their own account;
// the Zelle to the owner is a draw, not a cost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/smallfarm-checking.csv", import.meta.url), "utf8");

test("small farm lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/LOCAL LINE CSA PAYOUT/), "4000");
  assert.equal(code(/SQUARE INC/), "4000");
  assert.equal(code(/FARMERS MARKET DEPOSIT/), "4000");
  assert.equal(code(/WHOLESALE CO-OP/), "4000");
  assert.equal(code(/SOUTHERN STATES/), "6100");
  assert.equal(code(/JOHNNY/), "6100");
  assert.equal(code(/TRACTOR LOAN INTEREST/), "6040");
  assert.equal(code(/FARM BUREAU/), "6030");
  assert.equal(code(/PASTURE LEASE/), "6080");
  assert.equal(code(/LOCAL LINE SUBSCRIPTION/), "6060");
  assert.equal(code(/FARM DIESEL/), "6160");
  assert.equal(code(/DEPT OF AGRICULTURE/), "6110");
  assert.equal(code(/ZELLE TRANSFER TO OWNER/), "3100");
});

test("every line has a suggestion and the worked month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 592565);
  assert.equal(Math.round(out * 100), 305280);
  assert.equal(Math.round((out - 900) * 100), 215280);
  assert.equal(Math.round((sales - out + 900) * 100), 377285);
});
