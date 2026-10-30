// A plumbing/HVAC contractor's month (fixtures/trades-checking.csv, made up): field-service app
// payouts are sales; supply houses and tools are supplies; the dispatch app is software.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/trades-checking.csv", import.meta.url), "utf8");

test("trades: app payouts are sales; supply houses are supplies; lead sites are marketing", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/JOBBER/, /HOUSECALL/, /ANGI/]) assert.equal(code(re), "4000", String(re));
  for (const re of [/FERGUSON/, /JOHNSTONE/, /HOME DEPOT/, /MILWAUKEE/]) assert.equal(code(re), "6100", String(re));
  assert.equal(code(/SERVICETITAN/), "6060");
  assert.equal(code(/THUMBTACK/), "6000");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/PERMIT/), "6110");
});
