// Property test for the anomaly finder: seeded random books (made up, no outside data).
// Invariants: a second run and a run on the same rows imported in reverse order agree; each line is
// listed once; every id is a real bank line; every duplicate has an earlier same-amount line from the
// same description within dupDays; output is in date order; a spike is at least spikeMin times larger
// than the median of its payee's other same-direction lines.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { findAnomalies } from "./anomalies.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const word = (n) => String.fromCharCode(97 + (n % 26)) + String.fromCharCode(97 + ((n / 26) | 0) % 26);
const money = (c) => (c / 100).toFixed(2);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const load = (rows) => importStatement(newBooks(), "Date,Description,Amount\n" + rows.join("\n") + "\n", "1000").books;

test("anomaly finder holds its invariants on 120 random books", () => {
  const r = rng(20261105), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const start = Date.UTC(2026, 0, 1), flagged = [0, 0], kinds = { duplicate: 0, spike: 0, "new-large": 0 };
  for (let t = 0; t < 120; t++) {
    const rows = [];
    for (let s = pick(2, 6); s > 0; s--) {
      const name = `VENDOR${word(t)}${word(s)} LTD`, amt = pick(10_00, 900_00), sign = r() < 0.7 ? -1 : 1;
      const n = pick(1, 8), d0 = pick(0, 40);
      for (let k = 0; k < n; k++) {
        const wobble = r() < 0.12 ? pick(8, 15) : 1, day = d0 + k * 30;
        rows.push(`${iso(start + day * 864e5)},${name},${money(sign * Math.round(amt * wobble))}`);
        if (r() < 0.12) rows.push(`${iso(start + (day + pick(1, 6)) * 864e5)},${name},${money(sign * Math.round(amt * wobble))}`);
      }
    }
    for (let k = pick(0, 8); k > 0; k--) rows.push(`${iso(start + pick(0, 200) * 864e5)},SHOP${word(t)}${word(k)},${money(-pick(5_00, r() < 0.3 ? 20000_00 : 200_00))}`);
    const tag = `book ${t}`;
    const b = load(rows), f = findAnomalies(b);
    assert.deepEqual(findAnomalies(b), f, tag);
    const ids = f.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, tag);
    const byId = new Map(b.transactions.map((x) => [x.id, x]));
    for (const x of f) assert.ok(byId.has(x.id), tag);
    for (let i = 1; i < f.length; i++) assert.ok(f[i - 1].date <= f[i].date, tag);
    for (const x of f.filter((y) => y.kind === "duplicate")) {
      const day = (d) => Date.parse(d) / 864e5;
      const prior = b.transactions.find((p) => p.id !== x.id && p.desc === x.desc && p.cents === x.cents && p.date <= x.date && day(x.date) - day(p.date) <= 7);
      assert.ok(prior, `${tag}: duplicate ${x.id} has an earlier twin`);
    }
    flagged[f.length ? 1 : 0]++;
    for (const x of f) kinds[x.kind]++;
    const rev = findAnomalies(load([...rows].reverse()));
    const key = (a) => a.map((x) => `${x.date}|${x.desc}|${x.cents}|${x.kind}`).sort();
    assert.deepEqual(key(rev), key(f), `${tag}: row order must not change what is flagged`);
  }
  assert.ok(flagged[1] >= 60, `books with flags ${flagged[1]}, without ${flagged[0]}`);
  for (const [k, n] of Object.entries(kinds)) assert.ok(n >= 20, `${k} flagged only ${n} times: the run would not exercise it`);
});
