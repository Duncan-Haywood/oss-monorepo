// Seeded property test for foreign invoices and bills paid in base currency.
// Random amounts, rates and instalment splits; documents made up, no outside data.
// Invariants: the journal always balances (even when a payment is not matched),
// and a document that settles leaves nothing on its control account.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal, addDocuments } from "./engine.mjs";
import { setRates, parseRates } from "./fx.mjs";
import { trialBalance } from "./ledger.mjs";

const rng = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); };
const f = (c) => (c / 100).toFixed(2);
const net = (j, c) => j.flatMap((x) => x.lines).filter((l) => l.account === c).reduce((n, l) => n + l.debit - l.credit, 0);

function run(r, { drift }) {
  const rate1 = Number((0.5 + r() * 1.5).toFixed(4));
  const rate2 = Number((rate1 * (1 - drift + r() * 2 * drift)).toFixed(4));
  const amt = Math.round(100 + r() * 5e6), invoice = r() < 0.5, n = 1 + Math.floor(r() * 3);
  let rem = amt; const pays = [];
  for (let k = 0; k < n; k++) { const p = k === n - 1 ? rem : Math.max(1, Math.round(rem * r())); rem -= p; pays.push(p); }
  const sign = invoice ? 1 : -1;
  const lines = pays.map((p, k) => `2026-02-${String(3 + k * 5).padStart(2, "0")},WIRE CLIENT GMBH E1,${f(sign * Math.round(p * rate2))}`).join("\n");
  const b = setRates(newBooks(), parseRates(`2026-01-01,EUR,${rate1}\n2026-02-01,EUR,${rate2}`).rates);
  const d = addDocuments(b, `type,number,date,party,amount,account,currency\n${invoice ? "invoice" : "bill"},E1,2026-01-05,Client GmbH,${f(amt)},${invoice ? 4000 : 6100},EUR\n`);
  const b2 = addDocuments(importStatement(d.books, `Date,Description,Amount\n${lines}\n`, "1000").books, "").books;
  const j = journal(b2);
  const ctx = JSON.stringify({ rate1, rate2, amt, invoice, pays });
  assert.ok(trialBalance(j, b2.accounts).balanced, `unbalanced ${ctx}`);
  if (b2.documents[0].settledBy) assert.equal(net(j, invoice ? "1100" : "2050"), 0, `settled but control not cleared ${ctx}`);
}

for (const [name, drift] of [["rates within 3%", 0.03], ["rates up to 40% apart", 0.4]]) {
  test(`foreign document paid in instalments, ${name}`, () => {
    const r = rng(20261027);
    for (let i = 0; i < 400; i++) run(r, { drift });
  });
}
