// A home inspector's month (fixtures/inspector-checking.csv, made up): software payouts are sales; report software is software;
// the thermal camera is equipment; the state licence is a licence; the Zelle to the owner is a draw.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/inspector-checking.csv", import.meta.url), "utf8");

test("inspector lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SPECTORA PAYMENTS/), "4000");
  assert.equal(code(/SPECTORA SOFTWARE/), "6060");
  assert.equal(code(/INTERNACHI/), "6170");
  assert.equal(code(/HOMEGUARD/), "6030");
  assert.equal(code(/FLIR/), "6070");
  assert.equal(code(/LICENSE RENEWAL/), "6110");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/ZELLE TO OWNER/), "3100");
});

test("every line has a suggestion and the worked month sums", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 608550);
  assert.equal(Math.round(out * 100), 374740);
  assert.equal(Math.round((sales - out + 1200) * 100), 353810);
});
