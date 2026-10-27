// A freelancer's quarter (fixtures/freelancer-checking.csv, made up): client payments are sales,
// the IRS estimated-tax debits stay in review (the same descriptor can be a payroll deposit) and
// are filed by hand as owner draws, not expenses. Pins the figures on
// freelancer-bookkeeping.html: $16,730.00 of sales, $15,345.71 profit, $3,600.00 of tax paid.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { newBooks, importStatement } from "./engine.mjs";

const file = new URL("./fixtures/freelancer-checking.csv", import.meta.url).pathname;

test("client payments are sales; IRS payments are left for you to file", () => {
  const b = importStatement(newBooks(), readFileSync(file, "utf8"), "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/ACME/, /WISE PAYOUT/, /UPWORK/]) assert.equal(code(re), "4000", String(re));
  assert.equal(code(/USATAXPYMT/) ?? null, null);
  assert.equal(code(/WEWORK/), "6080");
});

test("profit is before the tax payments, and the estimate plans the two dates still ahead", () => {
  const books = join(mkdtempSync(join(tmpdir(), "freelancer-")), "books.json");
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const run = (...a) => { const r = spawnSync("node", [cli, "--books", books, ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  run("import", file, "--account", "1000");
  run("accept", "0.7");
  const ids = run("review").split("\n").filter((l) => /USATAXPYMT/.test(l)).map((l) => l.split(/\s+/)[0]);
  assert.equal(ids.length, 2);
  run("confirm", ...ids.map((id) => `${id}=3100`));
  const out = run("report");
  assert.match(out, /Sales\s+16,730\.00/);
  assert.match(out, /Net profit\s+15,345\.71/);
  assert.match(out, /Owner draws\s+-3,600\.00/);
  const est = run("estimate", "--year", "2026", "--months", "3", "--filing", "single", "--paid", "3600", "--as-of", "2026-06-16");
  assert.match(est, /Total\s+12,355\.95/);
  assert.match(est, /2026-09-15\s+3,760\.18/);
  assert.match(est, /2027-01-15\s+3,760\.18/);
});
