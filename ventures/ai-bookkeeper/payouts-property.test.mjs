// Property test for payout splitting: seeded random Stripe-style reports and bank lines (made up, no outside
// data). Invariants: every matched payout's parts add up to its net, posting keeps the journal balanced, the
// bank account gains exactly the matched nets, each bank line is used once, and a second plan finds nothing to split.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal } from "./engine.mjs";
import { balances } from "./ledger.mjs";
import { readPayoutReport, planPayouts, applyPayouts } from "./payouts.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const money = (c) => (c / 100).toFixed(2);
const CATS = ["charge", "charge", "charge", "refund", "dispute", "stripe_fee", "adjustment", "topup", "tax"];

test("payout splits hold their invariants on 150 random reports", () => {
  const r = rng(20261030), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let t = 0; t < 150; t++) {
    const lines = ["automatic_payout_id,automatic_payout_effective_at,balance_transaction_id,created,reporting_category,gross,fee,net,description"];
    const bank = [], nets = [];
    const n = pick(1, 5);
    for (let p = 0; p < n; p++) {
      const day = String(1 + p * 4).padStart(2, "0"), rows = [];
      let net = 0;
      const first = pick(50_00, 900_00), f0 = pick(0, Math.floor(first / 10));
      rows.push(["charge", first, f0]); net += first - f0;
      for (let k = pick(0, 6); k > 0; k--) {
        const cat = CATS[pick(0, CATS.length - 1)], g = pick(1_00, 300_00) * (cat === "charge" ? 1 : -1), f = cat === "charge" ? pick(0, 9_00) : 0;
        rows.push([cat, g, f]); net += g - f;
      }
      rows.forEach(([cat, g, f], i) => lines.push(`po_${t}_${p},2026-03-${day},txn_${t}_${p}_${i},2026-03-${day},${cat},${money(g)},${money(f)},${money(g - f)},x`));
      nets.push(net);
      // Distinct amounts so a bank line cannot match two payouts.
      if (net > 0 && !nets.slice(0, -1).includes(net)) bank.push(`2026-03-${String(1 + p * 4 + pick(0, 3)).padStart(2, "0")},PAYOUT ${p},${money(net)}`);
    }
    const tag = `report ${t}`;
    const b = importStatement(newBooks(), "Date,Description,Amount\n" + (bank.join("\n") || "2026-02-01,X,-1.00") + "\n", "1000").books;
    const rep = readPayoutReport(lines.join("\n") + "\n");
    assert.deepEqual(rep.problems, [], tag);
    const plan = planPayouts(b, rep);
    const used = new Set();
    for (const m of plan.matched) {
      assert.equal(m.parts.reduce((a, x) => a + x.cents, 0), m.net, "parts add to net " + tag);
      assert.ok(!used.has(m.line), "bank line used once " + tag);
      used.add(m.line);
    }
    const { books: after } = applyPayouts(b, plan);
    const bal = balances(journal(after));
    assert.equal([...bal.values()].reduce((a, x) => a + x, 0), 0, "journal balanced " + tag);
    assert.equal(bal.get("1000") ?? 0, plan.matched.reduce((a, m) => a + m.net, 0), "bank gains the matched nets " + tag);
    assert.equal(planPayouts(after, rep).matched.length, 0, "nothing left to split " + tag);
  }
});
