// Practice slots: the weekly practice timetable for a league whose teams share fields.
//
// Youth soccer, Little League, flag football and rec basketball clubs hand every team one or two
// practice slots a week on a few fields that are split into halves or quarters. The volunteer who
// makes the grid juggles field capacity (a U8 team needs a quarter, a U14 team a half), coaches who
// coach two teams, early finishes for the youngest players, game days, the days each coach can make
// and the times they asked for. Done by hand in a spreadsheet the first-come teams take the good
// slots; this module shares them out with a seeded search that treats every team's misses alike.
//
// The model, all of it in this file:
// - a field window is a field, a weekday, a time range and its capacity in units (a field split
//   into quarters has 4). Windows are cut into blocks of the practice length;
// - a team needs `times` practices a week on different days, each taking `units` of one block;
// - hard rules: capacity, one practice a day per team, its no-days and game days, its earliest
//   start and latest end, and no two teams of one coach at overlapping times;
// - each team's misses: 2 for a practice off its preferred days, 2 for one outside its preferred
//   times, 1 for each pair of practices on consecutive days. The search minimises the sum of the
//   squares of the teams' misses (so two teams missing once beats one team missing twice), with
//   any practice left unplaced costing far more than every miss together.
//
// It also reports a lower bound: each team's best week if it had the fields to itself. When the
// search meets it, no other grid is better, and the page says so.
//
// Nothing here touches the DOM, storage or the network.

import { parseTime, csvCell, icsEscape, icsFold } from "./calc.mjs";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MAX_TEAMS = 300;
export const MAX_WINDOWS = 200;
export const MAX_TIMES = 5;
export const MAX_UNITS = 8;
export const MISS_DAY = 2, MISS_TIME = 2, MISS_BACK_TO_BACK = 1;
export const UNPLACED = 10000;

const DAY_NAMES = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const clock = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "Mon Wed", "Mon/Wed", "Mon-Thu", "weekdays", "Tue and Thu" -> sorted day numbers, or null when any word is not a day. */
export function parseDays(text) {
  const s = String(text ?? "").toLowerCase().replace(/\band\b|&/g, " ").trim();
  if (!s) return null;
  const out = new Set();
  for (const tok of s.split(/[\s,/;+]+/).filter(Boolean)) {
    if (tok === "weekdays") { [1, 2, 3, 4, 5].forEach((d) => out.add(d)); continue; }
    if (tok === "weekends" || tok === "weekend") { out.add(0); out.add(6); continue; }
    const range = tok.match(/^([a-z]+)[-–]([a-z]+)$/);
    if (range) {
      const a = DAY_NAMES[range[1]], b = DAY_NAMES[range[2]];
      if (a === undefined || b === undefined) return null;
      for (let d = a; ; d = (d + 1) % 7) { out.add(d); if (d === b) break; }
      continue;
    }
    const d = DAY_NAMES[tok.replace(/s$/, "")] ?? DAY_NAMES[tok];
    if (d === undefined) return null;
    out.add(d);
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

/** "17:00-20:00", "5-8pm", "5:30pm to 7pm" -> { start, end } in minutes, or null. A suffix on the end applies to a bare start. */
export function parseRange(text) {
  const m = String(text ?? "").trim().toLowerCase().match(/^(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?$/);
  if (!m) return null;
  const endT = parseTime(m[3] + (m[4] || ""));
  if (!endT) return null;
  const end = toMin(endT);
  let start;
  if (m[2]) start = parseTime(m[1] + m[2]);
  else if (m[4]) {
    // "5-8pm": the start takes the end's suffix when that keeps it before the end, else the other one.
    const same = parseTime(m[1] + m[4]);
    start = same && toMin(same) < end ? same : parseTime(m[1] + (m[4] === "pm" ? "am" : "pm"));
  } else start = parseTime(m[1]);
  if (!start) return null;
  const s = toMin(start);
  return s < end ? { start: s, end } : null;
}

const splitParts = (line) => (/[|\t]/.test(line) ? line.split(/[|\t]/) : line.split(",")).map((p) => p.trim()).filter(Boolean);

/**
 * Field windows, one per line: a field, its days, a time range and its capacity in units, in any
 * order after the name, separated by | or tabs or commas. "North 1 | Mon Wed | 5-8pm | 4".
 * Capacity defaults to 1 (a whole field for one team).
 */
export function parseFields(text) {
  const windows = [], errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = splitParts(line);
    const name = parts.shift().replace(/:$/, "").slice(0, 60);
    let days = [], range = null, units = 1, bad = null;
    for (const p of parts) {
      const d = parseDays(p), r = parseRange(p);
      const u = p.toLowerCase().match(/^(\d+)\s*(units?|teams?|spaces?|parts?|halves|quarters|thirds)?$/) || p.toLowerCase().match(/^(?:units?|capacity)\s*:?\s*(\d+)$/);
      if (d) days.push(...d);
      else if (r) range = r;
      else if (u) units = Number(u[1]);
      else if (/^halves?$/i.test(p)) units = 2;
      else if (/^quarters?$/i.test(p)) units = 4;
      else bad = p;
    }
    const at = `Field line ${i + 1} ("${line.slice(0, 40)}")`;
    if (bad) errors.push(`${at}: "${bad}" is not a day, a time range like 5-8pm or a number of units.`);
    else if (!days.length) errors.push(`${at}: no days (Mon, Tue and so on).`);
    else if (!range) errors.push(`${at}: no time range (17:00-20:00 or 5-8pm).`);
    else if (!(units >= 1 && units <= MAX_UNITS)) errors.push(`${at}: units must be 1 to ${MAX_UNITS}.`);
    else for (const day of new Set(days)) windows.push({ field: name, day, start: range.start, end: range.end, units });
  });
  // The same field twice on one day must not overlap: its capacity would count twice.
  for (let a = 0; a < windows.length; a++) for (let b = a + 1; b < windows.length; b++) {
    const x = windows[a], y = windows[b];
    if (x.field.toLowerCase() === y.field.toLowerCase() && x.day === y.day && x.start < y.end && y.start < x.end)
      errors.push(`${x.field} is listed twice on ${DAYS[x.day]} at overlapping times (${clock(x.start)}-${clock(x.end)} and ${clock(y.start)}-${clock(y.end)}).`);
  }
  if (windows.length > MAX_WINDOWS) errors.push(`Up to ${MAX_WINDOWS} field windows.`);
  return { windows, errors };
}

/**
 * Teams, one per line: the name, then any of (in any order, separated by | or tabs or commas):
 * "coach Lee", "2 units", "2 a week", "not Fri", "games Sat", "prefer Tue Thu", "prefer 5-7pm",
 * "by 7pm" (latest end), "after 5:30pm" (earliest start). A bare day list or time range is a preference.
 */
export function parseTeamList(text, { units = 1, times = 1 } = {}) {
  const teams = [], errors = [];
  const seen = new Set();
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = splitParts(line);
    const name = parts.shift().slice(0, 60);
    const t = { name, coach: "", units: Number(units) || 1, times: Number(times) || 1, not: [], games: [], preferDays: [], preferTime: null, earliest: 0, latest: 24 * 60 };
    const at = `Team line ${i + 1} (${name})`;
    let bad = null;
    for (const p0 of parts) {
      const p = p0.trim(), low = p.toLowerCase();
      let m;
      if ((m = low.match(/^coach(?:es)?\s*:?\s*(.+)$/))) t.coach = p.slice(p.length - m[1].length).trim().slice(0, 60);
      else if ((m = low.match(/^(\d+)\s*units?$/) || low.match(/^units?\s*:?\s*(\d+)$/))) t.units = Number(m[1]);
      else if (/^(half|half field|half a field)$/.test(low)) t.units = 2;
      else if (/^(quarter|quarter field)$/.test(low)) t.units = 1;
      else if ((m = low.match(/^(\d+)\s*(?:x|times|practices?|sessions?)?\s*(?:a|per|\/)?\s*(?:week|wk)$/) || low.match(/^(\d+)\s*x$/) || low.match(/^(?:times|practices)\s*:?\s*(\d+)$/))) t.times = Number(m[1]);
      else if ((m = low.match(/^(?:not|no|never|except|off)\s*:?\s*(.+)$/))) { const d = parseDays(m[1]); if (d) t.not.push(...d); else bad = p; }
      else if ((m = low.match(/^games?\s*(?:on|day|days)?\s*:?\s*(.+)$/))) { const d = parseDays(m[1]); if (d) t.games.push(...d); else bad = p; }
      else if ((m = low.match(/^(?:by|before|end by|ends? by|finish by|latest)\s*:?\s*(.+)$/))) { const x = parseTime(m[1]); if (x) t.latest = toMin(x); else bad = p; }
      else if ((m = low.match(/^(?:after|from|start after|earliest|not before)\s*:?\s*(.+)$/))) { const x = parseTime(m[1]); if (x) t.earliest = toMin(x); else bad = p; }
      else if ((m = low.match(/^(?:prefers?|wants?|likes?|ideally)\s*:?\s*(.+)$/)) || (m = [null, low])) {
        // A preference: days, a time range, or both ("Tue Thu 5-7pm").
        const s = m[1];
        const r = s.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*$/);
        const rest = r ? s.slice(0, s.length - r[1].length).trim() : s;
        const range = r ? parseRange(r[1]) : null;
        const d = rest ? parseDays(rest) : [];
        if ((r && !range) || d === null || (!r && !rest)) bad = p;
        else { if (range) t.preferTime = range; if (d.length) t.preferDays.push(...d); }
      }
    }
    if (bad) errors.push(`${at}: "${bad}" is not understood (try coach Lee, 2 units, 2 a week, not Fri, games Sat, prefer Tue Thu, prefer 5-7pm, by 7pm, after 5pm).`);
    else if (seen.has(name.toLowerCase())) errors.push(`${at}: listed twice; add an age group or colour to tell them apart.`);
    else if (!(t.units >= 1 && t.units <= MAX_UNITS)) errors.push(`${at}: units must be 1 to ${MAX_UNITS}.`);
    else if (!(t.times >= 1 && t.times <= MAX_TIMES)) errors.push(`${at}: 1 to ${MAX_TIMES} practices a week.`);
    else if (t.earliest >= t.latest) errors.push(`${at}: its earliest start is not before its latest end.`);
    else {
      seen.add(name.toLowerCase());
      t.not = [...new Set(t.not)].sort((a, b) => a - b);
      t.games = [...new Set(t.games)].sort((a, b) => a - b);
      t.preferDays = [...new Set(t.preferDays)].sort((a, b) => a - b);
      teams.push(t);
    }
  });
  if (teams.length > MAX_TEAMS) errors.push(`Up to ${MAX_TEAMS} teams.`);
  return { teams, errors };
}

// ---------------------------------------------------------------- the search

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const adjacentDays = (a, b) => (a - b + 7) % 7 === 1 || (b - a + 7) % 7 === 1;

/** The blocks of every window, and each team's allowed options with their own miss cost. */
export function practiceOptions(windows, teams, minutes = 60) {
  const blocks = [];
  windows.forEach((w, wi) => {
    for (let s = w.start; s + minutes <= w.end; s += minutes) blocks.push({ w: wi, field: w.field, day: w.day, start: s, end: s + minutes, cap: w.units });
  });
  const options = teams.map((t) => {
    const blocked = new Set([...t.not, ...t.games]);
    const out = [];
    blocks.forEach((b, bi) => {
      if (b.cap < t.units || blocked.has(b.day) || b.start < t.earliest || b.end > t.latest) return;
      let miss = 0;
      if (t.preferDays.length && !t.preferDays.includes(b.day)) miss += MISS_DAY;
      if (t.preferTime && !(b.start >= t.preferTime.start && b.end <= t.preferTime.end)) miss += MISS_TIME;
      out.push({ b: bi, day: b.day, start: b.start, end: b.end, miss });
    });
    return out;
  });
  return { blocks, options };
}

function teamMiss(opts, chosen) {
  let m = 0;
  const days = [];
  for (const o of chosen) if (o !== -1) { m += opts[o].miss; days.push(opts[o].day); }
  for (let i = 0; i < days.length; i++) for (let j = i + 1; j < days.length; j++) if (adjacentDays(days[i], days[j])) m += MISS_BACK_TO_BACK;
  return m;
}
const teamScore = (opts, chosen) => {
  const unplaced = chosen.filter((o) => o === -1).length;
  const m = teamMiss(opts, chosen);
  return unplaced * UNPLACED + m * m;
};

/**
 * A team's best week with the fields to itself: the fewest unplaced practices, then the least miss.
 * Days are independent apart from the back-to-back pairs, so every subset of its days is tried.
 */
export function soloBest(opts, times) {
  const best = new Array(7).fill(Infinity);
  for (const o of opts) best[o.day] = Math.min(best[o.day], o.miss);
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => best[d] < Infinity);
  const k = Math.min(times, days.length);
  let least = Infinity;
  for (let mask = 0; mask < 1 << days.length; mask++) {
    let bits = 0;
    for (let x = mask; x; x &= x - 1) bits++;
    if (bits !== k) continue;
    const pick = days.filter((_, i) => mask & (1 << i));
    let m = pick.reduce((s, d) => s + best[d], 0);
    for (let i = 0; i < pick.length; i++) for (let j = i + 1; j < pick.length; j++) if (adjacentDays(pick[i], pick[j])) m += MISS_BACK_TO_BACK;
    least = Math.min(least, m);
  }
  if (k === 0) least = 0;
  return { unplaced: times - k, miss: least, score: (times - k) * UNPLACED + least * least };
}

/**
 * The weekly practice grid. Returns placements, unplaced practices with a reason, each team's misses,
 * the score, the solo lower bound and whether the score meets it.
 */
export function buildPractices(windows, teams, { minutes = 60, seed = 1, iterations = null, restarts = null, coachGap = 0 } = {}) {
  // Three searches for a league of up to 80 practices, one above that (each takes longer and the
  // eval's misses were all small leagues: eval/practice-exact.txt).
  if (restarts === null) restarts = teams.reduce((a, t) => a + t.times, 0) <= 80 ? 3 : 1;
  // Independent searches from different draws; the lowest score wins (the first on a tie), and a
  // search that meets the solo bound ends it.
  let best = null;
  for (let r = 0; r < Math.max(1, restarts); r++) {
    const res = searchOnce(windows, teams, { minutes, seed: seed + 7919 * r, iterations, coachGap });
    if (!best || res.score < best.score) best = res;
    if (best.proved) break;
  }
  return best;
}

function searchOnce(windows, teams, { minutes, seed, iterations, coachGap }) {
  minutes = Math.max(15, Math.min(240, Math.floor(Number(minutes)) || 60));
  const { blocks, options } = practiceOptions(windows, teams, minutes);
  const T = teams.length;
  const rand = mulberry32(seed);
  const used = new Int32Array(blocks.length);
  const chosen = teams.map((t) => new Array(t.times).fill(-1));
  // Coaches: teams that share one cannot overlap (a coachGap of minutes between them, default 0).
  const coachOf = teams.map((t) => t.coach.trim().toLowerCase());
  const coachMates = teams.map((_, i) => (coachOf[i] ? teams.map((_, j) => j).filter((j) => j !== i && coachOf[j] === coachOf[i]) : []));

  const fits = (ti, oi, skipTeam = -1, skipK = -1) => {
    const o = options[ti][oi];
    const b = blocks[o.b];
    if (used[o.b] + teams[ti].units > b.cap) return false;
    const mine = chosen[ti];
    for (let k = 0; k < mine.length; k++) if (mine[k] !== -1 && !(ti === skipTeam && k === skipK) && options[ti][mine[k]].day === o.day) return false;
    for (const j of coachMates[ti]) for (const oj of chosen[j]) {
      if (oj === -1) continue;
      const p = options[j][oj];
      if (p.day === o.day && p.start < o.end + coachGap && o.start < p.end + coachGap) return false;
    }
    return true;
  };
  const place = (ti, k, oi) => { chosen[ti][k] = oi; if (oi !== -1) used[options[ti][oi].b] += teams[ti].units; };
  const lift = (ti, k) => { const oi = chosen[ti][k]; if (oi !== -1) used[options[ti][oi].b] -= teams[ti].units; chosen[ti][k] = -1; return oi; };

  // Greedy start: most constrained teams first, each practice to its cheapest open option.
  const order = teams.map((_, i) => i).sort((a, b) => options[a].length / teams[a].times - options[b].length / teams[b].times || a - b);
  for (const ti of order) for (let k = 0; k < teams[ti].times; k++) {
    let best = -1, bestScore = Infinity;
    for (let oi = 0; oi < options[ti].length; oi++) {
      if (!fits(ti, oi)) continue;
      chosen[ti][k] = oi;
      const s = teamScore(options[ti], chosen[ti]) + rand() * 0.01;
      chosen[ti][k] = -1;
      if (s < bestScore) { bestScore = s; best = oi; }
    }
    if (best !== -1) place(ti, k, best);
  }

  const scores = teams.map((_, i) => teamScore(options[i], chosen[i]));
  let total = scores.reduce((a, b) => a + b, 0);
  const snapshot = () => chosen.map((c) => c.slice());
  let bestChosen = snapshot(), bestTotal = total;
  const bound = teams.reduce((s, t, i) => s + soloBest(options[i], t.times).score, 0);

  // Every practice, and who sits in each block (for ejections).
  const slots = [];
  teams.forEach((t, ti) => { for (let k = 0; k < t.times; k++) slots.push([ti, k]); });
  const occ = blocks.map(() => []);
  const occAdd = (ti, k) => { const oi = chosen[ti][k]; if (oi !== -1) occ[options[ti][oi].b].push(ti * 8 + k); };
  const occDel = (ti, k) => { const oi = chosen[ti][k]; if (oi === -1) return; const l = occ[options[ti][oi].b]; const i = l.indexOf(ti * 8 + k); l[i] = l[l.length - 1]; l.pop(); };
  teams.forEach((t, ti) => { for (let k = 0; k < t.times; k++) occAdd(ti, k); });
  // A change log, so a rejected move is undone exactly.
  const log = [];
  const set = (ti, k, oi) => { log.push(ti, k, chosen[ti][k]); occDel(ti, k); lift(ti, k); place(ti, k, oi); occAdd(ti, k); };
  const undo = (mark) => { while (log.length > mark) { const o = log.pop(), k = log.pop(), ti = log.pop(); occDel(ti, k); lift(ti, k); place(ti, k, o); occAdd(ti, k); } };
  const bestOpen = (ti, k) => {
    let best = -1, bestS = Infinity;
    for (let q = 0; q < options[ti].length; q++) {
      if (!fits(ti, q)) continue;
      chosen[ti][k] = q;
      const sc = teamScore(options[ti], chosen[ti]) + rand() * 0.5;
      chosen[ti][k] = -1;
      if (sc < bestS) { bestS = sc; best = q; }
    }
    return best;
  };
  // Move practice (ti, k) to option oi, evicting one holder of its block when it does not fit; the
  // evicted practice goes to its best open option or, `depth` permitting, evicts in turn.
  const chain = (ti, k, oi, depth, touched) => {
    touched.add(ti);
    set(ti, k, -1);
    if (fits(ti, oi)) { set(ti, k, oi); return; }
    // Evict holders of the block, in random order, until it fits (a half-field team may need two
    // quarter-field teams out), then rehouse each evicted practice.
    if (depth < 0) return;
    const holders = occ[options[ti][oi].b].filter((x) => (x >> 3) !== ti);
    const out = [];
    while (holders.length && !fits(ti, oi)) {
      const h = holders.splice(Math.floor(rand() * holders.length), 1)[0];
      const tj = h >> 3, kj = h & 7;
      touched.add(tj);
      set(tj, kj, -1);
      out.push([tj, kj]);
    }
    if (!fits(ti, oi)) return;
    set(ti, k, oi);
    for (const [tj, kj] of out) {
      const q = bestOpen(tj, kj);
      if (q !== -1) set(tj, kj, q);
      else if (depth > 0 && options[tj].length) chain(tj, kj, Math.floor(rand() * options[tj].length), depth - 1, touched);
    }
  };

  const iters = iterations ?? Math.min(800000, 60000 + 8000 * slots.length);
  const CYCLES = 4, per = Math.ceil(iters / CYCLES);
  const T0 = 3, T1 = 0.05;
  for (let it = 0; it < iters && bestTotal > bound; it++) {
    if (it && it % per === 0) {
      // Reheat from the best grid found so far.
      for (let ti = 0; ti < T; ti++) for (let k = 0; k < chosen[ti].length; k++) { occDel(ti, k); lift(ti, k); }
      for (let ti = 0; ti < T; ti++) for (let k = 0; k < chosen[ti].length; k++) { place(ti, k, bestChosen[ti][k]); occAdd(ti, k); scores[ti] = teamScore(options[ti], chosen[ti]); }
      total = bestTotal;
    }
    const temp = T0 * Math.pow(T1 / T0, (it % per) / per);
    const [ti, k] = slots[Math.floor(rand() * slots.length)];
    const nopt = options[ti].length;
    if (!nopt) continue;
    const oi = Math.floor(rand() * nopt);
    if (oi === chosen[ti][k]) continue;
    const mark = log.length;
    const touched = new Set();
    const r = rand();
    if (r < 0.5) { touched.add(ti); set(ti, k, -1); if (fits(ti, oi)) set(ti, k, oi); else { undo(mark); continue; } }
    else chain(ti, k, oi, r < 0.85 ? 0 : 2, touched);
    let d = 0;
    const fresh = [];
    for (const tj of touched) { const ns = teamScore(options[tj], chosen[tj]); fresh.push([tj, ns]); d += ns - scores[tj]; }
    if (d <= 0 || (d < UNPLACED && rand() < Math.exp(-d / temp))) {
      for (const [tj, ns] of fresh) scores[tj] = ns;
      total += d;
      log.length = 0;
      if (total < bestTotal) { bestTotal = total; bestChosen = snapshot(); }
    } else undo(mark);
  }

  return describe(windows, teams, blocks, options, bestChosen, bestTotal, bound, minutes);
}

function describe(windows, teams, blocks, options, chosen, total, bound, minutes) {
  const placements = [], unplaced = [], perTeam = [];
  const used = new Int32Array(blocks.length);
  teams.forEach((t, ti) => chosen[ti].forEach((oi) => { if (oi !== -1) used[options[ti][oi].b] += t.units; }));
  teams.forEach((t, ti) => {
    const misses = [];
    const days = [];
    for (const oi of chosen[ti]) {
      if (oi === -1) continue;
      const o = options[ti][oi], b = blocks[o.b];
      placements.push({ team: t.name, coach: t.coach, field: b.field, day: b.day, start: b.start, end: b.end, units: t.units });
      days.push(b.day);
      if (t.preferDays.length && !t.preferDays.includes(b.day)) misses.push(`${DAYS[b.day]} is not one of its preferred days`);
      if (t.preferTime && !(b.start >= t.preferTime.start && b.end <= t.preferTime.end)) misses.push(`${DAYS[b.day]} ${clock(b.start)} is outside ${clock(t.preferTime.start)}-${clock(t.preferTime.end)}`);
    }
    days.sort((a, b) => a - b);
    for (let i = 0; i < days.length; i++) for (let j = i + 1; j < days.length; j++) if (adjacentDays(days[i], days[j])) misses.push(`${DAYS[days[i]]} and ${DAYS[days[j]]} are back to back`);
    const missing = chosen[ti].filter((o) => o === -1).length;
    const solo = soloBest(options[ti], t.times);
    if (missing) unplaced.push({ team: t.name, missing, reason: unplacedReason(t, ti, options, blocks, used, solo, teams, chosen) });
    perTeam.push({ team: t.name, placed: t.times - missing, times: t.times, miss: teamMiss(options[ti], chosen[ti]), soloMiss: solo.miss, misses });
  });
  const dayOrder = (d) => (d + 6) % 7; // Monday first
  placements.sort((a, b) => dayOrder(a.day) - dayOrder(b.day) || a.start - b.start || a.field.localeCompare(b.field) || a.team.localeCompare(b.team));
  return { placements, unplaced, teams: perTeam, score: total, bound, proved: total === bound, minutes, windows };
}

function unplacedReason(t, ti, options, blocks, used, solo, teams, chosen) {
  const fitDays = new Set(options[ti].map((o) => o.day));
  if (!options[ti].length) {
    const big = blocks.some((b) => b.cap >= t.units);
    if (!big) return `no field window takes ${t.units} units`;
    return `no field window fits its days and hours (${[t.not.length ? `not ${t.not.map((d) => DAYS[d]).join(" ")}` : "", t.games.length ? `games ${t.games.map((d) => DAYS[d]).join(" ")}` : "", t.earliest > 0 ? `after ${clock(t.earliest)}` : "", t.latest < 1440 ? `by ${clock(t.latest)}` : ""].filter(Boolean).join(", ") || "its limits"})`;
  }
  if (solo.unplaced) return `only ${fitDays.size} of its allowed days have a field window that fits, and practices need different days`;
  // Who holds the blocks it could use.
  const holders = new Map();
  for (const o of options[ti]) {
    teams.forEach((u, tj) => { if (tj !== ti) for (const q of chosen[tj]) if (q !== -1 && options[tj][q].b === o.b) holders.set(u.name, (holders.get(u.name) || 0) + 1); });
  }
  const top = [...holders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  return `every slot it can use is full${top.length ? ` (shared with ${top.join(", ")})` : ""}; add a field window, allow another day or later finish, or cut a team to fewer practices`;
}

// ---------------------------------------------------------------- outputs

/** The grid as text, day by day, for the group chat or an email. */
export function practiceText(result, title = "") {
  const out = [];
  if (title) out.push(title, "");
  let lastDay = -1;
  for (const p of result.placements) {
    if (p.day !== lastDay) { if (lastDay !== -1) out.push(""); out.push(DAYS[p.day]); lastDay = p.day; }
    out.push(`  ${clock(p.start)}-${clock(p.end)}  ${p.field}  ${p.team}${p.coach ? ` (coach ${p.coach})` : ""}`);
  }
  if (result.unplaced.length) {
    out.push("", "Not placed:");
    for (const u of result.unplaced) out.push(`  ${u.team}: ${u.missing} practice${u.missing > 1 ? "s" : ""}, ${u.reason}`);
  }
  return out.join("\n");
}

/** One team's week as text. */
export function teamWeekText(result, team) {
  const mine = result.placements.filter((p) => p.team === team);
  return [team, ...mine.map((p) => `  ${DAYS[p.day]} ${clock(p.start)}-${clock(p.end)}, ${p.field}`)].join("\n");
}

/** Every placement as CSV (Day, Start, End, Field, Team, Coach, Units). Cells go through calc.mjs csvCell, which defuses CSV formula injection. */
export function practiceCsv(result) {
  const lines = [["Day", "Start", "End", "Field", "Team", "Coach", "Units"].join(",")];
  for (const p of result.placements) lines.push([DAYS[p.day], clock(p.start), clock(p.end), p.field, p.team, p.coach, p.units].map(csvCell).join(","));
  for (const u of result.unplaced) lines.push(["", "", "", "NOT PLACED", u.team, "", u.missing].map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Field use: for each field window block, units used of its capacity. */
export function fieldUse(result) {
  const use = new Map();
  for (const w of result.windows) for (let s = w.start; s + result.minutes <= w.end; s += result.minutes) use.set(`${w.field}|${w.day}|${s}`, { field: w.field, day: w.day, start: s, cap: w.units, used: 0, teams: [] });
  for (const p of result.placements) { const u = use.get(`${p.field}|${p.day}|${p.start}`); if (u) { u.used += p.units; u.teams.push(p.team); } }
  return [...use.values()];
}

const isoRe = /^\d{4}-\d{2}-\d{2}$/;
const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/**
 * A calendar of weekly practices from `from` to `until` (ISO dates), one repeating event per
 * practice, for one team (or every team when `team` is null). `skip` dates (holidays, closures)
 * become EXDATEs. Times are floating local times.
 */
export function practiceIcs(result, { team = null, from, until, skip = [], stamp = null, title = "Practice" } = {}) {
  if (!isoRe.test(from || "") || !isoRe.test(until || "") || dayNum(until) < dayNum(from)) throw new Error("Give the first and last dates of the practice season.");
  const dtstamp = stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//league-schedule-generator//practice//EN", "CALSCALE:GREGORIAN"];
  const f = dayNum(from), u = dayNum(until);
  const skipSet = new Set(skip.filter((d) => isoRe.test(d)).map(dayNum));
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;
  const compact = (n) => isoOf(n).replace(/-/g, "");
  for (const p of result.placements) {
    if (team !== null && p.team !== team) continue;
    // 1970-01-01 was a Thursday (4).
    let first = f;
    while ((first + 4) % 7 !== p.day) first++;
    if (first > u) continue;
    const ex = [];
    for (let d = first; d <= u; d += 7) if (skipSet.has(d)) ex.push(`${compact(d)}T${hm(p.start)}`);
    lines.push("BEGIN:VEVENT",
      `UID:practice-${[p.team, p.field, p.day, p.start].join("-").replace(/[^\w-]/g, "")}-${compact(first)}@league-schedule-generator`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${compact(first)}T${hm(p.start)}`,
      `DTEND:${compact(first)}T${hm(p.end)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${compact(u)}T235959`);
    if (ex.length) lines.push(`EXDATE:${ex.join(",")}`);
    lines.push(icsFold(`SUMMARY:${icsEscape(`${title}: ${p.team}`)}`), icsFold(`LOCATION:${icsEscape(p.field)}`));
    if (p.coach) lines.push(icsFold(`DESCRIPTION:${icsEscape(`Coach ${p.coach}`)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Inputs for a share link: the typed text and settings, rebuilt the same way on the other side (the search is seeded). */
export function encodeInputs(inputs) {
  const bytes = new TextEncoder().encode(JSON.stringify(inputs));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeInputs(text) {
  try {
    const b64 = String(text).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const v = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!v || typeof v.fields !== "string" || typeof v.teams !== "string") return { error: "This link is damaged or cut short." };
    return { inputs: v };
  } catch {
    return { error: "This link is damaged or cut short." };
  }
}
