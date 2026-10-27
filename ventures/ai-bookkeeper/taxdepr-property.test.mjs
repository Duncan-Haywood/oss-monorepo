// Property test for tax depreciation: seeded random assets (made up, no outside data).
// Invariants: with no disposal the years add to the cost exactly (half-year and mid-quarter),
// no year is negative, 179 and bonus fall only in year one, and a disposed asset takes
// nothing after its disposal year and never more than its cost.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addAsset, disposeAsset } from "./assets.mjs";
import { setTaxTreatment, assetTaxYear, CLASSES } from "./taxdepr.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

test("tax depreciation holds its invariants on 600 random assets", () => {
  const r = rng(20261028), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 600; i++) {
    const cents = pick(100, 3_000_000_00), y0 = pick(2022, 2026);
    const date = iso(y0, pick(1, 12), pick(1, 28));
    const s179 = r() < 0.4 ? pick(0, cents) : 0;
    const tax = { macrsClass: CLASSES[pick(0, CLASSES.length - 1)], s179, bonusPct: r() < 0.5 ? [0, 20, 40, 60, 80, 100][pick(0, 5)] : 0 };
    let b = addAsset(newBooks(), { name: "M", date, cost: cents / 100, lifeMonths: 60 }).books;
    b = setTaxTreatment(b, "FA-1", tax).books;
    const tag = JSON.stringify({ date, cents, tax });
    const years = (a, mq) => Array.from({ length: 24 }, (_, k) => assetTaxYear(a, y0 + k, mq));
    for (const mq of [false, true]) {
      const ys = years(b.assets[0], mq);
      assert.equal(ys.reduce((s, x) => s + x.total, 0), cents, `years add to cost (mq=${mq}) ${tag}`);
      assert.ok(ys.every((x) => x.s179 >= 0 && x.bonus >= 0 && x.macrs >= 0), "no negative year " + tag);
      assert.ok(ys.slice(1).every((x) => x.s179 === 0 && x.bonus === 0), "179 and bonus only in year one " + tag);
    }
    if (r() < 0.5) {
      const dy = y0 + pick(0, 6), when0 = iso(dy, pick(1, 12), pick(1, 28)), when = when0 < date ? date : when0;
      const d = disposeAsset(b, "FA-1", { date: when }).books;
      for (const mq of [false, true]) {
        const ys = years(d.assets[0], mq);
        assert.ok(ys.slice(dy - y0 + 1).every((x) => x.total === 0), `nothing after disposal ${tag} ${when}`);
        assert.ok(ys.reduce((s, x) => s + x.total, 0) <= cents, "never more than cost " + tag);
      }
    }
  }
});
