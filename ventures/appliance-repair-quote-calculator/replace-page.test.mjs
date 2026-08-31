import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareServiceCallVsReplace } from "./calc.mjs";

const seo = readFileSync(new URL("./should-i-repair-or-replace-this-appliance.html", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

const quote = {
  diagnosticHours: 0.5,
  repairHours: 1.5,
  travelHours: 0.5,
  laborRate: 80,
  tripCost: 35,
  partsCost: 120,
  partsMarkup: 25,
  callbackReserve: 5,
  overheadRate: 10,
  targetMargin: 30,
};

test("SEO page carries the no-warranty clause and the locked default", () => {
  assert.match(seo, /No warranty/i);
  assert.match(seo, /not financial or business advice/i);
  assert.match(seo, /GitHub Sponsors/);
  assert.match(seo, /\$635\.25/);
  assert.match(seo, /\$211\.75/);
  assert.match(seo, /\$79\.90/);
  const comparison = compareServiceCallVsReplace(quote, {
    replacementPrice: 799,
    remainingRepairYears: 3,
    remainingReplaceYears: 10,
    diagnosticCollected: 75,
    yourReplaceProfit: 0,
  });
  assert.equal(comparison.customerBetter, "replace");
  assert.match(seo, /\$131\.85 a year cheaper/);
  assert.match(seo, /eight years/);
});

test("index wires the comparison and the SEO back-link", () => {
  assert.match(index, /compareServiceCallVsReplace/);
  assert.match(index, /serviceCallVsReplaceNote/);
  assert.match(index, /should-i-repair-or-replace-this-appliance\.html/);
  assert.match(index, /id="replacementPrice"/);
  assert.match(index, /id="replaceVerdict"/);
  assert.match(index, /replace_compared/);
});
