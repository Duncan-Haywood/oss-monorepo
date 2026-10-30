// A private-practice therapist's month (fixtures/therapist-checking.csv, made up): insurance-panel and client payments are
// sales; the EHR, rent, malpractice cover, CE, supervision, dues, a directory listing and the board licence each land in
// their own account; the Amazon buy is left for the therapist; the Venmo cash-out is an owner draw, not a cost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/therapist-checking.csv", import.meta.url), "utf8");

test("therapist lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/HEADWAY/), "4000");
  assert.equal(code(/SIMPLEPRACTICE CLIENT/), "4000");
  assert.equal(code(/ALMA/), "4000");
  assert.equal(code(/SIMPLEPRACTICE SUBSCRIPTION/), "6060");
  assert.equal(code(/SUBLEASE/), "6080");
  assert.equal(code(/MALPRACTICE/), "6030");
  assert.equal(code(/CE COURSE/), "6170");
  assert.equal(code(/SUPERVISION/), "6170");
  assert.equal(code(/PSYCHOLOGICAL ASSOC/), "6170");
  assert.equal(code(/PSYCHOLOGY TODAY/), "6000");
  assert.equal(code(/BOARD LICENSE/), "6110");
  assert.equal(code(/VENMO CASHOUT/), "3100");
});

test("only the Amazon buy is left blank and the worked month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const blank = b.transactions.filter((t) => !t.suggestion?.account);
  assert.equal(blank.length, 1);
  assert.match(blank[0].desc ?? blank[0].description, /AMAZON/);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 407500);
  assert.equal(Math.round((out - 500) * 100), 136144);
  assert.equal(Math.round((sales - out + 500) * 100), 271356);
});
