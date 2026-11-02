import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleRisk, triangular, riskText } from "./risk.mjs";

// Property test: random activity networks with min/max ranges are refused with
// a reason, or the Monte Carlo result is internally consistent: percentiles in
// order inside [min, max], the finish bounded by the sum of the ranges, chances
// in [0, 1], criticality indexes in (0, 1], the same seed reproduces, and a
// triangular draw never leaves its range.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

test("fuzz: triangular draws stay inside their range", () => {
  const rand = rng(99);
  for (let i = 0; i < 2000; i++) {
    const lo = int(rand, 0, 20), m = lo + int(rand, 0, 20), hi = m + int(rand, 0, 20), u = rand();
    const x = triangular(lo, m, hi, u);
    assert.ok(x >= lo - 1e-9 && x <= hi + 1e-9, `${lo},${m},${hi},${u} -> ${x}`);
  }
});

test("fuzz: random networks give a consistent spread or are refused with a reason", () => {
  let ok = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const n = int(rand, 1, 8);
    const serial = rand() < 0.5;
    const acts = [];
    let sumMin = 0, sumMax = 0;
    for (let i = 0; i < n; i++) {
      const days = int(rand, 1, 12);
      const a = { id: `a${i}`, days };
      if (i > 0) a.after = serial ? [`a${i - 1}`] : Array.from({ length: int(rand, 0, Math.min(2, i)) }, () => `a${int(rand, 0, i - 1)}`);
      let lo = days, hi = days;
      if (rand() < 0.7) { lo = Math.max(0, days - int(rand, 0, 6)); hi = days + int(rand, 0, 10); a.min = lo; a.max = hi; }
      if (rand() < 0.05) { a.min = days + 3; lo = a.min; } // bad range on purpose
      acts.push(a);
      sumMin += lo; sumMax += hi;
    }
    const input = { start: "2026-03-02", activities: acts, ...(rand() < 0.4 ? { deadline: "2026-04-15" } : {}) };
    const runs = int(rand, 10, 300);
    let r;
    try { r = scheduleRisk(input, { runs, seed }); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    ok++;
    if (!(r.min <= r.p50.workingDays && r.p50.workingDays <= r.p80.workingDays && r.p80.workingDays <= r.p90.workingDays && r.p90.workingDays <= r.max)) failures.push(`seed ${seed}: percentiles out of order`);
    if (r.mean < r.min - 1e-9 || r.mean > r.max + 1e-9) failures.push(`seed ${seed}: mean outside range`);
    if (!(r.sd >= 0)) failures.push(`seed ${seed}: bad sd`);
    if (!(r.chanceWithinPlan >= 0 && r.chanceWithinPlan <= 1)) failures.push(`seed ${seed}: chance out of [0,1]`);
    if (r.deadline && !(r.chanceOnTime >= 0 && r.chanceOnTime <= 1)) failures.push(`seed ${seed}: deadline chance out of [0,1]`);
    // each run's finish is at most the sum of every activity's longest draw (rounded up by at most 0), and at least the longest single minimum
    if (r.max > sumMax) failures.push(`seed ${seed}: max ${r.max} beats the sum of maxes ${sumMax}`);
    if (serial && r.min < Math.max(0, sumMin - n)) failures.push(`seed ${seed}: serial min ${r.min} below summed mins ${sumMin}`);
    for (const c of r.criticality) if (!(c.index > 0 && c.index <= 1)) failures.push(`seed ${seed}: criticality ${c.id} ${c.index}`);
    if (serial && r.criticality.length !== n) failures.push(`seed ${seed}: serial chain should have every activity critical`);
    if (JSON.stringify(scheduleRisk(input, { runs, seed })) !== JSON.stringify(r)) failures.push(`seed ${seed}: same seed differs`);
    try { if (riskText(r).length < 5) failures.push(`seed ${seed}: short text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(ok > 50 && refused > 3, `ok ${ok}, refused ${refused}`);
});
