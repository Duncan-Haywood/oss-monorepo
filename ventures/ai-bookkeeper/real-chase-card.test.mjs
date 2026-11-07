// Descriptors seen in a real person's Chase card export (eval/billcat-card.mjs,
// blakeb211/billcat-local-llm); each line below is written here, not copied.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents = -2500) => suggest({ desc, cents }, model).account;

test("US regional restaurant chains are meals", () => {
  for (const d of ["FREDDY'S 90-0006", "SKYLINE CHILI 15", "GOLD STAR CHILI MAINEVILL", "TEXAS ROADHOUSE #2805", "CHEESECAKE LIBERTY CNTR", "GRAETERS13", "AUNTIE ANNE'S OH123", "EB MAGGIANOS CINCINNA"]) assert.equal(acct(d), "6130", d);
});
test("regional fuel stops and street parking are vehicle and fuel", () => {
  for (const d of ["UNITED DAIRY FARMERS", "BROOKVILLE COUNTRYMARK", "RACEWAY 6819  14268197", "TOM THUMB #0103", "PARKMOBILE"]) assert.equal(acct(d), "6160", d);
});
test("streaming subscriptions and resort stays", () => {
  assert.equal(acct("DisneyPLUS"), "6060");
  assert.equal(acct("DISNEY RESORTS-WDTC"), "6120");
});
test("unknown local restaurants stay blank rather than guessed", () => {
  assert.equal(acct("SUPER WOK"), null);
  assert.equal(acct("FIVE STAR FOOD"), null);
});
