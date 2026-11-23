// League schedule generator, carryover-core.mjs: the carry-over measure (how often each team meets
// another right after a third, Russell's matrix) and the carry-over search's page settings (how many tries,
// squeezes and regrounded seasons the page runs, the four choices' weights), kept apart from carryover.mjs
// so the single-league page, readSpec and scheduleStats can use them without fetching the search itself
// (2026-11-23). carryover.mjs imports and re-exports every one, so its importers are unchanged.

/**
 * Capped tries the page runs after its 8 weighted + 2 capped ones (cappedTryBreaks j = 2 and 3),
 * offered only in the list a person picks from (combineCarryOverTries `among`). At 17 to 20 teams
 * over a home-and-away season the weighted tries stop around 83 to 87 breaks and the two capped
 * ones start near 48 to 59; these land in between (19 teams: 3,203 / 72 between 1,311 / 87 and
 * 3,731 / 59; eval/frontier-gap.txt).
 */
export const CARRY_OVER_GAP = 2;

/**
 * Squeezed seasons the page runs after its 12 tries in a home-and-away season (carryOverSqueeze,
 * README "Squeezing a season under a cap"): listed with the other frontier seasons, never picked
 * by the four choices. At 17 to 20 teams they add 3 or 4 seasons to the frontier and cut the widest
 * break gap from 10-24 to 6-12 for about 1.5 s on one thread (eval/squeeze-gap.txt).
 */
export const CARRY_OVER_SQUEEZE = 4;

/** The organiser's choice among the tries: carry-over + pick x breaks (see bestCarryOverRounds). */
// `fewest` prices a break above any carry-over a capped try saves, so it keeps the capped try at the
// minimum (3(n - 2) over an even home-and-away season) and, among equal breaks, the lower carry-over.
export const CARRY_OVER_PICK = { fair: 0, balanced: 10, breaks: 40, fewest: 1000 };

/** Polished seasons the page adds after its squeezes, at most (carryOverPolish). */
export const CARRY_OVER_POLISH = 4;

/** Floor-priced seasons the page adds after its regrounded ones, at most (carryOverFloorPriced). */
export const CARRY_OVER_FLOOR_PRICED = 2;

/**
 * Carry-over matrix from each team's opponents in playing order. `opponents[k]` is team k's list of
 * opponent indexes in the order k plays them (byes skipped). With `cyclic` the last opponent also
 * carries over to the first, Russell's original definition, used for the published lower bounds.
 * Returns { matrix, value, max, pairs, total, lowerBound }: value is sum c^2, max the largest entry,
 * pairs the count of (i, j) with c >= 2, total the sum of entries, and lowerBound the least value any
 * schedule with that total could have (entries as even as possible; reached only if the schedule
 * allows it).
 */
export function carryOverFromOpponents(opponents, { cyclic = false } = {}) {
  const n = opponents.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (const seq of opponents) {
    const L = seq.length;
    const steps = cyclic ? L : L - 1;
    for (let s = 0; s < steps; s++) matrix[seq[s]][seq[(s + 1) % L]]++;
  }
  let value = 0, max = 0, pairs = 0, total = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = matrix[i][j];
    value += v * v; total += v;
    if (v > max) max = v;
    if (v >= 2) pairs++;
  }
  // In a single round robin c[i][i] is always 0, so the total spreads over n(n-1) cells; in a
  // double one a team can meet the same side twice running (end of one leg, start of the next),
  // so when a schedule does that the diagonal counts too.
  let diagonal = 0;
  for (let i = 0; i < n; i++) diagonal += matrix[i][i];
  const cells = diagonal ? n * n : n * (n - 1);
  const q = Math.floor(total / cells), r = total - q * cells;
  const lowerBound = cells ? r * (q + 1) ** 2 + (cells - r) * q * q : 0;
  // A single round robin, all n teams playing, non-cyclic: the floor above is not always reachable,
  // and for some n an exact search has proved a higher least value (PROVEN_LEAST).
  const single = !cyclic && !diagonal && n % 2 === 0 && opponents.every((s) => s.length === n - 1);
  const proven = single ? PROVEN_LEAST[n] || null : null;
  return { matrix, value, max, pairs, total, lowerBound, repeats: diagonal, proven };
}

/**
 * Least non-cyclic carry-over of a single round robin with n teams, all playing, as far as it is
 * proved. `least` is a value no such round robin goes below; `exact` says a round robin reaches it.
 * 6: all 720 ordered 1-factorizations enumerated (carryover.test.mjs), eval/carryover-sat.py and
 * eval/carryover-bnb.c (none at 40 or under). 8: reaches the floor. 10: eval/carryover-bnb.c, an
 * exhaustive branch and bound, finds none at 92 or under (145 s; CaDiCaL had proved 88 and stopped
 * with no answer at 90 after 69 min) and finds a 94 in 2 s, so 94 is the least (README "The least
 * carry-over at 10 teams is 94"). 12: the same search with an exact per-round matching bound and
 * round 1 fixed per cycle type finds none at 120 (4 x 3 min) or 122 (4 x 25 min); the best known
 * timetable is 132 (eval/window-refill.c; 136 before), so the least is 124 to 132 and not known to
 * be reached (README "12 teams cannot reach 122", "12 teams at 132").
 */
export const PROVEN_LEAST = {
  6: { least: 42, exact: true },
  8: { least: 48, exact: true },
  10: { least: 94, exact: true },
  12: { least: 124, exact: false },
};

/** Each team's opponents in order from schedule rounds (`{ matches: [{ home, away }] }` or [h, a] pairs). */
export function opponentsFromRounds(rounds, n) {
  const opp = Array.from({ length: n }, () => []);
  for (const r of rounds) {
    for (const m of r.matches) {
      const [h, a] = Array.isArray(m) ? m : [m.home, m.away];
      opp[h].push(a); opp[a].push(h);
    }
  }
  return opp;
}

/** Carry-over of a schedule (built by buildSchedule, or any { teams, rounds }). Non-cyclic: a season does not wrap. */
export function carryOver(schedule, opts = {}) {
  const n = schedule.teams.length;
  return carryOverFromOpponents(opponentsFromRounds(schedule.rounds, n), opts);
}
