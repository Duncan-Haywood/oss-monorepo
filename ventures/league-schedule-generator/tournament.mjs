// Weekend tournament scheduler: several divisions (age groups) on a set of fields over one to
// several days. Each division plays pools (a round robin inside each pool), then an optional
// knockout bracket seeded by crossover from the pools. Games are laid onto real field time with
// a turnover buffer between games, a minimum rest between a team's games, a cap on games per team
// per day, field sizes (a 7v7 division only on fields that take 7v7), field closures, team arrival
// and departure limits, and coaches shared between teams (never two places at once).
//
// The search is randomized list scheduling: games go in pool-round order, each at the earliest
// start where every rule holds (scanning every eligible field), and the best of many shuffled
// orders is kept: fewest games left out, then the earliest finish, then the shortest longest
// wait any team has between games, then the least total waiting. validateTournament re-checks
// every rule from the output alone.

import { parseDate, parseTime, dayLabel, dayIso, dayOfWeek, splitPools, poolPlayoffSeeds, playoffBracket, roundRobin, mulberry32, csvCell } from "./calc.mjs";

const WEEKDAY_WORDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY = 1440;

export const hhmm = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const minutesOf = (t) => { const s = parseTime(t); return s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null; };
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th")}`;
const lines = (text) => String(text ?? "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
const TIME = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?";
const RANGE = new RegExp(`(?:^|\\s)(${TIME})\\s*(?:-|–|—|to)\\s*(${TIME})\\s*$`, "i");

/** "Sat 2027-05-15 08:00-19:00" per line -> { days: [{ day, label, open, close }], errors }. */
export function parseDays(text) {
  const days = [], errors = [];
  for (const raw of lines(text)) {
    if (!raw) continue;
    const m = raw.match(RANGE);
    if (!m) { errors.push(`"${raw}": add the hours, like 08:00-18:00.`); continue; }
    const open = minutesOf(m[1]), close = minutesOf(m[2]);
    const dateText = raw.slice(0, m.index).replace(/^[A-Za-z]{3,9},?\s+(?=\d)/, "").replace(/,\s*$/, "").trim();
    const day = parseDate(dateText);
    if (day === null) { errors.push(`"${raw}": the date is not a date (try 2027-05-15).`); continue; }
    if (open === null || close === null || close <= open) { errors.push(`"${raw}": the day must close after it opens.`); continue; }
    if (days.some((d) => d.day === day)) { errors.push(`"${raw}": that date is listed twice.`); continue; }
    days.push({ day, label: dayLabel(day), open, close });
  }
  days.sort((a, b) => a.day - b.day);
  if (!days.length && !errors.length) errors.push("List at least one day, like: Sat 2027-05-15 08:00-18:00.");
  return { days, errors };
}

/** A day reference: "Sat", "Sunday", "day 2", or a date. Returns a day index or -1. */
export function dayRef(ref, days) {
  const s = String(ref ?? "").trim().toLowerCase();
  let m = s.match(/^day\s*(\d+)$/);
  if (m) { const i = Number(m[1]) - 1; return i >= 0 && i < days.length ? i : -1; }
  const w = WEEKDAY_WORDS.findIndex((x) => s.length >= 3 && x === s.slice(0, 3) && /^[a-z]+$/.test(s));
  if (w >= 0) return days.findIndex((d) => dayOfWeek(d.day) === w);
  const d = parseDate(ref);
  return d === null ? -1 : days.findIndex((x) => x.day === d);
}

/**
 * "Field 1: 11v11, 9v9; closed Sun 12:00-18:00" per line. A field with no sizes takes any
 * division; "closed Sat" closes it all day. -> { fields: [{ name, tags, closed }], errors }
 */
export function parseFields(text, days) {
  const fields = [], errors = [];
  for (const raw of lines(text)) {
    if (!raw) continue;
    const [main, ...clauses] = raw.split(";").map((s) => s.trim());
    const ci = main.indexOf(":");
    const name = (ci >= 0 ? main.slice(0, ci) : main).trim();
    const tags = ci >= 0 ? main.slice(ci + 1).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
    if (!name) { errors.push(`"${raw}": the field needs a name.`); continue; }
    if (fields.some((f) => f.name.toLowerCase() === name.toLowerCase())) { errors.push(`"${raw}": two fields are called ${name}.`); continue; }
    const closed = [];
    for (const c of clauses) {
      const m = c.match(new RegExp(`^closed\\s+(.+?)(?:\\s+(${TIME})\\s*(?:-|–|to)\\s*(${TIME}))?$`, "i"));
      const di = m ? dayRef(m[1], days) : -1;
      if (!m || di < 0) { errors.push(`"${raw}": "${c}" should read like "closed Sun" or "closed Sat 12:00-13:00", on a listed day.`); continue; }
      const from = m[2] ? minutesOf(m[2]) : 0, to = m[3] ? minutesOf(m[3]) : DAY;
      if (from === null || to === null || to <= from) { errors.push(`"${raw}": the closed hours run backwards.`); continue; }
      closed.push({ start: di * DAY + from, end: di * DAY + to });
    }
    fields.push({ name, tags, closed });
  }
  if (!fields.length && !errors.length) errors.push("List at least one field.");
  return { fields, errors };
}

/**
 * Divisions: blocks separated by a blank line. The first line is the name and settings, the rest
 * are teams, best seed first:
 *   U10 Boys: 50 min, 7v7, pools of 4, top 4, 3rd place, rest 60, max 3 a day, knockouts Sun
 * Settings may be left out (the defaults apply). -> { divisions, errors }
 */
export function parseDivisions(text, days, defaults = {}) {
  const { minutes = 60, rest = 60, maxPerDay = 3, poolSize = 4, advance = 0 } = defaults;
  const blocks = [];
  let cur = null;
  for (const l of lines(text)) {
    if (!l) { cur = null; continue; }
    if (!cur) { cur = []; blocks.push(cur); }
    cur.push(l);
  }
  const divisions = [], errors = [];
  for (const b of blocks) {
    const head = b[0];
    const ci = head.indexOf(":");
    const name = (ci >= 0 ? head.slice(0, ci) : head).trim();
    const d = { name, minutes, tag: null, pools: null, poolSize, advance, thirdPlace: false, rest, maxPerDay, knockoutDay: null, teams: [] };
    const bad = [];
    for (const tok of (ci >= 0 ? head.slice(ci + 1) : "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)) {
      let m;
      if ((m = tok.match(/^(\d+)\s*(?:min|mins|minutes|minute)$/))) d.minutes = Number(m[1]);
      else if ((m = tok.match(/^(?:field\s+|on\s+)?(\d+\s*v\s*\d+)$/))) d.tag = m[1].replace(/\s+/g, "");
      else if ((m = tok.match(/^field\s+(.+)$/))) d.tag = m[1];
      else if ((m = tok.match(/^pools? of (\d+)$/))) { d.poolSize = Number(m[1]); d.pools = null; }
      else if ((m = tok.match(/^(\d+) pools?$/))) d.pools = Number(m[1]);
      else if (tok === "one pool" || tok === "1 pool") d.pools = 1;
      else if ((m = tok.match(/^top (\d+)$/))) d.advance = Number(m[1]);
      else if (/^(no (play-?offs?|knockouts?|bracket)|pools only)$/.test(tok)) d.advance = 0;
      else if (/^(3rd|third)[- ]place( game)?$/.test(tok)) d.thirdPlace = true;
      else if ((m = tok.match(/^rest (\d+)(?:\s*min\w*)?$/))) d.rest = Number(m[1]);
      else if ((m = tok.match(/^max (\d+)(?: games?)? (?:a|per) day$/))) d.maxPerDay = Number(m[1]);
      else if ((m = tok.match(/^knockouts? (?:on )?(.+)$/))) { const di = dayRef(m[1], days); if (di < 0) bad.push(`"${tok}" names no listed day`); else d.knockoutDay = di; }
      else bad.push(`"${tok}" is not a setting I know`);
    }
    if (!name) bad.push("the division needs a name before the colon");
    const seen = new Set();
    for (const t of b.slice(1)) {
      const nm = t.replace(/^(\d{1,3}[.)]|[-•*–])\s+/, "").trim();
      if (seen.has(nm.toLowerCase())) bad.push(`${nm} is listed twice`);
      seen.add(nm.toLowerCase());
      d.teams.push(nm);
    }
    if (d.teams.length < 2) bad.push("it needs at least two teams, one per line under its name");
    if (d.minutes < 5 || d.minutes > 300) bad.push("game length must be 5 to 300 minutes");
    if (d.maxPerDay < 1) bad.push("max a day must be at least 1");
    if (d.rest > 600) bad.push("rest is over 10 hours");
    if (!d.pools) d.pools = Math.max(1, Math.round(d.teams.length / Math.max(2, d.poolSize)));
    while (d.pools > 1 && d.teams.length < 2 * d.pools) d.pools--;
    if (d.advance === 1 || d.advance > d.teams.length) bad.push(`top ${d.advance} needs 2 to ${d.teams.length}`);
    if (d.advance >= 2 && d.advance === d.teams.length && d.pools === 1) bad.push(`top ${d.advance} of ${d.teams.length} in one pool makes the pool games count for nothing; use fewer`);
    if (divisions.some((x) => x.name.toLowerCase() === name.toLowerCase())) bad.push("another division has that name");
    if (bad.length) errors.push(`${name || head}: ${bad.join("; ")}.`);
    else divisions.push(d);
  }
  if (!blocks.length) errors.push("Add a division: its name and settings on one line, then its teams one per line.");
  return { divisions, errors };
}

function resolveTeams(ref, divisions) {
  const s = ref.trim().toLowerCase();
  const out = [];
  const slash = s.indexOf("/");
  for (const d of divisions) d.teams.forEach((t) => {
    const k = `${d.name}/${t}`.toLowerCase();
    if (k === s || (slash < 0 && t.toLowerCase() === s)) out.push(`${d.name}/${t}`);
  });
  return out;
}

/**
 * Team limits, one per line: "Hawks: not before Sat 11:00", "U12/Hawks: not after Sun 13:00",
 * "Lions: not Sun". A plain team name applies in every division that has it.
 * -> { windows: { teamKey: [{ start, end }] (times it cannot play) }, errors }
 */
export function parseTeamLimits(text, days, divisions) {
  const windows = {}, errors = [];
  for (const raw of lines(text)) {
    if (!raw) continue;
    const m = raw.match(new RegExp(`^(.+?):\\s*not\\s+(before|after)?\\s*(.+?)(?:\\s+(${TIME}))?$`, "i"));
    if (!m) { errors.push(`"${raw}": write it like "Hawks: not before Sat 11:00" or "Hawks: not Sun".`); continue; }
    const keys = resolveTeams(m[1], divisions);
    if (!keys.length) { errors.push(`"${raw}": no team is called ${m[1]}.`); continue; }
    const di = dayRef(m[3], days);
    if (di < 0) { errors.push(`"${raw}": ${m[3]} is not one of the listed days.`); continue; }
    const at = m[4] ? minutesOf(m[4]) : null;
    let w;
    if (!m[2]) w = at === null ? { start: di * DAY, end: (di + 1) * DAY } : null;
    else if (at === null) { errors.push(`"${raw}": give a time after the day.`); continue; }
    else if (m[2].toLowerCase() === "before") w = { start: 0, end: di * DAY + at };
    else w = { start: di * DAY + at, end: days.length * DAY };
    if (!w) { errors.push(`"${raw}": use "not before" or "not after" with a time.`); continue; }
    for (const k of keys) (windows[k] ||= []).push(w);
  }
  return { windows, errors };
}

/** Shared coaches: one group of teams per line ("U10/Hawks, U12/Hawks"). -> { groups, errors } */
export function parseCoachGroups(text, divisions) {
  const groups = [], errors = [];
  for (const raw of lines(text)) {
    if (!raw) continue;
    const keys = [];
    for (const part of raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
      const k = resolveTeams(part, divisions);
      if (!k.length) errors.push(`"${raw}": no team is called ${part}.`);
      keys.push(...k);
    }
    const uniq = [...new Set(keys)];
    if (uniq.length >= 2) groups.push(uniq);
    else if (keys.length) errors.push(`"${raw}": a shared coach needs two or more teams.`);
  }
  return { groups, errors };
}

const STAGE_SHORT = { Final: "Final", Semifinals: "SF", Quarterfinals: "QF" };

/** Pools, pool games and bracket games for one division, before any times are given. */
export function divisionGames(d, di) {
  const pools = splitPools(d.teams, d.pools);
  const letter = (p) => pools[p].name.replace(/^Pool /, "");
  const games = [];
  pools.forEach((pool, p) => {
    roundRobin(pool.teams.length).forEach((r, ri) => r.matches.forEach(([h, a]) => {
      games.push({ div: di, stage: pool.name, round: ri, home: pool.teams[h], away: pool.teams[a], teams: [`${d.name}/${pool.teams[h]}`, `${d.name}/${pool.teams[a]}`], deps: [], knockout: false });
    }));
  });
  let bracket = null;
  const seedLabels = [];
  if (d.advance >= 2) {
    const k = pools.length;
    const full = Math.floor(d.advance / k);
    if (full > 0) {
      const tables = pools.map((pool, p) => Array.from({ length: Math.min(full, pool.teams.length) }, (_, i) => ({ name: `${ordinal(i + 1)} Pool ${letter(p)}`, points: 0, gd: 0, gf: 0 })));
      seedLabels.push(...(k > 1 ? poolPlayoffSeeds(tables, full).seeds : tables[0].map((r) => r.name.replace(/ Pool A$/, ""))));
    }
    for (let i = 0; seedLabels.length < d.advance; i++) seedLabels.push(`${i === 0 ? "Best" : `${ordinal(i + 1)}-best`} ${ordinal(full + 1)}-placed`);
    bracket = playoffBracket(seedLabels, { thirdPlace: d.thirdPlace });
    const label = {};
    bracket.rounds.forEach((r) => {
      const real = r.matches.filter((m) => !m.bye && m.id !== "3P");
      real.forEach((m, i) => { label[m.id] = Object.hasOwn(STAGE_SHORT, r.name) ? `${STAGE_SHORT[r.name]}${real.length > 1 ? i + 1 : ""}` : `${r.name} ${i + 1}`; });
      r.matches.filter((m) => m.id === "3P").forEach((m) => { label[m.id] = "3rd place"; });
    });
    const slot = (s) => (s.name ? s.name : s.from ? `Winner ${label[s.from]}` : `Loser ${label[s.loserOf]}`);
    bracket.rounds.forEach((r, ri) => r.matches.forEach((m) => {
      if (m.bye) return;
      const deps = [m.a, m.b].filter((s) => s.from || s.loserOf).map((s) => `${d.name}#${s.from || s.loserOf}`);
      games.push({ div: di, stage: label[m.id], round: 100 + ri, home: slot(m.a), away: slot(m.b), teams: [], deps, afterPools: [m.a, m.b].some((s) => s.name), knockout: true, key: `${d.name}#${m.id}` });
    }));
  }
  return { pools, games, bracket, seeds: seedLabels };
}

/**
 * Can a division's pools and its knockout path fit the daily cap at all? Pool games come before
 * any knockout game; a finalist plays every knockout round. For each way of spreading the R rounds
 * over the days from `koFrom` (the first knockout day also takes pool games before its knockouts,
 * later days none), a pool of n gets b_d = cap - rounds_d places per team on day d, and K_n's
 * n(n-1)/2 games fit only if they do not exceed the sum of floor(n * b_d / 2) (a day's games use
 * two places each). True when some spread passes for every pool. A necessary condition, not a
 * schedule: field time, rest and other divisions can still rule a weekend out.
 */
export function capFits(poolSizes, R, cap, D, koFrom = 0) {
  const poolOk = (b) => poolSizes.every((n) => n * (n - 1) / 2 <= b.reduce((s, x) => s + Math.floor(n * Math.max(0, x) / 2), 0));
  if (!R) return poolOk(Array(D).fill(cap));
  const spread = (f, d, left, ko) => {
    if (d === D) return left === 0 && poolOk(Array.from({ length: D }, (_, k) => (k < f ? cap : k === f ? cap - ko[f] : 0)));
    for (let r = Math.min(cap, left); r >= (d === f ? 1 : 0); r--) { ko[d] = r; if (spread(f, d + 1, left - r, ko)) return true; }
    return false;
  };
  for (let f = Math.max(0, koFrom); f < D; f++) if (spread(f, f, R, Array(D).fill(0))) return true;
  return false;
}

function overlaps(a0, a1, list, gap = 0) {
  for (const b of list) if (a0 < b.end + gap && b.start < a1 + gap) return true;
  return false;
}

/**
 * Build the tournament. `spec`: { days, fields, divisions, windows, coachGroups, buffer, tries, seed }
 * (the parse* outputs). Returns { games (placed, sorted), unplaced, pools, brackets, stats, ... }.
 */
export function buildTournament(spec) {
  const { days, fields, divisions, windows = {}, coachGroups = [], buffer = 10, tries = 120, seed = 1 } = spec;
  const errors = [];
  if (!days?.length) errors.push("No days.");
  if (!fields?.length) errors.push("No fields.");
  if (!divisions?.length) errors.push("No divisions.");
  if (errors.length) return { errors };
  const fieldOk = divisions.map((d) => fields.map((f, i) => (!d.tag || !f.tags.length || f.tags.includes(d.tag) ? i : -1)).filter((i) => i >= 0));
  divisions.forEach((d, i) => { if (!fieldOk[i].length) errors.push(`${d.name}: no field takes ${d.tag}.`); });
  if (errors.length) return { errors };
  const perDiv = divisions.map((d, di) => divisionGames(d, di));
  const base = perDiv.flatMap((x) => x.games).map((g, id) => ({ ...g, id }));
  const byKey = Object.fromEntries(base.filter((g) => g.key).map((g) => [g.key, g]));
  const coachOf = {};
  coachGroups.forEach((grp, gi) => grp.forEach((k) => (coachOf[k] ||= []).push(gi)));

  // Capacity: field-minutes each division needs against the field time open to it.
  const openMinutes = (fi) => days.reduce((s, d, di) => {
    let m = d.close - d.open;
    for (const c of fields[fi].closed) m -= Math.max(0, Math.min(c.end, di * DAY + d.close) - Math.max(c.start, di * DAY + d.open));
    return s + Math.max(0, m);
  }, 0);
  const fieldOpen = fields.map((_, fi) => openMinutes(fi));
  const need = divisions.map((d, di) => base.filter((g) => g.div === di).length * (d.minutes + buffer));
  const warnings = [];
  const groupsSeen = new Set();
  divisions.forEach((d, di) => {
    const key = fieldOk[di].join(",");
    if (groupsSeen.has(key)) return;
    groupsSeen.add(key);
    const share = divisions.map((_, j) => j).filter((j) => fieldOk[j].every((f) => fieldOk[di].includes(f)));
    const want = share.reduce((s, j) => s + need[j], 0);
    const have = fieldOk[di].reduce((s, f) => s + fieldOpen[f], 0);
    if (want > have) warnings.push(`${share.map((j) => divisions[j].name).join(" and ")} need about ${Math.ceil(want / 60)} field-hours (games plus turnover) but ${fieldOk[di].map((f) => fields[f].name).join(", ")} ${fieldOk[di].length === 1 ? "is" : "are"} open ${Math.floor(have / 60)}: some games cannot fit. Add field time or shorten games.`);
  });

  // Games a team may have to play against what the days and the daily cap allow.
  divisions.forEach((d, di) => {
    const poolMost = Math.max(...perDiv[di].pools.map((p) => p.teams.length - 1));
    const rounds = perDiv[di].bracket ? perDiv[di].bracket.rounds.filter((r) => r.matches.some((m) => !m.bye)).length : 0;
    const koDays = d.knockoutDay === null ? days.length : days.length - d.knockoutDay;
    const allowed = d.maxPerDay * days.length;
    if (poolMost + rounds > allowed) warnings.push(`${d.name}: a team that reaches the final plays ${poolMost + rounds} games (${poolMost} in its pool, ${rounds} knockout), but ${days.length} day${days.length === 1 ? "" : "s"} at ${d.maxPerDay} a day allow ${allowed}. Raise the daily cap, use smaller pools or fewer teams in the knockouts, or add a day.`);
    else if (rounds > d.maxPerDay * koDays) warnings.push(`${d.name}: ${rounds} knockout rounds do not fit ${koDays} knockout day${koDays === 1 ? "" : "s"} at ${d.maxPerDay} a day.`);
    else if (!capFits(perDiv[di].pools.map((p) => p.teams.length), rounds, d.maxPerDay, days.length, d.knockoutDay ?? 0)) warnings.push(`${d.name}: the daily cap of ${d.maxPerDay} cannot hold every pool game and a finalist's ${rounds} knockout game${rounds === 1 ? "" : "s"} on ${days.length} day${days.length === 1 ? "" : "s"} (a pool of ${Math.max(...perDiv[di].pools.map((p) => p.teams.length))} plays ${Math.max(...perDiv[di].pools.map((p) => p.teams.length * (p.teams.length - 1) / 2))} games, and a pool game takes two teams' places on a day). Raise the cap by one, use smaller pools or fewer teams in the knockouts, or add a day.`);
  });

  const rng = mulberry32(seed * 7919 + 17);
  // Knockout room: a team's pool games on a day leave room for the knockout rounds that may land
  // on it (a team in the final plays every round). Plans, tried in turn by the restarts: no room
  // kept; all the room the last day can give; and room kept for one round on each knockout day.
  const koRounds = perDiv.map((x) => (x.bracket ? x.bracket.rounds.filter((r) => r.matches.some((m) => !m.bye)).length : 0));
  const reservePlans = divisions.map((d, di) => {
    const R = koRounds[di];
    const zero = days.map(() => 0);
    if (!R) return [zero];
    const back = days.map(() => 0);
    let left = R;
    for (let k = days.length - 1; k >= 0 && left > 0; k--) { back[k] = Math.min(left, d.maxPerDay - 1); left -= back[k]; }
    const one = days.map((_, k) => (d.knockoutDay === null || k >= d.knockoutDay ? Math.min(1, d.maxPerDay - 1) : 0));
    return [zero, back, one].filter((p, i, all) => all.findIndex((q) => q.join() === p.join()) === i);
  });
  // Tightness: the share of a finalist's allowed games (days x daily cap) its path uses. On every
  // other try the tightest divisions' pool rounds go first.
  const tight = divisions.map((d, di) => (Math.max(...perDiv[di].pools.map((p) => p.teams.length - 1)) + koRounds[di]) / (d.maxPerDay * days.length));
  // Squeaky wheel: a division that had games left out gets its pool rounds moved earlier in the
  // order on the tries that follow (up to two rounds' worth), so its knockouts find room.
  const boost = divisions.map(() => 0);
  const attempt = (jitter, planIndex) => {
    const reserve = reservePlans.map((plans) => plans[planIndex % plans.length]);
    const keyOf = base.map((g) => g.round - (g.knockout ? 0 : tight[g.div] * (planIndex % 2 ? 0.9 : 0) + boost[g.div]) + (g.knockout ? 0 : jitter * rng()) + (rng() * 0.01));
    const order = base.map((g) => g.id).sort((a, b) => keyOf[a] - keyOf[b]);
    const fieldBusy = fields.map(() => []);
    const teamBusy = {};
    const placed = new Array(base.length).fill(null);
    const poolEnd = divisions.map(() => -Infinity);
    const poolLeft = divisions.map((_, di) => base.filter((g) => g.div === di && !g.knockout).length);
    const poolPerDay = divisions.map(() => days.map(() => ({})));
    const chain = {};
    const unplaced = [];
    for (const id of order) {
      const g = base[id];
      const d = divisions[g.div];
      const L = d.minutes;
      let earliest = 0;
      if (g.knockout) {
        if (g.afterPools) {
          if (poolLeft[g.div] > 0) { unplaced.push({ id, why: "a pool game it waits on was not placed" }); continue; }
          earliest = Math.max(earliest, poolEnd[g.div] + d.rest);
        }
        let blocked = false;
        for (const k of g.deps) { const p = placed[byKey[k].id]; if (!p) blocked = true; else earliest = Math.max(earliest, p.end + d.rest); }
        if (blocked) { unplaced.push({ id, why: "a game it waits on was not placed" }); continue; }
        if (d.knockoutDay !== null) earliest = Math.max(earliest, d.knockoutDay * DAY);
      }
      const fit = findSlot(g, d, L, earliest);
      if (!fit) { unplaced.push({ id, why: null }); continue; }
      const { start, field } = fit;
      const di = Math.floor(start / DAY);
      placed[id] = { start, end: start + L, field, day: di };
      fieldBusy[field].push({ start, end: start + L });
      for (const t of g.teams) {
        (teamBusy[t] ||= []).push({ start, end: start + L });
        poolPerDay[g.div][di][t] = (poolPerDay[g.div][di][t] || 0) + 1;
      }
      if (!g.knockout) { poolLeft[g.div]--; poolEnd[g.div] = Math.max(poolEnd[g.div], start + L); }
      else chain[g.key] = chainOn(g, di) + 1;
    }
    function chainOn(g, di) {
      let c = 0;
      for (const k of g.deps) { const p = placed[byKey[k].id]; if (p && p.day === di) c = Math.max(c, chain[k] || 0); }
      return c;
    }
    function findSlot(g, d, L, earliest, relax = {}) {
      const coachMates = [...new Set(g.teams.flatMap((t) => (coachOf[t] || []).flatMap((gi) => coachGroups[gi])))].filter((k) => !g.teams.includes(k));
      let best = null;
      for (let di = Math.max(0, Math.floor(earliest / DAY)); di < days.length && !best; di++) {
        const day = days[di];
        const lo = Math.max(di * DAY + day.open, earliest), hi = di * DAY + day.close - L;
        if (hi < lo) continue;
        if (!relax.cap) {
          if (!g.knockout && g.teams.some((t) => (poolPerDay[g.div][di][t] || 0) >= d.maxPerDay - (relax.reserve ? 0 : reserve[g.div][di]))) continue;
          if (g.knockout) {
            const poolMax = Math.max(0, ...Object.values(poolPerDay[g.div][di]));
            if (poolMax + chainOn(g, di) + 1 > d.maxPerDay) continue;
          }
        }
        const cand = new Set([lo]);
        for (const f of fieldOk[g.div]) { for (const b of fieldBusy[f]) cand.add(b.end + buffer); for (const c of fields[f].closed) cand.add(c.end); }
        for (const t of g.teams) { for (const b of teamBusy[t] || []) cand.add(b.end + (relax.rest ? 0 : d.rest)); for (const w of windows[t] || []) cand.add(w.end); }
        for (const k of coachMates) for (const b of teamBusy[k] || []) cand.add(b.end + buffer);
        const starts = [...cand].filter((s) => s >= lo && s <= hi).sort((a, b) => a - b);
        for (const s of starts) {
          const e = s + L;
          if (g.teams.some((t) => overlaps(s, e, teamBusy[t] || [], relax.rest ? 0 : d.rest) || overlaps(s, e, windows[t] || [], 0))) continue;
          if (coachMates.some((k) => overlaps(s, e, teamBusy[k] || [], buffer))) continue;
          const f = fieldOk[g.div]
            .filter((fi) => !overlaps(s, e, fieldBusy[fi], buffer) && !overlaps(s, e, fields[fi].closed, 0))
            .sort((a, b) => (fields[a].tags.length || 99) - (fields[b].tags.length || 99) || a - b)[0];
          if (f === undefined) continue;
          best = { start: s, field: f };
          break;
        }
      }
      return best;
    }
    for (const u of unplaced) {
      if (u.why) continue;
      const g = base[u.id], d = divisions[g.div];
      u.why = findSlot(g, d, d.minutes, 0, { rest: true }) ? `no field time left that also gives ${d.rest} minutes' rest`
        : findSlot(g, d, d.minutes, 0, { cap: true }) ? `every day's cap of ${d.maxPerDay} game${d.maxPerDay === 1 ? "" : "s"} a team is reached`
        : findSlot(g, d, d.minutes, 0, { rest: true, cap: true }) ? "the rest and daily cap together leave no slot"
        : "no field time left (team limits, coaches and other games fill it)";
    }
    return { placed, unplaced };
  };

  const scoreOf = (r) => {
    let last = 0, maxWait = 0, totalWait = 0;
    r.placed.forEach((p) => { if (p) last = Math.max(last, p.end); });
    const per = {};
    base.forEach((g, i) => { const p = r.placed[i]; if (p) for (const t of g.teams) (per[t] ||= []).push(p); });
    for (const list of Object.values(per)) {
      list.sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i++) if (list[i].day === list[i - 1].day) {
        const w = list[i].start - list[i - 1].end;
        maxWait = Math.max(maxWait, w); totalWait += w;
      }
    }
    return [r.unplaced.length, last, maxWait, totalWait];
  };
  const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
  let best = attempt(0, 0), bestScore = scoreOf(best), triesRun = 1;
  for (let t = 1; t < tries; t++, triesRun++) {
    const r = attempt(t < 3 ? 0 : t < tries / 3 ? 0.6 : 1.6, t);
    const s = scoreOf(r);
    if (better(s, bestScore)) { best = r; bestScore = s; }
    const hurt = new Set(r.unplaced.map((u) => base[u.id].div));
    divisions.forEach((_, di) => { boost[di] = hurt.has(di) ? Math.min(2, boost[di] + 0.25) : Math.max(0, boost[di] - 0.05); });
  }

  const games = base.map((g, i) => {
    const p = best.placed[i];
    if (!p) return null;
    const day = days[p.day];
    return { id: i, division: divisions[g.div].name, stage: g.stage, knockout: g.knockout, home: g.home, away: g.away, teams: g.teams, key: g.key || null, deps: g.deps, afterPools: !!g.afterPools,
      dayIndex: p.day, date: dayIso(day.day), dayLabel: day.label, startAbs: p.start, endAbs: p.end, start: hhmm(p.start - p.day * DAY), end: hhmm(p.end - p.day * DAY), field: fields[p.field].name };
  }).filter(Boolean).sort((a, b) => a.startAbs - b.startAbs || fields.findIndex((f) => f.name === a.field) - fields.findIndex((f) => f.name === b.field));
  const unplaced = best.unplaced.map((u) => ({ division: divisions[base[u.id].div].name, stage: base[u.id].stage, home: base[u.id].home, away: base[u.id].away, why: u.why }));
  const result = {
    days, fields, divisions, buffer, windows, coachGroups, games, unplaced, warnings, triesRun,
    pools: perDiv.map((x, di) => ({ division: divisions[di].name, pools: x.pools, seeds: x.seeds })),
    score: { unplaced: bestScore[0], maxWait: bestScore[2], totalWait: bestScore[3] },
  };
  result.teams = teamReport(result);
  result.fieldUse = fields.map((f, fi) => {
    const mine = games.filter((g) => g.field === f.name);
    const used = mine.reduce((s, g) => s + g.endAbs - g.startAbs, 0);
    return { field: f.name, games: mine.length, minutes: used, open: fieldOpen[fi], share: fieldOpen[fi] ? used / fieldOpen[fi] : 0 };
  });
  result.finish = games.length ? `${games[games.length - 1].dayLabel} ${hhmm(Math.max(...games.filter((g) => g.dayIndex === games[games.length - 1].dayIndex).map((g) => g.endAbs)) % DAY)}` : null;
  return result;
}

/** Per team: games, per-day counts, the shortest rest and longest wait between games on one day. */
export function teamReport(t) {
  const out = [];
  t.divisions.forEach((d) => d.teams.forEach((name) => {
    const key = `${d.name}/${name}`;
    const mine = t.games.filter((g) => g.teams.includes(key)).sort((a, b) => a.startAbs - b.startAbs);
    let minRest = null, maxWait = 0;
    for (let i = 1; i < mine.length; i++) if (mine[i].dayIndex === mine[i - 1].dayIndex) {
      const gap = mine[i].startAbs - mine[i - 1].endAbs;
      minRest = minRest === null ? gap : Math.min(minRest, gap);
      maxWait = Math.max(maxWait, gap);
    }
    out.push({ division: d.name, team: name, games: mine.length, perDay: t.days.map((_, di) => mine.filter((g) => g.dayIndex === di).length), minRest, maxWait, first: mine[0] ? `${mine[0].dayLabel.slice(0, 3)} ${mine[0].start}` : null });
  }));
  return out;
}

/** Re-check every rule from the output alone. Returns a list of problems (empty when clean). */
export function validateTournament(t) {
  const bad = [];
  const div = Object.fromEntries(t.divisions.map((d) => [d.name, d]));
  const fieldBy = Object.fromEntries(t.fields.map((f) => [f.name, f]));
  const byKey = Object.fromEntries(t.games.filter((g) => g.key).map((g) => [g.key, g]));
  const coachOf = {};
  (t.coachGroups || []).forEach((grp, gi) => grp.forEach((k) => (coachOf[k] ||= []).push(gi)));
  for (const g of t.games) {
    const d = div[g.division], f = fieldBy[g.field], day = t.days[g.dayIndex];
    const s = g.startAbs - g.dayIndex * DAY, e = g.endAbs - g.dayIndex * DAY;
    if (g.endAbs - g.startAbs !== d.minutes) bad.push(`${g.division} ${g.stage}: wrong length`);
    if (s < day.open || e > day.close) bad.push(`${g.division} ${g.stage} ${g.home} v ${g.away}: outside the day's hours`);
    if (d.tag && f.tags.length && !f.tags.includes(d.tag)) bad.push(`${g.division} on ${f.name}: field does not take ${d.tag}`);
    if (f.closed.some((c) => g.startAbs < c.end && c.start < g.endAbs)) bad.push(`${f.name} is closed at ${g.dayLabel} ${g.start}`);
    for (const k of g.teams) for (const w of t.windows[k] || []) if (g.startAbs < w.end && w.start < g.endAbs) bad.push(`${k} plays at ${g.dayLabel} ${g.start} inside its limit`);
    if (g.knockout) {
      for (const k of g.deps) { const p = byKey[k]; if (!p) bad.push(`${g.division} ${g.stage}: a feeder game is missing`); else if (g.startAbs < p.endAbs + d.rest) bad.push(`${g.division} ${g.stage} starts before its feeder ${p.stage} ends plus rest`); }
      if (g.afterPools) {
        const poolEnd = Math.max(...t.games.filter((x) => x.division === g.division && !x.knockout).map((x) => x.endAbs));
        if (g.startAbs < poolEnd + d.rest) bad.push(`${g.division} ${g.stage} starts before pool play ends plus rest`);
      }
      if (d.knockoutDay !== null && g.dayIndex < d.knockoutDay) bad.push(`${g.division} ${g.stage} is before the knockout day`);
    }
  }
  for (const f of t.fields) {
    const mine = t.games.filter((g) => g.field === f.name).sort((a, b) => a.startAbs - b.startAbs);
    for (let i = 1; i < mine.length; i++) if (mine[i].startAbs < mine[i - 1].endAbs + t.buffer) bad.push(`${f.name}: ${mine[i - 1].start} and ${mine[i].start} on ${mine[i].dayLabel} leave under ${t.buffer} minutes' turnover`);
  }
  const keys = new Set(t.divisions.flatMap((d) => d.teams.map((x) => `${d.name}/${x}`)));
  for (const k of keys) {
    const d = div[k.slice(0, k.indexOf("/"))];
    const mine = t.games.filter((g) => g.teams.includes(k)).sort((a, b) => a.startAbs - b.startAbs);
    for (let i = 1; i < mine.length; i++) if (mine[i].dayIndex === mine[i - 1].dayIndex && mine[i].startAbs < mine[i - 1].endAbs + d.rest) bad.push(`${k}: under ${d.rest} minutes' rest on ${mine[i].dayLabel}`);
    t.days.forEach((_, di) => { const n = mine.filter((g) => g.dayIndex === di).length; if (n > d.maxPerDay) bad.push(`${k}: ${n} games on day ${di + 1}, over ${d.maxPerDay}`); });
    for (const gi of coachOf[k] || []) for (const other of t.coachGroups[gi]) if (other > k) {
      const theirs = t.games.filter((g) => g.teams.includes(other) && !g.teams.includes(k));
      for (const a of mine) if (!a.teams.includes(other)) for (const b of theirs) if (a.startAbs < b.endAbs + t.buffer && b.startAbs < a.endAbs + t.buffer) bad.push(`${k} and ${other} share a coach and overlap at ${a.dayLabel} ${a.start}`);
    }
  }
  // Every pool pair meets exactly once.
  for (const p of t.pools) for (const pool of p.pools) for (let i = 0; i < pool.teams.length; i++) for (let j = i + 1; j < pool.teams.length; j++) {
    const a = `${p.division}/${pool.teams[i]}`, b = `${p.division}/${pool.teams[j]}`;
    const n = t.games.filter((g) => !g.knockout && g.teams.includes(a) && g.teams.includes(b)).length;
    const left = (t.unplaced || []).filter((u) => u.division === p.division && !/^(SF|QF|Final|3rd|Round)/.test(u.stage) && [u.home, u.away].includes(pool.teams[i]) && [u.home, u.away].includes(pool.teams[j])).length;
    if (n + left !== 1) bad.push(`${a} v ${b}: ${n} games`);
  }
  return bad;
}

// Every cell goes through csvCell (calc.mjs), the formula-injection guard: a cell starting =, +, -, @,
// tab or CR gets an apostrophe, so a team name never runs as a spreadsheet formula.
const COLS = ["Date", "Day", "Start", "End", "Field", "Division", "Stage", "Home", "Away"];
export function tournamentCsv(t, team = null) {
  const rows = t.games.filter((g) => !team || g.teams.includes(team)).map((g) => [g.date, g.dayLabel.slice(0, 3), g.start, g.end, g.field, g.division, g.stage, g.home, g.away]);
  return [COLS, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function tournamentText(t) {
  const out = [];
  let lastDay = -1;
  for (const g of t.games) {
    if (g.dayIndex !== lastDay) { out.push("", g.dayLabel); lastDay = g.dayIndex; }
    out.push(`${g.start}-${g.end}  ${g.field.padEnd(10)}  ${g.division}  ${g.stage}: ${g.home} v ${g.away}`);
  }
  if (t.unplaced.length) out.push("", "Not placed:", ...t.unplaced.map((u) => `${u.division} ${u.stage}: ${u.home} v ${u.away} (${u.why})`));
  return out.join("\n").trim() + "\n";
}

/** Field-by-time grid per day: { day, times: [hh:mm], rows: [{ time, cells: [game|null per field] }] }. */
export function tournamentGrid(t) {
  return t.days.map((day, di) => {
    const mine = t.games.filter((g) => g.dayIndex === di);
    const times = [...new Set(mine.map((g) => g.start))].sort();
    return { day: day.label, fields: t.fields.map((f) => f.name), rows: times.map((time) => ({ time, cells: t.fields.map((f) => mine.find((g) => g.start === time && g.field === f.name) || null) })) };
  });
}

/** Parse every box of the page (or CLI JSON) and build. Errors from any box come back together. */
export function tournamentFromText({ days: dText, fields: fText, divisions: vText, limits = "", coaches = "", buffer = 10, rest = 60, maxPerDay = 3, minutes = 60, tries = 120, seed = 1 }) {
  const d = parseDays(dText);
  const f = parseFields(fText, d.days);
  const v = parseDivisions(vText, d.days, { rest: Number(rest), maxPerDay: Number(maxPerDay), minutes: Number(minutes) });
  const l = parseTeamLimits(limits, d.days, v.divisions);
  const c = parseCoachGroups(coaches, v.divisions);
  const errors = [...d.errors, ...f.errors, ...v.errors, ...l.errors, ...c.errors];
  if (!Number.isFinite(Number(buffer)) || buffer < 0 || buffer > 120) errors.push("Turnover between games must be 0 to 120 minutes.");
  if (errors.length) return { errors };
  return buildTournament({ days: d.days, fields: f.fields, divisions: v.divisions, windows: l.windows, coachGroups: c.groups, buffer: Number(buffer), tries, seed });
}

export const SAMPLE = {
  days: "Sat 2027-05-15 08:00-18:00\nSun 2027-05-16 08:00-15:00",
  fields: "Field 1: 9v9, 11v11\nField 2: 9v9, 11v11\nField 3: 7v7, 9v9\nField 4: 7v7; closed Sun 12:00-15:00",
  divisions: `U10 Girls: 50 min, 7v7, pools of 4, top 4
Riverside Rapids
North Hills Hawks
Lakeview Lightning
Eastside Eagles
Westfield Wildcats
Cedar Park Comets
Oakdale Otters
Pine Ridge Panthers

U12 Boys: 60 min, 9v9, pools of 3, top 4, 3rd place
North Hills Hawks
Riverside Rapids
Valley United
Lakeview Lightning
Harbor City FC
Summit Strikers

U14 Boys: 70 min, 11v11, one pool, top 2, knockouts Sun
Valley United
Harbor City FC
Summit Strikers
Eastside Eagles
Granite Bay Galaxy`,
  limits: "U14 Boys/Granite Bay Galaxy: not before Sat 11:00\nU10 Girls/Pine Ridge Panthers: not after Sun 13:00",
  coaches: "U10 Girls/North Hills Hawks, U12 Boys/North Hills Hawks\nU12 Boys/Valley United, U14 Boys/Valley United",
};

// CLI: node tournament.mjs spec.json  (keys as tournamentFromText; with no file, the sample)
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv?.[1]}`) {
  const { readFileSync } = await import("node:fs");
  const spec = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : SAMPLE;
  const t = tournamentFromText(spec);
  if (t.errors) { console.error(t.errors.join("\n")); process.exit(1); }
  process.stdout.write(process.argv.includes("--csv") ? tournamentCsv(t) : tournamentText(t));
  for (const w of t.warnings) console.error(`warning: ${w}`);
  const v = validateTournament(t);
  console.error(`${t.games.length} games placed, ${t.unplaced.length} not placed; finish ${t.finish}; check: ${v.length ? v.join("; ") : "clean"}`);
}
