// @ts-check
// Schedule risk: a seeded Monte Carlo over the builder's own activity list.
// Each activity keeps `days` as its most likely duration and may add `min` and
// `max` (working days, your estimates; none are shipped). A run draws every
// such activity from a triangular distribution (min, days, max), rounds to
// whole working days, re-runs `schedule()` and records the finish. The result
// is a spread of finish dates, not a forecast: it is only as good as the
// ranges typed in, and draws are independent (no correlation between jobs).
import { schedule } from "./schedule.mjs";

/** Small seeded generator (mulberry32) so a result can be reproduced. */
function rng(/** @type {number} */ seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangular draw on [lo, hi] with mode m, by inverse CDF. */
export function triangular(/** @type {number} */ lo, /** @type {number} */ m, /** @type {number} */ hi, /** @type {number} */ u) {
  if (hi <= lo) return lo;
  const f = (m - lo) / (hi - lo);
  return u < f ? lo + Math.sqrt(u * (hi - lo) * (m - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - m));
}

const pct = (/** @type {number[]} */ sorted, /** @type {number} */ p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];

/**
 * @param {any} input a schedule object whose activities may carry `min` and `max`
 * @param {{ runs?: number, seed?: number }} [opts]
 */
export function scheduleRisk(input, opts = {}) {
  const runs = opts.runs ?? 1000;
  if (!(Number.isInteger(runs) && runs >= 10 && runs <= 20000)) return { ok: false, errors: ["runs must be a whole number from 10 to 20000."] };
  const base = schedule(input);
  if (!base.ok) return base;
  const errors = [];
  for (const a of input.activities) {
    if (a.min == null && a.max == null) continue;
    const lo = a.min ?? a.days, hi = a.max ?? a.days;
    if (![lo, hi, a.days].every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)) errors.push(`${a.id}: min, days and max must be numbers of zero or more.`);
    else if (!(lo <= a.days && a.days <= hi)) errors.push(`${a.id}: need min <= days <= max (min ${lo}, days ${a.days}, max ${hi}).`);
  }
  if (errors.length) return { ok: false, errors };
  const ranged = input.activities.filter((/** @type {any} */ a) => a.min != null || a.max != null);
  if (!ranged.length) return { ok: false, errors: ["No activity has a `min` or `max`; add ranges (working days) to the activities you are unsure of."] };
  const rand = rng(opts.seed ?? 1);
  /** @type {number[]} */ const finishes = [];
  /** @type {Map<string, number>} */ const crit = new Map(input.activities.map((/** @type {any} */ a) => [a.id, 0]));
  for (let i = 0; i < runs; i++) {
    const acts = input.activities.map((/** @type {any} */ a) => {
      if (a.min == null && a.max == null) return a;
      return { ...a, days: Math.round(triangular(a.min ?? a.days, a.days, a.max ?? a.days, rand())) };
    });
    const s = schedule({ ...input, activities: acts, slips: [] });
    if (!s.ok) return s;
    finishes.push(s.leveledDays);
    for (const id of s.criticalPath) crit.set(id, (crit.get(id) || 0) + 1);
  }
  const sorted = finishes.slice().sort((x, y) => x - y);
  // Date of a finish measured in leveled working days: reuse the schedule's own calendar by stretching one activity is overkill;
  // instead derive from the base run's day-to-date mapping through a one-activity probe.
  const dateOfDays = (/** @type {number} */ n) => schedule({ start: input.start, holidays: input.holidays, weatherDays: input.weatherDays, activities: [{ id: "x", days: Math.max(1, n) }] }).finishDate;
  const at = (/** @type {number} */ p) => ({ workingDays: pct(sorted, p), date: dateOfDays(pct(sorted, p)) });
  const sd = Math.sqrt(finishes.reduce((t, x) => t + (x - finishes.reduce((u, v) => u + v, 0) / runs) ** 2, 0) / runs);
  const deadlineIdx = base.deadline ? base.leveledDays - base.deadline.daysLate : null;
  return {
    ok: true, runs, seed: opts.seed ?? 1, plannedDays: base.leveledDays, plannedFinish: base.leveledFinishDate,
    min: sorted[0], max: sorted[sorted.length - 1], mean: finishes.reduce((t, x) => t + x, 0) / runs, sd,
    p50: at(0.5), p80: at(0.8), p90: at(0.9),
    ...(deadlineIdx != null ? { deadline: base.deadline.deadline, chanceOnTime: finishes.filter((x) => x <= deadlineIdx).length / runs } : {}),
    chanceWithinPlan: finishes.filter((x) => x <= base.leveledDays).length / runs,
    criticality: [...crit.entries()].map(([id, n]) => ({ id, index: n / runs })).filter((r) => r.index > 0).sort((a, b) => b.index - a.index),
  };
}

export function riskText(/** @type {any} */ r) {
  if (!r.ok) return ["Cannot run the risk analysis:", ...r.errors.map((/** @type {string} */ e) => `  - ${e}`)];
  const out = [`Schedule risk (${r.runs} runs, seed ${r.seed}; triangular draws from your min/days/max)`,
    `  Planned (your most-likely days): ${r.plannedDays} working days, finishing ${r.plannedFinish}`,
    `  Chance of finishing within the plan: ${(r.chanceWithinPlan * 100).toFixed(0)}%`,
    `  P50 ${r.p50.workingDays} d (${r.p50.date})   P80 ${r.p80.workingDays} d (${r.p80.date})   P90 ${r.p90.workingDays} d (${r.p90.date})`,
    `  Range ${r.min} to ${r.max} d, mean ${r.mean.toFixed(1)}, sd ${r.sd.toFixed(1)}`];
  if (r.deadline) out.push(`  Chance of finishing by ${r.deadline}: ${(r.chanceOnTime * 100).toFixed(0)}%`);
  out.push("  Criticality (share of runs where the activity is on the critical path):");
  for (const c of r.criticality.slice(0, 10)) out.push(`    ${c.id.padEnd(14)} ${(c.index * 100).toFixed(0)}%`);
  out.push("  A spread from the ranges you typed, not a forecast. Draws are independent; real delays often travel together.");
  return out;
}
