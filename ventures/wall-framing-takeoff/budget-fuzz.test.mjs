import { test } from "node:test";
import assert from "node:assert/strict";
import { budget, budgetText, budgetCsv } from "./budget.mjs";

// Property test: random takeoff results, random typed prices (some missing,
// negative or not numbers) and random allowances. The totals must add up from
// the lines, a quantity with no usable price is listed unpriced and never
// guessed, markups only raise the bid, and the text and CSV renderings work.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (n) => Math.round(n * 100) / 100;

test("fuzz: budget totals add up from lines and no price is invented", () => {
  const failures = [];
  let cases = 0, unpricedSeen = 0, laborSeen = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const tag = `seed ${seed}`;
    const orders = [];
    for (let i = 0, n = Math.floor(rand() * 4); i < n; i++) {
      const lines = [];
      for (let j = 0, m = 1 + Math.floor(rand() * 4); j < m; j++) lines.push({ qty: 1 + Math.floor(rand() * 40), length: 8 + 2 * j });
      orders.push({ size: `2x${[4, 6, 8][i % 3]}`, lines, cost: r2(rand() * 3000), method: "fuzz" });
    }
    const result = { orders, summary: { wallFeet: rand() < 0.8 ? r2(20 + rand() * 400) : 0 } };
    if (rand() < 0.7) result.floor = { sheets: { count: Math.floor(rand() * 60), area: r2(rand() * 3000) } };
    const prices = {};
    for (const k of ["floorSheet", "laborWallFoot", "laborFloorSqFt", "tax", "contingency", "overhead", "profit"]) {
      const u = rand();
      if (u < 0.55) prices[k] = k === "tax" || k === "contingency" || k === "overhead" || k === "profit" ? r2(rand() * 0.2) : r2(rand() * 80);
      else if (u < 0.65) prices[k] = -r2(1 + rand() * 5);
      else if (u < 0.7) prices[k] = "12";
    }
    const allowances = {};
    for (let i = 0, n = Math.floor(rand() * 3); i < n; i++) allowances[`Allowance ${i}`] = rand() < 0.8 ? r2(rand() * 2000) : -50;

    let b;
    try { b = budget(result, prices, allowances); } catch (e) { failures.push(`${tag}: threw ${e.message}`); continue; }
    cases++;
    const nums = [b.materials, b.labor, b.allowances, b.tax, b.contingency, b.total, b.overhead, b.profit, b.bid, b.marginPct];
    if (!nums.every((x) => Number.isFinite(x) && x >= 0)) failures.push(`${tag}: a total is negative or not finite`);
    for (const l of b.lines) {
      if (!(l.qty > 0)) failures.push(`${tag}: ${l.item} has qty ${l.qty}`);
      if (l.unitPrice == null !== (l.amount == null)) failures.push(`${tag}: ${l.item} price and amount disagree on being null`);
      if (l.amount != null && Math.abs(l.amount - l.qty * l.unitPrice) > 0.011) failures.push(`${tag}: ${l.item} amount != qty x price`);
      if (l.unitPrice != null && l.unitPrice < 0) failures.push(`${tag}: ${l.item} has a negative price`);
    }
    // Typed prices that are negative or not numbers must not price anything.
    for (const k of ["floorSheet", "laborWallFoot", "laborFloorSqFt"]) {
      if (typeof prices[k] !== "number" || prices[k] < 0) {
        const bad = b.lines.filter((l) => l.source.includes(k) && l.amount != null);
        if (bad.length) failures.push(`${tag}: unusable ${k} still priced ${bad.map((l) => l.item)}`);
      }
    }
    const unpricedLines = b.lines.filter((l) => l.amount == null);
    unpricedSeen += unpricedLines.length;
    if (b.unpriced.length !== unpricedLines.length) failures.push(`${tag}: unpriced list length`);
    const sumSections = r2(b.sections.reduce((t, s) => t + s.subtotal, 0));
    const sumLines = r2(b.lines.reduce((t, l) => t + (l.amount ?? 0), 0));
    if (Math.abs(sumSections - sumLines) > 0.011 * (b.sections.length + 1)) failures.push(`${tag}: sections ${sumSections} vs lines ${sumLines}`);
    if (Math.abs(b.materials + b.labor + b.allowances - sumLines) > 0.011 * (b.sections.length + 1)) failures.push(`${tag}: materials+labor+allowances != lines`);
    if (Math.abs(b.total - r2(b.materials + b.tax + b.contingency + b.labor + b.allowances)) > 0.011) failures.push(`${tag}: total != parts`);
    if (b.bid + 1e-9 < b.total) failures.push(`${tag}: bid below cost`);
    if (!b.overheadRate && !b.profitRate && Math.abs(b.bid - b.total) > 1e-9) failures.push(`${tag}: bid != total with no markup`);
    if (b.profitRate && b.bid > 0 && b.marginPct > 100 * b.profitRate / (1 + b.profitRate) + 0.02) failures.push(`${tag}: margin ${b.marginPct}% too high`);
    if (b.lines.some((l) => l.section === "Labor")) laborSeen++;
    if (!(budgetText(b).length >= 2)) failures.push(`${tag}: text too short`);
    const csv = budgetCsv(b);
    if (!csv.endsWith("\n") || !csv.startsWith("section,item")) failures.push(`${tag}: csv shape`);
  }
  assert.ok(cases >= 290, `only ${cases} cases ran`);
  assert.ok(unpricedSeen > 20 && laborSeen > 20, `weak coverage: unpriced ${unpricedSeen}, labor ${laborSeen}`);
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} failures`);
});
