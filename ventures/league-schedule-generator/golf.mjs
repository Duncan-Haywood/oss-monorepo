// @ts-check
// Golf league schedules: a weekly nine-hole league of two-player (or larger) teams.
//
// A twilight golf league plays the same evening every week: team against team in one group
// (a foursome for two-player teams), the round robin repeating until the season ends, alternating
// the front and back nine, and every group off at its own tee time (or from its own hole on a
// shotgun start). Players notice two things a hand-made sheet gets wrong: the same team always
// going off first (or last, finishing in the dark), and playing the same nine every week. So beyond
// "who plays whom" the job is to give every team each tee time as often as every other one, and
// not the same tee time two weeks running.
//
// Method: the circle-method rounds fix who plays whom each week; each week's groups are put on tee
// times by an assignment problem (Hungarian method, from bowling.mjs) priced on what each team has
// already had, and the season is swept, re-solving one week at a time against all the others, until
// no week improves. A team that plays W weeks on T tee times cannot spread them closer than
// floor(W/T) to ceil(W/T); `teeReport` measures every team against that bound.
//
// An odd league has a bye each week. In golf the bye team usually still plays, against the course:
// it keeps a tee time (a group of its own) and its players are scored against net par (golf-recap
// below), so it still earns points.

// CSV cells go through csvCell (calc.mjs), the formula-injection guard: a cell starting =, +, -, @,
// tab or CR gets an apostrophe so a team name never runs as a spreadsheet formula.
import { roundRobin, dayLabel, dayIso, csvCell, parseTeams, parseTime } from "./calc.mjs";
import { hungarian } from "./bowling.mjs";
import { TEE_TABLE, TEE_OUT_OF_REACH } from "./golf-tee-table.mjs";

const outOfReach = new Set(TEE_OUT_OF_REACH);
/** True when a SAT solver proved no tee-time deal gives every team its share (eval/golf-tee-sat.txt). */
export function teeBoundOutOfReach(nTeams, weeks) { return outOfReach.has(`${nTeams},${weeks}`); }

export const BYE = "Bye (v the course)";
const nineName = (n) => (n === "back" ? "Back 9" : "Front 9");

function hhmm(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Labels for the starting slots: tee times from `firstTee` every `interval` minutes, or shotgun holes. */
export function slotLabels(groups, { startType = "tee", firstTee = "16:30", interval = 9, nine = "front" } = {}) {
  if (startType === "shotgun") {
    const base = nine === "back" ? 10 : 1;
    if (groups <= 9) return Array.from({ length: groups }, (_, i) => `Hole ${base + i}`);
    return Array.from({ length: groups }, (_, i) => `Hole ${base + (i % 9)}${i < 9 ? "A" : "B"}`);
  }
  const t0 = parseTime(firstTee);
  const start = t0 ? Number(t0.slice(0, 2)) * 60 + Number(t0.slice(3)) : 16 * 60 + 30;
  return Array.from({ length: groups }, (_, i) => hhmm(start + i * interval));
}

/**
 * spec: { teams (text or array), weeks, start (day number), skipDays [day], nines: "alternate" |
 * "front" | "back", firstNine: "front"|"back", startType: "tee"|"shotgun", firstTee "16:30",
 * interval minutes, seed }.
 * Returns { errors } or a season: { teams, odd, weeks: [{ week, day, nine, groups: [{ slot, a, b }] }],
 * nSlots, startType, firstTee, interval, skipped, cycleLength }. b is null for the bye group.
 */
export function golfSchedule(spec) {
  const errors = [];
  let teams;
  if (Array.isArray(spec.teams)) {
    teams = spec.teams.map((t) => String(t).trim()).filter(Boolean);
    if (teams.length < 2) errors.push("Enter at least two teams.");
    if (teams.length > 40) errors.push("Up to 40 teams are supported.");
  } else {
    const parsed = parseTeams(spec.teams);
    teams = parsed.teams;
    errors.push(...parsed.errors);
    if (teams.length > 40) errors.push("Up to 40 teams are supported (20 groups a night).");
  }
  if (teams.some((t) => t.toLowerCase().startsWith("bye"))) errors.push(`A team name cannot start with "Bye": the odd team's week off is called "${BYE}".`);
  const weeks = Number(spec.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 40) errors.push("Weeks must be a whole number from 1 to 40.");
  if (!Number.isInteger(spec.start)) errors.push("Pick the first league night.");
  const nines = spec.nines ?? "alternate";
  if (!["alternate", "front", "back"].includes(nines)) errors.push('Nines must be "alternate", "front" or "back".');
  const firstNine = spec.firstNine === "back" ? "back" : "front";
  const startType = spec.startType === "shotgun" ? "shotgun" : "tee";
  const interval = Number(spec.interval ?? 9);
  if (startType === "tee" && (!Number.isInteger(interval) || interval < 6 || interval > 20)) errors.push("Minutes between tee times must be a whole number from 6 to 20.");
  const firstTee = String(spec.firstTee ?? "16:30");
  if (startType === "tee" && !parseTime(firstTee)) errors.push(`First tee time "${firstTee}" is not a time like 16:30 or 4:30 pm.`);
  const odd = teams.length % 2 === 1;
  const nSlots = Math.ceil(teams.length / 2);
  if (startType === "shotgun" && nSlots > 18) errors.push("A shotgun start takes up to 18 groups (two on each hole); use tee times for a bigger league.");
  if (errors.length) return { errors };

  const rounds = roundRobin(teams.length);
  const cycleLength = rounds.length;
  const skip = new Set(spec.skipDays ?? []);
  const skipped = [];
  let day = spec.start;
  const plan = [];
  for (let w = 0; w < weeks; w++) {
    while (skip.has(day)) { skipped.push(day); day += 7; }
    const r = rounds[w % cycleLength];
    const nine = nines === "alternate" ? (w % 2 === 0 ? firstNine : firstNine === "front" ? "back" : "front") : nines;
    const pairs = r.matches.map(([h, a]) => [h, a]);
    if (r.bye !== null && r.bye !== undefined) pairs.push([r.bye, null]);
    plan.push({ week: w + 1, day, nine, cycle: Math.floor(w / cycleLength) + 1, round: (w % cycleLength) + 1, pairs });
    day += 7;
  }
  const seed = Number(spec.seed ?? 1);
  const stored = seed === 1 ? storedDeal(plan, teams.length, nSlots) : null;
  const slotOf = stored ?? assignTeeSlots(plan, teams.length, nSlots, seed);
  const season = {
    teams, odd, nSlots, startType, fromTable: Boolean(stored), boundProvedOutOfReach: teeBoundOutOfReach(teams.length, weeks), firstTee, interval, skipped, cycleLength,
    weeks: plan.map((p, w) => ({
      week: p.week, day: p.day, nine: p.nine, cycle: p.cycle, round: p.round,
      groups: p.pairs.map(([a, b], g) => ({ slot: slotOf[w][g], a, b })).sort((x, y) => x.slot - y.slot),
    })),
  };
  return season;
}

/** A solver's stored deal for this season, checked again here before it is used; else null. */
function storedDeal(plan, nTeams, nSlots) {
  const deal = TEE_TABLE[`${nTeams},${plan.length}`];
  if (!deal || deal.length !== plan.length) return null;
  const count = Array.from({ length: nTeams }, () => new Array(nSlots).fill(0));
  for (let w = 0; w < plan.length; w++) {
    const row = deal[w], pairs = plan[w].pairs;
    if (!row || row.length !== pairs.length || new Set(row).size !== row.length || row.some((x) => !Number.isInteger(x) || x < 0 || x >= nSlots)) return null;
    pairs.forEach((p, g) => { for (const t of p) if (t !== null) count[t][row[g]]++; });
  }
  for (const c of count) {
    const total = c.reduce((a, b) => a + b, 0), lo = Math.floor(total / nSlots), hi = Math.ceil(total / nSlots);
    if (c.some((x) => x < lo || x > hi)) return null;
  }
  return deal.map((r) => r.slice());
}

/** The tee slot (0-based) of every group, week by week: balanced counts per team, few repeats. */
export function assignTeeSlots(plan, nTeams, nSlots, seed = 1) {
  const W = plan.length;
  const count = Array.from({ length: nTeams }, () => new Array(nSlots).fill(0));
  const slotOf = plan.map((p) => new Array(p.pairs.length).fill(-1));
  const REPEAT = 0.6;
  // A tiny seeded tilt so "another deal" can try a different but equally balanced season.
  let x = (seed * 2654435761) >>> 0;
  const tilt = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296) * 0.01;
  const tilts = plan.map((p) => p.pairs.map(() => Array.from({ length: nSlots }, () => (seed === 1 ? 0 : tilt()))));
  const teamsOf = (pair) => (pair[1] === null ? [pair[0]] : pair);
  const hiOf = new Array(nTeams).fill(0);
  for (const p of plan) for (const pair of p.pairs) for (const t of teamsOf(pair)) hiOf[t]++;
  const loOf = hiOf.map((w) => Math.floor(w / nSlots));
  for (let t = 0; t < nTeams; t++) hiOf[t] = Math.ceil(hiOf[t] / nSlots);
  const slotAt = (t, w) => {
    if (w < 0 || w >= W) return -1;
    const g = plan[w].pairs.findIndex((p) => p[0] === t || p[1] === t);
    return g < 0 ? -1 : slotOf[w][g];
  };
  const solveWeek = (w) => {
    const pairs = plan[w].pairs;
    // Take this week out of the counts, then price each (group, slot).
    pairs.forEach((p, g) => { if (slotOf[w][g] >= 0) for (const t of teamsOf(p)) count[t][slotOf[w][g]]--; });
    const cost = Array.from({ length: nSlots }, (_, g) => Array.from({ length: nSlots }, (_, s) => {
      if (g >= pairs.length) return 0;
      let c = tilts[w][g][s];
      for (const t of teamsOf(pairs[g])) {
        c += 2 * count[t][s] + 1; // the rise in the team's sum of squared counts
        if (count[t][s] + 1 > hiOf[t]) c += 40; // past the team's fair share of this slot
        if (count[t][s] < loOf[t]) c -= 40; // short of it without this week
        if (slotAt(t, w - 1) === s) c += REPEAT;
        if (slotAt(t, w + 1) === s) c += REPEAT;
      }
      return c;
    }));
    const assign = hungarian(cost);
    pairs.forEach((p, g) => { slotOf[w][g] = assign[g]; for (const t of teamsOf(p)) count[t][assign[g]]++; });
  };
  const sweepAll = () => {
    for (let sweep = 0; sweep < 30; sweep++) {
      const before = JSON.stringify(slotOf);
      for (let w = 0; w < W; w++) solveWeek(w);
      if (JSON.stringify(slotOf) === before) break;
    }
  };
  // Season score: teams off their floor/ceil share weigh most, then the sum of squared counts,
  // then repeats.
  const score = () => {
    let off = 0, sq = 0, rep = 0;
    const weeksOf = new Array(nTeams).fill(0);
    for (let t = 0; t < nTeams; t++) for (let s = 0; s < nSlots; s++) weeksOf[t] += count[t][s];
    for (let t = 0; t < nTeams; t++) {
      const lo = Math.floor(weeksOf[t] / nSlots), hi = Math.ceil(weeksOf[t] / nSlots);
      for (let s = 0; s < nSlots; s++) { const c = count[t][s]; sq += c * c; off += c < lo ? lo - c : c > hi ? c - hi : 0; }
    }
    for (let w = 1; w < W; w++) plan[w].pairs.forEach((p, g) => { for (const t of teamsOf(p)) if (slotAt(t, w - 1) === slotOf[w][g]) rep++; });
    return off * 1000 + sq + REPEAT * rep;
  };
  for (let w = 0; w < W; w++) solveWeek(w);
  sweepAll();
  // The sweep stops at a season where no single week can improve alone. Kick it: deal a few weeks
  // at random, sweep again, keep the result only if the season scores better.
  let best = score(), bestSlots = slotOf.map((r) => r.slice());
  let y = (seed * 40503 + 12345) >>> 0;
  const rnd = (k) => ((y = (y * 1103515245 + 12345) >>> 0) % k);
  for (let kick = 0; kick < 150 && W > 1; kick++) {
    for (let j = 0; j < 1 + rnd(3); j++) {
      const w = rnd(W), pairs = plan[w].pairs;
      pairs.forEach((p, g) => { for (const t of teamsOf(p)) count[t][slotOf[w][g]]--; });
      const perm = Array.from({ length: nSlots }, (_, i) => i);
      for (let i = nSlots - 1; i > 0; i--) { const k = rnd(i + 1); [perm[i], perm[k]] = [perm[k], perm[i]]; }
      pairs.forEach((p, g) => { slotOf[w][g] = perm[g]; for (const t of teamsOf(p)) count[t][perm[g]]++; });
    }
    sweepAll();
    const sc = score();
    if (sc < best - 1e-9) { best = sc; bestSlots = slotOf.map((r) => r.slice()); }
    else {
      // Back to the best season found.
      for (let t = 0; t < nTeams; t++) count[t].fill(0);
      for (let w = 0; w < W; w++) plan[w].pairs.forEach((p, g) => { slotOf[w][g] = bestSlots[w][g]; for (const t of teamsOf(p)) count[t][bestSlots[w][g]]++; });
    }
  }
  // Last, a tabu search on the teams still off their share: a move swaps the tee times of two
  // groups in one week (or moves a group to the week's empty slot), scored on the total distance
  // of every team from its floor/ceil share. Kept only if it ends with fewer teams off.
  return tabuTee(plan, nTeams, nSlots, bestSlots, loOf, hiOf, seed);
}

function offOf(c, lo, hi) { return c < lo ? lo - c : c > hi ? c - hi : 0; }

/** Tabu search over in-week slot swaps, minimising the summed distance from each team's share. */
export function tabuTee(plan, nTeams, nSlots, start, loOf, hiOf, seed = 1, maxIter = 20000) {
  const W = plan.length;
  const slotOf = start.map((r) => r.slice());
  const count = Array.from({ length: nTeams }, () => new Array(nSlots).fill(0));
  const teamsOf = (pair) => (pair[1] === null ? [pair[0]] : pair);
  // occupant[w][s] = group index or -1
  const occ = plan.map((p, w) => { const o = new Array(nSlots).fill(-1); p.pairs.forEach((_, g) => { o[slotOf[w][g]] = g; }); return o; });
  plan.forEach((p, w) => p.pairs.forEach((pair, g) => { for (const t of teamsOf(pair)) count[t][slotOf[w][g]]++; }));
  let off = 0;
  for (let t = 0; t < nTeams; t++) for (let s = 0; s < nSlots; s++) off += offOf(count[t][s], loOf[t], hiOf[t]);
  if (off === 0) return slotOf;
  let best = off, bestSlots = slotOf.map((r) => r.slice());
  const tabu = new Map();
  let y = (seed * 2246822519 + 7) >>> 0;
  const rnd = (k) => ((y = (y * 1103515245 + 12345) >>> 0) % k);
  // Delta of moving team t from slot a to slot b.
  const dMove = (t, a, b) => offOf(count[t][a] - 1, loOf[t], hiOf[t]) - offOf(count[t][a], loOf[t], hiOf[t]) + offOf(count[t][b] + 1, loOf[t], hiOf[t]) - offOf(count[t][b], loOf[t], hiOf[t]);
  for (let it = 0; it < maxIter && best > 0; it++) {
    // Pick a team off its share and a slot where it is over (or under), then try every week it could move.
    let bestDelta = Infinity, moves = [];
    for (let w = 0; w < W; w++) {
      for (let s1 = 0; s1 < nSlots; s1++) for (let s2 = s1 + 1; s2 < nSlots; s2++) {
        const g1 = occ[w][s1], g2 = occ[w][s2];
        if (g1 < 0 && g2 < 0) continue;
        let d = 0;
        const t1 = g1 < 0 ? [] : teamsOf(plan[w].pairs[g1]), t2 = g2 < 0 ? [] : teamsOf(plan[w].pairs[g2]);
        for (const t of t1) d += dMove(t, s1, s2);
        for (const t of t2) d += dMove(t, s2, s1);
        // Two teams sharing nothing: the deltas are independent, so the sum is exact.
        const key = w * 4096 + s1 * 64 + s2;
        const isTabu = (tabu.get(key) ?? -1) > it;
        if (isTabu && off + d >= best) continue;
        if (d < bestDelta) { bestDelta = d; moves = [[w, s1, s2]]; }
        else if (d === bestDelta) moves.push([w, s1, s2]);
      }
    }
    if (!moves.length) break;
    const [w, s1, s2] = moves[rnd(moves.length)];
    const g1 = occ[w][s1], g2 = occ[w][s2];
    if (g1 >= 0) { for (const t of teamsOf(plan[w].pairs[g1])) { count[t][s1]--; count[t][s2]++; } slotOf[w][g1] = s2; }
    if (g2 >= 0) { for (const t of teamsOf(plan[w].pairs[g2])) { count[t][s2]--; count[t][s1]++; } slotOf[w][g2] = s1; }
    occ[w][s1] = g2; occ[w][s2] = g1;
    off += bestDelta;
    tabu.set(w * 4096 + s1 * 64 + s2, it + 7 + rnd(10));
    if (off < best) { best = off; bestSlots = slotOf.map((r) => r.slice()); }
  }
  return bestSlots;
}

/** Per team: weeks on each tee slot, the spread, the floor/ceil bound, repeats, and the nines played. */
export function teeReport(season) {
  const rows = season.teams.map((name) => ({ name, counts: new Array(season.nSlots).fill(0), repeats: 0, front: 0, back: 0, weeks: 0, spread: 0, bound: 0 }));
  const prev = new Array(season.teams.length).fill(-1);
  for (const wk of season.weeks) {
    const seen = new Set();
    for (const g of wk.groups) for (const t of g.b === null ? [g.a] : [g.a, g.b]) {
      const r = rows[t];
      r.counts[g.slot]++; r.weeks++; r[wk.nine]++;
      if (prev[t] === g.slot) r.repeats++;
      prev[t] = g.slot; seen.add(t);
    }
    for (let t = 0; t < rows.length; t++) if (!seen.has(t)) prev[t] = -1;
  }
  let atBound = 0, worstSpread = 0;
  for (const r of rows) {
    r.spread = Math.max(...r.counts) - Math.min(...r.counts);
    r.bound = r.weeks % season.nSlots === 0 ? 0 : 1;
    if (r.spread <= r.bound) atBound++;
    worstSpread = Math.max(worstSpread, r.spread);
  }
  return { rows, atBound, teams: rows.length, worstSpread, repeats: rows.reduce((a, r) => a + r.repeats, 0) };
}

/** Problems, or []: every team in exactly one group a week, slots used once, pairs meeting evenly. */
export function validateGolf(season) {
  const out = [];
  const n = season.teams.length;
  const met = new Map();
  for (const wk of season.weeks) {
    const seen = new Set(), slots = new Set();
    for (const g of wk.groups) {
      if (slots.has(g.slot)) out.push(`Week ${wk.week}: two groups share a tee slot.`);
      slots.add(g.slot);
      for (const t of g.b === null ? [g.a] : [g.a, g.b]) {
        if (seen.has(t)) out.push(`Week ${wk.week}: ${season.teams[t]} is in two groups.`);
        seen.add(t);
      }
      if (g.b !== null) { const k = Math.min(g.a, g.b) * 64 + Math.max(g.a, g.b); met.set(k, (met.get(k) ?? 0) + 1); }
    }
    if (seen.size !== n) out.push(`Week ${wk.week}: ${n - seen.size} team(s) missing.`);
  }
  const vals = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) vals.push(met.get(a * 64 + b) ?? 0);
  if (vals.length && Math.max(...vals) - Math.min(...vals) > 1) out.push("Some pairs of teams meet more than once more than others.");
  return out;
}

export function slotNames(season, nine) {
  return slotLabels(season.nSlots, { startType: season.startType, firstTee: season.firstTee, interval: season.interval, nine });
}

function groupCells(season, g) {
  return [season.teams[g.a], g.b === null ? BYE : season.teams[g.b]];
}

export function golfCsv(season) {
  const lines = [["Week", "Date", "Nine", season.startType === "shotgun" ? "Starting hole" : "Tee time", "Team", "Opponent"].join(",")];
  for (const wk of season.weeks) {
    const names = slotNames(season, wk.nine);
    for (const g of wk.groups) lines.push([wk.week, dayIso(wk.day), nineName(wk.nine), names[g.slot], ...groupCells(season, g)].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

export function golfText(season) {
  const out = [];
  for (const wk of season.weeks) {
    out.push(`Week ${wk.week}, ${dayLabel(wk.day)}: ${nineName(wk.nine)}`);
    const names = slotNames(season, wk.nine);
    for (const g of wk.groups) { const [a, b] = groupCells(season, g); out.push(`  ${names[g.slot]}  ${a} v ${b}`); }
  }
  return out.join("\n") + "\n";
}

// ===================================================================== weekly scoring
//
// The league secretary's weekly job, on top of the schedule: hole-by-hole cards in, handicaps,
// match play points, standings and a recap out. Rules, all set by the league (the defaults are a
// common two-person twilight league's, not a golf association's rule, and the league handicap here
// is not a Handicap Index under the World Handicap System):
// - Course: par and stroke index for all 18 holes. A night's nine is ranked by stroke index within
//   it (front-nine holes usually carry the odd indexes), so stroke 1 on the nine is its hardest hole.
// - League handicap (9 holes): handicapPct% of the average of the best `best` of the last `last`
//   rounds' (adjusted gross - par of the nine), rounded to the nearest whole stroke, at least 0,
//   capped at maxHandicap. Adjusted gross caps each hole at net double bogey: par + 2 + the strokes
//   the player gets on that hole from their own handicap. A player with no rounds uses the entering
//   handicap typed for them; with neither, their first night's score sets it for that night
//   (retroactive, like a bowling league's first night) and the cap is skipped on that card.
// - Match play: in each group the players are paired low handicap against low handicap (A v A,
//   B v B). The higher handicap gets the difference in strokes, one on each of the nine's hardest
//   holes, round again past 9. Each hole: pointsPerHole to the lower net score, split on a tie. Each
//   pairing also gives pointsMatchNet to the lower total net. The team with the lower combined net
//   gets pointsTeamNet. A tie splits any of them.
// - Absent player: typed "absent". Their opponent wins every hole point and the match-net point of
//   that pairing (both absent: nobody scores it); for the team-net point the absent player counts
//   as par of the nine + absentPenalty, net.
// - Bye: the bye team plays against the course: each player against a par player of handicap 0, so
//   they get their full handicap in strokes and win a hole by beating net par.

export const GOLF_DEFAULTS = Object.freeze({
  teamSize: 2, handicapPct: 90, last: 5, best: 5, maxHandicap: 18,
  pointsPerHole: 1, pointsMatchNet: 1, pointsTeamNet: 2, absentPenalty: 3,
  skins: /** @type {string} */ ("off"), skinsEntry: 0, skinsCarry: /** @type {number} */ (0), skinsHandicapPct: 100,
});

const SKINS_KINDS = ["off", "gross", "net", "both"];

function intIn(v, lo, hi) { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; }

export function readGolfRules(input = {}) {
  const r = { ...GOLF_DEFAULTS };
  const errors = [];
  const set = (key, lo, hi, label) => {
    if (input[key] === undefined || input[key] === "" || input[key] === null) return;
    const n = intIn(input[key], lo, hi);
    if (n === null) errors.push(`${label} must be a whole number from ${lo} to ${hi}.`);
    else r[key] = n;
  };
  set("teamSize", 1, 4, "Players a team");
  set("handicapPct", 0, 100, "Handicap percentage");
  set("last", 1, 20, "Rounds counted");
  set("best", 1, 20, "Best rounds used");
  set("maxHandicap", 0, 36, "Highest handicap");
  set("pointsPerHole", 0, 5, "Points a hole");
  set("pointsMatchNet", 0, 10, "Points for the low net in a pairing");
  set("pointsTeamNet", 0, 10, "Points for the team's low net");
  set("absentPenalty", 0, 20, "Absent: strokes over par");
  set("skinsEntry", 0, 100, "Skins: entry a player");
  set("skinsCarry", 0, 1, "Skins: carry tied holes over (0 or 1)");
  set("skinsHandicapPct", 0, 100, "Skins: handicap % for net skins");
  if (input.skins !== undefined && input.skins !== "" && input.skins !== null) {
    const k = String(input.skins).trim().toLowerCase();
    if (!SKINS_KINDS.includes(k)) errors.push(`Skins must be one of ${SKINS_KINDS.join(", ")}.`);
    else r.skins = k;
  }
  if (r.best > r.last) errors.push("Best rounds used cannot be more than the rounds counted.");
  return { rules: r, errors };
}

/** Par, index and hole scores are small numbers: split on spaces, ";" or a comma that is not a
 * thousands separator, so a stray "1,500" reads as one bad number (NaN, an error), not 1 and 500. */
function smallInts(text) {
  return String(text).split(/[\s;]+|,(?!\d{3}(?!\d))/).filter(Boolean).map((t) => Number(t.replace(/,/g, "") === t ? t : NaN));
}

/**
 * "Par: 4 4 3 5 ..." and "Index: 7 15 3 ..." (18 numbers each; commas or spaces): the main tees.
 * More tees, for players who play other tees (forward, women's, senior): "Par (forward): ..." and
 * "Index (forward): ...". A named tee may give only the row that differs; the other is the main
 * tees'. Returns course = { par, index, tees } where tees maps a tee's key ("" for the main tees)
 * to { name, par, index }.
 */
export function parseCourse(text) {
  const errors = [];
  const rows = new Map(); // tee key -> { name, par, index }
  const rowOf = (name) => {
    const k = keyOf(name);
    if (!rows.has(k)) rows.set(k, { name: name.trim().replace(/\s+/g, " "), par: null, index: null });
    return rows.get(k);
  };
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(par|index|hdcp|handicap|si|stroke index)(?:\s*\(([^)]*)\))?\s*:?\s*(.*)$/i);
    if (!m) { errors.push(`Course line "${line.slice(0, 30)}": start it with "Par:" or "Index:" (or "Par (forward):" for another set of tees).`); continue; }
    const isPar = /^par/i.test(m[1]);
    const tee = (m[2] ?? "").trim();
    const where = tee ? ` (${tee})` : "";
    const nums = smallInts(m[3]);
    if (nums.length !== 18 || nums.some((x) => !Number.isInteger(x))) { errors.push(`${isPar ? "Par" : "Index"}${where} needs 18 whole numbers, hole 1 to 18 (got ${nums.length}).`); continue; }
    const row = rowOf(tee);
    if (row[isPar ? "par" : "index"]) { errors.push(`${isPar ? "Par" : "Index"}${where} is typed twice.`); continue; }
    row[isPar ? "par" : "index"] = nums;
  }
  const main = rows.get("") ?? { name: "", par: null, index: null };
  for (const row of rows.values()) {
    const where = row.name ? ` (${row.name})` : "";
    if (row.par && row.par.some((p) => p < 3 || p > 6)) errors.push(`Each hole's par${where} must be 3 to 6.`);
    if (row.index && [...row.index].sort((a, b) => a - b).some((v, i) => v !== i + 1)) errors.push(`The stroke index${where} must use each number 1 to 18 once.`);
  }
  if (!main.par) errors.push('Type the course\'s par for all 18 holes on a "Par:" line.');
  if (!main.index) errors.push('Type the stroke index (handicap row on the card) for all 18 holes on an "Index:" line.');
  if (errors.length) return { course: null, errors };
  const tees = new Map();
  for (const [k, row] of rows) tees.set(k, { name: row.name, par: row.par ?? main.par, index: row.index ?? main.index });
  if (!tees.has("")) tees.set("", { name: "", par: main.par, index: main.index });
  return { course: { par: main.par, index: main.index, tees }, errors };
}

/** The par and index rows a player's tee uses: the named tee, else the main tees. */
export function teeRows(course, tee = "") {
  return course.tees?.get(keyOf(tee ?? "")) ?? { name: "", par: course.par, index: course.index };
}

/** Holes of a nine (0-based hole numbers) and the stroke order within it: order[k] = rank 0 (hardest)..8. */
export function nineHoles(course, nine, tee = "") {
  const t = teeRows(course, tee);
  const holes = Array.from({ length: 9 }, (_, i) => (nine === "back" ? 9 + i : i));
  const byIndex = [...holes].sort((a, b) => t.index[a] - t.index[b]);
  const rank = holes.map((h) => byIndex.indexOf(h));
  return { holes, rank, par: holes.map((h) => t.par[h]), parTotal: holes.reduce((s, h) => s + t.par[h], 0) };
}

/** Strokes received on each of the nine's holes for a handicap difference d (>= 0). */
export function strokesOn(rank, d) {
  return rank.map((r) => (d <= 0 ? 0 : Math.floor(d / 9) + (r < d % 9 ? 1 : 0)));
}

/** League handicap from the score differentials (adjusted gross - par), most recent last. */
export function golfHandicap(diffs, rules) {
  if (!diffs.length) return null;
  const recent = diffs.slice(-rules.last);
  const used = [...recent].sort((a, b) => a - b).slice(0, Math.min(rules.best, recent.length));
  const avg = used.reduce((a, b) => a + b, 0) / used.length;
  let h = Math.round((rules.handicapPct * avg) / 100 + 1e-9);
  if (h < 0) h = 0;
  if (h > rules.maxHandicap) h = rules.maxHandicap;
  return h;
}

const keyOf = (name) => String(name).trim().replace(/\s+/g, " ").toLowerCase();

/** "Ana 12, Ben Ortiz 7": entering 9-hole handicaps by player name. */
export function parseEnteringHandicaps(text) {
  const map = new Map(), errors = [];
  for (const part of String(text ?? "").split(/[\n,;]+/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(.*\S)\s+(\d{1,2})$/);
    if (!m || Number(m[2]) > 36) { errors.push(`Entering handicap "${s}": write a name and a whole number up to 36, like "Ana 12".`); continue; }
    map.set(keyOf(m[1]), Number(m[2]));
  }
  return { map, errors };
}

/** "Birdie Brothers: Ana, Ben (forward)" one team per line: who plays for which team, and from
 * which tees when not the main ones (the name in brackets is a tee named on the course card). */
export function parseRosters(text, teams, rules) {
  const errors = [], roster = new Map(), playerTeam = new Map(), playerTee = new Map();
  const byLength = [...teams].sort((a, b) => b.length - a.length);
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const team = byLength.find((t) => line.toLowerCase().startsWith(t.toLowerCase()) && /^\s*:/.test(line.slice(t.length)));
    if (!team) { errors.push(`Roster line "${line.slice(0, 40)}" does not start with a team name and a colon (teams: ${teams.join(", ")}).`); continue; }
    const names = [];
    for (const cell of line.slice(line.indexOf(":", team.length) + 1).split(/[,;]+/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean)) {
      const tm = cell.match(/^(.*\S)\s*\(([^)]*)\)$/);
      const name = tm ? tm[1] : cell;
      if (tm && tm[2].trim()) playerTee.set(keyOf(name), tm[2].trim());
      names.push(name);
    }
    if (names.length !== rules.teamSize) { errors.push(`${team} has ${names.length} player${names.length === 1 ? "" : "s"}; a team is ${rules.teamSize} (change "Players a team" or the roster).`); continue; }
    for (const n of names) {
      if (playerTeam.has(keyOf(n))) { errors.push(`${n} is on two teams (${playerTeam.get(keyOf(n))} and ${team}); give one a surname or initial.`); continue; }
      playerTeam.set(keyOf(n), team);
    }
    roster.set(team, names);
  }
  for (const t of teams) if (!roster.has(t)) errors.push(`${t} has no roster line ("${t}: Name, Name").`);
  return { roster, playerTeam, playerTee, errors };
}

/**
 * Cards, one block per week: a "Week 1" line, then one player per line with nine hole scores, or
 * "absent". A sub plays under the rostered player's name (the league's own rules decide subs).
 *   Week 1
 *   Ana: 5 4 6 3 5 4 5 6 4
 *   Ben absent
 */
export function parseCards(text, playerTeam) {
  const errors = [], weeks = new Map();
  let week = null;
  const lines = String(text ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const wm = line.match(/^week\s+(\d{1,2})\s*:?\s*$/i);
    if (wm) {
      week = Number(wm[1]);
      if (weeks.has(week)) errors.push(`Line ${i + 1}: week ${week} is typed twice; put all its cards under one "Week ${week}" line.`);
      else weeks.set(week, new Map());
      continue;
    }
    if (week === null) { errors.push(`Line ${i + 1}: start with a "Week 1" line before the cards.`); continue; }
    const absent = line.match(/^(.*?\S)\s*:?\s+(absent|abs)$/i);
    let name, card;
    if (absent) { name = absent[1]; card = { absent: true, holes: [] }; }
    else {
      const m = line.match(/^(.*?\S)\s*:?\s+((?:\d{1,2}[\s,]+){8}\d{1,2})$/);
      if (!m) { errors.push(`Line ${i + 1}: "${line.slice(0, 40)}" should be a player's name and nine hole scores (or "absent").`); continue; }
      name = m[1];
      card = { absent: false, holes: smallInts(m[2]) };
      if (card.holes.some((h) => h < 1 || h > 15)) { errors.push(`Line ${i + 1}: ${name}'s hole scores must be 1 to 15.`); continue; }
    }
    const k = keyOf(name);
    if (!playerTeam.has(k)) { errors.push(`Line ${i + 1}: "${name}" is not on any roster.`); continue; }
    const sheet = weeks.get(week);
    if (sheet.has(k)) { errors.push(`Line ${i + 1}: ${name} has two cards in week ${week}.`); continue; }
    sheet.set(k, card);
  }
  return { weeks, errors };
}

const sum = (a) => a.reduce((x, y) => x + y, 0);

/**
 * One pairing's match play: per-hole and match-net points for two players (either may be absent or
 * "par"). Players on different tees: `nineQ` is q's nine (par and stroke order from q's tees; p's
 * is `nine`). A league handicap is strokes over the player's own par, so the player on the tees
 * with the higher par for the nine gets the difference in par as extra strokes (the same
 * adjustment the World Handicap System makes for mixed tees, applied here to a league handicap),
 * and the strokes fall on the receiving player's own stroke index. "Par" plays the opponent's tees.
 */
export function playPairing(p, q, nine, rules, nineQ = nine) {
  // p, q: { absent, holes, handicap } or { par: true } for the course.
  const pts = [0, 0];
  const holes = [0, 0];
  const holeNets = [null, null];
  if (p.par) nine = nineQ;
  if (q.par) nineQ = nine;
  if (p.absent && q.absent) return { pts, holes, strokes: [new Array(9).fill(0), new Array(9).fill(0)], nets: [null, null], parAdjust: [0, 0] };
  const low = Math.min(nine.parTotal, nineQ.parTotal);
  const parAdjust = [nine.parTotal - low, nineQ.parTotal - low];
  const hp = (p.par ? 0 : p.handicap) + parAdjust[0], hq = (q.par ? 0 : q.handicap) + parAdjust[1];
  const d = Math.abs(hp - hq);
  const zero = new Array(9).fill(0);
  const strokes = hp > hq ? [strokesOn(nine.rank, d), zero] : [zero, strokesOn(nineQ.rank, d)];
  if (p.absent || q.absent) {
    const w = p.absent ? 1 : 0;
    pts[w] += rules.pointsPerHole * 9 + rules.pointsMatchNet;
    holes[w] = 9;
    return { pts, holes, strokes, nets: [null, null], parAdjust };
  }
  const gross = [p.par ? nine.par : p.holes, q.par ? nineQ.par : q.holes];
  for (let s = 0; s < 2; s++) holeNets[s] = gross[s].map((g, h) => g - strokes[s][h]);
  for (let h = 0; h < 9; h++) {
    const a = holeNets[0][h], b = holeNets[1][h];
    if (a < b) { pts[0] += rules.pointsPerHole; holes[0]++; }
    else if (b < a) { pts[1] += rules.pointsPerHole; holes[1]++; }
    else { pts[0] += rules.pointsPerHole / 2; pts[1] += rules.pointsPerHole / 2; }
  }
  const na = sum(gross[0]) - hp, nb = sum(gross[1]) - hq;
  if (na < nb) pts[0] += rules.pointsMatchNet;
  else if (nb < na) pts[1] += rules.pointsMatchNet;
  else { pts[0] += rules.pointsMatchNet / 2; pts[1] += rules.pointsMatchNet / 2; }
  return { pts, holes, strokes, nets: [na, nb], parAdjust };
}

// ===================================================================== skins
//
// A skins game on the side of the match: every hole is a skin, won by the one player with the
// lowest score on it; a tie for low wins nothing (or, with carry-over on, the skin rides on to the
// next hole, and skins still tied after the ninth are not won). Gross skins compare scores, net
// skins scores less the player's strokes on that hole (skinsHandicapPct% of their league handicap,
// on their own tees' stroke index). Players from different tees are compared by score against
// their own par on the hole, which is the same comparison when everyone plays the same tees. An
// entry (0 by default: skins counted, no money) makes a pot of entry x players, shared by the
// skins won; a night where nobody wins a skin returns the entries.

/** One night's skins among `entrants`: [{ key, name, team, toPar: 9 numbers }]. */
export function skinsGame(entrants, { entry = 0, carry = false } = {}) {
  /** @type {{ hole: number, units: number, key: any, name: any, team: any, toPar: number, value?: number, holeNumber?: number }[]} */
  const won = [];
  let riding = 0, carriedOff = 0;
  for (let h = 0; h < 9; h++) {
    const units = 1 + riding;
    if (!entrants.length) break;
    const low = Math.min(...entrants.map((e) => e.toPar[h]));
    const at = entrants.filter((e) => e.toPar[h] === low);
    if (at.length === 1) { won.push({ hole: h, units, key: at[0].key, name: at[0].name, team: at[0].team, toPar: low }); riding = 0; }
    else if (carry) riding = units;
  }
  carriedOff = riding;
  const pot = entry * entrants.length;
  const unitsWon = won.reduce((a, w) => a + w.units, 0);
  const perSkin = unitsWon ? pot / unitsWon : 0;
  const payout = new Map();
  for (const w of won) {
    w.value = Math.round(w.units * perSkin * 100) / 100;
    const prev = payout.get(w.key) ?? { name: w.name, team: w.team, skins: 0, money: 0 };
    prev.skins += w.units; prev.money = Math.round((prev.money + w.value) * 100) / 100;
    payout.set(w.key, prev);
  }
  return { entrants: entrants.length, won, pot, unitsWon, perSkin: Math.round(perSkin * 100) / 100, carriedOff, refunded: pot > 0 && unitsWon === 0, payout };
}

/** "Ana, Ben, Cy": the players in the skins (empty: everyone with a card that night). */
export function parseSkinsPlayers(text, playerTeam) {
  const keys = new Set(), errors = [];
  for (const part of String(text ?? "").split(/[\n,;]+/)) {
    const n = part.trim();
    if (!n) continue;
    if (!playerTeam.has(keyOf(n))) { errors.push(`Skins player "${n}" is not on any roster.`); continue; }
    keys.add(keyOf(n));
  }
  return { keys, errors };
}

/**
 * The whole recap. season: from golfSchedule. Returns { errors, nights, standings, players, rules }.
 */
export function golfRecap(season, { course: courseText = "", rosters = "", cards = "", entering = "", skinsPlayers = "", rules: ruleInput = {} } = {}) {
  const { rules, errors } = readGolfRules(ruleInput);
  const empty = (errs) => ({ errors: errs, nights: [], standings: [], players: [], rules });
  if (errors.length) return empty(errors);
  const { course, errors: ce } = parseCourse(courseText);
  const ros = parseRosters(rosters, season.teams, rules);
  const ent = parseEnteringHandicaps(entering);
  errors.push(...ce, ...ros.errors, ...ent.errors);
  if (errors.length) return empty(errors);
  for (const [k, tee] of ros.playerTee) if (!course.tees.has(keyOf(tee))) {
    const named = [...course.tees.values()].map((t) => t.name).filter(Boolean);
    errors.push(`${[...ros.roster.values()].flat().find((n) => keyOf(n) === k)} plays from "${tee}" tees, which the course card does not name (${named.length ? `it names: ${named.join(", ")}` : 'add "Par (' + tee + '):" and "Index (' + tee + '):" lines'}).`);
  }
  const skinsIn = parseSkinsPlayers(skinsPlayers, ros.playerTeam);
  errors.push(...skinsIn.errors);
  if (errors.length) return empty(errors);
  const teeOf = (k) => ros.playerTee.get(k) ?? "";
  const parsed = parseCards(cards, ros.playerTeam);
  if (parsed.errors.length) return empty(parsed.errors);
  for (const w of parsed.weeks.keys()) if (w < 1 || w > season.weeks.length) errors.push(`Week ${w} is not in the schedule (it has ${season.weeks.length} weeks).`);
  if (errors.length) return empty(errors);

  const players = new Map();
  for (const [team, names] of ros.roster) for (const name of names) {
    players.set(keyOf(name), { name, team, tee: teeRows(course, teeOf(keyOf(name))).name, diffs: [], rounds: 0, absences: 0, grossTotal: 0, lowGross: null, lowNet: null, skins: 0, skinsMoney: 0, entering: ent.map.has(keyOf(name)) ? ent.map.get(keyOf(name)) : null });
  }
  const handicapNow = (pl) => golfHandicap(pl.diffs, rules) ?? pl.entering;
  const stats = new Map(season.teams.map((t) => [t, { team: t, points: 0, played: 0, net: 0, holesWon: 0 }]));
  const nights = [];
  const weekNums = [...parsed.weeks.keys()].sort((a, b) => a - b);
  for (const wn of weekNums) {
    const wk = season.weeks[wn - 1];
    const sheet = parsed.weeks.get(wn);
    const nine = nineHoles(course, wk.nine);
    const nineCache = new Map();
    const nineOf = (k) => { const t = keyOf(teeOf(k)); if (!nineCache.has(t)) nineCache.set(t, nineHoles(course, wk.nine, teeOf(k))); return nineCache.get(t); };
    // Who is missing a card this week is a typing gap, not an absence: say so.
    for (const g of wk.groups) for (const t of g.b === null ? [g.a] : [g.a, g.b]) for (const name of ros.roster.get(season.teams[t])) {
      if (!sheet.has(keyOf(name))) errors.push(`Week ${wn}: no card for ${name} (${season.teams[t]}); type their nine scores or "${name} absent".`);
    }
    if (errors.length) continue;
    // Handicaps for tonight: from rounds before tonight; a player with none and no entering handicap
    // gets one from tonight's own card (no net double bogey cap on that card).
    const tonight = new Map();
    for (const [k, card] of sheet) {
      const pl = players.get(k);
      let h = handicapNow(pl), retro = false;
      if (h === null && !card.absent) { h = golfHandicap([sum(card.holes) - nineOf(k).parTotal], rules); retro = true; }
      tonight.set(k, { ...card, key: k, handicap: h ?? 0, name: pl.name, team: pl.team, tee: pl.tee, nine: nineOf(k), retro, noHandicap: h === null });
    }
    const side = (t) => ros.roster.get(season.teams[t]).map((n) => tonight.get(keyOf(n))).sort((a, b) => a.handicap - b.handicap || a.name.localeCompare(b.name));
    const matches = [];
    for (const g of wk.groups) {
      const A = side(g.a);
      const B = g.b === null ? A.map(() => ({ par: true, name: "Par", handicap: 0, absent: false })) : side(g.b);
      const pairings = A.map((p, i) => ({ a: p, b: B[i], ...playPairing(p, B[i], p.nine ?? nine, rules, B[i].nine ?? nine) }));
      // Team net on the main tees' par: each player's net over their own par, plus the main par.
      const teamNet = (S) => sum(S.map((p) => (p.par ? nine.parTotal : p.absent ? nine.parTotal + rules.absentPenalty : sum(p.holes) - p.handicap - p.nine.parTotal + nine.parTotal)));
      const na = teamNet(A), nb = teamNet(B);
      const pts = [sum(pairings.map((x) => x.pts[0])), sum(pairings.map((x) => x.pts[1]))];
      if (na < nb) pts[0] += rules.pointsTeamNet; else if (nb < na) pts[1] += rules.pointsTeamNet; else { pts[0] += rules.pointsTeamNet / 2; pts[1] += rules.pointsTeamNet / 2; }
      const sa = stats.get(season.teams[g.a]);
      sa.points += pts[0]; sa.played++; sa.net += na; sa.holesWon += sum(pairings.map((x) => x.holes[0]));
      if (g.b !== null) { const sb = stats.get(season.teams[g.b]); sb.points += pts[1]; sb.played++; sb.net += nb; sb.holesWon += sum(pairings.map((x) => x.holes[1])); }
      matches.push({ slot: g.slot, a: season.teams[g.a], b: g.b === null ? null : season.teams[g.b], pairings, teamNet: [na, nb], points: pts });
    }
    // Skins, on tonight's handicaps (before tonight's rounds count).
    /** @type {{ gross?: ReturnType<typeof skinsGame>, net?: ReturnType<typeof skinsGame> } | null} */
    let skins = null;
    if (rules.skins !== "off") {
      const field = [...tonight.values()].filter((c) => !c.absent && (!skinsIn.keys.size || skinsIn.keys.has(c.key)));
      const game = (net) => skinsGame(field.map((c) => {
        const st = net ? strokesOn(c.nine.rank, Math.round((c.handicap * rules.skinsHandicapPct) / 100 + 1e-9)) : new Array(9).fill(0);
        return { key: c.key, name: c.name, team: c.team, toPar: c.holes.map((g, h) => g - st[h] - c.nine.par[h]) };
      }), { entry: rules.skinsEntry, carry: rules.skinsCarry === 1 });
      skins = {};
      if (rules.skins === "gross" || rules.skins === "both") skins.gross = game(false);
      if (rules.skins === "net" || rules.skins === "both") skins.net = game(true);
      for (const g of Object.values(skins)) {
        for (const w of g.won) w.holeNumber = nine.holes[w.hole] + 1;
        for (const [k, pay] of g.payout) { const pl = players.get(k); pl.skins += pay.skins; pl.skinsMoney = Math.round((pl.skinsMoney + pay.money) * 100) / 100; }
      }
    }
    // Then tonight's rounds go into each player's record, capped at net double bogey on their own tees.
    for (const [k, card] of tonight) {
      const pl = players.get(k);
      if (card.absent) { pl.absences++; continue; }
      const own9 = card.nine;
      const own = strokesOn(own9.rank, card.handicap);
      const adjusted = card.retro ? sum(card.holes) : sum(card.holes.map((s, h) => Math.min(s, own9.par[h] + 2 + own[h])));
      pl.diffs.push(adjusted - own9.parTotal);
      pl.rounds++;
      const gross = sum(card.holes), net = gross - card.handicap;
      pl.grossTotal += gross;
      pl.lowGross = pl.lowGross === null ? gross : Math.min(pl.lowGross, gross);
      pl.lowNet = pl.lowNet === null ? net : Math.min(pl.lowNet, net);
      card.adjusted = adjusted;
    }
    nights.push({ week: wn, day: wk.day, nine: wk.nine, parTotal: nine.parTotal, matches, skins });
  }
  if (errors.length) return empty(errors);
  const standings = [...stats.values()].sort((a, b) => b.points - a.points || b.holesWon - a.holesWon || a.team.localeCompare(b.team));
  let place = 0;
  standings.forEach((s, i) => { if (i === 0 || s.points !== standings[i - 1].points || s.holesWon !== standings[i - 1].holesWon) place = i + 1; s.place = place; });
  const playerRows = [...players.values()].map((pl) => ({
    name: pl.name, team: pl.team, tee: pl.tee, rounds: pl.rounds, absences: pl.absences, skins: pl.skins, skinsMoney: pl.skinsMoney,
    average: pl.rounds ? Math.round((pl.grossTotal / pl.rounds) * 10) / 10 : null,
    handicap: handicapNow(pl), lowGross: pl.lowGross, lowNet: pl.lowNet,
  })).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  return { errors: [], nights, standings, players: playerRows, rules };
}

const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function golfRecapText(recap) {
  const out = [];
  const n = recap.nights[recap.nights.length - 1];
  if (n) {
    out.push(`Week ${n.week}, ${dayLabel(n.day)} (${nineName(n.nine)}, par ${n.parTotal})`);
    for (const m of n.matches) {
      out.push(`  ${m.a} ${fmt(m.points[0])} - ${fmt(m.points[1])} ${m.b ?? "the course"}`);
      for (const p of m.pairings) {
        const label = (x) => (x.par ? "Par" : `${x.name} (${x.handicap})${x.absent ? " absent" : ""}`);
        out.push(`    ${label(p.a)} ${fmt(p.pts[0])} - ${fmt(p.pts[1])} ${label(p.b)}`);
      }
    }
    for (const [kind, g] of Object.entries(n.skins ?? {})) out.push(...skinsLines(kind, g));
    out.push("");
  }
  out.push("Standings");
  for (const s of recap.standings) out.push(`  ${s.place}. ${s.team}  ${fmt(s.points)} pts  (${s.holesWon} holes won)`);
  out.push("", "Handicaps for next week");
  for (const p of recap.players) out.push(`  ${p.name} (${p.team}): ${p.handicap ?? "-"}`);
  return out.join("\n") + "\n";
}

const money = (x) => x.toFixed(2);

/** A night's skins as text lines: who won which hole, and the pot. */
export function skinsLines(kind, g) {
  const head = `  ${kind === "net" ? "Net" : "Gross"} skins (${g.entrants} in${g.pot ? `, pot ${money(g.pot)}` : ""})`;
  if (!g.won.length) return [head + ": none won" + (g.refunded ? ", entries returned" : "")];
  return [head + ":", ...g.won.map((w) => `    Hole ${w.holeNumber}: ${w.name}${w.units > 1 ? ` (${w.units} skins)` : ""}${g.pot ? ` ${money(w.value)}` : ""}`),
    ...(g.carriedOff ? [`    ${g.carriedOff} skin${g.carriedOff === 1 ? "" : "s"} still tied after the last hole: not won`] : [])];
}

export function golfStandingsCsv(recap) {
  return [["Place", "Team", "Points", "Matches", "Holes won", "Team net total"].join(","), ...recap.standings.map((s) => [s.place, s.team, fmt(s.points), s.played, s.holesWon, s.net].map(csvCell).join(","))].join("\n") + "\n";
}

export function golfPlayersCsv(recap) {
  return [["Player", "Team", "Rounds", "Absent", "Average gross", "Handicap next week", "Low gross", "Low net", "Tees", "Skins", "Skins winnings"].join(","), ...recap.players.map((p) => [p.name, p.team, p.rounds, p.absences, p.average ?? "", p.handicap ?? "", p.lowGross ?? "", p.lowNet ?? "", p.tee || "main", p.skins, money(p.skinsMoney)].map(csvCell).join(","))].join("\n") + "\n";
}
