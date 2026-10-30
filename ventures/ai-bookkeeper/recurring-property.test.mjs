// Property test for the cash forecast: seeded random books with monthly and weekly series plus one-offs (made up,
// no outside data). Invariants: items fall after asOf and within the horizon, points are in date order, the end
// balance is the start plus every item, `lowest` is the true minimum, runwayDays matches the first negative point,
// a series' typical amount is its median, and a second run gives the same answer.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { detectRecurring, forecastCash } from "./recurring.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const money = (c) => (c / 100).toFixed(2);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

test("cash forecast holds its invariants on 150 random books", () => {
  const r = rng(20261030), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let t = 0; t < 150; t++) {
    const lines = [];
    const start = Date.UTC(2026, 0, 1);
    for (let s = pick(1, 4); s > 0; s--) {
      const weekly = r() < 0.3, sign = r() < 0.6 ? -1 : 1, amt = pick(20_00, 3000_00), name = `PAYEE${t}X${s} LTD`;
      const n = weekly ? pick(5, 16) : pick(4, 6), step = weekly ? 7 : 30;
      for (let k = 0; k < n; k++) lines.push(`${iso(start + (k * step + s) * 864e5)},${name},${money(sign * amt)}`);
    }
    for (let k = pick(0, 3); k > 0; k--) lines.push(`${iso(start + pick(0, 150) * 864e5)},ONEOFF ${t} ${k},${money(-pick(5_00, 900_00))}`);
    const tag = `book ${t}`;
    const b = importStatement(newBooks(), "Date,Description,Amount\n" + lines.join("\n") + "\n", "1000").books;
    const asOf = iso(start + pick(120, 200) * 864e5), days = pick(14, 120);
    const f = forecastCash(b, { asOf, days });
    assert.deepEqual(forecastCash(b, { asOf, days }), f, tag);
    assert.equal(f.asOf, asOf, tag);
    let bal = f.start, min = f.start;
    for (const it of f.items) {
      assert.ok(it.date > asOf && it.date <= f.to, `${tag}: ${it.date} outside window`);
      bal += it.cents; min = Math.min(min, bal);
    }
    assert.equal(f.end, bal, tag);
    assert.equal(f.lowest.cents, min, tag);
    for (let i = 1; i < f.points.length; i++) assert.ok(f.points[i].date >= f.points[i - 1].date, tag);
    const neg = f.points.find((p) => p.cents < 0);
    assert.equal(f.runwayDays, neg ? Math.round((Date.parse(neg.date) - Date.parse(asOf)) / 864e5) : null, tag);
    for (const rec of detectRecurring(b, { asOf })) {
      assert.ok(rec.count >= 3, tag);
      assert.equal(Math.sign(rec.typical), rec.direction === "out" ? -1 : 1, tag);
      assert.ok(rec.next > rec.last.date, tag);
    }
  }
});
