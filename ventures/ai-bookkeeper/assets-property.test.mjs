// Property test for fixed assets: seeded random assets and disposals (made up, no outside data).
// Invariants: a full schedule depreciates exactly cost less salvage, accumulated never falls,
// every journal entry balances, a disposal removes the cost and accumulated depreciation
// completely, and the register agrees with the entries.
import test from "node:test";
import assert from "node:assert/strict";
import { schedule, assetEntries, addAsset, disposeAsset, register, booksThrough } from "./assets.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

test("fixed assets hold their invariants on 700 random assets", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 700; i++) {
    const cents = pick(100, 5_000_000_00), salvage = r() < 0.5 ? 0 : pick(0, cents - 1);
    const method = r() < 0.15 ? "expense" : "straight-line", lifeMonths = pick(2, 120);
    const date = iso(pick(2020, 2026), pick(1, 12), pick(1, 28));
    const base = { accounts: [], transactions: [], documents: [] };
    let { books, asset } = addAsset(base, { name: "Thing", date, cost: cents / 100, salvage: salvage / 100, lifeMonths, method });
    const tag = JSON.stringify(asset);
    const full = schedule(asset), total = asset.cents - asset.salvage;
    assert.equal(full.reduce((s, x) => s + x.cents, 0), total, "full schedule depreciates cost less salvage " + tag);
    let prev = 0;
    for (const x of full) { assert.ok(x.cents > 0 && x.accumulated > prev, "accumulated rises " + tag); prev = x.accumulated; }

    const disposeIn = r() < 0.5;
    if (disposeIn) {
      const months = pick(0, lifeMonths + 6), t = (+date.slice(0, 4)) * 12 + (+date.slice(5, 7) - 1) + months;
      const when = iso(Math.floor(t / 12), (t % 12) + 1, pick(1, 28));
      if (when >= date) ({ books } = disposeAsset(books, asset.id, { date: when, proceeds: r() < 0.3 ? 0 : pick(0, cents) / 100 }));
    }
    const entries = assetEntries(books);
    for (const e of entries) {
      assert.equal(e.lines.reduce((s, l) => s + l.debit, 0), e.lines.reduce((s, l) => s + l.credit, 0), "entry balances " + e.id + " " + tag);
      assert.ok(e.lines.every((l) => l.debit >= 0 && l.credit >= 0), tag);
    }
    // net movement of the asset and accumulated accounts across all entries
    const net = (acct) => entries.flatMap((e) => e.lines).filter((l) => l.account === acct).reduce((s, l) => s + l.debit - l.credit, 0);
    const a = books.assets[0], reg = register(books).rows[0];
    if (a.disposed) {
      assert.equal(net("1590"), 0, "accumulated depreciation cleared at disposal " + tag);
      assert.equal(reg.netBookValue, 0, tag);
    } else {
      assert.equal(-net("1590"), reg.accumulated, "register agrees with entries " + tag);
      assert.equal(reg.netBookValue, asset.cents - reg.accumulated, tag);
      assert.ok(reg.accumulated <= total, tag);
    }
    assert.equal(net("6950") , entries.filter((e) => e.source === "depreciation").reduce((s, e) => s + e.lines[0].debit, 0), tag);
    assert.ok(booksThrough(books) >= date, tag);
  }
});
