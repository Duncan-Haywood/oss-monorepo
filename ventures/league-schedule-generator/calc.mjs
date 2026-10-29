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

/**
 * Team names from whatever the organiser pasted: one per line, a single
 * comma/semicolon list, a spreadsheet column (extra tab columns dropped), with
 * list numbering or bullets and surrounding quotes removed. A multi-line list
 * keeps its commas, so "Smith, J. XI" stays one team.
 */
function teamLines(text) {
  let lines = String(text ?? "").split(/\r?\n/).map((l) => l.split("\t")[0].replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length === 1 && /[,;]/.test(lines[0])) lines = lines[0].split(/[,;]/).map((l) => l.trim()).filter(Boolean);
  const marker = /^(\d{1,3}[.)]|[-•*–])\s+/;
  if (lines.length > 1 && lines.every((l) => marker.test(l))) lines = lines.map((l) => l.replace(marker, ""));
  return lines.map((l) => l.replace(/^(["“'])(.+)(["”'])$/, "$2").trim()).filter(Boolean);
}

export function parseTeams(text) {
  const teams = [];
  const errors = [];
  const seen = new Map();
  for (const name of teamLines(text)) {
    const key = name.toLowerCase();
    if (seen.has(key)) { errors.push(`"${name}" is listed twice.`); continue; }
    seen.set(key, teams.length);
    teams.push(name);
  }
  if (teams.length < 2) errors.push("Enter at least two teams, one per line (a comma-separated list also works).");
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

/** Lines like "Cubs: Court 1, Court 2": the only courts that team may be given (matched to the league's court names). */
/**
 * Lines like "Field 2: 2026-11-03, 2026-11-10 to 2026-11-17": dates a court or field is not available
 * (booked by someone else, closed for maintenance). Court names match case-insensitively when `courts`
 * is known. Returns { closures: { courtName: [days] }, errors }.
 */
export function parseCourtClosures(text, courts = null) {
  const closures = {};
  const errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*(?::|\bis closed\b|\bclosed\b|\bunavailable\b)\s*(.+)$/i);
    if (!m || !m[1].trim()) { errors.push(`Line ${i + 1}: write the court, a colon, then the dates it is closed (Field 2: 2026-11-05).`); continue; }
    const name = m[1].trim();
    const hit = courts ? courts.find((x) => x.toLowerCase() === name.toLowerCase()) : name;
    if (!hit) { errors.push(`Line ${i + 1}: "${name}" is not one of the courts.`); continue; }
    const { days, errors: e } = parseDateList(m[2]);
    for (const x of e) errors.push(`Line ${i + 1}: ${x}`);
    if (days.length) closures[hit] = [...new Set([...(closures[hit] || []), ...days])].sort((a, b) => a - b);
  }
  return { closures, errors };
}

/** True when `court` is listed as closed on `day` in a schedule config. */
export function courtClosedOn(cfg, court, day) {
  return ((cfg.courtClosures || {})[court] || []).includes(day);
}

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
  return {
    errors,
    spec: {
      rounds, teams: t.teams, double: Boolean(f.double), start, weekdays: w.weekdays, skipDays: skip.days,
      blackouts: b.blackouts, timeLimits: tl.limits, courtLimits: cl.limits, courtClosures: cc.closures, courts: courtNames, times: times.times, seed, minutes,
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

/**
 * A one-day tournament timetable: the circle-method round robin, each round played to completion
 * before the next starts (the rule the "how long does a round robin take" table uses), a round's
 * matches spread over `courts` courts in waves, and every wave given a clock time. Nothing here
 * can put a team in two matches at once because a round never repeats a team.
 */
export function oneDayTimetable(teams, { courts = 1, start = "09:00", matchMinutes = 30, changeoverMinutes = 0, double = false, minRest = 0 } = {}) {
  const n = teams.length;
  if (n < 3) throw new Error("A one-day round robin needs at least three teams.");
  if (!Number.isInteger(courts) || courts < 1) throw new Error("Courts must be a whole number of at least 1.");
  const t0 = parseTime(start);
  if (!t0) throw new Error("Start time is not a time (try 09:00 or 9am).");
  if (!Number.isFinite(matchMinutes) || matchMinutes < 5 || matchMinutes > 600) throw new Error("Match length must be between 5 and 600 minutes.");
  if (!Number.isFinite(changeoverMinutes) || changeoverMinutes < 0 || changeoverMinutes > 120) throw new Error("Changeover must be between 0 and 120 minutes.");
  const hhmm = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const step = matchMinutes + changeoverMinutes;
  let clock = Number(t0.slice(0, 2)) * 60 + Number(t0.slice(3));
  if (!Number.isInteger(minRest) || minRest < 0 || minRest > 6) throw new Error("Rest slots must be a whole number from 0 to 6.");
  const slots = [];
  if (minRest === 0) {
    roundRobin(n, { double }).forEach((r, ri) => {
      for (let i = 0; i < r.matches.length; i += courts) {
        const matches = r.matches.slice(i, i + courts).map(([h, a], k) => ({ court: k + 1, home: h, away: a }));
        slots.push({ round: ri + 1, time: hhmm(clock), end: hhmm(clock + matchMinutes), bye: i === 0 && r.bye !== null ? r.bye : null, matches });
        clock += step;
      }
    });
  } else {
    // Rest mode: ignore round order and fill each time slot with matches whose teams have sat out
    // at least minRest slots, most-constrained teams (most games still to play) first. Greedy fills
    // are retried with seeded random tie-breaks and the best kept (most rest, then fewest slots). A
    // slot where nobody is rested enough is left empty (a break), so the asked-for rest is always met.
    const all = roundRobin(n, { double }).flatMap((r) => r.matches.map(([h, a]) => [h, a]));
    const restOf = (plan) => {
      const seenAt = Array(n).fill(-1);
      let r = Infinity;
      plan.forEach((ms, si) => ms.forEach(([h, a]) => { for (const t of [h, a]) { if (seenAt[t] >= 0) r = Math.min(r, si - seenAt[t] - 1); seenAt[t] = si; } }));
      return r;
    };
    const fill = (rand) => {
      const pending = all.map((m) => m.slice());
      const last = Array(n).fill(-Infinity);
      const left = Array(n).fill(0);
      for (const [h, a] of pending) { left[h]++; left[a]++; }
      const plan = [];
      while (pending.length) {
        const slot = plan.length;
        const order = pending.map((m, idx) => ({ m, idx, g: Math.min(slot - last[m[0]], slot - last[m[1]]) - 1, w: left[m[0]] + left[m[1]], r: rand ? rand() : idx }))
          .sort((x, y) => (Math.min(y.g, minRest) - Math.min(x.g, minRest)) || (y.w - x.w) || (y.g - x.g) || (x.r - y.r));
        const busy = new Set();
        const chosen = [];
        for (const c of order) {
          if (chosen.length === courts) break;
          if (busy.has(c.m[0]) || busy.has(c.m[1])) continue;
          if (c.g < minRest) continue;
          busy.add(c.m[0]); busy.add(c.m[1]); chosen.push(c);
        }
        for (const c of chosen) { last[c.m[0]] = slot; last[c.m[1]] = slot; left[c.m[0]]--; left[c.m[1]]--; }
        for (const c of [...chosen].sort((x, y) => y.idx - x.idx)) pending.splice(c.idx, 1);
        plan.push(chosen.map((c) => c.m));
      }
      return plan;
    };
    const rng = mulberry32(20261020);
    let best = fill(null);
    let bestRest = restOf(best);
    for (let i = 0; i < 300 && !(bestRest >= minRest && best.length === Math.ceil(all.length / courts)); i++) {
      const plan = fill(rng);
      const r = restOf(plan);
      if (Math.min(r, minRest) > Math.min(bestRest, minRest) || (Math.min(r, minRest) === Math.min(bestRest, minRest) && plan.length < best.length)) { best = plan; bestRest = r; }
    }
    best.forEach((ms, si) => {
      slots.push({ round: si + 1, time: hhmm(clock), end: hhmm(clock + matchMinutes), bye: null, matches: ms.map(([h, a], k) => ({ court: k + 1, home: h, away: a })) });
      clock += step;
    });
  }
  const seen = Array(n).fill(-1);
  let restSlots = Infinity;
  slots.forEach((s, si) => s.matches.forEach((m) => {
    for (const t of [m.home, m.away]) { if (seen[t] >= 0) restSlots = Math.min(restSlots, si - seen[t] - 1); seen[t] = si; }
  }));
  return { teams, courts, slots, finish: slots[slots.length - 1].end, games: slots.reduce((s, x) => s + x.matches.length, 0), restSlots: restSlots === Infinity ? 0 : restSlots, minRest };
}

export function oneDayText(tt) {
  const lines = [];
  for (const s of tt.slots) {
    lines.push(`${s.time}-${s.end}  Round ${s.round}`);
    for (const m of s.matches) lines.push(`  Court ${m.court}: ${tt.teams[m.home]} v ${tt.teams[m.away]}`);
    if (s.bye !== null) lines.push(`  Bye: ${tt.teams[s.bye]}`);
    if (!s.matches.length) lines.push("  Break: no game, so teams can rest");
  }
  lines.push(`Last game ends ${tt.finish} (${tt.games} games, ${tt.slots.length} time slots).`);
  if (tt.minRest > 0) lines.push(tt.restSlots >= tt.minRest ? `Every team rests at least ${tt.restSlots} slot${tt.restSlots === 1 ? "" : "s"} between games.` : `Could not give every team ${tt.minRest} slot${tt.minRest === 1 ? "" : "s"} of rest: the shortest break is ${tt.restSlots}. Add courts or fewer teams per day, or lower the rest.`);
  return lines.join("\n");
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
 * `bannedCourts[team]` does the same for court indexes.
 * `closedByRound[i]` (optional) is a Set of slot indexes round i may not use (a closed court).
 * Mutates match.slot; returns the final cost (sum over teams of squared usage counts).
 */
export function assignSlots(rounds, nTeams, courtCount, timeCount, seed = 1, banned = null, bannedCourts = null, closedByRound = null) {
  const cap = courtCount * timeCount;
  const cc = Array.from({ length: nTeams }, () => Array(courtCount).fill(0));
  const tc = Array.from({ length: nTeams }, () => Array(timeCount).fill(0));
  const allSlots = Array.from({ length: cap }, (_, k) => k);
  const openOf = rounds.map((_, ri) => (closedByRound && closedByRound[ri] && closedByRound[ri].size ? allSlots.filter((k) => !closedByRound[ri].has(k)) : allSlots));
  const occ = rounds.map((r, ri) => {
    const o = Array(cap).fill(-1);
    r.matches.forEach((m, i) => { m.slot = openOf[ri][i]; o[m.slot] = i; });
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

  const closures = {};
  for (const [c, days] of Object.entries(spec.courtClosures || {})) {
    if (courts.includes(c)) closures[c] = days;
    else notices.push(`"${c}" is not one of the league's courts, so its closure dates were ignored.`);
  }
  const closedCourtsOn = (d) => new Set(courts.map((c, i) => ((closures[c] || []).includes(d) ? i : -1)).filter((i) => i >= 0));
  const capacityOn = (d) => (courts.length - closedCourtsOn(d).size) * times.length;

  let plan = roundRobin(n, { double: Boolean(spec.double) });
  // A shorter season: the first k rounds of the circle method. Every team still meets k different
  // opponents (k games, minus a bye in an odd league), and the home/away alternation is unchanged.
  const partial = Number.isInteger(spec.rounds) && spec.rounds >= 1 && spec.rounds < plan.length;
  if (partial) {
    plan = plan.slice(0, spec.rounds);
    notices.push(`Shorter season: ${spec.rounds} of ${roundRobin(n, { double: Boolean(spec.double) }).length} rounds, so each team plays ${n % 2 ? `${spec.rounds - 1}-${spec.rounds}` : spec.rounds} game(s) and not every pair meets.`);
  }
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
    const open = capacityOn(day);
    if (open === 0) playable.length = 0;
    else if (playable.length > open) {
      const over = playable.splice(open);
      pool.push(...over);
      notices.push(`${dayLabel(day)}: only ${open} court slot(s) are open, so ${over.length} match(es) moved to makeup rounds.`);
    }
    if (!playable.length && best.matches.length) {
      notices.push(open === 0 ? `${dayLabel(day)}: every court is closed, so that date is unused.` : `${dayLabel(day)}: no round could be played because of team blackouts, so that date is unused.`);
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
  const courtLim = spec.courtLimits || {};
  const bannedCourts = {};
  for (const [t, allowed] of Object.entries(courtLim)) {
    const ok = allowed.filter((x) => courts.includes(x));
    if (!ok.length) { notices.push(`${teams[t]} is limited to courts that are not among the league's courts, so the limit was ignored.`); continue; }
    bannedCourts[t] = courts.map((x, i) => (ok.includes(x) ? -1 : i)).filter((i) => i >= 0);
  }
  const closedByRound = rounds.map((r) => {
    const set = new Set();
    for (const ci of closedCourtsOn(r.day)) for (let t = 0; t < times.length; t++) set.add(t * courts.length + ci);
    return set;
  });
  const cost = assignSlots(rounds, n, courts.length, times.length, spec.seed ?? 1, Object.keys(banned).length ? banned : null, Object.keys(bannedCourts).length ? bannedCourts : null, Object.keys(closures).length ? closedByRound : null);
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
      double: Boolean(spec.double), partial, start: spec.start, weekdays: [...weekdaySet].sort(), skipDays: [...skipSet].sort((a, b) => a - b),
      blackouts: Object.fromEntries(blackSet.map((s, i) => [i, [...s].sort((a, b) => a - b)]).filter(([, d]) => d.length)),
      courts, times, seed: spec.seed ?? 1, minutes: spec.minutes ?? 60,
    },
    rounds,
    notices,
    slotCost: cost,
  };
  for (const e of validateSchedule(schedule).errors) if (e.includes("only plays at") || e.includes("only plays on")) notices.push(e.replace(/^Round \d+: |^Makeup \d+: /, ""));
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
      const moved = { ...mt, court: cfg.courts[placed.free % cfg.courts.length], time: cfg.times[Math.floor(placed.free / cfg.courts.length)], moved: true, slot: placed.free };
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
      const mv = { ...mt, court: cfg.courts[placed.free % cfg.courts.length], time: cfg.times[Math.floor(placed.free / cfg.courts.length)], slot: placed.free, moved: true };
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

/** The standings table as a CSV (rank, team, played, won, drawn, lost, goals for/against, goal difference, points). */
export function standingsCsv(table) {
  const lines = [["Rank", "Team", "Played", "Won", "Drawn", "Lost", "For", "Against", "GD", "Points"].join(",")];
  for (const r of table) lines.push([r.rank, r.name, r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.gd, r.points].map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function icsFold(line) {
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
 * `official` (a name set by assignOfficials) keeps only the matches that person works, for a referee's own calendar.
 */
export function scheduleIcs(schedule, teamIdx = null, stamp = null, official = null) {
  const dtstamp = stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const minutes = schedule.config.minutes || 60;
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//league-schedule-generator//EN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(official !== null ? `${official} officiating` : teamIdx === null ? "League schedule" : `${schedule.teams[teamIdx]} schedule`)}`];
  for (const r of schedule.rounds) {
    r.matches.forEach((m, i) => {
      if (teamIdx !== null && m.home !== teamIdx && m.away !== teamIdx) return;
      if (official !== null && m.official !== official) return;
      const summary = official !== null ? `Officiate: ${m.homeName} vs ${m.awayName}` : teamIdx === null
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

/**
 * One ready-to-paste message per team ("Hi Hawks, your fixtures: ..."), so a coordinator can
 * message each team its own dates instead of forwarding the whole league. Uses teamSchedule.
 */
export function teamMessages(schedule) {
  return schedule.teams.map((name, idx) => {
    const rows = teamSchedule(schedule, idx);
    const lines = [`Hi ${name}, your fixtures:`];
    for (const r of rows) {
      if (r.bye) lines.push(`${r.round} - ${dayLabel(r.day)}: bye (no game)`);
      else lines.push(`${r.round} - ${dayLabel(r.day)}${r.time ? " " + r.time : ""}${r.court ? ", " + r.court : ""}: ${r.venue} vs ${r.opponent}`);
    }
    lines.push("Check the dates before you plan around them.");
    return { team: name, text: lines.join("\n") };
  });
}

/**
 * One ready-to-paste note per official (set by assignOfficials): the matches they work, with date, time, court and the
 * two teams, in schedule order. Officials with no match are left out. Returns [{ official, matches, text }].
 */
export function officialMessages(schedule) {
  const by = new Map();
  for (const r of schedule.rounds) {
    for (const m of r.matches) {
      if (!m.official) continue;
      if (!by.has(m.official)) by.set(m.official, []);
      by.get(m.official).push(`${r.label} - ${dayLabel(r.day)}${m.time ? " " + m.time : ""}${m.court ? ", " + m.court : ""}: ${m.homeName} vs ${m.awayName}`);
    }
  }
  return [...by].map(([official, lines]) => ({
    official,
    matches: lines.length,
    text: [`Hi ${official}, the matches you are officiating (${lines.length}):`, ...lines, "Check the dates before you plan around them."].join("\n"),
  }));
}

// Teams down the side, dates across the top: one cell per team per round, "v Opp" at
// home, "@ Opp" away, "BYE" for a bye, blank when the team has no game that round.
export function seasonGrid(schedule) {
  const header = ["Team", ...schedule.rounds.map((r) => `${r.label} ${dayIso(r.day)}`)];
  const rows = schedule.teams.map((name, i) => {
    const cells = schedule.rounds.map((r) => {
      const m = r.matches.find((x) => x.home === i || x.away === i);
      if (m) return m.home === i ? `v ${m.awayName}` : `@ ${m.homeName}`;
      return r.bye === i ? "BYE" : "";
    });
    return [name, ...cells];
  });
  return { header, rows };
}

export function seasonGridCsv(schedule) {
  const { header, rows } = seasonGrid(schedule);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
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

/**
 * Printable game-night score sheets: one page per round with every match, blank score boxes, a
 * forfeit tick and a signature line, so the person at the table can write results down and the
 * organiser can type them in afterwards (lines like "Hawks 3 - 2 Owls"). Self-contained, every
 * typed name escaped, no external requests.
 */
export function scoreSheetsHtml(schedule, { title = "League score sheets" } = {}) {
  const t = htmlEsc(title);
  const pages = schedule.rounds.map((r) => {
    const rows = r.matches.map((m) => `<tr><td>${htmlEsc(m.time)}</td><td>${htmlEsc(m.court)}</td><td class="n">${htmlEsc(m.homeName)}</td><td class="b"></td><td class="b"></td><td class="n">${htmlEsc(m.awayName)}</td><td class="f">&#9744;</td><td>${htmlEsc(m.official ?? "")}</td></tr>`);
    const bye = r.bye !== null && r.bye !== undefined ? `<p class="bye">Bye: ${htmlEsc(schedule.teams[r.bye])}</p>` : "";
    return `<section class="sheet"><h2>${htmlEsc(r.label)} <span>${htmlEsc(dayLabel(r.day))}</span></h2><table><thead><tr><th>Time</th><th>Court</th><th>Home</th><th colspan="2">Score</th><th>Away</th><th>Forfeit</th><th>Official</th></tr></thead><tbody>${rows.join("")}</tbody></table>${bye}<p class="sig">Scorekeeper: ____________________ &nbsp; Notes (injuries, protests, rainouts): ______________________________________</p></section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:56rem;padding:1rem;color:#1a1a1a;background:#fff}h2 span{font-weight:400;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:.5rem;text-align:left}td.b{width:3.5rem;height:2.4rem}td.n{font-weight:600}td.f{text-align:center;font-size:1.3rem}.sheet{page-break-after:always;margin-bottom:2rem}.sig{margin-top:1.5rem}.bye{color:#555;font-style:italic}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#666}h2 span,.bye{color:#aaa}}@media print{body{background:#fff;color:#000}}</style></head>
<body><h1>${t}</h1>
${pages}
</body></html>
`;
}

// ---------------------------------------------------------------- results, standings, play-offs

/**
 * Lines like "Hawks 3 - 2 Owls". Names are matched against the team list.
 * A forfeit is written "Hawks w/o Owls" (also "wo" or "walkover"): Hawks are awarded the win and
 * the score `walkover` (default 3-0, so goal difference reflects it); the result carries `walkover: true`.
 * A points adjustment is "Hawks -3 pts" (also "+1", "-2 points", an optional "(reason)" after it): the
 * signed number is added to that team's table points and returned in `adjustments` as { teamIndex: delta }.
 */
export function parseResults(text, teams, { walkover = [3, 0] } = {}) {
  const results = [];
  const errors = [];
  const adjustments = {};
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const adj = line.match(/^(.*?)\s+([+-]\d+)\s*(?:pts?|points?)?\s*(?:\(.*\))?$/i);
    if (adj) {
      const t = teamIndex(teams, adj[1]);
      if (t < 0) { errors.push(`Result line ${i + 1}: "${adj[1]}" is not one of the teams.`); continue; }
      adjustments[t] = (adjustments[t] ?? 0) + Number(adj[2]);
      continue;
    }
    const w = line.match(/^(.*?)\s+(?:w\/o|wo|walkover)\s+(.*)$/i);
    if (w) {
      const a = teamIndex(teams, w[1]);
      const b = teamIndex(teams, w[2]);
      if (a < 0 || b < 0) { errors.push(`Result line ${i + 1}: "${a < 0 ? w[1] : w[2]}" is not one of the teams.`); continue; }
      if (a === b) { errors.push(`Result line ${i + 1}: a team cannot play itself.`); continue; }
      results.push({ a, b, ga: walkover[0], gb: walkover[1], walkover: true });
      continue;
    }
    const m = line.match(/^(.*?)\s+(\d+)\s*[-–:]\s*(\d+)\s+(.*)$/);
    if (!m) { errors.push(`Result line ${i + 1}: write it like "Hawks 3 - 2 Owls" (or "Hawks w/o Owls" for a forfeit win).`); continue; }
    const a = teamIndex(teams, m[1]);
    const b = teamIndex(teams, m[4]);
    if (a < 0 || b < 0) { errors.push(`Result line ${i + 1}: "${a < 0 ? m[1] : m[4]}" is not one of the teams.`); continue; }
    if (a === b) { errors.push(`Result line ${i + 1}: a team cannot play itself.`); continue; }
    results.push({ a, b, ga: Number(m[2]), gb: Number(m[3]) });
  }
  return { results, errors, adjustments };
}

/**
 * League points per win, draw and loss, written "3-1-0" (also "2/1/0" or "3 1 0"). Blank means 3-1-0.
 * Returns { win, draw, loss, error }; a bad entry gives the default plus an `error` to show. A win must
 * be worth more than a draw and a draw more than a loss, or the table would reward losing.
 */
export function parsePointSystem(text) {
  const def = { win: 3, draw: 1, loss: 0, error: null };
  const t = String(text ?? "").trim();
  if (!t) return def;
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[-\/,\s]\s*(-?\d+(?:\.\d+)?)\s*[-\/,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return { ...def, error: `Points system "${t}": write wins, draws and losses like "3-1-0" or "2-1-0". Using 3-1-0.` };
  const [win, draw, loss] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!(win > draw && draw > loss)) return { ...def, error: `Points system "${t}": a win must be worth more than a draw, and a draw more than a loss. Using 3-1-0.` };
  return { win, draw, loss, error: null };
}

/**
 * Points, then goal difference, then goals for, then the order the teams were entered.
 * With `headToHead: true`, teams level on points are first split by a mini-table of only the
 * matches among them (points, goal difference, goals for), then by the overall tiebreaks.
 * `adjustments` ({ teamIndex: points }, from `parseResults`) adds or deducts table points, e.g. a
 * league penalty; the row shows it as `adj` and it counts before every tiebreak.
 */
/** A team's last `n` results in the order they were typed, oldest first, as "WDLWW" (W win, D draw, L loss). */
export function formString(teamIdx, results, n = 5) {
  const out = [];
  for (const r of results) {
    if (r.a !== teamIdx && r.b !== teamIdx) continue;
    const mine = r.a === teamIdx ? r.ga - r.gb : r.gb - r.ga;
    out.push(mine > 0 ? "W" : mine < 0 ? "L" : "D");
  }
  return out.slice(-n).join("");
}

/** A team's current run from the form string, e.g. "WDLWW" is "W2", "" (no games) is "". */
export function streakOf(form) {
  if (!form) return "";
  const last = form[form.length - 1];
  let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === last; i--) n++;
  return last + n;
}

/**
 * Season highlights from typed results: the biggest win, the highest-scoring match, the best attack and the
 * best defence (goals per game, teams with at least one game). Walkovers are left out of the match records
 * because their score is a rule, not a game. Returns null when no game has been played.
 */
export function seasonRecords(teams, results) {
  const games = results.filter((r) => !r.walkover);
  if (!games.length) return null;
  const biggest = games.reduce((m, r) => (Math.abs(r.ga - r.gb) > Math.abs(m.ga - m.gb) ? r : m));
  const highest = games.reduce((m, r) => (r.ga + r.gb > m.ga + m.gb ? r : m));
  const tally = teams.map(() => ({ gf: 0, ga: 0, n: 0 }));
  for (const r of results) {
    tally[r.a].gf += r.ga; tally[r.a].ga += r.gb; tally[r.a].n++;
    tally[r.b].gf += r.gb; tally[r.b].ga += r.ga; tally[r.b].n++;
  }
  const pick = (key, dir) => {
    let best = -1;
    tally.forEach((t, i) => {
      if (!t.n) return;
      if (best < 0 || dir * (t[key] / t.n - tally[best][key] / tally[best].n) < 0) best = i;
    });
    return best < 0 ? null : { team: teams[best], perGame: tally[best][key] / tally[best].n };
  };
  const line = (r) => `${teams[r.a]} ${r.ga}-${r.gb} ${teams[r.b]}`;
  return {
    biggestWin: biggest.ga === biggest.gb ? null : line(biggest),
    highestScoring: line(highest),
    bestAttack: pick("gf", -1),
    bestDefence: pick("ga", 1),
  };
}

/**
 * Results grid in table order: one row per team, one column per opponent, each cell the score from the row
 * team's side ("3-2"), several meetings joined with ", ", "" where the pair has not met and "·" on the diagonal.
 * `order` is a list of team indexes (default: entry order), e.g. the standings order.
 */
export function crossTable(teams, results, order = teams.map((_, i) => i)) {
  const cell = new Map();
  for (const r of results) {
    for (const [x, y, gx, gy] of [[r.a, r.b, r.ga, r.gb], [r.b, r.a, r.gb, r.ga]]) {
      const k = `${x}:${y}`;
      cell.set(k, [...(cell.get(k) ?? []), `${gx}-${gy}`]);
    }
  }
  return {
    heads: order.map((i) => teams[i]),
    rows: order.map((i) => ({ name: teams[i], cells: order.map((j) => (i === j ? "·" : (cell.get(`${i}:${j}`) ?? []).join(", "))) })),
  };
}

export function standings(teams, results, { win = 3, draw = 1, loss = 0, headToHead = false, adjustments = {} } = {}) {
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
  for (const r of rows) { r.form = formString(r.index, results, 5); r.streak = streakOf(formString(r.index, results, Infinity)); r.gd = r.gf - r.ga; r.adj = adjustments[r.index] ?? 0; r.points += r.adj; }
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
export function playoffRace(teams, results, remaining, spots, { win = 3, draw = 1, loss = 0, exactLimit = RACE_EXACT_LIMIT, adjustments = {} } = {}) {
  const n = teams.length;
  const k = Math.max(1, Math.min(spots, n));
  const pts = Array.from({ length: n }, (_, i) => adjustments[i] ?? 0);
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

/**
 * The weekly group-chat post: last round's scores, the table, and the next round's fixtures, as plain text.
 * Typed results are matched to the schedule pair by pair in round order (the way `remainingFixtures` does),
 * so a round counts as played once every one of its matches has a result. The "next round" is the first
 * round with a match still unplayed. Returns "" when there is nothing to post (no rounds).
 */
export function weeklyUpdate(schedule, results, { adjustments = {}, points = {}, headToHead = false, maxRows = 8 } = {}) {
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const pool = new Map();
  for (const r of results) { const k = key(r.a, r.b); pool.set(k, [...(pool.get(k) ?? []), r]); }
  const rounds = schedule.rounds.map((round) => ({
    round,
    matches: round.matches.map((m) => {
      const found = pool.get(key(m.home, m.away))?.shift();
      return { m, score: found ? (found.a === m.home ? [found.ga, found.gb] : [found.gb, found.ga]) : null, walkover: !!found?.walkover };
    }),
  }));
  const next = rounds.findIndex((r) => r.matches.some((x) => !x.score));
  const lastDone = (next < 0 ? rounds.length : next) - 1;
  if (!rounds.length) return "";
  const out = [];
  if (lastDone >= 0) {
    const r = rounds[lastDone];
    out.push(`${r.round.label} results (${dayLabel(r.round.day)})`);
    for (const x of r.matches) out.push(`  ${x.m.homeName} ${x.score[0]} - ${x.score[1]} ${x.m.awayName}${x.walkover ? " (walkover)" : ""}`);
    if (r.round.bye !== null && r.round.bye !== undefined) out.push(`  Bye: ${schedule.teams[r.round.bye]}`);
    out.push("");
  }
  if (results.length) {
    const rows = standings(schedule.teams, results, { ...points, headToHead, adjustments });
    out.push("Table");
    for (const r of rows.slice(0, maxRows)) out.push(`  ${r.rank}. ${r.name} - ${r.points} pts (${r.played} played, GD ${r.gd >= 0 ? "+" : ""}${r.gd})`);
    if (rows.length > maxRows) out.push(`  ...and ${rows.length - maxRows} more`);
    out.push("");
  }
  if (next >= 0) {
    const r = rounds[next];
    out.push(`Next up: ${r.round.label} - ${dayLabel(r.round.day)}`);
    for (const x of r.matches.filter((y) => !y.score)) out.push(`  ${x.m.time ? x.m.time + " " : ""}${x.m.court}: ${x.m.homeName} (home) vs ${x.m.awayName}`);
    if (r.round.bye !== null && r.round.bye !== undefined) out.push(`  Bye: ${schedule.teams[r.round.bye]}`);
  } else {
    out.push("That was the last round of the schedule.");
  }
  return out.join("\n").trim();
}

/**
 * Heads-ups about typed results that the schedule cannot account for: a pair entered more times than
 * they meet (a duplicated line, which counts twice in the table), or a pair that is not scheduled to
 * meet at all (a typo'd name, or a result from another pool). Returns an array of messages.
 */
export function resultsCheck(schedule, results) {
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const meets = new Map();
  for (const round of schedule.rounds) for (const m of round.matches) meets.set(key(m.home, m.away), (meets.get(key(m.home, m.away)) ?? 0) + 1);
  const seen = new Map();
  for (const r of results) seen.set(key(r.a, r.b), (seen.get(key(r.a, r.b)) ?? 0) + 1);
  const out = [];
  for (const [k, n] of seen) {
    const [a, b] = k.split("-").map(Number);
    const names = `${schedule.teams[a]} and ${schedule.teams[b]}`;
    const m = meets.get(k) ?? 0;
    if (m === 0) out.push(`${names} are not scheduled to meet, but a result is typed for them; it still counts in the table.`);
    else if (n > m) out.push(`${names} meet ${m === 1 ? "once" : m + " times"} in the schedule but ${n} results are typed; check for a duplicated line (every line counts in the table).`);
  }
  return out;
}

/**
 * Matches dated before `today` (days since 1970, as `toDay` gives) with no typed result: the games an
 * organiser still has to chase. A pair's typed results are matched to its meetings earliest first, so a
 * double round robin with one result typed reports only the second meeting. Returns
 * `[{ home, away, day }]` in date order; `schedule.teams` names them.
 */
export function overdueResults(schedule, results, today) {
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const typed = new Map();
  for (const r of results) typed.set(key(r.a, r.b), (typed.get(key(r.a, r.b)) ?? 0) + 1);
  const all = [];
  for (const round of schedule.rounds) for (const m of round.matches) all.push({ home: m.home, away: m.away, day: round.day });
  all.sort((x, y) => x.day - y.day);
  const out = [];
  for (const m of all) {
    const k = key(m.home, m.away);
    if (typed.get(k) > 0) typed.set(k, typed.get(k) - 1);
    else if (m.day < today) out.push(m);
  }
  return out;
}

/** Games each team still has to play, from `remainingFixtures`: an array indexed by team. */
export function gamesLeft(nTeams, remaining) {
  const left = new Array(nTeams).fill(0);
  for (const [a, b] of remaining) { left[a]++; left[b]++; }
  return left;
}

/**
 * Strength of the games still to play: for each team, the average points per game (from `rows`, the
 * `standings` table) of the opponents it has yet to meet, one entry per remaining fixture. Returns an
 * array indexed by team of `{ avg, games }`; `avg` is null when the team has no games left or nobody
 * has played yet. A guide to who has the easier run-in, not a forecast.
 */
export function scheduleStrength(rows, remaining) {
  const ppg = new Map(rows.map((r) => [r.index, r.played ? r.points / r.played : null]));
  const out = Array.from({ length: rows.length }, () => ({ sum: 0, n: 0, games: 0 }));
  const take = (i, j) => { out[i].games++; const v = ppg.get(j); if (v != null) { out[i].sum += v; out[i].n++; } };
  for (const [a, b] of remaining) { take(a, b); take(b, a); }
  return out.map((o) => ({ avg: o.n ? o.sum / o.n : null, games: o.games }));
}

/** One plain sentence per team that has a decided or live position. */
/**
 * Chance of finishing in the top `spots`, by playing the remaining fixtures out many times. Each
 * team's strength is its smoothed share of the available results so far (a win counts 1, a draw
 * half, plus one imaginary draw-less game each way so nobody is 0 or 1), a game's win chances come
 * from the log5 rule on the two strengths, and the draw chance is the league's own draw rate so
 * far (smoothed toward one in five). Ranked on points; a tie at the cut is split by a coin flip, so
 * the figure is an estimate and not a promise. Seeded, so the same table gives the same numbers.
 * Returns [{ index, name, points, chance, expected }] where `chance` is 0..1. With no games
 * left the chances are exactly 1 or 0 and a team the race table calls clinched is always 1; one it calls out can
 * still show a small chance, because the race table counts a tie at the cut against the team and
 * here it is a coin flip.
 */
export function playoffOdds(teams, results, remaining, spots, { win = 3, draw = 1, loss = 0, adjustments = {}, runs = 4000, seed = 1 } = {}) {
  const n = teams.length;
  const k = Math.max(1, Math.min(spots, n));
  const base = Array.from({ length: n }, (_, i) => adjustments[i] ?? 0);
  const score = Array(n).fill(1);
  const played = Array(n).fill(2);
  let draws = 0;
  for (const r of results) {
    if (r.ga > r.gb) { base[r.a] += win; base[r.b] += loss; score[r.a] += 1; }
    else if (r.ga < r.gb) { base[r.b] += win; base[r.a] += loss; score[r.b] += 1; }
    else { base[r.a] += draw; base[r.b] += draw; score[r.a] += 0.5; score[r.b] += 0.5; draws++; }
    played[r.a]++; played[r.b]++;
  }
  const strength = score.map((x, i) => x / played[i]);
  const pDraw = (draws + 1) / (results.length + 5);
  const odds = remaining.map(([a, b]) => {
    const sa = strength[a];
    const sb = strength[b];
    const pa = (sa * (1 - sb)) / (sa * (1 - sb) + sb * (1 - sa));
    return { a, b, winA: (1 - pDraw) * pa, drawEnd: (1 - pDraw) * pa + pDraw };
  });
  const rand = mulberry32(seed);
  const hits = Array(n).fill(0);
  const total = Array(n).fill(0);
  const pts = Array(n);
  const order = Array.from({ length: n }, (_, i) => i);
  const tie = Array(n);
  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < n; i++) pts[i] = base[i];
    for (const m of odds) {
      const u = rand();
      if (u < m.winA) { pts[m.a] += win; pts[m.b] += loss; }
      else if (u < m.drawEnd) { pts[m.a] += draw; pts[m.b] += draw; }
      else { pts[m.b] += win; pts[m.a] += loss; }
    }
    for (let i = 0; i < n; i++) { tie[i] = rand(); total[i] += pts[i]; }
    order.sort((x, y) => pts[y] - pts[x] || tie[y] - tie[x]);
    for (let r = 0; r < k; r++) hits[order[r]]++;
  }
  return teams.map((name, i) => ({ index: i, name, points: base[i], chance: hits[i] / runs, expected: total[i] / runs }));
}

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
 * differ by at most one. Returns [{ name: "Pool A", teams: [...] }]. Optional `clubs` (arrays of team
 * names) are spread across pools where possible by swapping teams of the same snake row, so the seed
 * spread and pool sizes are kept.
 */
export function splitPools(teams, k, clubs = []) {
  if (!Number.isInteger(k) || k < 1) throw new Error("Pools must be a whole number, 1 or more.");
  if (teams.length < 2 * k) throw new Error(`${k} pools need at least ${2 * k} teams (two each); you have ${teams.length}.`);
  const pools = Array.from({ length: k }, (_, i) => ({ name: `Pool ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`, teams: [] }));
  teams.forEach((t, i) => {
    const row = Math.floor(i / k);
    const col = i % k;
    pools[row % 2 === 0 ? col : k - 1 - col].teams.push(t);
  });
  if (k > 1 && clubs.length) separateClubs(pools, clubs);
  return pools;
}

/**
 * Clubs are lists of team names that belong together (a club with several age-group teams, or teams
 * sharing a ground). Number of same-club pairs that sit in one pool; 0 means every club is spread out.
 */
export function clubPairsInPools(pools, clubs) {
  let n = 0;
  for (const p of pools) for (const c of clubs) { const m = c.filter((t) => p.teams.includes(t)).length; n += m * (m - 1) / 2; }
  return n;
}

// Swap teams of the same snake row between pools (so sizes and the seed spread stay as drawn) while a
// swap lowers the number of same-club pairs sharing a pool. Greedy and deterministic.
function separateClubs(pools, clubs) {
  const k = pools.length;
  let best = clubPairsInPools(pools, clubs);
  for (let guard = 0; best > 0 && guard < 200; guard++) {
    let move = null;
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      for (let i = 0; i < Math.min(pools[a].teams.length, pools[b].teams.length); i++) { const j = i; // the i-th team of any pool came from snake row i
        const x = pools[a].teams[i], y = pools[b].teams[j];
        pools[a].teams[i] = y; pools[b].teams[j] = x;
        const score = clubPairsInPools(pools, clubs);
        pools[a].teams[i] = x; pools[b].teams[j] = y;
        if (score < best && (!move || score < move.score)) move = { a, b, i, j, score };
      }
    }
    if (!move) break;
    const { a, b, i, j, score } = move;
    [pools[a].teams[i], pools[b].teams[j]] = [pools[b].teams[j], pools[a].teams[i]];
    best = score;
  }
}
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
export function playoffBracket(seedNames, { afterDay = null, weekdays = [], skipDays = [], thirdPlace = false } = {}) {
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
  if (thirdPlace && k >= 4) {
    const semis = rounds[rounds.length - 2].matches;
    rounds[rounds.length - 1].matches.push({ id: "3P", a: { loserOf: semis[0].id }, b: { loserOf: semis[1].id }, bye: false });
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

const SHARE_KEYS = ["teams", "double", "start", "weekdays", "skip", "blackouts", "timeLimits", "courtLimits", "courtClosures", "courts", "times", "seed", "minutes", "rounds", "results", "playoff", "playoffDouble", "playoffThird", "pins", "rainouts", "withdrawals", "officials", "grounds", "linked", "scoring"];

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
      skip: str(o.skip), blackouts: str(o.blackouts), timeLimits: str(o.timeLimits), courtLimits: str(o.courtLimits), courtClosures: str(o.courtClosures), courts: str(o.courts), times: str(o.times),
      seed: Number.isFinite(Number(o.seed)) ? Math.trunc(Number(o.seed)) : 1,
      minutes: Number.isFinite(Number(o.minutes)) ? Number(o.minutes) : 60,
      rounds: o.rounds === undefined || o.rounds === "" ? "" : String(o.rounds).slice(0, 4),
      results: str(o.results), playoff: Number.isFinite(Number(o.playoff)) ? Math.trunc(Number(o.playoff)) : 0,
      playoffDouble: o.playoffDouble === true, playoffThird: o.playoffThird === true,
      pins: str(o.pins), rainouts: str(o.rainouts), withdrawals: str(o.withdrawals), officials: str(o.officials), grounds: str(o.grounds), linked: str(o.linked), scoring: str(o.scoring),
    };
  } catch { return null; }
}

// ---------------------------------------------------------------- swiss system

/** Rounds that decide a clear winner among n players: ceil(log2 n), at least 1. */
export function swissRounds(n) {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
}

/**
 * Read finished Swiss games. One per line: `Ana 1 - 0 Ben` (equal numbers are a draw), `Cy bye`, or
 * `Dee out` for a player who has left the event (kept in the table, not paired again).
 * Returns { games: [{a, b, ga, gb}], byes: [index], withdrawn: [index], errors }.
 */
export function parseSwissResults(text, players) {
  const games = [];
  const byes = [];
  const withdrawn = [];
  const errors = [];
  const rest = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const w = line.match(/^(.*?)\s+(?:out|withdrawn|withdraws)$/i);
    if (w) {
      const idx = teamIndex(players, w[1]);
      if (idx < 0) errors.push(`Result line ${i + 1}: "${w[1]}" is not one of the players.`);
      else if (!withdrawn.includes(idx)) withdrawn.push(idx);
      continue;
    }
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
  return { games, byes, withdrawn, errors };
}

/** Score table: win 1, draw 0.5, bye counts as a win. Buchholz = sum of opponents' scores, then Sonneborn-Berger breaks ties. */
export function swissStandings(players, games, byes = [], { win = 1, draw = 0.5 } = {}) {
  const rows = players.map((name, i) => ({ index: i, name, score: 0, played: 0, opponents: [], whites: 0, blacks: 0, last: [], beaten: [], drawn: [] }));
  for (const g of games) {
    const A = rows[g.a];
    const B = rows[g.b];
    A.played++; B.played++;
    A.opponents.push(g.b); B.opponents.push(g.a);
    A.whites++; B.blacks++;
    A.last.push("W"); B.last.push("B");
    if (g.ga > g.gb) { A.score += win; A.beaten.push(g.b); }
    else if (g.ga < g.gb) { B.score += win; B.beaten.push(g.a); }
    else { A.score += draw; B.score += draw; A.drawn.push(g.b); B.drawn.push(g.a); }
  }
  for (const i of byes) rows[i].score += win;
  for (const r of rows) {
    r.buchholz = r.opponents.reduce((s, o) => s + rows[o].score, 0);
    // Sonneborn-Berger: full opponent score for each win, half for each draw. Rewards beating the strong.
    r.sonnebornBerger = r.beaten.reduce((s, o) => s + rows[o].score, 0) + r.drawn.reduce((s, o) => s + rows[o].score, 0) * (draw / win);
  }
  const byeSet = new Map();
  for (const i of byes) byeSet.set(i, (byeSet.get(i) ?? 0) + 1);
  for (const r of rows) r.byes = byeSet.get(r.index) ?? 0;
  rows.sort((x, y) => y.score - x.score || y.buchholz - x.buchholz || y.sonnebornBerger - x.sonnebornBerger || x.index - y.index);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/**
 * Pair the next Swiss round (Dutch style): players in the same score group meet top half against
 * bottom half, nobody meets twice, the bye goes to the lowest-ranked player without one, and colours
 * alternate. Games are `{a, b}` with a = white. `players` are in seed order (strongest first).
 * Returns { pairs: [{white, black}], bye: index | null, floaters: number }.
 */
export function swissPairings(players, games, byes = [], withdrawn = []) {
  const gone = new Set(withdrawn);
  const n = players.length - gone.size;
  if (n < 2) throw new Error("Swiss pairing needs at least 2 players still in the event.");
  const table = swissStandings(players, games, byes);
  const order = table.map((r) => r.index).filter((i) => !gone.has(i));
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
export function validateSwiss(players, games, byes, round, withdrawn = []) {
  const problems = [];
  const seen = new Set();
  for (const { white, black } of round.pairs) {
    for (const i of [white, black]) { if (seen.has(i)) problems.push(`${players[i]} is paired twice.`); seen.add(i); }
    if (games.some((g) => (g.a === white && g.b === black) || (g.a === black && g.b === white))) problems.push(`${players[white]} and ${players[black]} already played.`);
  }
  if (round.bye !== null) { if (seen.has(round.bye)) problems.push(`${players[round.bye]} has a bye and a game.`); seen.add(round.bye); if (byes.includes(round.bye) && byes.length < players.length - withdrawn.length) problems.push(`${players[round.bye]} already had a bye.`); }
  for (const i of withdrawn) if (seen.has(i)) problems.push(`${players[i]} has left the event but is paired.`);
  if (seen.size !== players.length - withdrawn.length) problems.push("Not every player is paired.");
  return problems;
}

/** Plain-text pairing sheet for pasting into a group chat. */
export function swissText(players, round, roundNumber) {
  const lines = [`Round ${roundNumber}`];
  round.pairs.forEach((p, i) => lines.push(`  Board ${i + 1}: ${players[p.white]} (white) vs ${players[p.black]} (black)`));
  if (round.bye !== null) lines.push(`  Bye: ${players[round.bye]}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- Americano

/**
 * Rotating-partner doubles ("Americano", social padel / pickleball / badminton nights): every round
 * players are re-paired into teams of two and teams into matches, so each person partners and
 * opposes as many different people as the round count allows. Greedy by round: byes go to whoever
 * has sat out least-recently-fewest, then a seeded random search with swap moves minimises repeat
 * partners (heavily), then repeat opponents. Deterministic for a given seed.
 * Returns { rounds: [{ matches: [{ court, a: [i, j], b: [k, l] }], byes: [i] }], partner, opponent }.
 */
export function americano(players, { courts = 1, rounds = null, seed = 1 } = {}) {
  const n = players.length;
  if (n < 4) throw new Error("Americano needs at least 4 players.");
  if (n > 64) throw new Error("Americano supports up to 64 players.");
  if (!(courts >= 1)) throw new Error("Americano needs at least 1 court.");
  const roundCount = rounds ?? Math.max(1, n % 4 === 0 && n / 4 <= courts ? n - 1 : n);
  const rng = mulberry32(seed);
  const partner = Array.from({ length: n }, () => new Array(n).fill(0));
  const opponent = Array.from({ length: n }, () => new Array(n).fill(0));
  const played = new Array(n).fill(0);
  const sat = new Array(n).fill(0);
  const lastSat = new Array(n).fill(-1);
  const out = [];
  const seats = Math.min(Math.floor(n / 4), courts) * 4;
  for (let r = 0; r < roundCount; r++) {
    // byes: most games played first, then sat out longest ago; random tie-break
    const order = [...Array(n).keys()].sort((x, y) => played[y] - played[x] || lastSat[x] - lastSat[y] || rng() - 0.5);
    const byes = order.slice(0, n - seats).sort((x, y) => x - y);
    const byeSet = new Set(byes);
    const active = [...Array(n).keys()].filter((i) => !byeSet.has(i));
    const cost = (arr) => {
      let c = 0;
      for (let m = 0; m < arr.length; m += 4) {
        const [a, b, x, y] = arr.slice(m, m + 4);
        c += 100 * partner[a][b] * partner[a][b] + 100 * partner[x][y] * partner[x][y];
        for (const [p, q] of [[a, x], [a, y], [b, x], [b, y]]) c += 10 * opponent[p][q];
      }
      return c;
    };
    let best = null;
    let bestCost = Infinity;
    for (let t = 0; t < 40 && bestCost > 0; t++) {
      const arr = active.slice();
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      let c = cost(arr);
      for (let it = 0; it < 150 && c > 0; it++) {
        const i = Math.floor(rng() * arr.length);
        const j = Math.floor(rng() * arr.length);
        if (Math.floor(i / 4) === Math.floor(j / 4) && ((i % 4 < 2) === (j % 4 < 2))) continue;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        const c2 = cost(arr);
        if (c2 < c) c = c2; else [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      if (c < bestCost) { bestCost = c; best = arr.slice(); }
    }
    const matches = [];
    for (let m = 0; m < best.length; m += 4) {
      const [a, b, x, y] = best.slice(m, m + 4);
      matches.push({ court: m / 4 + 1, a: [a, b].sort((p, q) => p - q), b: [x, y].sort((p, q) => p - q) });
      partner[a][b]++; partner[b][a]++; partner[x][y]++; partner[y][x]++;
      for (const [p, q] of [[a, x], [a, y], [b, x], [b, y]]) { opponent[p][q]++; opponent[q][p]++; }
      for (const i of [a, b, x, y]) played[i]++;
    }
    for (const i of byes) { sat[i]++; lastSat[i] = r; }
    out.push({ matches, byes });
  }
  return { rounds: out, partner, opponent };
}

/** Check an Americano plan: nobody twice in a round, byes and games within one of even. Returns problems. */
export function validateAmericano(players, plan) {
  const n = players.length;
  const problems = [];
  const played = new Array(n).fill(0);
  for (const [r, round] of plan.rounds.entries()) {
    const seen = new Set();
    const mark = (i) => { if (seen.has(i)) problems.push(`${players[i]} appears twice in round ${r + 1}.`); seen.add(i); };
    for (const m of round.matches) for (const i of [...m.a, ...m.b]) { mark(i); played[i]++; }
    for (const i of round.byes) mark(i);
    if (seen.size !== n) problems.push(`Round ${r + 1} does not place every player.`);
  }
  if (Math.max(...played) - Math.min(...played) > 1) problems.push("Games played differ by more than one.");
  return problems;
}

/** Summary: repeat partners/opponents, games and byes per person. */
export function americanoStats(players, plan) {
  const n = players.length;
  let repeatPartners = 0;
  let maxPartner = 0;
  let unmetPartners = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const c = plan.partner[i][j];
    maxPartner = Math.max(maxPartner, c);
    if (c > 1) repeatPartners += c - 1;
    if (c === 0) unmetPartners++;
  }
  const games = players.map(() => 0);
  const byes = players.map(() => 0);
  for (const round of plan.rounds) {
    for (const m of round.matches) for (const i of [...m.a, ...m.b]) games[i]++;
    for (const i of round.byes) byes[i]++;
  }
  return { repeatPartners, maxPartner, unmetPartners, games, byes };
}

/** Plain-text rotation sheet for a group chat. */
export function americanoText(players, plan) {
  const lines = [];
  plan.rounds.forEach((round, r) => {
    lines.push(`Round ${r + 1}`);
    for (const m of round.matches) lines.push(`  Court ${m.court}: ${players[m.a[0]]} & ${players[m.a[1]]} vs ${players[m.b[0]]} & ${players[m.b[1]]}`);
    if (round.byes.length) lines.push(`  Sitting out: ${round.byes.map((i) => players[i]).join(", ")}`);
  });
  return lines.join("\n");
}

/**
 * Mexicano scores: one finished doubles game per line, `Ana & Ben 21-17 Cy & Dee`. Players are matched
 * to the list case-insensitively. Returns { games: [{ a: [i, j], b: [k, l], sa, sb }], errors }.
 */
export function parseMexicanoScores(text, players) {
  const index = new Map(players.map((p, i) => [p.trim().toLowerCase(), i]));
  const games = [];
  const errors = [];
  const re = /^(.+?)\s*&\s*(.+?)\s+(\d+)\s*[-\u2013:]\s*(\d+)\s+(.+?)\s*&\s*(.+)$/;
  String(text || "").split(/\r?\n/).forEach((raw, ln) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = re.exec(line);
    if (!m) { errors.push(`Line ${ln + 1}: write it as "Ana & Ben 21-17 Cy & Dee".`); return; }
    const ids = [m[1], m[2], m[5], m[6]].map((nm) => index.get(nm.trim().toLowerCase()));
    const bad = [m[1], m[2], m[5], m[6]].filter((_, k) => ids[k] === undefined);
    if (bad.length) { errors.push(`Line ${ln + 1}: ${bad.map((b) => `"${b.trim()}"`).join(", ")} not in the player list.`); return; }
    if (new Set(ids).size !== 4) { errors.push(`Line ${ln + 1}: a player appears twice in one game.`); return; }
    games.push({ a: [ids[0], ids[1]], b: [ids[2], ids[3]], sa: Number(m[3]), sb: Number(m[4]) });
  });
  return { games, errors };
}

/**
 * Mexicano table: each player is credited with their side's points, so a good partner never costs you.
 * Ranked by points for, then points difference, then wins. Returns rows with rank, name, played, wins,
 * draws, losses, pf, pa, diff.
 */
export function mexicanoStandings(players, games) {
  const rows = players.map((name, i) => ({ i, name, played: 0, wins: 0, draws: 0, losses: 0, pf: 0, pa: 0, diff: 0 }));
  for (const g of games) {
    for (const [side, mine, theirs] of [[g.a, g.sa, g.sb], [g.b, g.sb, g.sa]]) {
      for (const i of side) {
        const r = rows[i];
        r.played++; r.pf += mine; r.pa += theirs; r.diff += mine - theirs;
        if (mine > theirs) r.wins++; else if (mine === theirs) r.draws++; else r.losses++;
      }
    }
  }
  rows.sort((x, y) => y.pf - x.pf || y.diff - x.diff || y.wins - x.wins || x.i - y.i);
  rows.forEach((r, k) => { r.rank = k + 1; });
  return rows;
}

/**
 * Next Mexicano round: players are ranked on points so far, sitting out goes to whoever has played the
 * most (random tie-break), the rest are cut into fours in rank order, and each four plays 1&4 against 2&3,
 * or a split that repeats fewer partnerships when it would otherwise repeat one. Round one, with no
 * scores yet, is a seeded random draw. Returns { matches: [{ court, a, b }], byes, repeatPartners }.
 */
export function mexicanoNextRound(players, games, { courts = 1, seed = 1 } = {}) {
  const n = players.length;
  if (n < 4) throw new Error("Mexicano needs at least 4 players.");
  if (!(courts >= 1)) throw new Error("Mexicano needs at least 1 court.");
  const rng = mulberry32(seed + games.length * 7919);
  const table = mexicanoStandings(players, games);
  const partner = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const g of games) { partner[g.a[0]][g.a[1]]++; partner[g.a[1]][g.a[0]]++; partner[g.b[0]][g.b[1]]++; partner[g.b[1]][g.b[0]]++; }
  const seats = Math.min(Math.floor(n / 4), courts) * 4;
  const played = new Array(n).fill(0);
  for (const r of table) played[r.i] = r.played;
  const jitter = players.map(() => rng());
  const byeOrder = [...Array(n).keys()].sort((x, y) => played[y] - played[x] || jitter[x] - jitter[y]);
  const byes = byeOrder.slice(0, n - seats).sort((x, y) => x - y);
  const byeSet = new Set(byes);
  let active;
  if (games.length === 0) {
    active = [...Array(n).keys()].filter((i) => !byeSet.has(i)).sort((x, y) => jitter[x] - jitter[y]);
  } else {
    active = table.map((r) => r.i).filter((i) => !byeSet.has(i));
  }
  const matches = [];
  let repeatPartners = 0;
  for (let m = 0; m < active.length; m += 4) {
    const [p1, p2, p3, p4] = active.slice(m, m + 4);
    const options = [[[p1, p4], [p2, p3]], [[p1, p3], [p2, p4]], [[p1, p2], [p3, p4]]];
    let best = options[0];
    let bestRep = Infinity;
    for (const o of options) {
      const rep = partner[o[0][0]][o[0][1]] + partner[o[1][0]][o[1][1]];
      if (rep < bestRep) { bestRep = rep; best = o; }
    }
    repeatPartners += bestRep;
    matches.push({ court: m / 4 + 1, a: best[0].slice().sort((x, y) => x - y), b: best[1].slice().sort((x, y) => x - y) });
  }
  return { matches, byes, repeatPartners };
}

/** Plain-text next-round sheet plus the table, for a group chat. */
export function mexicanoText(players, round, table, roundNumber) {
  const lines = [`Round ${roundNumber}`];
  for (const m of round.matches) lines.push(`  Court ${m.court}: ${players[m.a[0]]} & ${players[m.a[1]]} vs ${players[m.b[0]]} & ${players[m.b[1]]}`);
  if (round.byes.length) lines.push(`  Sitting out: ${round.byes.map((i) => players[i]).join(", ")}`);
  if (table.some((r) => r.played)) {
    lines.push("", "Standings");
    for (const r of table) lines.push(`  ${r.rank}. ${r.name}  ${r.pf} pts  (${r.diff >= 0 ? "+" : ""}${r.diff})  ${r.played} played`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- ladder

/**
 * Ladder results: one line per challenge, "Winner beat Loser" (also "def.", "defeated", "over"), oldest first.
 * Names match the player list case-insensitively. Returns { results: [{ winner, loser }], errors }.
 */
export function parseLadderResults(text, players) {
  const index = new Map(players.map((p, i) => [p.trim().toLowerCase(), i]));
  const results = [];
  const errors = [];
  const re = /^(.+?)\s+(?:beat|def\.?|defeated|over)\s+(.+)$/i;
  String(text || "").split(/\r?\n/).forEach((raw, ln) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = re.exec(line);
    if (!m) { errors.push(`Line ${ln + 1}: write it as "Ana beat Ben".`); return; }
    const w = index.get(m[1].trim().toLowerCase());
    const l = index.get(m[2].trim().toLowerCase());
    const bad = [[m[1], w], [m[2], l]].filter(([, id]) => id === undefined).map(([nm]) => `"${nm.trim()}"`);
    if (bad.length) { errors.push(`Line ${ln + 1}: ${bad.join(", ")} not in the player list.`); return; }
    if (w === l) { errors.push(`Line ${ln + 1}: a player cannot play themselves.`); return; }
    results.push({ winner: w, loser: l });
  });
  return { results, errors };
}

/**
 * Replay a challenge ladder. `players` is the starting order, top rung first. A challenger who beats someone
 * ranked above takes that rung and everyone from there down to the challenger's old rung drops one place
 * ("insert", the usual club rule); with { move: "swap" } only the two trade places. A win by the higher-ranked
 * player changes nothing. A challenge more than `reach` rungs up is still applied but listed in `outOfReach`
 * so the organiser can overrule it. Returns { order (player indexes, top first), moves, outOfReach, played }.
 */
export function ladderStandings(players, results, { reach = 3, move = "insert" } = {}) {
  if (!Array.isArray(players) || players.length < 2) throw new Error("A ladder needs at least 2 players.");
  const order = players.map((_, i) => i);
  const moves = [];
  const outOfReach = [];
  const played = new Array(players.length).fill(0);
  results.forEach((r, n) => {
    played[r.winner]++; played[r.loser]++;
    const from = order.indexOf(r.winner);
    const to = order.indexOf(r.loser);
    if (to < from - reach) outOfReach.push({ n: n + 1, winner: r.winner, loser: r.loser, rungs: from - to });
    if (from < to) { moves.push({ n: n + 1, winner: r.winner, loser: r.loser, from, to: from, held: true }); return; }
    if (move === "swap") { order[from] = r.loser; order[to] = r.winner; }
    else { order.splice(from, 1); order.splice(to, 0, r.winner); }
    moves.push({ n: n + 1, winner: r.winner, loser: r.loser, from, to, held: false });
  });
  return { order, moves, outOfReach, played };
}

/** Who each player may challenge now: the `reach` rungs directly above them. */
export function ladderChallenges(order, reach = 3) {
  return order.map((p, pos) => ({ player: p, rank: pos + 1, may: order.slice(Math.max(0, pos - reach), pos).reverse() }));
}

/** Plain-text ladder for a group chat: the rungs, who each player may challenge, and any overruled-looking challenge. */
export function ladderText(players, state, { reach = 3 } = {}) {
  const lines = ["Ladder"];
  state.order.forEach((p, i) => lines.push(`  ${i + 1}. ${players[p]}  (${state.played[p]} played)`));
  const ch = ladderChallenges(state.order, reach).filter((c) => c.may.length);
  if (ch.length) {
    lines.push("", `Who can challenge whom (up to ${reach} rung${reach === 1 ? "" : "s"} up)`);
    for (const c of ch) lines.push(`  ${players[c.player]} -> ${c.may.map((q) => players[q]).join(", ")}`);
  }
  if (state.outOfReach.length) {
    lines.push("", "Beyond the reach limit (applied anyway; overrule if your rules say so)");
    for (const o of state.outOfReach) lines.push(`  Result ${o.n}: ${players[o.winner]} beat ${players[o.loser]}, ${o.rungs} rungs up`);
  }
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

/**
 * Roll a league's form fields over to the next season: same teams, courts, times, weekdays and
 * per-team time and court limits; the old season's dated inputs (skip dates, blackouts, results, rainouts, withdrawals,
 * late entries, deadline) are cleared; teams that withdrew are dropped and late entrants kept;
 * the start moves to the first chosen weekday on or after `lastDay` + `gapWeeks` weeks (or a year
 * after the old start when the old season was not built); the seed moves on so home and away
 * and court draws are not a copy of last season's.
 */
export function nextSeasonFields(fields, { lastDay = null, gapWeeks = 8 } = {}) {
  const f = { ...fields };
  const lineTeam = (line) => line.replace(/^\s*\d{4}-\d{1,2}-\d{1,2}\s*[:,-]?\s*/, "").replace(/\s*(?:->|=>|\u2192)\s*.*$/, "").trim();
  const gone = new Set(String(f.withdrawals || "").split(/\n+/).map(lineTeam).filter(Boolean).map((t) => t.toLowerCase()));
  const late = String(f.lateTeams || "").split(/\n+/).map(lineTeam).filter(Boolean);
  const kept = String(f.teams || "").split(/\n+/).map((t) => t.trim()).filter((t) => t && !gone.has(t.toLowerCase()));
  for (const t of late) if (!kept.some((k) => k.toLowerCase() === t.toLowerCase())) kept.push(t);
  f.teams = kept.join("\n");
  const old = parseDate(f.start);
  let day = lastDay != null ? lastDay + gapWeeks * 7 : old != null ? old + 364 : null;
  if (day != null) {
    const wanted = (f.weekdays || []).map((w) => WEEKDAYS.indexOf(w)).filter((i) => i >= 0);
    if (wanted.length) for (let i = 0; i < 7 && !wanted.includes(dayOfWeek(day)); i++) day++;
    f.start = dayIso(day);
  }
  f.seed = (Number(f.seed) || 0) + 1;
  for (const k of ["skip", "blackouts", "results", "pins", "rainouts", "withdrawals", "lateTeams", "finishBy"]) if (k in f) f[k] = "";
  const dropped = String(fields.teams || "").split(/\n+/).map((t) => t.trim()).filter((t) => t && gone.has(t.toLowerCase()));
  return { fields: f, dropped, added: late.filter((t) => kept.includes(t)) };
}
