// Bowling league schedules: a repeated round robin with every team rotated across the lane pairs.
//
// A bowling league plays every week on the same pairs of lanes: N teams use N/2 pairs, the
// round robin repeats until the season's weeks run out (a 30-week season of 10 teams is three
// and a third cycles), and the lane pair a team bowls on matters to bowlers (lane conditions,
// the approach, the end lanes by the wall). So the job beyond "who plays whom" is to give every
// team each pair as often as every other pair, and never the same pair two weeks running.
//
// Method: the circle-method rounds fix who plays whom each week; each week's matches are then
// put on pairs by an assignment problem (Hungarian method) priced on what each team has already
// had, and a season-wide swap search (two matches of one week trade pairs) polishes the result.
// A team that bowls W weeks on P pairs cannot spread its weeks closer than floor(W/P) to
// ceil(W/P); `laneReport` measures every team against that bound.
//
// Odd leagues bowl against a "Vacancy" (in USBC terms a vacancy or blind): the team still bowls
// on its pair, so an odd league of N teams uses (N+1)/2 pairs every week.
//
// Position rounds (1st v 2nd, 3rd v 4th by the standings that night) are placeholders: their
// teams are known only on the night. They take a week but do not advance the round robin and are
// left out of the lane counts.

import { roundRobin, dayLabel, dayIso, csvCell, parseTeams, mulberry32 } from "./calc.mjs";

export const VACANCY = "Vacancy";

/** Minimum-cost perfect assignment of rows to columns of a square matrix (Hungarian, O(n^3)). */
export function hungarian(cost) {
  const n = cost.length;
  const INF = Infinity;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const rowToCol = new Array(n);
  for (let j = 1; j <= n; j++) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/** "Lanes 1-2", "Lanes 3-4", ... starting from `firstLane`. */
export function pairLabels(count, firstLane = 1) {
  return Array.from({ length: count }, (_, i) => `Lanes ${firstLane + 2 * i}-${firstLane + 2 * i + 1}`);
}

/** "8, 16, 32" or "8 16 32" -> sorted unique week numbers within 1..weeks. */
export function parseWeekList(text, weeks) {
  const out = new Set();
  const errors = [];
  for (const tok of String(text ?? "").split(/[\s,;]+/)) {
    if (!tok) continue;
    const w = Number(tok);
    if (!Number.isInteger(w) || w < 1 || w > weeks) errors.push(`"${tok}" is not a week between 1 and ${weeks}.`);
    else out.add(w);
  }
  return { weeks: [...out].sort((a, b) => a - b), errors };
}

// The greedy week-by-week assignment prices a team's next week on a pair at BALANCE * (2c + 1)
// (the rise in its squared count) plus one for a back-to-back repeat: balance first.
const BALANCE = 8;

/**
 * Put each week's matches on lane pairs. `rounds` is a list of weeks, each a list of [a, b]
 * team-index pairs with exactly nPairs matches. Returns plan: weeks of [a, b, pair].
 * mode: "naive" (match k on pair k, a straight copy of the circle method),
 *       "rotate" (match k on pair (k + week) mod P, the usual hand rotation),
 *       "greedy" (week-by-week assignment priced on counts so far),
 *       "polished" (greedy, then the iterated local search below; the default).
 */
export function assignLanes(rounds, nTeams, nPairs, { mode = "polished", seed = 1, iterations = null } = {}) {
  if (mode === "naive") return rounds.map((wk) => wk.map(([a, b], k) => [a, b, k]));
  if (mode === "rotate") return rounds.map((wk, w) => wk.map(([a, b], k) => [a, b, (k + w) % nPairs]));
  const cnt = Array.from({ length: nTeams }, () => new Array(nPairs).fill(0));
  const last = new Array(nTeams).fill(-1);
  const plan = [];
  for (const wk of rounds) {
    const cost = wk.map(([a, b]) => {
      const row = [];
      for (let p = 0; p < nPairs; p++) {
        row.push(BALANCE * (2 * cnt[a][p] + 1 + 2 * cnt[b][p] + 1) + (last[a] === p) + (last[b] === p));
      }
      return row;
    });
    const col = hungarian(cost);
    const out = wk.map(([a, b], k) => [a, b, col[k]]);
    for (const [a, b, p] of out) { cnt[a][p]++; cnt[b][p]++; last[a] = p; last[b] = p; }
    plan.push(out);
  }
  if (mode === "greedy" || plan.length < 2 || nPairs < 2) return plan;
  return polishLanes(plan, nTeams, nPairs, seed, iterations ?? kicksFor(plan.length, nPairs));
}

function kicksFor(weeks, nPairs) {
  return Math.max(30, Math.min(600, Math.floor(4e6 / (weeks * nPairs * nPairs))));
}

// Iterated local search on week re-solves. With every other week fixed, the price of putting one
// week's match on a pair is a sum over its two teams of what that adds to their lane cost (their
// count on that pair goes up by one; their repeats depend only on the weeks either side), so the
// Hungarian method finds that week's exact best assignment. A team-pair cell is "out of bounds"
// when its count leaves floor(W_t/P)..ceil(W_t/P), the least spread a team of W_t weeks can have.
// The price is lexicographic in effect: out-of-bounds counts first, then the squared distance
// from the even share, then back-to-back repeats. Sweeps re-solve every week until none improves;
// a kick re-deals a few random weeks and the sweeps run again from there; a kick that ends worse
// is undone. The best season (fewest out-of-bounds, then fewest repeats) is kept. Deterministic
// for a seed.
function polishLanes(plan, nTeams, nPairs, seed, kicks) {
  const W = plan.length;
  const cnt = Array.from({ length: nTeams }, () => new Array(nPairs).fill(0));
  const pos = Array.from({ length: W }, () => new Array(nTeams).fill(-1));
  const games = new Array(nTeams).fill(0);
  for (const wk of plan) for (const [a, b] of wk) { games[a]++; games[b]++; }
  const lo = games.map((g) => Math.floor(g / nPairs)), hi = games.map((g) => Math.ceil(g / nPairs));
  const put = (w, sign) => { for (const [a, b, p] of plan[w]) { cnt[a][p] += sign; cnt[b][p] += sign; pos[w][a] = sign > 0 ? p : -1; pos[w][b] = sign > 0 ? p : -1; } };
  for (let w = 0; w < W; w++) put(w, 1);
  const off = (t, c) => Math.max(0, c - hi[t]) + Math.max(0, lo[t] - c);
  const OFF = 4096, SQ = 16;
  const price = (w, t, p) => {
    const c = cnt[t][p];
    return OFF * (off(t, c + 1) - off(t, c)) + SQ * (2 * c + 1) + (w > 0 && pos[w - 1][t] === p ? 1 : 0) + (w < W - 1 && pos[w + 1][t] === p ? 1 : 0);
  };
  const resolve = (w) => {
    put(w, -1);
    const cost = plan[w].map(([a, b]) => Array.from({ length: nPairs }, (_, p) => price(w, a, p) + price(w, b, p)));
    const col = hungarian(cost);
    plan[w].forEach((m, k) => { m[2] = col[k]; });
    put(w, 1);
  };
  const full = () => {
    let o = 0, q = 0, r = 0;
    for (let t = 0; t < nTeams; t++) for (let p = 0; p < nPairs; p++) { const c = cnt[t][p]; o += off(t, c); q += c * c; }
    for (let w = 1; w < W; w++) for (let t = 0; t < nTeams; t++) if (pos[w][t] === pos[w - 1][t]) r++;
    return { cost: OFF * o + SQ * q + r, off: o, repeats: r };
  };
  const sweep = () => {
    let cur = full();
    for (let guard = 0; guard < 40; guard++) {
      for (let w = 0; w < W; w++) resolve(w);
      const next = full();
      if (next.cost >= cur.cost) return next;
      cur = next;
    }
    return cur;
  };
  const rnd = mulberry32(seed);
  const key = (x) => [x.off, x.repeats, x.cost];
  const better = (x, y) => { const a = key(x), b = key(y); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
  let cur = sweep(), best = cur;
  let curPlan = plan.map((wk) => wk.map((m) => m.slice())), bestPlan = curPlan;
  const restore = (from) => { for (let w = 0; w < W; w++) { put(w, -1); plan[w].forEach((m, idx) => { m[2] = from[w][idx][2]; }); put(w, 1); } };
  for (let k = 0; k < kicks && (best.off > 0 || best.repeats > 0); k++) {
    const many = 1 + Math.floor(rnd() * Math.min(3, W));
    for (let i = 0; i < many; i++) {
      const w = Math.floor(rnd() * W);
      put(w, -1);
      const perm = Array.from({ length: nPairs }, (_, i2) => i2);
      for (let i2 = nPairs - 1; i2 > 0; i2--) { const j = Math.floor(rnd() * (i2 + 1)); [perm[i2], perm[j]] = [perm[j], perm[i2]]; }
      plan[w].forEach((m, idx) => { m[2] = perm[idx]; });
      put(w, 1);
    }
    const c = sweep();
    if (c.cost <= cur.cost) {
      cur = c; curPlan = plan.map((wk) => wk.map((m) => m.slice()));
      if (better(c, best)) { best = c; bestPlan = curPlan; }
    } else restore(curPlan);
  }
  return bestPlan;
}

/**
 * Build a bowling season.
 * spec: { teams: string[] | text, weeks, start (day number), skipDays: day[], positionWeeks: number[],
 *         firstLane = 1, mode = "polished", seed = 1 }
 */
export function bowlingSchedule(spec) {
  const errors = [];
  let teams = Array.isArray(spec.teams) ? spec.teams.slice() : parseTeams(spec.teams).teams;
  if (!Array.isArray(spec.teams)) errors.push(...parseTeams(spec.teams).errors);
  if (teams.length < 2) errors.push("Enter at least two teams.");
  if (teams.length > 64) errors.push("Up to 64 teams are supported.");
  const weeks = Number(spec.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 60) errors.push("Weeks must be a whole number from 1 to 60.");
  if (!Number.isInteger(spec.start)) errors.push("Pick the first league night.");
  const firstLane = Number(spec.firstLane ?? 1);
  if (!Number.isInteger(firstLane) || firstLane < 1 || firstLane > 199) errors.push("The first lane must be a whole number from 1 to 199.");
  if (errors.length) return { errors };
  const odd = teams.length % 2 === 1;
  if (odd) teams = [...teams, VACANCY];
  const n = teams.length;
  const nPairs = n / 2;
  const positionSet = new Set((spec.positionWeeks ?? []).filter((w) => w >= 1 && w <= weeks));
  const skipSet = new Set(spec.skipDays ?? []);
  // Dates: the same weekday every week from the start, stepping over skip dates.
  const days = [];
  for (let d = spec.start; days.length < weeks; d += 7) if (!skipSet.has(d)) days.push(d);
  const skipped = [...skipSet].filter((d) => d >= spec.start && d <= days[days.length - 1] && (d - spec.start) % 7 === 0).sort((a, b) => a - b);
  const cycle = roundRobin(n); // n even here, so every round has n/2 matches and no bye
  const rrRounds = [];
  const roundOf = [];
  let k = 0;
  for (let w = 1; w <= weeks; w++) {
    if (positionSet.has(w)) continue;
    const r = cycle[k % cycle.length];
    rrRounds.push(r.matches);
    roundOf.push({ week: w, cycle: Math.floor(k / cycle.length) + 1, round: (k % cycle.length) + 1 });
    k++;
  }
  const plan = assignLanes(rrRounds, n, nPairs, { mode: spec.mode ?? "polished", seed: spec.seed ?? 1 });
  const labels = pairLabels(nPairs, firstLane);
  const out = [];
  let ri = 0;
  for (let w = 1; w <= weeks; w++) {
    const day = days[w - 1];
    if (positionSet.has(w)) {
      out.push({ week: w, day, kind: "position", matches: labels.map((_, p) => ({ pair: p, a: `${ordinal(2 * p + 1)} place`, b: `${ordinal(2 * p + 2)} place` })) });
      continue;
    }
    const info = roundOf[ri];
    const matches = plan[ri].map(([a, b, p]) => ({ pair: p, a, b })).sort((x, y) => x.pair - y.pair);
    out.push({ week: w, day, kind: "round", cycle: info.cycle, round: info.round, matches });
    ri++;
  }
  return { errors: [], teams, odd, nPairs, labels, weeks: out, skipped, cycleLength: cycle.length };
}

function ordinal(i) {
  const s = i % 100 >= 11 && i % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][i % 10] || "th";
  return `${i}${s}`;
}

/** Per team: weeks bowled on each pair, the spread (max - min), the bound, and back-to-back repeats. */
export function laneReport(season) {
  const n = season.teams.length, P = season.nPairs;
  const rows = season.teams.map((name) => ({ name, counts: new Array(P).fill(0), weeks: 0, repeats: 0, last: -1, lastWeek: -9 }));
  for (const wk of season.weeks) {
    if (wk.kind !== "round") continue;
    for (const m of wk.matches) {
      for (const t of [m.a, m.b]) {
        const r = rows[t];
        r.counts[m.pair]++; r.weeks++;
        if (r.last === m.pair) r.repeats++;
        r.last = m.pair;
      }
    }
  }
  let worstSpread = 0, atBound = 0, repeats = 0;
  const out = rows.map((r) => {
    const spread = Math.max(...r.counts) - Math.min(...r.counts);
    const bound = r.weeks % P === 0 ? 0 : 1;
    worstSpread = Math.max(worstSpread, spread);
    if (spread === bound) atBound++;
    repeats += r.repeats;
    return { name: r.name, counts: r.counts, weeks: r.weeks, spread, bound, repeats: r.repeats };
  });
  const real = out.filter((r, i) => !(season.odd && i === n - 1));
  return { rows: out, worstSpread, atBound, teams: n, repeats, realRows: real };
}

/** Independent check: every week, each team once and each pair once; every pair of teams meets as often as the cycles say. */
export function validateBowling(season) {
  const problems = [];
  const n = season.teams.length, P = season.nPairs;
  const meet = new Map();
  let rr = 0;
  for (const wk of season.weeks) {
    if (wk.matches.length !== P) problems.push(`Week ${wk.week} has ${wk.matches.length} matches on ${P} pairs.`);
    const pairs = new Set(wk.matches.map((m) => m.pair));
    if (pairs.size !== wk.matches.length) problems.push(`Week ${wk.week} uses a lane pair twice.`);
    if (wk.kind !== "round") continue;
    rr++;
    const seen = new Set();
    for (const m of wk.matches) {
      for (const t of [m.a, m.b]) {
        if (seen.has(t)) problems.push(`Week ${wk.week}: ${season.teams[t]} bowls twice.`);
        seen.add(t);
      }
      const key = m.a < m.b ? `${m.a},${m.b}` : `${m.b},${m.a}`;
      meet.set(key, (meet.get(key) || 0) + 1);
    }
    if (seen.size !== n) problems.push(`Week ${wk.week}: not every team bowls.`);
  }
  const full = Math.floor(rr / (n - 1));
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const c = meet.get(`${a},${b}`) || 0;
    if (c < full || c > full + 1) problems.push(`${season.teams[a]} and ${season.teams[b]} meet ${c} times; ${rr} round-robin weeks give ${full} or ${full + 1}.`);
  }
  for (let i = 1; i < season.weeks.length; i++) {
    if (season.weeks[i].day - season.weeks[i - 1].day < 7) problems.push(`Weeks ${i} and ${i + 1} are less than a week apart.`);
  }
  return problems;
}

function matchCells(season, wk, m) {
  if (wk.kind === "position") return [m.a, m.b];
  return [season.teams[m.a], season.teams[m.b]];
}

// Every cell goes through calc.mjs csvCell, the formula-injection guard (a cell starting =, +, -,
// @, tab or CR gets an apostrophe), so a team named "=SUM(...)" stays text in a spreadsheet.
export function bowlingCsv(season) {
  const lines = [["Week", "Date", "Lanes", "Team", "Opponent", "Note"].join(",")];
  for (const wk of season.weeks) {
    for (const m of wk.matches) {
      const [a, b] = matchCells(season, wk, m);
      const note = wk.kind === "position" ? "Position round" : `Cycle ${wk.cycle}, round ${wk.round}`;
      lines.push([wk.week, dayIso(wk.day), season.labels[m.pair], a, b, note].map(csvCell).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

export function bowlingText(season) {
  const out = [];
  for (const wk of season.weeks) {
    out.push(`Week ${wk.week}, ${dayLabel(wk.day)}${wk.kind === "position" ? " (position round)" : ""}`);
    for (const m of wk.matches) {
      const [a, b] = matchCells(season, wk, m);
      out.push(`  ${season.labels[m.pair]}: ${a} v ${b}`);
    }
  }
  return out.join("\n") + "\n";
}

/** A grid with one row per team and one column per week: the lane pair it bowls on, for a printed sheet. */
export function teamLaneGrid(season) {
  return season.teams.map((name, t) => ({
    name,
    weeks: season.weeks.map((wk) => {
      if (wk.kind !== "round") return "Pos";
      const m = wk.matches.find((x) => x.a === t || x.b === t);
      return season.labels[m.pair].replace("Lanes ", "");
    }),
  }));
}
