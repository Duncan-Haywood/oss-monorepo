// League schedule generator, schedule.mjs: The season itself: text fields, slot assignment, building the dated schedule,
// the independent validator, rainouts, pins, withdrawals, late joiners, shared grounds and linked teams.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { CARRY_OVER_PICK, carryOver } from "./carryover-core.mjs";
import { parseDateList, dateOrder, MIXED_ORDER, parseTime, parseDate, parseWeekdays, nextPlayDay, MAX_SCAN_DAYS, dayLabel, dayIso } from "./dates.mjs";
import { teamIndex, parseTeams, MAX_TEAMS } from "./names.mjs";
import { roundRobin, countBreaks } from "./rounds.mjs";
import { mulberry32 } from "./rng.mjs";
import { csvRows, parseCourtClosures, courtClosedOn, parseNameList, parseTimes, relabelPlan, forfeitReport } from "./fields.mjs";
export { csvRows, parseCourtClosures, courtClosedOn, parseNameList, parseTimes, relabelPlan, forfeitReport };

// The carry-over search and the doubleheader night designs (carryover.mjs, nights.mjs, and the orienter,
// session designs and WebAssembly behind them: 117 kB of the single-league page's 226 kB gzip) are handed
// in rather than imported (2026-11-23), so a page that builds a plain season never fetches them.
// calc.mjs hands them in as it loads, so the server, the tests and the eval scripts see no change; the
// single-league page imports both and hands them in before a season that needs them (needsSeasonSearches).
let carryOverKeepIndex, bestCarryOverRounds, carryOverSummary, lowCarryOverDoubleRounds, lowCarryOverRounds;
let waitFreeNights, seasonLayout, waitFreeProvedImpossible, waitFreePossible;
/** Hand in the carry-over search (carryover.mjs's exports) and the night designs (nights.mjs's). */
export function useSeasonSearches(carry, nights) {
  ({ carryOverKeepIndex, bestCarryOverRounds, carryOverSummary, lowCarryOverDoubleRounds, lowCarryOverRounds } = carry);
  ({ waitFreeNights, seasonLayout, waitFreeProvedImpossible, waitFreePossible } = nights);
}
/** True once useSeasonSearches has run. */
export const seasonSearchesReady = () => typeof seasonLayout === "function" && typeof bestCarryOverRounds === "function";
/** Whether buildSchedule(spec) reaches the carry-over search or the night designs: an even carry-over at 4+ teams, or 2+ games a night. */
export function needsSeasonSearches(spec) {
  const games = spec && spec.gamesPerNight !== undefined && spec.gamesPerNight !== null ? spec.gamesPerNight : 1;
  return Boolean(spec && ((spec.carryOver && (spec.teams || []).length >= 4) || games > 1));
}

// ---------------------------------------------------------------- text fields

/** Lines like "Hawks: 2026-11-05, 2026-11-12 to 2026-11-19" or "Hawks cannot play 2026-11-05". */
export function parseBlackouts(text, teams) {
  const blackouts = {};
  const errors = [];
  const order = dateOrder(text);
  if (order.mixed) errors.push(MIXED_ORDER);
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*(?::|\bcannot play\b|\bcan't play\b|\bunavailable\b)\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: write the team, a colon, then the dates (Hawks: 2026-11-05).`); continue; }
    const idx = teamIndex(teams, m[1]);
    if (idx < 0) { errors.push(`Line ${i + 1}: "${m[1].trim()}" is not one of the teams.`); continue; }
    const { days, errors: e } = parseDateList(m[2], order.order ?? null);
    for (const x of e) errors.push(`Line ${i + 1}: ${x}`);
    blackouts[idx] = [...new Set([...(blackouts[idx] || []), ...days])].sort((a, b) => a - b);
  }
  return { blackouts, errors };
}

/**
 * A coach sign-up form's export (Google Forms, Typeform, a spreadsheet saved as CSV) turned into the blackout box text
 * `parseBlackouts` reads, for a one-division league. The team column is found by header ("Team", "Team name"); date
 * columns are any header mentioning "date", "unavailable", "cannot", "can't", "blackout" or "bye". Cells may hold
 * several dates or ranges split by commas, semicolons or newlines; "none"/"n/a" cells are skipped; a team that answers
 * twice has its dates merged. Returns { text, errors[] }; a row naming no known team is reported, never guessed.
 */
// A CSV reader, not a writer: nothing here goes out as a CSV cell. Every CSV this tool writes goes through
// csvCell in outputs.mjs, the formula-injection guard (a cell starting =, +, -, @, tab or CR is prefixed).
export function blackoutsFromCsv(csv, teams) {
  const rows = csvRows(csv), errors = [];
  if (rows.length < 2) return { text: "", errors: ["The CSV needs a header row and at least one answer."] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const teamCol = head.findIndex((h) => /^(team|team name|club team)\b/.test(h));
  const dateCols = head.map((h, i) => (/(date|unavailab|cannot|can't|cant|blackout|bye)/.test(h) ? i : -1)).filter((i) => i >= 0 && i !== teamCol);
  if (teamCol < 0) return { text: "", errors: ['No team column: name one header "Team".'] };
  if (!dateCols.length) return { text: "", errors: ['No date column: name one header "Dates unavailable" (or one containing "date", "cannot" or "blackout").'] };
  const merged = new Map();
  for (const [ri, r] of rows.slice(1).entries()) {
    const tname = (r[teamCol] || "").trim();
    const idx = teamIndex(teams, tname);
    if (idx < 0) { errors.push(`Row ${ri + 2}: "${tname}" is not one of the teams.`); continue; }
    const cells = dateCols.map((c) => (r[c] || "").trim()).filter((x) => x && !/^(none|n\/a|na|no|-|nil)$/i.test(x));
    if (!cells.length) continue;
    const parts = cells.join(",").split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean);
    merged.set(teams[idx], [...(merged.get(teams[idx]) || []), ...parts]);
  }
  return { text: [...merged].map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n"), errors };
}

/** Lines like "Cubs: 17:00, 18:00" or "Cubs can only play 5pm": the only times that team may be given. */
export function parseTimeLimits(text, teams) {
  const limits = {};
  const errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*(?::|\bcan only play\b|\bonly plays\b|\bonly at\b)\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: write the team, a colon, then the times (Cubs: 17:00, 18:00).`); continue; }
    const idx = teamIndex(teams, m[1]);
    if (idx < 0) { errors.push(`Line ${i + 1}: "${m[1].trim()}" is not one of the teams.`); continue; }
    const t = parseTimes(m[2]);
    for (const x of t.errors) errors.push(`Line ${i + 1}: ${x}`);
    if (t.times.length) limits[idx] = [...new Set([...(limits[idx] || []), ...t.times])].sort();
  }
  return { limits, errors };
}

/** Lines like "Cubs: Court 1, Court 2": the only courts that team may be given (matched to the league's court names). */

export function parseCourtLimits(text, teams, courts = null) {
  const limits = {};
  const errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*(?::|\bcan only play on\b|\bonly plays on\b)\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: write the team, a colon, then the courts (Cubs: Field 2).`); continue; }
    const idx = teamIndex(teams, m[1]);
    if (idx < 0) { errors.push(`Line ${i + 1}: "${m[1].trim()}" is not one of the teams.`); continue; }
    const names = [];
    for (const c of parseNameList(m[2])) {
      const hit = courts ? courts.find((x) => x.toLowerCase() === c.toLowerCase()) : c;
      if (!hit) errors.push(`Line ${i + 1}: "${c}" is not one of the courts.`);
      else if (!names.includes(hit)) names.push(hit);
    }
    if (names.length) limits[idx] = [...new Set([...(limits[idx] || []), ...names])];
  }
  return { limits, errors };
}

/** Turn the page's text fields into a spec for buildSchedule. */
export function readSpec(f) {
  const errors = [];
  const t = parseTeams(f.teams);
  errors.push(...t.errors);
  const start = parseDate(f.start);
  if (start === null) errors.push("The season start date must be a real date, like 2026-10-06.");
  const w = parseWeekdays(f.weekdays);
  errors.push(...w.errors);
  if (!w.weekdays.length) errors.push("Pick at least one weekday to play on.");
  const skip = parseDateList(f.skip);
  errors.push(...skip.errors.map((e) => `Skip dates: ${e}`));
  const b = parseBlackouts(f.blackouts, t.teams);
  errors.push(...b.errors);
  const times = parseTimes(f.times);
  errors.push(...times.errors);
  const tl = parseTimeLimits(f.timeLimits, t.teams);
  errors.push(...tl.errors);
  const courtNames = parseNameList(f.courts);
  const cl = parseCourtLimits(f.courtLimits, t.teams, courtNames.length ? courtNames : null);
  errors.push(...cl.errors);
  const cc = parseCourtClosures(f.courtClosures, courtNames.length ? courtNames : null);
  errors.push(...cc.errors);
  const seed = Number.isFinite(Number(f.seed)) ? Math.trunc(Number(f.seed)) : 1;
  const minutes = f.minutes === undefined || f.minutes === "" ? 60 : Number(f.minutes);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 600) errors.push("Match length must be between 5 and 600 minutes.");
  let rounds = null;
  if (f.rounds !== undefined && String(f.rounds).trim() !== "") {
    const r = Number(f.rounds);
    const full = t.teams.length >= 2 ? roundRobin(t.teams.length, { double: Boolean(f.double) }).length : 0;
    if (!Number.isInteger(r) || r < 1) errors.push("Rounds to play must be a whole number of 1 or more, or blank for the full round robin.");
    else if (full && r < full) rounds = r;
    else if (full && r > full) errors.push(`${t.teams.length} teams have only ${full} round(s) in a ${f.double ? "double" : "single"} round robin; leave rounds blank or enter ${full} or fewer.`);
  }
  let gamesPerNight = 1;
  if (f.gamesPerNight !== undefined && String(f.gamesPerNight).trim() !== "") {
    const g = Number(f.gamesPerNight);
    if (!Number.isInteger(g) || g < 1 || g > MAX_GAMES_PER_NIGHT) errors.push(`Games per team per night must be a whole number from 1 to ${MAX_GAMES_PER_NIGHT}.`);
    else gamesPerNight = g;
  }
  return {
    errors,
    spec: {
      ...(gamesPerNight > 1 ? { gamesPerNight } : {}), rounds, ...(rounds && f.balanceSeeds ? { balanceSeeds: true } : {}), teams: t.teams, double: Boolean(f.double), ...(f.double && f.reverseLeg ? { reverseLeg: true } : {}), carryOver: Boolean(f.carryOver), carryOverPick: Object.hasOwn(CARRY_OVER_PICK, f.carryOverPick) ? CARRY_OVER_PICK[f.carryOverPick] : CARRY_OVER_PICK.balanced, ...(f.carryOverKeep ? { carryOverKeep: String(f.carryOverKeep) } : {}), start, weekdays: w.weekdays, skipDays: skip.days,
      blackouts: b.blackouts, timeLimits: tl.limits, courtLimits: cl.limits, courtClosures: cc.closures, courts: courtNames, times: times.times, seed, minutes,
    },
  };
}

// ---------------------------------------------------------------- slot assignment

const LIMIT_PENALTY = 1000;
const NIGHT_GAP_PENALTY = 200;
// A team in two places at one time is never worth it. It was LIMIT_PENALTY (1000) until 2026-11-15,
// and one swap touches up to four teams, each with up to `times` idle slots at NIGHT_GAP_PENALTY:
// at 44 teams on 11 courts x 6 times (seed 2) a swap double-booked a team to save six idle slots.
// One swap's gap change is at most 4 x times x NIGHT_GAP_PENALTY, far under this.
const CLASH_PENALTY = 1e7;
/** Most games one team plays on one night (a doubleheader is 2). */
export const MAX_GAMES_PER_NIGHT = 4;

function sumSq(arr) {
  let s = 0;
  for (const v of arr) s += v * v;
  return s;
}

/**
 * Give every match a (time, court) slot in its round so that each team's court use and
 * time-slot use are as even as possible across the season. Simulated annealing over swaps
 * and moves inside a round with a seeded PRNG, so the same seed gives the same schedule.
 * `banned[team]` (optional) is a set of time indexes that team may not be given; each use costs
 * LIMIT_PENALTY, far more than any evenness gain, so the search clears them whenever it can.
 * `bannedCourts[team]` does the same for court indexes.
 * `closedByRound[i]` (optional) is a Set of slot indexes round i may not use (a closed court).
 * Mutates match.slot; returns the final cost (sum over teams of squared usage counts).
 */
export function assignSlots(rounds, nTeams, courtCount, timeCount, seed = 1, banned = null, bannedCourts = null, closedByRound = null, night = null) {
  const cap = courtCount * timeCount;
  const cc = Array.from({ length: nTeams }, () => Array(courtCount).fill(0));
  const tc = Array.from({ length: nTeams }, () => Array(timeCount).fill(0));
  const allSlots = Array.from({ length: cap }, (_, k) => k);
  const openOf = rounds.map((_, ri) => (closedByRound && closedByRound[ri] && closedByRound[ri].size ? allSlots.filter((k) => !closedByRound[ri].has(k)) : allSlots));
  const occ = rounds.map((r, ri) => {
    const o = Array(cap).fill(-1);
    const rows = night && night.rows ? night.rows[ri] : null;
    if (rows) {
      // a doubleheader layout (nights.mjs nightLayout): each match starts in its row's first open slot
      const open = new Set(openOf[ri]);
      const later = [];
      r.matches.forEach((m, i) => {
        const k = rows[i] >= 0 ? openOf[ri].find((x) => open.has(x) && Math.floor(x / courtCount) === rows[i]) : undefined;
        if (k === undefined) { later.push(i); return; }
        m.slot = k; open.delete(k); o[k] = i;
      });
      // matches the layout left over go to the open slots, each to the first one whose time row
      // holds neither of its teams (2026-11-15: taking them in order double-booked a team at 44
      // teams on 11 courts x 6 times, seed 2, and the annealing's swaps could not undo it)
      const rowTeams = new Map();
      const mark = (i, k) => { const t = Math.floor(k / courtCount); if (!rowTeams.has(t)) rowTeams.set(t, new Set()); rowTeams.get(t).add(r.matches[i].home).add(r.matches[i].away); };
      r.matches.forEach((m, i) => { if (o[m.slot] === i) mark(i, m.slot); });
      for (const i of later) {
        const m = r.matches[i];
        const free = [...open];
        const k = free.find((x) => { const s = rowTeams.get(Math.floor(x / courtCount)); return !s || (!s.has(m.home) && !s.has(m.away)); }) ?? free[0];
        m.slot = k; open.delete(k); o[k] = i; mark(i, k);
      }
    } else {
      r.matches.forEach((m, i) => { m.slot = openOf[ri][i]; o[m.slot] = i; });
    }
    return o;
  });
  const bump = (m, slot, sign) => {
    const c = slot % courtCount;
    const t = Math.floor(slot / courtCount);
    for (const x of [m.home, m.away]) { cc[x][c] += sign; tc[x][t] += sign; }
  };
  const teamCost = (x) => {
    let c = sumSq(cc[x]) + sumSq(tc[x]);
    if (banned && banned[x]) for (const t of banned[x]) c += LIMIT_PENALTY * tc[x][t];
    if (bannedCourts && bannedCourts[x]) for (const k of bannedCourts[x]) c += LIMIT_PENALTY * cc[x][k];
    return c;
  };
  for (const r of rounds) for (const m of r.matches) bump(m, m.slot, 1);
  let cost = 0;
  for (let x = 0; x < nTeams; x++) cost += teamCost(x);
  // Several games a night (`night.games` > 1): a team may not be in two places at one time
  // (LIMIT_PENALTY per clash) and should play its games back to back (NIGHT_GAP_PENALTY per idle
  // time slot between its first and last game of the night).
  const multi = Boolean(night && night.games > 1);
  const teamIn = multi ? rounds.map((r) => {
    const map = new Map();
    r.matches.forEach((m, i) => { for (const x of [m.home, m.away]) { if (!map.has(x)) map.set(x, []); map.get(x).push(i); } });
    return map;
  }) : null;
  const nightCost = (ri, x) => {
    const idxs = teamIn[ri].get(x);
    if (!idxs || idxs.length < 2) return 0;
    const ts = idxs.map((i) => Math.floor(rounds[ri].matches[i].slot / courtCount)).sort((a, b) => a - b);
    let clash = 0;
    for (let k = 1; k < ts.length; k++) if (ts[k] === ts[k - 1]) clash++;
    const idle = Math.max(0, ts[ts.length - 1] - ts[0] - (ts.length - 1 - clash));
    return clash * CLASH_PENALTY + idle * NIGHT_GAP_PENALTY;
  };
  if (multi) rounds.forEach((r, ri) => { for (const x of teamIn[ri].keys()) cost += nightCost(ri, x); });
  if (cap <= 1) return cost;

  const movable = rounds.map((r, i) => (r.matches.length && openOf[i].length > 1 ? i : -1)).filter((i) => i >= 0);
  if (!movable.length) return cost;
  const total = rounds.reduce((s, r) => s + r.matches.length, 0);
  const iterations = Math.min(80000, 800 * total);
  const rand = mulberry32(seed * 2654435761 + 12345);
  let best = cost;
  let bestSlots = rounds.map((r) => r.matches.map((m) => m.slot));
  for (let it = 0; it < iterations; it++) {
    const temp = Math.max(0.02, 1.5 * (1 - it / iterations));
    const ri = movable[Math.floor(rand() * movable.length)];
    const r = rounds[ri];
    const i = Math.floor(rand() * r.matches.length);
    const mi = r.matches[i];
    const s1 = mi.slot;
    const open = openOf[ri];
    let k2 = Math.floor(rand() * (open.length - 1));
    if (k2 >= open.indexOf(s1)) k2++;
    const s2 = open[k2];
    const j = occ[ri][s2];
    const mj = j >= 0 ? r.matches[j] : null;
    const affected = new Set([mi.home, mi.away]);
    if (mj) { affected.add(mj.home); affected.add(mj.away); }
    let before = 0;
    for (const x of affected) before += teamCost(x) + (multi ? nightCost(ri, x) : 0);
    bump(mi, s1, -1);
    if (mj) bump(mj, s2, -1);
    bump(mi, s2, 1);
    if (mj) bump(mj, s1, 1);
    mi.slot = s2;
    if (mj) mj.slot = s1;
    let after = 0;
    for (const x of affected) after += teamCost(x) + (multi ? nightCost(ri, x) : 0);
    mi.slot = s1;
    if (mj) mj.slot = s2;
    const delta = after - before;
    if (delta <= 0 || rand() < Math.exp(-delta / temp)) {
      mi.slot = s2;
      occ[ri][s2] = i;
      occ[ri][s1] = j;
      if (mj) mj.slot = s1;
      cost += delta;
      if (cost < best) { best = cost; bestSlots = rounds.map((rr) => rr.matches.map((m) => m.slot)); }
    } else {
      bump(mi, s2, -1);
      if (mj) bump(mj, s1, -1);
      bump(mi, s1, 1);
      if (mj) bump(mj, s2, 1);
    }
  }
  // restore the best state seen
  rounds.forEach((r, ri) => r.matches.forEach((m, i) => { m.slot = bestSlots[ri][i]; }));
  // An exact pass for the limits (2026-11-18): a round where a limit is still broken but some
  // assignment keeps every limit gets that assignment (bipartite matching of matches to open
  // slots, starting from the current one so legal matches move only when they must). The
  // annealing alone missed 1 of 3,033 such rounds on 300 random leagues (eval/limit-conflicts.txt).
  if ((banned || bannedCourts) && !multi) {
    const legal = (m, k) => [m.home, m.away].every((x) => !(banned && banned[x] && banned[x].includes(Math.floor(k / courtCount))) && !(bannedCourts && bannedCourts[x] && bannedCourts[x].includes(k % courtCount)));
    let repaired = false;
    rounds.forEach((r, ri) => {
      if (r.matches.every((m) => legal(m, m.slot))) return;
      const fixed = legalRoundSlots(r.matches, openOf[ri], legal);
      if (!fixed) return;
      r.matches.forEach((m, i) => { m.slot = fixed[i]; });
      repaired = true;
    });
    if (repaired) {
      for (const row of cc) row.fill(0);
      for (const row of tc) row.fill(0);
      for (const r of rounds) for (const m of r.matches) bump(m, m.slot, 1);
      best = 0;
      for (let x = 0; x < nTeams; x++) best += teamCost(x);
    }
  }
  return best;
}

/**
 * Slots for one round's matches with every match on a slot `legal(match, slot)` allows, or null
 * when none exists (Kuhn's augmenting paths; a match keeps its current slot when that is legal
 * and no other match needs it).
 */
export function legalRoundSlots(matches, open, legal) {
  const own = new Map();
  for (const [i, m] of matches.entries()) if (open.includes(m.slot) && legal(m, m.slot) && !own.has(m.slot)) own.set(m.slot, i);
  const at = matches.map((m) => (own.get(m.slot) === undefined ? -1 : m.slot));
  matches.forEach((m, i) => { if (at[i] >= 0 && own.get(at[i]) !== i) at[i] = -1; });
  const adj = matches.map((m) => open.filter((k) => legal(m, k)));
  const aug = (i, seen) => {
    for (const k of adj[i]) {
      if (seen.has(k)) continue;
      seen.add(k);
      const j = own.get(k);
      if (j === undefined || aug(j, seen)) { own.set(k, i); at[i] = k; return true; }
    }
    return false;
  };
  for (let i = 0; i < matches.length; i++) if (at[i] < 0 && !aug(i, new Set())) return null;
  return at;
}

/**
 * Time and court limits that no schedule can keep, found before the build (2026-11-18):
 * - two limited teams with no allowed time (or court) in common still have to meet, so their
 *   match breaks one team's limit wherever it goes;
 * - more teams limited to a set of times than those times hold: k teams that can only play at
 *   times T need ceil(k/2) of T's |T| x courts slots in a round even when they all play each
 *   other, and k slots when none of them meet. Same for courts.
 * Returns [{ kind: "pair" | "times" | "courts", teams: [names], text }].
 */
export function limitConflicts(teams, { times = [], courts = [], timeLimits = {}, courtLimits = {} } = {}) {
  const out = [];
  const allowedT = (t) => (timeLimits[t] || []).filter((x) => times.includes(x));
  const allowedC = (t) => (courtLimits[t] || []).filter((x) => courts.includes(x));
  const limT = Object.keys(timeLimits).map(Number).filter((t) => allowedT(t).length && allowedT(t).length < times.length);
  const limC = Object.keys(courtLimits).map(Number).filter((t) => allowedC(t).length && allowedC(t).length < courts.length);
  const lim = [...new Set([...limT, ...limC])].sort((a, b) => a - b);
  for (const [i, a] of lim.entries()) for (const b of lim.slice(i + 1)) {
    const ta = limT.includes(a) ? allowedT(a) : times, tb = limT.includes(b) ? allowedT(b) : times;
    const ca = limC.includes(a) ? allowedC(a) : courts, cb = limC.includes(b) ? allowedC(b) : courts;
    if (!ta.some((x) => tb.includes(x))) out.push({ kind: "pair", teams: [teams[a], teams[b]], text: `${teams[a]} only plays at ${ta.join(", ")} and ${teams[b]} only at ${tb.join(", ")}, so their match breaks one team's time limit wherever it goes. Give one of them a time the other can play.` });
    else if (!ca.some((x) => cb.includes(x))) out.push({ kind: "pair", teams: [teams[a], teams[b]], text: `${teams[a]} only plays on ${ca.join(", ")} and ${teams[b]} only on ${cb.join(", ")}, so their match breaks one team's court limit wherever it goes. Give one of them a court the other can use.` });
  }
  const crowd = (kind, ids, allowed, all, perUnit, unitWord) => {
    if (all.length > 12) return;
    for (let mask = 1; mask < (1 << all.length) - 1; mask++) {
      const set = all.filter((_, j) => mask & (1 << j));
      const inside = ids.filter((t) => allowed(t).every((x) => set.includes(x)));
      if (!inside.length) continue;
      // report the smallest sets only: skip if a proper subset already reports a superset of these teams
      const slots = set.length * perUnit;
      if (inside.length <= slots) continue;
      if (out.some((o) => o.kind === kind && o.teams.length >= inside.length && inside.every((t) => o.teams.includes(teams[t])))) continue;
      const names = inside.map((t) => teams[t]);
      const always = Math.ceil(inside.length / 2) > slots;
      out.push({ kind, teams: names, text: `${names.length} teams (${names.join(", ")}) can only play ${unitWord} ${set.join(", ")}, which hold ${slots} match(es) a round: ${always ? "too few even when they all play each other, so every round breaks a limit" : "a round breaks a limit unless enough of them play each other that night"}. Free one of them or add a ${kind === "times" ? "court or time" : "court"}.` });
    }
  };
  crowd("times", limT, allowedT, times, courts.length || 1, "at");
  crowd("courts", limC, allowedC, courts, times.length || 1, "on");
  return out;
}

// ---------------------------------------------------------------- building the schedule

/**
 * Puts the plan's rounds on real dates: each play day takes the remaining round of the current leg with the fewest
 * matches a blackout blocks; blocked matches and any over the open court slots go to makeup rounds after the regular
 * season. Pure: returns { placed[{day, leg, bye, matches[{home, away}], makeup}], notices[], displaced, lastDay }.
 */
export function placeRounds(plan, { start, weekdaySet, skipSet, isBlocked, capacityOn, quiet = false }) {
  const notices = [];
  const remaining = plan.map((r, i) => ({ ...r, order: i }));
  const placed = [];
  const pool = [];
  let day = start;
  let scanned = 0;
  while (remaining.length) {
    day = nextPlayDay(day, weekdaySet, skipSet);
    if (day === null || scanned++ > MAX_SCAN_DAYS) throw new Error("Could not find enough playable dates. Check the weekdays, skip dates and blackouts.");
    const leg = Math.min(...remaining.map((r) => r.leg));
    let best = null;
    let bestConf = Infinity;
    for (const r of remaining) {
      if (r.leg !== leg) continue;
      const conf = r.matches.filter(([h, a]) => isBlocked(h, day) || isBlocked(a, day)).length;
      if (conf < bestConf) { best = r; bestConf = conf; }
      if (conf === 0) break;
    }
    const playable = best.matches.filter(([h, a]) => !isBlocked(h, day) && !isBlocked(a, day));
    const open = capacityOn(day);
    if (open === 0) playable.length = 0;
    else if (playable.length > open) {
      const over = playable.splice(open);
      pool.push(...over);
      if (!quiet) notices.push(`${dayLabel(day)}: only ${open} court slot(s) are open, so ${over.length} match(es) moved to makeup rounds.`);
    }
    if (!playable.length && best.matches.length) {
      if (!quiet) notices.push(open === 0 ? `${dayLabel(day)}: every court is closed, so that date is unused.` : `${dayLabel(day)}: no round could be played because of team blackouts, so that date is unused.`);
      day++;
      continue;
    }
    for (const [h, a] of best.matches) if (isBlocked(h, day) || isBlocked(a, day)) pool.push([h, a]);
    placed.push({ day, leg: best.leg, bye: best.bye, ...(best.sitOut ? { sitOut: best.sitOut } : {}), matches: playable.map(([h, a, sub]) => (sub === undefined ? { home: h, away: a } : { home: h, away: a, sub })), makeup: false });
    remaining.splice(remaining.indexOf(best), 1);
    day++;
  }
  const displaced = pool.length;
  // matches displaced by a blackout are packed into makeup rounds after the regular season
  let guard = 0;
  while (pool.length) {
    day = nextPlayDay(day, weekdaySet, skipSet);
    if (day === null || guard++ > MAX_SCAN_DAYS) throw new Error("Could not find dates for the makeup matches. Check the blackouts.");
    const used = new Set();
    const matches = [];
    for (let i = 0; i < pool.length && matches.length < capacityOn(day); i++) {
      const [h, a] = pool[i];
      if (used.has(h) || used.has(a) || isBlocked(h, day) || isBlocked(a, day)) continue;
      used.add(h); used.add(a);
      matches.push({ home: h, away: a });
      pool.splice(i, 1);
      i--;
    }
    if (matches.length) placed.push({ day, leg: 1, bye: null, matches, makeup: true });
    day++;
  }
  const lastDay = placed.length ? placed[placed.length - 1].day : start;
  return { placed, notices, displaced, lastDay };
}

/**
 * Several games a night (doubleheaders and tripleheaders): `games` consecutive rounds of the plan
 * become one night, within a leg (a double round robin never mixes its two halves on one night).
 * Each match keeps the index of the round it came from as a third element ([home, away, sub]), so
 * home/away breaks and carry-over are still read in round order. In an odd league each team sits
 * out at most one game a night (the circle method gives a different team the bye in each round), so
 * the night's `bye` is null and `sitOut` lists the teams playing one game fewer. games 1 returns
 * the plan unchanged.
 */
export function nightsOf(plan, games = 1) {
  if (!Number.isInteger(games) || games <= 1) return plan;
  const out = [];
  let sub = 0;
  for (let i = 0; i < plan.length;) {
    const leg = plan[i].leg;
    const group = [];
    while (i < plan.length && plan[i].leg === leg && group.length < games) group.push(plan[i++]);
    const sitOut = group.map((r) => r.bye).filter((b) => b !== null && b !== undefined);
    out.push({
      leg, bye: null, ...(sitOut.length ? { sitOut } : {}),
      matches: group.flatMap((r) => { const k = sub++; return r.matches.map(([h, a]) => [h, a, k]); }),
    });
  }
  return out;
}

/**
 * A night-by-night schedule split back into its rounds (one game per team each), in the order the
 * plan played them: matches carrying `sub` go to their round, anything else (a makeup, a moved
 * match) stays a round of its own. Used to count breaks and carry-over on doubleheader seasons.
 */
export function expandNights(schedule) {
  if (!((schedule.config && schedule.config.gamesPerNight) > 1)) return schedule;
  const rounds = [];
  for (const r of schedule.rounds) {
    const bySub = new Map();
    const rest = [];
    for (const m of r.matches) {
      if (Number.isInteger(m.sub)) { if (!bySub.has(m.sub)) bySub.set(m.sub, []); bySub.get(m.sub).push(m); } else rest.push(m);
    }
    for (const k of [...bySub.keys()].sort((a, b) => a - b)) rounds.push({ ...r, matches: bySub.get(k) });
    if (rest.length) rounds.push({ ...r, matches: rest });
  }
  return { ...schedule, rounds };
}

/**
 * Searches team relabellings of `plan` (a hill climb on pair swaps with sideways moves, seeded) for the one whose
 * `placeRounds` season displaces the fewest matches, then ends earliest, then has the fewest home/away breaks. Relabelling keeps every team's home/away
 * sequence, breaks and carry-over counts (they move with the label), so only who-meets-whom-when changes.
 * The identity is the starting point, so the result is never worse than the plan as given.
 * Returns { plan, perm, summary: { displacedBefore, displacedAfter, lastDayBefore, lastDayAfter, evals } }.
 */
export function fitPlanToBlackouts(plan, n, { start, weekdaySet, skipSet, isBlocked, capacityOn, seed = 1, evals, keep } = {}) {
  // a work budget, not a clock, so a share link rebuilds the same season: one evaluation costs about rounds^2 x matches
  const work = plan.length * plan.length * Math.max(1, Math.floor(n / 2));
  const budget = Number.isInteger(evals) && evals >= 0 ? evals : Math.max(300, Math.min(4000, 40 * n * n, Math.floor(8e6 / work)));
  const ctx = { start, weekdaySet, skipSet, isBlocked, capacityOn, quiet: true };
  // home/away breaks of the dated season (makeups included; a bye or a night off resets the run)
  const breaksOf = (placed) => {
    const last = new Array(n).fill(null);
    let b = 0;
    for (const p of placed) {
      const today = new Array(n).fill(null);
      for (const m of p.matches) { today[m.home] = 1; today[m.away] = 0; }
      for (let t = 0; t < n; t++) { if (today[t] !== null && today[t] === last[t]) b++; last[t] = today[t]; }
    }
    return b;
  };
  const score = (perm) => {
    const r = placeRounds(relabelPlan(plan, perm), ctx);
    return [r.displaced, r.lastDay, breaksOf(r.placed)];
  };
  const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  // only swaps that move a team with a blackout can change the season; two clear teams trading places do nothing
  const blocked = [];
  for (let t = 0; t < n; t++) {
    let any = false;
    for (let d = start; d < start + 7 * 104 && !any; d++) if (isBlocked(t, d)) any = true;
    if (any) blocked.push(t);
  }
  // the season with no blackouts at all is the target (its end date is a floor): stop once it is matched
  const free = placeRounds(plan, { ...ctx, isBlocked: () => false });
  const floorDay = free.lastDay;
  const floorBreaks = breaksOf(free.placed);
  // perm[p] = the team that takes plan position p
  const perm = Array.from({ length: n }, (_, i) => i);
  const s0 = score(perm);
  let cur = s0, best = s0, bestPerm = perm.slice();
  const rand = mulberry32((seed >>> 0) * 2246822519 + 7);
  let used = 1;
  while (used < budget && blocked.length && (best[0] > 0 || best[1] > floorDay || best[2] > floorBreaks)) {
    const pa = perm.indexOf(blocked[Math.floor(rand() * blocked.length)]);
    let pb = Math.floor(rand() * (n - 1));
    if (pb >= pa) pb++;
    [perm[pa], perm[pb]] = [perm[pb], perm[pa]];
    // `keep(perm)` false: a swap that would undo something the organiser asked for (a balanced strength of schedule)
    if (keep && !keep(perm)) { [perm[pa], perm[pb]] = [perm[pb], perm[pa]]; used++; continue; }
    const sc = score(perm);
    used++;
    if (better(sc, cur) || same(sc, cur)) {
      cur = sc;
      if (better(sc, best)) { best = sc; bestPerm = perm.slice(); }
    } else {
      [perm[pa], perm[pb]] = [perm[pb], perm[pa]];
    }
  }
  return {
    plan: relabelPlan(plan, bestPerm),
    perm: bestPerm,
    summary: { displacedBefore: s0[0], displacedAfter: best[0], lastDayBefore: s0[1], lastDayAfter: best[1], breaksBefore: s0[2], breaksAfter: best[2], evals: used },
  };
}

/**
 * Strength of schedule against the list order, read as seeds (team 0 is the top seed). For each team:
 * games played, the mean seed of its opponents, the mean an even share would give (the mean seed of
 * every other team, so the top seed's target is a little weaker than the bottom seed's), and the gap.
 * Seeds count from 1 in the output. Returns { teams: [{ games, opponentMean, target, gap }], worst }.
 */
export function seedStrength(plan, n) {
  const sum = new Array(n).fill(0);
  const games = new Array(n).fill(0);
  for (const r of plan) for (const [a, b] of r.matches) { sum[a] += b; sum[b] += a; games[a]++; games[b]++; }
  const S = (n * (n - 1)) / 2;
  let worst = 0;
  const teams = sum.map((s, t) => {
    const target = (S - t) / (n - 1);
    if (!games[t]) return { games: 0, opponentMean: null, target: target + 1, gap: 0 };
    const gap = s / games[t] - target;
    worst = Math.max(worst, Math.abs(gap));
    return { games: games[t], opponentMean: s / games[t] + 1, target: target + 1, gap };
  });
  return { teams, worst };
}

/**
 * A shorter season (the first k rounds of a round robin) with every team's opponents spread over the
 * seeds. The circle method fixes one team and rotates the rest, so its first k rounds give the last
 * team listed the top k seeds (20 teams, 10 rounds: the bottom seed's opponents average seed 5.5
 * where an even share is 10.5). This searches team relabellings (which team takes which place in the
 * plan) by seeded annealing on pair swaps, scoring the sum of fourth powers of each team's gap and
 * keeping the least worst gap. A relabelling keeps every place's home/away sequence, breaks and
 * carry-over, and nobody meets twice, so only who meets whom changes. The identity is the start, so
 * the result is never worse. On every size small enough to try all relabellings (6, 8, 9 and 10
 * teams) the search lands on the exact optimum (eval/seed-balance.txt).
 * Returns { plan, perm, summary: { before, after, evals } } with gaps in seed places.
 */
export function balanceSeedStrength(plan, n, { seed = 1, evals } = {}) {
  const opp = Array.from({ length: n }, () => []);
  for (const r of plan) for (const [a, b] of r.matches) { opp[a].push(b); opp[b].push(a); }
  const S = (n * (n - 1)) / 2;
  const perm = Array.from({ length: n }, (_, i) => i);
  const sum = new Array(n).fill(0);
  const gapAt = (p) => (opp[p].length ? (sum[p] - (opp[p].length * (S - perm[p])) / (n - 1)) / opp[p].length : 0);
  const score = () => {
    let q = 0, w = 0;
    for (let p = 0; p < n; p++) { const d = gapAt(p); q += d * d * d * d; w = Math.max(w, Math.abs(d)); }
    return [w, q];
  };
  for (let p = 0; p < n; p++) for (const o of opp[p]) sum[p] += perm[o];
  // a work budget, not a clock, so a share link rebuilds the same season: about 0.1 s at 64 teams
  const budget = Number.isInteger(evals) && evals >= 0 ? evals : Math.min(200000, Math.max(20000, 3000 * n));
  const s0 = score();
  let cur = s0, best = s0, bestPerm = perm.slice();
  const T0 = s0[1] / n + 1e-9;
  const rand = mulberry32((seed >>> 0) * 2654435761 + 11);
  // swap the teams at places a and b: every opponent of a sees perm[b] - perm[a] more, and the reverse
  const swap = (a, b) => {
    const d = perm[b] - perm[a];
    for (const o of opp[a]) sum[o] += d;
    for (const o of opp[b]) sum[o] -= d;
    [perm[a], perm[b]] = [perm[b], perm[a]];
  };
  let used = 0;
  for (; used < budget && n > 2; used++) {
    const a = Math.floor(rand() * n);
    let b = Math.floor(rand() * (n - 1));
    if (b >= a) b++;
    swap(a, b);
    const s = score();
    const T = T0 * (1 - used / budget) ** 3 + 1e-12;
    if (s[1] <= cur[1] || rand() < Math.exp(-(s[1] - cur[1]) / T)) {
      cur = s;
      if (s[0] < best[0] - 1e-9 || (Math.abs(s[0] - best[0]) <= 1e-9 && s[1] < best[1])) { best = s; bestPerm = perm.slice(); }
    } else swap(a, b);
  }
  return { plan: relabelPlan(plan, bestPerm), perm: bestPerm, summary: { before: s0[0], after: best[0], evals: used } };
}

/**
 * spec: { teams[], double, start (day), weekdays[], skipDays[], blackouts{teamIndex: days[]},
 *         courts[], times[] ("HH:MM"), seed, minutes }
 * Returns { teams, config, rounds[], notices[], stats }.
 */
export function buildSchedule(spec) {
  const teams = spec.teams;
  const n = teams.length;
  if (n < 2) throw new Error("Enter at least two teams.");
  if (n > MAX_TEAMS) throw new Error(`Up to ${MAX_TEAMS} teams are supported.`);
  if (!Number.isInteger(spec.start)) throw new Error("The season start date is not a real date.");
  const weekdaySet = new Set(spec.weekdays || []);
  if (!weekdaySet.size) throw new Error("Pick at least one weekday to play on.");
  const skipSet = new Set(spec.skipDays || []);
  const blackSet = Array.from({ length: n }, (_, i) => new Set((spec.blackouts || {})[i] || []));
  const notices = [];
  if (needsSeasonSearches(spec) && !seasonSearchesReady()) throw new Error("This season needs the carry-over search or the night designs: hand them in with useSeasonSearches(carryover.mjs, nights.mjs) before building it, or import calc.mjs, which does.");

  const games = spec.gamesPerNight === undefined || spec.gamesPerNight === null ? 1 : spec.gamesPerNight;
  if (!Number.isInteger(games) || games < 1 || games > MAX_GAMES_PER_NIGHT) throw new Error(`Games per team per night must be a whole number from 1 to ${MAX_GAMES_PER_NIGHT}.`);
  const perRound = Math.floor(n / 2) * games;
  const times = spec.times && spec.times.length ? spec.times : [""];
  if (games > 1 && times.length < games) {
    throw new Error(`${games} games a night need at least ${games} time slots (a team cannot play two games at once). Add time slots, like 18:00, 19:00${games > 2 ? ", 20:00" : ""}.`);
  }
  let courts = spec.courts && spec.courts.length ? spec.courts : null;
  if (!courts) courts = Array.from({ length: Math.ceil(perRound / times.length) }, (_, i) => `Court ${i + 1}`);
  if (courts.length * times.length < perRound) {
    throw new Error(`${n} teams play ${perRound} matches a ${games > 1 ? "night" : "round"}, but ${courts.length} court(s) x ${times.length} time slot(s) only fit ${courts.length * times.length}. Add courts or time slots.`);
  }

  const closures = {};
  for (const [c, days] of Object.entries(spec.courtClosures || {})) {
    if (courts.includes(c)) closures[c] = days;
    else notices.push(`"${c}" is not one of the league's courts, so its closure dates were ignored.`);
  }
  const closedCourtsOn = (d) => new Set(courts.map((c, i) => ((closures[c] || []).includes(d) ? i : -1)).filter((i) => i >= 0));
  const capacityOn = (d) => (courts.length - closedCourtsOn(d).size) * times.length;

  const reverseLeg = Boolean(spec.double && spec.reverseLeg);
  let plan = roundRobin(n, { double: Boolean(spec.double), reverseLeg });
  if (reverseLeg && spec.carryOver && n >= 4) notices.push("Return leg in reverse order was not applied: the carry-over search chooses its own second leg.");
  // Optional: rounds searched for an even carry-over (who you meet right after whom), with some
  // weight on home/away breaks, in place of the circle method. A double round robin searches its
  // second leg as well (mirroring the first would double every carry-over count): each pair still
  // meets once per leg, the return game at the other ground.
  // `carryOverPlan` is rounds the page already searched in a Web Worker (carryover-worker.mjs) for
  // these settings; `carryOverTries` > 1 runs the best-of-k search here (CLI, tests), with
  // `carryOverCapped` capped tries after them (as the page runs 8 + 2), choosing by
  // carry-over + `carryOverPick` x breaks.
  let carryOverSearch = null;
  if (spec.carryOver && n >= 4) {
    const plan0 = spec.carryOverPlan;
    if (plan0 && Array.isArray(plan0.rounds) && plan0.teams === n && Boolean(plan0.double) === Boolean(spec.double)) {
      plan = plan0.rounds;
      carryOverSearch = plan0.summary || null;
    } else if (Number.isInteger(spec.carryOverTries) && spec.carryOverTries > 1) {
      // `carryOverGap` more capped tries widen the frontier; `carryOverKeep` (carryOverKeepText)
      // is a frontier season the organiser picked, applied only when it was made for these settings
      const capped = Number.isInteger(spec.carryOverCapped) && spec.carryOverCapped > 0 ? spec.carryOverCapped : 0;
      const gap = Number.isInteger(spec.carryOverGap) && spec.carryOverGap > 0 ? spec.carryOverGap : 0;
      const squeeze = Number.isInteger(spec.carryOverSqueeze) && spec.carryOverSqueeze > 0 ? spec.carryOverSqueeze : 0;
      const polish = Number.isInteger(spec.carryOverPolish) && spec.carryOverPolish > 0 ? spec.carryOverPolish : 0;
      const floorPriced = Number.isInteger(spec.carryOverFloorPriced) && spec.carryOverFloorPriced > 0 ? spec.carryOverFloorPriced : 0;
      const keep = carryOverKeepIndex(spec.carryOverKeep, { n, double: Boolean(spec.double), seed: spec.seed ?? 1, tries: spec.carryOverTries + capped + gap + squeeze + polish + floorPriced });
      const best = bestCarryOverRounds(n, { double: Boolean(spec.double), seed: spec.seed ?? 1, tries: spec.carryOverTries, capped, gap, squeeze, polish, floorPriced, keep, pick: spec.carryOverPick ?? CARRY_OVER_PICK.balanced });
      plan = best.rounds;
      carryOverSearch = carryOverSummary(best);
    } else {
      const low = spec.double
        ? lowCarryOverDoubleRounds(n, { seed: spec.seed ?? 1, breakWeight: 10 })
        : lowCarryOverRounds(n, { seed: spec.seed ?? 1, breakWeight: 10 });
      plan = low.rounds;
    }
  }
  // A shorter season: the first k rounds of the circle method. Every team still meets k different
  // opponents (k games, minus a bye in an odd league), and the home/away alternation is unchanged.
  const partial = Number.isInteger(spec.rounds) && spec.rounds >= 1 && spec.rounds < plan.length;
  if (partial) {
    plan = plan.slice(0, spec.rounds);
    notices.push(`Shorter season: ${spec.rounds} of ${roundRobin(n, { double: Boolean(spec.double) }).length} rounds, so each team plays ${n % 2 ? `${spec.rounds - 1}-${spec.rounds}` : spec.rounds} game(s) and not every pair meets.`);
  }
  // Balanced strength of schedule (2026-11-17): the teams are read as seeds in the order listed and
  // given places in the shorter season so every team's opponents average close to an even share.
  let seedBalance = null;
  if (partial && spec.balanceSeeds && n >= 4) {
    const bal = balanceSeedStrength(plan, n, { seed: spec.seed ?? 1, evals: spec.balanceSeedsEvals });
    plan = bal.plan;
    seedBalance = bal.summary;
    const fmt = (x) => x.toFixed(1);
    notices.push(`Even strength of schedule: reading the teams as seeds in the order listed, every team's opponents now average within ${fmt(bal.summary.after)} seed place(s) of an even share (the plain shorter season was ${fmt(bal.summary.before)} off).`);
  }
  let waitFree = null;
  if (games > 1 && !spec.carryOver && !partial && spec.waitFree !== false && n >= 4) {
    // Rearrange the round robin so each night's games can sit back to back (nights.mjs). A double
    // round robin searches the first leg and plays it again with every venue reversed.
    const leg0 = spec.double ? plan.filter((r) => r.leg === 0) : plan;
    const wf = waitFreeNights(leg0, n, games, courts.length, times.length, {
      seed: spec.seed ?? 1, evals: spec.waitFreeEvals,
      starts: [() => lowCarryOverRounds(n, { seed: spec.seed ?? 1, effort: 0.25, breakWeight: 10 }).rounds],
    });
    if (wf.after === 0 && wf.before > 0) {
      plan = spec.double ? [...wf.rounds, ...(reverseLeg ? [...wf.rounds].reverse() : wf.rounds).map((r) => ({ leg: 1, matches: r.matches.map(([h, a]) => [a, h]), bye: r.bye }))] : wf.rounds;
      waitFree = { before: wf.before, after: wf.after, ...(wf.designed ? { designed: true } : {}) };
    }
  }
  if (games > 1) {
    const nRounds = plan.length;
    plan = nightsOf(plan, games);
    notices.push(`${games} games a night: ${nRounds} round(s) are played over ${plan.length} night(s), each team's games back to back where the courts allow${n % 2 ? "; in an odd league a team sits out one of the night's games now and then" : ""}.`);
  }
  const isBlocked = (t, day) => blackSet[t].has(day);
  // Blackout fit (2026-11-13): which team takes which position of the round-robin plan is free, and
  // home/away breaks, carry-over and every pairing's leg are unchanged by it, so search the relabellings
  // for the one whose dated season displaces the fewest matches into makeup rounds and ends earliest.
  let blackoutFit = null;
  const anyBlackout = blackSet.some((s) => s.size);
  if (anyBlackout && spec.blackoutFit !== false) {
    const fit = fitPlanToBlackouts(plan, n, { start: spec.start, weekdaySet, skipSet, isBlocked, capacityOn, seed: spec.seed ?? 1, evals: spec.blackoutFitEvals, ...(seedBalance ? { keep: (perm) => seedStrength(relabelPlan(plan, perm), n).worst <= seedBalance.after + 1e-9 } : {}) });
    plan = fit.plan;
    blackoutFit = fit.summary;
    const f = fit.summary;
    if (f.displacedAfter < f.displacedBefore || f.lastDayAfter < f.lastDayBefore || f.breaksAfter < f.breaksBefore) {
      const parts = [];
      if (f.displacedAfter !== f.displacedBefore) parts.push(`${f.displacedAfter} match(es) need a makeup date instead of ${f.displacedBefore}`);
      if (f.lastDayAfter !== f.lastDayBefore) parts.push(`the season ends ${dayLabel(f.lastDayAfter)} instead of ${dayLabel(f.lastDayBefore)}`);
      if (f.breaksAfter !== f.breaksBefore) parts.push(`${f.breaksAfter} home/away break(s) instead of ${f.breaksBefore}`);
      notices.push(`Blackout fit: teams were given the places in the round robin that suit their blackout dates, so ${parts.join(", ")}.`);
    }
  }
  const { placed, notices: placeNotices } = placeRounds(plan, { start: spec.start, weekdaySet, skipSet, isBlocked, capacityOn });
  notices.push(...placeNotices);
  let regular = 0;
  let makeupN = 0;
  const rounds = placed.map((p) => {
    const label = p.makeup ? `Makeup ${++makeupN}` : `Round ${++regular}`;
    return { number: p.makeup ? null : regular, label, makeup: p.makeup, day: p.day, bye: p.bye, ...(p.sitOut ? { sitOut: p.sitOut } : {}), matches: p.matches };
  });
  const displaced = rounds.filter((r) => r.makeup).reduce((s, r) => s + r.matches.length, 0);
  if (displaced) notices.push(`${displaced} match(es) moved to makeup rounds because a team could not play on its scheduled date.`);

  const limits = spec.timeLimits || {};
  const banned = {};
  for (const [t, allowed] of Object.entries(limits)) {
    const ok = allowed.filter((x) => times.includes(x));
    if (!ok.length) { notices.push(`${teams[t]} is limited to times that are not among the league's time slots, so the limit was ignored.`); continue; }
    banned[t] = times.map((x, i) => (ok.includes(x) ? -1 : i)).filter((i) => i >= 0);
  }
  const courtLim = spec.courtLimits || {};
  const bannedCourts = {};
  for (const [t, allowed] of Object.entries(courtLim)) {
    const ok = allowed.filter((x) => courts.includes(x));
    if (!ok.length) { notices.push(`${teams[t]} is limited to courts that are not among the league's courts, so the limit was ignored.`); continue; }
    bannedCourts[t] = courts.map((x, i) => (ok.includes(x) ? -1 : i)).filter((i) => i >= 0);
  }
  const conflicts = limitConflicts(teams, {
    times, courts,
    timeLimits: Object.fromEntries(Object.keys(banned).map((t) => [t, times.filter((_, i) => !banned[t].includes(i))])),
    courtLimits: Object.fromEntries(Object.keys(bannedCourts).map((t) => [t, courts.filter((_, i) => !bannedCourts[t].includes(i))])),
  });
  for (const c of conflicts) notices.push(`Limits that cannot all be kept: ${c.text}`);
  const closedByRound = rounds.map((r) => {
    const set = new Set();
    for (const ci of closedCourtsOn(r.day)) for (let t = 0; t < times.length; t++) set.add(t * courts.length + ci);
    return set;
  });
  const cost = assignSlots(rounds, n, courts.length, times.length, spec.seed ?? 1, Object.keys(banned).length ? banned : null, Object.keys(bannedCourts).length ? bannedCourts : null, Object.keys(closures).length ? closedByRound : null, games > 1 ? { games, rows: seasonLayout(rounds.map((r) => (r.makeup ? null : r.matches.map((m) => [m.home, m.away, m.sub ?? 0]).map(([h, a, k], _, all) => [h, a, k - Math.min(...all.map((x) => x[2]))]))), n, games, courts.length, times.length) } : null);
  for (const r of rounds) {
    for (const m of r.matches) {
      m.court = courts[m.slot % courts.length];
      m.time = times[Math.floor(m.slot / courts.length)];
      m.homeName = teams[m.home];
      m.awayName = teams[m.away];
    }
    r.matches.sort((a, b) => a.slot - b.slot);
  }

  const timeLimits = Object.fromEntries(Object.keys(banned).map((t) => [t, times.filter((_, i) => !banned[t].includes(i))]));
  const courtLimits = Object.fromEntries(Object.keys(bannedCourts).map((t) => [t, courts.filter((_, i) => !bannedCourts[t].includes(i))]));
  const schedule = {
    teams,
    config: {
      timeLimits, courtLimits, courtClosures: closures,
      double: Boolean(spec.double), ...(reverseLeg && !(spec.carryOver && n >= 4) ? { reverseLeg: true } : {}), partial, carryOver: Boolean(spec.carryOver && n >= 4), start: spec.start, weekdays: [...weekdaySet].sort(), skipDays: [...skipSet].sort((a, b) => a - b),
      blackouts: Object.fromEntries(blackSet.map((s, i) => [i, [...s].sort((a, b) => a - b)]).filter(([, d]) => d.length)),
      courts, times, seed: spec.seed ?? 1, minutes: spec.minutes ?? 60, ...(games > 1 ? { gamesPerNight: games } : {}),
    },
    rounds,
    notices,
    slotCost: cost,
  };
  if (carryOverSearch) schedule.carryOverSearch = carryOverSearch;
  if (waitFree) schedule.waitFree = waitFree;
  if (blackoutFit) schedule.blackoutFit = blackoutFit;
  if (seedBalance) schedule.seedBalance = seedBalance;
  for (const e of validateSchedule(schedule).errors) if (e.includes("only plays at") || e.includes("only plays on") || e.includes("two games at")) notices.push(e.replace(/^Round \d+: |^Makeup \d+: /, ""));
  if (games > 1) {
    const w = nightWaits(schedule);
    if (w.idle) {
      const full = n % 2 ? Math.max(0, n - games) : n;
      let need = courts.length;
      const proved = (c) => waitFreeProvedImpossible(n, games, c, times.length);
      while (need < courts.length + 64 && (!waitFreePossible(full, games, need, times.length, n % 2 ? Math.min(games, n) : 0) || proved(need))) need++;
      const hint = need > courts.length
        ? ` Back-to-back games for every team need at least ${need} courts at these ${times.length} times (${proved(courts.length) && waitFreePossible(full, games, courts.length, times.length, n % 2 ? Math.min(games, n) : 0) ? `checked for every possible ${n}-team season on ${courts.length} courts: none has every team's games back to back` : `a team's games fill ${games} slots in a row, and each time slot holds two teams per court`}).`
        : " More courts or fewer time slots close them.";
      notices.push(`${w.idle} wait(s) of a time slot or more between a team's games on the same night (${w.nights} team-night(s)).${hint}`);
    } else if (schedule.waitFree) notices.push(`Back-to-back nights: the round robin was rearranged so every team plays its ${games} games in a row each night (the plain order would leave ${schedule.waitFree.before} match(es) that cannot sit back to back)${schedule.waitFree.designed ? "; it is built from a design, so each night splits into groups of teams that only play each other, one group per session" : ""}.`);
  }
  assignFixtureIds(schedule);
  schedule.stats = scheduleStats(schedule);
  return schedule;
}

/**
 * Give every match an id that names the fixture, not its date: the pair (lower team index first)
 * and which meeting of that pair it is in the season as built ("0-3-1" is the second meeting of
 * teams 0 and 3). Rainouts, pins, late entries and home/away flips copy the match and keep the id,
 * so a calendar file re-sent after a move updates the same event instead of adding a second one.
 */
export function assignFixtureIds(schedule) {
  const seen = new Map();
  for (const r of schedule.rounds) for (const m of r.matches) {
    if (m.fixture) continue;
    const pair = `${Math.min(m.home, m.away)}-${Math.max(m.home, m.away)}`;
    const k = seen.get(pair) || 0;
    seen.set(pair, k + 1);
    m.fixture = `${pair}-${k}`;
  }
  return schedule;
}

/**
 * Waiting between games on doubleheader nights: for each team and night with two or more games,
 * the time slots between its first and last game that it does not play in. Returns
 * { idle (total empty slots), nights (team-nights with any wait), worst: { team, label, slots } | null }.
 */
export function nightWaits(schedule) {
  const times = schedule.config.times;
  let idle = 0;
  let nights = 0;
  let worst = null;
  for (const r of schedule.rounds) {
    const at = new Map();
    for (const m of r.matches) for (const x of [m.home, m.away]) { if (!at.has(x)) at.set(x, new Set()); at.get(x).add(times.indexOf(m.time)); }
    for (const [x, set] of at) {
      if (set.size < 2) continue;
      const ts = [...set];
      const gap = Math.max(...ts) - Math.min(...ts) + 1 - ts.length;
      if (gap > 0) {
        idle += gap; nights++;
        if (!worst || gap > worst.slots) worst = { team: schedule.teams[x], label: r.label, slots: gap };
      }
    }
  }
  return { idle, nights, worst };
}

export function scheduleStats(schedule) {
  const n = schedule.teams.length;
  const { courts, times } = schedule.config;
  const home = Array(n).fill(0);
  const away = Array(n).fill(0);
  const byCourt = Array.from({ length: n }, () => Object.fromEntries(courts.map((c) => [c, 0])));
  const byTime = Array.from({ length: n }, () => Object.fromEntries(times.map((t) => [t, 0])));
  let matches = 0;
  for (const r of schedule.rounds) {
    for (const m of r.matches) {
      matches++;
      home[m.home]++; away[m.away]++;
      for (const x of [m.home, m.away]) { byCourt[x][m.court]++; byTime[x][m.time]++; }
    }
  }
  const flat = expandNights(schedule);
  const breaks = countBreaks(flat);
  const co = carryOver(flat);
  const spread = (rec) => Math.max(0, ...rec.map((o) => { const v = Object.values(o); return v.length ? Math.max(...v) - Math.min(...v) : 0; }));
  return {
    matches, home, away, breaks, totalBreaks: breaks.reduce((a, b) => a + b, 0), byCourt, byTime,
    courtSpread: spread(byCourt), timeSpread: spread(byTime),
    carryOver: { value: co.value, max: co.max, pairs: co.pairs, lowerBound: co.lowerBound, proven: co.proven },
    lastDay: schedule.rounds.length ? schedule.rounds[schedule.rounds.length - 1].day : null,
  };
}

/**
 * Who is behind the court / time-slot spread in `scheduleStats`: for each of "court" and
 * "time", the team with the widest gap between its most and least used value, with the
 * value it plays most and least. Returns { court, time }, each null when there is nothing
 * to compare (a single court or slot) or { team, most, mostCount, least, leastCount, spread }.
 * Ties go to the first team in listed order.
 */
export function slotFairness(schedule) {
  const { byCourt, byTime } = schedule.stats || scheduleStats(schedule);
  const widest = (rec) => {
    let best = null;
    rec.forEach((o, i) => {
      const e = Object.entries(o);
      if (e.length < 2) return;
      const hi = e.reduce((a, b) => (b[1] > a[1] ? b : a));
      const lo = e.reduce((a, b) => (b[1] < a[1] ? b : a));
      const spread = hi[1] - lo[1];
      if (best === null || spread > best.spread) best = { team: schedule.teams[i], most: hi[0], mostCount: hi[1], least: lo[0], leastCount: lo[1], spread };
    });
    return best;
  };
  return { court: widest(byCourt), time: widest(byTime) };
}

/**
 * What the season costs in court hire, so an organiser can set a per-team fee.
 * Every match books one court for `schedule.config.minutes`; `rate` is the hire price per
 * court-hour and `officialFee` an optional amount paid per match. Returns
 * { matches, courtHours, courtCost, officialCost, total, perTeam } with money in cents-rounded
 * numbers. `perTeam` is an equal split rounded up to the cent, so the league never collects
 * less than the bill. Returns null for a missing, negative or non-numeric rate.
 */
export function seasonCost(schedule, { rate, officialFee = 0 } = {}) {
  const r = Number(rate), o = Number(officialFee) || 0;
  if (rate === "" || rate === null || rate === undefined || !Number.isFinite(r) || r < 0 || o < 0) return null;
  const matches = schedule.rounds.reduce((a, x) => a + x.matches.length, 0);
  const courtHours = matches * (schedule.config.minutes || 60) / 60;
  const cents = (v) => Math.round(v * 100) / 100;
  const courtCost = cents(courtHours * r);
  const officialCost = cents(matches * o);
  const total = cents(courtCost + officialCost);
  const n = schedule.teams.length;
  return { matches, courtHours, courtCost, officialCost, total, perTeam: n ? Math.ceil(Math.round(total * 100) / n) / 100 : 0 };
}

/**
 * Does the season finish by a date the organiser has to meet (end of term, venue lease,
 * tournament weekend)? `deadline` is a day number as `parseDate` returns. Returns null for a
 * missing or invalid deadline or an empty schedule, else { deadline, lastDay, fits,
 * daysSpare, roundsAfter, matchesAfter } where `daysSpare` is negative when the last game
 * falls after the deadline, and `roundsAfter` / `matchesAfter` count the rounds and
 * matches (makeup rounds included) dated after it.
 */
export function deadlineCheck(schedule, deadline) {
  if (!Number.isInteger(deadline) || !schedule.rounds.length) return null;
  const days = schedule.rounds.map((r) => r.day);
  const lastDay = Math.max(...days);
  const late = schedule.rounds.filter((r) => r.day > deadline);
  return {
    deadline, lastDay, fits: lastDay <= deadline, daysSpare: deadline - lastDay,
    roundsAfter: late.length, matchesAfter: late.reduce((a, r) => a + r.matches.length, 0),
  };
}

/**
 * Rest between games, per team: days between consecutive matches (byes and idle nights
 * count as rest). Returns { rows: [{ team, games, shortest, longest }], shortest, longest,
 * back_to_back } where back_to_back counts gaps of 1 day or less, so a league playing on
 * two adjacent weekdays can see who gets no night off. Teams with under two games have
 * null gaps.
 */
export function restReport(schedule) {
  const days = schedule.teams.map(() => []);
  for (const r of schedule.rounds) for (const m of r.matches) { days[m.home].push(r.day); days[m.away].push(r.day); }
  let shortest = null, longest = null, backToBack = 0;
  const rows = schedule.teams.map((team, i) => {
    // several games on one night (doubleheaders) are one night: rest is counted between nights
    const d = [...new Set(days[i])].sort((a, b) => a - b);
    let lo = null, hi = null;
    for (let k = 1; k < d.length; k++) {
      const gap = d[k] - d[k - 1];
      if (lo === null || gap < lo) lo = gap;
      if (hi === null || gap > hi) hi = gap;
      if (gap <= 1) backToBack++;
    }
    if (lo !== null && (shortest === null || lo < shortest)) shortest = lo;
    if (hi !== null && (longest === null || hi > longest)) longest = hi;
    return { team, games: days[i].length, shortest: lo, longest: hi };
  });
  return { rows, shortest, longest, back_to_back: backToBack };
}

/**
 * Byes per team in an odd league: the dated rounds each team sits out, so an organiser sees
 * who is idle in the opening or closing week and whether a double round robin gives anyone
 * two byes in consecutive rounds (the end of one leg and the start of the next). Makeup
 * rounds are ignored. Returns { rows: [{ team, byes: [{ label, day }], consecutive }],
 * consecutive: [team names], first: [team names], last: [team names] }. An even league has
 * no byes: rows is empty and every list is empty.
 */
export function byeReport(schedule) {
  const rounds = schedule.rounds.filter((r) => !r.makeup).sort((a, b) => a.day - b.day);
  const byes = schedule.teams.map(() => []);
  rounds.forEach((r, k) => { if (r.bye !== null && r.bye !== undefined) byes[r.bye].push({ label: r.label, day: r.day, k }); });
  const rows = [];
  const consecutive = [], first = [], last = [];
  schedule.teams.forEach((team, i) => {
    if (!byes[i].length) return;
    const adj = byes[i].some((b, j) => j > 0 && b.k - byes[i][j - 1].k === 1);
    if (adj) consecutive.push(team);
    if (byes[i].some((b) => b.k === 0)) first.push(team);
    if (byes[i].some((b) => b.k === rounds.length - 1)) last.push(team);
    rows.push({ team, byes: byes[i].map(({ label, day }) => ({ label, day })), consecutive: adj });
  });
  return { rows, consecutive, first, last };
}

/**
 * Home and away load per team, in date order: home games, away games and the longest run of
 * home or away games in a row (byes do not break a run). Returns { rows: [{ team, home, away,
 * longestHome, longestAway }], longestRun, worst } where worst names the teams holding the
 * longest run and which kind it is, so an organiser sees who is stuck on the road.
 */
export function homeAwayReport(schedule) {
  const seq = schedule.teams.map(() => []);
  const rounds = schedule.rounds.slice().sort((a, b) => a.day - b.day);
  for (const r of rounds) for (const m of r.matches) { seq[m.home].push("H"); seq[m.away].push("A"); }
  let longestRun = 0;
  const rows = schedule.teams.map((team, i) => {
    let lh = 0, la = 0, run = 0, prev = null;
    for (const c of seq[i]) {
      run = c === prev ? run + 1 : 1;
      prev = c;
      if (c === "H") lh = Math.max(lh, run); else la = Math.max(la, run);
    }
    longestRun = Math.max(longestRun, lh, la);
    return { team, home: seq[i].filter((c) => c === "H").length, away: seq[i].filter((c) => c === "A").length, longestHome: lh, longestAway: la };
  });
  const worst = [];
  for (const r of rows) {
    if (longestRun > 0 && r.longestHome === longestRun) worst.push({ team: r.team, kind: "home" });
    if (longestRun > 0 && r.longestAway === longestRun) worst.push({ team: r.team, kind: "away" });
  }
  return { rows, longestRun, worst };
}

/**
 * Rematch spacing for a double round-robin: days between the two meetings of each pair, so
 * a league can see whether any pair replays the same fixture back to back. Returns
 * { pairs: [{ a, b, gap }] sorted shortest first, shortest, longest }. A single round-robin
 * has no rematches: pairs is empty and shortest/longest are null. A pair that meets more
 * than twice (after rainouts) is measured between its two closest meetings.
 */
export function rematchReport(schedule) {
  const meets = new Map();
  for (const r of schedule.rounds) for (const m of r.matches) {
    const key = Math.min(m.home, m.away) + "-" + Math.max(m.home, m.away);
    if (!meets.has(key)) meets.set(key, []);
    meets.get(key).push(r.day);
  }
  const pairs = [];
  for (const [key, days] of meets) {
    if (days.length < 2) continue;
    const d = days.slice().sort((x, y) => x - y);
    let gap = Infinity;
    for (let k = 1; k < d.length; k++) gap = Math.min(gap, d[k] - d[k - 1]);
    const [a, b] = key.split("-").map(Number);
    pairs.push({ a: schedule.teams[a], b: schedule.teams[b], gap });
  }
  pairs.sort((x, y) => x.gap - y.gap || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0) || (x.b < y.b ? -1 : 1));
  return { pairs, shortest: pairs.length ? pairs[0].gap : null, longest: pairs.length ? pairs[pairs.length - 1].gap : null };
}

// ---------------------------------------------------------------- independent validator

/**
 * Re-checks a finished schedule from its output alone (it calls none of the generator's
 * helpers): every pair meets the right number of times, no team plays twice in a round,
 * home/away is balanced, no slot is double-booked, dates fall on the chosen weekdays and
 * avoid skip dates and blackouts. Returns { ok, errors[] }.
 */
export function validateSchedule(schedule) {
  const errors = [];
  const n = schedule.teams.length;
  const cfg = schedule.config;
  const want = cfg.double ? 2 : 1;
  const pair = new Map();
  const homeOf = Array(n).fill(0);
  const awayOf = Array(n).fill(0);
  const seenDays = new Set();
  let prevDay = -Infinity;
  for (const round of schedule.rounds) {
    if (!Number.isInteger(round.day)) { errors.push(`${round.label}: no date.`); continue; }
    if (seenDays.has(round.day)) errors.push(`${round.label}: another round is already on ${dayIso(round.day)}.`);
    seenDays.add(round.day);
    if (round.day < prevDay) errors.push(`${round.label}: dated before the round above it.`);
    prevDay = round.day;
    if (!round.chosenDay && !cfg.weekdays.includes(new Date(round.day * 86400000).getUTCDay())) errors.push(`${round.label}: ${dayIso(round.day)} is not a chosen weekday.`);
    if (!round.chosenDay && cfg.skipDays.includes(round.day)) errors.push(`${round.label}: ${dayIso(round.day)} is a skip date.`);
    const inRound = new Map();
    const atTime = new Set();
    const perNight = cfg.gamesPerNight > 1 ? cfg.gamesPerNight : 1;
    const cells = new Set();
    for (const m of round.matches) {
      const { home, away } = m;
      if (![home, away].every((t) => Number.isInteger(t) && t >= 0 && t < n) || home === away) { errors.push(`${round.label}: bad match ${home} v ${away}.`); continue; }
      for (const t of [home, away]) {
        const c = (inRound.get(t) || 0) + 1;
        inRound.set(t, c);
        if (c === perNight + 1) errors.push(`${round.label}: ${schedule.teams[t]} plays ${perNight === 1 ? "twice" : `more than ${perNight} games`}.`);
        if (perNight > 1) {
          if (atTime.has(`${t}|${m.time}`)) errors.push(`${round.label}: ${schedule.teams[t]} has two games at ${m.time || "the one time slot"}.`);
          atTime.add(`${t}|${m.time}`);
        }
        if ((cfg.blackouts[t] || []).includes(round.day)) errors.push(`${round.label}: ${schedule.teams[t]} cannot play on ${dayIso(round.day)}.`);
      }
      const key = `${Math.min(home, away)}-${Math.max(home, away)}`;
      const rec = pair.get(key) || { count: 0, hostedByLow: 0, hostedByHigh: 0 };
      rec.count++;
      if (home < away) rec.hostedByLow++; else rec.hostedByHigh++;
      pair.set(key, rec);
      homeOf[home]++; awayOf[away]++;
      const cell = `${m.court}|${m.time}`;
      if (cells.has(cell)) errors.push(`${round.label}: ${m.court} at ${m.time || "the one time slot"} is booked twice.`);
      cells.add(cell);
      if (!cfg.courts.includes(m.court)) errors.push(`${round.label}: unknown court ${m.court}.`);
      else if (courtClosedOn(cfg, m.court, round.day)) errors.push(`${round.label}: ${m.court} is closed on ${dayIso(round.day)}.`);
      if (!cfg.times.includes(m.time)) errors.push(`${round.label}: unknown time ${m.time}.`);
      for (const t of [home, away]) {
        const lim = (cfg.timeLimits || {})[t];
        if (lim && !lim.includes(m.time)) errors.push(`${round.label}: ${schedule.teams[t]} only plays at ${lim.join(", ")}, but is at ${m.time}.`);
        const cl = (cfg.courtLimits || {})[t];
        if (cl && !cl.includes(m.court)) errors.push(`${round.label}: ${schedule.teams[t]} only plays on ${cl.join(", ")}, but is on ${m.court}.`);
      }
    }
  }
  const withdrawn = new Set((schedule.withdrawals || []).map((w) => w.team));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const rec = pair.get(`${a}-${b}`);
      const c = rec ? rec.count : 0;
      if (withdrawn.has(a) || withdrawn.has(b)) {
        if (c > want) errors.push(`${schedule.teams[a]} and ${schedule.teams[b]} meet ${c} time(s), expected at most ${want}.`);
        continue;
      }
      if (cfg.partial ? c > want : c !== want) errors.push(`${schedule.teams[a]} and ${schedule.teams[b]} meet ${c} time(s), expected ${cfg.partial ? "at most " : ""}${want}.`);
      if (want === 2 && !cfg.partial && rec && (rec.hostedByLow !== 1 || rec.hostedByHigh !== 1)) errors.push(`${schedule.teams[a]} and ${schedule.teams[b]} do not each host once.`);
    }
  }
  const tolerance = cfg.partial ? want : want === 2 ? 0 : 1;
  const lost = Array(n).fill(0);
  for (const w of schedule.withdrawals || []) for (const x of w.removed) { lost[x.home]++; lost[x.away]++; }
  for (let t = 0; t < n; t++) {
    if (Math.abs(homeOf[t] - awayOf[t]) > tolerance + lost[t]) errors.push(`${schedule.teams[t]} has ${homeOf[t]} home and ${awayOf[t]} away games.`);
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------- rainouts

/**
 * Rainouts and cancellations. Each line of `text` is a date, optionally followed by team names
 * (comma separated): "2026-10-13" cancels every match that night, "2026-10-13 Lob Squad" only that
 * team's match. A cancelled match moves to the earliest later playable date on which both teams are
 * free (no blackout, not already playing) and a court and time slot are open; the rest of the
 * schedule is left exactly as it was, so nobody's other fixtures change. Returns a new schedule
 * (the input is not mutated) plus `moves` and `errors`. End a line with `-> 2026-10-20` to name the
 * make-up date yourself (any day, not only a league weekday); it is refused, with the reason, if
 * either team is blacked out or already playing, or no court and slot is free, and the match stays put.
 */
export function applyRainouts(schedule, text, opts = {}) {
  const s = JSON.parse(JSON.stringify(schedule));
  const cfg = s.config;
  const weekdaySet = new Set(cfg.weekdays);
  const skipSet = new Set(cfg.skipDays);
  const moves = [];
  const errors = [];
  const nameIdx = (name) => s.teams.findIndex((t) => t.toLowerCase() === name.toLowerCase());
  const slotOf = (m) => cfg.times.indexOf(m.time) * cfg.courts.length + cfg.courts.indexOf(m.court);
  for (const raw of String(text ?? "").split(/\n+/)) {
    let line = raw.trim();
    if (!line) continue;
    // "2026-10-13 Lob Squad -> 2026-10-20" names the make-up date instead of searching for one.
    let fixed = null;
    const arrow = line.match(/^(.*?)\s*(?:->|=>|\u2192)\s*(\d{4}-\d{1,2}-\d{1,2})\s*$/);
    if (arrow) {
      fixed = parseDate(arrow[2]);
      line = arrow[1].trim();
      if (fixed === null) { errors.push(`"${raw.trim()}": "${arrow[2]}" is not a real date.`); continue; }
    }
    const m = line.match(/^(\d{4}-\d{1,2}-\d{1,2})\s*[:,-]?\s*(.*)$/);
    const day = m ? parseDate(m[1]) : null;
    if (day === null) { errors.push(`"${line}": start each line with a real date like 2026-10-13.`); continue; }
    const wanted = [];
    for (const nm of parseNameList(m[2])) {
      const i = nameIdx(nm);
      if (i < 0) errors.push(`"${nm}" is not one of the teams.`); else wanted.push(i);
    }
    const round = s.rounds.find((r) => r.day === day);
    if (!round) { errors.push(`${dayIso(day)}: no matches are scheduled that night.`); continue; }
    const cancelled = round.matches.filter((x) => !m[2].trim() || wanted.includes(x.home) || wanted.includes(x.away));
    if (!cancelled.length) { errors.push(`${dayIso(day)}: none of those teams play that night.`); continue; }
    round.matches = round.matches.filter((x) => !cancelled.includes(x));
    for (const mt of cancelled) {
      let d = fixed !== null ? fixed : day + 1;
      let placed = null;
      if (fixed !== null && (opts.allowEarlier ? fixed === day : fixed <= day)) { errors.push(`${mt.homeName} v ${mt.awayName}: ${dayIso(fixed)} is not after ${dayIso(day)}.`); round.matches.push(mt); continue; }
      for (let guard = 0; guard < (fixed !== null ? 1 : 400) && !placed; guard++, d++) {
        if (fixed === null) { d = nextPlayDay(d, weekdaySet, skipSet); if (d === null) break; }
        const blocked = (t) => (cfg.blackouts[t] || []).includes(d);
        if (blocked(mt.home) || blocked(mt.away)) continue;
        const target = s.rounds.find((r) => r.day === d);
        if (target && target.matches.some((x) => [x.home, x.away].some((t) => t === mt.home || t === mt.away))) continue;
        const taken = new Set((target ? target.matches : []).map(slotOf));
        const total = cfg.courts.length * cfg.times.length;
        const want = slotOf(mt);
        const timeOk = (k) => [mt.home, mt.away].every((t) => !(cfg.timeLimits || {})[t] || cfg.timeLimits[t].includes(cfg.times[Math.floor(k / cfg.courts.length)]));
        const courtOk = (k) => [mt.home, mt.away].every((t) => !(cfg.courtLimits || {})[t] || cfg.courtLimits[t].includes(cfg.courts[k % cfg.courts.length]));
        const slotOk = (k) => timeOk(k) && courtOk(k) && !courtClosedOn(cfg, cfg.courts[k % cfg.courts.length], d);
        const free = !taken.has(want) && slotOk(want) ? want : Array.from({ length: total }, (_, k) => k).find((k) => !taken.has(k) && slotOk(k));
        if (free === undefined) continue;
        placed = { d, target, free };
      }
      if (!placed) { errors.push(fixed !== null ? `${mt.homeName} v ${mt.awayName}: cannot play on ${dayIso(fixed)} (a team is away or busy that day, or no court and time slot is free). Leave the date off to let it search.` : `${mt.homeName} v ${mt.awayName}: no free date found after ${dayIso(day)}.`); round.matches.push(mt); continue; }
      const moved = { ...mt, court: cfg.courts[placed.free % cfg.courts.length], time: cfg.times[Math.floor(placed.free / cfg.courts.length)], moved: true, moves: (mt.moves || 0) + 1, slot: placed.free };
      if (placed.target) placed.target.matches.push(moved);
      else s.rounds.push({ number: null, label: "Rescheduled", makeup: true, ...(fixed !== null ? { chosenDay: true } : {}), day: placed.d, bye: null, matches: [moved] });
      moves.push({ from: day, to: placed.d, home: mt.homeName, away: mt.awayName, court: moved.court, time: moved.time });
    }
  }
  s.rounds = s.rounds.filter((r) => r.matches.length || (r.bye !== null && r.bye !== undefined)).sort((a, b) => a.day - b.day);
  for (const r of s.rounds) r.matches.sort((a, b) => a.slot - b.slot);
  let mk = 0;
  for (const r of s.rounds) if (r.makeup) r.label = `Makeup ${++mk}`;
  if (moves.length && !opts.quiet) s.notices = [...s.notices, `${moves.length} match(es) moved after a rainout. Everything else is unchanged.`];
  s.stats = scheduleStats(s);
  return { schedule: s, moves, errors };
}

// ---------------------------------------------------------------- change notices

/**
 * Ready-to-paste notices for the matches `applyRainouts` moved (its `moves`). Returns
 * `{ group, teams }`: `group` is one post for the league chat listing every moved match
 * (old date, new date, time, court), and `teams` has one short note per affected team with
 * only its own changes. Teams with no moved match get no note. Empty `moves` give an empty result.
 */
export function changeNotices(moves) {
  const list = Array.isArray(moves) ? moves : [];
  if (!list.length) return { group: "", teams: [] };
  const where = (m) => `${dayLabel(m.to)}${m.time ? " " + m.time : ""}${m.court ? ", " + m.court : ""}`;
  const line = (m) => `${m.home} v ${m.away}: was ${dayLabel(m.from)}, now ${where(m)}`;
  const group = ["Schedule change:", ...list.map((m) => "- " + line(m)), "Every other fixture is unchanged."].join("\n");
  const byTeam = new Map();
  for (const m of list) for (const t of [m.home, m.away]) {
    if (!byTeam.has(t)) byTeam.set(t, []);
    byTeam.get(t).push(m);
  }
  const teams = [...byTeam].map(([team, ms]) => ({
    team,
    text: [`Hi ${team}, a change to your fixtures:`, ...ms.map((m) => `- ${m.home === team ? "vs " + m.away : "at " + m.home} (${m.home === team ? "home" : "away"}): was ${dayLabel(m.from)}, now ${where(m)}`), "Your other fixtures are unchanged."].join("\n"),
  }));
  return { group, teams };
}

// ---------------------------------------------------------------- pinned matches

/**
 * Pinned fixtures: a derby on opening night, a cup rematch the venue booked months ago. Each line of
 * `text` is `Hawks v Owls -> 2026-11-03` (`vs`, `-` and `,` also split the names; `->`, `=>` or an
 * arrow gives the date, which may be before or after the match's current night and need not be a
 * league weekday). The pair's earliest meeting that is not already pinned moves there, using the same
 * checks as a named rainout make-up date: refused, with the reason, if either team is blacked out or
 * already playing that day, or no court and time slot is free, and the match stays put. Write a pair
 * twice to pin both legs of a double round robin. Nothing else moves. Returns a new schedule (the
 * input is not mutated) plus `pins` ({ from, to, home, away, court, time }) and `errors`.
 */
export function applyPinnedMatches(schedule, text) {
  let s = JSON.parse(JSON.stringify(schedule));
  const pins = [];
  const errors = [];
  for (const raw of String(text ?? "").split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*(?:->|=>|\u2192)\s*(\d{4}-\d{1,2}-\d{1,2})\s*$/);
    const to = m ? parseDate(m[2]) : null;
    if (!m || to === null) { errors.push(`"${line}": write it as Hawks v Owls -> 2026-11-03 with a real date.`); continue; }
    const names = m[1].split(/\s+(?:v|vs\.?|versus)\s+|\s*,\s*|\s+-\s+/i).map((x) => x.trim()).filter(Boolean);
    const idx = names.map((nm) => s.teams.findIndex((t) => t.toLowerCase() === nm.toLowerCase()));
    if (names.length !== 2 || idx.some((i) => i < 0) || idx[0] === idx[1]) {
      errors.push(`"${line}": name two different teams from the list, like Hawks v Owls.`);
      continue;
    }
    const mine = [];
    for (const r of s.rounds) for (const x of r.matches) if (x.home + x.away === idx[0] + idx[1] && [x.home, x.away].every((t) => idx.includes(t))) mine.push({ r, x });
    mine.sort((a, b) => a.r.day - b.r.day);
    if (mine.some(({ r, x }) => r.day === to && x.pinned)) { errors.push(`${names[0]} v ${names[1]}: already pinned to ${dayIso(to)}.`); continue; }
    const pick = mine.find(({ x }) => !x.pinned);
    if (!pick) { errors.push(`${names[0]} v ${names[1]}: ${mine.length ? "every meeting is already pinned" : "these teams do not meet in the schedule"}.`); continue; }
    if (pick.r.day === to) { pick.x.pinned = true; continue; }
    const res = applyRainouts(s, `${dayIso(pick.r.day)} ${s.teams[idx[0]]}, ${s.teams[idx[1]]} -> ${dayIso(to)}`, { allowEarlier: true, quiet: true });
    if (res.errors.length) { errors.push(...res.errors); continue; }
    s = res.schedule;
    for (const r of s.rounds) for (const x of r.matches) if (x.home + x.away === idx[0] + idx[1] && x.moved && !x.pinned && r.day === to) x.pinned = true;
    pins.push(...res.moves.map((mv) => ({ from: mv.from, to: mv.to, home: mv.home, away: mv.away, court: mv.court, time: mv.time })));
  }
  if (pins.length) {
    s.notices = [...s.notices, `${pins.length} match(es) pinned to a chosen date. Everything else is unchanged.`];
  }
  return { schedule: s, pins, errors };
}

// ---------------------------------------------------------------- withdrawals

/**
 * A team drops out mid-season. Each line of `text` is a team name, optionally led by the first date
 * it no longer plays: `Lob Squad` removes all of its matches, `2026-11-03 Lob Squad` removes only
 * those on or after that night and keeps the ones already played. Nothing else moves. The result
 * says, for every opponent, how many fixtures disappeared, because a league that must decide
 * whether earlier results with the team still count needs to see who is left short. Returns a new
 * schedule (the input is not mutated) plus `withdrawals` ({ team, from, removed[], opponentsShort[] })
 * and `errors`.
 */
export function applyWithdrawals(schedule, text) {
  const s = JSON.parse(JSON.stringify(schedule));
  const errors = [];
  const before = (s.withdrawals || []).length;
  const withdrawals = [...(s.withdrawals || [])];
  for (const raw of String(text ?? "").split(/\n+/)) {
    let line = raw.trim();
    if (!line) continue;
    // "2026-10-13 Lob Squad -> 2026-10-20" names the make-up date instead of searching for one.
    let fixed = null;
    const arrow = line.match(/^(.*?)\s*(?:->|=>|\u2192)\s*(\d{4}-\d{1,2}-\d{1,2})\s*$/);
    if (arrow) {
      fixed = parseDate(arrow[2]);
      line = arrow[1].trim();
      if (fixed === null) { errors.push(`"${raw.trim()}": "${arrow[2]}" is not a real date.`); continue; }
    }
    const m = line.match(/^(\d{4}-\d{1,2}-\d{1,2})\s*[:,-]?\s*(.*)$/);
    const from = m ? parseDate(m[1]) : null;
    if (m && from === null) { errors.push(`"${line}": that is not a real date.`); continue; }
    const name = (m ? m[2] : line).trim();
    const team = s.teams.findIndex((t) => t.toLowerCase() === name.toLowerCase());
    if (team < 0) { errors.push(`"${name}" is not one of the teams.`); continue; }
    if (withdrawals.some((w) => w.team === team)) { errors.push(`${s.teams[team]} has already withdrawn.`); continue; }
    const gone = (r, x) => (x.home === team || x.away === team) && (from === null || r.day >= from);
    const removed = [];
    for (const r of s.rounds) {
      for (const x of r.matches) if (gone(r, x)) removed.push({ home: x.home, away: x.away, day: r.day, fixture: x.fixture, time: x.time, court: x.court, moves: x.moves || 0, label: r.label });
      r.matches = r.matches.filter((x) => !gone(r, x));
    }
    withdrawals.push({ team, from, removed });
  }
  s.withdrawals = withdrawals;
  s.rounds = s.rounds.filter((r) => r.matches.length || (r.bye !== null && r.bye !== undefined));
  let mk = 0;
  for (const r of s.rounds) if (r.makeup) r.label = `Makeup ${++mk}`;
  const fresh = withdrawals.slice(before);
  for (const w of fresh) {
    const left = {};
    for (const x of w.removed) { const o = x.home === w.team ? x.away : x.home; left[o] = (left[o] || 0) + 1; }
    w.opponentsShort = Object.entries(left).map(([o, count]) => ({ team: s.teams[o], fixtures: count }));
    s.notices = [...s.notices, `${s.teams[w.team]} withdrew${w.from === null ? "" : " from " + dayIso(w.from)}: ${w.removed.length} fixture(s) removed, ${w.opponentsShort.length} opponent(s) now play fewer games. Decide in your league rules whether results already played against ${s.teams[w.team]} still count.`];
  }
  s.stats = scheduleStats(s);
  return { schedule: s, withdrawals: fresh, errors };
}

// ---------------------------------------------------------------- late joiners

/**
 * A team enters the league late. List it with the other teams, then give each late team on a line
 * of `text` as `2026-11-03 Newbies` (the first night it can play). Every match of that team dated
 * before that night moves to the earliest playable date on or after it on which both teams are free
 * (no blackout, not already playing) and a court and time slot are open, respecting each team's
 * time and court limits; late matches that fit no existing round get a make-up round. Nothing else
 * moves. Returns a new schedule (the input is not mutated) plus `joins` ({ team, from, moved[] })
 * and `errors`; a match that cannot be placed stays where it was and is named in `errors`.
 */
export function applyLateTeams(schedule, text) {
  const s = JSON.parse(JSON.stringify(schedule));
  const cfg = s.config;
  const weekdaySet = new Set(cfg.weekdays);
  const skipSet = new Set(cfg.skipDays);
  const total = cfg.courts.length * cfg.times.length;
  const slotOf = (m) => cfg.times.indexOf(m.time) * cfg.courts.length + cfg.courts.indexOf(m.court);
  const errors = [];
  const joins = [];
  for (const raw of String(text ?? "").split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d{4}-\d{1,2}-\d{1,2})\s*[:,-]?\s*(.*)$/);
    const from = m ? parseDate(m[1]) : null;
    if (from === null) { errors.push(`"${line}": start each line with the first night the team can play, like 2026-11-03 Newbies.`); continue; }
    const name = m[2].trim();
    const team = s.teams.findIndex((t) => t.toLowerCase() === name.toLowerCase());
    if (team < 0) { errors.push(`"${name}" is not one of the teams.`); continue; }
    if (joins.some((j) => j.team === team)) { errors.push(`${s.teams[team]} is already listed as a late joiner.`); continue; }
    const early = [];
    for (const r of s.rounds) {
      if (r.day >= from) continue;
      const mine = r.matches.filter((x) => x.home === team || x.away === team);
      early.push(...mine.map((x) => ({ x, round: r })));
      r.matches = r.matches.filter((x) => !mine.includes(x));
    }
    const moved = [];
    for (const { x: mt, round: origin } of early) {
      let placed = null;
      let d = from - 1;
      for (let guard = 0; guard < 400 && !placed; guard++) {
        d = nextPlayDay(d + 1, weekdaySet, skipSet);
        if (d === null) break;
        if ((cfg.blackouts[mt.home] || []).includes(d) || (cfg.blackouts[mt.away] || []).includes(d)) continue;
        const target = s.rounds.find((r) => r.day === d);
        if (target && target.matches.some((x) => [x.home, x.away].some((t) => t === mt.home || t === mt.away))) continue;
        const taken = new Set((target ? target.matches : []).map(slotOf));
        const ok = (k) => [mt.home, mt.away].every((t) => {
          const tl = (cfg.timeLimits || {})[t];
          const cl = (cfg.courtLimits || {})[t];
          return (!tl || tl.includes(cfg.times[Math.floor(k / cfg.courts.length)])) && (!cl || cl.includes(cfg.courts[k % cfg.courts.length])) && !courtClosedOn(cfg, cfg.courts[k % cfg.courts.length], d);
        });
        const free = Array.from({ length: total }, (_, k) => k).find((k) => !taken.has(k) && ok(k));
        if (free === undefined) continue;
        placed = { d, target, free };
      }
      if (!placed) {
        errors.push(`${mt.homeName} v ${mt.awayName}: no free date found on or after ${dayIso(from)}; it stays on its original night.`);
        origin.matches.push(mt);
        continue;
      }
      const mv = { ...mt, court: cfg.courts[placed.free % cfg.courts.length], time: cfg.times[Math.floor(placed.free / cfg.courts.length)], slot: placed.free, moved: true, moves: (mt.moves || 0) + 1 };
      if (placed.target) placed.target.matches.push(mv);
      else s.rounds.push({ number: null, label: "Makeup", makeup: true, day: placed.d, bye: null, matches: [mv] });
      moved.push({ home: mt.homeName, away: mt.awayName, to: placed.d, court: mv.court, time: mv.time });
    }
    joins.push({ team, from, moved });
  }
  s.rounds = s.rounds.filter((r) => r.matches.length || (r.bye !== null && r.bye !== undefined)).sort((a, b) => a.day - b.day);
  for (const r of s.rounds) r.matches.sort((a, b) => a.slot - b.slot);
  let mk = 0;
  for (const r of s.rounds) if (r.makeup) r.label = `Makeup ${++mk}`;
  for (const j of joins) {
    s.notices = [...s.notices, `${s.teams[j.team]} joins from ${dayIso(j.from)}: ${j.moved.length} match(es) moved to later nights. Everything else is unchanged.`];
  }
  s.lateJoins = [...(s.lateJoins || []), ...joins.map((j) => ({ team: j.team, from: j.from }))];
  s.stats = scheduleStats(s);
  return { schedule: s, joins, errors };
}

// ---------------------------------------------------------------- shared grounds

/** Lines like "Hawks, Owls" (teams that share one ground, rink or pitch). Two or more known teams per line. */
export function parseGrounds(text, teams) {
  const groups = [];
  const errors = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const names = line.split(/\s*[,;]\s*/).filter(Boolean);
    const idx = [];
    for (const name of names) {
      const i = teamIndex(teams, name);
      if (i < 0) errors.push(`Shared grounds: "${name}" is not one of the teams.`);
      else if (!idx.includes(i)) idx.push(i);
    }
    if (idx.length < 2) { errors.push(`Shared grounds: "${line}" needs at least two teams from the list.`); continue; }
    groups.push(idx);
  }
  return { groups, errors };
}

/**
 * Rounds where two or more teams that share a ground are both at home. Returns
 * { clashes: [{ round, day, teams[] }], count } where count is the number of surplus home teams
 * (three clubmates at home on one night count as 2).
 */
export function groundClashes(schedule, groups) {
  const clashes = [];
  let count = 0;
  for (const r of schedule.rounds) {
    const home = new Set(r.matches.map((m) => m.home));
    for (const g of groups) {
      const at = g.filter((t) => home.has(t));
      if (at.length > 1) { clashes.push({ round: r.label, day: r.day, teams: at.map((t) => schedule.teams[t]) }); count += at.length - 1; }
    }
  }
  return { clashes, count };
}

/**
 * Moves home games so teams that share a ground are not all at home on the same night. It only
 * flips venues (a double round robin flips both meetings of the pair, so each side still hosts
 * once) and keeps a flip only when it removes a clash and the independent validator still passes,
 * so dates, courts, times and the pairings never change. Returns a new schedule (input untouched),
 * the flips made, and the clashes left, which a league with more clubmates than away nights cannot avoid.
 */
export function applyGroundSharing(schedule, groups) {
  const s = JSON.parse(JSON.stringify(schedule));
  const flips = [];
  let best = groundClashes(s, groups).count;
  const flip = (m) => { [m.home, m.away] = [m.away, m.home]; [m.homeName, m.awayName] = [m.awayName, m.homeName]; };
  const inGroup = new Set(groups.flat());
  for (let pass = 0; pass < 3 && best > 0; pass++) {
    let changed = false;
    for (const r of s.rounds) {
      for (const m of r.matches) {
        if (best === 0) break;
        if (!inGroup.has(m.home)) continue;
        const key = (x) => Math.min(x.home, x.away) + "-" + Math.max(x.home, x.away);
        const pairKey = key(m);
        const same = [];
        for (const rr of s.rounds) for (const x of rr.matches) if (key(x) === pairKey) same.push([rr, x]);
        const before = groundClashes(s, groups).count;
        if (before === 0) break;
        for (const [, x] of same) flip(x);
        const after = groundClashes(s, groups).count;
        if (after < before && validateSchedule(s).ok) {
          best = after; changed = true;
          flips.push({ round: r.label, day: r.day, home: s.teams[m.home], away: s.teams[m.away] });
        } else {
          for (const [, x] of same) flip(x);
        }
      }
    }
    if (!changed) break;
  }
  const left = groundClashes(s, groups);
  s.stats = scheduleStats(s);
  return { schedule: s, flips, remaining: left.clashes, remainingCount: left.count };
}

// ---------------------------------------------------------------- linked teams (shared coach or players)

/** Lines like "Hawks U12, Hawks U14" (teams that share a coach or players and cannot play at the same time). */
export function parseLinkedTeams(text, teams) {
  const { groups, errors } = parseGrounds(text, teams);
  return { groups, errors: errors.map((e) => e.replace(/^Shared grounds:/, "Linked teams:")) };
}

/**
 * Nights where two or more linked teams play in different matches at the same time slot, so one coach or
 * player cannot be at both. Returns { clashes: [{ round, day, time, teams[] }], count } where count is the
 * number of surplus teams (three linked teams at one time count as 2). Two linked teams who meet each other
 * are not a clash.
 */
export function linkedClashes(schedule, groups) {
  const clashes = [];
  let count = 0;
  for (const r of schedule.rounds) {
    for (const g of groups) {
      const byTime = new Map();
      r.matches.forEach((m, mi) => {
        for (const t of [m.home, m.away]) if (g.includes(t)) {
          const k = m.time ?? "";
          if (!byTime.has(k)) byTime.set(k, []);
          byTime.get(k).push({ t, mi });
        }
      });
      for (const [time, at] of byTime) {
        const matchesAt = new Set(at.map((x) => x.mi));
        if (matchesAt.size > 1) {
          clashes.push({ round: r.label, day: r.day, time, teams: at.map((x) => schedule.teams[x.t]) });
          count += matchesAt.size - 1;
        }
      }
    }
  }
  return { clashes, count };
}

/**
 * Moves matches to another time slot on the same court and night so linked teams are not on at the same time.
 * A move or swap is kept only when it lowers the clash count and the independent validator still passes (so
 * dates, courts, opponents, venues and every team's time and court limits are untouched). Returns a new schedule
 * (input untouched), the moves made, and the clashes left, which a league with one time slot, or more linked
 * teams than slots, cannot avoid.
 */
export function separateLinkedTeams(schedule, groups) {
  const s = JSON.parse(JSON.stringify(schedule));
  const cfg = s.config;
  const moves = [];
  let best = linkedClashes(s, groups).count;
  const nT = cfg.times.length;
  if (nT > 1) {
    for (let pass = 0; pass < 3 && best > 0; pass++) {
      let changed = false;
      for (const r of s.rounds) {
        for (const m of [...r.matches]) {
          if (best === 0) break;
          for (let ti = 0; ti < nT && best > 0; ti++) {
            if (cfg.times[ti] === m.time) continue;
            const other = r.matches.find((x) => x !== m && x.court === m.court && x.time === cfg.times[ti]);
            const oldTime = m.time;
            const set = (x, time) => { x.time = time; x.slot = cfg.courts.indexOf(x.court) + cfg.courts.length * cfg.times.indexOf(time); };
            const before = best;
            set(m, cfg.times[ti]);
            if (other) set(other, oldTime);
            const after = linkedClashes(s, groups).count;
            if (after < before && validateSchedule(s).ok) {
              best = after; changed = true;
              moves.push({ round: r.label, day: r.day, match: `${m.homeName} v ${m.awayName}`, from: oldTime, to: m.time });
              break;
            }
            set(m, oldTime);
            if (other) set(other, cfg.times[ti]);
          }
        }
        r.matches.sort((a, b) => a.slot - b.slot);
      }
      if (!changed) break;
    }
  }
  const left = linkedClashes(s, groups);
  s.stats = scheduleStats(s);
  return { schedule: s, moves, remaining: left.clashes, remainingCount: left.count };
}
