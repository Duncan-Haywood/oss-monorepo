// pairTransfers scans each inflow's date window instead of every outflow
// (docs/history/ci-perf-2026-11-19-bookkeeper-transfer-window.md). This pins it
// to the all-pairs loop it replaced: same pairs, same order, same count, on
// random books with several bank accounts, foreign lines, bad dates and odd
// `days` values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pairTransfers } from "./engine.mjs";

const TOL = 0.03, FX = "6190";
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
function allPairs(books, days) {
  const open = books.transactions.filter((t) => t.status !== "confirmed" && t.status !== "transfer" && t.status !== "split");
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const ins = open.filter((t) => t.cents > 0 && bank.has(t.account)), outs = open.filter((t) => t.cents < 0 && bank.has(t.account));
  const used = new Set(), pairs = [];
  for (const a of ins) for (const b of outs) {
    if (a.account === b.account) continue;
    const diff = Math.abs(a.cents + b.cents);
    if (diff !== 0) {
      if (!a.foreign && !b.foreign) continue;
      if (a.foreign && b.foreign && a.foreign.currency === b.foreign.currency && a.foreign.cents + b.foreign.cents !== 0) continue;
      if (diff > Math.max(a.cents, -b.cents) * TOL) continue;
    }
    const gap = Math.abs(dayNum(a.date) - dayNum(b.date));
    if (gap <= days) pairs.push([gap, diff, a, b]);
  }
  pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (const [, , a, b] of pairs) {
    if (used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id); used.add(b.id);
    if (a.cents + b.cents !== 0 && !books.accounts.some((x) => x.code === FX)) books.accounts.push({ code: FX, name: "Foreign exchange gain or loss", type: "expense" });
    a.status = b.status = "transfer"; a.pair = b.id; b.pair = a.id; a.posted = b.account; b.posted = a.account;
    delete a.suggestion; delete b.suggestion;
  }
  return pairs.length;
}

function randomBooks(r) {
  const n = 1 + Math.floor(r() * 4), accounts = [];
  for (let k = 0; k < n; k++) accounts.push({ code: String(1000 + k), name: "a" + k, type: "asset", bank: r() < 0.85 });
  accounts.push({ code: "6000", name: "x", type: "expense" });
  if (r() < 0.2) accounts.push({ code: FX, name: "fx", type: "expense" });
  const amts = [100, 250, 999, 1000, 5000, 1030], transactions = [];
  for (let i = 0, m = Math.floor(r() * 60); i < m; i++) {
    const t = { id: "t" + i, account: r() < 0.95 ? String(1000 + Math.floor(r() * n)) : "6000", date: r() < 0.03 ? "not a date" : `2025-0${1 + Math.floor(r() * 2)}-${String(1 + Math.floor(r() * 25)).padStart(2, "0")}`, desc: "d", cents: (r() < 0.5 ? 1 : -1) * amts[Math.floor(r() * amts.length)], status: ["new", "review", "auto", "confirmed", "transfer", "split"][Math.floor(r() * (r() < 0.8 ? 3 : 6))] };
    if (r() < 0.2) t.foreign = { currency: r() < 0.5 ? "EUR" : "GBP", cents: t.cents + (r() < 0.5 ? 0 : 7) };
    if (r() < 0.3) t.suggestion = { account: "6000" };
    transactions.push(t);
  }
  return { accounts, transactions };
}

test("windowed pairTransfers matches the all-pairs loop on 1,500 random books", () => {
  let seed = 1; const r = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  let paired = 0;
  for (let c = 0; c < 1500; c++) {
    const want = randomBooks(r), got = structuredClone(want);
    const days = [5, 0, 2, 31, "5", 1.5, -1, Infinity][Math.floor(r() * 8)];
    const nWant = allPairs(want, days), nGot = pairTransfers(got, days);
    assert.equal(nGot, nWant, `case ${c}, days ${days}`);
    assert.deepEqual(got, want, `case ${c}, days ${days}`);
    paired += got.transactions.filter((t) => t.status === "transfer" && t.pair).length;
  }
  assert.ok(paired > 1000, `the random books should pair plenty of transfers (${paired})`);
});

test("a tie in gap and amount goes to the earlier inflow, then the earlier outflow", () => {
  const books = { accounts: [{ code: "1000", bank: true }, { code: "1010", bank: true }], transactions: [
    { id: "out-late-listed", account: "1010", date: "2025-03-03", cents: -500, status: "new" },
    { id: "in-1", account: "1000", date: "2025-03-02", cents: 500, status: "new" },
    { id: "out-early-listed", account: "1010", date: "2025-03-01", cents: -500, status: "new" },
    { id: "in-2", account: "1000", date: "2025-03-02", cents: 500, status: "new" },
  ] };
  const want = structuredClone(books);
  allPairs(want, 5); pairTransfers(books, 5);
  assert.deepEqual(books, want);
  assert.equal(books.transactions[1].pair, "out-late-listed");
});
