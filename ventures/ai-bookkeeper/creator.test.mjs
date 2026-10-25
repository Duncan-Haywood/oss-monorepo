// A creator's month (fixtures/creator-checking.csv, made up): ad, newsletter, membership,
// affiliate and stream payouts are sales; editing, hosting and email tools are software.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/creator-checking.csv", import.meta.url), "utf8");

test("creator payouts are sales; tools are software; gear is supplies", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/ADSENSE/, /SUBSTACK/, /PATREON/, /AMAZON ASSOCIATES/, /TWITCH/]) assert.equal(code(re), "4000", String(re));
  for (const re of [/ADOBE/, /RIVERSIDE/, /CONVERTKIT/, /EPIDEMIC/]) assert.equal(code(re), "6060", String(re));
  assert.equal(code(/B&H/), "6070");
});
