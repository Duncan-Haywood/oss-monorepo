// A resale-app seller's month (fixtures/reseller-checking.csv, made up): app payouts are sales,
// thrift stops are stock for resale (1450), postage and mailers are expenses. Pins the figures
// on reseller-bookkeeping.html: $710.60 of payouts, $202.40 of stock, 30 of 45 sold.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/reseller-checking.csv", import.meta.url), "utf8");

test("resale payouts are sales; thrift stops are inventory; postage is an expense", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/POSHMARK/, /MERCARI/, /DEPOP/]) assert.equal(code(re), "4000", String(re));
  for (const re of [/GOODWILL/, /SALVATION/, /PLATO/]) assert.equal(code(re), "1450", String(re));
  assert.equal(code(/USPS/), "6070");
  assert.equal(code(/ULINE/), "6100");
});

test("cost of goods sold follows the items sold, not the thrift receipts", () => {
  const books = join(mkdtempSync(join(tmpdir(), "reseller-")), "books.json");
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const run = (...a) => { const r = spawnSync("node", [cli, "--books", books, ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  run("import", new URL("./fixtures/reseller-checking.csv", import.meta.url).pathname, "--account", "1000");
  run("accept", "0.7");
  run("inventory", "buy", "AUG-LOT", "--qty", "45", "--amount", "202.40", "--date", "2026-08-19");
  run("inventory", "sell", "AUG-LOT", "--qty", "30", "--date", "2026-08-31");
  const out = run("report");
  assert.match(out, /Sales\s+710\.60/);
  assert.match(out, /Cost of goods sold\s+134\.93/);
  assert.match(out, /Net profit\s+496\.62/);
  assert.match(out, /Inventory\s+67\.47/);
  assert.match(out, /Cash from operations\s+429\.15/);
});
