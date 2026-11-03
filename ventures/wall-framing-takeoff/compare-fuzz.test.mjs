import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetDiff, diffText } from "./compare.mjs";

// Property test for the change-order diff: random budgets (invented lines, some
// unpriced, lumber names carrying "(N lengths)"). A budget against itself shows
// no line; swapping the two plans negates every priced difference; a line's
// difference is its after minus before; section deltas add up to the priced
// line deltas; a half-priced line is listed, never netted; text builds.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const SECTIONS = ["Lumber", "Sheathing", "Hardware", "Labor"];
const cents = (x) => Math.round(x * 100) / 100;

function budgetOf(rand, items) {
  const lines = [];
  for (const [section, base] of items) {
    if (rand() < 0.2) continue;
    const lumber = section === "Lumber";
    const item = lumber ? `${base} (${1 + Math.floor(rand() * 20)} lengths)` : base;
    const qty = cents(Math.floor(rand() * 400) / 4);
    const amount = rand() < 0.15 ? null : cents(qty * (1 + rand() * 30));
    lines.push({ section, item, unit: lumber ? "boards" : "ea", qty, amount });
  }
  const materials = cents(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
  const total = cents(materials * 1.1);
  return { lines, materials, tax: 0, contingency: cents(materials * 0.1), labor: 0, allowances: 0, total, overhead: 0, profit: 0, bid: total };
}

test("fuzz: change-order diff is antisymmetric, nets priced lines, lists unpriced ones", () => {
  const failures = [];
  let changed = 0, halfPriced = 0, paired = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const tag = `seed ${seed}`;
    const items = [];
    const n = 3 + Math.floor(rand() * 12);
    for (let i = 0; i < n; i++) items.push([SECTIONS[Math.floor(rand() * SECTIONS.length)], `Item ${i}`]);
    const a = budgetOf(rand, items), b = budgetOf(rand, items);

    const same = budgetDiff(a, a);
    if (same.lines.length || same.totals.total.delta !== 0 || same.unpricedChanges.length) failures.push(`${tag}: self-diff not empty`);

    const ab = budgetDiff(a, b), ba = budgetDiff(b, a);
    if (ab.lines.length !== ba.lines.length) failures.push(`${tag}: swap changes line count ${ab.lines.length} vs ${ba.lines.length}`);
    for (const l of ab.lines) {
      if (l.status === "changed") changed++;
      if (l.dAmount == null) halfPriced++;
      if (l.status === "changed" && /Lumber/.test(l.section)) paired++;
      if (Math.abs(l.dQty - cents(l.qtyAfter - l.qtyBefore)) > 0.011) failures.push(`${tag}: dQty wrong on ${l.item}`);
      const m = ba.lines.find((x) => x.section === l.section && x.item === l.item);
      if (!m) { failures.push(`${tag}: ${l.item} missing after swap`); continue; }
      if (Math.abs(m.dQty + l.dQty) > 0.011) failures.push(`${tag}: dQty not negated on ${l.item}`);
      if ((m.dAmount == null) !== (l.dAmount == null)) failures.push(`${tag}: pricing flag differs on swap for ${l.item}`);
      else if (l.dAmount != null && Math.abs(m.dAmount + l.dAmount) > 0.011) failures.push(`${tag}: dAmount not negated on ${l.item}`);
      if (l.status === "added" && (l.qtyBefore !== 0 || l.amountBefore !== null)) failures.push(`${tag}: added line has a before`);
    }
    for (const f of Object.keys(ab.totals)) {
      const t = ab.totals[f];
      if (Math.abs(t.delta - cents(t.after - t.before)) > 0.011) failures.push(`${tag}: total ${f} delta wrong`);
    }
    for (const s of ab.sections) {
      const sum = cents(ab.lines.filter((l) => l.section === s.name).reduce((x, l) => x + (l.dAmount ?? 0), 0));
      if (Math.abs(sum - s.delta) > 0.011) failures.push(`${tag}: section ${s.name} delta ${s.delta} != ${sum}`);
    }
    const unpriced = ab.lines.filter((l) => l.dAmount == null).length;
    if (unpriced !== ab.unpricedChanges.length) failures.push(`${tag}: unpricedChanges ${ab.unpricedChanges.length} != ${unpriced}`);
    try { if (!diffText(ab).length) failures.push(`${tag}: empty text`); } catch (e) { failures.push(`${tag}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(changed > 100 && halfPriced > 20, `weak coverage: changed ${changed}, half-priced ${halfPriced}, paired lumber ${paired}`);
});
