import { test } from "node:test";
import assert from "node:assert/strict";
import { sensitivity, restack } from "./sensitivity.mjs";

// Property test: random invented budgets. Each stacked figure is recomputed
// here by hand from the section subtotals and the rates, and the swing rows must
// obey the obvious ordering and break-even laws.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const cents = (n) => Math.round(n * 100) / 100;
const NAMES = ["Lumber", "Sheathing", "Roofing", "Labor", "Allowances", "Fasteners"];

function stack(sections, b) {
  let mat = 0, rest = 0;
  for (const s of sections) (s.name === "Labor" || s.name === "Allowances" ? (rest += s.subtotal) : (mat += s.subtotal));
  const tax = mat * b.taxRate, cont = (mat + tax) * b.contingencyRate;
  const total = mat + tax + cont + rest;
  const oh = total * b.overheadRate;
  return { total: cents(total), bid: cents(total + oh + (total + oh) * b.profitRate) };
}

test("fuzz: sensitivity rows match a hand restack and obey the ordering and break-even laws", () => {
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const sections = NAMES.filter(() => rand() < 0.75).map((name) => ({ name, subtotal: rand() < 0.15 ? 0 : cents(rand() * 50000) }));
    const b = { sections, taxRate: cents(rand() * 0.1), contingencyRate: cents(rand() * 0.15), overheadRate: cents(rand() * 0.2), profitRate: cents(rand() * 0.2) };
    const base = stack(sections, b);
    b.profit = cents(base.bid - base.total) * (rand() < 0.2 ? 0 : 1);
    const pct = 1 + Math.floor(rand() * 60);
    let sv;
    try { sv = sensitivity(b, pct); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    const f = (m) => failures.push(`seed ${seed}: ${m}`);
    if (Math.abs(restack(b).bid - base.bid) > 0.011 || Math.abs(restack(b).total - base.total) > 0.011) f("0% restack differs from hand stack");
    if (sv.rows.length !== sections.filter((s) => s.subtotal > 0).length) f("rows are not exactly the priced sections");
    for (let i = 1; i < sv.rows.length; i++) if (sv.rows[i - 1].bidUp < sv.rows[i].bidUp) f("rows not sorted by bidUp");
    for (const r of sv.rows) {
      const up = stack(sections.map((s) => (s.name === r.section ? { ...s, subtotal: s.subtotal * (1 + pct / 100) } : s)), b);
      if (Math.abs(r.bidUp - (up.bid - base.bid)) > 0.02) f(`${r.section} bidUp ${r.bidUp} != hand ${up.bid - base.bid}`);
      if (r.bidUp < 0 || r.bidDown > 0) f(`${r.section} swing has the wrong sign`);
      if (b.profit > 0 && r.costUp > 0) {
        if (r.profitAbsorbsPct == null) f(`${r.section} has no break-even`);
        else if (Math.abs((r.costUp / pct) * r.profitAbsorbsPct - b.profit) > 0.02 * b.profit + 0.05) f(`${r.section} break-even does not use up the profit`);
      } else if (r.profitAbsorbsPct != null) f(`${r.section} break-even given with no profit or no cost rise`);
    }
    if (sv.allUp.bid + 0.02 < Math.max(0, ...sv.rows.map((r) => base.bid + r.bidUp))) f("everything up is below one section up");
  }
  assert.deepEqual(failures.slice(0, 5), []);
});
