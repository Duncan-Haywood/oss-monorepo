// League schedule generator, pool-play.mjs: Each pool's own season, built by schedule.mjs on the shared dates (kept apart so the bracket pages skip it).
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { buildSchedule } from "./schedule.mjs";
import { splitPools } from "./pools.mjs";

/**
 * Pool play: each pool gets its own round robin on the same dates and settings (each pool has its
 * own courts, so pools never compete for a court). `spec.courts` names are reused per pool when given.
 * Returns [{ name, schedule }], every schedule checked by validateSchedule.
 */
export function buildPoolPlay(spec, k, clubs = []) {
  return splitPools(spec.teams, k, clubs).map((pool) => {
    const remap = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([i]) => pool.teams.includes(spec.teams[i]))
      .map(([i, v]) => [pool.teams.indexOf(spec.teams[i]), v]));
    const schedule = buildSchedule({ ...spec, teams: pool.teams, blackouts: remap(spec.blackouts), timeLimits: remap(spec.timeLimits), courtLimits: remap(spec.courtLimits), courtClosures: spec.courtClosures });
    return { name: pool.name, schedule };
  });
}
