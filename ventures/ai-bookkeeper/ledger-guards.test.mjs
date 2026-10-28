// Boundary guards found by a red-team campaign on ledger.mjs (2026-10-28): a
// chart row missing only its code or only its name is rejected, and one negative
// amount is rejected even when the entry still balances.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ACCOUNTS, parseAccounts, validateEntry } from "./ledger.mjs";

test("parseAccounts rejects a row missing its name or its code", () => {
  const r = parseAccounts("1000,,asset\n,Cash,asset\n1010,Petty cash,asset");
  assert.deepEqual(r.accounts.map((a) => a.code), ["1010"]);
  assert.equal(r.problems.length, 2);
});

test("validateEntry rejects a single negative amount in a balanced entry", () => {
  const [a, b] = DEFAULT_ACCOUNTS.map((x) => x.code);
  for (const lines of [
    [{ account: a, debit: -100, credit: 0 }, { account: b, debit: 0, credit: -100 }],
    [{ account: a, debit: 0, credit: -100 }, { account: b, debit: -100, credit: 0 }],
  ]) {
    const p = validateEntry({ date: "2026-01-02", lines }, DEFAULT_ACCOUNTS);
    assert.ok(p.some((s) => /whole cents/.test(s)), JSON.stringify(p));
  }
  assert.deepEqual(validateEntry({ date: "2026-01-02", lines: [{ account: a, debit: 100, credit: 0 }, { account: b, debit: 0, credit: 100 }] }, DEFAULT_ACCOUNTS), []);
});
