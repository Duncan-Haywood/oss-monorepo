// Shift roster builder: assign named people to the shifts you need covered.
// Hard rules (availability, weekly hour cap, rest between shifts, consecutive
// days, no double-booking) are never broken; everything else is a cost in
// dollars that a seeded simulated-annealing search minimises. Pure functions,
// no DOM, no network, no randomness except a fixed-seed generator, so the same
// input always gives the same roster.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ALIASES = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};
const BIG = 100000; // dollars per uncovered hour: covering a shift always beats saving money
const MAX_SLOTS = 400;
const MAX_STAFF = 60;

export function dayIndex(tok) {
  const v = ALIASES[String(tok).trim().toLowerCase()];
  return v === undefined ? -1 : v;
}

// "Mon-Fri", "Mon/Wed/Fri", "Fri-Mon" (wraps), "daily". Returns [] when unreadable.
export function parseDaySpec(spec) {
  const s = String(spec).trim().toLowerCase();
  if (s === "all" || s === "daily" || s === "every day" || s === "everyday" || s === "*") return [0, 1, 2, 3, 4, 5, 6];
  const out = [];
  for (const part of s.split(/[\/&+]|\s+and\s+/)) {
    const p = part.trim();
    if (!p) continue;
    const range = p.split(/\s*(?:-|–|—)\s*/);
    if (range.length === 1) {
      const d = dayIndex(range[0]);
      if (d < 0) return [];
      if (!out.includes(d)) out.push(d);
    } else if (range.length === 2) {
      const a = dayIndex(range[0]), b = dayIndex(range[1]);
      if (a < 0 || b < 0) return [];
      for (let d = a; ; d = (d + 1) % 7) {
        if (!out.includes(d)) out.push(d);
        if (d === b) break;
      }
    } else return [];
  }
  return out;
}

// "9", "9:30", "9am", "5pm", "17:30", "24" -> minutes after midnight, NaN if unreadable.
export function parseTime(tok) {
  const m = String(tok).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return NaN;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  const ap = m[3];
  if (min > 59) return NaN;
  if (ap) {
    if (h < 1 || h > 12) return NaN;
    if (h === 12) h = 0;
    if (ap[0] === "p") h += 12;
  } else if (h > 24 || (h === 24 && min !== 0)) return NaN;
  return h * 60 + min;
}

function parseRange(text) {
  const m = String(text).trim().match(/^(.+?)\s*(?:-|–|—|\bto\b)\s*(.+)$/i);
  if (!m) return null;
  const a = parseTime(m[1]), b = parseTime(m[2]);
  return Number.isNaN(a) || Number.isNaN(b) ? null : [a, b];
}

export function fmtClock(minuteOfDay) {
  const m = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12}${ap}` : `${h12}:${String(mm).padStart(2, "0")}${ap}`;
}

export const money = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const money2 = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: d });

function splitLine(line) {
  return (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
}

// Availability text: "Mon-Fri 9-17; Sat 10-14; Sun off". Empty or "any" means always free.
// Days that are not listed are unavailable. A day may be listed twice for a split window.
export function parseAvailability(text) {
  const t = String(text || "").trim();
  const days = Array.from({ length: 7 }, () => []);
  const errors = [];
  if (t === "" || /^(any|always|all|open|anytime)$/i.test(t)) {
    for (let d = 0; d < 7; d++) days[d].push([0, 1440]);
    return { days, errors, any: true };
  }
  for (const tok of t.split(/;|\|/)) {
    const part = tok.trim();
    if (!part) continue;
    const sp = part.search(/\s/);
    const daySpec = sp < 0 ? part : part.slice(0, sp);
    const rest = sp < 0 ? "" : part.slice(sp).trim();
    const ds = parseDaySpec(daySpec);
    if (!ds.length) { errors.push(`could not read the days in "${part}"`); continue; }
    if (/^(off|no|n\/a|unavailable|none|-)$/i.test(rest)) continue;
    if (rest === "" || /^(any|all day|anytime|free)$/i.test(rest)) { for (const d of ds) days[d].push([0, 1440]); continue; }
    const r = parseRange(rest);
    if (!r) { errors.push(`could not read the hours in "${part}"`); continue; }
    if (r[1] <= r[0]) { errors.push(`"${part}": the end must be after the start (use 24 for midnight)`); continue; }
    for (const d of ds) days[d].push(r);
  }
  return { days, errors, any: false };
}

// Roles: "roles: cook|server" on a person, "role: cook" on a shift (lower-cased, matched exactly).
const ROLE_CELL = /^roles?\s*:/i;
const FIXED_CELL = /^(fixed|pin|pinned)\s*:/i;
const parseFixed = (cell) => cell.replace(FIXED_CELL, "").split(/[|/&+]/).map((r) => r.trim()).filter(Boolean);
const parseRoles = (cell) => cell.replace(ROLE_CELL, "").split(/[|/&+]/).map((r) => r.trim().toLowerCase()).filter(Boolean);

// "prev: Sun 10pm" = when this person's last shift LAST week ended, so the rest rule also holds across the week boundary.
// Stored as minutes relative to this week's Monday 00:00 (negative). A time after 24:00 ("Sun 1am" is read as Sun 01:00).
const PREV_CELL = /^prev(ious)?\s*:/i;
function parsePrevEnd(cell) {
  const m = cell.replace(PREV_CELL, "").trim().match(/^(\S+)\s+(.+)$/);
  if (!m) return null;
  const d = dayIndex(m[1]);
  let t = parseTime(m[2]);
  // "Sun 25:00" = 1am Monday: an overnight shift that ran past midnight (written by carryOverStaff).
  const late = /^(2[4-9]|30):([0-5]\d)$/.exec(m[2].trim());
  if (Number.isNaN(t) && late) t = Number(late[1]) * 60 + Number(late[2]);
  if (d < 0 || Number.isNaN(t)) return null;
  return (d - 7) * 1440 + t;
}

// "off: Wed; Fri 5pm-close" = time off this week only. Whole days or a clock range are removed from the person's
// availability, so a standing pattern ("any", "Mon-Fri 9-17") does not have to be rewritten each week.
const DAILY_CELL = /^(daily|max[ -]?daily)\s*:/i;
const OFF_CELL = /^(off|time[ -]?off|pto)\s*:/i;
// "avoid: Sat; Fri 5pm-close" = a soft preference. Those hours stay allowed (unlike off:), but the search treats
// each hour worked inside them as a cost, so they are used only when it saves money or covers a shift nobody else can.
const AVOID_CELL = /^(avoid|rather[ -]?not)\s*:/i;
// "prefer: Sat; Fri 5pm-close" = the mirror image: hours the person would like. Each hour worked inside them earns a small
// bonus in the search, so they are used first among otherwise equal choices, and never at the cost of a shift left open.
const PREFER_CELL = /^(prefer|would[ -]?like|extra[ -]?hours)\s*:/i;
const AGE_CELL = /^age\s*:/i;
const SUPERVISED_CELL = /^(minor|supervised|needs[ -]?supervision)$/i;
// "seniority: 3" = rank for the seniority report (higher = more senior). Not a search rule: `seniorityClaims` lists shifts a
// more senior person could have taken with every hard rule still holding.
const SENIORITY_CELL = /^seniority\s*:/i;
const TOUGH_CELL = /^(tough|recent[ -]?tough)\s*:/i;
// "streak: 4" = days worked in a row up to and including last Sunday, so the days-in-a-row limit also holds across
// Monday (written by carryOverStaff). Without it the search starts every week from zero.
const STREAK_CELL = /^(streak|days[ -]?in[ -]?a[ -]?row)\s*:/i;
function parseAvoid(text, label = "avoid") {
  const errors = [], avoid = Array.from({ length: 7 }, () => []);
  for (const tok of String(text).split(/;|\|/)) {
    const part = tok.trim();
    if (!part) continue;
    const sp = part.search(/\s/);
    const ds = parseDaySpec(sp < 0 ? part : part.slice(0, sp));
    if (!ds.length) { errors.push(`could not read the days in "${label}: ${part}"`); continue; }
    const rest = sp < 0 ? "" : part.slice(sp).trim();
    let r = [0, 1440];
    if (rest !== "" && !/^(all day|any)$/i.test(rest)) {
      r = parseRange(rest.replace(/\bclose\b/i, "24").replace(/\bopen\b/i, "0"));
      if (!r || r[1] <= r[0]) { errors.push(`could not read the hours in "${label}: ${part}"`); continue; }
    }
    for (const d of ds) avoid[d].push(r);
  }
  return { avoid, errors };
}
// Minutes of slot `s` that fall inside the person's avoid windows (an overnight tail counts on the next day).
function avoidMinutes(person, s, key = "avoid") {
  if (!person[key]) return 0;
  const hit = (d, a, b) => person[key][d % 7].reduce((t, [x, y]) => t + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  let m = hit(s.day, s.startMin, Math.min(s.endMin, 1440));
  if (s.endMin > 1440) m += hit(s.day + 1, 0, s.endMin - 1440);
  return m;
}
function subtractRange(ranges, [a, b]) {
  const out = [];
  for (const [x, y] of ranges) {
    if (b <= x || a >= y) { out.push([x, y]); continue; }
    if (a > x) out.push([x, a]);
    if (b < y) out.push([b, y]);
  }
  return out;
}
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const utcDay = (iso) => { const m = ISO_DATE.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN; };

// "2026-11-04" or "2026-11-04..2026-11-06" -> the weekday indexes (0 = Mon) that fall in the
// week starting `weekStart`; dates outside that week give []. null when the text is not a date.
function datedDays(word, weekStart) {
  const [a, b = a] = word.split("..");
  const from = utcDay(a), to = utcDay(b), base = utcDay(weekStart);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const out = [];
  for (let d = Math.max(from, base); d <= Math.min(to, base + 6); d++) out.push(d - base);
  return out;
}

// `notes` (optional array) collects dated entries skipped because no week start was given.
export function applyTimeOff(days, text, weekStart = null, notes = []) {
  const errors = [];
  for (const tok of String(text).split(/;|\|/)) {
    const part = tok.trim();
    if (!part) continue;
    const sp = part.search(/\s/);
    const word = sp < 0 ? part : part.slice(0, sp);
    let ds;
    if (/^\d{4}-\d{2}-\d{2}/.test(word)) {
      if (!ISO_DATE.test(weekStart || "")) { notes.push(`"off: ${part}" is dated and was not applied: pick the week's Monday first`); continue; }
      ds = datedDays(word, weekStart);
      if (ds === null) { errors.push(`could not read the dates in "off: ${part}"; write YYYY-MM-DD or YYYY-MM-DD..YYYY-MM-DD`); continue; }
      if (!ds.length) continue;
    } else ds = parseDaySpec(word);
    if (!ds.length) { errors.push(`could not read the days in "off: ${part}"`); continue; }
    const rest = sp < 0 ? "" : part.slice(sp).trim();
    let r = [0, 1440];
    if (rest !== "" && !/^(all day|off|any)$/i.test(rest)) {
      r = parseRange(rest.replace(/\bclose\b/i, "24").replace(/\bopen\b/i, "0"));
      if (!r || r[1] <= r[0]) { errors.push(`could not read the hours in "off: ${part}"`); continue; }
    }
    for (const d of ds) days[d] = subtractRange(days[d], r);
  }
  return errors;
}

// One person per line: name, hourly wage, max hours per week, min hours per week, availability, [roles: a|b]
export function parseStaff(text, { weekStart = null } = {}) {
  const staff = [], errors = [], notes = [];
  const lines = String(text || "").split(/\r?\n/);
  let first = true;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = splitLine(line);
    const wage = Number((c[1] || "").replace(/[$\s]/g, ""));
    if (first) { first = false; if (c.length > 1 && Number.isNaN(wage)) return; }
    const where = `Staff line ${i + 1}`;
    if (!c[0]) { errors.push(`${where}: missing name`); return; }
    if (!Number.isFinite(wage) || wage < 0 || (c[1] || "") === "") { errors.push(`${where} (${c[0]}): the hourly wage is not a number`); return; }
    const maxH = (c[2] || "") === "" ? 40 : Number(c[2]);
    const minH = (c[3] || "") === "" ? 0 : Number(c[3]);
    if (!Number.isFinite(maxH) || maxH < 0) { errors.push(`${where} (${c[0]}): max hours is not a number`); return; }
    if (!Number.isFinite(minH) || minH < 0) { errors.push(`${where} (${c[0]}): min hours is not a number`); return; }
    if (staff.some((s) => s.name.toLowerCase() === c[0].toLowerCase())) { errors.push(`${where}: "${c[0]}" is listed twice`); return; }
    const tail = c.slice(4);
    const roles = tail.filter((x) => ROLE_CELL.test(x)).flatMap(parseRoles);
    let prevEnd = null;
    const prevCell = tail.find((x) => PREV_CELL.test(x));
    if (prevCell) {
      prevEnd = parsePrevEnd(prevCell);
      if (prevEnd === null) errors.push(`${where} (${c[0]}): could not read "${prevCell}"; write it like "prev: Sun 10pm" (when their last shift last week ended)`);
    }
    let maxDaily = 0;
    const dailyCell = tail.find((x) => DAILY_CELL.test(x));
    if (dailyCell) {
      maxDaily = Number(dailyCell.replace(DAILY_CELL, "").replace(/h(ours?)?$/i, "").trim());
      if (!Number.isFinite(maxDaily) || maxDaily <= 0) { errors.push(`${where} (${c[0]}): could not read "${dailyCell}"; write it like "daily: 8" (most hours in one day)`); maxDaily = 0; }
    }
    let toughBefore = 0;
    const toughCell = tail.find((x) => TOUGH_CELL.test(x));
    if (toughCell) {
      toughBefore = Number(toughCell.replace(TOUGH_CELL, "").trim());
      if (!Number.isFinite(toughBefore) || toughBefore < 0) { errors.push(`${where} (${c[0]}): could not read "${toughCell}"; write it like "tough: 3" (weekend, closing and opening shifts worked recently)`); toughBefore = 0; }
    }
    let streakBefore = 0;
    const streakCell = tail.find((x) => STREAK_CELL.test(x));
    if (streakCell) {
      streakBefore = Number(streakCell.replace(STREAK_CELL, "").trim());
      if (!Number.isInteger(streakBefore) || streakBefore < 0) { errors.push(`${where} (${c[0]}): could not read "${streakCell}"; write it like "streak: 4" (days worked in a row up to last Sunday)`); streakBefore = 0; }
    }
    let seniority = null;
    const senCell = tail.find((x) => SENIORITY_CELL.test(x));
    if (senCell) {
      seniority = Number(senCell.replace(SENIORITY_CELL, "").trim());
      if (!Number.isFinite(seniority)) { errors.push(`${where} (${c[0]}): could not read "${senCell}"; write it like "seniority: 3" (higher = more senior)`); seniority = null; }
    }
    const isExtra = (x) => SENIORITY_CELL.test(x) || STREAK_CELL.test(x) || ROLE_CELL.test(x) || PREV_CELL.test(x) || OFF_CELL.test(x) || DAILY_CELL.test(x) || AVOID_CELL.test(x) || PREFER_CELL.test(x) || TOUGH_CELL.test(x) || SUPERVISED_CELL.test(x) || AGE_CELL.test(x);
    const avoidCells = tail.filter((x) => AVOID_CELL.test(x));
    const av2 = parseAvoid(avoidCells.map((x) => x.replace(AVOID_CELL, "")).join(";"));
    av2.errors.forEach((e) => errors.push(`${where} (${c[0]}): ${e}`));
    const preferCells = tail.filter((x) => PREFER_CELL.test(x));
    const pf2 = parseAvoid(preferCells.map((x) => x.replace(PREFER_CELL, "")).join(";"), "prefer");
    pf2.errors.forEach((e) => errors.push(`${where} (${c[0]}): ${e}`));
    const av = parseAvailability(tail.filter((x) => !isExtra(x)).join(","));
    av.errors.forEach((e) => errors.push(`${where} (${c[0]}): ${e}`));
    for (const cell of tail.filter((x) => OFF_CELL.test(x))) {
      applyTimeOff(av.days, cell.replace(OFF_CELL, ""), weekStart, notes).forEach((e) => errors.push(`${where} (${c[0]}): ${e}`));
    }
    let age = null, maxHoursEff = maxH, maxDailyEff = maxDaily, youth = false;
    const ageCell = tail.find((x) => AGE_CELL.test(x));
    if (ageCell) {
      const m = ageCell.replace(AGE_CELL, "").trim().match(/^(\d{1,2})(?:\s+(school|summer|break))?$/i);
      if (!m) errors.push(`${where} (${c[0]}): could not read "${ageCell}"; write it like "age: 15" or "age: 15 summer"`);
      else {
        age = Number(m[1]);
        if (age < 14) errors.push(`${where} (${c[0]}): US federal law bars most non-farm work under 14, so this tool will not schedule an age-${age} worker`);
        else if (age < 16) {
          // FLSA youth rules for 14-15: 7am-7pm (9pm 1 Jun-Labor Day); school weeks 3 h on a school day and 18 h a week, otherwise 8 h a day and 40 h a week.
          const summer = /^(summer|break)$/i.test(m[2] || "");
          const [lo, hi] = [420, summer ? 1260 : 1140];
          for (let d = 0; d < 7; d++) av.days[d] = av.days[d].map(([x, y]) => [Math.max(x, lo), Math.min(y, hi)]).filter(([x, y]) => y > x);
          maxHoursEff = Math.min(maxH, summer ? 40 : 18);
          maxDailyEff = maxDaily ? Math.min(maxDaily, summer ? 8 : 3) : (summer ? 8 : 3);
          youth = true;
          notes.push(`${c[0]} (age ${age}): limited to 7am-${summer ? "9pm" : "7pm"}, ${maxDailyEff} h a day and ${maxHoursEff} h a week (US federal rules for 14-15). ${summer ? "" : "The 3 h day applies on school days; add off: for school hours. "}State and local rules can be stricter; check yours.`);
        }
      }
    }
    staff.push({ seniority, age, youth, name: c[0], wage, maxHours: maxHoursEff, minHours: Math.min(minH, maxHoursEff), roles, days: av.days, anyTime: av.any && !youth && !tail.some((x) => OFF_CELL.test(x)), prevEnd, streakBefore, maxDaily: maxDailyEff, avoid: avoidCells.length ? av2.avoid : null, prefer: preferCells.length ? pf2.avoid : null, toughBefore, supervised: tail.some((x) => SUPERVISED_CELL.test(x)) || (age !== null && age < 18) });
  });
  if (!staff.length && !errors.length) errors.push("Add at least one person.");
  if (staff.length > MAX_STAFF) errors.push(`That is ${staff.length} people; this tool handles up to ${MAX_STAFF}.`);
  return { staff, errors, notes };
}

// One requirement per line: day(s), start, end, people needed, label (optional), role (optional: sixth column or "role: x")
export function parseShifts(text) {
  const slots = [], errors = [];
  const lines = String(text || "").split(/\r?\n/);
  let first = true;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = splitLine(line);
    const where = `Shift line ${i + 1}`;
    const days = parseDaySpec(c[0] || "");
    const a = parseTime(c[1] || ""), b = parseTime(c[2] || "");
    if (first) { first = false; if (!days.length && Number.isNaN(a)) return; }
    if (!days.length) { errors.push(`${where}: could not read the day "${c[0] || ""}"`); return; }
    if (Number.isNaN(a) || Number.isNaN(b)) { errors.push(`${where}: could not read the start and end times`); return; }
    if (a === b) { errors.push(`${where}: start and end are the same`); return; }
    const count = (c[3] || "") === "" ? 1 : Number(c[3]);
    if (!Number.isInteger(count) || count < 1 || count > 50) { errors.push(`${where}: people needed must be a whole number from 1 to 50`); return; }
    const label = ROLE_CELL.test(c[4] || "") || FIXED_CELL.test(c[4] || "") ? "" : (c[4] || "");
    const roleCell = c.slice(4).find((x) => ROLE_CELL.test(x));
    const roleRaw = roleCell ? parseRoles(roleCell)[0] || "" : FIXED_CELL.test(c[5] || "") ? "" : (c[5] || "").trim().toLowerCase();
    // "role: keyholder x1" asks for one keyholder among the people needed; the other copies take anyone. No "xN" = every copy.
    const roleCount = /^(.+?)\s*[x×]\s*(\d+)$/.exec(roleRaw);
    const role = roleCount ? roleCount[1].trim() : roleRaw;
    const roleNeeded = roleCount ? Number(roleCount[2]) : count;
    if (roleCount && (roleNeeded < 1 || roleNeeded > count)) { errors.push(`${where}: "${roleRaw}" asks for ${roleNeeded} with the role but only ${count} people are needed`); return; }
    // "fixed: Sam" pins every copy to Sam; "fixed: Sam + Ana" pins copy 1 to Sam, copy 2 to Ana; extra copies stay open.
    const fixedCell = c.slice(4).find((x) => FIXED_CELL.test(x));
    const fixedNames = fixedCell ? parseFixed(fixedCell) : [];
    if (fixedCell && !fixedNames.length) { errors.push(`${where}: "fixed:" needs a name`); return; }
    for (const d of days) for (let k = 0; k < count; k++) {
      const end = b <= a ? b + 1440 : b; // an end at or before the start runs overnight
      slots.push({ day: d, startMin: a, endMin: end, start: d * 1440 + a, end: d * 1440 + end, label, role: k < roleNeeded ? role : "", copy: k + 1, of: count, fixed: fixedNames[k] || "" });
    }
  });
  if (!slots.length && !errors.length) errors.push("Add at least one shift to cover.");
  if (slots.length > MAX_SLOTS) errors.push(`That is ${slots.length} shifts to fill; this tool handles up to ${MAX_SLOTS}.`);
  slots.sort((x, y) => x.start - y.start || x.end - y.end);
  slots.forEach((s, i) => { s.id = i; });
  return { slots, errors };
}

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

const DEFAULTS = {
  mealAfter: 0, mealMin: 30, // unpaid meal break: shifts longer than mealAfter hours lose mealMin minutes of pay (0 = off)
  splitPremium: 0, splitGap: 1, // split-shift premium: dollars owed on each day a person's shifts have a gap over splitGap hours (0 = off)
  diffWhen: "", diffPerHour: 0, diffPct: 0, // pay differential: extra $/hour and/or % of wage for hours inside the diffWhen windows ("Sat-Sun; 10pm-6am"; none = off)
  burdenPct: 0, otAfter: 40, otMult: 1.5, dailyOtAfter: 0, dailyDtAfter: 0, dtMult: 2, minRestHours: 10, maxConsecDays: 6, maxDailyHours: 0,
  exact: "auto", exactNodes: 400000, exactMs: 8000, exactTolerance: 0.5, balance: 25, toughBalance: 0, shortfallValue: 8, avoidValue: 0.5, preferValue: 0.25, seed: 1, restarts: 4, iterations: 0, longPass: true,
};

function qualified(person, slot) {
  return !slot.role || (person.roles || []).includes(slot.role);
}

function available(person, slot) {
  if (!qualified(person, slot)) return false;
  if (slot.fixed && slot.fixed.toLowerCase() !== person.name.toLowerCase()) return false;
  const first = person.days[slot.day];
  const stop = Math.min(slot.endMin, 1440);
  if (!first.some(([a, b]) => a <= slot.startMin && b >= stop)) return false;
  if (slot.endMin > 1440) {
    const next = person.days[(slot.day + 1) % 7];
    const need = slot.endMin - 1440;
    if (!next.some(([a, b]) => a <= 0 && b >= need)) return false;
  }
  return true;
}

export function buildContext(staff, slots, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const P = staff.length, S = slots.length;
  const elig = staff.map((p) => slots.map((s) => available(p, s)));
  const totalHours = slots.reduce((t, s) => t + (s.end - s.start) / 60, 0);
  const caps = staff.map((p) => Math.max(0.0001, p.maxHours));
  const capSum = caps.reduce((a, b) => a + b, 0) || 1;
  const target = staff.map((_, i) => (totalHours * caps[i]) / capSum);
  const avgWage = staff.length ? staff.reduce((t, p) => t + p.wage, 0) / staff.length : 0;
  return { o, staff, slots, P, S, elig, target, avgWage, totalHours, restMin: Math.max(0, o.minRestHours) * 60, diffMin: differentialMinutes(o, slots) };
}

// Minutes of each shift inside the differential windows, written like availability: "Sat-Sun; Mon-Fri 22-24; Tue-Sat 0-6".
// An overnight tail counts on the next day, so a Friday 10pm-6am shift gets its Saturday hours from Saturday's window.
// Returns [] when no premium is set, so the default path costs nothing.
export function differentialMinutes(o, slots) {
  if (!(o.diffPerHour > 0 || o.diffPct > 0) || !String(o.diffWhen || "").trim()) return [];
  const win = parseAvailability(o.diffWhen);
  if (win.errors.length) return [];
  const hit = (d, a, b) => win.days[d % 7].reduce((t, [x, y]) => t + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  return slots.map((s) => hit(s.day, s.startMin, Math.min(s.endMin, 1440)) + (s.endMin > 1440 ? hit(s.day + 1, 0, s.endMin - 1440) : 0));
}

// Most minutes this person may work on one day: the tighter of their own `daily:` cell and the roster-wide limit (0 = none).
function dailyCapMin(ctx, p) {
  const caps = [ctx.staff[p].maxDaily, ctx.o.maxDailyHours].filter((x) => x > 0);
  return caps.length ? Math.min(...caps) * 60 : Infinity;
}
function overDaily(ctx, p, list) {
  const cap = dailyCapMin(ctx, p);
  if (cap === Infinity) return false;
  const byDay = new Map();
  for (const i of list) {
    const s = ctx.slots[i];
    byDay.set(s.day, (byDay.get(s.day) || 0) + s.end - s.start);
  }
  return [...byDay.values()].some((m) => m > cap + 1e-9);
}

function validList(ctx, p, list) {
  const { slots, staff, restMin, o } = ctx;
  let minutes = 0, maxEnd = staff[p].prevEnd ?? -Infinity;
  const days = new Set();
  for (const i of list) {
    const s = slots[i];
    if (s.start < maxEnd + restMin) return false;
    if (s.end > maxEnd) maxEnd = s.end;
    minutes += s.end - s.start;
    days.add(s.day);
  }
  if (minutes > staff[p].maxHours * 60 + 1e-9) return false;
  if (overDaily(ctx, p, list)) return false;
  const sorted = [...days].sort((a, b) => a - b);
  const before = staff[p].streakBefore || 0;
  let run = before, prev = before > 0 ? -1 : -9;
  for (const d of sorted) {
    run = d === prev + 1 ? run + 1 : 1;
    if (run > o.maxConsecDays) return false;
    prev = d;
  }
  return true;
}

function hoursOf(ctx, list) {
  let m = 0;
  for (const i of list) m += ctx.slots[i].end - ctx.slots[i].start;
  return m / 60;
}

// Real payroll for one person (what the roster costs), and the extra "soft" penalties the search also weighs.
// Hours split into straight time, overtime and double time. Weekly overtime counts only hours not already
// paid at a daily premium (the California method). A shift counts on the day it starts.
// dailyOtAfter / dailyDtAfter of 0 turn the daily rules off, which gives the plain weekly rule.
// Minutes of a shift that are paid: an unpaid meal break comes off shifts longer than mealAfter hours.
// The shift still occupies the person for its full length (availability, rest, hour caps), only pay changes.
function paidMinutes(o, s) {
  const len = s.end - s.start;
  return o.mealAfter > 0 && len > o.mealAfter * 60 ? Math.max(0, len - Math.max(0, o.mealMin)) : len;
}
function payParts(ctx, list) {
  const { o, slots } = ctx;
  const byDay = new Map();
  for (const i of list) byDay.set(slots[i].day, (byDay.get(slots[i].day) || 0) + paidMinutes(o, slots[i]) / 60);
  let straight = 0, ot = 0, dt = 0;
  for (const h of byDay.values()) {
    let rest = h;
    if (o.dailyDtAfter > 0 && rest > o.dailyDtAfter) { dt += rest - o.dailyDtAfter; rest = o.dailyDtAfter; }
    if (o.dailyOtAfter > 0 && rest > o.dailyOtAfter) { ot += rest - o.dailyOtAfter; rest = o.dailyOtAfter; }
    straight += rest;
  }
  const weekly = Math.max(0, straight - o.otAfter);
  return { straight: straight - weekly, ot: ot + weekly, dt };
}
// Days on which this person's shifts leave a gap longer than splitGap hours (a split shift). `list` is sorted by start.
function splitDays(ctx, list) {
  const { o, slots } = ctx;
  if (!(o.splitPremium > 0) || list.length < 2) return 0;
  const lastEnd = new Map();
  const split = new Set();
  for (const i of list) {
    const s = slots[i];
    if (lastEnd.has(s.day) && (s.start - lastEnd.get(s.day)) / 60 > o.splitGap + 1e-9) split.add(s.day);
    lastEnd.set(s.day, Math.max(lastEnd.get(s.day) ?? -Infinity, s.end));
  }
  return split.size;
}
function payroll(ctx, p, list) {
  const { o, staff } = ctx;
  const q = payParts(ctx, list);
  let extra = o.splitPremium > 0 ? splitDays(ctx, list) * o.splitPremium : 0;
  if (ctx.diffMin.length) {
    let m = 0;
    for (const i of list) m += ctx.diffMin[i];
    extra += (m / 60) * (o.diffPerHour + (staff[p].wage * o.diffPct) / 100);
  }
  return (1 + o.burdenPct / 100) * (staff[p].wage * (q.straight + q.ot * o.otMult + q.dt * o.dtMult) + extra);
}
function softPenalty(ctx, p, h, list) {
  const { o, staff, target, avgWage } = ctx;
  const short = Math.max(0, staff[p].minHours - h) * o.shortfallValue;
  const fair = (o.balance / 100) * avgWage * 0.1 * (h - target[p]) ** 2;
  return short + fair + toughPenalty(ctx, p, list) + avoidPenalty(ctx, p, list) - preferBonus(ctx, p, list);
}
// A weekend, closing (10pm or later, past midnight) or opening (6am or earlier) shift is "tough", as fairnessReport counts them.
// With toughBalance > 0 the squared count per person is penalised, which spreads a fixed number of tough shifts evenly.
const toughSlot = (s) => s.day >= 5 || s.endMin >= 22 * 60 || s.endMin <= s.startMin || s.startMin <= 6 * 60;
// A person's `tough:` cell is how many tough shifts they worked in recent weeks. Penalising (before + n)^2 minus the
// constant before^2 leaves n^2 + 2*before*n, so each new tough shift costs more for someone who has had many lately.
function toughPenalty(ctx, p, list) {
  const w = ctx.o.toughBalance;
  if (!(w > 0) || !list) return 0;
  let n = 0;
  for (const i of list) if (toughSlot(ctx.slots[i])) n++;
  return (w / 100) * ctx.avgWage * (n * n + 2 * (ctx.staff[p].toughBefore || 0) * n);
}
// Each hour inside a person's avoid: window costs avoidValue x their wage, so a real saving or an otherwise-open shift outweighs it.
function avoidPenalty(ctx, p, list) {
  if (!ctx.staff[p].avoid || !list) return 0;
  let m = 0;
  for (const i of list) m += avoidMinutes(ctx.staff[p], ctx.slots[i]);
  return (m / 60) * ctx.o.avoidValue * Math.max(ctx.staff[p].wage, 1);
}
// Each hour inside a person's prefer: window earns preferValue x their wage. Smaller than the avoid cost and far below BIG.
function preferBonus(ctx, p, list) {
  if (!ctx.staff[p].prefer || !list) return 0;
  let m = 0;
  for (const i of list) m += avoidMinutes(ctx.staff[p], ctx.slots[i], "prefer");
  return (m / 60) * ctx.o.preferValue * Math.max(ctx.staff[p].wage, 1);
}
function personScore(ctx, p, list) {
  const h = hoursOf(ctx, list);
  return payroll(ctx, p, list) + softPenalty(ctx, p, h, list);
}

function insertSorted(ctx, list, i) {
  const out = list.concat(i);
  out.sort((a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b);
  return out;
}

function scoreOwner(ctx, owner) {
  const lists = Array.from({ length: ctx.P }, () => []);
  let unfilled = 0;
  owner.forEach((p, i) => {
    if (p < 0) unfilled += (ctx.slots[i].end - ctx.slots[i].start) / 60;
    else lists[p].push(i);
  });
  let total = BIG * unfilled;
  for (let p = 0; p < ctx.P; p++) {
    lists[p].sort((a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b);
    total += personScore(ctx, p, lists[p]);
  }
  return { total, lists, unfilled };
}

function ownerValid(ctx, owner) {
  const lists = Array.from({ length: ctx.P }, () => []);
  for (let i = 0; i < owner.length; i++) {
    const p = owner[i];
    if (p < 0) continue;
    if (!ctx.elig[p][i]) return false;
    lists[p].push(i);
  }
  return lists.every((l, p) => { l.sort((a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b); return validList(ctx, p, l); });
}

function anneal(ctx, seed, iterations, jitter) {
  const { P, S, slots, elig } = ctx;
  const rng = mulberry32(seed);
  const owner = new Array(S).fill(-1);
  const lists = Array.from({ length: P }, () => []);
  const pScore = lists.map((l, p) => personScore(ctx, p, l));
  const order = [...Array(S).keys()].sort((a, b) => {
    const ea = elig.reduce((t, r) => t + (r[a] ? 1 : 0), 0), eb = elig.reduce((t, r) => t + (r[b] ? 1 : 0), 0);
    return ea - eb || slots[a].start - slots[b].start;
  });
  for (const i of order) {
    let best = -1, bestD = Infinity, bestList = null;
    for (let p = 0; p < P; p++) {
      if (!elig[p][i]) continue;
      const nl = insertSorted(ctx, lists[p], i);
      if (!validList(ctx, p, nl)) continue;
      const d = personScore(ctx, p, nl) - pScore[p] + (jitter ? rng() * jitter : 0);
      if (d < bestD) { bestD = d; best = p; bestList = nl; }
    }
    if (best >= 0) { owner[i] = best; lists[best] = bestList; pScore[best] = personScore(ctx, best, bestList); }
  }
  let unfilledH = 0;
  owner.forEach((p, i) => { if (p < 0) unfilledH += (slots[i].end - slots[i].start) / 60; });
  let score = BIG * unfilledH + pScore.reduce((a, b) => a + b, 0);
  let bestScore = score, bestOwner = owner.slice();
  const avgShift = ctx.totalHours / Math.max(1, S);
  const T0 = Math.max(0.5, ctx.avgWage * avgShift * 0.4), T1 = 0.01;
  const removeFrom = (list, i) => list.filter((x) => x !== i);
  for (let it = 0; it < iterations; it++) {
    const T = T0 * (T1 / T0) ** (it / iterations);
    const i = Math.floor(rng() * S);
    const o = owner[i];
    if (rng() < 0.65) {
      const q = Math.floor(rng() * P);
      if (q === o || !elig[q][i]) continue;
      const nq = insertSorted(ctx, lists[q], i);
      if (!validList(ctx, q, nq)) continue;
      const no = o >= 0 ? removeFrom(lists[o], i) : null;
      const sq = personScore(ctx, q, nq), so = o >= 0 ? personScore(ctx, o, no) : 0;
      let delta = sq - pScore[q] + (o >= 0 ? so - pScore[o] : -BIG * ((slots[i].end - slots[i].start) / 60));
      if (delta < 0 || rng() < Math.exp(-delta / T)) {
        lists[q] = nq; pScore[q] = sq;
        if (o >= 0) { lists[o] = no; pScore[o] = so; }
        owner[i] = q; score += delta;
      }
    } else {
      const j = Math.floor(rng() * S);
      const a = owner[i], b = owner[j];
      if (a < 0 || b < 0 || a === b || !elig[a][j] || !elig[b][i]) continue;
      const na = insertSorted(ctx, removeFrom(lists[a], i), j);
      const nb = insertSorted(ctx, removeFrom(lists[b], j), i);
      if (!validList(ctx, a, na) || !validList(ctx, b, nb)) continue;
      const sa = personScore(ctx, a, na), sb = personScore(ctx, b, nb);
      const delta = sa - pScore[a] + sb - pScore[b];
      if (delta < 0 || rng() < Math.exp(-delta / T)) {
        lists[a] = na; lists[b] = nb; pScore[a] = sa; pScore[b] = sb;
        owner[i] = b; owner[j] = a; score += delta;
      }
    }
    if (score < bestScore - 1e-9) { bestScore = score; bestOwner = owner.slice(); }
  }
  return { owner: bestOwner, score: bestScore };
}

// Ejection chains, as a pass over a finished roster. Annealing moves one shift at a time, so an open shift that cannot simply be
// added (overlap, rest gap, weekly limit) stays open unless two moves happen back to back. Here an open shift goes to someone who
// gives up one of theirs for it, and that shift moves on to a third person, or stays open if it is the shorter of the two. Moves that
// cost more than they gain are taken at a falling temperature. Measured on seeded 8-person, 22-shift weeks, the open hours the search
// left fell from 63/11/105/38 to 57/4/98/35 (eval/ejection-bench.mjs). Only run while shifts are open, and only kept if the total falls.
function ejectPass(ctx, owner0, seed, iterations) {
  const { P, S, slots, elig } = ctx;
  const rng = mulberry32(seed);
  const owner = owner0.slice();
  const lists = Array.from({ length: P }, () => []);
  owner.forEach((p, i) => { if (p >= 0) lists[p] = insertSorted(ctx, lists[p], i); });
  const pScore = lists.map((l, p) => personScore(ctx, p, l));
  const hrs = (i) => (slots[i].end - slots[i].start) / 60;
  const removeFrom = (list, i) => list.filter((x) => x !== i);
  let score = pScore.reduce((a, b) => a + b, 0) + BIG * owner.reduce((t, p, i) => t + (p < 0 ? hrs(i) : 0), 0);
  let bestScore = score, bestOwner = owner.slice();
  const T0 = Math.max(0.5, ctx.avgWage * (ctx.totalHours / Math.max(1, S)) * 0.4), T1 = 0.01;
  for (let it = 0; it < iterations; it++) {
    const open = [];
    owner.forEach((p, i) => { if (p < 0) open.push(i); });
    if (!open.length) break;
    const T = T0 * (T1 / T0) ** (it / iterations);
    const i = open[Math.floor(rng() * open.length)];
    const q = Math.floor(rng() * P);
    if (!elig[q][i] || !lists[q].length) continue;
    const j = lists[q][Math.floor(rng() * lists[q].length)];
    const nq = insertSorted(ctx, removeFrom(lists[q], j), i);
    if (!validList(ctx, q, nq)) continue;
    const r = Math.floor(rng() * P);
    let nr = null;
    if (r !== q && elig[r][j]) { nr = insertSorted(ctx, lists[r], j); if (!validList(ctx, r, nr)) nr = null; }
    const sq = personScore(ctx, q, nq);
    let delta = sq - pScore[q] - BIG * hrs(i), sr = 0;
    if (nr) { sr = personScore(ctx, r, nr); delta += sr - pScore[r]; } else delta += BIG * hrs(j);
    if (delta < 0 || rng() < Math.exp(-delta / T)) {
      lists[q] = nq; pScore[q] = sq; owner[i] = q;
      if (nr) { lists[r] = nr; pScore[r] = sr; owner[j] = r; } else owner[j] = -1;
      score += delta;
      if (score < bestScore - 1e-9) { bestScore = score; bestOwner = owner.slice(); }
    }
  }
  return bestOwner;
}

// Coverage plateau search. Pay only breaks ties in the passes above, so a roster one hour short of the proven floor can sit in a
// region where no single chain frees the hour without first undoing a cheap assignment. Here only open hours count: shifts move
// between people freely when that costs no coverage (a walk across the plateau), open shifts are pulled in by ejection chains, and
// a worse step is taken at a falling temperature. The result is then polished for pay with moves that never lose coverage.
function coverPass(ctx, owner0, seed, iterations) {
  const { P, S, slots, elig } = ctx;
  const rng = mulberry32(seed);
  const owner = owner0.slice();
  const lists = Array.from({ length: P }, () => []);
  owner.forEach((p, i) => { if (p >= 0) lists[p] = insertSorted(ctx, lists[p], i); });
  const hrs = (i) => (slots[i].end - slots[i].start) / 60;
  const removeFrom = (list, i) => list.filter((x) => x !== i);
  let open = owner.reduce((t, p, i) => t + (p < 0 ? hrs(i) : 0), 0);
  let bestOpen = open, bestOwner = owner.slice();
  for (let it = 0; it < iterations && bestOpen > 0; it++) {
    const T = 0.6 * (0.05 / 0.6) ** (it / iterations);
    if (rng() < 0.5) {
      const openIdx = [];
      owner.forEach((p, i) => { if (p < 0) openIdx.push(i); });
      if (!openIdx.length) break;
      const i = openIdx[Math.floor(rng() * openIdx.length)];
      const q = Math.floor(rng() * P);
      if (!elig[q][i]) continue;
      let nq = insertSorted(ctx, lists[q], i);
      let j = -1, nr = null, r = -1;
      if (!validList(ctx, q, nq)) {
        if (!lists[q].length) continue;
        j = lists[q][Math.floor(rng() * lists[q].length)];
        nq = insertSorted(ctx, removeFrom(lists[q], j), i);
        if (!validList(ctx, q, nq)) continue;
        r = Math.floor(rng() * P);
        if (r !== q && elig[r][j]) { nr = insertSorted(ctx, lists[r], j); if (!validList(ctx, r, nr)) nr = null; }
      }
      const d = -hrs(i) + (j >= 0 && !nr ? hrs(j) : 0);
      if (d <= 0 || rng() < Math.exp(-d / T)) {
        lists[q] = nq; owner[i] = q;
        if (j >= 0) { if (nr) { lists[r] = nr; owner[j] = r; } else owner[j] = -1; }
        open += d;
      }
    } else {
      const i = Math.floor(rng() * S), o = owner[i];
      if (o < 0) continue;
      const q = Math.floor(rng() * P);
      if (q === o || !elig[q][i]) continue;
      const nq = insertSorted(ctx, lists[q], i);
      if (!validList(ctx, q, nq)) continue;
      lists[q] = nq; lists[o] = removeFrom(lists[o], i); owner[i] = q;
    }
    if (open < bestOpen - 1e-9) { bestOpen = open; bestOwner = owner.slice(); }
  }
  return { owner: bestOwner, open: bestOpen };
}

// Exact repair of the open hours (large-neighbourhood search). Pick k people, release every shift they hold, and solve the
// released shifts plus the open ones exactly for fewest open hours with everyone else fixed (depth-first, longest shift first,
// pruned on the open hours so far). A walk of single moves cannot reach a gain that needs three people to change at once; this
// can, inside the neighbourhood. Time-limited; returns the owner array and the open hours (never worse than the input).
function coverRepair(ctx, owner0, seed, { k = 3, rounds = 40, nodeLimit = 200000, totalNodes = 3000000, timeLimitMs = 60000, shiftWeight = 1e-6 } = {}) {
  const { P, S, slots, elig } = ctx;
  const rng = mulberry32(seed);
  const hrs = (i) => (slots[i].end - slots[i].start) / 60;
  const owner = owner0.slice();
  const TIE = shiftWeight; // hours-equivalent cost of one open shift; the default is a count term far below one minute (fewest open shifts at equal open hours)
  const openOf = (o) => o.reduce((t, p, i) => t + (p < 0 ? hrs(i) + TIE : 0), 0);
  let open = openOf(owner);
  const t0 = Date.now();
  let spent = 0; // a node budget, not the clock, ends the search, so the same input gives the same roster on any machine
  for (let r = 0; r < rounds && open > 0 && spent < totalNodes && Date.now() - t0 < timeLimitMs; r++) {
    const pick = new Set();
    while (pick.size < Math.min(k, P)) pick.add(Math.floor(rng() * P));
    const people = [...pick];
    const free = [];
    owner.forEach((p, i) => { if (p < 0 || pick.has(p)) free.push(i); });
    free.sort((a, b) => hrs(b) - hrs(a));
    const lists = Array.from({ length: P }, () => []);
    owner.forEach((p, i) => { if (p >= 0 && !pick.has(p)) lists[p] = insertSorted(ctx, lists[p], i); });
    let best = Infinity, bestAssign = null, nodes = 0;
    const cur = new Array(free.length).fill(-1);
    const dfs = (d, o) => {
      if (o >= best - 1e-9 || nodes++ > nodeLimit) return;
      if (d === free.length) { best = o; bestAssign = cur.slice(); return; }
      const i = free[d];
      for (const q of people) {
        if (!elig[q][i]) continue;
        const nl = insertSorted(ctx, lists[q], i);
        if (!validList(ctx, q, nl)) continue;
        const old = lists[q]; lists[q] = nl; cur[d] = q;
        dfs(d + 1, o);
        lists[q] = old;
      }
      cur[d] = -1;
      dfs(d + 1, o + hrs(i) + TIE);
    };
    dfs(0, 0);
    spent += nodes;
    if (bestAssign && best < open - 1e-9) {
      free.forEach((i, d) => { owner[i] = bestAssign[d]; });
      open = best;
    }
  }
  const shifts = owner.reduce((t, p) => t + (p < 0 ? 1 : 0), 0);
  return { owner, open: open - TIE * shifts, openShifts: shifts };
}

// Single moves and swaps that lower the score and never leave a shift open that was covered.
function polishPay(ctx, owner0, seed, iterations) {
  const { P, S, elig } = ctx;
  const rng = mulberry32(seed);
  const owner = owner0.slice();
  const lists = Array.from({ length: P }, () => []);
  owner.forEach((p, i) => { if (p >= 0) lists[p] = insertSorted(ctx, lists[p], i); });
  const pScore = lists.map((l, p) => personScore(ctx, p, l));
  const removeFrom = (list, i) => list.filter((x) => x !== i);
  for (let it = 0; it < iterations; it++) {
    const i = Math.floor(rng() * S), o = owner[i];
    if (o < 0) continue;
    if (rng() < 0.5) {
      const q = Math.floor(rng() * P);
      if (q === o || !elig[q][i]) continue;
      const nq = insertSorted(ctx, lists[q], i);
      if (!validList(ctx, q, nq)) continue;
      const no = removeFrom(lists[o], i), sq = personScore(ctx, q, nq), so = personScore(ctx, o, no);
      if (sq + so < pScore[q] + pScore[o] - 1e-9) { lists[q] = nq; lists[o] = no; pScore[q] = sq; pScore[o] = so; owner[i] = q; }
    } else {
      const j = Math.floor(rng() * S), b = owner[j];
      if (b < 0 || b === o || !elig[o][j] || !elig[b][i]) continue;
      const na = insertSorted(ctx, removeFrom(lists[o], i), j), nb = insertSorted(ctx, removeFrom(lists[b], j), i);
      if (!validList(ctx, o, na) || !validList(ctx, b, nb)) continue;
      const sa = personScore(ctx, o, na), sb = personScore(ctx, b, nb);
      if (sa + sb < pScore[o] + pScore[b] - 1e-9) { lists[o] = na; lists[b] = nb; pScore[o] = sa; pScore[b] = sb; owner[i] = b; owner[j] = o; }
    }
  }
  return owner;
}

function search(ctx, restarts, iterations, first = 0) {
  let best = null;
  for (let r = first; r < first + restarts; r++) {
    const res = anneal(ctx, ctx.o.seed + r * 7919, iterations, r === 0 ? 0 : ctx.avgWage * 0.6);
    const re = scoreOwner(ctx, res.owner); // recompute exactly: the running total drifts by float error
    if (!best || re.total < best.score - 1e-9) best = { owner: res.owner, score: re.total };
  }
  return best;
}

// Exact search for small problems: branch and bound over "who takes each shift, or nobody", with a lower bound built only from
// parts of the score that cannot fall as shifts are added (pay at the straight rate and overtime already earned, avoid and tough
// penalties) plus the cheapest possible pay for every shift still undecided and the smallest the convex hours terms (minimum
// hours, balance) can reach. Hard rules are monotone (a superset of a broken list is broken), so a branch that breaks one is cut.
// Seeded with the annealed score as the incumbent. `proven` is true only when the tree was exhausted inside the node and time
// limits, so the result is then the true optimum and the annealing gap is exact; otherwise `rootBound` is the bound at the root.
// "auto" runs the exact search by itself on weeks this small, where it finishes in well under a second; 150 random 5-10 shift weeks
// had the quick search beaten in 38 (each by covering more hours) before this was on by default.
const EXACT_AUTO_SLOTS = 14;
const TANGENTS = 8; // tangent lines under each person's hours curve inside the coverage flow
function exactSearch(ctx, incumbent, { nodeLimit = 400000, timeLimitMs = 8000, tolerance = 0 } = {}) {
  let coverNodes = 0;
  const { P, S, slots, staff, o, elig } = ctx;
  const mono = o.otMult >= 1 && o.dtMult >= 1;
  const mFloor = Math.min(1, o.otMult, o.dtMult);
  const burden = 1 + o.burdenPct / 100;
  const len = slots.map((s) => (s.end - s.start) / 60);
  const cheapest = slots.map((s, i) => {
    let m = Infinity;
    for (let p = 0; p < P; p++) if (elig[p][i]) m = Math.min(m, burden * staff[p].wage * mFloor * paidMinutes(o, s) / 60);
    return m === Infinity ? 0 : m; // nobody can take it: it stays open, which the coverage bound already charges
  });
  const maxRate = Math.max(0, ...cheapest.map((c, i) => c / len[i]));
  const order = [...Array(S).keys()].sort((a, b) => {
    const ea = elig.reduce((t, r) => t + (r[a] ? 1 : 0), 0), eb = elig.reduce((t, r) => t + (r[b] ? 1 : 0), 0);
    return ea - eb || slots[a].start - slots[b].start;
  });
  // suffix tables: from position k on, the hours (and prefer-window hours) each person could still take
  const sufHours = Array.from({ length: S + 1 }, () => new Array(P).fill(0));
  const sufPrefer = Array.from({ length: S + 1 }, () => new Array(P).fill(0));
  const sufCheap = new Array(S + 1).fill(0);
  for (let k = S - 1; k >= 0; k--) {
    const i = order[k];
    sufCheap[k] = sufCheap[k + 1] + cheapest[i];
    for (let p = 0; p < P; p++) {
      sufHours[k][p] = sufHours[k + 1][p] + (elig[p][i] ? len[i] : 0);
      sufPrefer[k][p] = sufPrefer[k + 1][p] + (elig[p][i] && staff[p].prefer ? avoidMinutes(staff[p], slots[i], "prefer") / 60 : 0);
    }
  }
  // Smallest value of the convex hours terms (shortfall + balance) for hours anywhere in [h0, h1].
  const gMin = (p, h0, h1) => {
    const a = o.shortfallValue, c = (o.balance / 100) * ctx.avgWage * 0.1, t = ctx.target[p], m = staff[p].minHours;
    const g = (h) => a * Math.max(0, m - h) + c * (h - t) ** 2;
    const clamp = (h) => Math.min(h1, Math.max(h0, h));
    let best = Math.min(g(h0), g(h1), g(clamp(t)), g(clamp(m)));
    if (c > 0) best = Math.min(best, g(clamp(t + a / (2 * c))));
    return best;
  };
  // Symmetry: people who differ only by name (same wage, limits, availability, preferences, history) are interchangeable, so when
  // two of them hold exactly the same shifts, giving the next shift to either leads to mirror-image subtrees and only one is tried.
  const cls = staff.map((p, q) => JSON.stringify([{ ...p, name: 0 }, elig[q], ctx.target[q]]));
  const lists = Array.from({ length: P }, () => []);
  const owner = new Array(S).fill(-1);
  let minOpenH = 0; // least hours that must stay open, once the coverage pass has proven it
  let covMode = false; // coverage-first pass: only the hours left open count
  const lowerBound = (k, unfilledH, cutoff = Infinity) => {
    if (covMode) return coverBound(k, unfilledH, cutoff);
    let lb = BIG * unfilledH, capacity = 0, gSum = 0;
    for (let p = 0; p < P; p++) {
      const L = lists[p], h = hoursOf(ctx, L);
      let pay = 0;
      if (mono) { const q = payParts(ctx, L); pay = burden * staff[p].wage * (q.straight + q.ot * o.otMult + q.dt * o.dtMult); }
      const h1 = Math.max(h, Math.min(staff[p].maxHours, h + sufHours[k][p]));
      lo0[p] = h; hi0[p] = h1;
      const g0 = gMin(p, h, h1);
      gSum += g0;
      let lo = pay + avoidPenalty(ctx, p, L) + toughPenalty(ctx, p, L) + g0;
      if (staff[p].prefer) {
        let pm = 0;
        for (const i of L) pm += avoidMinutes(staff[p], slots[i], "prefer");
        lo -= (pm / 60 + sufPrefer[k][p]) * o.preferValue * Math.max(staff[p].wage, 1);
      }
      lb += lo;
      capacity += Math.max(0, Math.min(staff[p].maxHours, h + sufHours[k][p]) - h);
      hoursLeft[p] = Math.max(0, staff[p].maxHours - h);
    }
    // Weekly hour limits can force hours open: whatever the people still free cannot absorb costs BIG, which dwarfs any pay.
    // Counting only total capacity ignores who can work which shift; a max flow from the undecided shifts (their hours) to the
    // people (the weekly hours they have left), along who is available, is the most that could still be covered.
    let demand = 0;
    for (let j = k; j < S; j++) demand += len[order[j]];
    // The flow is the dear part of a node. The bound without it (open hours from total capacity alone) is already a valid bound,
    // so when it reaches the cutoff the branch is cut without building the graph.
    const openCap = Math.max(0, demand - capacity);
    if (lb + BIG * openCap + Math.max(0, sufCheap[k] - openCap * maxRate) >= cutoff) return Infinity;
    const cov = coverableHours(k, hoursLeft);
    const flowOpen = Math.max(0, demand - capacity, demand - cov.flow);
    const open = Math.max(flowOpen, minOpenH - unfilledH);
    // cov.cost and cov.joint price covering the most hours the flow can; when the coverage pass forces more hours open than that,
    // fewer hours get covered and those prices can overstate, so they are used only when the open hours are the flow's own.
    const flowPriced = open <= flowOpen + 1e-9;
    // The shifts that have to stay open are not paid for, so take back at most the dearest rate per hour for each forced open hour.
    // gSum lets every person sit at their own best hours. The covered hours are fixed in total, so they cannot all do that.
    const coupled = coupledHours(demand - open, gSum);
    const apart = lb + coupled - gSum + BIG * open + Math.max(0, sufCheap[k] - open * maxRate, flowPriced ? cov.cost : 0);
    // With the hours terms inside the flow, who can work when and how far each person's hours sit from their target are priced
    // together: the cheapest way to cover the most hours, pay and the convex terms both, is the bound.
    return cov.joint === undefined || !flowPriced ? apart : Math.max(apart, lb - gSum + cov.joint + BIG * open);
  };
  // Least hours that must stay open (BIG each) given the decided shifts: total capacity first, the flow only if that does not cut.
  const coverBound = (k, unfilledH, cutoff) => {
    let capacity = 0, demand = 0;
    for (let p = 0; p < P; p++) {
      const h = hoursOf(ctx, lists[p]);
      capacity += Math.max(0, Math.min(staff[p].maxHours, h + sufHours[k][p]) - h);
      hoursLeft[p] = Math.max(0, staff[p].maxHours - h);
    }
    for (let j = k; j < S; j++) demand += len[order[j]];
    const base = BIG * unfilledH;
    const openCap = Math.max(0, demand - capacity);
    if (base + BIG * openCap >= cutoff) return Infinity;
    return base + BIG * Math.max(openCap, minOpenH - unfilledH, demand - coverableHours(k, hoursLeft, true).flow);
  };
  // Lagrangian bound on the convex hours terms when the undecided shifts add at most `x` hours in all: for any price lam,
  // sum_p min_h [g_p(h) - lam (h - h0_p)] + lam x is a lower bound on the least total (weak duality), and an open hour costs
  // BIG > lam, so taking all x hours is the cheapest case. A negative lam prices hours as too many to place. lam = 0 gives gSum back; the
  // best lam is found by ternary search.
  const lo0 = new Array(P).fill(0), hi0 = new Array(P).fill(0);
  const coupledHours = (x, gSum) => {
    const a = o.shortfallValue, c = (o.balance / 100) * ctx.avgWage * 0.1;
    let room = 0, maxH = 0;
    for (let p = 0; p < P; p++) { room += hi0[p] - lo0[p]; maxH = Math.max(maxH, staff[p].maxHours); }
    if (!(c > 0) || x >= room - 1e-9) return gSum;
    const dual = (lam) => {
      let t = lam * x;
      for (let p = 0; p < P; p++) {
        const tp = ctx.target[p], m = staff[p].minHours, l = lo0[p], u = hi0[p];
        const g = (h) => a * Math.max(0, m - h) + c * (h - tp) ** 2 - lam * (h - l);
        const cl = (h) => Math.min(u, Math.max(l, h));
        t += Math.min(g(l), g(u), g(cl(m)), g(cl(tp + (a + lam) / (2 * c))), g(cl(tp + lam / (2 * c))));
      }
      return t;
    };
    const span = a + 2 * c * maxH + 1;
    let lo = -span, hi = Math.min(BIG, span);
    for (let it = 0; it < 24; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (dual(m1) < dual(m2)) lo = m1; else hi = m2;
    }
    return Math.max(gSum, dual((lo + hi) / 2));
  };
  const days = [...new Set(slots.map((x) => x.day))].sort((x, y) => x - y);
  const dayAt = new Map(days.map((d, j) => [d, j]));
  const D = days.length;
  const quarter = len.every((h) => Math.abs(h * 4 - Math.round(h * 4)) < 1e-9);
  const pairOk = Array.from({ length: P }, () => new Map()); // person -> "i,j" -> can one person hold both
  const compatible = (p, i, j) => {
    const key = i < j ? i * S + j : j * S + i;
    let v = pairOk[p].get(key);
    if (v === undefined) { v = validList(ctx, p, [i, j].sort((x, y) => slots[x].start - slots[y].start || x - y)); pairOk[p].set(key, v); }
    return v;
  };
  // Heaviest set of shifts on one day that one person could hold together (no two overlap or break the rest rule), in hours.
  const bestDay = (p, items) => {
    let best = 0;
    const go = (from, chosen, hours) => {
      if (hours > best) best = hours;
      for (let x = from; x < items.length; x++) {
        if (chosen.every((c) => compatible(p, c, items[x]))) { chosen.push(items[x]); go(x + 1, chosen, hours + len[items[x]]); chosen.pop(); }
      }
    };
    go(0, [], 0);
    return best;
  };
  // Most hours of shifts order[k..] that could still be covered, ignoring everything but who is available, what is left of each
  // person's week and which shifts can sit together: a max flow (Edmonds-Karp) from the undecided shifts through each person-day
  // (capped by the heaviest compatible set that person could hold that day) to each person (capped by the best whole-shift subset
  // that fits in their remaining weekly hours). A person gets an edge only if the shift is still a valid addition to what they
  // hold, so overlaps and rest gaps with decided shifts count. Every cap is an upper bound, so the result never undercounts.
  // Most hours of `items` that person p could hold on top of what they have, with every rule checked together (overlap, rest
  // across days, daily cap, consecutive days, weekly limit), not each alone as the day and week caps above do. At most `cap`.
  const heldMost = (p, items, cap) => {
    const its = [...items].sort((x, y) => slots[x].start - slots[y].start || x - y);
    const suffix = new Array(its.length + 1).fill(0);
    for (let x = its.length - 1; x >= 0; x--) suffix[x] = suffix[x + 1] + len[its[x]];
    let best = 0;
    const go = (x, list, hours) => {
      if (hours > best) best = hours;
      if (best >= cap - 1e-9) return;
      for (; x < its.length; x++) {
        if (hours + suffix[x] <= best + 1e-9) return;
        const nl = insertSorted(ctx, list, its[x]);
        if (validList(ctx, p, nl)) { go(x + 1, nl, hours + len[its[x]]); if (best >= cap - 1e-9) return; }
      }
    };
    go(0, lists[p], 0);
    return best;
  };
  const rate = (p, i) => burden * staff[p].wage * mFloor * paidMinutes(o, slots[i]) / 60 / len[i]; // cheapest pay per hour of the shift
  const hoursLeft = new Array(P).fill(0);
  const coverableHours = (k, left, flowOnly = false) => {
    const n = S - k, N = n + P * D + P + 2, src = N - 2, snk = N - 1, eps = 1e-9;
    const pd = (p, j) => n + p * D + j, pn = (p) => n + P * D + p;
    // Sparse residual graph: edge e goes to[e] with capacity cap[e] and cost cst[e]; its reverse is e ^ 1.
    const to = [], cap = [], cst = [], adj = Array.from({ length: N }, () => []);
    let joint0 = 0; // the hours terms at no extra hours, summed over people
    const link = (u, v, c, w) => {
      adj[u].push(to.length); to.push(v); cap.push(c); cst.push(w);
      adj[v].push(to.length); to.push(u); cap.push(0); cst.push(-w);
    };
    const edge = Array.from({ length: P }, () => []);
    const byDay = Array.from({ length: P }, () => Array.from({ length: D }, () => []));
    for (let a = 0; a < n; a++) {
      const i = order[k + a];
      link(src, a, len[i], 0);
      for (let p = 0; p < P; p++) {
        if (!elig[p][i] || left[p] <= eps || !validList(ctx, p, insertSorted(ctx, lists[p], i))) continue;
        const j = dayAt.get(slots[i].day);
        link(a, pd(p, j), len[i], rate(p, i));
        edge[p].push(i);
        byDay[p][j].push(i);
      }
    }
    for (let p = 0; p < P; p++) {
      for (let j = 0; j < D; j++) if (byDay[p][j].length) link(pd(p, j), pn(p), bestDay(p, byDay[p][j]), 0);
      let room = left[p];
      if (quarter) {
        const r = Math.floor(left[p] * 4 + 1e-6);
        const fits = new Uint8Array(r + 1);
        fits[0] = 1;
        for (const i of edge[p]) {
          const w = Math.round(len[i] * 4);
          for (let x = r; x >= w; x--) if (fits[x - w]) fits[x] = 1;
        }
        room = 0;
        for (let x = r; x > 0; x--) if (fits[x]) { room = x / 4; break; }
      }
      if (room > eps && edge[p].length > 1) room = Math.min(room, heldMost(p, edge[p], room));
      if (!flowOnly && o.flowBalance !== false && o.balance > 0 && room > eps) {
        // g_p(h) = shortfall + balance terms is convex, so the largest of a few tangent lines is a lower bound on it and is itself
        // convex: each stretch between neighbouring tangents becomes a parallel edge at the tangent's slope, cheapest used first.
        const a = o.shortfallValue, c = (o.balance / 100) * ctx.avgWage * 0.1, t = ctx.target[p], m = staff[p].minHours, l = lo0[p];
        const g = (h) => a * Math.max(0, m - h) + c * (h - t) ** 2;
        const slope = (h) => (h < m ? -a : 0) + 2 * c * (h - t); // right derivative: a valid subgradient
        const xs = [];
        for (let x = 0; x <= TANGENTS; x++) xs.push(l + (room * x) / TANGENTS);
        if (m > l && m < l + room) xs.push(m);
        xs.sort((u, v) => u - v);
        const lines = xs.map((x) => ({ s: slope(x), b: g(x) - slope(x) * x }));
        const env = (h) => Math.max(...lines.map((ln) => ln.s * h + ln.b));
        joint0 += env(l);
        let at = l;
        for (let q = 0; q < lines.length; q++) {
          const next = q === lines.length - 1 ? l + room : Math.min(l + room, Math.max(at, (lines[q + 1].b - lines[q].b) / (lines[q].s - lines[q + 1].s)));
          if (lines[q + 1] && lines[q + 1].s === lines[q].s) continue;
          if (next > at + eps) { link(pn(p), snk, next - at, lines[q].s); at = next; }
        }
      } else link(pn(p), snk, room, 0);
    }
    // Successive cheapest augmenting paths (SPFA): the most hours that can be covered, and the least straight-time pay for them.
    let flow = 0, cost = 0;
    const dist = new Float64Array(N), prevE = new Int32Array(N), inQ = new Uint8Array(N);
    for (;;) {
      dist.fill(Infinity); prevE.fill(-1); inQ.fill(0);
      dist[src] = 0;
      const q = [src];
      inQ[src] = 1;
      for (let h = 0; h < q.length; h++) {
        const u = q[h];
        inQ[u] = 0;
        for (const e of adj[u]) {
          const v = to[e];
          if (cap[e] > eps && dist[u] + cst[e] < dist[v] - 1e-12) {
            dist[v] = dist[u] + cst[e]; prevE[v] = e;
            if (!inQ[v]) { inQ[v] = 1; q.push(v); }
          }
        }
      }
      if (prevE[snk] < 0) return o.flowBalance !== false && o.balance > 0 ? { flow, cost, joint: cost + joint0 } : { flow, cost };
      let f = Infinity;
      for (let v = snk; v !== src; v = to[prevE[v] ^ 1]) f = Math.min(f, cap[prevE[v]]);
      for (let v = snk; v !== src; v = to[prevE[v] ^ 1]) { cap[prevE[v]] -= f; cap[prevE[v] ^ 1] += f; }
      flow += f;
      cost += f * dist[snk];
    }
  };
  // Pricing shifts gives a floor on open hours that sees who can hold which whole sets (the flow splits a shift between people).
  // Open hours are sums of shift lengths, so when those share a grid (hours, halves, quarters) the floor rounds up to it.
  const incHours = Math.floor(incumbent / BIG + 1e-9);
  let banned = null, bannedCount = 0; // (person, shift) pairs ruled out by reduced-cost fixing
  let dualBranchStats = null, coverBranchStats = null;
  let scoreDual = -Infinity; // whole-score floor from pricing shifts (see priceScoreBound)
  if (incHours > 0 && o.pricingFloor !== false) {
    const pf = priceOpenFloor(ctx, { incumbentOpen: incHours, incumbentScore: o.scoreDual === false ? null : incumbent, cutoff: o.reducedCostFixing === false ? null : incumbent - tolerance - 1e-9 });
    if (pf) {
      if (pf.scoreBound != null) scoreDual = pf.scoreBound;
      if (pf.dual && o.dualBranch !== false && scoreDual < incumbent - tolerance - 1e-9) {
        const db = branchDual(ctx, pf.dual, scoreDual, incumbent, incumbent - tolerance - 1e-9, { maxNodes: o.dualBranchNodes, ms: o.dualBranchMs });
        dualBranchStats = db.stats;
        if (db.bound > scoreDual) scoreDual = db.bound;
      }
      if (pf.banned) { banned = pf.banned; bannedCount = pf.banCount; }
      const unit = [1, 0.5, 0.25].find((u) => len.every((h) => Math.abs(h / u - Math.round(h / u)) < 1e-9)); // open hours come in whole shifts
      minOpenH = unit ? Math.ceil(pf.floor / unit - 1e-6) * unit : Math.max(0, pf.floor - 1e-6);
      // Branch on the open-hours price itself: every held set is worth 0 and an open shift costs BIG x its hours, so the same
      // branch-and-bound as above bounds the least open hours and closes part of the integrality gap the root price leaves.
      if (o.coverBranch !== false && minOpenH < incHours - 1e-9) {
        const zero = pf.cov.sets.map((fs) => new Float64Array(fs.length));
        const lam0 = Float64Array.from(pf.cov.lam, (x, i) => Math.min(BIG * pf.cov.len[i], x * BIG));
        const cb = branchDual(ctx, { sets: pf.cov.sets, vals: zero, len: pf.cov.len, lam: lam0 }, BIG * pf.floor, BIG * incHours, BIG * (incHours - (unit || 1) / 2), { maxNodes: o.coverBranchNodes ?? 60, ms: o.coverBranchMs ?? 4000 });
        coverBranchStats = cb.stats;
        const fl = cb.bound / BIG;
        minOpenH = Math.max(minOpenH, unit ? Math.ceil(fl / unit - 1e-6) * unit : Math.max(0, fl - 1e-6));
      }
    }
  }
  const rootBound = Math.max(lowerBound(0, 0), scoreDual);
  let best = incumbent, bestOwner = null, nodes = 0, aborted = false;
  const t0 = Date.now();
  const rec = (k, unfilledH) => {
    if (aborted) return;
    if (++nodes > (covMode ? 2 * nodeLimit : nodeLimit) || ((nodes & 1023) === 0 && Date.now() - t0 > (covMode ? timeLimitMs / 2 : timeLimitMs))) { aborted = true; return; }
    if (!covMode && scoreDual >= best - tolerance - 1e-9) return; // the priced bound already shows no roster beats the incumbent
    if (lowerBound(k, unfilledH, best - tolerance - 1e-9) >= best - tolerance - 1e-9) return;
    if (k === S) {
      const total = covMode ? BIG * unfilledH : scoreOwner(ctx, owner).total;
      if (total < best - 1e-9) { best = total; bestOwner = owner.slice(); }
      return;
    }
    const i = order[k];
    const opts = [], seen = new Set();
    for (let p = 0; p < P; p++) {
      if (!elig[p][i] || (banned && !covMode && banned[p][i])) continue;
      const twin = cls[p] + "|" + lists[p].join(",");
      if (seen.has(twin)) continue;
      seen.add(twin);
      const nl = insertSorted(ctx, lists[p], i);
      if (!validList(ctx, p, nl)) continue;
      opts.push({ p, nl, d: personScore(ctx, p, nl) - personScore(ctx, p, lists[p]) });
    }
    opts.sort((a, b) => a.d - b.d);
    for (const { p, nl } of opts) {
      const old = lists[p];
      lists[p] = nl; owner[i] = p;
      rec(k + 1, unfilledH);
      lists[p] = old; owner[i] = -1;
      if (aborted) return;
    }
    rec(k + 1, unfilledH + len[i]);
  };
  // Coverage first: how few hours can stay open at all, ignoring pay? Cost bounds are weak against whole open hours (BIG each),
  // so the cost search below is told the answer. It gets the node limit again and half the time limit; an unfinished pass proves nothing and is dropped.
    const incOpen = Math.floor(incumbent / BIG + 1e-9);
  if (incOpen > 0 && incOpen > Math.floor(rootBound / BIG + 1e-9) && incOpen > minOpenH + 1e-9) {
    covMode = true;
    const savedBest = best;
    best = BIG * incOpen;
    rec(0, 0);
    coverNodes = nodes;
    if (!aborted) minOpenH = Math.max(minOpenH, Math.round(best / BIG * 4) / 4);
    // A pass that found fewer open hours than the incumbent has found a better roster, even before pay is looked at.
    const coverOwner = bestOwner;
    covMode = false; aborted = false; nodes = 0; bestOwner = null; best = savedBest;
    if (coverOwner) {
      const total = scoreOwner(ctx, coverOwner).total;
      if (total < best - 1e-9) { best = total; bestOwner = coverOwner; }
    }
  }
  rec(0, 0);
  return { proven: !aborted, banned: bannedCount, nodes: nodes + coverNodes, coverNodes, coverOpen: minOpenH, rootBound, coverBranchStats, owner: bestOwner, score: bestOwner ? best : null };
}

// Fewest hours that must stay open, by pricing shifts (Lagrangian dual of "each shift is covered by at most one person").
// Each person independently takes their best feasible set of shifts, where a shift costs `lam` hours of value; for any lam >= 0
// sum(lam) + sum_p max_set sum(len - lam) bounds the coverable hours from above (weak duality), and subgradient steps tighten lam.
// The flow bound lets a shift be split between people; this one cannot, but it enumerates each person's real feasible sets, so it
// returns null when a person has more than `maxSets` of them. Returns { floor, coverable, demand, sets } with floor in hours.
export function openFloorByPricing(staff, slots, options = {}, cfg = {}) {
  return priceOpenFloor(buildContext(staff, slots, options), cfg);
}
// Test and bench hook: the priced bound after branch and bound on contested shifts (see branchDual). cutoff defaults to never reached.
export function branchedScoreBound(staff, slots, options = {}, { incumbentScore, cutoff = Infinity, maxNodes = 40, ms = 8000 } = {}) {
  const ctx = buildContext(staff, slots, options);
  const pf = priceOpenFloor(ctx, { incumbentOpen: 0, incumbentScore, cutoff: incumbentScore });
  if (!pf?.dual) return null;
  return { root: pf.scoreBound, ...branchDual(ctx, pf.dual, pf.scoreBound, incumbentScore, cutoff, { maxNodes, ms }) };
}
function priceOpenFloor(ctx, { maxSets = 60000, rounds = 200, incumbentOpen = null, incumbentScore = null, scoreRounds = 300, cutoff = null } = {}) {
  const { P, S, elig, slots } = ctx;
  const len = slots.map((s) => (s.end - s.start) / 60);
  const demand = len.reduce((a, b) => a + b, 0);
  const sets = [];
  let total = 0;
  for (let p = 0; p < P; p++) {
    const items = [...Array(S).keys()].filter((i) => elig[p][i] && validList(ctx, p, [i])).sort((a, b) => slots[a].start - slots[b].start || a - b);
    const found = [];
    let blown = false;
    const go = (x, list) => {
      if (blown) return;
      found.push(list);
      if (found.length > maxSets) { blown = true; return; }
      for (; x < items.length; x++) {
        const nl = insertSorted(ctx, list, items[x]);
        if (validList(ctx, p, nl)) go(x + 1, nl);
      }
    };
    go(0, []);
    if (blown) return null;
    sets.push(found);
    total += found.length;
  }
  const lam = new Float64Array(S);
  let bestBound = demand;
  let bestLam = new Float64Array(S);
  const target = incumbentOpen == null ? 0 : demand - incumbentOpen;
  let theta = 1;
  for (let r = 0; r < rounds; r++) {
    let L = 0;
    for (let i = 0; i < S; i++) L += lam[i];
    const cnt = new Float64Array(S);
    for (let p = 0; p < P; p++) {
      let bestV = -Infinity, bestSet = null;
      for (const f of sets[p]) {
        let v = 0;
        for (const i of f) v += len[i] - lam[i];
        if (v > bestV) { bestV = v; bestSet = f; }
      }
      L += bestV;
      for (const i of bestSet) cnt[i]++;
    }
    if (L < bestBound) { bestBound = L; bestLam = lam.slice(); } else if (r % 10 === 9) theta *= 0.7;
    let norm = 0;
    const gr = new Float64Array(S);
    for (let i = 0; i < S; i++) { gr[i] = 1 - cnt[i]; norm += gr[i] * gr[i]; }
    if (norm === 0) break;
    const step = (theta * Math.max(L - target, 0.5)) / norm;
    for (let i = 0; i < S; i++) lam[i] = Math.max(0, lam[i] - step * gr[i]);
  }
  const out = { floor: Math.max(0, demand - bestBound), coverable: bestBound, demand, sets: total, cov: { sets, len, lam: bestLam } };
  if (incumbentScore != null) {
    const sb = priceScoreBound(ctx, sets, len, bestLam, incumbentScore, scoreRounds, cutoff);
    if (cutoff == null) out.scoreBound = sb;
    else { out.scoreBound = sb.bound; out.banned = sb.banned; out.banCount = sb.count; out.dual = { sets, vals: sb.vals, len, lam: sb.lam }; }
  }
  return out;
}
// Subgradient loop behind priceScoreBound. `fixed[i]` (when given) marks shifts a branch has already decided (held by a named person
// or left open); their price is pinned at 0 and `constant` carries any open cost already paid, so the bound is for the sub-problem.
function scoreDualCore(P, S, sets, vals, cap, fixed, constant, lam0, incumbent, rounds) {
  const lam = lam0.slice();
  let best = -Infinity, theta = 1, stale = 0, bestLam = lam.slice();
  for (let r = 0; r < rounds; r++) {
    let L = constant;
    const gr = new Float64Array(S);
    for (let i = 0; i < S; i++) {
      if (fixed && fixed[i] !== -2) { lam[i] = 0; continue; }
      L += lam[i];
      gr[i] = 1;
      if (lam[i] >= cap[i] - 1e-9) { L += cap[i] - lam[i]; gr[i] = 0; } // priced at its open cost: staying open is the cheaper side
    }
    for (let p = 0; p < P; p++) {
      let bestV = Infinity, bestK = -1;
      const fs = sets[p], vp = vals[p];
      for (let k = 0; k < fs.length; k++) {
        let v = vp[k];
        for (const i of fs[k]) v -= lam[i];
        if (v < bestV) { bestV = v; bestK = k; }
      }
      if (bestK < 0) return { best: Infinity, bestLam: lam.slice(), gr }; // a person with no valid set: this branch is infeasible
      L += bestV;
      for (const i of fs[bestK]) if (!fixed || fixed[i] === -2) gr[i]--;
    }
    if (L > best + 1e-9) { best = L; stale = 0; bestLam = lam.slice(); } else if (++stale >= 8) { theta *= 0.6; stale = 0; }
    let norm = 0;
    for (let i = 0; i < S; i++) norm += gr[i] * gr[i];
    if (norm === 0) break;
    const step = (theta * Math.max(incumbent - L, 1)) / norm;
    for (let i = 0; i < S; i++) if (!fixed || fixed[i] === -2) lam[i] = Math.min(cap[i], lam[i] + step * gr[i]);
  }
  return { best, bestLam };
}
// Lagrangian lower bound on the whole score (pay, penalties and BIG per open hour), not only the open hours. Each shift is held by
// one person or stays open at BIG x its hours; pricing shift i at lam[i] splits that into independent pieces: each person's best set
// (its personScore minus the prices of its shifts) plus min(0, BIG x hours - lam[i]) per shift. Valid for any lam; started from the
// open-hours prices scaled by BIG, then tightened by subgradient steps toward the incumbent.
function priceScoreBound(ctx, sets, len, lam0, incumbent, rounds, cutoff = null) {
  const { P, S } = ctx;
  const vals = sets.map((fs, p) => Float64Array.from(fs, (f) => personScore(ctx, p, f)));
  const cap = len.map((h) => BIG * h);
  const { best, bestLam } = scoreDualCore(P, S, sets, vals, cap, null, 0, Float64Array.from(lam0, (x, i) => Math.min(cap[i], x * BIG)), incumbent, rounds);
  if (cutoff == null) return best;
  // Reduced-cost fixing: at the best prices, a roster that makes person p hold shift i scores at least best - bestV_p + (p's best set
  // holding i). When that already reaches the cutoff, nobody can beat the incumbent that way, so (p, i) is banned from the search.
  const banned = Array.from({ length: P }, () => new Uint8Array(S));
  let count = 0;
  for (let p = 0; p < P; p++) {
    const fs = sets[p], vp = vals[p];
    const w = new Float64Array(fs.length);
    let bestV = Infinity;
    for (let k = 0; k < fs.length; k++) {
      let v = vp[k];
      for (const i of fs[k]) v -= bestLam[i];
      w[k] = v;
      if (v < bestV) bestV = v;
    }
    const inV = new Float64Array(S).fill(Infinity);
    for (let k = 0; k < fs.length; k++) for (const i of fs[k]) if (w[k] < inV[i]) inV[i] = w[k];
    for (let i = 0; i < S; i++) if (best - bestV + inV[i] >= cutoff) { banned[p][i] = 1; count++; }
  }
  return { bound: best, banned, count, lam: bestLam, vals };
}

// Branch and bound on the priced bound itself. The root price leaves a gap because shifts several people want are split in the
// relaxation; fixing one such shift (to each person who could hold it, or to staying open) and re-pricing the pieces closes part of it,
// and when every piece reaches the cutoff no roster can beat the incumbent. Returns a valid whole-score lower bound (never above the
// optimum) and how much work it did. Stops at the node or time limit with the lowest bound still open.
function branchDual(ctx, dual, rootBound, incumbent, cutoff, { maxNodes = 40, ms = 8000, rounds = 120 } = {}) {
  const { P, S } = ctx;
  const cap = dual.len.map((h) => BIG * h);
  const t0 = Date.now();
  const stats = { evaluated: 0, expanded: 0, ms: 0 };
  const holders = (nd) => {
    const cnt = new Int32Array(S);
    for (let p = 0; p < P; p++) {
      let bestV = Infinity, bestK = -1;
      const fs = nd.sets[p], vp = nd.vals[p];
      for (let k = 0; k < fs.length; k++) {
        let v = vp[k];
        for (const i of fs[k]) v -= nd.lam[i];
        if (v < bestV) { bestV = v; bestK = k; }
      }
      if (bestK >= 0) for (const i of fs[bestK]) cnt[i]++;
    }
    return cnt;
  };
  const evaluate = (nd) => {
    stats.evaluated++;
    const r = scoreDualCore(P, S, nd.sets, nd.vals, cap, nd.fixed, nd.constant, nd.lam, incumbent, rounds);
    nd.bound = r.best; nd.lam = r.bestLam;
    return nd;
  };
  const child = (nd, i, q) => {
    const sets = [], vals = [];
    for (let p = 0; p < P; p++) {
      const keep = [];
      nd.sets[p].forEach((f, k) => { if (f.includes(i) === (p === q)) keep.push(k); });
      sets.push(keep.map((k) => nd.sets[p][k]));
      vals.push(Float64Array.from(keep, (k) => nd.vals[p][k]));
    }
    const fixed = nd.fixed.slice(); fixed[i] = q;
    return evaluate({ sets, vals, fixed, constant: nd.constant + (q < 0 ? cap[i] : 0), lam: nd.lam, bound: -Infinity });
  };
  const root = { sets: dual.sets, vals: dual.vals, fixed: new Array(S).fill(-2), constant: 0, lam: Float64Array.from(dual.lam), bound: rootBound };
  const open = [root];
  let floor = Infinity; // lowest bound among pieces already cut off at the cutoff
  const finish = () => { stats.ms = Date.now() - t0; return { bound: Math.min(floor, ...open.map((n) => n.bound), incumbent), stats }; };
  while (open.length && stats.expanded < maxNodes && Date.now() - t0 < ms) {
    open.sort((a, b) => a.bound - b.bound);
    const nd = open[0];
    if (nd.bound >= cutoff) break;
    const cnt = holders(nd);
    let pick = -1;
    for (let i = 0; i < S; i++) if (cnt[i] > 1 && (pick < 0 || cnt[i] > cnt[pick] || (cnt[i] === cnt[pick] && cap[i] > cap[pick]))) pick = i;
    if (pick < 0) break; // the priced solution is a roster: this piece's bound is its optimum and cannot be raised
    open.shift();
    stats.expanded++;
    const holdersOf = [];
    for (let p = 0; p < P; p++) if (nd.sets[p].some((f) => f.includes(pick))) holdersOf.push(p);
    for (const q of [-1, ...holdersOf]) {
      const c = child(nd, pick, q);
      if (c.bound >= cutoff) floor = Math.min(floor, c.bound);
      else if (c.bound < Infinity) open.push(c);
    }
  }
  if (!open.length) return { bound: Math.max(Math.min(floor, incumbent), 0), stats: { ...stats, ms: Date.now() - t0 } };
  return finish();
}

// What a manager gets filling shifts in time order with the first valid person in the list.
function listedOrder(ctx) {
  const owner = new Array(ctx.S).fill(-1);
  const lists = Array.from({ length: ctx.P }, () => []);
  for (let i = 0; i < ctx.S; i++) {
    for (let p = 0; p < ctx.P; p++) {
      if (!ctx.elig[p][i]) continue;
      const nl = insertSorted(ctx, lists[p], i);
      if (!validList(ctx, p, nl)) continue;
      owner[i] = p; lists[p] = nl; break;
    }
  }
  return owner;
}

function summarise(ctx, owner) {
  const { staff, slots } = ctx;
  const lists = Array.from({ length: ctx.P }, () => []);
  const unfilled = [];
  owner.forEach((p, i) => { if (p < 0) unfilled.push(i); else lists[p].push(i); });
  lists.forEach((l) => l.sort((a, b) => slots[a].start - slots[b].start || a - b));
  let cost = 0, otHours = 0, hours = 0;
  const people = staff.map((p, k) => {
    const h = hoursOf(ctx, lists[k]);
    const q = payParts(ctx, lists[k]);
    const ot = q.ot + q.dt;
    const c = payroll(ctx, k, lists[k]);
    cost += c; otHours += ot; hours += h;
    return {
      name: p.name, shifts: lists[k].length, hours: h, otHours: ot, cost: c, wage: p.wage,
      minHours: p.minHours, maxHours: p.maxHours, short: Math.max(0, p.minHours - h),
      avoidHours: p.avoid ? lists[k].reduce((t, i) => t + avoidMinutes(p, slots[i]), 0) / 60 : 0,
      daysWorked: new Set(lists[k].map((i) => slots[i].day)).size, slotIds: lists[k], splitDays: splitDays(ctx, lists[k]),
    };
  });
  const unfilledHours = unfilled.reduce((t, i) => t + (slots[i].end - slots[i].start) / 60, 0);
  return { owner: owner.slice(), people, cost, otHours, hours, unfilled, unfilledHours, lists };
}

function whyUnfilled(ctx, owner, i) {
  const slot = ctx.slots[i];
  const lists = Array.from({ length: ctx.P }, () => []);
  owner.forEach((p, k) => { if (p >= 0) lists[p].push(k); });
  const why = { free: 0, hours: 0, rest: 0, days: 0, overlap: 0, daily: 0 };
  for (let p = 0; p < ctx.P; p++) {
    if (!ctx.elig[p][i]) continue;
    why.free++;
    const base = lists[p].slice().sort((a, b) => ctx.slots[a].start - ctx.slots[b].start);
    const nl = insertSorted(ctx, base, i);
    if (validList(ctx, p, nl)) continue; // not blocked in this snapshot (a swap elsewhere is possible but costs coverage)
    const mins = nl.reduce((t, k) => t + ctx.slots[k].end - ctx.slots[k].start, 0);
    if (mins > ctx.staff[p].maxHours * 60 + 1e-9) { why.hours++; continue; }
    if (base.some((k) => ctx.slots[k].start < slot.end && slot.start < ctx.slots[k].end)) { why.overlap++; continue; }
    if (overDaily(ctx, p, nl)) { why.daily++; continue; }
    const gapBad = slot.start < (ctx.staff[p].prevEnd ?? -Infinity) + ctx.restMin
      || base.some((k) => slot.start < ctx.slots[k].end + ctx.restMin && ctx.slots[k].start < slot.end + ctx.restMin);
    if (gapBad) why.rest++; else why.days++;
  }
  let text;
  const skilled = slot.role ? ctx.staff.filter((p) => qualified(p, slot)).length : ctx.P;
  const pinned = slot.fixed && ctx.staff.some((p) => p.name.toLowerCase() === slot.fixed.toLowerCase());
  if (pinned && why.free === 0) text = `${slot.fixed} is pinned to this shift but is not available for the whole of it`;
  else if (slot.role && skilled === 0) text = `nobody listed has the role "${slot.role}"`;
  else if (why.free === 0) text = slot.role ? `nobody with the role "${slot.role}" is available for this whole shift` : "nobody listed is available for this whole shift";
  else {
    const bits = [];
    if (why.overlap) bits.push(`${why.overlap} already on another shift`);
    if (why.rest) bits.push(`${why.rest} would break the rest rule`);
    if (why.hours) bits.push(`${why.hours} at their weekly hour limit`);
    if (why.daily) bits.push(`${why.daily} at their daily hour limit`);
    if (why.days) bits.push(`${why.days} at the consecutive-days limit`);
    text = `${why.free} ${slot.role ? `with the role "${slot.role}" ` : ""}${why.free === 1 ? "person is" : "people are"} free then, but ${bits.join(", ") || "the others are needed elsewhere"}`;
  }
  return { ...why, text };
}

// One plain sentence for the result of the optional exact check (buildRoster with exact: true).
export function optimalityText(opt) {
  if (!opt) return "";
  if (opt.status === "optimal") return `Checked against an exact search: no roster under your rules scores better than this one${opt.tolerance > 0 ? ` by more than ${money2(opt.tolerance)} of score` : ""}.`;
  if (opt.status === "improved") return `Checked against an exact search: the quick search was ${num(opt.gapPct)}% off the best possible, so this roster is the better one the exact search found (proven best${opt.tolerance > 0 ? `, to within ${money2(opt.tolerance)} of score` : ""}).`;
  if (opt.gap < BIG && opt.coverageProven) {
    const h = opt.forcedOpenHours;
    return `Exact search ran out of time before it could prove the cheapest roster, but it did prove the coverage: ${h > 0 ? `${num(h)} hour${h === 1 ? "" : "s"} of shifts cannot be covered under your rules, however the week is arranged` : "every shift can be covered"}, and this roster covers all the rest. The cheapest way to do that could still save at most ${money(opt.gap)} in the score (pay plus penalties).`;
  }
  return `Exact search ran out of time before it could prove anything. The best roster it found is shown; the true best could still be better by up to ${num(opt.gapPct)}% of the score by a loose bound, so treat this as a good roster, not a proven one.`;
}

export function buildRoster(staff, slots, options = {}) {
  const ctx = buildContext(staff, slots, options);
  if (!ctx.P) return { error: "Add at least one person." };
  if (!ctx.S) return { error: "Add at least one shift to cover." };
  const o = ctx.o;
  const iterations = o.iterations > 0 ? o.iterations : Math.max(9000, ctx.S * 70);
  let best = search(ctx, o.restarts, iterations);
  // Covering shifts outranks everything else, so while any shift is open spend as many extra restarts again on finding a roster that
  // covers more. A balance of 50 on the sample week left 8 coverable hours open after four restarts; twelve found them.
  if (scoreOwner(ctx, best.owner).unfilled > 0) {
    const more = search(ctx, o.restarts * 6, iterations, o.restarts);
    if (more.score < best.score - 1e-9) best = more;
  }
  // Still open: the annealer's short runs stop too soon on weeks of about twenty shifts or more (eval/effort-bench.mjs), so give
  // a few restarts five times the iterations before the ejection passes.
  if (o.longPass !== false && scoreOwner(ctx, best.owner).unfilled > 0) {
    const long = search(ctx, o.restarts, iterations * 5, o.restarts * 7);
    if (long.score < best.score - 1e-9) best = long;
  }
  if (scoreOwner(ctx, best.owner).unfilled > 0) {
    // A few seeds, each from the best so far: one chain of moves rarely finds the best way to free the hours.
    for (let k = 0; k < 4; k++) {
      const eo = ejectPass(ctx, best.owner, o.seed + 104729 * (k + 1), Math.max(20000, ctx.S * 1500));
      const es = scoreOwner(ctx, eo).total;
      if (es < best.score - 1e-9) best = { owner: eo, score: es };
    }
  }
  // Still open: walk the coverage plateau (open hours only), then polish pay. Kept only if it covers more.
  if (o.coverPass !== false && scoreOwner(ctx, best.owner).unfilled > 0) {
    for (let k = 0; k < (o.coverPassRuns ?? 12); k++) {
      const cp = coverPass(ctx, best.owner, o.seed + 15485863 * (k + 1), Math.max(60000, ctx.S * 4000) * (o.coverPassScale ?? 4));
      if (cp.open >= scoreOwner(ctx, best.owner).unfilled - 1e-9) continue;
      const po = polishPay(ctx, cp.owner, o.seed + k, Math.max(20000, ctx.S * 1000));
      const ps = scoreOwner(ctx, po).total;
      if (ps < best.score - 1e-9) best = { owner: po, score: ps };
    }
    if ((o.coverRepair ?? (o.exact === true || o.openShiftWeight !== undefined)) && scoreOwner(ctx, best.owner).unfilled > 0) {
      const rp = coverRepair(ctx, best.owner, o.seed + 7919, { k: o.coverRepairPeople ?? 3, rounds: o.coverRepairRounds ?? 60, totalNodes: o.coverRepairNodes ?? 3000000, timeLimitMs: o.coverRepairMs ?? 60000, shiftWeight: o.openShiftWeight ?? 1e-6 });
      const cur = best.owner.reduce((t, p) => t + (p < 0 ? 1 : 0), 0);
      const w = o.openShiftWeight ?? 1e-6;
      const curObj = scoreOwner(ctx, best.owner).unfilled + w * cur;
      if (rp.open + w * rp.openShifts < curObj - 1e-9) {
        const po = polishPay(ctx, rp.owner, o.seed + 31, Math.max(20000, ctx.S * 1000));
        const ps = scoreOwner(ctx, po).total;
        if (ps < best.score - 1e-9) best = { owner: po, score: ps };
      }
    }
  }
  // Optional proof: for small problems search exhaustively (with pruning) and say how far the annealed roster is from the best possible.
  let optimality = null;
  if (o.exact === true || (o.exact === "auto" && ctx.S <= EXACT_AUTO_SLOTS)) {
    const ex = exactSearch(ctx, best.score, { nodeLimit: o.exactNodes, timeLimitMs: o.exactMs, tolerance: o.exactTolerance });
    const annealScore = best.score;
    if (ex.owner && ex.score < best.score - 1e-9) best = { owner: ex.owner, score: ex.score };
    const gap = ex.proven ? annealScore - best.score : best.score - Math.min(ex.rootBound, best.score);
    optimality = {
      status: ex.proven ? (gap > 1e-6 ? "improved" : "optimal") : "bounded",
      annealScore, bestScore: best.score, lowerBound: ex.proven ? best.score : ex.rootBound,
      forcedOpenHours: ex.proven ? Math.floor(best.score / BIG + 1e-9) : Math.max(Math.floor(ex.rootBound / BIG + 1e-9), Math.floor(ex.coverOpen + 1e-9)),
      coverageProven: ex.proven || Math.max(Math.floor(ex.rootBound / BIG + 1e-9), Math.floor(ex.coverOpen + 1e-9)) === Math.floor(best.score / BIG + 1e-9),
      tolerance: o.exactTolerance, coverOpen: ex.coverOpen, coverNodes: ex.coverNodes, gap: Math.max(0, gap), gapPct: annealScore > 0 ? (Math.max(0, gap) / annealScore) * 100 : 0, nodes: ex.nodes,
    };
  }
  const res = summarise(ctx, best.owner);
  const base = summarise(ctx, listedOrder(ctx));

  const unfilled = res.unfilled.map((i) => ({ slot: slots[i], ...whyUnfilled(ctx, res.owner, i) }));

  const onlyOne = [];
  for (let i = 0; i < ctx.S; i++) {
    const who = [];
    for (let p = 0; p < ctx.P; p++) if (ctx.elig[p][i]) who.push(p);
    if (who.length === 1 && res.owner[i] >= 0) onlyOne.push({ slot: slots[i], person: staff[who[0]].name });
  }

  const critical = [];
  if (ctx.P > 1 && ctx.P <= 40) {
    for (let p = 0; p < ctx.P; p++) {
      if (!res.lists[p].length) continue;
      const sub = staff.filter((_, k) => k !== p);
      const sctx = buildContext(sub, slots, { ...o, restarts: 1, iterations: Math.max(5000, ctx.S * 40) });
      const sres = summarise(sctx, search(sctx, 1, Math.max(5000, ctx.S * 40)).owner);
      const extraUnfilled = sres.unfilledHours - res.unfilledHours;
      if (extraUnfilled > 1e-9) critical.push({ name: staff[p].name, extraUnfilledHours: extraUnfilled, extraCost: sres.cost - res.cost });
    }
    critical.sort((a, b) => b.extraUnfilledHours - a.extraUnfilledHours || a.name.localeCompare(b.name));
  }

  // What would one more hire fix? Add a hypothetical person free at any time (per role the open shifts need),
  // rebuild, and report the uncovered hours it would cover and the payroll it adds.
  let hireTest = null;
  if (res.unfilled.length && ctx.P < MAX_STAFF) {
    const wage = staff.reduce((t, p) => t + p.wage, 0) / staff.length;
    const roles = [...new Set(res.unfilled.map((i) => slots[i].role).filter(Boolean))];
    const maxHours = 40;
    const extra = { name: "New hire", wage, maxHours, minHours: 0, roles, days: Array.from({ length: 7 }, () => [[0, 1440]]), anyTime: true };
    const hctx = buildContext([...staff, extra], slots, { ...o, restarts: 1, iterations: Math.max(5000, ctx.S * 40) });
    const hres = summarise(hctx, search(hctx, 1, Math.max(5000, ctx.S * 40)).owner);
    const covered = res.unfilledHours - hres.unfilledHours;
    // The shifts that hire takes, as a posting line: the availability the job actually needs.
    const windows = (hres.lists[staff.length] || []).map((i) => slots[i]).sort((a, b) => a.day - b.day || a.startMin - b.startMin)
      .map((s) => `${DAYS[s.day]} ${fmtClock(s.startMin)}–${fmtClock(s.endMin)}${s.role ? " [" + s.role + "]" : ""}`);
    if (covered > 1e-9) hireTest = { wage, maxHours, coveredHours: covered, stillUnfilledHours: hres.unfilledHours, extraCost: hres.cost - res.cost, windows };
  }

  const warnings = [];
  staff.forEach((p, k) => {
    if (!ctx.elig[k].some(Boolean)) warnings.push(`${p.name} is not available for any of the shifts, so they get no hours.`);
  });
  const known = new Set(staff.map((p) => p.name.toLowerCase()));
  slots.forEach((s) => { if (s.fixed && !known.has(s.fixed.toLowerCase())) warnings.push(`A shift is pinned to "${s.fixed}", who is not in the staff list, so nobody can take it.`); });
  res.people.forEach((p) => {
    if (p.avoidHours > 0.01) warnings.push(`${p.name} works ${num(p.avoidHours)} hours inside the times they asked to avoid; avoiding them would have left a shift open or cost more.`);
  });
  const capHours = staff.reduce((t, p) => t + p.maxHours, 0);
  if (capHours < ctx.totalHours) warnings.push(`The shifts add up to ${num(ctx.totalHours)} hours but everyone's weekly limits together are ${num(capHours)}, so some shifts cannot be filled.`);
  res.people.forEach((p) => {
    if (p.short > 0.01) warnings.push(`${p.name} gets ${num(p.hours)} hours, ${num(p.short)} under their minimum of ${num(p.minHours)}.`);
  });
  if (slots.some((s) => s.endMin > 1440 && s.day === 6) && staff.every((p) => p.prevEnd == null)) warnings.push("A Sunday-night shift runs into Monday; the rest rule is checked inside this one week only. To carry it into next week, add \"prev: Sun 10pm\" to each person next week.");

  const assignments = slots.map((s, i) => ({ slot: s, person: res.owner[i] >= 0 ? staff[res.owner[i]].name : null }));
  const grid = staff.map((p, k) => ({
    name: p.name,
    days: DAYS.map((_, d) => res.lists[k].filter((i) => slots[i].day === d).map((i) => `${fmtClock(slots[i].startMin)}–${fmtClock(slots[i].endMin)}${slots[i].label ? " " + slots[i].label : ""}${slots[i].role ? " [" + slots[i].role + "]" : ""}`)),
  }));

  const savingVsListed = base.cost - res.cost;
  return {
    ok: true, options: o, slots: ctx.S, totalHours: ctx.totalHours,
    cost: res.cost, hours: res.hours, otHours: res.otHours, unfilledHours: res.unfilledHours, unfilledSlots: res.unfilled.length,
    people: res.people, assignments, grid, unfilled, onlyOne, critical, hireTest, warnings,
    listed: { cost: base.cost, otHours: base.otHours, unfilledHours: base.unfilledHours, unfilledSlots: base.unfilled.length },
    savingVsListed, score: best.score, owner: res.owner, optimality,
    filledAll: res.unfilled.length === 0,
  };
}

// Why `nl` (a person's list after taking `slotIndex` onto `base`) breaks a hard rule, in the order a manager would check.
function blockReason(ctx, staff, slots, p, base, nl, slotIndex) {
  const slot = slots[slotIndex];
  const mins = nl.reduce((t, k) => t + slots[k].end - slots[k].start, 0);
  if (base.some((k) => slots[k].start < slot.end && slot.start < slots[k].end)) return "already on a shift at that time";
  if (mins > staff[p].maxHours * 60 + 1e-9) return "would go over their weekly hour limit";
  if (overDaily(ctx, p, nl)) return "would go over their daily hour limit";
  if (slot.start < (staff[p].prevEnd ?? -Infinity) + ctx.restMin
    || base.some((k) => slot.start < slots[k].end + ctx.restMin && slots[k].start < slot.end + ctx.restMin)) return "would break the rest rule";
  return "would break the days-in-a-row limit";
}

// Sick call or swap request: who could take shift `slotIndex` right now, leaving everyone else as the roster has them?
// The person it is taken from (if any) is skipped. Each candidate gets the payroll change of the move (the shift
// leaves its current owner and lands on them, overtime included); people who are free but blocked get the rule that blocks them.
export function coverOptions(staff, slots, roster, slotIndex, options = {}) {
  if (!roster || !roster.owner || !slots[slotIndex]) return { error: "Build a roster first." };
  const ctx = buildContext(staff, slots, { ...(roster.options || {}), ...options });
  const owner = roster.owner;
  const slot = slots[slotIndex];
  const current = owner[slotIndex];
  const listOf = (p) => owner.map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0);
  const sortList = (l) => l.sort((a, b) => slots[a].start - slots[b].start || a - b);
  const dollars = (p, list) => payroll(ctx, p, list);
  const fits = [], blocked = [];
  for (let p = 0; p < ctx.P; p++) {
    if (p === current) continue;
    if (!ctx.elig[p][slotIndex]) continue;
    const base = sortList(listOf(p));
    const nl = insertSorted(ctx, base, slotIndex);
    if (validList(ctx, p, nl)) {
      let delta = dollars(p, nl) - dollars(p, base);
      if (current >= 0) {
        const cb = sortList(listOf(current));
        delta += dollars(current, cb.filter((k) => k !== slotIndex)) - dollars(current, cb);
      }
      const h = hoursOf(ctx, nl);
      fits.push({ name: staff[p].name, extraCost: delta, hoursAfter: h, overtimeAfter: (({ ot, dt }) => ot + dt)(payParts(ctx, nl)) });
      continue;
    }
    const reason = blockReason(ctx, staff, slots, p, base, nl, slotIndex);
    blocked.push({ name: staff[p].name, reason });
  }
  fits.sort((a, b) => a.extraCost - b.extraCost || a.name.localeCompare(b.name));
  return { slot, current: current >= 0 ? staff[current].name : null, fits, blocked };
}

// Least-disruption cover: `slotIndex` must change hands (a call-out, or an open shift) and `coverOptions` found nobody
// who is free. Search chains of hand-overs, shortest first: someone takes the shift and gives up one of theirs, which a
// third person takes (and so on), up to `maxMoves` shifts changing hands in all. Every person's list is re-checked
// against every hard rule after each hand-over; people who are not in the chain keep their shifts. Fewest shifts moved
// first, then lowest payroll change. Searched exhaustively inside `maxMoves`, nothing claimed beyond it.
export function coverChain(staff, slots, roster, slotIndex, options = {}, { maxMoves = 3, limit = 10 } = {}) {
  if (!roster || !roster.owner || !slots[slotIndex]) return { error: "Build a roster first." };
  const ctx = buildContext(staff, slots, { ...(roster.options || {}), ...options });
  const owner0 = roster.owner;
  const from = owner0[slotIndex];
  const listOf = (own, p) => own.map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0).sort((a, b) => slots[a].start - slots[b].start || a - b);
  const payAll = (own, people) => [...people].reduce((t, p) => t + payroll(ctx, p, listOf(own, p)), 0);
  const found = [];
  const walk = (own, steps, touched, slot, banned) => {
    const holder = own[slot];
    const step = (p) => ({ slot: slots[slot], index: slot, from: holder >= 0 ? staff[holder].name : null, to: staff[p].name });
    for (let p = 0; p < ctx.P; p++) {
      if (p === holder || banned.has(p) || !ctx.elig[p][slot]) continue;
      const base = listOf(own, p);
      const t2 = new Set(touched); t2.add(p); if (holder >= 0) t2.add(holder);
      if (validList(ctx, p, insertSorted(ctx, base, slot))) {
        const next = own.slice(); next[slot] = p;
        found.push({ moves: steps.length + 1, steps: [...steps, step(p)], extraCost: payAll(next, t2) - payAll(owner0, t2) });
        continue;
      }
      if (steps.length + 2 > maxMoves) continue;
      for (const t of base) {
        if (t === slotIndex) continue;
        if (!validList(ctx, p, insertSorted(ctx, base.filter((k) => k !== t), slot))) continue;
        const next = own.slice(); next[slot] = p; // p still holds t until the next hand-over takes it
        walk(next, [...steps, step(p)], t2, t, new Set([...banned, p]));
      }
    }
  };
  walk(owner0.slice(), [], new Set(), slotIndex, new Set(from >= 0 ? [from] : []));
  found.sort((a, b) => a.moves - b.moves || a.extraCost - b.extraCost || a.steps[0].to.localeCompare(b.steps[0].to));
  const seen = new Set(), chains = [];
  for (const c of found) {
    const key = c.steps.map((x) => x.index + ">" + x.to).join("|");
    if (seen.has(key)) continue; seen.add(key); chains.push(c);
    if (chains.length >= limit) break;
  }
  return { slot: slots[slotIndex], current: from >= 0 ? staff[from].name : null, chains };
}

// Seniority report: for every staffed shift, the more senior people (`seniority:` cell, higher = more senior) who could take
// it from the junior holder with every hard rule still holding, with the payroll change and each side's hours. Shows where a
// seniority-bidding rule or a union contract would ask for a different roster; the search does not apply it. Most senior first.
export function seniorityClaims(staff, slots, roster, options = {}) {
  if (!roster || !roster.owner) return { error: "Build a roster first." };
  const ctx = buildContext(staff, slots, { ...(roster.options || {}), ...options });
  const owner = roster.owner;
  const listOf = (p) => owner.map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0).sort((x, y) => slots[x].start - slots[y].start || x - y);
  const claims = [];
  owner.forEach((j, i) => {
    if (j < 0 || staff[j].seniority == null) return;
    const jBase = listOf(j), jRest = jBase.filter((k) => k !== i);
    for (let s = 0; s < ctx.P; s++) {
      if (s === j || staff[s].seniority == null || staff[s].seniority <= staff[j].seniority || !ctx.elig[s][i]) continue;
      const sBase = listOf(s);
      const sNew = insertSorted(ctx, sBase, i);
      if (!validList(ctx, s, sNew)) continue;
      claims.push({
        slot: slots[i], senior: staff[s].name, junior: staff[j].name,
        extraCost: payroll(ctx, s, sNew) - payroll(ctx, s, sBase) + payroll(ctx, j, jRest) - payroll(ctx, j, jBase),
        seniorHours: hoursOf(ctx, sBase), juniorHours: hoursOf(ctx, jBase),
        underMinimum: hoursOf(ctx, sBase) < staff[s].minHours - 1e-9,
        juniorWouldDropBelowMinimum: hoursOf(ctx, jRest) < staff[j].minHours - 1e-9,
      });
    }
  });
  claims.sort((a, b) => a.slot.start - b.slot.start || a.senior.localeCompare(b.senior));
  return { claims, shifts: new Set(claims.map((c) => `${c.slot.day}|${c.slot.startMin}|${c.junior}`)).size };
}

// "Ana and Ben want to swap Tuesday close for Saturday open": check that one specific trade (the owners of shifts
// `slotA` and `slotB` exchange them) keeps both weeks inside every hard rule, with the payroll change of the pair.
// When it does not, each person who cannot take their new shift gets the rule that stops them. Everything else stays put.
export function checkTrade(staff, slots, roster, slotA, slotB, options = {}) {
  if (!roster || !roster.owner || !slots[slotA] || !slots[slotB]) return { error: "Build a roster first." };
  const ctx = buildContext(staff, slots, { ...(roster.options || {}), ...options });
  const owner = roster.owner;
  const a = owner[slotA], b = owner[slotB];
  if (slotA === slotB) return { error: "Pick two different shifts." };
  if (a < 0 || b < 0) return { error: "A trade needs two staffed shifts; use the sick-call finder for an open one." };
  if (a === b) return { error: `${staff[a].name} holds both shifts; there is nobody to trade with.` };
  const listOf = (p) => owner.map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0).sort((x, y) => slots[x].start - slots[y].start || x - y);
  const aBase = listOf(a), bBase = listOf(b);
  const aRest = aBase.filter((k) => k !== slotA), bRest = bBase.filter((k) => k !== slotB);
  const aNew = insertSorted(ctx, aRest, slotB), bNew = insertSorted(ctx, bRest, slotA);
  const problems = [];
  if (!ctx.elig[a][slotB]) problems.push({ name: staff[a].name, reason: "is not available for that shift or lacks its role" });
  else if (!validList(ctx, a, aNew)) problems.push({ name: staff[a].name, reason: blockReason(ctx, staff, slots, a, aRest, aNew, slotB) });
  if (!ctx.elig[b][slotA]) problems.push({ name: staff[b].name, reason: "is not available for that shift or lacks its role" });
  else if (!validList(ctx, b, bNew)) problems.push({ name: staff[b].name, reason: blockReason(ctx, staff, slots, b, bRest, bNew, slotA) });
  const extraCost = problems.length ? null : payroll(ctx, a, aNew) - payroll(ctx, a, aBase) + payroll(ctx, b, bNew) - payroll(ctx, b, bBase);
  return {
    ok: problems.length === 0, problems, extraCost,
    a: { name: staff[a].name, gives: slots[slotA], gets: slots[slotB], hoursAfter: hoursOf(ctx, aNew) },
    b: { name: staff[b].name, gives: slots[slotB], gets: slots[slotA], hoursAfter: hoursOf(ctx, bNew) },
  };
}

// Over budget? Rank the assignments by what dropping each one saves in payroll (overtime and burden included, from the
// person's whole week). A drop is "safe" when another copy of the same shift stays staffed, so the shift is still
// covered, just thinner; it is "tight" when it would leave the shift empty. `breaksMinimum` marks a drop that would put
// the person under their minimum hours. Savings are per drop and do not add up exactly (cutting two shifts from one
// person's week can save more or less than the sum, because overtime is priced across the week). Safe drops first.
export function trimOptions(staff, slots, roster, options = {}) {
  if (!roster || !roster.owner) return { error: "Build a roster first." };
  const ctx = buildContext(staff, slots, { ...(roster.options || {}), ...options });
  const owner = roster.owner;
  const key = (s) => `${s.day}|${s.startMin}|${s.endMin}|${s.label}|${s.role}`;
  const staffed = new Map();
  owner.forEach((p, i) => { if (p >= 0) staffed.set(key(slots[i]), (staffed.get(key(slots[i])) || 0) + 1); });
  const sortList = (l) => l.sort((a, b) => slots[a].start - slots[b].start || a - b);
  const rows = [];
  owner.forEach((p, i) => {
    if (p < 0) return;
    const list = sortList(owner.map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0));
    const rest = list.filter((k) => k !== i);
    const saves = payroll(ctx, p, list) - payroll(ctx, p, rest);
    rows.push({
      slot: slots[i], person: staff[p].name, saves, hoursSaved: (slots[i].end - slots[i].start) / 60,
      leavesEmpty: staffed.get(key(slots[i])) === 1,
      breaksMinimum: hoursOf(ctx, rest) < staff[p].minHours - 1e-9 && hoursOf(ctx, list) >= staff[p].minHours - 1e-9,
    });
  });
  rows.sort((a, b) => a.leavesEmpty - b.leavesEmpty || b.saves - a.saves || a.slot.start - b.slot.start);
  return { rows, safe: rows.filter((r) => !r.leavesEmpty).length };
}

// "Can I swap Saturday for Sunday?": for the shift at `slotIndex` (owned by someone), list one-for-one trades where
// another person takes it and hands back one of their own shifts that the first person is free for, with both weeks
// still passing every hard rule. Each trade carries the payroll change of the pair (overtime included), cheapest first.
// `direct` marks people who could simply take the shift with nothing back (see coverOptions); a swap matters when they cannot.
export function swapOptions(staff, slots, roster, slotIndex, options = {}) {
  if (!roster || !roster.owner || !slots[slotIndex]) return { error: "Build a roster first." };
  const ctx = buildContext(staff, slots, { ...(roster.options || {}), ...options });
  const owner = roster.owner;
  const a = owner[slotIndex];
  if (a < 0) return { error: "That shift is open; use the sick-call finder to see who can take it." };
  const listOf = (p) => owner.map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0).sort((x, y) => slots[x].start - slots[y].start || x - y);
  const dollars = (p, list) => payroll(ctx, p, list);
  const aBase = listOf(a);
  const trades = [];
  for (let b = 0; b < ctx.P; b++) {
    if (b === a || !ctx.elig[b][slotIndex]) continue;
    const bBase = listOf(b);
    const direct = validList(ctx, b, insertSorted(ctx, bBase, slotIndex));
    for (const t of bBase) {
      if (!ctx.elig[a][t]) continue;
      const bNew = insertSorted(ctx, bBase.filter((k) => k !== t), slotIndex);
      const aNew = insertSorted(ctx, aBase.filter((k) => k !== slotIndex), t);
      if (!validList(ctx, b, bNew) || !validList(ctx, a, aNew)) continue;
      const delta = dollars(a, aNew) - dollars(a, aBase) + dollars(b, bNew) - dollars(b, bBase);
      trades.push({ with: staff[b].name, takes: slots[slotIndex], gives: slots[t], giveIndex: t, extraCost: delta, direct });
    }
  }
  trades.sort((x, y) => x.extraCost - y.extraCost || x.with.localeCompare(y.with) || x.giveIndex - y.giveIndex);
  return { slot: slots[slotIndex], from: staff[a].name, trades };
}

// A person is out for several days (flu, jury duty, a no-show week): hand every shift they hold on `days` (indexes
// into DAYS, or all their shifts when omitted) to someone else without moving anyone else's existing shifts. It
// works like the sick-call finder run repeatedly: the shift with the fewest people able to take it goes first, to the
// cheapest of them, and the roster is updated before the next one so nobody is double-booked or pushed over a rule
// by two hand-overs. A shift nobody can take stays open with the reasons. Greedy, not a proof of the best split.
export function absencePlan(staff, slots, roster, name, days = null, options = {}) {
  if (!roster || !roster.owner) return { error: "Build a roster first." };
  const who = staff.findIndex((p) => p.name.toLowerCase() === String(name).trim().toLowerCase());
  if (who < 0) return { error: `${name} is not in the staff list.` };
  const owner = roster.owner.slice();
  const pending = [];
  owner.forEach((p, i) => { if (p === who && (!days || days.includes(slots[i].day))) pending.push(i); });
  // A zero weekly limit keeps the absent person from being offered each other's shifts back.
  const outStaff = staff.map((p, k) => (k === who ? { ...p, maxHours: 0 } : p));
  const moves = [], open = [];
  let extraCost = 0;
  while (pending.length) {
    let pick = null;
    for (const i of pending) {
      const c = coverOptions(outStaff, slots, { ...roster, owner }, i, options);
      if (c.error) return c;
      if (!pick || c.fits.length < pick.c.fits.length) pick = { i, c };
    }
    pending.splice(pending.indexOf(pick.i), 1);
    const best = pick.c.fits[0];
    if (!best) { open.push({ slot: slots[pick.i], index: pick.i, blocked: pick.c.blocked }); owner[pick.i] = -1; continue; }
    owner[pick.i] = staff.findIndex((p) => p.name === best.name);
    extraCost += best.extraCost;
    moves.push({ slot: slots[pick.i], index: pick.i, to: best.name, extraCost: best.extraCost, overtimeAfter: best.overtimeAfter });
  }
  moves.sort((a, b) => a.slot.start - b.slot.start);
  open.sort((a, b) => a.slot.start - b.slot.start);
  return { ok: true, person: staff[who].name, moves, open, extraCost, owner };
}

export function rosterCsv(r) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = ["day,start,end,hours,label,assigned_to,role"];
  for (const a of r.assignments) {
    const s = a.slot;
    rows.push([DAYS[s.day] + (s.endMin > 1440 ? " (overnight)" : ""), fmtClock(s.startMin), fmtClock(s.endMin), ((s.end - s.start) / 60).toFixed(2), q(s.label || ""), q(a.person || "UNFILLED"), q(s.role || "")].join(","));
  }
  return rows.join("\n") + "\n";
}

// iCalendar file for one week, so each person can import their own shifts. weekStart is "YYYY-MM-DD" and
// must be a Monday; person limits the file to one name (default: everyone, with the name in the title).
export function rosterIcs(r, weekStart, person = null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekStart || ""));
  if (!m) throw new Error("weekStart must be YYYY-MM-DD");
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(base).getUTCDay() !== 1) throw new Error("weekStart must be a Monday");
  const esc = (t) => String(t).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const stamp = (min, day) => {
    const d = new Date(base + day * 86400000 + min * 60000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
  };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shift-roster-builder//EN", "CALSCALE:GREGORIAN"];
  r.assignments.forEach((a, k) => {
    if (!a.person || (person && a.person !== person)) return;
    const s = a.slot;
    const title = (s.label || "Shift") + (s.role ? ` (${s.role})` : "") + (person ? "" : ` - ${a.person}`);
    lines.push("BEGIN:VEVENT", `UID:roster-${weekStart}-${k}@shift-roster-builder`, `DTSTAMP:${stamp(0, 0)}Z`,
      `DTSTART:${stamp(s.startMin, s.day)}`, `DTEND:${stamp(s.endMin, s.day)}`, `SUMMARY:${esc(title)}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// "Mon" or, given the Monday as YYYY-MM-DD, "Mon 6 Oct".
function dayLabeler(weekStart) {
  let base = null;
  if (weekStart) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekStart));
    if (!m) throw new Error("weekStart must be YYYY-MM-DD");
    base = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (d) => {
    if (base === null) return DAYS[d];
    const dt = new Date(base + d * 86400000);
    return `${DAYS[d]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  };
}

// Plain-text message per person ("Hi Sam, here is your week: ..."), ready to paste into a text or chat.
// weekStart ("YYYY-MM-DD", a Monday) is optional; with it each line carries the date, e.g. "Mon 6 Oct".
export function rosterMessages(r, weekStart = null) {
  const dayLabel = dayLabeler(weekStart);
  const byPerson = new Map();
  for (const a of r.assignments) {
    if (!a.person) continue;
    if (!byPerson.has(a.person)) byPerson.set(a.person, []);
    byPerson.get(a.person).push(a.slot);
  }
  const out = [];
  for (const p of r.people) {
    const slots = (byPerson.get(p.name) || []).slice().sort((a, b) => a.day - b.day || a.startMin - b.startMin);
    const lines = slots.map((s) => `${dayLabel(s.day)}: ${fmtClock(s.startMin)}-${fmtClock(s.endMin)}${s.label ? " " + s.label : ""}${s.role ? ` (${s.role})` : ""}`);
    const text = slots.length
      ? `Hi ${p.name}, your shifts this week:\n${lines.join("\n")}\nTotal ${num(p.hours)} hours. Reply if you cannot make one.`
      : `Hi ${p.name}, you have no shifts this week.`;
    out.push({ person: p.name, shifts: slots.length, text });
  }
  return out;
}

// One group message for the shifts still open after a build: each open shift and the people who could take it without
// moving anyone else (from coverOptions), in listed order and without pay figures, so it can be posted to the team chat
// as is. The search leaves a shift open only when nobody listed can take it, so the names are usually empty and the
// line then invites anyone not on the list (a call-in, a new hire) to claim it.
export function openShiftPost(staff, slots, roster, weekStart = null) {
  if (!roster || !roster.owner) return { error: "Build a roster first." };
  const dayLabel = dayLabeler(weekStart);
  const open = roster.owner.map((p, i) => (p < 0 ? i : -1)).filter((i) => i >= 0)
    .sort((a, b) => slots[a].day - slots[b].day || slots[a].startMin - slots[b].startMin || a - b);
  if (!open.length) return { count: 0, text: "" };
  const lines = open.map((i) => {
    const s = slots[i];
    const c = coverOptions(staff, slots, roster, i);
    const names = c.fits.map((f) => f.name);
    const when = `${dayLabel(s.day)}: ${fmtClock(s.startMin)}-${fmtClock(s.endMin)}${s.label ? " " + s.label : ""}${s.role ? ` (${s.role})` : ""}`;
    return `${when} - ${names.length ? "could take it: " + names.join(", ") : "open to anyone free"}`;
  });
  return { count: open.length, text: `Open shifts this week. Reply to claim one:\n${lines.join("\n")}` };
}

// Last week's roster CSV (from rosterCsv) -> each person's latest shift end, as minutes from last Monday 00:00.
export function lastShiftEnds(csv) {
  const ends = new Map();
  const lines = String(csv || "").split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines.slice(1)) {
    const c = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
      else if (ch === '"') inQ = true; else if (ch === ",") { c.push(cur); cur = ""; } else cur += ch;
    }
    c.push(cur);
    const who = (c[5] || "").trim();
    if (!who || who === "UNFILLED") continue;
    const d = dayIndex((c[0] || "").replace(/\s*\(overnight\)/i, "").trim());
    const start = parseTime(c[1]);
    let end = parseTime(c[2]);
    if (d < 0 || Number.isNaN(start) || Number.isNaN(end)) continue;
    if (end <= start) end += 1440;
    const abs = d * 1440 + end;
    const key = who.toLowerCase();
    if (!ends.has(key)) ends.set(key, { name: who, abs, days: new Set() });
    const e = ends.get(key);
    e.days.add(d);
    if (abs > e.abs) e.abs = abs;
  }
  return ends;
}

// A roster CSV (from rosterCsv) -> shifts with absolute minutes from Monday 00:00 (end past midnight runs on).
// Unfilled rows are skipped. Rows that cannot be read are skipped too, so a hand-edited file still loads.
export function parseRosterCsv(csv) {
  const out = [];
  const lines = String(csv || "").split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines.slice(1)) {
    const c = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
      else if (ch === '"') inQ = true; else if (ch === ",") { c.push(cur); cur = ""; } else cur += ch;
    }
    c.push(cur);
    const person = (c[5] || "").trim();
    if (!person || person === "UNFILLED") continue;
    const day = dayIndex((c[0] || "").replace(/\s*\(overnight\)/i, "").trim());
    const start = parseTime(c[1]);
    let end = parseTime(c[2]);
    if (day < 0 || Number.isNaN(start) || Number.isNaN(end)) continue;
    if (end <= start) end += 1440;
    out.push({ person, day, start: day * 1440 + start, end: day * 1440 + end, label: (c[4] || "").trim() });
  }
  return out;
}

// What changed between the roster you posted and the one you are working from now, one entry per change:
// "added" (a shift someone did not have), "cancelled" (a posted shift they no longer have), "moved" (same person,
// same day, different hours; the hours gained or lost are reported). Notice is the hours between `changedAt`
// (minutes from Monday 00:00 of that week) and the earliest start the change touches. A change is "short notice" when
// that is under `noticeHours`, and then owes `premiumHours` of the person's wage unless their name is in `exempt`
// (swaps and changes the employee asked for). Whether a rule applies, its window and its premium are the operator's
// to enter: this is arithmetic on their numbers, not a statement of what any ordinance requires.
export function scheduleChanges(postedCsv, revisedCsv, { changedAt = null, noticeHours = 336, premiumHours = 1, wages = {}, exempt = [] } = {}) {
  const posted = parseRosterCsv(postedCsv), revised = parseRosterCsv(revisedCsv);
  const skip = new Set((exempt || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean));
  const wageOf = new Map(Object.entries(wages || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? "").trim() === "" ? NaN : Number(v)]));
  const people = [...new Set([...posted, ...revised].map((x) => x.person))];
  const changes = [];
  for (const who of people) {
    const was = posted.filter((x) => x.person === who), now = revised.filter((x) => x.person === who);
    const keep = (x, y) => x.start === y.start && x.end === y.end;
    for (const a of [...was]) {
      const i = now.findIndex((b) => keep(a, b));
      if (i >= 0) { now.splice(i, 1); was.splice(was.indexOf(a), 1); }
    }
    for (const a of [...was]) {
      const i = now.findIndex((b) => b.day === a.day);
      if (i < 0) continue;
      const b = now.splice(i, 1)[0];
      was.splice(was.indexOf(a), 1);
      changes.push({ kind: "moved", person: who, from: a, to: b, touchesFrom: Math.min(a.start, b.start), hoursDelta: (b.end - b.start - (a.end - a.start)) / 60 });
    }
    for (const a of was) changes.push({ kind: "cancelled", person: who, from: a, to: null, touchesFrom: a.start, hoursDelta: -(a.end - a.start) / 60 });
    for (const b of now) changes.push({ kind: "added", person: who, from: null, to: b, touchesFrom: b.start, hoursDelta: (b.end - b.start) / 60 });
  }
  const known = Number.isFinite(Number(changedAt)) && changedAt !== null && changedAt !== "";
  let owed = 0;
  for (const ch of changes) {
    ch.noticeHours = known ? (ch.touchesFrom - Number(changedAt)) / 60 : null;
    ch.exempt = skip.has(ch.person.toLowerCase());
    ch.shortNotice = known && ch.noticeHours < noticeHours;
    const wage = wageOf.get(ch.person.toLowerCase());
    ch.premium = ch.shortNotice && !ch.exempt && wage > 0 ? Math.round(premiumHours * wage * 100) / 100 : 0;
    ch.premiumUnpriced = ch.shortNotice && !ch.exempt && !(wage > 0);
    owed += ch.premium;
  }
  changes.sort((x, y) => x.touchesFrom - y.touchesFrom || x.person.localeCompare(y.person));
  return { changes, owed: Math.round(owed * 100) / 100, shortNotice: changes.filter((c) => c.shortNotice && !c.exempt).length, noticeKnown: known };
}

// Sets "prev:" on every staff line whose person worked last week, replacing any old one. Other lines are untouched.
// Tough shifts (weekend, closing, opening: the same test as the search and fairnessReport) per person in a roster CSV.
export function toughCounts(csv) {
  const counts = new Map();
  for (const sh of parseRosterCsv(csv)) {
    const startMin = sh.start - sh.day * 1440, endMin = sh.end - sh.day * 1440;
    const tough = sh.day >= 5 || endMin >= 22 * 60 || startMin <= 6 * 60;
    const key = sh.person.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + (tough ? 1 : 0));
  }
  return counts;
}

// Days worked in a row ending on last Sunday, per person (lowercase name). A run that reaches back to Monday adds the
// `streak:` they already carried in, so a person on a 9-day run reads 9, then 16, not 7 each time.
function trailingStreaks(ends, staffText) {
  const old = new Map();
  for (const raw of String(staffText || "").split(/\r?\n/)) {
    const cells = splitLine(raw.trim());
    const cell = cells.find((x) => STREAK_CELL.test(x));
    if (cell && cells[0] && !raw.trim().startsWith("#")) old.set(cells[0].toLowerCase(), Number(cell.replace(STREAK_CELL, "").trim()) || 0);
  }
  const out = new Map();
  for (const [who, { days: set }] of ends) {
    let run = 0;
    for (let d = 6; d >= 0 && set.has(d); d--) run++;
    if (run === 7) run += old.get(who) || 0;
    if (run > 0) out.set(who, run);
  }
  return out;
}

export function carryOverStaff(staffText, lastWeekCsv) {
  const ends = lastShiftEnds(lastWeekCsv);
  const streaks = trailingStreaks(ends, staffText);
  const tough = toughCounts(lastWeekCsv);
  let changed = 0;
  const out = String(staffText || "").split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return raw;
    const cells = splitLine(line);
    const e = ends.get((cells[0] || "").toLowerCase());
    if (!e) {
      const bare = cells.filter((x) => !STREAK_CELL.test(x));
      return bare.length === cells.length ? raw : bare.join(line.includes("\t") ? "\t" : ", ");
    }
    const day = Math.min(6, Math.floor(e.abs / 1440)), min = e.abs - day * 1440;
    const kept = cells.filter((x) => !PREV_CELL.test(x) && !STREAK_CELL.test(x));
    while (kept.length < 4) kept.push(""); // prev: sits after wage, max, min; blank cells take the defaults
    kept.push(`prev: ${DAYS[day]} ${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`);
    // Rolling tally: last week's tough shifts plus half of what was already recorded, so old weeks fade.
    const oldTough = kept.find((x) => TOUGH_CELL.test(x));
    const rolled = Math.round(((oldTough ? Number(oldTough.replace(TOUGH_CELL, "")) || 0 : 0) * 0.5 + (tough.get(e.name.toLowerCase()) || 0)) * 10) / 10;
    const rest = kept.filter((x) => !TOUGH_CELL.test(x));
    if (rolled > 0) rest.push(`tough: ${rolled}`);
    const streak = streaks.get((cells[0] || "").toLowerCase());
    if (streak) rest.push(`streak: ${streak}`);
    kept.length = 0; kept.push(...rest);
    changed++;
    return kept.join(line.includes("\t") ? "\t" : ", ");
  });
  return { text: out.join("\n"), changed };
}

// Monday date + 7 * k days, as YYYY-MM-DD (null when weekStart is not a date).
function addWeeks(weekStart, k) {
  const m = ISO_DATE.exec(weekStart || "");
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 7 * k)).toISOString().slice(0, 10);
}

// Several weeks in a row from one setup. Each week is built with the rest gap and the running tough-shift tally carried
// over from the week before (the same arithmetic as "carry over last week"), and dated `off:` entries apply in the week
// they fall in. People who had no shift last week lose a stale `prev:` so it cannot block Monday. Returns one entry per
// week with its roster and CSV; a parse error stops the plan.
export function planWeeks(staffText, shiftsText, { weeks = 4, weekStart = null, ...options } = {}) {
  const n = Math.max(1, Math.min(8, Math.floor(weeks) || 1));
  const sh = parseShifts(shiftsText);
  if (sh.errors.length) return { error: sh.errors[0] };
  let text = String(staffText || "");
  const out = [];
  for (let k = 0; k < n; k++) {
    const ws = addWeeks(weekStart, k);
    const st = parseStaff(text, { weekStart: ws });
    if (st.errors.length) return { error: st.errors[0] };
    const roster = buildRoster(st.staff, sh.slots, options);
    if (roster.error) return { error: roster.error };
    const csv = rosterCsv(roster);
    out.push({ week: k + 1, weekStart: ws, roster, csv });
    if (k < n - 1) {
      const worked = lastShiftEnds(csv);
      const cleaned = text.split(/\r?\n/).map((raw) => {
        const line = raw.trim();
        if (!line || line.startsWith("#")) return raw;
        const cells = splitLine(line);
        if (worked.has((cells[0] || "").toLowerCase())) return raw;
        const kept = cells.filter((x) => !PREV_CELL.test(x) && !STREAK_CELL.test(x));
        return kept.length === cells.length ? raw : kept.join(line.includes("\t") ? "\t" : ", ");
      }).join("\n");
      text = carryOverStaff(cleaned, csv).text;
    }
  }
  return { ok: true, weeks: out, totalCost: out.reduce((t, w) => t + w.roster.cost, 0), totalOpenHours: out.reduce((t, w) => t + w.roster.unfilledHours, 0) };
}

// Fairness over a whole plan: the per-week fairnessReport counts added up per person across every planned week, so
// "who keeps getting the closes and weekends" is visible over a month and not only week by week. `spread` is the largest
// minus the smallest tough-shift total among people who work at all, `flag` when it is 2 per week or more on average.
// A report only: the search balances recent weeks through the tough-shift tally, it does not guarantee equal totals.
export function planFairness(plan, opts = {}) {
  const weeks = (plan && plan.weeks) || [];
  const by = new Map();
  for (const w of weeks) {
    for (const x of fairnessReport(w.roster, opts).rows) {
      const t = by.get(x.name) || { name: x.name, weeks: 0, shifts: 0, hours: 0, weekend: 0, closing: 0, opening: 0, tough: 0 };
      t.weeks++; t.shifts += x.shifts; t.hours += x.hours; t.weekend += x.weekend; t.closing += x.closing; t.opening += x.opening; t.tough += x.tough;
      by.set(x.name, t);
    }
  }
  const rows = [...by.values()].sort((a, b) => b.tough - a.tough || a.name.localeCompare(b.name));
  const spread = rows.length ? rows[0].tough - rows[rows.length - 1].tough : 0;
  return { weeks: weeks.length, rows, spread, flag: weeks.length > 0 && spread >= 2 * weeks.length, most: rows[0] || null, least: rows[rows.length - 1] || null };
}

// Longest run of consecutive worked days per person over a whole plan. The per-week check (`scheduleFlags.sevenDays`)
// only sees seven days inside one Monday-to-Sunday week, so a run of Wed to the next Tue is missed; here a Sunday shift
// joins a Monday shift of the following week. A shift counts on the day it starts. `flag` lists people whose run is
// longer than `maxDays` (default 6). A report only: the search does not limit it, and it knows nothing about days
// worked before the first planned week.
export function planStreaks(plan, { maxDays = 6 } = {}) {
  const weeks = (plan && plan.weeks) || [];
  const worked = new Map();
  weeks.forEach((w, k) => {
    for (const a of (w.roster && w.roster.assignments) || []) {
      if (!a.person) continue;
      const set = worked.get(a.person) || new Set();
      set.add(k * 7 + a.slot.day);
      worked.set(a.person, set);
    }
  });
  const rows = [...worked].map(([name, set]) => {
    const days = [...set].sort((a, b) => a - b);
    let best = 0, bestEnd = -1, run = 0;
    days.forEach((d, i) => {
      run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
      if (run > best) { best = run; bestEnd = d; }
    });
    return { name, longest: best, from: bestEnd - best + 1, to: bestEnd };
  }).sort((a, b) => b.longest - a.longest || a.name.localeCompare(b.name));
  return { maxDays, rows, flag: rows.filter((x) => x.longest > maxDays) };
}

// Labor cost as a share of projected sales, against an optional target.
// Returns null when sales is not a positive number. maxPayroll is the payroll
// that would hit the target exactly; headroom is how much of it is unspent.
export function laborPercent(payroll, sales, targetPct = null) {
  const s = Number(sales), c = Number(payroll);
  if (!(s > 0) || !Number.isFinite(c) || c < 0) return null;
  const pct = (c / s) * 100;
  const t = Number(targetPct);
  if (!(t > 0)) return { pct, target: null, maxPayroll: null, headroom: null, over: false };
  const maxPayroll = (s * t) / 100;
  return { pct, target: t, maxPayroll, headroom: maxPayroll - c, over: pct > t + 1e-9 };
}

// Dollar budget check for a built roster: payroll against a weekly labor budget you set in dollars (no sales figure
// needed). Returns null when budget is not a positive number. When over, `cutHours` is the paid hours that would
// have to go at the roster's average cost per hour (payroll / hours) to reach the budget; a guide, since the
// real saving depends on whose hours go (see trimOptions).
export function budgetCheck(r, budget) {
  const b = Number(budget), c = Number(r && r.cost);
  if (!(b > 0) || !Number.isFinite(c) || c < 0) return null;
  const headroom = b - c, over = c > b + 1e-9;
  const perHour = r.hours > 0 ? c / r.hours : null;
  return { budget: b, payroll: c, headroom, over, pct: (c / b) * 100, perHour, cutHours: over && perHour ? (c - b) / perHour : 0 };
}

// Per-day view of a built roster: scheduled hours, payroll at each person's base wage (plus the burden %), and, when
// `salesText` holds up to seven daily sales figures (Mon first, comma or space separated, blank or 0 = unknown), each
// day's labor share of sales. Overtime premiums are priced weekly, so they are not spread over days here; the
// day costs add up to the roster's payroll minus its overtime premium.
export function dailyLabor(r, staff, salesText = "") {
  const wage = new Map(staff.map((p) => [p.name, p.wage]));
  const burden = 1 + ((r.options && r.options.burdenPct) || 0) / 100;
  const sales = String(salesText).split(/[,\s;]+/).filter((t) => t !== "").map((t) => Number(t.replace(/[$]/g, "")));
  const days = DAYS.map((d, i) => ({ day: d, hours: 0, cost: 0, sales: sales[i] > 0 ? sales[i] : null, pct: null }));
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const h = (a.slot.endMin - a.slot.startMin) / 60;
    days[a.slot.day].hours += h;
    days[a.slot.day].cost += h * (wage.get(a.person) || 0) * burden;
  }
  for (const d of days) if (d.sales) d.pct = (d.cost / d.sales) * 100;
  const withSales = days.filter((d) => d.pct !== null);
  const worst = withSales.length ? withSales.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  return { days, worst, hasSales: withSales.length > 0 };
}

// Sales per labor hour by day: the figure restaurants and shops staff to. With each day's sales (as in dailyLabor) and a
// target sales per labor hour, `needHours` is the hours that day's sales call for and `gap` is scheduled minus needed
// (positive = more hours than the target asks for). Days without sales are listed with nulls. Returns null when the
// target is not a positive number or no day has sales.
export function salesPerLaborHour(r, staff, salesText, target) {
  const t = Number(target);
  if (!(t > 0)) return null;
  const dl = dailyLabor(r, staff, salesText);
  if (!dl.hasSales) return null;
  const days = dl.days.map((d) => d.sales
    ? { day: d.day, hours: d.hours, sales: d.sales, splh: d.hours > 0 ? d.sales / d.hours : null, needHours: d.sales / t, gap: d.hours - d.sales / t }
    : { day: d.day, hours: d.hours, sales: null, splh: null, needHours: null, gap: null });
  const known = days.filter((d) => d.gap !== null);
  const over = known.filter((d) => d.gap > 0.5), under = known.filter((d) => d.gap < -0.5);
  return { target: t, days, over, under, totalGap: known.reduce((a, d) => a + d.gap, 0) };
}

// Headcount per hour for each day of the roster, so thin and heavy hours show at a glance. A shift counts on the day it
// starts; the hours after midnight of an overnight shift are listed under 24-47 on that day. `from`/`to` default to the
// span the roster actually uses. `thin` marks hours with exactly one person on, `empty` hours inside a day's span with none.
export function coverageGrid(r) {
  const cells = DAYS.map(() => new Map());
  let lo = Infinity, hi = -Infinity;
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const first = Math.floor(a.slot.startMin / 60), last = Math.ceil(a.slot.endMin / 60);
    for (let h = first; h < last; h++) cells[a.slot.day].set(h, (cells[a.slot.day].get(h) || 0) + 1);
    lo = Math.min(lo, first); hi = Math.max(hi, last);
  }
  if (!Number.isFinite(lo)) return { from: 0, to: 0, rows: [], peak: 0 };
  let peak = 0;
  const rows = DAYS.map((day, i) => {
    const counts = [];
    for (let h = lo; h < hi; h++) { const c = cells[i].get(h) || 0; counts.push(c); peak = Math.max(peak, c); }
    const used = counts.filter((c) => c > 0).length;
    return { day, counts, thin: counts.filter((c) => c === 1).length, empty: used ? counts.filter((c) => c === 0).length : 0 };
  });
  return { from: lo, to: hi, rows, peak };
}

// Predictive-scheduling style flags on a built roster, for rules the search does not enforce: hours in one day over
// `dailyLimit` (daily-overtime states), split shifts (two shifts one day with a gap over `splitGap` hours), and how many
// days of notice the week gets when the Monday and today's date are given. Flags only; not legal advice.
export function scheduleFlags(r, { dailyLimit = 8, splitGap = 1, mealAfter = 5, minDay = 0, weekStart = null, today = null, noticeDays = 14 } = {}) {
  const byKey = new Map();
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const k = a.person + "|" + a.slot.day;
    if (!byKey.has(k)) byKey.set(k, { person: a.person, day: a.slot.day, spans: [] });
    byKey.get(k).spans.push([a.slot.startMin, a.slot.endMin]);
  }
  const overDaily = [], splits = [], longStretches = [], shortDays = [];
  for (const g of byKey.values()) {
    g.spans.sort((x, y) => x[0] - y[0]);
    const hours = g.spans.reduce((t, [a, b]) => t + (b - a) / 60, 0);
    if (minDay > 0 && hours < minDay - 1e-9) shortDays.push({ person: g.person, day: DAYS[g.day], hours });
    if (hours > dailyLimit + 1e-9) overDaily.push({ person: g.person, day: DAYS[g.day], hours, overBy: hours - dailyLimit });
    let runStart = g.spans[0][0], runEnd = g.spans[0][1];
    const closeRun = () => { const h = (runEnd - runStart) / 60; if (h > mealAfter + 1e-9) longStretches.push({ person: g.person, day: DAYS[g.day], hours: h, startMin: runStart, endMin: runEnd }); };
    for (let i = 1; i < g.spans.length; i++) {
      if (g.spans[i][0] <= runEnd) runEnd = Math.max(runEnd, g.spans[i][1]);
      else { closeRun(); runStart = g.spans[i][0]; runEnd = g.spans[i][1]; }
      const gap = (g.spans[i][0] - g.spans[i - 1][1]) / 60;
      if (gap > splitGap + 1e-9) splits.push({ person: g.person, day: DAYS[g.day], gapHours: gap });
    }
    closeRun();
  }
  // Seven different days in the week: California and a few other states owe a premium for the 7th consecutive day.
  const daysWorked = new Map();
  for (const g of byKey.values()) { if (!daysWorked.has(g.person)) daysWorked.set(g.person, new Set()); daysWorked.get(g.person).add(g.day); }
  const sevenDays = [...daysWorked].filter(([, d]) => d.size === 7).map(([person]) => ({ person })).sort((a, b) => a.person.localeCompare(b.person));
  let notice = null;
  const w = weekStart ? new Date(weekStart + "T00:00:00Z") : null, t = today ? new Date(today + "T00:00:00Z") : null;
  if (w && t && !Number.isNaN(w + t)) {
    const days = Math.round((w - t) / 864e5);
    notice = { days, required: noticeDays, short: days < noticeDays };
  }
  const order = (a, b) => a.person.localeCompare(b.person) || DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
  return { overDaily: overDaily.sort(order), splits: splits.sort(order), longStretches: longStretches.sort(order), shortDays: shortDays.sort(order), sevenDays, notice };
}

// Stretches where someone marked `minor` (or `supervised`) is on shift and nobody who is not marked is. A rule many
// places set for under-18s and trainees: never the only one in. Counts only people on this roster; the search does not
// enforce it, so this is a heads-up to fix by hand (swap in an adult, or pin one with `fixed:`). Returns
// [{ people, day, startMin, endMin }] in week order, adjacent minutes merged; an overnight stretch ends the next morning.
export function unsupervisedStretches(r, staff) {
  const sup = new Set((staff || []).filter((p) => p.supervised).map((p) => p.name));
  if (!sup.size) return [];
  const spans = [];
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const base = a.slot.day * 1440, end = a.slot.endMin <= a.slot.startMin ? a.slot.endMin + 1440 : a.slot.endMin;
    spans.push({ person: a.person, s: base + a.slot.startMin, e: base + end });
  }
  const cuts = [...new Set(spans.flatMap((x) => [x.s, x.e]))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [lo, hi] = [cuts[i], cuts[i + 1]];
    const here = spans.filter((x) => x.s <= lo && x.e >= hi).map((x) => x.person);
    if (!here.length || here.some((n) => !sup.has(n))) continue;
    const people = [...new Set(here)].sort();
    const last = out[out.length - 1];
    if (last && last.end === lo && last.people.join() === people.join()) last.end = hi;
    else out.push({ people, start: lo, end: hi });
  }
  return out.map((x) => { const d = Math.floor(x.start / 1440); return { people: x.people, day: DAYS[d % 7], startMin: x.start - d * 1440, endMin: (x.end - d * 1440) % 1440 || 1440 }; });
}

// Stretches where exactly one person is on shift and nobody else is, lasting more than `overHours` (lone-worker
// rule of thumb: cash handling, closing, safety). A heads-up, not a search constraint. Consecutive cuts with the same
// person merge; a stretch that crosses midnight is reported on the day it starts.
export function loneStretches(r, overHours = 2) {
  const spans = [];
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const base = a.slot.day * 1440, end = a.slot.endMin <= a.slot.startMin ? a.slot.endMin + 1440 : a.slot.endMin;
    spans.push({ person: a.person, s: base + a.slot.startMin, e: base + end });
  }
  const cuts = [...new Set(spans.flatMap((x) => [x.s, x.e]))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [lo, hi] = [cuts[i], cuts[i + 1]];
    const here = [...new Set(spans.filter((x) => x.s <= lo && x.e >= hi).map((x) => x.person))];
    if (here.length !== 1) continue;
    const last = out[out.length - 1];
    if (last && last.end === lo && last.person === here[0]) last.end = hi;
    else out.push({ person: here[0], start: lo, end: hi });
  }
  return out.filter((x) => (x.end - x.start) / 60 > overHours).map((x) => {
    const d = Math.floor(x.start / 1440);
    return { person: x.person, day: DAYS[d % 7], startMin: x.start - d * 1440, endMin: (x.end - d * 1440) % 1440 || 1440, hours: (x.end - x.start) / 60 };
  });
}

// Assigned shifts shorter than `minHours`, for places that want a minimum shift (or pay a reporting-time premium on
// short ones). Counts the whole shift as listed, meal break included. A heads-up only; the search does not enforce it.
export function shortShifts(r, minHours = 4) {
  const out = [];
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const { day, startMin, endMin } = a.slot;
    const hours = ((endMin <= startMin ? endMin + 1440 : endMin) - startMin) / 60;
    if (hours < minHours) out.push({ person: a.person, day: DAYS[day % 7], startMin, endMin, hours });
  }
  return out;
}

// What a seventh-consecutive-day premium would add for each person who works all seven days of the week (the last day
// is DAYS[6], so this assumes the workweek starts on Monday). California's rule is 1.5x for the first `firstHours` of
// that day and 2x after; both multipliers are yours to set. Returns only the extra over straight time (burden
// included), by person, plus the total. The search does not price it, so this is a figure to compare, not a roster
// input. A planning aid, not a statement of what any state requires.
export function seventhDayPay(r, { firstHours = 8, firstMult = 1.5, laterMult = 2, burdenPct = 0 } = {}) {
  const wages = new Map((r.people || []).map((p) => [p.name, p.wage]));
  const sevens = new Set(scheduleFlags(r).sevenDays.map((x) => x.person));
  const hours = new Map();
  for (const a of r.assignments || []) {
    if (!a.person || a.slot.day !== 6 || !sevens.has(a.person)) continue;
    hours.set(a.person, (hours.get(a.person) || 0) + (a.slot.endMin - a.slot.startMin) / 60);
  }
  const burden = 1 + burdenPct / 100;
  const rows = [...hours].map(([person, h]) => {
    const first = Math.min(h, firstHours), later = Math.max(0, h - firstHours), wage = wages.get(person) || 0;
    return { person, hours: h, extra: wage * (first * (firstMult - 1) + later * (laterMult - 1)) * burden };
  }).sort((a, b) => a.person.localeCompare(b.person));
  return { rows, total: rows.reduce((t, x) => t + x.extra, 0) };
}

// What split-shift and spread-of-hours premiums would add, for scale. Several places (California, New York State) owe
// one extra hour at the minimum wage on a day with an unpaid gap longer than `splitGap` hours (split shift) or with
// first-to-last clock time longer than `spread` hours (spread of hours); one premium per person-day even if both
// apply. Real rules differ (New York exempts people paid above minimum for some cases, California credits wages above
// minimum), so `minWage` and `premiumHours` are yours to set and `credit` lets pay above `minWage` offset the premium.
// An estimate, not the search's objective and not legal advice.
export function splitShiftPay(r, { minWage = 0, premiumHours = 1, splitGap = 1, spread = 10, burdenPct = 0, credit = false } = {}) {
  const wages = new Map((r.people || []).map((p) => [p.name, p.wage]));
  const byKey = new Map();
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const k = a.person + "|" + a.slot.day;
    if (!byKey.has(k)) byKey.set(k, { person: a.person, day: a.slot.day, spans: [] });
    byKey.get(k).spans.push([a.slot.startMin, a.slot.endMin]);
  }
  const burden = 1 + burdenPct / 100;
  const rows = [];
  for (const g of byKey.values()) {
    g.spans.sort((x, y) => x[0] - y[0]);
    let gap = 0, end = g.spans[0][1];
    for (const [a, b] of g.spans.slice(1)) { gap = Math.max(gap, (a - end) / 60); end = Math.max(end, b); }
    const span = (end - g.spans[0][0]) / 60, worked = g.spans.reduce((t, [a, b]) => t + (b - a) / 60, 0);
    const split = gap > splitGap + 1e-9, wide = span > spread + 1e-9;
    if (!split && !wide) continue;
    const wage = wages.get(g.person) || 0;
    // California-style credit: wages above minimum for the hours worked that day count toward the premium.
    const owed = credit ? Math.max(0, minWage * premiumHours - Math.max(0, wage - minWage) * worked) : minWage * premiumHours;
    rows.push({ person: g.person, day: DAYS[g.day], reason: split && wide ? "split and spread" : split ? "split" : "spread", gapHours: gap, spanHours: span, extra: owed * burden });
  }
  rows.sort((a, b) => a.person.localeCompare(b.person) || DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  return { rows, total: rows.reduce((t, x) => t + x.extra, 0) };
}

// Puts a meal break on the clock for every straight stretch longer than `mealAfter` hours (back-to-back shifts joined).
// The break starts on a `step`-minute mark, no earlier than `earliest` minutes into the stretch, early enough to begin
// before `mealAfter` hours have passed and to leave `tail` minutes after it. Among those starts it picks the one that
// keeps the most other people on the clock (people working then who are not on a break already placed); ties go to the
// start nearest the middle. Stretches are handled longest first, so the staggering is greedy, not optimal. `alone` is
// set when nobody else is on during the break. A planning aid: when breaks are owed is the employer's to check.
export function placeBreaks(r, { mealAfter = 5, mealMin = 30, step = 15, earliest = 120, tail = 60 } = {}) {
  const byKey = new Map();
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const k = a.person + "|" + a.slot.day;
    if (!byKey.has(k)) byKey.set(k, { person: a.person, day: a.slot.day, spans: [] });
    byKey.get(k).spans.push([a.slot.startMin, a.slot.endMin]);
  }
  const stretches = [];
  for (const g of byKey.values()) {
    g.spans.sort((x, y) => x[0] - y[0]);
    let a = g.spans[0][0], b = g.spans[0][1];
    for (let i = 1; i <= g.spans.length; i++) {
      if (i < g.spans.length && g.spans[i][0] <= b) { b = Math.max(b, g.spans[i][1]); continue; }
      if ((b - a) / 60 > mealAfter + 1e-9) stretches.push({ person: g.person, day: g.day, start: a, end: b });
      if (i < g.spans.length) { a = g.spans[i][0]; b = g.spans[i][1]; }
    }
  }
  stretches.sort((x, y) => (y.end - y.start) - (x.end - x.start) || x.day - y.day || x.start - y.start || x.person.localeCompare(y.person));
  const placed = [];
  const present = (person, day, t0, t1) => (r.assignments || []).some((a) => a.person === person && a.slot.day === day && a.slot.startMin < t1 && a.slot.endMin > t0);
  const onBreak = (person, day, t0, t1) => placed.some((x) => x.person === person && x.day === day && x.startMin < t1 && x.endMin > t0);
  const people = [...new Set((r.assignments || []).filter((a) => a.person).map((a) => a.person))];
  for (const st of stretches) {
    const lo = st.start + earliest, hi = Math.min(st.start + mealAfter * 60, st.end - tail - mealMin);
    const mid = (st.start + st.end) / 2 - mealMin / 2;
    let best = null;
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
      const others = people.filter((p) => p !== st.person && present(p, st.day, t, t + mealMin) && !onBreak(p, st.day, t, t + mealMin)).length;
      const dist = Math.abs(t - mid);
      if (!best || others > best.others || (others === best.others && dist < best.dist)) best = { t, others, dist };
    }
    if (!best) best = { t: Math.max(st.start + 60, Math.min(st.start + mealAfter * 60, st.end - mealMin)), others: 0 };
    placed.push({ person: st.person, day: st.day, startMin: best.t, endMin: best.t + mealMin, others: best.others, alone: best.others === 0 });
  }
  placed.sort((x, y) => x.person.localeCompare(y.person) || x.day - y.day);
  return placed.map((x) => ({ ...x, dayName: DAYS[x.day] }));
}

// Paid rest breaks: one for every full `restEvery` hours of a straight stretch (back-to-back shifts joined), `restMin`
// minutes each, spread evenly (each centred in its own equal part of the stretch). A break starts on a `step`-minute
// mark within `window` minutes of that centre, at least `edge` minutes after the stretch starts and before its last
// `edge` minutes, and never overlaps the person's meal break from placeBreaks (pass `mealAfter` 0 to ignore meals).
// Among the starts it picks the one that keeps the most other people on the floor, ties to the nearest the centre;
// `alone` is set when nobody else is on. Paid time, so it changes no payroll figure. The numbers are the operator's
// (there is no built-in law); a planning aid, when breaks are owed is the employer's to check.
export function placeRestBreaks(r, { restEvery = 4, restMin = 10, step = 5, window = 60, edge = 30, mealAfter = 5, mealMin = 30 } = {}) {
  if (!(restEvery > 0) || !(restMin > 0)) return [];
  const asg = (r.assignments || []).filter((a) => a.person);
  const meals = mealAfter > 0 ? placeBreaks(r, { mealAfter, mealMin }) : [];
  const byKey = new Map();
  for (const a of asg) {
    const k = a.person + "|" + a.slot.day;
    if (!byKey.has(k)) byKey.set(k, { person: a.person, day: a.slot.day, spans: [] });
    byKey.get(k).spans.push([a.slot.startMin, a.slot.endMin]);
  }
  const stretches = [];
  for (const g of byKey.values()) {
    g.spans.sort((x, y) => x[0] - y[0]);
    let a = g.spans[0][0], b = g.spans[0][1];
    for (let i = 1; i <= g.spans.length; i++) {
      if (i < g.spans.length && g.spans[i][0] <= b) { b = Math.max(b, g.spans[i][1]); continue; }
      const n = Math.floor((b - a) / 60 / restEvery + 1e-9);
      if (n >= 1) stretches.push({ person: g.person, day: g.day, start: a, end: b, n });
      if (i < g.spans.length) { a = g.spans[i][0]; b = g.spans[i][1]; }
    }
  }
  stretches.sort((x, y) => (y.end - y.start) - (x.end - x.start) || x.day - y.day || x.start - y.start || x.person.localeCompare(y.person));
  const placed = [];
  const present = (p, day, t0, t1) => asg.some((a) => a.person === p && a.slot.day === day && a.slot.startMin < t1 && a.slot.endMin > t0);
  const busy = (p, day, t0, t1) => [...meals, ...placed].some((x) => x.person === p && x.day === day && x.startMin < t1 && x.endMin > t0);
  const people = [...new Set(asg.map((a) => a.person))];
  for (const st of stretches) {
    for (let k = 0; k < st.n; k++) {
      const centre = st.start + ((st.end - st.start) * (k + 0.5)) / st.n - restMin / 2;
      const lo = Math.max(st.start + edge, centre - window), hi = Math.min(st.end - edge - restMin, centre + window);
      let best = null;
      for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
        if (busy(st.person, st.day, t, t + restMin)) continue;
        const others = people.filter((p) => p !== st.person && present(p, st.day, t, t + restMin) && !busy(p, st.day, t, t + restMin)).length;
        const dist = Math.abs(t - centre);
        if (!best || others > best.others || (others === best.others && dist < best.dist)) best = { t, others, dist };
      }
      if (!best) continue;
      placed.push({ person: st.person, day: st.day, startMin: best.t, endMin: best.t + restMin, others: best.others, alone: best.others === 0 });
    }
  }
  placed.sort((x, y) => x.person.localeCompare(y.person) || x.day - y.day || x.startMin - y.startMin);
  return placed.map((x) => ({ ...x, dayName: DAYS[x.day] }));
}

// Who gets the shifts people trade favours to avoid: per person, weekend shifts (start Sat or Sun), closing shifts (end
// at or after `closeAt`, default 10pm, or run past midnight), opening shifts (start at or before `openAt`, default 6am)
// and "tough" shifts, meaning any of the three, counted once. `spread` is the largest minus the smallest tough count
// among people who work at all; `flag` is set when it is 3 or more, so one person is not stuck with every close.
// A report only: the search does not balance these, and people differ in what they asked for.
export function fairnessReport(r, { closeAt = 22 * 60, openAt = 6 * 60 } = {}) {
  const by = new Map((r.people || []).map((p) => [p.name, { name: p.name, shifts: 0, hours: 0, weekend: 0, closing: 0, opening: 0, tough: 0 }]));
  for (const a of r.assignments || []) {
    if (!a.person || !by.has(a.person)) continue;
    const x = by.get(a.person), s = a.slot;
    const weekend = s.day >= 5, closing = s.endMin >= closeAt || s.endMin > 1440 || s.endMin <= s.startMin, opening = s.startMin <= openAt;
    x.shifts++; x.hours += (s.endMin - s.startMin) / 60;
    if (weekend) x.weekend++;
    if (closing) x.closing++;
    if (opening) x.opening++;
    if (weekend || closing || opening) x.tough++;
  }
  const rows = [...by.values()].filter((x) => x.shifts > 0).sort((a, b) => b.tough - a.tough || a.name.localeCompare(b.name));
  const spread = rows.length ? rows[0].tough - rows[rows.length - 1].tough : 0;
  return { rows, spread, flag: spread >= 3, most: rows.length ? rows[0] : null, least: rows.length ? rows[rows.length - 1] : null };
}

// Weekly-hours cliffs: employers often have a line where hours change what a person is owed (the 30-hour full-time
// line for health coverage in the US, a benefits or paid-leave eligibility line). Lists who is over `threshold` hours
// and who is within `within` hours under it, so a few hours can be moved on purpose. A report only, using scheduled
// (paid) hours; it states no legal requirement and the search does not enforce it.
export function hoursThresholds(r, { threshold = 30, within = 2 } = {}) {
  if (!(threshold > 0)) return { threshold, within, over: [], near: [] };
  const people = (r.people || []).filter((p) => p.hours > 0);
  const over = people.filter((p) => p.hours >= threshold - 1e-9).map((p) => ({ name: p.name, hours: p.hours, by: p.hours - threshold }));
  const near = people.filter((p) => p.hours < threshold - 1e-9 && p.hours >= threshold - within - 1e-9).map((p) => ({ name: p.name, hours: p.hours, short: threshold - p.hours }));
  over.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  near.sort((a, b) => a.short - b.short || a.name.localeCompare(b.name));
  return { threshold, within, over, near };
}

// Tip pool: split a pot of tips across the people on the roster in proportion to scheduled (paid) hours. Works in whole
// cents with the largest-remainder rule, so the shares always add back to the pot exactly. A planning aid only: tip
// pooling rules (who may share, manager exclusions, house-share limits) differ by place and are the employer's to apply.
export function tipPool(r, pot) {
  const cents = Math.round(Number(pot) * 100);
  const people = (r.people || []).filter((p) => p.hours > 0);
  const total = people.reduce((a, p) => a + p.hours, 0);
  if (!(cents > 0) || !(total > 0)) return { pot: 0, hours: total, rows: [] };
  const rows = people.map((p) => {
    const exact = (cents * p.hours) / total;
    return { name: p.name, hours: p.hours, cents: Math.floor(exact + 1e-9), frac: exact - Math.floor(exact + 1e-9) };
  });
  let left = cents - rows.reduce((a, x) => a + x.cents, 0);
  [...rows].sort((a, b) => b.frac - a.frac || a.name.localeCompare(b.name)).forEach((x) => { if (left > 0) { x.cents++; left--; } });
  rows.sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  return { pot: cents / 100, hours: total, rows: rows.map((x) => ({ name: x.name, hours: x.hours, share: x.cents / 100, perHour: x.cents / 100 / x.hours })) };
}

export function hoursCsv(r) {
  const rows = ["person,shifts,hours,overtime_hours,estimated_payroll,minimum_hours,hours_under_minimum"];
  for (const p of r.people) rows.push([p.name.includes(",") ? `"${p.name}"` : p.name, p.shifts, p.hours.toFixed(2), p.otHours.toFixed(2), p.cost.toFixed(2), p.minHours, p.short.toFixed(2)].join(","));
  return rows.join("\n") + "\n";
}

// ---- Collecting availability from the team -------------------------------------------------
// availability.html has each person fill a week grid and sends the manager one line of text
// back; mergeAvailabilityReplies drops those lines into the staff list. Nothing is uploaded:
// the reply travels by whatever the manager already uses (text, email, chat).

const clockText = (m) => (m % 60 === 0 ? String(m / 60) : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);

// grid: seven entries Mon..Sun, each { mode: "any" | "off" | "range", from, to } (minutes from midnight).
// Adjacent days with the same window are written as a range ("Mon-Fri 9-17"). Days off are written out
// ("Sat-Sun off") so an all-off week is not mistaken for the blank cell that means "any time".
export function availabilityFromGrid(grid) {
  const keyOf = (g) => (!g || g.mode === "off" ? "off" : g.mode === "any" ? "0-24" : `${clockText(g.from)}-${clockText(g.to)}`);
  const parts = [];
  for (let d = 0; d < 7;) {
    const k = keyOf(grid[d]);
    let e = d;
    while (e + 1 < 7 && keyOf(grid[e + 1]) === k) e++;
    parts.push(`${d === e ? DAYS[d] : `${DAYS[d]}-${DAYS[e]}`} ${k}`);
    d = e + 1;
  }
  return parts.join("; ");
}

// One reply per line: "Name | availability | max: 30 | off: Wed | avoid: Fri 5pm-close".
export function parseAvailabilityReply(line) {
  const cells = String(line).split("|").map((c) => c.trim());
  const name = cells[0];
  if (!name || cells.length < 2 || !cells[1]) return { error: `"${String(line).trim().slice(0, 40)}" is not a reply line; write Name | availability | optional max: hours` };
  const av = parseAvailability(cells[1]);
  if (av.errors.length) return { error: `${name}: ${av.errors[0]}` };
  const out = { name, availability: cells[1], max: null, extras: [] };
  for (const c of cells.slice(2)) {
    if (/^max(imum)?(\s*hours)?\s*:/i.test(c)) {
      const n = Number(c.replace(/^[^:]*:/, "").replace(/h(ours?)?$/i, "").trim());
      if (!Number.isFinite(n) || n < 0) return { error: `${name}: could not read "${c}"` };
      out.max = n;
    } else if (OFF_CELL.test(c) || AVOID_CELL.test(c) || PREFER_CELL.test(c)) out.extras.push(c);
    else if (c) return { error: `${name}: could not read "${c}"` };
  }
  return out;
}

export function mergeAvailabilityReplies(staffText, repliesText) {
  const lines = String(staffText || "").split(/\r?\n/);
  const errors = [], updated = [], added = [];
  const isExtra = (x) => ROLE_CELL.test(x) || PREV_CELL.test(x) || OFF_CELL.test(x) || DAILY_CELL.test(x) || AVOID_CELL.test(x) || PREFER_CELL.test(x) || TOUGH_CELL.test(x) || STREAK_CELL.test(x);
  const rowOf = (name) => lines.findIndex((l) => { const t = l.trim(); return t && !t.startsWith("#") && splitLine(t)[0].toLowerCase() === name.toLowerCase(); });
  for (const raw of String(repliesText || "").split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const r = parseAvailabilityReply(raw);
    if (r.error) { errors.push(r.error); continue; }
    const i = rowOf(r.name);
    if (i < 0) {
      lines.push([r.name, "", r.max ?? 40, 0, r.availability, ...r.extras].join(", "));
      added.push(r.name);
      continue;
    }
    const c = splitLine(lines[i].trim());
    while (c.length < 4) c.push("");
    const replaced = (re) => r.extras.some((x) => re.test(x));
    const keep = c.slice(4).filter((x) => isExtra(x) && !(OFF_CELL.test(x) && replaced(OFF_CELL)) && !(AVOID_CELL.test(x) && replaced(AVOID_CELL)) && !(PREFER_CELL.test(x) && replaced(PREFER_CELL)));
    const was = c[2] === "" ? 40 : Number(c[2]);
    if (r.max !== null && (!Number.isFinite(was) || r.max < was)) c[2] = String(r.max);
    if (Number(c[3]) > Number(c[2])) c[3] = c[2];
    lines[i] = [...c.slice(0, 4), r.availability, ...r.extras, ...keep].join(", ");
    updated.push(r.name);
  }
  return { text: lines.join("\n"), updated, added, errors };
}

// A dated whole-day time-off request ("2026-11-04" or "2026-11-04" to "2026-11-06") for one person, as the `off:` entry
// it becomes. Returns { entry } or { error }.
export function parseTimeOffRequest(from, to = "") {
  const real = (v) => { const d = new Date(v + "T00:00:00Z"); return ISO_DATE.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; };
  from = String(from || "").trim(); to = String(to || "").trim() || from;
  if (!real(from) || !real(to)) return { error: "Write the dates as YYYY-MM-DD." };
  const days = utcDay(to) - utcDay(from);
  if (days < 0) return { error: "The last day is before the first day." };
  if (days > 59) return { error: "Ask for 60 days or fewer at a time." };
  return { entry: from === to ? from : `${from}..${to}` };
}

// Add one `off:` entry to a person's row in the staff text, joining an existing off: cell instead of adding a second.
// Returns { text } or { error } when the name is not on the list.
export function addTimeOff(staffText, name, entry) {
  const lines = String(staffText || "").split(/\r?\n/);
  const i = lines.findIndex((l) => { const t = l.trim(); return t && !t.startsWith("#") && splitLine(t)[0].toLowerCase() === String(name).toLowerCase(); });
  if (i < 0) return { error: `${name} is not on the staff list.` };
  const c = splitLine(lines[i].trim());
  while (c.length < 5) c.push("");
  const k = c.findIndex((x, j) => j >= 4 && OFF_CELL.test(x));
  if (k < 0) c.push(`off: ${entry}`);
  else if (!c[k].split(":").slice(1).join(":").split(";").map((x) => x.trim()).includes(entry)) c[k] = `${c[k]}; ${entry}`;
  lines[i] = c.join(", ");
  return { text: lines.join("\n") };
}

export function sampleStaff() {
  return [
    "name, wage, max hours, min hours, availability",
    "Ana, 18, 40, 30, Mon-Sat 6-22",
    "Ben, 16, 32, 20, Mon-Fri 6-22; Sat 8-16",
    "Cleo, 15, 30, 12, Mon-Fri 15-23; Sat-Sun 8-23",
    "Dev, 17, 40, 24, Tue-Sun 6-23",
    "Eli, 14, 24, 8, Mon/Wed/Fri 16-23; Sat-Sun 8-23",
    "Fay, 15.5, 32, 16, Mon-Thu 6-15; Sun 6-18",
    "Gus, 19, 40, 0, any",
  ].join("\n");
}

export function sampleShifts() {
  return [
    "day, start, end, people needed, label",
    "Mon-Fri, 6, 14, 2, open",
    "Mon-Fri, 11, 14, 1, lunch",
    "Mon-Fri, 14, 22, 2, close",
    "Sat, 8, 16, 2, open",
    "Sat, 12, 22, 2, close",
    "Sun, 8, 16, 2, open",
    "Sun, 14, 22, 1, close",
  ].join("\n");
}

// One-click starting points for the page's "Start from a template" picker. Invented teams and wages;
// each parses cleanly and builds a roster (tested), so a first visitor sees a result without typing.
export const TEMPLATES = {
  cafe: { label: "Café / restaurant", staff: sampleStaff, shifts: sampleShifts },
  salon: {
    label: "Hair salon / barbershop",
    staff: () => [
      "name, wage, max hours, min hours, availability",
      "Mia, 24, 40, 30, Tue-Sat 9-19",
      "Noah, 22, 36, 24, Tue-Fri 9-19; Sat 8-17",
      "Orla, 20, 32, 16, Wed-Sun 10-20",
      "Paz, 16, 24, 8, Thu-Sat 9-19",
      "Quin, 15, 20, 0, Sat-Sun 9-17",
    ].join("\n"),
    shifts: () => [
      "day, start, end, people needed, label",
      "Tue-Wed, 10, 18, 2, quiet days",
      "Thu-Fri, 9, 14, 2, morning chairs",
      "Thu-Fri, 14, 19, 2, afternoon chairs",
      "Sat, 9, 17, 3, busy day",
      "Sun, 10, 16, 1, front desk",
    ].join("\n"),
  },
  retail: {
    label: "Retail shop",
    staff: () => [
      "name, wage, max hours, min hours, availability",
      "Ruth, 19, 40, 32, Mon-Sat 8-21",
      "Sam, 16, 32, 20, Mon-Fri 12-21; Sat-Sun 9-18",
      "Tess, 15, 28, 12, Tue-Sun 9-18",
      "Uma, 15, 24, 8, Mon-Wed 16-21; Sat-Sun 9-21",
      "Vic, 17, 40, 24, any",
    ].join("\n"),
    shifts: () => [
      "day, start, end, people needed, label",
      "Mon-Fri, 9, 15, 1, open",
      "Mon-Fri, 15, 21, 2, close",
      "Sat-Sun, 9, 18, 2, weekend floor",
      "Sat, 12, 21, 1, late",
    ].join("\n"),
  },
  clinic: {
    label: "Clinic / front office",
    staff: () => [
      "name, wage, max hours, min hours, availability, [roles: a|b]",
      "Wen, 34, 40, 32, Mon-Fri 7-19, roles: nurse",
      "Xia, 33, 36, 24, Mon-Thu 7-19, roles: nurse",
      "Yan, 21, 40, 32, Mon-Fri 7-18",
      "Zed, 20, 30, 16, Mon-Fri 12-19; Sat 8-13",
      "Abe, 31, 24, 0, Tue/Thu/Sat 7-19, roles: nurse",
    ].join("\n"),
    shifts: () => [
      "day, start, end, people needed, label, role",
      "Mon-Fri, 8, 13, 1, nurse am, role: nurse",
      "Mon-Fri, 13, 18, 1, nurse pm, role: nurse",
      "Mon-Fri, 8, 17, 1, front desk",
      "Sat, 8, 13, 1, saturday clinic, role: nurse",
    ].join("\n"),
  },
};

export const _paidMinutes = paidMinutes;
export const _internals = { buildContext, scoreOwner, ownerValid, validList, BIG };
