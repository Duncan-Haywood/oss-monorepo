// A mobile notary's month (fixtures/notary-checking.csv, made up): title-company platform payouts are sales; NNA dues, E&O cover, the stamp, the state commission and the signing software land in their own accounts
// (the older bare "notary" rule would have filed all of them as legal and professional fees); the Zelle to the owner is a draw. Every line gets a suggestion.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/notary-checking.csv", import.meta.url), "utf8");

test("notary lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SNAPDOCS PAYOUT/), "4000");
  assert.equal(code(/NOTARY GO/), "4000");
  assert.equal(code(/SIGNINGORDER/), "4000");
  assert.equal(code(/NATIONAL NOTARY ASSOCIATION/), "6170");
  assert.equal(code(/NOTARY E&O/), "6030");
  assert.equal(code(/SNAPDOCS MONTHLY/), "6060");
  assert.equal(code(/STAMP AND SEAL/), "6100");
  assert.equal(code(/SHELL OIL/), "6160");
  assert.equal(code(/NOTARY COMMISSION/), "6110");
  assert.equal(code(/ZELLE TRANSFER TO OWNER/), "3100");
});

test("nothing is left for review and the month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 281250);
  assert.equal(Math.round((out - 900) * 100), 55869);
  assert.equal(Math.round((sales - out + 900) * 100), 225381);
});
