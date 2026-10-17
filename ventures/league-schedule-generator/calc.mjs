// League schedule generator: pure functions, no dependencies, nothing leaves the browser.
//
// Pipeline: parse the text fields -> circle-method rounds (home/away built in) ->
// real dates (weekdays, skip dates, team blackouts, makeup rounds) -> court/time slot
// assignment by seeded simulated annealing -> outputs (tables, CSV, .ics, text) and an
// independent validator that re-checks the finished schedule from its output alone.

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MAX_TEAMS = 64;
const MAX_SCAN_DAYS = 2000;

// ---------------------------------------------------------------- dates

/** Days since 1970-01-01 for a real calendar date, or null. */
export function toDay(y, m, d) {
  if (![y, m, d].every(Number.isInteger) || y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / 86400000;
}

export function dayIso(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

export function dayOfWeek(day) {
  return new Date(day * 86400000).getUTCDay();
}

/** "Tue 6 Oct 2026" */
export function dayLabel(day) {
  const d = new Date(day * 86400000);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Accepts YYYY-MM-DD and M/D/YYYY. */
export function parseDate(text) {
  const s = String(text ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return toDay(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

const RANGE_SPLIT = /\s+(?:to|through|thru|until)\s+|\s+[–—-]\s+|\.\./i;

/** "2026-12-24, 2026-12-30 to 2027-01-02" -> { days, errors }. Ranges are capped at 366 days. */
export function parseDateList(text) {
  const days = [];
  const errors = [];
  for (const raw of String(text ?? "").split(/[,;\n]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const parts = token.split(RANGE_SPLIT).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) {
      const d = parseDate(parts[0]);
      if (d === null) errors.push(`"${token}" is not a date. Use YYYY-MM-DD.`);
      else days.push(d);
    } else if (parts.length === 2) {
      const a = parseDate(parts[0]);
      const b = parseDate(parts[1]);
      if (a === null || b === null) errors.push(`"${token}" is not a date range. Use YYYY-MM-DD to YYYY-MM-DD.`);
      else if (b < a) errors.push(`"${token}" ends before it starts.`);
      else if (b - a > 365) errors.push(`"${token}" is longer than a year.`);
      else for (let d = a; d <= b; d++) days.push(d);
    } else errors.push(`"${token}" is not a date or a range.`);
  }
  return { days: [...new Set(days)].sort((x, y) => x - y), errors };
}

export function parseWeekdays(input) {
  const list = Array.isArray(input) ? input : String(input ?? "").split(/[\s,;/]+/);
  const out = new Set();
  const errors = [];
  for (const raw of list) {
    if (typeof raw === "number" && raw >= 0 && raw <= 6 && Number.isInteger(raw)) { out.add(raw); continue; }
    const t = String(raw).trim().toLowerCase();
    if (!t) continue;
    let idx = WEEKDAY_NAMES.findIndex((n) => n === t || (t.length >= 3 && n.startsWith(t)));
    if (idx < 0 && /^[0-6]$/.test(t)) idx = Number(t);
    if (idx < 0) errors.push(`"${raw}" is not a weekday.`);
    else out.add(idx);
  }
  return { weekdays: [...out].sort((a, b) => a - b), errors };
}

/** "6:30pm", "18:00", "7pm" -> "18:30" or null. */
export function parseTime(text) {
  const m = String(text ?? "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- text fields

export function parseTeams(text) {
  const teams = [];
  const errors = [];
  const seen = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const name = line.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) { errors.push(`"${name}" is listed twice.`); continue; }
    seen.set(key, teams.length);
    teams.push(name);
  }
  if (teams.length < 2) errors.push("Enter at least two teams, one per line.");
  if (teams.length > MAX_TEAMS) errors.push(`Up to ${MAX_TEAMS} teams are supported.`);
  return { teams, errors };
}

function teamIndex(teams, name) {
  const key = name.replace(/\s+/g, " ").trim().toLowerCase();
  return teams.findIndex((t) => t.toLowerCase() === key);
}

/** Lines like "Hawks: 2026-11-05, 2026-11-12 to 2026-11-19" or "Hawks cannot play 2026-11-05". */
export function parseBlackouts(text, teams) {
  const blackouts = {};
  const errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*(?::|\bcannot play\b|\bcan't play\b|\bunavailable\b)\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: write the team, a colon, then the dates (Hawks: 2026-11-05).`); continue; }
    const idx = teamIndex(teams, m[1]);
    if (idx < 0) { errors.push(`Line ${i + 1}: "${m[1].trim()}" is not one of the teams.`); continue; }
    const { days, errors: e } = parseDateList(m[2]);
    for (const x of e) errors.push(`Line ${i + 1}: ${x}`);
    blackouts[idx] = [...new Set([...(blackouts[idx] || []), ...days])].sort((a, b) => a - b);
  }
  return { blackouts, errors };
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

export function parseNameList(text) {
  return [...new Set(String(text ?? "").split(/[\n,;]+/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

export function parseTimes(text) {
  const times = [];
  const errors = [];
  for (const raw of parseNameList(text)) {
    const t = parseTime(raw);
    if (t === null) errors.push(`"${raw}" is not a time. Use 18:00 or 6:30pm.`);
    else if (!times.includes(t)) times.push(t);
  }
  return { times, errors };
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
  const seed = Number.isFinite(Number(f.seed)) ? Math.trunc(Number(f.seed)) : 1;
  const minutes = f.minutes === undefined || f.minutes === "" ? 60 : Number(f.minutes);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 600) errors.push("Match length must be between 5 and 600 minutes.");
  return {
    errors,
    spec: {
      teams: t.teams, double: Boolean(f.double), start, weekdays: w.weekdays, skipDays: skip.days,
      blackouts: b.blackouts, timeLimits: tl.limits, courts: parseNameList(f.courts), times: times.times, seed, minutes,
    },
  };
}

// ---------------------------------------------------------------- rounds (circle method)

/**
 * Round-robin rounds by the circle method. Team n-1 (or the phantom bye team when n is odd)
 * stays fixed and the rest rotate. Home/away is built in rather than patched afterwards:
 * the fixed team alternates, and the pair at distance k from the rotating team puts the
 * "ahead" side at home for odd k. That gives every even-n league the minimum n-2 home/away
 * breaks (a break is two consecutive home games or two consecutive away games) and every
 * team a home/away split within one game. A double round robin plays the same rounds again
 * with every venue reversed.
 */
export function roundRobin(n, { double = false } = {}) {
  if (!Number.isInteger(n) || n < 2) throw new Error("A round robin needs at least two teams.");
  const N = n % 2 === 0 ? n : n + 1;
  const first = [];
  for (let r = 0; r < N - 1; r++) {
    const pairs = [r % 2 === 0 ? [r, N - 1] : [N - 1, r]];
    for (let k = 1; k < N / 2; k++) {
      const a = (r + k) % (N - 1);
      const b = (r - k + (N - 1)) % (N - 1);
      pairs.push(k % 2 === 1 ? [a, b] : [b, a]);
    }
    let bye = null;
    const matches = [];
    for (const [h, a] of pairs) {
      if (h >= n) bye = a;
      else if (a >= n) bye = h;
      else matches.push([h, a]);
    }
    first.push({ leg: 0, matches, bye });
  }
  if (!double) return first;
  const second = first.map((r) => ({ leg: 1, matches: r.matches.map(([h, a]) => [a, h]), bye: r.bye }));
  return [...first, ...second];
}

/** Home/away breaks per team over the rounds as given; a bye or an idle round resets the streak. */
export function countBreaks(schedule) {
  const n = schedule.teams.length;
  const last = Array(n).fill(null);
  const breaks = Array(n).fill(0);
  for (const round of schedule.rounds) {
    const today = Array(n).fill(null);
    for (const m of round.matches) { today[m.home] = "H"; today[m.away] = "A"; }
    for (let t = 0; t < n; t++) {
      if (today[t] === null) { last[t] = null; continue; }
      if (last[t] === today[t]) breaks[t]++;
      last[t] = today[t];
    }
  }
  return breaks;
}

// ---------------------------------------------------------------- seeded randomness

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- slot assignment

const LIMIT_PENALTY = 1000;

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
 * Mutates match.slot; returns the final cost (sum over teams of squared usage counts).
 */
export function assignSlots(rounds, nTeams, courtCount, timeCount, seed = 1, banned = null) {
  const cap = courtCount * timeCount;
  const cc = Array.from({ length: nTeams }, () => Array(courtCount).fill(0));
  const tc = Array.from({ length: nTeams }, () => Array(timeCount).fill(0));
  const occ = rounds.map((r) => {
    const o = Array(cap).fill(-1);
    r.matches.forEach((m, i) => { m.slot = i; o[i] = i; });
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
    return c;
  };
  for (const r of rounds) for (const m of r.matches) bump(m, m.slot, 1);
  let cost = 0;
  for (let x = 0; x < nTeams; x++) cost += teamCost(x);
  if (cap <= 1) return cost;

  const movable = rounds.map((r, i) => (r.matches.length ? i : -1)).filter((i) => i >= 0);
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
    let s2 = Math.floor(rand() * (cap - 1));
    if (s2 >= s1) s2++;
    const j = occ[ri][s2];
    const mj = j >= 0 ? r.matches[j] : null;
    const affected = new Set([mi.home, mi.away]);
    if (mj) { affected.add(mj.home); affected.add(mj.away); }
    let before = 0;
    for (const x of affected) before += teamCost(x);
    bump(mi, s1, -1);
    if (mj) bump(mj, s2, -1);
    bump(mi, s2, 1);
    if (mj) bump(mj, s1, 1);
    let after = 0;
    for (const x of affected) after += teamCost(x);
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
  return best;
}

// ---------------------------------------------------------------- building the schedule

function nextPlayDay(from, weekdaySet, skipSet) {
  let d = from;
  for (let guard = 0; guard < MAX_SCAN_DAYS; guard++, d++) {
    if (weekdaySet.has(dayOfWeek(d)) && !skipSet.has(d)) return d;
  }
  return null;
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

  const perRound = Math.floor(n / 2);
  const times = spec.times && spec.times.length ? spec.times : [""];
  let courts = spec.courts && spec.courts.length ? spec.courts : null;
  if (!courts) courts = Array.from({ length: Math.ceil(perRound / times.length) }, (_, i) => `Court ${i + 1}`);
  if (courts.length * times.length < perRound) {
    throw new Error(`${n} teams play ${perRound} matches a round, but ${courts.length} court(s) x ${times.length} time slot(s) only fit ${courts.length * times.length}. Add courts or time slots.`);
  }

  const plan = roundRobin(n, { double: Boolean(spec.double) });
  const remaining = plan.map((r, i) => ({ ...r, order: i }));
  const isBlocked = (t, day) => blackSet[t].has(day);
  const placed = [];
  const pool = [];
  let day = spec.start;
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
    if (!playable.length && best.matches.length) {
      notices.push(`${dayLabel(day)}: no round could be played because of team blackouts, so that date is unused.`);
      day++;
      continue;
    }
    for (const [h, a] of best.matches) if (isBlocked(h, day) || isBlocked(a, day)) pool.push([h, a]);
    placed.push({ day, leg: best.leg, bye: best.bye, matches: playable.map(([h, a]) => ({ home: h, away: a })), makeup: false });
    remaining.splice(remaining.indexOf(best), 1);
    day++;
  }
  // matches displaced by a blackout are packed into makeup rounds after the regular season
  let guard = 0;
  while (pool.length) {
    day = nextPlayDay(day, weekdaySet, skipSet);
    if (day === null || guard++ > MAX_SCAN_DAYS) throw new Error("Could not find dates for the makeup matches. Check the blackouts.");
    const used = new Set();
    const matches = [];
    for (let i = 0; i < pool.length && matches.length < courts.length * times.length; i++) {
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
  let regular = 0;
  let makeupN = 0;
  const rounds = placed.map((p) => {
    const label = p.makeup ? `Makeup ${++makeupN}` : `Round ${++regular}`;
    return { number: p.makeup ? null : regular, label, makeup: p.makeup, day: p.day, bye: p.bye, matches: p.matches };
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
  const cost = assignSlots(rounds, n, courts.length, times.length, spec.seed ?? 1, Object.keys(banned).length ? banned : null);
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
  const schedule = {
    teams,
    config: {
      timeLimits,
      double: Boolean(spec.double), start: spec.start, weekdays: [...weekdaySet].sort(), skipDays: [...skipSet].sort((a, b) => a - b),
      blackouts: Object.fromEntries(blackSet.map((s, i) => [i, [...s].sort((a, b) => a - b)]).filter(([, d]) => d.length)),
      courts, times, seed: spec.seed ?? 1, minutes: spec.minutes ?? 60,
    },
    rounds,
    notices,
    slotCost: cost,
  };
  for (const e of validateSchedule(schedule).errors) if (e.includes("only plays at")) notices.push(e.replace(/^Round \d+: |^Makeup \d+: /, ""));
  schedule.stats = scheduleStats(schedule);
  return schedule;
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
  const breaks = countBreaks(schedule);
  const spread = (rec) => Math.max(0, ...rec.map((o) => { const v = Object.values(o); return v.length ? Math.max(...v) - Math.min(...v) : 0; }));
  return {
    matches, home, away, breaks, totalBreaks: breaks.reduce((a, b) => a + b, 0), byCourt, byTime,
    courtSpread: spread(byCourt), timeSpread: spread(byTime),
    lastDay: schedule.rounds.length ? schedule.rounds[schedule.rounds.length - 1].day : null,
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
    const d = days[i].slice().sort((a, b) => a - b);
    let lo = null, hi = null;
    for (let k = 1; k < d.length; k++) {
      const gap = d[k] - d[k - 1];
      if (lo === null || gap < lo) lo = gap;
      if (hi === null || gap > hi) hi = gap;
      if (gap <= 1) backToBack++;
    }
    if (lo !== null && (shortest === null || lo < shortest)) shortest = lo;
    if (hi !== null && (longest === null || hi > longest)) longest = hi;
    return { team, games: d.length, shortest: lo, longest: hi };
  });
  return { rows, shortest, longest, back_to_back: backToBack };
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
    if (!cfg.weekdays.includes(new Date(round.day * 86400000).getUTCDay())) errors.push(`${round.label}: ${dayIso(round.day)} is not a chosen weekday.`);
    if (cfg.skipDays.includes(round.day)) errors.push(`${round.label}: ${dayIso(round.day)} is a skip date.`);
    const inRound = new Set();
    const cells = new Set();
    for (const m of round.matches) {
      const { home, away } = m;
      if (![home, away].every((t) => Number.isInteger(t) && t >= 0 && t < n) || home === away) { errors.push(`${round.label}: bad match ${home} v ${away}.`); continue; }
      for (const t of [home, away]) {
        if (inRound.has(t)) errors.push(`${round.label}: ${schedule.teams[t]} plays twice.`);
        inRound.add(t);
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
      if (!cfg.times.includes(m.time)) errors.push(`${round.label}: unknown time ${m.time}.`);
      for (const t of [home, away]) {
        const lim = (cfg.timeLimits || {})[t];
        if (lim && !lim.includes(m.time)) errors.push(`${round.label}: ${schedule.teams[t]} only plays at ${lim.join(", ")}, but is at ${m.time}.`);
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
      if (c !== want) errors.push(`${schedule.teams[a]} and ${schedule.teams[b]} meet ${c} time(s), expected ${want}.`);
      if (want === 2 && rec && (rec.hostedByLow !== 1 || rec.hostedByHigh !== 1)) errors.push(`${schedule.teams[a]} and ${schedule.teams[b]} do not each host once.`);
    }
  }
  const tolerance = want === 2 ? 0 : 1;
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
 * (the input is not mutated) plus `moves` and `errors`.
 */
export function applyRainouts(schedule, text) {
  const s = JSON.parse(JSON.stringify(schedule));
  const cfg = s.config;
  const weekdaySet = new Set(cfg.weekdays);
  const skipSet = new Set(cfg.skipDays);
  const moves = [];
  const errors = [];
  const nameIdx = (name) => s.teams.findIndex((t) => t.toLowerCase() === name.toLowerCase());
  const slotOf = (m) => cfg.times.indexOf(m.time) * cfg.courts.length + cfg.courts.indexOf(m.court);
  for (const raw of String(text ?? "").split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
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
      let d = day + 1;
      let placed = null;
      for (let guard = 0; guard < 400 && !placed; guard++, d++) {
        d = nextPlayDay(d, weekdaySet, skipSet);
        if (d === null) break;
        const blocked = (t) => (cfg.blackouts[t] || []).includes(d);
        if (blocked(mt.home) || blocked(mt.away)) continue;
        const target = s.rounds.find((r) => r.day === d);
        if (target && target.matches.some((x) => [x.home, x.away].some((t) => t === mt.home || t === mt.away))) continue;
        const taken = new Set((target ? target.matches : []).map(slotOf));
        const total = cfg.courts.length * cfg.times.length;
        const want = slotOf(mt);
        const timeOk = (k) => [mt.home, mt.away].every((t) => !(cfg.timeLimits || {})[t] || cfg.timeLimits[t].includes(cfg.times[Math.floor(k / cfg.courts.length)]));
        const free = !taken.has(want) && timeOk(want) ? want : Array.from({ length: total }, (_, k) => k).find((k) => !taken.has(k) && timeOk(k));
        if (free === undefined) continue;
        placed = { d, target, free };
      }
      if (!placed) { errors.push(`${mt.homeName} v ${mt.awayName}: no free date found after ${dayIso(day)}.`); round.matches.push(mt); continue; }
      const moved = { ...mt, court: cfg.courts[placed.free % cfg.courts.length], time: cfg.times[Math.floor(placed.free / cfg.courts.length)], moved: true, slot: placed.free };
      if (placed.target) placed.target.matches.push(moved);
      else s.rounds.push({ number: null, label: "Rescheduled", makeup: true, day: placed.d, bye: null, matches: [moved] });
      moves.push({ from: day, to: placed.d, home: mt.homeName, away: mt.awayName, court: moved.court, time: moved.time });
    }
  }
  s.rounds = s.rounds.filter((r) => r.matches.length || (r.bye !== null && r.bye !== undefined)).sort((a, b) => a.day - b.day);
  for (const r of s.rounds) r.matches.sort((a, b) => a.slot - b.slot);
  let mk = 0;
  for (const r of s.rounds) if (r.makeup) r.label = `Makeup ${++mk}`;
  if (moves.length) s.notices = [...s.notices, `${moves.length} match(es) moved after a rainout. Everything else is unchanged.`];
  s.stats = scheduleStats(s);
  return { schedule: s, moves, errors };
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
    const line = raw.trim();
    if (!line) continue;
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
      for (const x of r.matches) if (gone(r, x)) removed.push({ home: x.home, away: x.away, day: r.day });
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

// ---------------------------------------------------------------- views and exports

// ---------------------------------------------------------------- officials (referees, umpires, scorers)

/**
 * Officials, one per line: `Name`, `Name (Hawks)` when they belong to a team (a coach, parent or player; they never
 * officiate that team's match), `Name: Tue, Thu` for the weekdays they can work, `Name (Hawks): Tue` for both, and an
 * optional trailing `max 6` to cap how many matches they take.
 */
export function parseOfficials(text, teams = []) {
  const officials = [];
  const errors = [];
  const seen = new Set();
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    let line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    let max = Infinity;
    const mx = line.match(/[\s,;]+max\s*(\d+)\s*$/i);
    if (mx) { max = Number(mx[1]); line = line.slice(0, mx.index).trim(); }
    const m = line.match(/^([^():]+?)\s*(?:\(([^)]*)\))?\s*(?::\s*(.*))?$/);
    if (!m || !m[1].trim()) { errors.push(`"${raw.trim()}": could not read this official.`); continue; }
    const name = m[1].trim();
    if (seen.has(name.toLowerCase())) { errors.push(`"${name}" is listed twice.`); continue; }
    seen.add(name.toLowerCase());
    let team = -1;
    if (m[2] && m[2].trim()) {
      team = teamIndex(teams, m[2]);
      if (team < 0) errors.push(`${name}: "${m[2].trim()}" is not one of the teams.`);
    }
    let days = null;
    if (m[3] && m[3].trim()) {
      const w = parseWeekdays(m[3]);
      errors.push(...w.errors.map((e) => `${name}: ${e}`));
      if (w.weekdays.length) days = w.weekdays;
    }
    if (!(max >= 1)) { errors.push(`${name}: max must be at least 1.`); max = Infinity; }
    officials.push({ name, team, days, max });
  }
  return { officials, errors };
}

/**
 * Give every match one official. Hard rules: the official can work that weekday, is not from either team in the match,
 * is on at most one match per time slot of a night, and is under their cap. Among those who qualify, the least-loaded
 * official takes the match, ties going to whoever has worked these two teams least, then to list order. Deterministic.
 * Returns a copy of the schedule with `match.official` set, who works how much, and the matches nobody could take.
 */
export function assignOfficials(schedule, officials) {
  const s = JSON.parse(JSON.stringify(schedule));
  const load = officials.map(() => 0);
  const seenTeam = officials.map(() => new Map());
  const unfilled = [];
  const busy = new Set();
  for (const r of s.rounds) {
    const wd = dayOfWeek(r.day);
    for (const m of r.matches) {
      const slot = `${r.day}|${m.time ?? ""}`;
      const why = { weekday: 0, team: 0, busy: 0, cap: 0 };
      const ok = [];
      officials.forEach((o, i) => {
        if (o.days && !o.days.includes(wd)) { why.weekday++; return; }
        if (o.team === m.home || o.team === m.away) { why.team++; return; }
        if (busy.has(`${i}|${slot}`)) { why.busy++; return; }
        if (load[i] >= o.max) { why.cap++; return; }
        ok.push(i);
      });
      if (!ok.length) {
        const reason = !officials.length ? "no officials were listed" : Object.entries({ "off that weekday": why.weekday, "belong to a team in this match": why.team, "already on another match at that time": why.busy, "at their match cap": why.cap }).filter(([, c]) => c).map(([t, c]) => `${c} ${t}`).join(", ");
        m.official = "";
        unfilled.push({ round: r.label, day: r.day, time: m.time, court: m.court, home: m.homeName, away: m.awayName, reason });
        continue;
      }
      const seen = (i) => (seenTeam[i].get(m.home) || 0) + (seenTeam[i].get(m.away) || 0);
      ok.sort((a, b) => load[a] - load[b] || seen(a) - seen(b) || a - b);
      const pick = ok[0];
      load[pick]++;
      busy.add(`${pick}|${slot}`);
      for (const t of [m.home, m.away]) seenTeam[pick].set(t, (seenTeam[pick].get(t) || 0) + 1);
      m.official = officials[pick].name;
    }
  }
  const total = load.reduce((a, b) => a + b, 0);
  return { schedule: s, loads: officials.map((o, i) => ({ name: o.name, matches: load[i] })), unfilled, total };
}

/** Independent re-check of the hard rules for a schedule carrying `match.official`. Empty list = clean. */
export function validateOfficials(schedule, officials) {
  const errors = [];
  const byName = new Map(officials.map((o) => [o.name, o]));
  const count = new Map();
  for (const r of schedule.rounds) {
    const used = new Set();
    for (const m of r.matches) {
      if (!m.official) continue;
      const o = byName.get(m.official);
      const tag = `${r.label}: ${m.homeName} v ${m.awayName}`;
      if (!o) { errors.push(`${tag}: ${m.official} is not a listed official.`); continue; }
      if (o.days && !o.days.includes(dayOfWeek(r.day))) errors.push(`${tag}: ${o.name} is off that weekday.`);
      if (o.team === m.home || o.team === m.away) errors.push(`${tag}: ${o.name} belongs to a team in the match.`);
      const key = `${o.name}|${m.time ?? ""}`;
      if (used.has(key)) errors.push(`${tag}: ${o.name} is on two matches at ${m.time || "the same time"}.`);
      used.add(key);
      count.set(o.name, (count.get(o.name) || 0) + 1);
    }
  }
  for (const o of officials) if ((count.get(o.name) || 0) > o.max) errors.push(`${o.name}: ${count.get(o.name)} matches is over their cap of ${o.max}.`);
  return errors;
}

export function teamSchedule(schedule, teamIdx) {
  const rows = [];
  for (const r of schedule.rounds) {
    const m = r.matches.find((x) => x.home === teamIdx || x.away === teamIdx);
    if (m) {
      const home = m.home === teamIdx;
      rows.push({ round: r.label, day: r.day, time: m.time, court: m.court, opponent: schedule.teams[home ? m.away : m.home], venue: home ? "Home" : "Away", bye: false });
    } else if (r.bye === teamIdx) {
      rows.push({ round: r.label, day: r.day, time: "", court: "", opponent: "", venue: "", bye: true });
    }
  }
  return rows;
}

function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // never let a team name run as a spreadsheet formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function scheduleCsv(schedule) {
  const withOfficial = schedule.rounds.some((r) => r.matches.some((m) => m.official !== undefined));
  const lines = [["Round", "Date", "Day", "Time", "Court", "Home", "Away", ...(withOfficial ? ["Official"] : [])].join(",")];
  for (const r of schedule.rounds) {
    for (const m of r.matches) {
      lines.push([r.label, dayIso(r.day), WEEKDAYS[dayOfWeek(r.day)], m.time, m.court, m.homeName, m.awayName, ...(withOfficial ? [m.official || ""] : [])].map(csvCell).join(","));
    }
    if (r.bye !== null && r.bye !== undefined) lines.push([r.label, dayIso(r.day), WEEKDAYS[dayOfWeek(r.day)], "", "", schedule.teams[r.bye], "BYE"].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.map((l, i) => (i ? " " + l : l)).join("\r\n");
}

const compactDate = (day) => dayIso(day).replace(/-/g, "");

/**
 * An iCalendar file for one team (teamIdx) or every match (teamIdx omitted).
 * Times are floating local times, so a phone shows them as written at the venue.
 * `stamp` (YYYYMMDDTHHMMSSZ) is injectable so the output is reproducible in tests.
 */
export function scheduleIcs(schedule, teamIdx = null, stamp = null) {
  const dtstamp = stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const minutes = schedule.config.minutes || 60;
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//league-schedule-generator//EN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(teamIdx === null ? "League schedule" : `${schedule.teams[teamIdx]} schedule`)}`];
  for (const r of schedule.rounds) {
    r.matches.forEach((m, i) => {
      if (teamIdx !== null && m.home !== teamIdx && m.away !== teamIdx) return;
      const summary = teamIdx === null
        ? `${m.homeName} vs ${m.awayName}`
        : `${schedule.teams[teamIdx]} vs ${schedule.teams[m.home === teamIdx ? m.away : m.home]} (${m.home === teamIdx ? "home" : "away"})`;
      out.push("BEGIN:VEVENT", `UID:${m.home}-${m.away}-${compactDate(r.day)}-${i}@league-schedule-generator`, `DTSTAMP:${dtstamp}`);
      if (m.time) {
        const [hh, mm] = m.time.split(":").map(Number);
        const startMin = hh * 60 + mm;
        const endMin = startMin + minutes;
        const endDay = r.day + Math.floor(endMin / 1440);
        const em = endMin % 1440;
        out.push(`DTSTART:${compactDate(r.day)}T${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`,
          `DTEND:${compactDate(endDay)}T${String(Math.floor(em / 60)).padStart(2, "0")}${String(em % 60).padStart(2, "0")}00`);
      } else {
        out.push(`DTSTART;VALUE=DATE:${compactDate(r.day)}`, `DTEND;VALUE=DATE:${compactDate(r.day + 1)}`);
      }
      out.push(`SUMMARY:${icsEscape(summary)}`, `LOCATION:${icsEscape(m.court)}`, `DESCRIPTION:${icsEscape(r.label)}`, "END:VEVENT");
    });
  }
  out.push("END:VCALENDAR");
  return out.map(icsFold).join("\r\n") + "\r\n";
}

export function scheduleText(schedule, bracket = null) {
  const n = schedule.teams.length;
  const lines = [`${n}-team ${schedule.config.double ? "double" : "single"} round robin`, ""];
  for (const r of schedule.rounds) {
    lines.push(`${r.label} - ${dayLabel(r.day)}`);
    for (const m of r.matches) lines.push(`  ${m.time ? m.time + " " : ""}${m.court}: ${m.homeName} (home) vs ${m.awayName}${m.official ? " [official: " + m.official + "]" : ""}`);
    if (r.bye !== null && r.bye !== undefined) lines.push(`  Bye: ${schedule.teams[r.bye]}`);
    lines.push("");
  }
  if (bracket) lines.push(bracketText(bracket));
  lines.push("Made with the free league schedule generator. Check the dates before you send them round.");
  return lines.join("\n");
}

const htmlEsc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * One self-contained web page for the league: schedule with a pick-your-team filter, standings and
 * play-off bracket when given. No external requests, so an organiser can drop it on any static host
 * (GitHub Pages, Netlify, a school site) or email it. Every typed name is escaped.
 */
export function leaguePageHtml(schedule, { title = "League schedule", table = null, bracket = null } = {}) {
  const teams = schedule.teams;
  const t = htmlEsc(title);
  const rounds = schedule.rounds.map((r) => {
    const rows = r.matches.map((m) => `<tr data-t="${m.home} ${m.away}"><td>${htmlEsc(m.time)}</td><td>${htmlEsc(m.court)}</td><td>${htmlEsc(m.homeName)}</td><td>${htmlEsc(m.awayName)}</td>${m.official !== undefined ? `<td>${htmlEsc(m.official)}</td>` : ""}</tr>`);
    if (r.bye !== null && r.bye !== undefined) rows.push(`<tr data-t="${r.bye}" class="bye"><td colspan="4">Bye: ${htmlEsc(teams[r.bye])}</td></tr>`);
    return `<section class="round"><h3>${htmlEsc(r.label)} <span>${htmlEsc(dayLabel(r.day))}</span></h3><table><thead><tr><th>Time</th><th>Court</th><th>Home</th><th>Away</th>${r.matches.some((m) => m.official !== undefined) ? "<th>Official</th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table></section>`;
  }).join("\n");
  const stand = table ? `<h2>Standings</h2><table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${table.map((r) => `<tr><td>${r.rank}</td><td>${htmlEsc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gd}</td><td>${r.points}</td></tr>`).join("")}</tbody></table>` : "";
  const brk = bracket ? `<h2>Play-offs</h2><pre>${htmlEsc(bracketText(bracket))}</pre>` : "";
  const opts = teams.map((n, i) => `<option value="${i}">${htmlEsc(n)}</option>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;color:#1a1a1a;background:#fff}table{border-collapse:collapse;width:100%;margin-bottom:1rem}th,td{text-align:left;padding:.3rem .5rem;border-bottom:1px solid #ddd}h3 span{font-weight:400;color:#555}select{font:inherit;padding:.3rem}.bye td{color:#555;font-style:italic}pre{background:#f5f5f5;padding:.75rem;overflow:auto}footer{color:#555;font-size:.85rem;margin-top:2rem}@media print{select,label{display:none}}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#333}pre{background:#1c1c1c}h3 span,.bye td,footer{color:#aaa}}</style></head>
<body><h1>${t}</h1>
<p><label>Show only <select id="f"><option value="">Everyone</option>${opts}</select></label></p>
${rounds}
${stand}
${brk}
<footer>Made with the free league schedule generator. Check dates and venues with your organiser.</footer>
<script>(function(){var f=document.getElementById("f");function a(){var v=f.value;document.querySelectorAll("tr[data-t]").forEach(function(r){r.hidden=v!==""&&r.getAttribute("data-t").split(" ").indexOf(v)<0});document.querySelectorAll(".round").forEach(function(s){s.hidden=!s.querySelector("tr[data-t]:not([hidden])")})}f.addEventListener("change",a)})();</script>
</body></html>
`;
}

// ---------------------------------------------------------------- results, standings, play-offs

/** Lines like "Hawks 3 - 2 Owls". Names are matched against the team list. */
export function parseResults(text, teams) {
  const results = [];
  const errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s+(\d+)\s*[-–:]\s*(\d+)\s+(.*)$/);
    if (!m) { errors.push(`Result line ${i + 1}: write it like "Hawks 3 - 2 Owls".`); continue; }
    const a = teamIndex(teams, m[1]);
    const b = teamIndex(teams, m[4]);
    if (a < 0 || b < 0) { errors.push(`Result line ${i + 1}: "${a < 0 ? m[1] : m[4]}" is not one of the teams.`); continue; }
    if (a === b) { errors.push(`Result line ${i + 1}: a team cannot play itself.`); continue; }
    results.push({ a, b, ga: Number(m[2]), gb: Number(m[3]) });
  }
  return { results, errors };
}

/**
 * Points, then goal difference, then goals for, then the order the teams were entered.
 * With `headToHead: true`, teams level on points are first split by a mini-table of only the
 * matches among them (points, goal difference, goals for), then by the overall tiebreaks.
 */
export function standings(teams, results, { win = 3, draw = 1, loss = 0, headToHead = false } = {}) {
  const rows = teams.map((name, i) => ({ index: i, name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }));
  for (const r of results) {
    const A = rows[r.a];
    const B = rows[r.b];
    A.played++; B.played++;
    A.gf += r.ga; A.ga += r.gb; B.gf += r.gb; B.ga += r.ga;
    if (r.ga > r.gb) { A.won++; B.lost++; A.points += win; B.points += loss; }
    else if (r.ga < r.gb) { B.won++; A.lost++; B.points += win; A.points += loss; }
    else { A.drawn++; B.drawn++; A.points += draw; B.points += draw; }
  }
  for (const r of rows) r.gd = r.gf - r.ga;
  if (headToHead) {
    const level = new Map();
    for (const r of rows) level.set(r.points, [...(level.get(r.points) ?? []), r.index]);
    for (const group of level.values()) {
      if (group.length < 2) continue;
      const set = new Set(group);
      const mini = new Map(group.map((i) => [i, { pts: 0, gf: 0, ga: 0 }]));
      for (const r of results) {
        if (!set.has(r.a) || !set.has(r.b)) continue;
        const A = mini.get(r.a);
        const B = mini.get(r.b);
        A.gf += r.ga; A.ga += r.gb; B.gf += r.gb; B.ga += r.ga;
        if (r.ga > r.gb) { A.pts += win; B.pts += loss; }
        else if (r.ga < r.gb) { B.pts += win; A.pts += loss; }
        else { A.pts += draw; B.pts += draw; }
      }
      for (const i of group) { const m = mini.get(i); rows[i].h2h = { points: m.pts, gd: m.gf - m.ga, gf: m.gf }; }
    }
  }
  const h = (r) => r.h2h ?? { points: 0, gd: 0, gf: 0 };
  rows.sort((x, y) => y.points - x.points
    || h(y).points - h(x).points || h(y).gd - h(x).gd || h(y).gf - h(x).gf
    || y.gd - x.gd || y.gf - x.gf || x.index - y.index);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

// ---------------------------------------------------------------- playoff race

/** Most remaining fixtures worked through exhaustively (3^12 = 531,441 outcomes); beyond it, safe bounds. */
export const RACE_EXACT_LIMIT = 12;

/**
 * Who has clinched a play-off place and who is out, from the results so far and the fixtures still
 * to play. `remaining` is a list of [teamIndexA, teamIndexB] (`remainingFixtures` builds it from a
 * schedule and its results). Ranking here is by points only, and a tie on points is counted
 * against the team being tested, so "clinched" and "eliminated" are never wrong; goal difference
 * can only help a team the table calls "alive" or "tied".
 * Returns one row per team: { index, name, points, left, maxPoints, bestRank, worstRank,
 * status: "clinched" | "eliminated" | "alive", magic }. `magic` is how many more points guarantee a
 * place whatever the others do (null when out of reach or already clinched). `exact` says whether
 * every outcome was worked through or the safe bounds were used.
 */
export function playoffRace(teams, results, remaining, spots, { win = 3, draw = 1, loss = 0, exactLimit = RACE_EXACT_LIMIT } = {}) {
  const n = teams.length;
  const k = Math.max(1, Math.min(spots, n));
  const pts = Array(n).fill(0);
  for (const r of results) {
    if (r.ga > r.gb) { pts[r.a] += win; pts[r.b] += loss; }
    else if (r.ga < r.gb) { pts[r.b] += win; pts[r.a] += loss; }
    else { pts[r.a] += draw; pts[r.b] += draw; }
  }
  const left = Array(n).fill(0);
  for (const [a, b] of remaining) { left[a]++; left[b]++; }
  const top = Math.max(win, draw, loss);
  const low = Math.min(win, draw, loss);
  const maxPts = pts.map((p, i) => p + left[i] * top);
  const minPts = pts.map((p, i) => p + left[i] * low);
  const best = Array(n).fill(n);
  const worst = Array(n).fill(1);
  const exact = remaining.length <= exactLimit;
  const rankAll = (p) => {
    for (let i = 0; i < n; i++) {
      let above = 0;
      let level = 0;
      for (let j = 0; j < n; j++) { if (j === i) continue; if (p[j] > p[i]) above++; else if (p[j] === p[i]) level++; }
      if (above + 1 < best[i]) best[i] = above + 1;
      if (above + level + 1 > worst[i]) worst[i] = above + level + 1;
    }
  };
  if (exact) {
    const outcomes = [[win, loss], [draw, draw], [loss, win]];
    const cur = pts.slice();
    const walk = (f) => {
      if (f === remaining.length) { rankAll(cur); return; }
      const [a, b] = remaining[f];
      for (const [x, y] of outcomes) { cur[a] += x; cur[b] += y; walk(f + 1); cur[a] -= x; cur[b] -= y; }
    };
    walk(0);
  } else {
    for (let i = 0; i < n; i++) {
      let level = 0;
      let surelyAbove = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        if (maxPts[j] >= minPts[i]) level++;
        if (minPts[j] > maxPts[i]) surelyAbove++;
      }
      best[i] = surelyAbove + 1;
      worst[i] = level + 1;
    }
  }
  const rows = teams.map((name, i) => {
    const status = worst[i] <= k ? "clinched" : best[i] > k ? "eliminated" : "alive";
    let magic = null;
    if (status === "alive") {
      // the smallest total of extra points that still clinches if every rival wins out
      for (let extra = 1; extra <= left[i] * top; extra++) {
        const mine = pts[i] + extra;
        let rivals = 0;
        for (let j = 0; j < n; j++) if (j !== i && maxPts[j] >= mine) rivals++;
        if (rivals + 1 <= k) { magic = extra; break; }
      }
    }
    return { index: i, name, points: pts[i], left: left[i], maxPoints: maxPts[i], bestRank: best[i], worstRank: worst[i], status, magic };
  });
  rows.sort((x, y) => y.points - x.points || x.index - y.index);
  rows.exact = exact;
  return rows;
}

/** The fixtures in `schedule` that no entry in `results` has used up (each result clears one meeting of that pair). */
export function remainingFixtures(schedule, results) {
  const played = new Map();
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const r of results) played.set(key(r.a, r.b), (played.get(key(r.a, r.b)) ?? 0) + 1);
  const left = [];
  for (const round of schedule.rounds) {
    for (const m of round.matches) {
      const kk = key(m.home, m.away);
      if (played.get(kk) > 0) played.set(kk, played.get(kk) - 1);
      else left.push([m.home, m.away]);
    }
  }
  return left;
}

/** One plain sentence per team that has a decided or live position. */
export function raceText(rows, spots) {
  const lines = [];
  for (const r of rows) {
    if (r.status === "clinched") lines.push(`${r.name}: clinched a top-${spots} place.`);
    else if (r.status === "eliminated") lines.push(`${r.name}: out of the top ${spots} (best case ${r.maxPoints} pts).`);
    else lines.push(`${r.name}: alive${r.magic != null ? `, ${r.magic} more point${r.magic === 1 ? "" : "s"} clinch it` : ""}${r.left ? ` (${r.left} to play)` : ""}.`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- pool play

/**
 * Splits teams (listed best seed first) into `k` pools by snake draft: seeds 1..k go to pools A..,
 * the next k go back the other way, and so on, so no pool collects all the strong seeds. Pool sizes
 * differ by at most one. Returns [{ name: "Pool A", teams: [...] }].
 */
export function splitPools(teams, k) {
  if (!Number.isInteger(k) || k < 1) throw new Error("Pools must be a whole number, 1 or more.");
  if (teams.length < 2 * k) throw new Error(`${k} pools need at least ${2 * k} teams (two each); you have ${teams.length}.`);
  const pools = Array.from({ length: k }, (_, i) => ({ name: `Pool ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`, teams: [] }));
  teams.forEach((t, i) => {
    const row = Math.floor(i / k);
    const col = i % k;
    pools[row % 2 === 0 ? col : k - 1 - col].teams.push(t);
  });
  return pools;
}

/**
 * Pool play: each pool gets its own round robin on the same dates and settings (each pool has its
 * own courts, so pools never compete for a court). `spec.courts` names are reused per pool when given.
 * Returns [{ name, schedule }], every schedule checked by validateSchedule.
 */
export function buildPoolPlay(spec, k) {
  return splitPools(spec.teams, k).map((pool) => {
    const remap = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([i]) => pool.teams.includes(spec.teams[i]))
      .map(([i, v]) => [pool.teams.indexOf(spec.teams[i]), v]));
    const schedule = buildSchedule({ ...spec, teams: pool.teams, blackouts: remap(spec.blackouts), timeLimits: remap(spec.timeLimits) });
    return { name: pool.name, schedule };
  });
}

/**
 * Play-off seeding from pool tables: every pool winner first (best record first), then every
 * runner-up, and so on, taking `perPool` from each pool. Ties across pools break on points, goal
 * difference, goals for, then pool order. `tables` is one standings() result per pool.
 */
export function poolAdvancers(tables, perPool) {
  const out = [];
  for (let place = 0; place < perPool; place++) {
    const tier = tables.map((t, p) => ({ row: t[place], p })).filter((x) => x.row)
      .sort((x, y) => y.row.points - x.row.points || y.row.gd - x.row.gd || y.row.gf - x.row.gf || x.p - y.p);
    out.push(...tier.map((x) => x.row.name));
  }
  return out;
}

const nextPow2 = (k) => { let p = 1; while (p < k) p *= 2; return p; };

/** Standard single-elimination seed order for a bracket of `size` (1 v size, 2 v size-1, ...). */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const len = order.length * 2;
    order = order.flatMap((s) => [s, len + 1 - s]);
  }
  return order;
}

function roundName(matchesInRound) {
  return { 1: "Final", 2: "Semifinals", 4: "Quarterfinals", 8: "Round of 16", 16: "Round of 32" }[matchesInRound] || `Round of ${matchesInRound * 2}`;
}

/**
 * Single-elimination bracket for the seeds given in order (best first). A non-power-of-two
 * field gives the top seeds a first-round bye. Later-round slots name the match they come
 * from. Optional dates continue after `afterDay` on the league's weekdays.
 */
export function playoffBracket(seedNames, { afterDay = null, weekdays = [], skipDays = [] } = {}) {
  const k = seedNames.length;
  if (k < 2) throw new Error("A play-off needs at least two teams.");
  const size = nextPow2(k);
  const order = seedOrder(size);
  const seedTeam = (s) => (s <= k ? { seed: s, name: seedNames[s - 1] } : null);
  const rounds = [];
  let current = [];
  for (let i = 0; i < size; i += 2) {
    const a = seedTeam(order[i]);
    const b = seedTeam(order[i + 1]);
    current.push({ id: `R1M${i / 2 + 1}`, a, b, bye: !a || !b });
  }
  rounds.push({ name: roundName(size / 2), matches: current });
  let level = 2;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const slot = (m) => (m.bye ? m.a || m.b : { from: m.id });
      next.push({ id: `R${level}M${i / 2 + 1}`, a: slot(current[i]), b: slot(current[i + 1]), bye: false });
    }
    rounds.push({ name: roundName(next.length), matches: next });
    current = next;
    level++;
  }
  if (afterDay !== null && weekdays.length) {
    const wd = new Set(weekdays);
    const skip = new Set(skipDays);
    let d = afterDay + 1;
    for (const r of rounds) {
      if (r.matches.every((m) => m.bye)) continue;
      d = nextPlayDay(d, wd, skip);
      if (d === null) break;
      r.day = d;
      d++;
    }
  }
  const games = rounds.reduce((s, r) => s + r.matches.filter((m) => !m.bye).length, 0);
  return { size, teams: k, rounds, games };
}

const NONE = { none: true };

function deMatch(id, a, b) {
  const dead = !!(a.none && b.none);
  return { id, a, b, dead, bye: !dead && !!(a.none || b.none) };
}
const deWinner = (m) => (m.dead ? NONE : m.bye ? (m.a.none ? m.b : m.a) : { from: m.id });
const deLoser = (m) => (m.dead || m.bye ? NONE : { loserOf: m.id });

/**
 * Double-elimination bracket for the seeds given in order (best first): everyone must lose
 * twice to go out. A non-power-of-two field gives the top seeds a first-round bye, and the
 * losers' bracket skips every match a bye leaves without an opponent. Winners rounds come
 * first, then losers rounds, then the grand final and a reset game that is played only if
 * the losers-bracket team wins the grand final. Slots name the match they come from
 * (`from`: its winner, `loserOf`: its loser). Optional dates continue after `afterDay`.
 */
export function doubleEliminationBracket(seedNames, { afterDay = null, weekdays = [], skipDays = [] } = {}) {
  const k = seedNames.length;
  if (k < 3) throw new Error("A double-elimination play-off needs at least three teams.");
  const size = nextPow2(k);
  const order = seedOrder(size);
  const seedSlot = (s) => (s <= k ? { seed: s, name: seedNames[s - 1] } : NONE);
  const rounds = [];
  const wb = [];
  let cur = [];
  for (let i = 0; i < size; i += 2) cur.push(deMatch(`W1M${i / 2 + 1}`, seedSlot(order[i]), seedSlot(order[i + 1])));
  wb.push(cur);
  rounds.push({ name: `Winners ${roundName(cur.length)}`, bracket: "winners", matches: cur });
  for (let r = 2; cur.length > 1; r++) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(deMatch(`W${r}M${i / 2 + 1}`, deWinner(cur[i]), deWinner(cur[i + 1])));
    wb.push(next);
    rounds.push({ name: `Winners ${roundName(next.length)}`, bracket: "winners", matches: next });
    cur = next;
  }
  const p = wb.length;
  let lb = [];
  let lr = 1;
  const pushLb = (matches, label) => {
    rounds.push({ name: `Losers round ${lr}${label ? " (" + label + ")" : ""}`, bracket: "losers", matches });
    lb = matches;
    lr++;
  };
  const first = [];
  for (let i = 0; i < wb[0].length; i += 2) first.push(deMatch(`L${lr}M${i / 2 + 1}`, deLoser(wb[0][i]), deLoser(wb[0][i + 1])));
  pushLb(first, "first losses");
  for (let j = 1; j < p; j++) {
    const drops = wb[j];
    const drop = lb.map((m, i) => deMatch(`L${lr}M${i + 1}`, deWinner(m), deLoser(drops[lb.length - 1 - i])));
    pushLb(drop, "WB drop-downs");
    if (j < p - 1) {
      const cons = [];
      for (let i = 0; i < lb.length; i += 2) cons.push(deMatch(`L${lr}M${i / 2 + 1}`, deWinner(lb[i]), deWinner(lb[i + 1])));
      pushLb(cons);
    }
  }
  const gf = deMatch("GF1", deWinner(wb[p - 1][0]), deWinner(lb[0]));
  rounds.push({ name: "Grand final", bracket: "final", matches: [gf] });
  const reset = deMatch("GF2", { from: "GF1" }, { loserOf: "GF1" });
  rounds.push({ name: "Grand final reset (only if the losers-bracket team wins GF1)", bracket: "final", conditional: true, matches: [reset] });
  if (afterDay !== null && weekdays.length) {
    const wd = new Set(weekdays);
    const skip = new Set(skipDays);
    let d = afterDay + 1;
    for (const r of rounds) {
      if (r.matches.every((m) => m.bye || m.dead)) continue;
      d = nextPlayDay(d, wd, skip);
      if (d === null) break;
      r.day = d;
      d++;
    }
  }
  const games = rounds.filter((r) => !r.conditional).reduce((n, r) => n + r.matches.filter((m) => !m.bye && !m.dead).length, 0);
  return { size, teams: k, type: "double", rounds, games, maxGames: games + 1 };
}

function slotText(s) {
  if (!s || s.none) return "BYE";
  if (s.loserOf) return `loser of ${s.loserOf}`;

  if (!s) return "BYE";
  if (s.from) return `winner of ${s.from}`;
  return `#${s.seed} ${s.name}`;
}

export function bracketText(bracket) {
  const lines = [`Play-offs (${bracket.teams} teams, ${bracket.type === "double" ? "double" : "single"} elimination)`];
  for (const r of bracket.rounds) {
    const real = r.matches.filter((m) => !m.bye && !m.dead);
    if (real.length) lines.push(`${r.name}${r.day ? " - " + dayLabel(r.day) : ""}`);
    for (const m of real) lines.push(`  ${m.id}: ${slotText(m.a)} vs ${slotText(m.b)}`);
    for (const m of r.matches.filter((x) => x.bye)) lines.push(`  Bye: ${slotText(!m.a || m.a.none ? m.b : m.a)}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- share link

const SHARE_KEYS = ["teams", "double", "start", "weekdays", "skip", "blackouts", "timeLimits", "courts", "times", "seed", "minutes", "results", "playoff", "playoffDouble", "rainouts", "withdrawals", "officials"];

/** Page fields -> URL-safe text for the `#` part of a link. The fragment is never sent to a server. */
export function encodeFields(f) {
  const o = {};
  for (const k of SHARE_KEYS) if (f[k] !== undefined && f[k] !== "" && f[k] !== false) o[k] = f[k];
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of encodeFields. Returns null for anything that is not a valid share fragment. */
export function decodeFields(text) {
  try {
    const t = String(text || "").replace(/^#s=?/, "").replace(/^#/, "");
    if (!t || t.length > 20000 || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
    const bin = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const str = (v) => (typeof v === "string" ? v : "");
    const wd = Array.isArray(o.weekdays) ? o.weekdays.filter((d) => WEEKDAYS.includes(d)) : [];
    return {
      teams: str(o.teams), double: o.double === true, start: str(o.start), weekdays: wd,
      skip: str(o.skip), blackouts: str(o.blackouts), timeLimits: str(o.timeLimits), courts: str(o.courts), times: str(o.times),
      seed: Number.isFinite(Number(o.seed)) ? Math.trunc(Number(o.seed)) : 1,
      minutes: Number.isFinite(Number(o.minutes)) ? Number(o.minutes) : 60,
      results: str(o.results), playoff: Number.isFinite(Number(o.playoff)) ? Math.trunc(Number(o.playoff)) : 0,
      rainouts: str(o.rainouts), withdrawals: str(o.withdrawals), officials: str(o.officials),
    };
  } catch { return null; }
}

// ---------------------------------------------------------------- swiss system

/** Rounds that decide a clear winner among n players: ceil(log2 n), at least 1. */
export function swissRounds(n) {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
}

/**
 * Read finished Swiss games. One per line: `Ana 1 - 0 Ben` (equal numbers are a draw) or `Cy bye`.
 * Returns { games: [{a, b, ga, gb}], byes: [index], errors }.
 */
export function parseSwissResults(text, players) {
  const games = [];
  const byes = [];
  const errors = [];
  const rest = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s+bye$/i);
    if (m) {
      const idx = teamIndex(players, m[1]);
      if (idx < 0) errors.push(`Result line ${i + 1}: "${m[1]}" is not one of the players.`);
      else byes.push(idx);
      continue;
    }
    rest.push(line);
  }
  const parsed = parseResults(rest.join("\n"), players);
  games.push(...parsed.results);
  errors.push(...parsed.errors);
  return { games, byes, errors };
}

/** Score table: win 1, draw 0.5, bye counts as a win. Buchholz = sum of opponents' scores. */
export function swissStandings(players, games, byes = [], { win = 1, draw = 0.5 } = {}) {
  const rows = players.map((name, i) => ({ index: i, name, score: 0, played: 0, opponents: [], whites: 0, blacks: 0, last: [] }));
  for (const g of games) {
    const A = rows[g.a];
    const B = rows[g.b];
    A.played++; B.played++;
    A.opponents.push(g.b); B.opponents.push(g.a);
    A.whites++; B.blacks++;
    A.last.push("W"); B.last.push("B");
    if (g.ga > g.gb) A.score += win;
    else if (g.ga < g.gb) B.score += win;
    else { A.score += draw; B.score += draw; }
  }
  for (const i of byes) rows[i].score += win;
  for (const r of rows) r.buchholz = r.opponents.reduce((s, o) => s + rows[o].score, 0);
  const byeSet = new Map();
  for (const i of byes) byeSet.set(i, (byeSet.get(i) ?? 0) + 1);
  for (const r of rows) r.byes = byeSet.get(r.index) ?? 0;
  rows.sort((x, y) => y.score - x.score || y.buchholz - x.buchholz || x.index - y.index);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/**
 * Pair the next Swiss round (Dutch style): players in the same score group meet top half against
 * bottom half, nobody meets twice, the bye goes to the lowest-ranked player without one, and colours
 * alternate. Games are `{a, b}` with a = white. `players` are in seed order (strongest first).
 * Returns { pairs: [{white, black}], bye: index | null, floaters: number }.
 */
export function swissPairings(players, games, byes = []) {
  const n = players.length;
  if (n < 2) throw new Error("Swiss pairing needs at least 2 players.");
  const table = swissStandings(players, games, byes);
  const order = table.map((r) => r.index);
  const info = new Map(table.map((r) => [r.index, r]));
  const met = new Set();
  for (const g of games) { met.add(`${g.a}|${g.b}`); met.add(`${g.b}|${g.a}`); }
  let bye = null;
  let pool = order.slice();
  if (n % 2 === 1) {
    for (let k = order.length - 1; k >= 0; k--) {
      if (info.get(order[k]).byes === 0) { bye = order[k]; break; }
    }
    if (bye === null) bye = order[order.length - 1];
    pool = order.filter((i) => i !== bye);
  }
  const scoreOf = (i) => info.get(i).score;
  let budget = 200000;
  const solve = (left) => {
    if (!left.length) return [];
    if (--budget < 0) return null;
    const p = left[0];
    const rest = left.slice(1);
    const group = rest.filter((q) => scoreOf(q) === scoreOf(p));
    const ideal = Math.floor((group.length + 1) / 2);
    const cands = rest
      .map((q, k) => {
        const g = group.indexOf(q);
        return { q, k, d: Math.abs(scoreOf(p) - scoreOf(q)), r: g < 0 ? 0 : Math.abs(g + 1 - ideal) };
      })
      .filter((c) => !met.has(`${p}|${c.q}`))
      .sort((x, y) => x.d - y.d || x.r - y.r || x.k - y.k);
    for (const c of cands) {
      const tail = solve(rest.filter((q) => q !== c.q));
      if (tail) return [[p, c.q], ...tail];
    }
    return null;
  };
  const matching = solve(pool);
  if (!matching) throw new Error("No pairing without a rematch exists. Stop here: every player has met everyone they can.");
  let floaters = 0;
  const pairs = matching.map(([x, y]) => {
    if (scoreOf(x) !== scoreOf(y)) floaters++;
    const [hi, lo] = order.indexOf(x) < order.indexOf(y) ? [x, y] : [y, x];
    const colourNeed = (i) => {
      const r = info.get(i);
      const run = r.last.slice(-2);
      if (run.length === 2 && run[0] === run[1]) return run[0] === "W" ? -3 : 3;
      return r.blacks - r.whites;
    };
    const needHi = colourNeed(hi);
    const needLo = colourNeed(lo);
    return needHi >= needLo ? { white: hi, black: lo } : { white: lo, black: hi };
  });
  return { pairs, bye, floaters };
}

/** Check a pairing: everyone placed once, no rematches, bye unused. Returns a list of problems. */
export function validateSwiss(players, games, byes, round) {
  const problems = [];
  const seen = new Set();
  for (const { white, black } of round.pairs) {
    for (const i of [white, black]) { if (seen.has(i)) problems.push(`${players[i]} is paired twice.`); seen.add(i); }
    if (games.some((g) => (g.a === white && g.b === black) || (g.a === black && g.b === white))) problems.push(`${players[white]} and ${players[black]} already played.`);
  }
  if (round.bye !== null) { if (seen.has(round.bye)) problems.push(`${players[round.bye]} has a bye and a game.`); seen.add(round.bye); if (byes.includes(round.bye) && byes.length < players.length) problems.push(`${players[round.bye]} already had a bye.`); }
  if (seen.size !== players.length) problems.push("Not every player is paired.");
  return problems;
}

/** Plain-text pairing sheet for pasting into a group chat. */
export function swissText(players, round, roundNumber) {
  const lines = [`Round ${roundNumber}`];
  round.pairs.forEach((p, i) => lines.push(`  Board ${i + 1}: ${players[p.white]} (white) vs ${players[p.black]} (black)`));
  if (round.bye !== null) lines.push(`  Bye: ${players[round.bye]}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- example

export function sampleFields() {
  return {
    teams: "Net Ninjas\nDink Dynasty\nKitchen Kings\nLob Squad\nSpin Doctors\nThird Shot Drops",
    double: false,
    start: "2026-10-06",
    weekdays: ["Tue"],
    skip: "2026-11-24",
    blackouts: "Dink Dynasty: 2026-10-20",
    courts: "Court 1\nCourt 2",
    times: "18:00, 19:00",
    seed: 1,
    minutes: 60,
    results: "",
    playoff: 4,
  };
}
