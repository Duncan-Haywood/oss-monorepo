// Seeded property test for invoices, bills, credit notes, part-payments and write-offs.
// Random documents and bank lines, made up, no outside data. Invariants: the journal
// balances, and what aging says is open on receivable (payable) equals the net on the
// control account 1100 (2050), so the ledger and the aging report never disagree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal, addDocuments, aging, writeOff } from "./engine.mjs";
import { trialBalance } from "./ledger.mjs";

const rng = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); };
const f = (c) => (c / 100).toFixed(2);
const net = (j, c) => j.flatMap((x) => x.lines).filter((l) => l.account === c).reduce((n, l) => n + l.debit - l.credit, 0);
const day = (n) => `2026-${String(1 + Math.floor(n / 28)).padStart(2, "0")}-${String(1 + (n % 28)).padStart(2, "0")}`;

test("documents, payments, credits and write-offs keep ledger and aging in agreement", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 400; i++) {
    const docs = [], pays = [];
    const n = pick(1, 6);
    for (let k = 0; k < n; k++) {
      const invoice = r() < 0.6, cents = pick(100, 2_000_000), num = `${invoice ? "I" : "B"}${k + 1}`, d = pick(0, 40);
      docs.push({ invoice, cents, num, d });
      const roll = r();
      if (roll < 0.35) pays.push([d + pick(0, 30), invoice, cents, `PAYMENT ${num}`]);
      else if (roll < 0.6) pays.push([d + pick(0, 30), invoice, Math.max(1, Math.round(cents * r())), `PART PAYMENT ${num}`]);
    }
    let csv = "type,number,date,party,amount,account,against\n";
    for (const x of docs) csv += `${x.invoice ? "invoice" : "bill"},${x.num},${day(x.d)},Party ${x.num},${f(x.cents)},${x.invoice ? 4000 : 6100},\n`;
    const credit = docs.find((x) => x.invoice && r() < 0.5);
    if (credit) csv += `credit note,C1,${day(credit.d + pick(0, 10))},Party ${credit.num},${f(pick(1, credit.cents))},4000,${credit.num}\n`;
    const bank = pays.sort((a, b) => a[0] - b[0]).map(([d, inv, c, desc]) => `${day(d)},${desc},${f(inv ? c : -c)}`).join("\n");
    const tag = JSON.stringify({ docs, pays, credit: credit?.num });
    let books = addDocuments(newBooks(), csv).books;
    if (bank) books = importStatement(books, `Date,Description,Amount\n${bank}\n`, "1000").books;
    books = addDocuments(books, "").books;
    if (r() < 0.3) { const open = aging(books).open.find((o) => !o.credit); if (open) books = writeOff(books, open.id, { date: "2026-12-28" }).books; }
    const j = journal(books);
    assert.ok(trialBalance(j, books.accounts).balanced, "unbalanced " + tag);
    const ag = aging(books, "2026-12-31");
    assert.equal(net(j, "1100"), ag.receivable.total, "receivable ledger vs aging " + tag);
    assert.equal(0 - net(j, "2050"), ag.payable.total, "payable ledger vs aging " + tag);
    assert.ok(ag.open.every((o) => o.credit || o.total > 0), "open balance positive " + tag);
  }
});
