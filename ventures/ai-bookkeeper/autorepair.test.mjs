// An auto repair shop's month (fixtures/autorepair-checking.csv, made up): Square and fleet-account deposits are sales; parts, tool-truck
// payments are supplies; used-oil pickup is repairs and maintenance; repair-data software is software; bay rent, the ASE fee, the garage policy and the city licence
// each land in their own account; the Zelle to the owner is a draw, not a cost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/autorepair-checking.csv", import.meta.url), "utf8");

test("auto repair lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SQUARE INC DEPOSIT/), "4000");
  assert.equal(code(/FLEET ACCOUNT/), "4000");
  assert.equal(code(/NAPA/), "6100");
  assert.equal(code(/SNAP-ON/), "6100");
  assert.equal(code(/SAFETY-KLEEN/), "6090");
  assert.equal(code(/ALLDATA/), "6060");
  assert.equal(code(/SHOP RENT/), "6080");
  assert.equal(code(/ASE CERT/), "6170");
  assert.equal(code(/LIABILITY/), "6030");
  assert.equal(code(/BUSINESS LICENSE/), "6110");
  assert.equal(code(/GOOGLE ADS/), "6000");
  assert.equal(code(/ZELLE TRANSFER TO OWNER/), "3100");
});

test("every line has a suggestion and the worked month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 684550);
  assert.equal(Math.round(out * 100), 396520);
  assert.equal(Math.round((out - 800) * 100), 316520);
  assert.equal(Math.round((sales - out + 800) * 100), 368030);
});
