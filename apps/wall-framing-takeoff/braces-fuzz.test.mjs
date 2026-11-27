import { test } from "node:test";
import assert from "node:assert/strict";
import { braceReport, braceText } from "./braces.mjs";

// Property test (invented inputs): random brace jobs, some hostile, are refused with a
// reason, or brace counts, lengths, feet and cost equal an independent recount.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

test("fuzz: random brace jobs are refused with a reason or recount by hand", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const n = pick(rand, [1, 2, 5, 12, 0, 201]);
    const walls = [];
    for (let i = 0; i < n; i++) walls.push(rand() < 0.93 ? pick(rand, [12, 36, 47.9, 48, 96, 240, 301, 480, 1200]) : pick(rand, [0, 11, 1201, "96", NaN, Infinity, null]));
    const o = { walls, height: rand() < 0.93 ? pick(rand, [48, 96, 97.125, 144, 240]) : pick(rand, [47, 241, "96", NaN, null]) };
    for (const [k, vals] of Object.entries({
      spacing: [24, 120, 300, 1200, 23, 5000], minWallLength: [0, 48, 96, 1200, 1300], angle: [30, 45, 50, 60, 29, 61],
      pricePerBrace: [0, 12, 35.5, -1, 10001],
    })) if (rand() < 0.5) o[k] = rand() < 0.85 ? pick(rand, vals.slice(0, 4)) : pick(rand, [...vals, "x", NaN, Infinity]);
    let r;
    try { r = braceReport(o); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    try { braceText(r); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); continue; }
    if (!r.ok) {
      refused++;
      if (!Array.isArray(r.errors) || !r.errors.length || r.errors.some((e) => typeof e !== "string" || !e)) failures.push(`seed ${seed}: refusal without reason`);
      continue;
    }
    laid++;
    const spacing = o.spacing ?? 300, minLen = o.minWallLength ?? 48, angle = o.angle ?? 45;
    const rad = (angle * Math.PI) / 180;
    let count = 0, feet = 0;
    o.walls.forEach((len, i) => {
      const c = len >= minLen ? Math.ceil(len / spacing - 1e-9) : 0;
      if (r.rows[i].count !== c) failures.push(`seed ${seed}: wall ${i + 1} count ${r.rows[i].count} vs ${c}`);
      count += c;
      feet += (c * o.height) / Math.sin(rad) / 12;
    });
    if (r.count !== count) failures.push(`seed ${seed}: total ${r.count} vs ${count}`);
    if (Math.abs(r.feet - feet) > 0.006 * Math.max(1, o.walls.length)) failures.push(`seed ${seed}: feet ${r.feet} vs ${feet}`);
    if (o.pricePerBrace != null ? Math.abs(r.cost - count * o.pricePerBrace) > 0.006 : r.cost !== null) failures.push(`seed ${seed}: cost ${r.cost}`);
    if (![r.count, r.feet, r.braceInches, r.runInches].every(Number.isFinite)) failures.push(`seed ${seed}: non-finite`);
    for (const w of r.rows) if (w.braced && w.count < 1) failures.push(`seed ${seed}: braced wall with no brace`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 40 && refused > 40, `laid ${laid}, refused ${refused}`);
});
