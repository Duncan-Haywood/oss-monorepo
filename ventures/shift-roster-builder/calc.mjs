// Shift roster builder: assign named people to the shifts you need covered.
// Hard rules (availability, weekly hour cap, rest between shifts, consecutive
// days, no double-booking) are never broken; everything else is a cost in
// dollars that a seeded simulated-annealing search minimises. Pure functions,
// no DOM, no network, no randomness except a fixed-seed generator, so the same
// input always gives the same roster.

import { branchAndPriceOpen, columnGenerationOpen, solveLP } from "./bnp.mjs";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ALIASES = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};
const BIG = 100000; // dollars per uncovered hour: covering a shift always beats saving money
const MAX_SLOTS = 400;
const MAX_STAFF = 60;
const BIG_WEEK = 150; // shifts; above this the improvement passes run on a time budget
// Default wall-clock budget for the improvement passes: 20 s for a week strictly above BIG_WEEK shifts, none at or below it.
export const defaultBudgetMs = (shifts) => (shifts > BIG_WEEK ? 20000 : 0);

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
  return splitCells(line);
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
// Sites (2026-11-14): "site: Harbour" on a shift says which shop it is at; "sites: Main | Harbour" on a person says where
// they can work (no cell = anywhere). One run then plans several shops from one staff list, so the weekly hour cap,
// rest rule and no-double-booking hold across them. Names match with case and punctuation ignored ("Main St." = "main st").
const SITE_CELL = /^(site|location|shop|store)\s*:/i;
const SITES_CELL = /^(sites|locations|shops|stores)\s*:/i;
export const siteKey = (x) => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const parseSites = (cell) => cell.replace(SITES_CELL, "").replace(SITE_CELL, "").split(/[|/&+;]/).map(siteKey).filter(Boolean);
// Travel between sites (2026-11-14): "30" = every pair of named sites is 30 minutes apart; "Main to Airport 60" sets one pair
// (either direction); items are separated by ";" or ",". Durations take "45", "45 min" or "1.5h". A person's two shifts at
// different named sites then need max(rest, travel) between the end of one and the start of the next, so with the rest rule
// lowered for split shifts nobody closes one shop at 3pm and opens the other at 3pm. Returns { all, pairs, errors }.
const travelDur = (t) => {
  const m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)?$/i.exec(String(t).trim());
  if (!m) return null;
  return /^h/i.test(m[2] || "") ? Number(m[1]) * 60 : Number(m[1]);
};
export function parseTravel(spec) {
  const out = { all: 0, pairs: [], errors: [] };
  if (spec === undefined || spec === null || spec === "") return out;
  if (typeof spec === "number") { if (spec >= 0 && Number.isFinite(spec)) out.all = spec; else out.errors.push("travel minutes must be 0 or more"); return out; }
  for (const raw of String(spec).split(/[;,\n]/)) {
    const item = raw.trim();
    if (!item) continue;
    const d = travelDur(item);
    if (d !== null) { out.all = d; continue; }
    const m = /^(.+?)\s+(?:to|<->|<>|and)\s+(.+?)\s+(\d+(?:\.\d+)?\s*[a-z]*)$/i.exec(item);
    const mins = m ? travelDur(m[3]) : null;
    if (!m || mins === null || !siteKey(m[1]) || !siteKey(m[2])) { out.errors.push(`travel: could not read "${item}"; write "30" (minutes between any two sites) or "Main to Airport 45"`); continue; }
    if (siteKey(m[1]) === siteKey(m[2])) { out.errors.push(`travel: "${item}" names the same site twice`); continue; }
    out.pairs.push([siteKey(m[1]), siteKey(m[2]), mins]);
  }
  return out;
}

// Per-ctx travel table: site index per shift (-1 = no site) and an n x n minute matrix, or null when no pair needs more than
// the rest rule already gives (then every check below is skipped and builds are byte-identical to before).
function travelTable(o, slots, restMin) {
  if (o.travel === undefined || o.travel === null || o.travel === "") return null;
  const tt = siteTripTable(o, slots);
  return tt && tt.T.some((v) => v > restMin) ? tt : null;
}
// The site and trip-minute table alone, whatever the rest rule. Paid travel (below) needs it even when every trip fits inside
// the rest rule, because the trip is paid either way. Null with fewer than two named sites.
function siteTripTable(o, slots) {
  const tv = parseTravel(o.travel);
  const names = [...new Set(slots.filter((s) => s.site).map((s) => siteKey(s.site)))].sort();
  if (names.length < 2) return null;
  const n = names.length, id = new Map(names.map((x, k) => [x, k]));
  const T = new Float64Array(n * n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) T[a * n + b] = a === b ? 0 : tv.all;
  for (const [x, y, m] of tv.pairs) {
    if (!id.has(x) || !id.has(y)) continue;
    T[id.get(x) * n + id.get(y)] = m; T[id.get(y) * n + id.get(x)] = m;
  }
  const site = Int32Array.from(slots, (s) => (s.site ? id.get(siteKey(s.site)) : -1));
  return { n, names, T, site, endBy: new Float64Array(n) };
}

// Wages by site (2026-11-14). `siteWage` reads "Airport +2; Harbour +10%; Downtown min 20.17": at a named site a person is paid
// their own wage plus a dollar amount and/or a percentage, and at least a floor (a city's or airport's higher minimum wage).
// Several parts combine ("Airport +1 min 20.17"); a minus sign makes a cheaper site. Sites not listed pay the person's own wage.
export function parseSiteWage(spec) {
  const out = { rules: [], errors: [] };
  if (spec === undefined || spec === null || String(spec).trim() === "") return out;
  for (const raw of String(spec).split(/[;\n]/)) {
    const item = raw.trim();
    if (!item) continue;
    const m = /^(.+?)((?:\s+(?:[+-]\s*\$?\d+(?:\.\d+)?\s*%?|(?:min(?:imum)?|at least|>=)\s*\$?\d+(?:\.\d+)?))+)\s*$/i.exec(item);
    if (!m || !siteKey(m[1])) { out.errors.push(`site wage: could not read "${item}"; write "Airport +2" (dollars an hour more), "Airport +10%" or "Airport min 20.17"`); continue; }
    const rule = { site: siteKey(m[1]), label: m[1].trim(), add: 0, pct: 0, min: 0 };
    for (const part of m[2].matchAll(/([+-])\s*\$?(\d+(?:\.\d+)?)\s*(%?)|(?:min(?:imum)?|at least|>=)\s*\$?(\d+(?:\.\d+)?)/gi)) {
      if (part[4] !== undefined) rule.min = Math.max(rule.min, Number(part[4]));
      else if (part[3]) rule.pct += (part[1] === "-" ? -1 : 1) * Number(part[2]);
      else rule.add += (part[1] === "-" ? -1 : 1) * Number(part[2]);
    }
    if (rule.pct <= -100) { out.errors.push(`site wage: "${item}" takes the whole wage away`); continue; }
    if (out.rules.some((r) => r.site === rule.site)) { out.errors.push(`site wage: "${rule.label}" is listed twice; the first is used`); continue; }
    out.rules.push(rule);
  }
  return out;
}
export const siteRate = (wage, rule) => (rule ? Math.max(rule.min, Math.max(0, wage * (1 + rule.pct / 100) + rule.add)) : wage);
// A person's own rate at one site (2026-11-14): a staff cell "wage at Airport: 24" (or "rate at Airport: +2", "+10%", "-1";
// "wage @ Airport", "pay at Airport" read the same). An absolute figure is their hourly rate there; a signed one is relative to
// their own wage. It replaces the site rule's dollar and percentage parts for that person, since a rate agreed with one person
// is usually all-in, but never the site's floor: a city's minimum wage still applies. Returns { site, label, abs, add, pct } or
// { error }.
const SITE_PAY_CELL = /^(?:wage|rate|pay)\s+(?:at|@)\s+([^:]+?)\s*:/i;
export function parsePersonSiteWage(cell) {
  const m = SITE_PAY_CELL.exec(String(cell).trim());
  if (!m || !siteKey(m[1])) return { error: `could not read "${cell}"; write it like "wage at Airport: 24" or "wage at Airport: +2"` };
  const v = String(cell).trim().slice(m[0].length).trim().replace(/\s*(\/\s*h(ou)?r?|an hour)$/i, "");
  const out = { site: siteKey(m[1]), label: m[1].trim(), abs: null, add: 0, pct: 0 };
  const rel = /^([+-])\s*\$?(\d+(?:\.\d+)?)\s*(%?)$/.exec(v), abs = /^\$?\s*(\d+(?:\.\d+)?)$/.exec(v);
  if (rel) { const x = (rel[1] === "-" ? -1 : 1) * Number(rel[2]); if (rel[3]) out.pct = x; else out.add = x; }
  else if (abs) out.abs = Number(abs[1]);
  else return { error: `could not read "${cell}"; write it like "wage at Airport: 24" (dollars an hour there) or "wage at Airport: +2"` };
  if (out.pct <= -100) return { error: `"${cell}" takes the whole wage away` };
  if (out.abs !== null && out.abs > 10000) return { error: `"${cell}": an hourly wage over $10,000 is probably a typo` };
  return out;
}
// A person's rate on a shift at site key k: their own cell for k if they have one (the site floor still applies), else the
// site rule, else their own wage.
export function personSiteRate(person, k, rule) {
  const own = k && person.siteWages ? person.siteWages.get(k) : null;
  if (!own) return siteRate(person.wage, rule);
  const v = own.abs !== null ? own.abs : Math.max(0, person.wage * (1 + own.pct / 100) + own.add);
  return Math.max(rule ? rule.min : 0, v);
}
// Per-ctx rate table: at[p][i] is person p's hourly rate on shift i, low[p] the least of their rates and their own wage (the
// floors below use it). Null when no rule changes anyone's rate on a shift this week, so builds stay byte-identical.
function siteRateTable(o, staff, slots) {
  const sw = parseSiteWage(o.siteWage);
  if (!sw.rules.length && !staff.some((p) => p.siteWages)) return null;
  const rule = new Map(sw.rules.map((r) => [r.site, r]));
  const slotKey = slots.map((s) => (s.site ? siteKey(s.site) : ""));
  const slotRule = slotKey.map((k) => (k ? rule.get(k) || null : null));
  let differs = false;
  const at = staff.map((p) => Float64Array.from(slotRule, (r, i) => { const v = personSiteRate(p, slotKey[i], r); if (v !== p.wage) differs = true; return v; }));
  if (!differs) return null;
  const low = Float64Array.from(staff, (p, k) => at[k].reduce((m, v) => Math.min(m, v), p.wage));
  const high = Float64Array.from(staff, (p, k) => at[k].reduce((m, v) => Math.max(m, v), p.wage));
  return { at, low, high };
}

// The travel rule on one person's list ordered by start (buf may be a typed array; only its first m entries are read).
function travelOk(ctx, buf, m = buf.length) {
  const tt = ctx.travel;
  if (!tt) return true;
  const { n, T, site, endBy } = tt, slots = ctx.slots;
  endBy.fill(-Infinity);
  for (let k = 0; k < m; k++) {
    const x = buf[k], sx = site[x];
    if (sx < 0) continue;
    const st = slots[x].start;
    for (let y = 0; y < n; y++) if (y !== sx && st < endBy[y] + T[y * n + sx]) return false;
    if (slots[x].end > endBy[sx]) endBy[sx] = slots[x].end;
  }
  return true;
}

// Does putting shift i on a person who already has `base` break the travel rule (and not the rest rule)?
function travelClash(ctx, base, i) {
  const tt = ctx.travel;
  if (!tt || tt.site[i] < 0) return false;
  const s = ctx.slots[i], a = tt.site[i];
  return base.some((k) => {
    const b = tt.site[k];
    if (b < 0 || b === a) return false;
    const gap = Math.max(ctx.restMin, tt.T[a * tt.n + b]), o = ctx.slots[k];
    return s.start < o.end + gap && o.start < s.end + gap;
  });
}
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
    if (maxH > 168 || minH > 168) { errors.push(`${where} (${c[0]}): a week has only 168 hours, so ${maxH > 168 ? "max" : "min"} hours of ${maxH > 168 ? c[2] : c[3]} cannot be right`); return; }
    if (wage > 10000) { errors.push(`${where} (${c[0]}): an hourly wage over $10,000 is probably a typo`); return; }
    if (staff.some((s) => s.name.toLowerCase() === c[0].toLowerCase())) { errors.push(`${where}: "${c[0]}" is listed twice`); return; }
    const tail = c.slice(4);
    const roles = tail.filter((x) => ROLE_CELL.test(x)).flatMap(parseRoles);
    let siteWages = null;
    for (const cell of tail.filter((x) => SITE_PAY_CELL.test(x))) {
      const w = parsePersonSiteWage(cell);
      if (w.error) { errors.push(`${where} (${c[0]}): ${w.error}`); continue; }
      siteWages = siteWages || new Map();
      if (siteWages.has(w.site)) { errors.push(`${where} (${c[0]}): two wages at "${w.label}"; the first is used`); continue; }
      siteWages.set(w.site, w);
    }
    const siteCells = tail.filter((x) => SITES_CELL.test(x) || SITE_CELL.test(x));
    const sites = siteCells.length ? [...new Set(siteCells.flatMap(parseSites))] : null;
    if (siteCells.length && !sites.length) errors.push(`${where} (${c[0]}): "${siteCells[0]}" names no site; write it like "sites: Main | Harbour"`);
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
    const isExtra = (x) => SENIORITY_CELL.test(x) || STREAK_CELL.test(x) || ROLE_CELL.test(x) || PREV_CELL.test(x) || OFF_CELL.test(x) || DAILY_CELL.test(x) || AVOID_CELL.test(x) || PREFER_CELL.test(x) || TOUGH_CELL.test(x) || SUPERVISED_CELL.test(x) || AGE_CELL.test(x) || SITES_CELL.test(x) || SITE_CELL.test(x) || SITE_PAY_CELL.test(x);
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
    if (siteWages && sites && sites.length) for (const w of siteWages.values()) if (!sites.includes(w.site)) notes.push(`${c[0]}: "wage at ${w.label}" is not used, because their sites: cell does not list ${w.label}.`);
    staff.push({ ...(siteWages ? { siteWages } : {}), sites: sites && sites.length ? sites : null, seniority, age, youth, name: c[0], wage, maxHours: maxHoursEff, minHours: Math.min(minH, maxHoursEff), roles, days: av.days, anyTime: av.any && !youth && !tail.some((x) => OFF_CELL.test(x)), prevEnd, streakBefore, maxDaily: maxDailyEff, avoid: avoidCells.length ? av2.avoid : null, prefer: preferCells.length ? pf2.avoid : null, toughBefore, supervised: tail.some((x) => SUPERVISED_CELL.test(x)) || (age !== null && age < 18) });
  });
  if (!staff.length && !errors.length) errors.push("Add at least one person.");
  if (staff.length > MAX_STAFF) errors.push(`That is ${staff.length} people; this tool handles up to ${MAX_STAFF}.`);
  return { staff, errors, notes };
}

// One requirement per line: day(s), start, end, people needed, label (optional), role (optional: sixth column or "role: x")
export function parseShifts(text) {
  const slots = [], errors = [];
  const lines = String(text || "").split(/\r?\n/);
  let first = true, overflow = false;
  lines.forEach((raw, i) => {
    if (overflow) return;
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
    const tagged = (x) => ROLE_CELL.test(x || "") || FIXED_CELL.test(x || "") || SITE_CELL.test(x || "");
    const label = tagged(c[4]) ? "" : (c[4] || "");
    const roleCell = c.slice(4).find((x) => ROLE_CELL.test(x));
    const roleRaw = roleCell ? parseRoles(roleCell)[0] || "" : tagged(c[5]) ? "" : (c[5] || "").trim().toLowerCase();
    const siteCell = c.slice(4).find((x) => SITE_CELL.test(x));
    const site = siteCell ? siteCell.replace(SITE_CELL, "").trim() : "";
    if (siteCell && !siteKey(site)) { errors.push(`${where}: "site:" needs a name`); return; }
    // "role: keyholder x1" asks for one keyholder among the people needed; the other copies take anyone. No "xN" = every copy.
    const roleCount = /^(.+?)\s*[x×]\s*(\d+)$/.exec(roleRaw);
    const role = roleCount ? roleCount[1].trim() : roleRaw;
    const roleNeeded = roleCount ? Number(roleCount[2]) : count;
    if (roleCount && (roleNeeded < 1 || roleNeeded > count)) { errors.push(`${where}: "${roleRaw}" asks for ${roleNeeded} with the role but only ${count} people are needed`); return; }
    // "fixed: Sam" pins every copy to Sam; "fixed: Sam + Ana" pins copy 1 to Sam, copy 2 to Ana; extra copies stay open.
    const fixedCell = c.slice(4).find((x) => FIXED_CELL.test(x));
    const fixedNames = fixedCell ? parseFixed(fixedCell) : [];
    if (fixedCell && !fixedNames.length) { errors.push(`${where}: "fixed:" needs a name`); return; }
    if (slots.length + days.length * count > MAX_SLOTS * 4) { overflow = true; return; } // stop expanding a runaway file
    for (const d of days) for (let k = 0; k < count; k++) {
      const end = b <= a ? b + 1440 : b; // an end at or before the start runs overnight
      slots.push({ day: d, startMin: a, endMin: end, start: d * 1440 + a, end: d * 1440 + end, label, role: k < roleNeeded ? role : "", copy: k + 1, of: count, fixed: fixedNames[k] || "", ...(site ? { site } : {}) });
    }
  });
  if (!slots.length && !errors.length) errors.push("Add at least one shift to cover.");
  if (slots.length > MAX_SLOTS || overflow) {
    errors.push(`That is ${overflow ? "more than " + MAX_SLOTS * 4 : slots.length} shifts to fill; this tool handles up to ${MAX_SLOTS}.`);
    slots.length = 0; // never hand a solver an oversized week
  }
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
  exact: "auto", exactNodes: 400000, exactMs: 8000, exactTolerance: 0.5, balance: 25, toughBalance: 0, shortfallValue: 8, avoidValue: 0.5, preferValue: 0.25, keep: null, keepValue: 0, keepShift: 0, seed: 1, restarts: 4, iterations: 0, longPass: true,
  siteWage: "", // wages by site: "Airport +2; Downtown min 20.17" (parseSiteWage); none = everyone's own wage everywhere
  travelPay: false, travelAllowance: 0, // pay the trip between two sites in one day as hours worked; a flat amount per trip (siteTrips)
  coverPrice: 0, // dollars per hour at risk if someone calls out (coverRisk); 0 = off, the roster is built on score alone
};

function qualified(person, slot) {
  return !slot.role || (person.roles || []).includes(slot.role);
}

function worksAt(person, slot) {
  return !slot.site || !person.sites || person.sites.includes(siteKey(slot.site));
}

function available(person, slot) {
  if (!qualified(person, slot)) return false;
  if (!worksAt(person, slot)) return false;
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
  const restMin = Math.max(0, o.minRestHours) * 60;
  return { o, staff, slots, P, S, elig, target, avgWage, totalHours, restMin, travel: travelTable(o, slots, restMin), tripPay: o.travelPay || o.travelAllowance > 0 ? siteTripTable(o, slots) : null, rates: siteRateTable(o, staff, slots), diffMin: differentialMinutes(o, slots), keep: keepSets(o, staff, slots) };
}

// "Keep last week's shifts": `keep` maps a person's name (any case) to the shifts they worked before, each written as
// slotKey(slot) (day, start, end, role). Each hour of such a shift they work again earns keepValue x their wage, the same way
// a prefer: hour does, so it flows through the search and every exact bound; it is far below BIG, so it never leaves a shift open,
// and it trades at most keepValue x wage an hour of pay for a steadier rota. Copies of one shift share a key. null when off.
export const slotKey = (s) => `${s.day}|${s.startMin}|${s.endMin}|${s.role || ""}` + (s.site ? `|@${siteKey(s.site)}` : "");
// `keepShift` (2026-11-12) is the same bonus counted per shift instead of per hour: keeping a kept shift earns keepShift x the
// person's wage whatever its length, the shape of a per-change short-notice premium (rebuilding a posted week).
export const keepOn = (o) => !!o && !!o.keep && (o.keepValue > 0 || o.keepShift > 0);
function keepSets(o, staff, slots) {
  if (!keepOn(o)) return null;
  const by = new Map(Object.entries(o.keep).map(([n, keys]) => [n.toLowerCase(), new Set(keys)]));
  const keys = slots.map(slotKey), anyRole = slots.map((s) => slotKey({ ...s, role: "*" }));
  // A kept shift from a file with no site column matches the same day and hours at any site.
  const anySite = slots.map((s) => slotKey({ ...s, role: "*", site: "" }));
  const sets = staff.map((p) => {
    const ks = by.get(p.name.toLowerCase());
    if (!ks) return null;
    const set = new Set();
    keys.forEach((k, i) => { if (ks.has(k) || ks.has(anyRole[i]) || ks.has(anySite[i])) set.add(i); });
    return set.size ? set : null;
  });
  return sets.some(Boolean) ? sets : null;
}
// Dollars of prefer: and keep bonus for person p working shift i (0 for most pairs).
function slotBonus(ctx, p, i) {
  const person = ctx.staff[p];
  let h = 0;
  if (person.prefer) h += (avoidMinutes(person, ctx.slots[i], "prefer") / 60) * ctx.o.preferValue;
  if (ctx.keep && ctx.keep[p] && ctx.keep[p].has(i)) h += ((ctx.slots[i].end - ctx.slots[i].start) / 60) * (ctx.o.keepValue || 0) + (ctx.o.keepShift || 0);
  return h * Math.max(person.wage, 1);
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

// Hard-rule check for one person's list of shifts (a list ordered by start time; see insertSorted). The pricing oracle calls this
// millions of times on big weeks, so days within 0-30 are tracked in a bit mask and per-day minutes in a reused array instead of
// a Set, a Map and a sort; a list with a day outside that range takes validListSlow, the original. Both give the same answer.
const DAY_MIN = new Float64Array(31);
function validList(ctx, p, list) {
  const { slots, staff, restMin, o } = ctx;
  let minutes = 0, maxEnd = staff[p].prevEnd ?? -Infinity, mask = 0;
  for (const i of list) {
    const s = slots[i];
    if (s.start < maxEnd + restMin) return false;
    if (s.end > maxEnd) maxEnd = s.end;
    minutes += s.end - s.start;
    if (!(s.day >= 0 && s.day <= 30 && Number.isInteger(s.day))) return validListSlow(ctx, p, list);
    mask |= 1 << s.day;
  }
  if (minutes > staff[p].maxHours * 60 + 1e-9) return false;
  const a = staff[p].maxDaily, b = o.maxDailyHours;
  const cap = a > 0 && b > 0 ? Math.min(a, b) * 60 : a > 0 ? a * 60 : b > 0 ? b * 60 : Infinity;
  if (cap !== Infinity) {
    for (const i of list) DAY_MIN[slots[i].day] = 0;
    for (const i of list) { const s = slots[i]; DAY_MIN[s.day] += s.end - s.start; }
    for (const i of list) if (DAY_MIN[slots[i].day] > cap + 1e-9) return false;
  }
  const before = staff[p].streakBefore || 0;
  let run = before, prev = before > 0 ? -1 : -9;
  for (let d = 0; d <= 30; d++) {
    if (!(mask & (1 << d))) continue;
    run = d === prev + 1 ? run + 1 : 1;
    if (run > o.maxConsecDays) return false;
    prev = d;
  }
  return !ctx.travel || travelOk(ctx, list);
}

let MERGE = new Int32Array(64);
// Each slot's start, end and day as typed arrays, built once per ctx (slots are not changed after parsing). Reading three numbers
// from a typed array is cheaper than loading them from the slot objects, which was most of validWith's own time.
function slotTable(ctx) {
  const slots = ctx.slots;
  let t = ctx.slotTab;
  if (t && t.slots === slots && t.n === slots.length) return t;
  const n = slots.length, st = new Float64Array(n), en = new Float64Array(n), dy = new Float64Array(n);
  for (let k = 0; k < n; k++) { st[k] = slots[k].start; en[k] = slots[k].end; dy[k] = slots[k].day; }
  t = ctx.slotTab = { slots, n, st, en, dy };
  return t;
}
// validList(ctx, p, insertSorted(ctx, list without `skip`, i)) without building that list. The search tries far more moves than it
// keeps (7.7 million checks on one café sample build, 1 in 8 valid), and building each candidate list first was a fifth of the
// build (2026-11-12 profile). The candidate is merged in exactly the order insertSorted gives (shift i before the first shift it
// does not start after, ties by index) and checked by the same steps as validList, stopping at the first rest or overlap clash, so
// the answer is the same. An unordered list, or a day outside 0-30, takes the original path.
function validWith(ctx, p, list, i, skip = -1) {
  const { staff, restMin, o } = ctx;
  const { st, en, dy } = slotTable(ctx);
  const n = list.length;
  for (let k = 1; k < n; k++) {
    const a = list[k - 1], b = list[k];
    if (st[b] < st[a] || (st[b] === st[a] && b < a)) {
      return validList(ctx, p, insertSorted(ctx, skip >= 0 ? list.filter((x) => x !== skip) : list, i));
    }
  }
  if (MERGE.length < n + 1) MERGE = new Int32Array(2 * (n + 1));
  // One pass: take the next shift of the merged order (i before the first shift it does not start after), check it as validList's
  // first loop does, and stop at the first rest or overlap clash. Shifts not yet reached are written out only for the slow path.
  const buf = MERGE, si = st[i];
  let m = 0, k = 0, placed = false, minutes = 0, maxEnd = staff[p].prevEnd ?? -Infinity, mask = 0;
  for (;;) {
    let x;
    if (k < n) {
      x = list[k];
      if (!placed && !(st[x] < si || (st[x] === si && x < i))) { x = i; placed = true; }
      else { k++; if (x === skip) continue; }
    } else if (!placed) { x = i; placed = true; } else break;
    buf[m++] = x;
    const s0 = st[x], e0 = en[x], d = dy[x];
    if (s0 < maxEnd + restMin) return false;
    if (e0 > maxEnd) maxEnd = e0;
    minutes += e0 - s0;
    if (!(d >= 0 && d <= 30 && Number.isInteger(d))) {
      for (; k < n; k++) {
        const y = list[k];
        if (!placed && !(st[y] < si || (st[y] === si && y < i))) { buf[m++] = i; placed = true; }
        if (y !== skip) buf[m++] = y;
      }
      if (!placed) buf[m++] = i;
      return validListSlow(ctx, p, Array.from(buf.subarray(0, m)));
    }
    mask |= 1 << d;
  }
  if (minutes > staff[p].maxHours * 60 + 1e-9) return false;
  const a = staff[p].maxDaily, b = o.maxDailyHours;
  const cap = a > 0 && b > 0 ? Math.min(a, b) * 60 : a > 0 ? a * 60 : b > 0 ? b * 60 : Infinity;
  if (cap !== Infinity) {
    for (let k = 0; k < m; k++) DAY_MIN[dy[buf[k]]] = 0;
    for (let k = 0; k < m; k++) { const x = buf[k]; DAY_MIN[dy[x]] += en[x] - st[x]; }
    for (let k = 0; k < m; k++) if (DAY_MIN[dy[buf[k]]] > cap + 1e-9) return false;
  }
  const before = staff[p].streakBefore || 0;
  let run = before, prev = before > 0 ? -1 : -9;
  for (let d = 0; d <= 30; d++) {
    if (!(mask & (1 << d))) continue;
    run = d === prev + 1 ? run + 1 : 1;
    if (run > o.maxConsecDays) return false;
    prev = d;
  }
  return !ctx.travel || travelOk(ctx, buf, m);
}

function validListSlow(ctx, p, list) {
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
  return !ctx.travel || travelOk(ctx, list);
}

// Paid travel between sites (2026-11-14). With `travelPay` on, a person's trip from a shift at one named site to their next
// shift the same day at another is paid time: in the US, travel from one job site to another during the workday is hours
// worked (29 CFR 785.38), so it is paid at their wage and counts toward daily and weekly overtime. `travelAllowance` is a flat
// amount per such trip (mileage or a fare), outside overtime and the payroll burden. A trip counts on the day of the shifts;
// shifts with no site are skipped (the trip is unknown). Calls onTrip(day, minutes) per trip and returns the trip count.
// The exact search's floors leave travel out (payParts/payroll with noTravel), which keeps them below the true pay.
function siteTrips(ctx, list, onTrip) {
  const tt = ctx.tripPay;
  if (!tt || list.length < 2) return 0;
  const slots = ctx.slots;
  let L = list;
  for (let k = 1; k < list.length; k++) if (slots[list[k]].start < slots[list[k - 1]].start) { L = Array.from(list).sort((a, b) => slots[a].start - slots[b].start || a - b); break; }
  let day = -1, prev = -1, count = 0;
  for (const i of L) {
    const d = slots[i].day;
    if (d !== day) { day = d; prev = -1; }
    const x = tt.site[i];
    if (x < 0) continue;
    if (prev >= 0 && prev !== x) { count++; if (onTrip) onTrip(d, tt.T[prev * tt.n + x]); }
    prev = x;
  }
  return count;
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
// Hours per day in a reused array, days visited in first-seen order (the order the Map below iterates in, so both sum the same
// numbers in the same order and give the same result bit for bit). The pricing oracle prices millions of lists on a 40-person
// week, and the Map per call was a fifth of its time (2026-11-11 profile). Days outside 0-30 take the Map.
const PAY_DAY = new Float64Array(31), PAY_ORDER = new Int32Array(31);
const addTripDay = (d, m) => { PAY_DAY[d] += m / 60; };
function payParts(ctx, list, noTravel = false) {
  const { o, slots } = ctx;
  let mask = 0, nd = 0;
  for (const i of list) {
    const d = slots[i].day;
    if (!(d >= 0 && d <= 30 && Number.isInteger(d))) return payPartsMap(ctx, list, noTravel);
    if (!(mask & (1 << d))) { mask |= 1 << d; PAY_ORDER[nd++] = d; PAY_DAY[d] = 0; }
    PAY_DAY[d] += paidMinutes(o, slots[i]) / 60;
  }
  if (ctx.tripPay && o.travelPay && !noTravel) siteTrips(ctx, list, addTripDay);
  let straight = 0, ot = 0, dt = 0;
  for (let k = 0; k < nd; k++) {
    let rest = PAY_DAY[PAY_ORDER[k]];
    if (o.dailyDtAfter > 0 && rest > o.dailyDtAfter) { dt += rest - o.dailyDtAfter; rest = o.dailyDtAfter; }
    if (o.dailyOtAfter > 0 && rest > o.dailyOtAfter) { ot += rest - o.dailyOtAfter; rest = o.dailyOtAfter; }
    straight += rest;
  }
  const weekly = Math.max(0, straight - o.otAfter);
  return { straight: straight - weekly, ot: ot + weekly, dt };
}
function payPartsMap(ctx, list, noTravel = false) {
  const { o, slots } = ctx;
  const byDay = new Map();
  for (const i of list) byDay.set(slots[i].day, (byDay.get(slots[i].day) || 0) + paidMinutes(o, slots[i]) / 60);
  if (ctx.tripPay && o.travelPay && !noTravel) siteTrips(ctx, list, (d, m) => byDay.set(d, byDay.get(d) + m / 60));
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
// Wage pay before burden and premiums. With wages by site (ctx.rates) a week at several rates pays overtime on the weighted
// average of the week's straight-time pay (the regular rate, 29 CFR 778.115): every hour at its own rate, plus (otMult - 1)
// x the regular rate for each overtime hour (and dtMult - 1 for double time). Paid travel is at the person's own wage.
// With one rate this is the same total as wage x (straight + ot x otMult + dt x dtMult), which stays the path without ctx.rates.
function wagePay(ctx, p, list, q) {
  const { o, staff, rates } = ctx;
  const w = staff[p].wage;
  if (!rates) return w * (q.straight + q.ot * o.otMult + q.dt * o.dtMult);
  const at = rates.at[p];
  let earn = 0, shiftH = 0;
  for (const i of list) { const h = paidMinutes(o, ctx.slots[i]) / 60; earn += at[i] * h; shiftH += h; }
  const H = q.straight + q.ot + q.dt;
  earn += w * Math.max(0, H - shiftH); // paid travel time
  const rr = H > 0 ? earn / H : w;
  return earn + rr * (q.ot * (o.otMult - 1) + q.dt * (o.dtMult - 1));
}
function payroll(ctx, p, list, noTravel = false) {
  const { o, staff } = ctx;
  const q = payParts(ctx, list, noTravel);
  const allowance = ctx.tripPay && o.travelAllowance > 0 && !noTravel ? siteTrips(ctx, list) * o.travelAllowance : 0;
  let extra = o.splitPremium > 0 ? splitDays(ctx, list) * o.splitPremium : 0;
  if (ctx.diffMin.length) {
    let m = 0;
    for (const i of list) m += ctx.diffMin[i];
    extra += (m / 60) * (o.diffPerHour + (staff[p].wage * o.diffPct) / 100);
  }
  return (1 + o.burdenPct / 100) * (wagePay(ctx, p, list, q) + extra) + allowance;
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
// Plus the keep bonus (slotBonus) when the plan asks to keep last week's shifts.
function preferBonus(ctx, p, list) {
  if (!list || (!ctx.staff[p].prefer && !(ctx.keep && ctx.keep[p]))) return 0;
  let v = 0;
  for (const i of list) v += slotBonus(ctx, p, i);
  return v;
}
function personScore(ctx, p, list) {
  const h = hoursOf(ctx, list);
  return payroll(ctx, p, list) + softPenalty(ctx, p, h, list);
}

// A new list holding `list` and shift i, ordered by start time then index. Lists built here are already in that order, so i
// goes in by binary search; an unordered list (some callers push by index) falls back to a full sort, with the same result.
// The search's pricing oracle calls this millions of times on a 60-person week: the full sort with a comparator was the
// largest single cost of a branch-and-price run (5.6 s of 19.4 s, 2026-11-11 profile).
function insertSorted(ctx, list, i) {
  const slots = ctx.slots;
  const n = list.length;
  const before = (a, b) => slots[a].start < slots[b].start || (slots[a].start === slots[b].start && a < b);
  for (let k = 1; k < n; k++) {
    if (before(list[k], list[k - 1])) {
      const out = list.concat(i);
      out.sort((a, b) => slots[a].start - slots[b].start || a - b);
      return out;
    }
  }
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (before(list[mid], i)) lo = mid + 1; else hi = mid; }
  const out = new Array(n + 1);
  for (let k = 0; k < lo; k++) out[k] = list[k];
  out[lo] = i;
  for (let k = lo; k < n; k++) out[k + 1] = list[k];
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

// A built roster's score under another week's staff (the planner's tie checks, 2026-11-13 later): people are matched by name and
// shifts by slot index, so the slots must be the same list. `valid` false when a person is missing, not eligible or breaks a
// rule there (rest gap, streak, hours). Bonuses (keep, prefer) count as the options say.
export function rosterScoreUnder(staff, slots, options, roster) {
  const ctx = buildContext(staff, slots, options);
  const idx = new Map(staff.map((q, k) => [String(q.name).toLowerCase(), k]));
  const asg = (roster && roster.assignments) || [];
  if (asg.length !== ctx.S) return { valid: false };
  const owner = asg.map((a) => (a.person ? idx.get(String(a.person).toLowerCase()) ?? -2 : -1));
  if (owner.some((q) => q === -2) || !ownerValid(ctx, owner)) return { valid: false };
  return { valid: true, score: scoreOwner(ctx, owner).total };
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
      if (!validWith(ctx, p, lists[p], i)) continue;
      const nl = insertSorted(ctx, lists[p], i);
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
  // The temperature T0 * (T1 / T0) ** (it / iterations) is computed only for an uphill step, the one place it is read: taking the
  // power on every step cost more than the moves themselves in the plateau walk (coverPass, 2026-11-12 profile).
  const decay = T1 / T0;
  for (let it = 0; it < iterations; it++) {
    const i = Math.floor(rng() * S);
    const o = owner[i];
    if (rng() < 0.65) {
      const q = Math.floor(rng() * P);
      if (q === o || !elig[q][i]) continue;
      if (!validWith(ctx, q, lists[q], i)) continue;
      const nq = insertSorted(ctx, lists[q], i);
      const no = o >= 0 ? removeFrom(lists[o], i) : null;
      const sq = personScore(ctx, q, nq), so = o >= 0 ? personScore(ctx, o, no) : 0;
      let delta = sq - pScore[q] + (o >= 0 ? so - pScore[o] : -BIG * ((slots[i].end - slots[i].start) / 60));
      if (delta < 0 || rng() < Math.exp(-delta / (T0 * decay ** (it / iterations)))) {
        lists[q] = nq; pScore[q] = sq;
        if (o >= 0) { lists[o] = no; pScore[o] = so; }
        owner[i] = q; score += delta;
      }
    } else {
      const j = Math.floor(rng() * S);
      const a = owner[i], b = owner[j];
      if (a < 0 || b < 0 || a === b || !elig[a][j] || !elig[b][i]) continue;
      if (!validWith(ctx, a, lists[a], j, i) || !validWith(ctx, b, lists[b], i, j)) continue;
      const na = insertSorted(ctx, removeFrom(lists[a], i), j);
      const nb = insertSorted(ctx, removeFrom(lists[b], j), i);
      const sa = personScore(ctx, a, na), sb = personScore(ctx, b, nb);
      const delta = sa - pScore[a] + sb - pScore[b];
      if (delta < 0 || rng() < Math.exp(-delta / (T0 * decay ** (it / iterations)))) {
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
  const T0 = Math.max(0.5, ctx.avgWage * (ctx.totalHours / Math.max(1, S)) * 0.4), T1 = 0.01, decay = T1 / T0; // temperature as in anneal
  for (let it = 0; it < iterations; it++) {
    const open = [];
    owner.forEach((p, i) => { if (p < 0) open.push(i); });
    if (!open.length) break;
    const i = open[Math.floor(rng() * open.length)];
    const q = Math.floor(rng() * P);
    if (!elig[q][i] || !lists[q].length) continue;
    const j = lists[q][Math.floor(rng() * lists[q].length)];
    if (!validWith(ctx, q, lists[q], i, j)) continue;
    const nq = insertSorted(ctx, removeFrom(lists[q], j), i);
    const r = Math.floor(rng() * P);
    let nr = null;
    if (r !== q && elig[r][j] && validWith(ctx, r, lists[r], j)) nr = insertSorted(ctx, lists[r], j);
    const sq = personScore(ctx, q, nq);
    let delta = sq - pScore[q] - BIG * hrs(i), sr = 0;
    if (nr) { sr = personScore(ctx, r, nr); delta += sr - pScore[r]; } else delta += BIG * hrs(j);
    if (delta < 0 || rng() < Math.exp(-delta / (T0 * decay ** (it / iterations)))) {
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
// The walk stops once its best roster leaves only openHoursFloor(ctx) open: no later step can beat a proven floor, so the answer is
// the same. Before 2026-11-12 it stopped only at 0 open, so on a week where some hours must stay open (the café sample: 15 h) all
// twelve runs went the full 512,000 steps, about 1 s of every 1.4 s build, which the guide pages' studies repeat ~30 times each.
function coverPass(ctx, owner0, seed, iterations) {
  const { P, S, slots, elig } = ctx;
  const floor = (ctx.openFloor ??= openHoursFloor(ctx)) + 1e-6;
  const rng = mulberry32(seed);
  const owner = owner0.slice();
  const lists = Array.from({ length: P }, () => []);
  owner.forEach((p, i) => { if (p >= 0) lists[p] = insertSorted(ctx, lists[p], i); });
  const hrs = (i) => (slots[i].end - slots[i].start) / 60;
  const removeFrom = (list, i) => list.filter((x) => x !== i);
  let open = owner.reduce((t, p, i) => t + (p < 0 ? hrs(i) : 0), 0);
  let bestOpen = open, bestOwner = owner.slice();
  // The open shifts in index order, rebuilt only after a move that changes them (the plateau walk below never does): rebuilding
  // it every step was most of this pass's own time (2026-11-12 profile).
  const openIdx = [];
  let openStale = true;
  // "Can q take shift i on top of what q holds" depends only on q's list, which changes only when a move is taken, while the walk
  // asks again and again: the answers are kept per person and dropped when that person's list changes (stamp = list version).
  const ver = new Int32Array(P).fill(1), stamp = new Int32Array(P * S), fits = new Uint8Array(P * S);
  let tick = 1;
  const canTake = (q, i) => {
    const k = q * S + i;
    if (stamp[k] !== ver[q]) { stamp[k] = ver[q]; fits[k] = validWith(ctx, q, lists[q], i) ? 1 : 0; }
    return fits[k] === 1;
  };
  // The same for "q gives up shift j and takes i", while P * S * S stays small enough to keep (4M entries).
  const pair = P * S * S <= 1 << 22 ? { stamp: new Int32Array(P * S * S), fits: new Uint8Array(P * S * S) } : null;
  const canSwap = (q, i, j) => {
    if (!pair) return validWith(ctx, q, lists[q], i, j);
    const k = (q * S + i) * S + j;
    if (pair.stamp[k] !== ver[q]) { pair.stamp[k] = ver[q]; pair.fits[k] = validWith(ctx, q, lists[q], i, j) ? 1 : 0; }
    return pair.fits[k] === 1;
  };
  for (let it = 0; it < iterations && bestOpen > floor; it++) {
    if (rng() < 0.5) {
      if (openStale) { openIdx.length = 0; for (let x = 0; x < S; x++) if (owner[x] < 0) openIdx.push(x); openStale = false; }
      if (!openIdx.length) break;
      const i = openIdx[Math.floor(rng() * openIdx.length)];
      const q = Math.floor(rng() * P);
      if (!elig[q][i]) continue;
      // Moves are checked with validWith and the new lists built only for a move that is taken.
      let j = -1, nr = false, r = -1;
      if (!canTake(q, i)) {
        if (!lists[q].length) continue;
        j = lists[q][Math.floor(rng() * lists[q].length)];
        if (!canSwap(q, i, j)) continue;
        r = Math.floor(rng() * P);
        if (r !== q && elig[r][j]) nr = canTake(r, j);
      }
      const d = -hrs(i) + (j >= 0 && !nr ? hrs(j) : 0);
      // The temperature is read only for a step that opens hours, so the power is taken only then (it was 60% of this pass's own time).
      if (d <= 0 || rng() < Math.exp(-d / (0.6 * (0.05 / 0.6) ** (it / iterations)))) {
        lists[q] = insertSorted(ctx, j >= 0 ? removeFrom(lists[q], j) : lists[q], i); owner[i] = q; ver[q] = ++tick;
        if (j >= 0) { if (nr) { lists[r] = insertSorted(ctx, lists[r], j); owner[j] = r; ver[r] = ++tick; } else owner[j] = -1; }
        open += d;
        openStale = true;
      }
    } else {
      const i = Math.floor(rng() * S), o = owner[i];
      if (o < 0) continue;
      const q = Math.floor(rng() * P);
      if (q === o || !elig[q][i]) continue;
      if (!canTake(q, i)) continue;
      lists[q] = insertSorted(ctx, lists[q], i); lists[o] = removeFrom(lists[o], i); owner[i] = q; ver[q] = ++tick; ver[o] = ++tick;
    }
    if (open < bestOpen - 1e-9) { bestOpen = open; bestOwner = owner.slice(); }
  }
  return { owner: bestOwner, open: bestOpen };
}

// Least hours any valid roster must leave open, as a max flow: each shift's minutes go to a person-day the person is available
// for, each person-day carries at most its longest rest-respecting chain of those shifts (weighted interval scheduling on
// [start, end + rest)) and the daily cap, and each person at most their weekly hours. Every rule only relaxes (minutes may split
// between people, streaks and history are ignored), so covered minutes never exceed the flow and the floor is never overstated.
// Under 1 ms on the café sample, where it gives the proven 15 h. Non-integer minutes return 0 (no floor).
function openHoursFloor(ctx) {
  const { P, S, slots, staff, elig, restMin, o } = ctx;
  if (slots.some((s) => !Number.isInteger(s.start) || !Number.isInteger(s.end))) return 0;
  const head = [], to = [], cap = [], next = [];
  const add = (u, v, c) => { to.push(v, u); cap.push(c, 0); next.push(head[u] ?? -1, head[v] ?? -1); head[u] = to.length - 2; head[v] = to.length - 1; };
  let n = 2 + S, total = 0; // 0 source, 1 sink, 2.. shifts, then people and person-days
  for (let i = 0; i < S; i++) { const m = slots[i].end - slots[i].start; total += m; add(0, 2 + i, m); }
  for (let p = 0; p < P; p++) {
    const pn = n++;
    add(pn, 1, Math.max(0, Math.floor(staff[p].maxHours * 60 + 1e-9)));
    const dcap = dailyCapMin(ctx, p), byDay = new Map();
    for (let i = 0; i < S; i++) if (elig[p][i]) (byDay.get(slots[i].day) || byDay.set(slots[i].day, []).get(slots[i].day)).push(i);
    for (const list of byDay.values()) {
      const iv = list.map((i) => [slots[i].start, slots[i].end + restMin, slots[i].end - slots[i].start]).sort((x, y) => x[1] - y[1]);
      const best = [0];
      for (let k = 0; k < iv.length; k++) {
        let lo = 0, hi = k;
        while (lo < hi) { const m = (lo + hi) >> 1; if (iv[m][1] <= iv[k][0]) lo = m + 1; else hi = m; }
        best.push(Math.max(best[k], best[lo] + iv[k][2]));
      }
      const u = n++;
      add(u, pn, Math.min(best[iv.length], Math.floor(dcap + 1e-9)));
      for (const i of list) add(2 + i, u, slots[i].end - slots[i].start);
    }
  }
  const level = new Int32Array(n), it = new Int32Array(n);
  const bfs = () => {
    level.fill(-1); level[0] = 0;
    const q = [0];
    for (let h = 0; h < q.length; h++) for (let e = head[q[h]] ?? -1; e >= 0; e = next[e]) if (cap[e] > 0 && level[to[e]] < 0) { level[to[e]] = level[q[h]] + 1; q.push(to[e]); }
    return level[1] >= 0;
  };
  const dfs = (u, f) => {
    if (u === 1) return f;
    for (; it[u] >= 0; it[u] = next[it[u]]) {
      const e = it[u], v = to[e];
      if (cap[e] > 0 && level[v] === level[u] + 1) { const g = dfs(v, Math.min(f, cap[e])); if (g > 0) { cap[e] -= g; cap[e ^ 1] += g; return g; } }
    }
    return 0;
  };
  let flow = 0;
  while (bfs()) { for (let u = 0; u < n; u++) it[u] = head[u] ?? -1; for (let f; (f = dfs(0, Infinity)) > 0;) flow += f; }
  return Math.max(0, total - flow) / 60;
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
        if (!validWith(ctx, q, lists[q], i)) continue;
        const nl = insertSorted(ctx, lists[q], i);
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

// A starting roster from the keep map (2026-11-12): in start order, each shift goes to someone who held it before when the hard
// rules allow it (a pinned shift's eligibility already names only its holder), then every shift still open goes to whoever adds
// the least score, as the annealer's first pass does. A seed for polishPay, not a search of its own.
function keptStart(ctx) {
  const { P, S, slots, elig, keep } = ctx;
  const owner = new Array(S).fill(-1);
  const lists = Array.from({ length: P }, () => []);
  const order = [...Array(S).keys()].sort((a, b) => slots[a].start - slots[b].start || a - b);
  for (const i of order) {
    for (let p = 0; p < P; p++) {
      if (!keep[p] || !keep[p].has(i) || !elig[p][i]) continue;
      const nl = insertSorted(ctx, lists[p], i);
      if (validList(ctx, p, nl)) { owner[i] = p; lists[p] = nl; break; }
    }
  }
  for (const i of order) {
    if (owner[i] >= 0) continue;
    let best = -1, bestD = Infinity, bestList = null;
    for (let p = 0; p < P; p++) {
      if (!elig[p][i]) continue;
      const nl = insertSorted(ctx, lists[p], i);
      if (!validList(ctx, p, nl)) continue;
      const d = personScore(ctx, p, nl) - personScore(ctx, p, lists[p]);
      if (d < bestD) { bestD = d; best = p; bestList = nl; }
    }
    if (best >= 0) { owner[i] = best; lists[best] = bestList; }
  }
  // Eject moves for what is still open: p takes open shift i by giving up one shift j it clashes with, and j goes to whoever
  // takes it at the least score or stays open, when that lowers the score (the open-hours term dominates, so a longer i for a
  // shorter j is taken). Neither pass above can do it: a posted person whose 6-11 shift blocks the caller's 6-14 moves up
  // as one change, where filling 6-14 around them took a chain of five (40 x 112 reissue, eval/reissue-ilp-score.mjs).
  if (ctx.o.keptEject !== false) ejectOpen(ctx, owner, lists);
  return owner;
}

const slotHours = (ctx, i) => (ctx.slots[i].end - ctx.slots[i].start) / 60;

function ejectOpen(ctx, owner, lists, passes = 3) {
  const { P, S, slots, elig } = ctx;
  const without = (list, j) => list.filter((x) => x !== j);
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    const open = [...Array(S).keys()].filter((i) => owner[i] < 0).sort((a, b) => slotHours(ctx, b) - slotHours(ctx, a) || a - b);
    for (const i of open) {
      if (owner[i] >= 0) continue;
      let best = null;
      for (let p = 0; p < P; p++) {
        if (!elig[p][i]) continue;
        const base = personScore(ctx, p, lists[p]);
        for (const j of lists[p]) {
          if (slots[j].fixed) continue;
          const np = insertSorted(ctx, without(lists[p], j), i);
          if (!validList(ctx, p, np)) continue;
          let d = personScore(ctx, p, np) - base + BIG * (slotHours(ctx, j) - slotHours(ctx, i));
          let q = -1, nq = null, dq = 0;
          for (let r = 0; r < P; r++) {
            if (r === p || !elig[r][j]) continue;
            const nl = insertSorted(ctx, lists[r], j);
            if (!validList(ctx, r, nl)) continue;
            const dr = personScore(ctx, r, nl) - personScore(ctx, r, lists[r]) - BIG * slotHours(ctx, j);
            if (dr < dq) { dq = dr; q = r; nq = nl; }
          }
          d += dq;
          if (d < -1e-9 && (!best || d < best.d)) best = { d, p, js: [j], np, moves: q >= 0 ? [[j, q, nq]] : [] };
        }
        // Give up every shift that clashes with i (2026-11-12): when p holds two or more (6-10 and 11-15 against the caller's
        // 6-16), no single drop makes room, so the one-shift move above cannot fire. Each dropped shift then goes, longest
        // first, to whoever takes it at the least score given the earlier ones, or stays open.
        if (ctx.o.keptEject2 === false) continue;
        const clash = lists[p].filter((j) => !validList(ctx, p, insertSorted(ctx, [j], i)));
        if (clash.length < 2 || clash.some((j) => slots[j].fixed)) continue;
        const np = insertSorted(ctx, lists[p].filter((x) => !clash.includes(x)), i);
        if (!validList(ctx, p, np)) continue;
        let d = personScore(ctx, p, np) - base - BIG * slotHours(ctx, i);
        const tmp = new Map(), moves = [];
        const listOf = (r) => tmp.get(r) || lists[r];
        for (const j of [...clash].sort((a, b) => slotHours(ctx, b) - slotHours(ctx, a) || a - b)) {
          d += BIG * slotHours(ctx, j);
          let q = -1, nq = null, dq = 0;
          for (let r = 0; r < P; r++) {
            if (r === p || !elig[r][j]) continue;
            const cur = listOf(r), nl = insertSorted(ctx, cur, j);
            if (!validList(ctx, r, nl)) continue;
            const dr = personScore(ctx, r, nl) - personScore(ctx, r, cur) - BIG * slotHours(ctx, j);
            if (dr < dq) { dq = dr; q = r; nq = nl; }
          }
          if (q >= 0) { d += dq; tmp.set(q, nq); moves.push([j, q, nq]); }
        }
        if (d < -1e-9 && (!best || d < best.d)) best = { d, p, js: clash, np, moves };
      }
      if (!best) continue;
      owner[i] = best.p; lists[best.p] = best.np;
      for (const j of best.js) owner[j] = -1;
      for (const [j, q, nq] of best.moves) { owner[j] = q; lists[q] = nq; }
      moved = true;
    }
    if (!moved) break;
  }
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
      if (!validWith(ctx, q, lists[q], i)) continue;
      const nq = insertSorted(ctx, lists[q], i);
      const no = removeFrom(lists[o], i), sq = personScore(ctx, q, nq), so = personScore(ctx, o, no);
      if (sq + so < pScore[q] + pScore[o] - 1e-9) { lists[q] = nq; lists[o] = no; pScore[q] = sq; pScore[o] = so; owner[i] = q; }
    } else {
      const j = Math.floor(rng() * S), b = owner[j];
      if (b < 0 || b === o || !elig[o][j] || !elig[b][i]) continue;
      if (!validWith(ctx, o, lists[o], j, i) || !validWith(ctx, b, lists[b], i, j)) continue;
      const na = insertSorted(ctx, removeFrom(lists[o], i), j), nb = insertSorted(ctx, removeFrom(lists[b], j), i);
      const sa = personScore(ctx, o, na), sb = personScore(ctx, b, nb);
      if (sa + sb < pScore[o] + pScore[b] - 1e-9) { lists[o] = na; lists[b] = nb; pScore[o] = sa; pScore[b] = sb; owner[i] = b; owner[j] = o; }
    }
  }
  return owner;
}

// Hand-over passes the risk check allows per shift (2026-11-13 later, eval/cover-risk-joint.mjs): on the five templates and
// three seeded 20-person weeks, 202 person-days of which calloutExposure finds 48 open a call-out, the check flagged 91 with no
// chains (52.7% of them really open), 75 with one pass (64.0%), 72 with two (66.7%) and 72 with three; none missed a day
// exposure finds open, and two passes cost about 2 ms a check. `coverChain` on the build options sets it (0 = the old check).
const COVER_CHAIN = 2;
// Most checks the chain search makes for one person-day before it gives up and counts the day at risk (null from
// coverDayJoint, `capped` on coverRisk). Giving up only ever adds risk, so risk hours stay an upper bound. On the seeded
// 40-60 person weeks a day nobody can cover reads 38-39 of 40 people's lists two passes deep, and the priced pass re-runs
// those searches for every candidate move: 5-16 s a build uncapped (eval/cover-chain-cost.mjs).
const COVER_BUDGET = 500;
const COVER_STOP = { coverStop: true };
// Largest week (shift copies) the priced pass tries two-shift moves on by default (eval/cover-pairs.mjs): on the 40-person
// weeks (148-162 copies) they add 0.2-1.7 s to the pass; on the 60-person week (245 copies) 3.4 s became 14.3 s with no
// move found. `coverPairsSlots` moves the cap, `coverPairs: false` turns them off.
const COVER_PAIRS_SLOTS = 200;
// Call-out risk, the cheap stand-in for calloutExposure (2026-11-13). `calloutExposure` rebuilds the week once per
// person-day, which is far too slow to sit inside a search. This counts the same cases and asks only the quickest of its
// questions: if this person called out for this day, could someone else take each of their shifts that day with every hard
// rule holding and nobody else moved? If not, the day is "at risk" and its hours are counted. The hand-over chains and the
// rebuilds exposure also tries are left out, so risk hours are an upper bound on what one call-out opens, not a forecast
// (`eval/cover-price.mjs` measures how closely the two move together).
export function coverRisk(ctx, owner, { fromDay = 1, joint = true, chain = COVER_CHAIN, budget = COVER_BUDGET } = {}) {
  const lists = Array.from({ length: ctx.P }, () => []);
  owner.forEach((p, i) => { if (p >= 0) lists[p].push(i); });
  lists.forEach((l) => l.sort((a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b));
  const cases = [];
  let hours = 0, personDays = 0, chained = 0, capped = 0;
  for (let p = 0; p < ctx.P; p++) {
    const byDay = new Map();
    for (const i of lists[p]) {
      const d = ctx.slots[i].day;
      if (d < fromDay) continue;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(i);
    }
    for (const [day, mine] of byDay) {
      personDays++;
      const h = mine.reduce((t, i) => t + (ctx.slots[i].end - ctx.slots[i].start) / 60, 0);
      const how = joint || chain > 0 ? coverDayJoint(ctx, lists, p, day, mine, chain, budget) : coverDayEach(ctx, lists, p, mine);
      if (how === "chain") chained++;
      if (how === null) capped++;
      if (!how) { hours += h; cases.push({ person: p, day, hours: h, slots: mine.slice() }); }
    }
  }
  return { hours, personDays, riskyDays: cases.length, cases, chained, capped };
}

// The first form of the check (2026-11-13 morning): each of the day's shifts on its own. A person-day with two shifts that
// only one other person could take, and not both, passed it. Kept for the comparison in eval/cover-risk-joint.mjs.
function coverDayEach(ctx, lists, p, mine) {
  for (const i of mine) {
    let fit = false;
    for (let q = 0; q < ctx.P && !fit; q++) {
      if (q === p || !ctx.elig[q][i]) continue;
      if (validList(ctx, q, insertSorted(ctx, lists[q], i))) fit = true;
    }
    if (!fit) return false;
  }
  return "direct";
}

// All of the day's shifts covered at once (2026-11-13 later): a small depth-first search that hands the shifts out one by one
// on the lists as they stand after the earlier hand-overs, so one stand-in is never counted for two shifts they could not both
// work. With `chain` n > 0, a shift nobody can take outright may still go to someone who passes one of their own shifts, on
// the call-out day or later (earlier ones have been worked by then), to a third person, and so on up to n passes per shift:
// the hand-over chains calloutExposure tries before a rebuild. The caller never takes a shift back. Outright cover is tried
// first for the whole day, so "chain" means no outright cover existed. Returns "direct", "chain" or false; lists are restored.
function coverDayJoint(ctx, lists, p, day, mine, chain, budget = Infinity) {
  let left = budget;
  // People eligible for each shift, built once per ctx: the chain search asks this for every shift it touches, and on sparse
  // availability most of the P people are not eligible. Checks go through validWith, which builds no list unless it passes.
  const by = ctx.eligBy || (ctx.eligBy = Array.from({ length: ctx.S }, (_, i) => { const out = []; for (let q = 0; q < ctx.P; q++) if (ctx.elig[q][i]) out.push(q); return out; }));
  // Put shift i on someone (not p) with at most `depth` passes, then run `rest()`; true when rest() succeeded.
  const place = (i, depth, rest) => {
    const who = by[i];
    for (let k = 0; k < who.length; k++) {
      const q = who[k];
      if (q === p) continue;
      if (--left < 0) throw COVER_STOP;
      const Lq = lists[q];
      if (!validWith(ctx, q, Lq, i)) continue;
      lists[q] = insertSorted(ctx, Lq, i);
      const ok = rest();
      lists[q] = Lq;
      if (ok) return true;
    }
    if (depth <= 0) return false;
    for (let k = 0; k < who.length; k++) {
      const q = who[k];
      if (q === p) continue;
      const Lq = lists[q];
      for (const j of Lq) {
        if (ctx.slots[j].day < day) continue;
        if (--left < 0) throw COVER_STOP;
        if (!validWith(ctx, q, Lq, i, j)) continue;
        lists[q] = insertSorted(ctx, Lq.filter((x) => x !== j), i);
        const ok = place(j, depth - 1, rest);
        lists[q] = Lq;
        if (ok) return true;
      }
    }
    return false;
  };
  const all = (k, depth) => (k === mine.length ? true : place(mine[k], depth, () => all(k + 1, depth)));
  if (all(0, 0)) return "direct";
  if (chain <= 0) return false;
  // Each branch puts its list back when it returns; a throw past the budget skips those restores, so the lists are saved
  // here and put back when it lands.
  const saved = lists.slice();
  try { return all(0, chain) ? "chain" : false; }
  catch (e) { if (e !== COVER_STOP) throw e; for (let q = 0; q < lists.length; q++) lists[q] = saved[q]; return null; }
}

// Exposure priced inside the roster (2026-11-13). `--steady` chooses among rosters that already tie at the best score, so it
// never gives anything up; the open question it left was what a manager could buy by giving something up. `coverPrice` is
// dollars per hour at risk (coverRisk above): the pass hill-climbs on score + coverPrice x risk hours, so it will hand a
// shift to someone else, or swap two, when the pay and fairness it costs is less than the price of the risk it clears.
// Open hours cost BIG ($100,000) an hour inside the score, so no sane price trades coverage away. Moves are one hand-over or
// one swap at a time, taken only when they improve the priced objective; the roster it starts from is kept when none does.
export function coverSlackPass(ctx, owner0, { price, rounds = 40, fromDay = 1, chain = COVER_CHAIN, budget = COVER_BUDGET, pairs = true, pairCap = 4000 }) {
  let owner = owner0.slice();
  let score = scoreOwner(ctx, owner).total;
  let risk = coverRisk(ctx, owner, { fromDay, chain, budget });
  // The budget makes the screening check cheap but can count a day at risk that a full search would cover, and a move that
  // only frees a capped search "clears" risk no call-out would see (4 such trades on the 60-person week, eval/cover-chain-
  // cost.mjs). So a move is kept only when the same check without the budget agrees it pays; that runs once per move that
  // passes the screen, a handful per build. Reported risk is the unbudgeted count.
  const full = (own) => (budget === Infinity ? null : coverRisk(ctx, own, { fromDay, chain, budget: Infinity }));
  let strict = full(owner);
  const before = strict || risk;
  let moves = 0, tried = 0, pairMoves = 0, relieves = 0, trades = 0, pairTried = 0;
  const listOf = (own, p) => own.map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0);
  const take = (cand, needLess = false) => {
    tried++;
    if (!ownerValid(ctx, cand)) return false;
    const s2 = scoreOwner(ctx, cand).total;
    if (s2 - score >= price * (strict || risk).hours - 1e-9) return false; // cannot pay for itself even if it cleared every risky hour
    const r2 = coverRisk(ctx, cand, { fromDay, chain, budget });
    if (needLess && r2.hours >= risk.hours - 1e-9) return false;
    if (s2 + price * r2.hours >= score + price * risk.hours - 1e-9) return false;
    const f2 = full(cand);
    if (needLess && f2 && f2.hours >= strict.hours - 1e-9) return false;
    if (f2 && s2 + price * f2.hours >= score + price * strict.hours - 1e-9) return false;
    owner = cand; score = s2; risk = r2; strict = f2; moves++;
    return true;
  };
  for (let round = 0; round < rounds; round++) {
    let improved = false;
    for (const c of risk.cases.slice()) {
      if (owner[c.slots[0]] !== c.person) continue; // this case has already been changed by an earlier move
      for (const i of c.slots) {
        for (let q = 0; q < ctx.P && !improved; q++) {
          if (q === c.person || !ctx.elig[q][i]) continue;
          const hand = owner.slice();
          hand[i] = q;
          if (take(hand)) { improved = true; break; }
          for (const j of listOf(owner, q)) {
            if (!ctx.elig[c.person][j]) continue;
            const swap = owner.slice();
            swap[i] = q; swap[j] = c.person;
            if (take(swap)) { improved = true; break; }
          }
        }
        if (improved) break;
      }
      if (improved) break;
    }
    // Two shifts moved together (2026-11-13 later, eval/cover-pairs.mjs). A risky shift i is one nobody can take, even through
    // coverRisk's chains, so a stand-in q eligible for it is blocked by their own list (hours cap, rest, a clash). The single
    // moves above only touch the risky person's shifts. Here, for every such q and each shift j of q's (any day: a chain may
    // only pass on shifts not yet worked, a move made now has no such limit), and every r eligible for j:
    //   relief: j -> r, so q has room to stand in and the risky person keeps i;
    //   trade:  j -> r and one of r's shifts k -> q, two shifts changing hands at once (q and r swap);
    //   relay:  i -> q and j -> r.
    // Every candidate goes through the same priced test as the single moves; at most `pairCap` are tried a round.
    if (!improved && pairs) {
      const by = ctx.eligBy || (ctx.eligBy = Array.from({ length: ctx.S }, (_, i) => { const out = []; for (let q = 0; q < ctx.P; q++) if (ctx.elig[q][i]) out.push(q); return out; }));
      const lists = Array.from({ length: ctx.P }, () => []);
      owner.forEach((q, k) => { if (q >= 0) lists[q].push(k); });
      lists.forEach((l) => l.sort((a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b));
      const seen = new Set();
      let budgetLeft = pairCap;
      // Screened by aim: a candidate goes to the priced test only when it covers some day now at risk that one of the people
      // it moves (q, r) could stand in on, chains included: a few coverDayJoint calls instead of a whole coverRisk. Without
      // the screen the pass took 38 s on the 60-person week (22,234 candidates, most of them score swaps that cleared no
      // risk). Asking only about the day each candidate was built for was tried first and lost every gain on the seeded
      // 20-person week 2 (189 -> 107 risk hours unscreened, none screened): a stand-in freed there covers other days.
      const coversSome = (cand, movers) => {
        const L = Array.from({ length: ctx.P }, () => []);
        cand.forEach((q, k) => { if (q >= 0) L[q].push(k); });
        L.forEach((l) => l.sort((a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b));
        for (const c of risk.cases) {
          if (!c.slots.some((k) => movers.some((m) => ctx.elig[m][k]))) continue;
          const mine = L[c.person].filter((k) => ctx.slots[k].day === c.day);
          if (!mine.length || coverDayJoint(ctx, L, c.person, c.day, mine, chain, budget)) return true;
        }
        return false;
      };
      const tryCand = (key, cand, kind, movers) => {
        if (seen.has(key)) return false;
        seen.add(key);
        if (--budgetLeft < 0) throw COVER_STOP;
        pairTried++;
        if (!ownerValid(ctx, cand) || !coversSome(cand, movers)) return false;
        // A two-shift move must clear risk, not only score: on the spare-part-timer team a relief that left risk at 194 h
        // and saved $5 of score was taken without this, and the posted week's measured exposure rose from 54 h to 66 h.
        if (!take(cand, true)) return false;
        if (kind === "relief") relieves++; else if (kind === "trade") trades++; else pairMoves++;
        return true;
      };
      try {
        outer: for (const c of risk.cases) {
          if (owner[c.slots[0]] !== c.person) continue;
          for (const i of c.slots) {
            for (const q of by[i]) {
              if (q === c.person) continue;
              const Lq = lists[q];
              for (const j of Lq) {
                for (const r of by[j]) {
                  if (r === q || r === c.person) continue;
                  const Lr = lists[r];
                  if (validWith(ctx, r, Lr, j)) {
                    const rel = owner.slice(); rel[j] = r;
                    if (tryCand(`r${j}>${r}`, rel, "relief", [q, r])) { improved = true; break outer; }
                    if (validWith(ctx, q, Lq, i, j)) {
                      const relay = owner.slice(); relay[i] = q; relay[j] = r;
                      if (tryCand(`y${i}>${q},${j}>${r}`, relay, "relay", [q, r])) { improved = true; break outer; }
                    }
                  }
                  for (const k of Lr) {
                    if (!ctx.elig[q][k] || !validWith(ctx, q, Lq, k, j) || !validWith(ctx, r, Lr, j, k)) continue;
                    const lo = Math.min(j, k), hi = Math.max(j, k);
                    const tr = owner.slice(); tr[j] = r; tr[k] = q;
                    if (tryCand(`t${lo},${hi}`, tr, "trade", [q, r])) { improved = true; break outer; }
                  }
                }
              }
            }
          }
        }
      } catch (e) { if (e !== COVER_STOP) throw e; }
    }
    if (!improved) break;
  }
  return { owner, score, risk: strict || risk, before, moves, tried, pairMoves, relieves, trades, pairTried };
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
// "auto" (the default) runs the exact check on weeks up to this many shift copies, which is every week the parser accepts. It was 14
// until 2026-11-12 (150 random 5-10 shift weeks had the quick search beaten in 38, each by covering more hours). Raised after
// eval/auto-exact.mjs (eval/auto-exact.out.txt): on 36 seeded weeks of 6-60 people (18-245 copies) and the four built-in templates
// the exact check's roster scored better on 22 and the same on the rest, covered more hours on 10 (the café sample 15 h open,
// not 19), was proven on 38 of 40, and above 60 copies usually finished sooner, because the column generation that proves it also lets the
// plateau walk be skipped. Below 60 copies it took -0.3 to +1.0 s. The two unproven weeks have over 150 copies and stop on the same
// 20 s budget either way. `exact: false` (CLI --no-prove, page "Off") turns it off.
const EXACT_AUTO_SLOTS = MAX_SLOTS;
// Above this many shift copies the branch-and-bound tree in exactSearch is skipped when the whole-score column generation has run
// (eval/end-to-end.mjs, 2026-11-12): on two 40-person, 148-149 copy weeks the tree ran 38-68 s against its 8 s limit (each node
// builds a flow over every shift, and the clock is read every 1,024 nodes) and never proved or improved anything, while column
// generation given the time proved both. Those weeks get it instead: `scoreCGMs` defaults to 4 x exactMs there. `exactTree: true`
// keeps the tree on any week.
const EXACT_TREE_SLOTS = 60;
const TANGENTS = 8; // tangent lines under each person's hours curve inside the coverage flow
// Open hours are a sum of whole shift lengths (a shift is held or open), so a floor on them lifts to the least such sum at or above
// it: with shifts of 3, 8 and 10 hours nothing sums to 2, so a floor of 2 h means 3 h. The grid rounding in exactSearch only knows
// the lengths share whole hours. Returns a function x -> least reachable sum >= x (x itself when the lengths are off the
// quarter-hour grid, or past `upTo` hours, where the table stops). `openSums: false` in the options turns it off.
export function openSumLift(len, upTo) {
  const q = len.map((h) => Math.round(h * 4));
  if (!q.length || q.some((u, i) => u <= 0 || Math.abs(u - len[i] * 4) > 1e-9)) return (x) => x;
  const total = q.reduce((a, b) => a + b, 0), cap = Math.min(total, Math.max(0, Math.ceil(upTo * 4)) + Math.max(...q));
  const reach = new Uint8Array(cap + 1); reach[0] = 1;
  for (const u of q) for (let t = cap; t >= u; t--) if (reach[t - u]) reach[t] = 1;
  const next = new Int32Array(cap + 2).fill(-1); // next[t]: least reachable sum >= t (quarter hours), -1 if none in the table
  for (let t = cap; t >= 0; t--) next[t] = reach[t] ? t : next[t + 1];
  return (x) => {
    if (!(x > 1e-9)) return x;
    const t = Math.ceil(x * 4 - 1e-6);
    return t <= cap && next[t] >= 0 ? Math.max(x, next[t] / 4) : x;
  };
}

function exactSearch(ctx, incumbent, { nodeLimit = 400000, timeLimitMs = 8000, tolerance = 0, onFloor = null } = {}) {
  let coverNodes = 0;
  const { P, S, slots, staff, o, elig } = ctx;
  const mono = o.otMult >= 1 && o.dtMult >= 1;
  const mFloor = Math.min(1, o.otMult, o.dtMult);
  const burden = 1 + o.burdenPct / 100;
  const len = slots.map((s) => (s.end - s.start) / 60);
  const lift = o.openSums === false ? (x) => x : openSumLift(len, Math.floor(incumbent / BIG + 1e-9) + 1);
  const cheapest = slots.map((s, i) => {
    let m = Infinity;
    for (let p = 0; p < P; p++) if (elig[p][i]) m = Math.min(m, burden * (ctx.rates ? ctx.rates.at[p][i] : staff[p].wage) * mFloor * paidMinutes(o, s) / 60);
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
      sufPrefer[k][p] = sufPrefer[k + 1][p] + (elig[p][i] ? slotBonus(ctx, p, i) : 0);
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
  const cls = staff.map((p, q) => JSON.stringify([{ ...p, name: 0 }, elig[q], ctx.target[q], ctx.keep && ctx.keep[q] ? [...ctx.keep[q]] : 0]));
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
      // With wages by site the person's least rate stands in for the wage: the final pay is at least the shifts still to come at
      // their own rates plus this list's hours and overtime at that least rate (the regular rate never falls below it).
      if (mono) { const q = payParts(ctx, L, true); pay = burden * (ctx.rates ? ctx.rates.low[p] : staff[p].wage) * (q.straight + q.ot * o.otMult + q.dt * o.dtMult); }
      const h1 = Math.max(h, Math.min(staff[p].maxHours, h + sufHours[k][p]));
      lo0[p] = h; hi0[p] = h1;
      const g0 = gMin(p, h, h1);
      gSum += g0;
      let lo = pay + avoidPenalty(ctx, p, L) + toughPenalty(ctx, p, L) + g0;
      if (staff[p].prefer || (ctx.keep && ctx.keep[p])) lo -= preferBonus(ctx, p, L) + sufPrefer[k][p];
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
    const open = lift(unfilledH + Math.max(flowOpen, minOpenH - unfilledH)) - unfilledH;
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
    return base + BIG * (lift(unfilledH + Math.max(openCap, minOpenH - unfilledH, demand - coverableHours(k, hoursLeft, true).flow)) - unfilledH);
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
  const rate = (p, i) => burden * (ctx.rates ? ctx.rates.at[p][i] : staff[p].wage) * mFloor * paidMinutes(o, slots[i]) / 60 / len[i]; // cheapest pay per hour of the shift
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
        if (!elig[p][i] || left[p] <= eps || !validWith(ctx, p, lists[p], i)) continue;
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
  let dualBranchStats = null, coverBranchStats = null, coverLPStats = null, lpOwner = null;
  let scoreDual = -Infinity; // whole-score floor from pricing shifts (see priceScoreBound)
  // Branch-and-price by column generation (bnp.mjs columnGenerationOpen, pricing oracle makeSetPricer) on the least open hours.
  const runColumnGeneration = () => {
    const pricer = makeSetPricer(ctx);
    const cg = columnGenerationOpen(P, len, pricer, { cls: pricer.cls, incumbentOpen: incHours, nodeLimit: o.coverLPNodes ?? 2000, ms: o.coverLPMs ?? 10000 });
    coverLPStats = { ...cg.stats, rootLP: cg.rootLP, floor: cg.floor, proven: cg.proven, columnGeneration: true };
    minOpenH = Math.max(minOpenH, lift(cg.floor));
    if (cg.roster) lpOwner = Array.from(cg.roster);
  };
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
      minOpenH = lift(unit ? Math.ceil(pf.floor / unit - 1e-6) * unit : Math.max(0, pf.floor - 1e-6));
      // Branch on the open-hours price itself: every held set is worth 0 and an open shift costs BIG x its hours, so the same
      // branch-and-bound as above bounds the least open hours and closes part of the integrality gap the root price leaves.
      if (o.coverBranch !== false && minOpenH < incHours - 1e-9) {
        const zero = pf.cov.sets.map((fs) => new Float64Array(fs.length));
        const lam0 = Float64Array.from(pf.cov.lam, (x, i) => Math.min(BIG * pf.cov.len[i], x * BIG));
        const cb = branchDual(ctx, { sets: pf.cov.sets, vals: zero, len: pf.cov.len, lam: lam0 }, BIG * pf.floor, BIG * incHours, BIG * (incHours - (unit || 1) / 2), { maxNodes: o.coverBranchNodes ?? 60, ms: o.coverBranchMs ?? 4000 });
        coverBranchStats = cb.stats;
        const fl = cb.bound / BIG;
        minOpenH = Math.max(minOpenH, lift(unit ? Math.ceil(fl / unit - 1e-6) * unit : Math.max(0, fl - 1e-6)));
      }
      // Branch-and-price (bnp.mjs): the Dantzig-Wolfe LP solved exactly at every node, branching on who holds which shift.
      // Subgradient prices stop short of the LP; this closes the integrality gap the priced floor leaves. Column generation is
      // the default (faster on all 16 bench weeks, eval/cg-bench.mjs); `coverCG: false` uses the enumerated columns instead.
      if (o.coverLP !== false && minOpenH < incHours - 1e-9) {
        if (o.coverCG === false) {
          const bp = branchAndPriceOpen(pf.cov.sets, pf.cov.len, { incumbentOpen: incHours, nodeLimit: o.coverLPNodes ?? 2000, ms: o.coverLPMs ?? 10000 });
          coverLPStats = { ...bp.stats, rootLP: bp.rootLP, floor: bp.floor, proven: bp.proven };
          minOpenH = Math.max(minOpenH, lift(bp.floor));
          if (bp.roster) lpOwner = Array.from(bp.roster);
        } else runColumnGeneration();
      }
    } else if (o.coverLP !== false && o.coverCG !== false && minOpenH < incHours - 1e-9) {
      // A person has more valid sets than priceOpenFloor lists (60,000), so there are no enumerated columns and no priced floor;
      // column generation prices each person's best set on demand, so these big weeks get the LP floor too.
      runColumnGeneration();
    }
  }
  let rootBound = Math.max(lowerBound(0, 0), scoreDual);
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
      if (!validWith(ctx, p, lists[p], i)) continue;
      const nl = insertSorted(ctx, lists[p], i);
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
  // An integral LP at some branch-and-price node is a roster with fewer open hours than the incumbent. Adopted here, after the
  // coverage pass (which resets best and bestOwner together), so the cost search below starts from it and never prunes against a
  // score whose roster was dropped.
  if (lpOwner) {
    const total = scoreOwner(ctx, lpOwner).total;
    if (total < best - 1e-9) { best = total; bestOwner = lpOwner; }
  }
  // The open-hours floor is final here. `onFloor(hours, best)` (buildRoster's open-hours row, bnp.mjs `openFloor`) may return a
  // whole-score bound that knows it, { bound, owner }; when that bound reaches the best roster the tree below is not needed.
  if (onFloor && minOpenH > 0 && scoreDual < best - tolerance - 1e-9) {
    const r = onFloor(minOpenH, best);
    if (r) {
      if (r.owner) { const total = scoreOwner(ctx, r.owner).total; if (total < best - 1e-9) { best = total; bestOwner = r.owner; } }
      if (r.bound > scoreDual) scoreDual = r.bound;
      rootBound = Math.max(rootBound, scoreDual);
      if (scoreDual >= best - tolerance - 1e-9) return { proven: true, banned: bannedCount, nodes: coverNodes, coverNodes, coverOpen: minOpenH, rootBound, coverBranchStats, coverLPStats, owner: bestOwner, score: bestOwner ? best : null };
    }
  }
  rec(0, 0);
  return { proven: !aborted, banned: bannedCount, nodes: nodes + coverNodes, coverNodes, coverOpen: minOpenH, rootBound, coverBranchStats, coverLPStats, owner: bestOwner, score: bestOwner ? best : null };
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
// Pricing oracle for columnGenerationOpen (bnp.mjs): person p's valid shift set with the largest sum of w[s], holding every shift
// in `need` and none in `ban`. Depth-first over the shifts worth something (w > 0), best value per hour first, cut by a
// fractional-knapsack bound on the person's weekly hours. Every hard rule is downward closed (dropping a shift never breaks
// one), so a branch whose list fails validList can be dropped with everything under it. `maxNodes` caps one call; a capped
// call returns the best set it found with exact: false.
export function makeSetPricer(ctx, { maxNodes = 2000000, chainBound = true } = {}) {
  const { P, S, elig, slots, staff, restMin } = ctx;
  const mins = slots.map((s) => s.end - s.start);
  const items = Array.from({ length: P }, (_, p) => [...Array(S).keys()].filter((i) => elig[p][i] && validList(ctx, p, [i])));
  const cls = shiftClasses(ctx);
  const pricer = (p, w, need, ban) => {
    const base = need.length ? need.slice().sort((a, b) => slots[a].start - slots[b].start || a - b) : [];
    if (base.length && !validList(ctx, p, base)) return { set: null, value: -Infinity, exact: true };
    // Copies of one shift overlap, so a person holds at most one: keep only the best-priced allowed copy of each class.
    const needCls = new Set(need.map((i) => cls[i]));
    const top = new Map();
    for (const i of items[p]) {
      if (w[i] <= 1e-9 || ban.has(i) || needCls.has(cls[i])) continue;
      const t = top.get(cls[i]);
      if (t === undefined || w[i] > w[t]) top.set(cls[i], i);
    }
    const cand = [...top.values()].sort((a, b) => w[b] / mins[b] - w[a] / mins[a] || a - b);
    let baseVal = 0, baseMin = 0;
    for (const i of base) { baseVal += w[i]; baseMin += mins[i]; }
    const capMin = staff[p].maxHours * 60;
    let bestVal = baseVal, bestSet = base, nodes = 0, exact = true;
    // Chain bound (2026-11-11). Every pair of shifts in a valid set is at least restMin apart (validList), so a set is a chain
    // of intervals [start, end + restMin) that do not overlap. The fractional knapsack below ignores that, and on 80-person
    // weeks (cap 12-36 h, 4-9 h shifts, a 10 h rest rule) it let the search wander 578k nodes in one call. The Lagrangian of the
    // hours cap at the knapsack's own critical price lam gives a second bound that keeps the chain rule:
    //   lam * room + (best chain of the shifts still allowed, each worth max(0, w - lam * minutes)),
    // a weighted interval scheduling solved in O(n) over the candidates sorted by end. For any lam >= 0 it is an upper bound on
    // what a valid set can add, and at lam it is never above the knapsack's LP value, so the search takes the smaller of the two.
    // "Still allowed" means later in density order than x and clear of every shift already in the list by restMin.
    const n = cand.length;
    const chain = chainBounder(ctx, cand, mins, w);
    const bound = (x, room, list) => {
      let val = 0, lam = 0, r = room;
      for (let k = x; k < n && r > 0; k++) {
        const i = cand[k];
        if (mins[i] <= r) { val += w[i]; r -= mins[i]; } else { val += (w[i] * r) / mins[i]; lam = w[i] / mins[i]; r = 0; }
      }
      if (!chainBound || room <= 0) return val;
      const lag = lam * room + chain(x, list, lam);
      return lag < val ? lag : val;
    };
    const go = (x, list, val, used) => {
      if (!exact) return;
      if (++nodes > maxNodes) { exact = false; return; }
      if (val > bestVal + 1e-12) { bestVal = val; bestSet = list; }
      if (val + bound(x, capMin - used, list) <= bestVal + 1e-9) return;
      for (let k = x; k < cand.length; k++) {
        const i = cand[k];
        if (used + mins[i] > capMin + 1e-9) continue;
        if (!validWith(ctx, p, list, i)) continue;
        const nl = insertSorted(ctx, list, i);
        go(k + 1, nl, val + w[i], used + mins[i]);
        if (!exact) return;
        if (val + bound(k + 1, capMin - used, list) <= bestVal + 1e-9) return;
      }
    };
    go(0, base, baseVal, baseMin);
    return { set: bestSet, value: bestVal, exact, nodes };
  };
  pricer.cls = cls;
  return pricer;
}
// The chain bound shared by both pricing oracles (2026-11-11; in makeScorePricer since 2026-11-11 later). cand is a person's
// candidate shifts in the search's density order, val[i] the value a shift adds. Returns chain(x, list, lam): the best total of
// max(0, val - lam * minutes) over a set of cand[x..] whose shifts are clear of each other and of `list` by restMin, a weighted
// interval scheduling solved in O(n) over cand sorted by end. Every valid set is such a chain (validList), so for any lam >= 0,
// lam * room + chain(...) bounds what a valid set within `room` minutes can add.
function chainBounder(ctx, cand, mins, val) {
  const { slots, restMin } = ctx;
  const n = cand.length;
  const st = cand.map((i) => slots[i].start), en = cand.map((i) => slots[i].end);
  const byEnd = [...Array(n).keys()].sort((a, b) => en[a] - en[b] || a - b);
  const endR = byEnd.map((a) => en[a] + restMin);
  // pred[q]: how many of byEnd end (plus rest) at or before byEnd[q] starts; they form a prefix since endR is sorted.
  const pred = byEnd.map((a) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (endR[m] <= st[a]) lo = m + 1; else hi = m; } return lo; });
  const dp = new Float64Array(n + 1), v = new Float64Array(n);
  const clear = (a, list) => {
    for (const j of list) { const s = slots[j]; if (!(st[a] >= s.end + restMin || s.start >= en[a] + restMin)) return false; }
    return true;
  };
  return (x, list, lam) => {
    for (let a = 0; a < n; a++) { const r = a >= x && clear(a, list) ? val[cand[a]] - lam * mins[cand[a]] : 0; v[a] = r > 0 ? r : 0; }
    for (let q = 0; q < n; q++) { const take = v[byEnd[q]] + dp[pred[q]]; dp[q + 1] = take > dp[q] ? take : dp[q]; }
    return dp[n];
  };
}
// Shift classes for column generation: copies of one shift line (same day and times, and the same people may take them) share
// the smallest index among them. They are interchangeable for every hard rule, so branch-and-price branches on the class.
function shiftClasses(ctx) {
  const { P, S, slots, elig } = ctx;
  const first = new Map();
  return Array.from({ length: S }, (_, i) => {
    const s = slots[i];
    let key = `${s.day}|${s.start}|${s.end}|`;
    for (let p = 0; p < P; p++) key += elig[p][i] ? "1" : "0";
    if (!first.has(key)) first.set(key, i);
    return first.get(key);
  });
}
// Least open hours by branch-and-price with column generation: no enumeration of every valid set, so it also runs on weeks where
// a person has too many sets for priceOpenFloor (which returns null there). Test and bench hook; exactSearch calls it the same way.
export function openFloorByColumnGeneration(staff, slots, options = {}, cfg = {}) {
  const ctx = buildContext(staff, slots, options);
  const len = slots.map((s) => (s.end - s.start) / 60);
  const pricer = makeSetPricer(ctx, cfg);
  return columnGenerationOpen(ctx.P, len, pricer, { cls: pricer.cls, ...cfg });
}
// Pricing oracle for the whole-score column generation: person p's valid set with the largest  sum of w[s]  -  personScore,
// holding every shift in `need` and none in `ban`. personScore is not a sum over shifts (overtime tiers, the squared fairness
// term, the hours shortfall, split-shift days), so the depth-first search bounds a branch with pieces that are each a valid floor
// on the score of any set that adds to the current list:
//   - pay without the split-shift premium, plus each added shift's straight-time pay x the lowest pay multiplier (adding hours
//     never moves an hour to a cheaper tier), plus the avoid cost, plus the least extra tough-shift cost, minus the prefer bonus;
//   - the shortfall and fairness terms at their least over every total the person could still reach (both convex in hours);
//   - the split premium at 0 (adding a shift can close a gap, so the current count is not a floor).
// The added shifts then enter as a fractional knapsack on the weekly hours left. `maxNodes` caps one call (exact: false).
export function makeScorePricer(ctx, { maxNodes = 2000000, chainBound = true } = {}) {
  const { P, S, elig, slots, staff, o, target, avgWage } = ctx;
  const mins = slots.map((s) => s.end - s.start);
  const items = Array.from({ length: P }, (_, p) => [...Array(S).keys()].filter((i) => elig[p][i] && validList(ctx, p, [i])));
  const cls = shiftClasses(ctx);
  const burden = Math.max(0, 1 + o.burdenPct / 100);
  const minMult = Math.max(0, Math.min(1, o.otMult, o.dtMult));
  const kFair = (o.balance / 100) * avgWage * 0.1;
  const tw = o.toughBalance > 0 ? (o.toughBalance / 100) * avgWage : 0;
  // Least score increase from adding shift i to any list of person p (everything but the hours terms and the split premium).
  const incLB = staff.map((person, p) => Float64Array.from({ length: S }, (_, i) => {
    if (!elig[p][i]) return 0;
    let v = burden * person.wage * minMult * (paidMinutes(o, slots[i]) / 60);
    // Wages by site: adding h hours at rate r to a list whose regular rate is above r can lower the premium on overtime the
    // list already has, by at most h x (highest rate - r) x the largest premium share, so the floor is h x (r - that) (and the
    // plain h x r x minMult floor when a multiplier is under 1, where the premium can only lower pay).
    if (ctx.rates) {
      const r = ctx.rates.at[p][i], h = paidMinutes(o, slots[i]) / 60, c = Math.max(0, o.otMult - 1, o.dtMult - 1);
      v = burden * h * (o.otMult >= 1 && o.dtMult >= 1 ? r - c * (ctx.rates.high[p] - r) : Math.min(r * minMult, r - c * (ctx.rates.high[p] - r)));
    }
    if (ctx.diffMin.length) v += burden * (ctx.diffMin[i] / 60) * (o.diffPerHour + (person.wage * o.diffPct) / 100);
    if (tw && toughSlot(slots[i])) v += tw * (1 + 2 * (person.toughBefore || 0));
    v += avoidPenalty(ctx, p, [i]) - preferBonus(ctx, p, [i]);
    return v;
  }));
  // The fixed part of the floor for a list: its pay without the split premium, avoid, tough and prefer terms.
  const fixedLB = (p, list) => {
    let pay = payroll(ctx, p, list, true);
    if (o.splitPremium > 0) pay -= burden * splitDays(ctx, list) * o.splitPremium;
    return pay + toughPenalty(ctx, p, list) + avoidPenalty(ctx, p, list) - preferBonus(ctx, p, list);
  };
  // Least of shortfall + fairness over hours h in [lo, hi]. Convex, so the least is at an end or a stationary point.
  const quad = (p, h) => Math.max(0, staff[p].minHours - h) * o.shortfallValue + kFair * (h - target[p]) ** 2;
  const minQuad = (p, lo, hi) => {
    const t = target[p], mh = staff[p].minHours;
    let best = Math.min(quad(p, lo), quad(p, hi));
    for (const h of [t, mh, kFair > 0 ? t + o.shortfallValue / (2 * kFair) : mh]) if (h > lo && h < hi) best = Math.min(best, quad(p, h));
    return best;
  };
  const pricer = (p, w, need, ban) => {
    const base = need.length ? need.slice().sort((a, b) => slots[a].start - slots[b].start || a - b) : [];
    if (base.length && !validList(ctx, p, base)) return { set: null, value: -Infinity, cost: Infinity, exact: true };
    const needCls = new Set(need.map((i) => cls[i]));
    const top = new Map();
    for (const i of items[p]) {
      if (ban.has(i) || needCls.has(cls[i])) continue;
      const t = top.get(cls[i]);
      if (t === undefined || w[i] > w[t]) top.set(cls[i], i);
    }
    const u = new Float64Array(S);
    for (const i of top.values()) u[i] = w[i] - incLB[p][i];
    const cand = [...top.values()].sort((a, b) => u[b] / mins[b] - u[a] / mins[a] || a - b);
    const capMin = staff[p].maxHours * 60;
    const wOf = (list) => list.reduce((a, i) => a + w[i], 0);
    let bestSet = base, bestCost = personScore(ctx, p, base), bestVal = wOf(base) - bestCost, nodes = 0, exact = true;
    // The added shifts' u by fractional knapsack on the hours left, then, as in makeSetPricer, the Lagrangian of the hours cap at
    // the knapsack's critical price with the rest rule kept (chainBounder); the smaller of the two bounds the added u.
    const chain = chainBound ? chainBounder(ctx, cand, mins, u) : null;
    const knap = (x, room, list) => {
      let v = 0, lam = 0, r = room;
      for (let k = x; k < cand.length && r > 0; k++) {
        const i = cand[k];
        if (u[i] <= 0) break;
        if (mins[i] <= r) { v += u[i]; r -= mins[i]; } else { v += (u[i] * r) / mins[i]; lam = u[i] / mins[i]; r = 0; }
      }
      if (!chain || room <= 0 || v <= 0) return v;
      const lag = lam * room + chain(x, list, lam);
      return lag < v ? lag : v;
    };
    // Upper bound on the value of any valid set that adds shifts from cand[x..] to `list`.
    // reachMin[x]: minutes of cand[x..], so the bound reads it instead of summing on every node.
    const reachMin = new Float64Array(cand.length + 1);
    for (let k = cand.length - 1; k >= 0; k--) reachMin[k] = reachMin[k + 1] + mins[cand[k]];
    // `fixed` is fixedLB(p, list), worked out once per node: the node's own check and every sibling cut use the same list.
    const upper = (x, list, wv, used, fixed) => {
      const room = Math.max(0, Math.min(capMin - used, reachMin[x]));
      return wv - fixed + knap(x, capMin - used, list) - minQuad(p, used / 60, (used + room) / 60);
    };
    const go = (x, list, wv, used) => {
      if (!exact) return;
      if (++nodes > maxNodes) { exact = false; return; }
      if (list !== base) {
        const c = personScore(ctx, p, list);
        if (wv - c > bestVal + 1e-9) { bestVal = wv - c; bestSet = list; bestCost = c; }
      }
      const fixed = fixedLB(p, list);
      if (upper(x, list, wv, used, fixed) <= bestVal + 1e-9) return;
      for (let k = x; k < cand.length; k++) {
        const i = cand[k];
        if (used + mins[i] > capMin + 1e-9) continue;
        if (!validWith(ctx, p, list, i)) continue;
        const nl = insertSorted(ctx, list, i);
        go(k + 1, nl, wv + w[i], used + mins[i]);
        if (!exact) return;
        // Sibling cut, as in makeSetPricer: every later sibling, and everything under it, adds shifts from cand[k + 1..] to
        // this list, which upper(k + 1, ...) bounds; once that is at or below the best found nothing later in this loop can
        // beat it (a set replaces the best only when strictly above it), so the search returns the same best set, sooner.
        if (upper(k + 1, list, wv, used, fixed) <= bestVal + 1e-9) return;
      }
    };
    const baseMin = base.reduce((a, i) => a + mins[i], 0);
    go(0, base, wOf(base), baseMin);
    return { set: bestSet, value: bestVal, cost: bestCost, exact, nodes };
  };
  pricer.cls = cls;
  return pricer;
}
// Lower bound on the whole roster score (pay, penalties and BIG per open hour) by branch-and-price with column generation: the
// Dantzig-Wolfe LP with one column per (person, valid set) costed at personScore, solved by columnGenerationOpen with costed
// columns and makeScorePricer as the oracle. Unlike priceScoreBound (subgradient prices on enumerated sets) it solves the LP
// exactly, needs no enumeration, and branches; `incumbentScore - tolerance` is the cutoff, so `proven` means no roster beats
// the incumbent by more than the tolerance. Returns columnGenerationOpen's result: floor is the score bound.
export function scoreBoundByColumnGeneration(staff, slots, options = {}, cfg = {}) {
  return scoreColumnGeneration(buildContext(staff, slots, options), cfg);
}
// Open-hours floor for the first whole-score column generation (buildRoster, "earlyFloor"): the root of the coverage-only column
// generation (bnp.mjs columnGenerationOpen with makeSetPricer, open hours only), lifted by openSumLift. Returned only when the
// lift raises it above that root LP, i.e. when whole shifts say more than the LP does; otherwise the row would add little.
// Returns { floor, rootLP, ms } or null (no open hours in the incumbent, or nothing gained).
function earlyOpenFloor(ctx, incumbentScore, o = {}) {
  const incOpen = Math.floor(incumbentScore / BIG + 1e-9);
  if (!(incOpen > 0)) return null;
  const t0 = Date.now();
  const len = ctx.slots.map((s) => (s.end - s.start) / 60);
  let cov;
  try {
    const pricer = makeSetPricer(ctx);
    cov = columnGenerationOpen(ctx.P, len, pricer, { cls: pricer.cls, incumbentOpen: incOpen, nodeLimit: o.earlyFloorNodes ?? 1, ms: o.earlyFloorMs ?? 2000, dive: false, rootDive: false });
  } catch { return null; }
  const base = Math.max(cov.floor, cov.rootLP ?? 0);
  if (!(base > 1e-9) || !Number.isFinite(base)) return null;
  const floor = openSumLift(len, incOpen + 1)(base);
  if (!(floor > (cov.rootLP ?? 0) + 1e-6) || floor > incOpen + 1e-9) return null;
  return { floor, rootLP: cov.rootLP, ms: Date.now() - t0 };
}
// Open-hours floor from a compact LP with clique rows (2026-11-13). Variables x[p,s] (person p holds shift copy s) and open[s];
//   each shift copy: sum_p x[p,s] + open[s] = 1;   each person: sum_s hours[s] x[p,s] <= max hours;   each person and day: the
//   daily cap likewise;   each person and clique: sum x[p,s] <= 1, where a clique is a set of shifts that pairwise break the rest
//   rule (two shifts clash when the later starts before the earlier ends plus the rest gap, validList), i.e. shifts whose
//   intervals [start, end + rest) share a point. Those intervals form an interval graph, so the clique rows at each start point
//   describe exactly which sets of shifts a person can hold when hours are ignored; the pairwise rows of eval/ilp-check.py are
//   much weaker as an LP. Minimise open hours.
// Why: on the 60 x 168 week 0 of eval/end-to-end.mjs the engine held 300 open hours and reported a floor of 275 (the whole-score
// column generation's root, not converged after 34 s); HiGHS proved 300 optimal in 5 s, with 300 as its root bound after presolve
// merged the pairwise conflicts into cliques, and this LP is 300.0 (eval/clique-floor.mjs). Every rule it drops (days in a row,
// keep sets, pay) only lowers it, so it is a floor for every roster. The value used is a dual bound, sum of row duals plus each
// column's negative reduced cost (every variable lies in [0, 1] here), so it holds whatever rounding the simplex leaves.
// Returns { floor, lp, rows, cols, pivots, ms } or null (nothing to bound, or the LP failed). `floor` is lifted to the next sum
// of whole shift lengths at or above the dual bound (openSumLift) when the lengths are quarter hours.
export function cliqueOpenFloor(ctx, { upTo = Infinity, maxPivots = 200000 } = {}) {
  const t0 = Date.now();
  const { P, S, slots, elig, staff, restMin } = ctx;
  if (!S) return null;
  const len = slots.map((s) => (s.end - s.start) / 60);
  const cols = [], cost = [], vals = [], init = [];
  // rows 0..S-1: shift copies. Further rows are appended as they are made; each gets a slack column (cost 0) that starts the basis.
  let m = S;
  const holds = Array.from({ length: S }, () => []); // per shift: column ids of x[., s], filled below
  const xcol = [];                                    // column id -> [p, s]
  const pending = []; // [colId, row, coefficient] entries added after each x column exists
  for (let p = 0; p < P; p++) {
    const ss = [];
    for (let i = 0; i < S; i++) if (elig[p][i] && validList(ctx, p, [i])) ss.push(i);
    if (!ss.length) continue;
    const ids = new Map();
    for (const i of ss) { const j = cols.length; cols.push([i]); vals.push([1]); cost.push(0); ids.set(i, j); holds[i].push(j); xcol.push([p, i]); }
    const knap = (list, capMin) => {
      const tot = list.reduce((a, i) => a + slots[i].end - slots[i].start, 0);
      if (!(capMin < tot - 1e-9)) return;
      const r = m++;
      for (const i of list) pending.push([ids.get(i), r, (slots[i].end - slots[i].start) / capMin]);
    };
    knap(ss, Math.max(1e-6, staff[p].maxHours * 60));
    const dcap = dailyCapMin(ctx, p);
    if (dcap !== Infinity) {
      const byDay = new Map();
      for (const i of ss) (byDay.get(slots[i].day) || byDay.set(slots[i].day, []).get(slots[i].day)).push(i);
      for (const list of byDay.values()) knap(list, dcap);
    }
    // Maximal cliques of the intervals [start, end + rest): the set alive at each start point, kept when no later start point's
    // set contains it (sets alive at successive starts only gain members by starts, so a set is maximal iff the next start point
    // does not drop any member, i.e. some member ends before the next start).
    const order = ss.slice().sort((a, b) => slots[a].start - slots[b].start || a - b);
    const starts = [...new Set(order.map((i) => slots[i].start))];
    for (let k = 0; k < starts.length; k++) {
      const t = starts[k];
      const alive = order.filter((i) => slots[i].start <= t && t < slots[i].end + restMin);
      if (alive.length < 2) continue;
      const nt = starts[k + 1];
      if (nt !== undefined && alive.every((i) => nt < slots[i].end + restMin)) continue; // the next point's set contains it
      const r = m++;
      for (const i of alive) pending.push([ids.get(i), r, 1]);
    }
  }
  for (const [j, r, a] of pending) { cols[j].push(r); vals[j].push(a); }
  const nx = cols.length;
  // open[s]
  for (let i = 0; i < S; i++) { init[i] = cols.length; cols.push([i]); vals.push([1]); cost.push(len[i]); }
  for (let r = S; r < m; r++) { init[r] = cols.length; cols.push([r]); vals.push([1]); cost.push(0); }
  for (let j = 0; j < cols.length; j++) {
    // Rows in increasing order with their coefficients; a column of ones is passed as plain rows.
    const ord = cols[j].map((r, t) => [r, vals[j][t]]).sort((a, b) => a[0] - b[0]);
    cols[j] = ord.map((e) => e[0]);
    vals[j] = ord.every((e) => e[1] === 1) ? null : ord.map((e) => e[1]);
  }
  let res;
  try { res = solveLP(m, cols, cost, init, { maxPivots, vals, bigM: 1e6 }); } catch { return null; }
  if (res.infeasible) return null;
  // Dual bound: for any y, sum_r y_r + sum_j min(0, c_j - y.A_j) <= the LP's least value, because every column is at most 1.
  let bound = 0;
  for (let r = 0; r < m; r++) bound += res.y[r];
  for (let j = 0; j < cols.length; j++) {
    let rc = cost[j];
    const v = vals[j], rows = cols[j];
    for (let t = 0; t < rows.length; t++) rc -= res.y[rows[t]] * (v ? v[t] : 1);
    if (rc < 0) bound += rc;
  }
  bound = Math.max(0, bound - 1e-7);
  const floor = Number.isFinite(upTo) ? openSumLift(len, upTo + 1)(bound) : bound;
  return { floor, lp: res.obj, bound, rows: m, cols: cols.length, people: nx, pivots: res.pivots, ms: Date.now() - t0 };
}
function scoreColumnGeneration(ctx, { incumbentScore = Infinity, tolerance = 0, maxNodes = 2000000, chainBound = true, ...cfg } = {}) {
  const len = ctx.slots.map((s) => (s.end - s.start) / 60);
  const pricer = makeScorePricer(ctx, { maxNodes, chainBound });
  return columnGenerationOpen(ctx.P, len, pricer, { cls: pricer.cls, openCost: len.map((h) => BIG * h), unit: 0, incumbentOpen: incumbentScore, tolerance, ...cfg });
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
      if (!validWith(ctx, p, lists[p], i)) continue;
      const nl = insertSorted(ctx, lists[p], i);
      owner[i] = p; lists[p] = nl; break;
    }
  }
  return owner;
}

// One person's paid trips between sites: count, minutes paid, and what they add to the payroll (overtime included).
function tripStats(ctx, p, list, cost) {
  let m = 0;
  const trips = siteTrips(ctx, list, (d, x) => { m += x; });
  return { trips, travelHours: ctx.o.travelPay ? m / 60 : 0, travelCost: trips ? cost - payroll(ctx, p, list, true) : 0 };
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
      ...(ctx.tripPay ? tripStats(ctx, k, lists[k], c) : {}),
      ...(ctx.rates ? { siteWageCost: c - payroll({ ...ctx, rates: null }, k, lists[k]) } : {}),
    };
  });
  const unfilledHours = unfilled.reduce((t, i) => t + (slots[i].end - slots[i].start) / 60, 0);
  return { owner: owner.slice(), people, cost, otHours, hours, unfilled, unfilledHours, lists };
}

function whyUnfilled(ctx, owner, i) {
  const slot = ctx.slots[i];
  const lists = Array.from({ length: ctx.P }, () => []);
  owner.forEach((p, k) => { if (p >= 0) lists[p].push(k); });
  const why = { free: 0, hours: 0, rest: 0, days: 0, overlap: 0, daily: 0, travel: 0 };
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
    if (gapBad) why.rest++; else if (travelClash(ctx, base, i)) why.travel++; else why.days++;
  }
  let text;
  const skilled = slot.role ? ctx.staff.filter((p) => qualified(p, slot)).length : ctx.P;
  const pinned = slot.fixed && ctx.staff.some((p) => p.name.toLowerCase() === slot.fixed.toLowerCase());
  if (pinned && why.free === 0) text = `${slot.fixed} is pinned to this shift but is not available for the whole of it`;
  else if (slot.role && skilled === 0) text = `nobody listed has the role "${slot.role}"`;
  else if (slot.site && !ctx.staff.some((p) => worksAt(p, slot))) text = `nobody listed works at "${slot.site}"`;
  else if (why.free === 0) text = slot.role ? `nobody with the role "${slot.role}" is available for this whole shift` : "nobody listed is available for this whole shift";
  else {
    const bits = [];
    if (why.overlap) bits.push(`${why.overlap} already on another shift`);
    if (why.rest) bits.push(`${why.rest} would break the rest rule`);
    if (why.travel) bits.push(`${why.travel} would have no time to travel from another site`);
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
  // With a call-out price set, the posted roster may not be the best-scoring one: say so rather than claim a proof it breaks.
  if (opt.coverTraded) {
    const p = opt.status === "optimal" || opt.status === "improved"
      ? `The best-scoring roster was proven (${money2(opt.coverTraded.provenScore)} of score)`
      : `The best-scoring roster found scores ${money2(opt.coverTraded.provenScore)}`;
    return `${p}, and this roster is ${money2(opt.coverTraded.give)} of score above it, traded for call-out slack at the price you set (${num(opt.coverTraded.riskHoursSaved)} fewer hours at risk).`;
  }
  if (opt.status === "optimal") return `Checked against an exact search: no roster under your rules scores better than this one${opt.tolerance > 0 ? ` by more than ${money2(opt.tolerance)} of score` : ""}.`;
  if (opt.status === "improved") return `Checked against an exact search: the quick search was ${num(opt.gapPct)}% off the best possible, so this roster is the better one the exact search found (proven best${opt.tolerance > 0 ? `, to within ${money2(opt.tolerance)} of score` : ""}).`;
  if (opt.gap < BIG && opt.coverageProven) {
    const h = opt.forcedOpenHours;
    return `Exact search ran out of time before it could prove the cheapest roster, but it did prove the coverage: ${h > 0 ? `${num(h)} hour${h === 1 ? "" : "s"} of shifts cannot be covered under your rules, however the week is arranged` : "every shift can be covered"}, and this roster covers all the rest. The cheapest way to do that could still save at most ${money(opt.gap)} in the score (pay plus penalties).`;
  }
  return `Exact search ran out of time before it could prove anything. The best roster it found is shown; the true best could still be better by up to ${num(opt.gapPct)}% of the score by a loose bound, so treat this as a good roster, not a proven one.`;
}

// With a keep bonus on and no proof, the quick search can land on a roster that leaves more open than it would without the
// bonus (café sample, dated days off, exact check off: week 3 left 27 h open with the bonus, 22 h without; eval/steady-plan.mjs).
// A proven roster cannot (open hours cost BIG, the bonus is a fraction of a wage), so only an unproven one is checked against
// a build without the bonus, and the one with fewer open hours is kept (the kept one on a tie). `keepChecked` says which won.
//
// Same input, same roster: the last 32 builds are remembered in this process and a repeat returns a copy at once. On the
// page, building an unchanged week again (a second click, a report that rebuilds) no longer re-runs a multi-second proof;
// in the tests, 92 of the suite's ~390 s inside buildRoster were repeats of an input the same file had already built
// (2026-11-13; the sample week alone 42 times). Only plain data is remembered: an input holding anything JSON would
// misread (a Set, a Map, a function, a Date) is built fresh. `memo: false` always builds fresh.
const rosterMemo = new Map();
const ROSTER_MEMO_SIZE = 32; // the sample week's roster is about 9 KB as JSON
function memoKey(value) {
  let ok = true;
  const key = JSON.stringify(value, (k, v) => {
    if (v === undefined || v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : `#${v}`; // JSON would write NaN and Infinity as null
    if (Array.isArray(v)) return v;
    if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return v;
    ok = false;
    return null;
  });
  return ok ? key : null;
}
export function buildRoster(staff, slots, options = {}) {
  const key = options?.memo === false ? null : memoKey([staff, slots, options]);
  if (key !== null && rosterMemo.has(key)) {
    const hit = rosterMemo.get(key);
    rosterMemo.delete(key); rosterMemo.set(key, hit); // least recently used goes first
    return structuredClone(hit);
  }
  const r = buildRosterUnmemoized(staff, slots, options);
  if (key === null) return r;
  try {
    rosterMemo.set(key, structuredClone(r));
  } catch {
    return r; // a result that cannot be copied is not remembered
  }
  if (rosterMemo.size > ROSTER_MEMO_SIZE) rosterMemo.delete(rosterMemo.keys().next().value);
  return r;
}
function buildRosterUnmemoized(staff, slots, options = {}) {
  const r = buildRosterOnce(staff, slots, options);
  if (r.error || !keepOn(options) || !Object.keys(options.keep).length) return r;
  if (["optimal", "improved"].includes(r.optimality?.status)) return r;
  const plain = buildRosterOnce(staff, slots, { ...options, keepValue: 0, keepShift: 0 });
  if (!plain.error && plain.unfilledHours < r.unfilledHours - 1e-9) return { ...plain, keepChecked: "dropped: it left more hours open" };
  return { ...r, keepChecked: "kept" };
}

function buildRosterOnce(staff, slots, options = {}) {
  const ctx = buildContext(staff, slots, options);
  if (!ctx.P) return { error: "Add at least one person." };
  if (!ctx.S) return { error: "Add at least one shift to cover." };
  const o = ctx.o;
  const iterations = o.iterations > 0 ? o.iterations : Math.max(9000, ctx.S * 70);
  // Wall-clock budget for the improvement passes. A week near the 400-shift cap with 60 people ran past two minutes with no output
  // (measured 2026-11-04), so big weeks stop improving after `timeBudgetMs` (default 20 s above BIG_WEEK shifts, none below, so the
  // seeded small weeks and the guide pages are unchanged). Pass 0 for no budget. The roster so far is kept and `budgetHit` says so.
  const budgetMs = o.timeBudgetMs !== undefined ? o.timeBudgetMs : defaultBudgetMs(ctx.S);
  const tStart = Date.now();
  let budgetHit = false;
  const over = () => { if (budgetMs > 0 && Date.now() - tStart > budgetMs) { budgetHit = true; return true; } return false; };
  // Milliseconds spent in each stage, returned as `timings` so a slow week says where its time went.
  const timings = {};
  let tMark = tStart;
  const mark = (name) => { const now = Date.now(); timings[name] = (timings[name] || 0) + (now - tMark); tMark = now; };
  let best = search(ctx, o.restarts, iterations);
  // With a keep map, also start from the kept roster itself (keptStart): the annealer builds from scratch and lands far from it
  // on big weeks, and when the exact stages then run out of time, the reissue keeps that far roster (eval/reissue-scale.mjs).
  if (ctx.keep && o.keptStart !== false) {
    const ko = polishPay(ctx, keptStart(ctx), o.seed + 6151, Math.max(20000, ctx.S * 1000));
    const ks = scoreOwner(ctx, ko).total;
    if (ks < best.score - 1e-9) best = { owner: ko, score: ks };
  }
  mark("anneal");
  // Covering shifts outranks everything else, so while any shift is open spend as many extra restarts again on finding a roster that
  // covers more. A balance of 50 on the sample week left 8 coverable hours open after four restarts; twelve found them.
  if (scoreOwner(ctx, best.owner).unfilled > 0 && !over()) {
    const more = search(ctx, o.restarts * 6, iterations, o.restarts);
    if (more.score < best.score - 1e-9) best = more;
  }
  // Still open: the annealer's short runs stop too soon on weeks of about twenty shifts or more (eval/effort-bench.mjs), so give
  // a few restarts five times the iterations before the ejection passes.
  if (o.longPass !== false && scoreOwner(ctx, best.owner).unfilled > 0 && !over()) {
    const long = search(ctx, o.restarts, iterations * 5, o.restarts * 7);
    if (long.score < best.score - 1e-9) best = long;
  }
  mark("anneal");
  if (scoreOwner(ctx, best.owner).unfilled > 0) {
    // A few seeds, each from the best so far: one chain of moves rarely finds the best way to free the hours.
    for (let k = 0; k < 4 && !over(); k++) {
      const eo = ejectPass(ctx, best.owner, o.seed + 104729 * (k + 1), Math.max(20000, ctx.S * 1500));
      const es = scoreOwner(ctx, eo).total;
      if (es < best.score - 1e-9) best = { owner: eo, score: es };
    }
  }
  mark("eject");
  // Still open: walk the coverage plateau (open hours only), then polish pay. Kept only if it covers more.
  const coverPasses = () => {
    if (o.coverPass !== false && scoreOwner(ctx, best.owner).unfilled > 0 && !over()) {
      for (let k = 0; k < (o.coverPassRuns ?? 12) && !over(); k++) {
        const cp = coverPass(ctx, best.owner, o.seed + 15485863 * (k + 1), Math.max(60000, ctx.S * 4000) * (o.coverPassScale ?? 4));
        if (cp.open >= scoreOwner(ctx, best.owner).unfilled - 1e-9) continue;
        const po = polishPay(ctx, cp.owner, o.seed + k, Math.max(20000, ctx.S * 1000));
        const ps = scoreOwner(ctx, po).total;
        if (ps < best.score - 1e-9) best = { owner: po, score: ps };
      }
      mark("coverPass");
      if ((o.coverRepair ?? (exactOn || o.openShiftWeight !== undefined)) && scoreOwner(ctx, best.owner).unfilled > 0 && !over()) {
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
      mark("coverRepair");
    }
  };
  // On a big week with the exact check on, the whole-score column generation below finds the best roster itself, so the plateau
  // walk and the repair (about 10 s on a 40-person week) run only if it does not prove one. eval/end-to-end.mjs, 2026-11-12: on
  // three 40-person weeks (148-162 copies) and three 30-person weeks the rosters and proofs were the same with them first or not.
  // "auto" stays off when open shifts are priced (`openShiftWeight` > 0, CLI --open-shift-hours): the exact check scores open hours
  // only, so it would hand back the roster the weight was set to trade away (sample week 15 h / 5 shifts instead of 19 h / 3).
  // Read by coverPasses above, which runs after this line.
  // `deferCover: true` asks for that order on a small week too (calloutExposure does: README "Call-out rebuilds, column generation
  // first"); `false` turns it off on big ones. A posted week's reissue (`keepShift` > 0: CLI --changes, the page's "Changes since
  // you posted it") takes that order by default too: eval/reissue-order.mjs, 2026-11-13, 570 reissues on five teams x six seeds
  // gave the same score, open hours, changes, premiums and pay on every one, all proven, in 32.5 s against 72.2 s (README
  // "Posted reissues, column generation first").
  const exactOn = o.exact === true || (o.exact === "auto" && ctx.S <= EXACT_AUTO_SLOTS && !(o.openShiftWeight > 0));
  const bigExact = ctx.S > EXACT_TREE_SLOTS && o.exactTree !== true;
  // A fresh build takes it too since 2026-11-13 (README "Fresh builds, column generation first"): eval/fresh-order.mjs, fresh
  // weeks of the five teams x 12 seeds and seeded 8-20 person weeks at or under 60 copies, same score and open hours on every
  // one. So the order is column generation first whenever the exact check and column generation are on; `deferCover: false`
  // keeps the old order (plateau walk and repair first).
  const deferCover = exactOn && o.scoreCG !== false && o.deferCover !== false;
  // The clique LP's open-hours floor (cliqueOpenFloor, 2026-11-13), before the cover passes so the plateau walk can stop at it.
  // About 1.2 s on a 60-person week (245 copies), where it proves the 300 open hours the engine holds (the column generation's
  // root had reached 275 after 34 s). It is not given to the whole-score column generation as its open-hours row by default: on
  // the 60-person week 1 that row slowed the LP so much the pay proof it made in 8 s without the row was not made in the budget
  // (README "The 60-person week's 300 open hours are the least"). `cliqueFloor: false` turns it off.
  // On big weeks (cover passes deferred) it runs after the whole-score column generation, and only if that did not prove the
  // roster: with a time budget column generation gets half of what is left, and the LP's 1.4 s taken first cost the 60-person
  // week 1 its pay proof.
  let clique = null;
  const runClique = () => {
    if (!exactOn || o.cliqueFloor === false || over()) return;
    // Under a time budget, skip it unless the time left covers its expected cost: 1.6 s x (copies / 245)^4.5, fitted to one machine's
    // 1.2-1.7 s at 238-245 copies, 4.5-6.3 s at 304-326 and 13-15 s at 400 (eval/clique-floor.out.txt). `cliqueFloor: true` runs it anyway.
    if (budgetMs > 0 && o.cliqueFloor !== true && budgetMs - (Date.now() - tStart) < 1600 * Math.pow(ctx.S / 245, 4.5)) return;
    // `openSums: false` (no lift to whole shift sums) applies here too: the floor is then the dual bound alone.
    clique = cliqueOpenFloor(ctx, { upTo: o.openSums === false ? Infinity : Math.floor(best.score / BIG + 1e-9) });
    if (clique) ctx.openFloor = Math.max(ctx.openFloor ?? openHoursFloor(ctx), clique.floor);
    mark("cliqueFloor");
  };
  if (!deferCover) { runClique(); coverPasses(); }
  // Optional proof: for small problems search exhaustively (with pruning) and say how far the annealed roster is from the best possible.
  let optimality = null;
  if (exactOn && !over()) {
    const annealScore = best.score;
    // Whole-score branch-and-price first (scoreColumnGeneration: the Dantzig-Wolfe LP costed at each person's score, solved by
    // column generation). On the 12 seeded weeks of eval/score-cg-bench.mjs it proved every roster best to within the tolerance in
    // at most 0.2 s, where the exact search below left 9 of 12 unproven after 8 s, and it found a cheaper roster on 3. When it
    // proves the roster the exact search is skipped; otherwise its bound joins the exact search's. `scoreCG: false` turns it off.
    let cg = null;
    // The open-hours row from the start (2026-11-12, later): the root LP of the coverage-only column generation (open hours, no
    // pay) is a floor on open hours for every roster, and lifted to a sum of whole shift lengths it can sit above that LP; then
    // the whole-score LP gets it as a row in its first pass instead of after 8 s without it and the exact search's ~10 s of floor
    // stages. Cheap (under 0.05 s on the call-out weeks). By default only up to 60 copies (EXACT_TREE_SLOTS): on the 30-60 person
    // bench weeks (121-245 copies) the coverage root LP came out whole hours, so the lift added nothing, and it cost 0.3-2.2 s
    // (eval/early-floor.out.txt). `earlyFloor: true` runs it at any size, `false` turns it off (so do `openRow: false`, `openSums: false`).
    const tryEarly = o.scoreCG !== false && o.openRow !== false && o.openSums !== false && (o.earlyFloor === true || (o.earlyFloor !== false && ctx.S <= EXACT_TREE_SLOTS));
    const early = tryEarly ? earlyOpenFloor(ctx, best.score, o) : null;
    if (tryEarly) mark("earlyFloor");
    // With a time budget (weeks above BIG_WEEK) and the cover passes deferred, column generation gets at most half of what is left,
    // so the passes still have time if it does not prove the roster: a 60-person week given 33 s of it ended 11 open hours worse.
    if (o.scoreCG !== false) {
      try {
        cg = scoreColumnGeneration(ctx, { incumbentScore: best.score, tolerance: o.exactTolerance, openFloor: early?.floor || 0, nodeLimit: o.scoreCGNodes ?? 20000, ms: o.scoreCGMs ?? Math.min(bigExact ? 4 * o.exactMs : o.exactMs, deferCover && budgetMs > 0 ? Math.max(1000, (budgetMs - (Date.now() - tStart)) / 2) : Infinity), maxNodes: o.scoreCGPricingNodes ?? 200000 });
      } catch { cg = null; } // a solver failure leaves the exact search to do the work alone
      mark("scoreCG");
      if (cg?.roster) {
        const own = Array.from(cg.roster);
        if (ownerValid(ctx, own)) { const t = scoreOwner(ctx, own).total; if (t < best.score - 1e-9) best = { owner: own, score: t }; }
      }
    }
    // Not proven (or the solver failed): now run the passes deferred above; the bound column generation reached still holds.
    if (deferCover && !cg?.proven) {
      runClique();
      coverPasses();
      if (cg && best.score <= cg.floor + o.exactTolerance + 1e-9) cg.proven = true;
    }
    // The open-hours row (bnp.mjs `openFloor`, 2026-11-12): once the exact search has proved more open hours than the whole-score
    // LP left open, column generation runs again with that floor as a row of its master LP, before the exact search's score tree.
    // On the call-out weeks of README "Open hours come in whole shifts" the first pass bounded 2 h open (204,094) against a 3 h
    // roster; with the lifted 3 h floor as a row the root LP is the roster's score and the tree is skipped. `openRow: false` turns it off.
    let cgRow = null;
    const openRow = (hours, incumbent) => {
      if (!(BIG * hours > cg.floor + 1e-6) || over()) return null;
      try {
        cgRow = scoreColumnGeneration(ctx, { incumbentScore: incumbent, tolerance: o.exactTolerance, openFloor: hours, nodeLimit: o.scoreCGNodes ?? 20000, ms: o.scoreCGMs ?? o.exactMs, maxNodes: o.scoreCGPricingNodes ?? 200000 });
      } catch { return null; }
      cgRow.openFloor = hours;
      const own = cgRow.roster ? Array.from(cgRow.roster) : null;
      return { bound: cgRow.floor, owner: own && ownerValid(ctx, own) ? own : null };
    };
    const ex = cg?.proven
      ? { proven: true, rootBound: best.score, coverOpen: Math.floor(best.score / BIG + 1e-9), coverNodes: 0, nodes: 0, owner: null }
      : cg && bigExact
      ? { proven: false, rootBound: cg.floor, coverOpen: Math.max(0, Math.floor(cg.floor / BIG + 1e-9)), coverNodes: 0, nodes: 0, owner: null, skipped: true }
      : exactSearch(ctx, best.score, { nodeLimit: o.exactNodes, timeLimitMs: o.exactMs, tolerance: o.exactTolerance, onFloor: cg && o.openRow !== false ? openRow : null });
    mark("exactSearch");
    if (cg && !cg.proven) ex.rootBound = Math.max(ex.rootBound, cg.floor);
    // The clique floor is on open hours alone: it raises the open-hours floor (and so coverage proven) but not the score bound.
    // Pay and penalties are never negative, so BIG x the floor also bounds the score, unless prefer: windows or kept shifts give
    // bonuses (slotBonus), which can take a roster's score below its open hours' share.
    if (clique && !ex.proven) {
      ex.coverOpen = Math.max(ex.coverOpen, Math.floor(clique.floor + 1e-9));
      const bonuses = ctx.staff.some((q) => q.prefer) || (ctx.keep && ctx.keep.some((k) => k && k.size));
      if (!bonuses) ex.rootBound = Math.max(ex.rootBound, BIG * clique.floor);
    }
    if (ex.owner && ex.score < best.score - 1e-9) best = { owner: ex.owner, score: ex.score };
    const gap = ex.proven ? annealScore - best.score : best.score - Math.min(ex.rootBound, best.score);
    optimality = {
      status: ex.proven ? (gap > 1e-6 ? "improved" : "optimal") : "bounded",
      annealScore, bestScore: best.score, lowerBound: ex.proven ? best.score : ex.rootBound,
      forcedOpenHours: ex.proven ? Math.floor(best.score / BIG + 1e-9) : Math.max(Math.floor(ex.rootBound / BIG + 1e-9), Math.floor(ex.coverOpen + 1e-9)),
      coverageProven: ex.proven || Math.max(Math.floor(ex.rootBound / BIG + 1e-9), Math.floor(ex.coverOpen + 1e-9)) === Math.floor(best.score / BIG + 1e-9),
      tolerance: o.exactTolerance, coverOpen: ex.coverOpen, coverNodes: ex.coverNodes, gap: Math.max(0, gap), gapPct: annealScore > 0 ? (Math.max(0, gap) / annealScore) * 100 : 0, nodes: ex.nodes, treeSkipped: !!ex.skipped,
      scoreCG: cg ? { proven: cg.proven, rootLP: cg.rootLP, bound: cg.floor, nodes: cg.stats.nodes, columns: cg.stats.columns, inexactPricing: cg.stats.inexactPricing, ms: cg.stats.ms } : null,
      earlyFloor: early,
      cliqueFloor: clique ? { floor: clique.floor, lp: clique.lp, rows: clique.rows, columns: clique.cols, pivots: clique.pivots, ms: clique.ms } : null,
      openRow: cgRow ? { openFloor: cgRow.openFloor, proven: cgRow.proven, rootLP: cgRow.rootLP, bound: cgRow.floor, nodes: cgRow.stats.nodes, ms: cgRow.stats.ms } : null,
    };
  }
  // Call-out slack, priced (2026-11-13). Runs last, on the best roster the search (and any proof) reached, so a week built
  // without a price is untouched and a proof made above still describes the roster it was made for. When the pass does
  // trade score for slack, `coverSlack` says what it paid and `optimality.coverTraded` keeps the proven score beside it.
  let coverSlack = null;
  // Measured cost of the pass itself: 0-11 ms on the five templates, 22-158 ms on seeded 20- and 40-person weeks (81-149
  // copies) and 1.06 s on the 60-person week 0 (245 copies), so it is capped at 250 copies; `coverPriceSlots` moves the cap.
  if (o.coverPrice > 0 && ctx.S <= (o.coverPriceSlots ?? 250)) {
    const chain = o.coverChain ?? COVER_CHAIN, budget = o.coverBudget ?? COVER_BUDGET;
    const out = coverSlackPass(ctx, best.owner, { price: o.coverPrice, chain, budget, pairs: o.coverPairs !== false && ctx.S <= (o.coverPairsSlots ?? COVER_PAIRS_SLOTS) });
    const before = out.before;
    coverSlack = {
      price: o.coverPrice, riskHoursBefore: before.hours, riskHours: out.risk.hours,
      riskyDaysBefore: before.riskyDays, riskyDays: out.risk.riskyDays, personDays: before.personDays,
      scoreBefore: best.score, scoreAfter: out.score, moves: out.moves, candidates: out.tried,
      pairMoves: out.pairMoves, relieves: out.relieves, trades: out.trades,
      cases: out.risk.cases.map((c) => ({ person: c.person, day: c.day, hours: c.hours })),
    };
    if (out.moves > 0) {
      if (optimality) optimality.coverTraded = { give: out.score - best.score, provenScore: best.score, riskHoursSaved: before.hours - out.risk.hours };
      best = { owner: out.owner, score: out.score };
    }
    mark("coverSlack");
  }

  const res = summarise(ctx, best.owner);
  const base = summarise(ctx, listedOrder(ctx));
  mark("summary");

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
  mark("critical");

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
  mark("hireTest");

  const warnings = [];
  staff.forEach((p, k) => {
    if (!ctx.elig[k].some(Boolean)) warnings.push(`${p.name} is not available for any of the shifts, so they get no hours.`);
  });
  const known = new Set(staff.map((p) => p.name.toLowerCase()));
  slots.forEach((s) => { if (s.fixed && s.fixed !== STARTED_OPEN && !known.has(s.fixed.toLowerCase())) warnings.push(`A shift is pinned to "${s.fixed}", who is not in the staff list, so nobody can take it.`); });
  res.people.forEach((p) => {
    if (p.avoidHours > 0.01) warnings.push(`${p.name} works ${num(p.avoidHours)} hours inside the times they asked to avoid; avoiding them would have left a shift open or cost more.`);
  });
  const capHours = staff.reduce((t, p) => t + p.maxHours, 0);
  if (budgetHit) warnings.push(`This week is large (${ctx.S} shifts), so the search stopped after ${Math.round(budgetMs / 1000)} seconds and kept the best roster found so far. More improvement may exist; split the week or raise timeBudgetMs (0 for no limit) to search longer.`);
  if (capHours < ctx.totalHours) warnings.push(`The shifts add up to ${num(ctx.totalHours)} hours but everyone's weekly limits together are ${num(capHours)}, so some shifts cannot be filled.`);
  res.people.forEach((p) => {
    if (p.short > 0.01) warnings.push(`${p.name} gets ${num(p.hours)} hours, ${num(p.short)} under their minimum of ${num(p.minHours)}.`);
  });
  if (options.travel !== undefined && options.travel !== null && options.travel !== "") {
    const tv = parseTravel(options.travel), named = new Set(slots.filter((s) => s.site).map((s) => siteKey(s.site)));
    for (const e of tv.errors) warnings.push(e);
    for (const [x, y] of tv.pairs) for (const z of [x, y]) if (!named.has(z)) warnings.push(`travel: no shift is at a site called "${z}", so its travel time is not used.`);
    if (ctx.travel === null && !ctx.tripPay && !tv.errors.length && named.size > 1) warnings.push(`travel: every trip between sites is within the ${num(ctx.restMin / 60)} hour rest rule, so it changes nothing; lower the rest rule to allow split shifts across sites.`);
  }
  if (o.siteWage !== undefined && o.siteWage !== null && String(o.siteWage).trim() !== "") {
    const sw = parseSiteWage(o.siteWage), named = new Set(slots.filter((s) => s.site).map((s) => siteKey(s.site)));
    for (const e of sw.errors) warnings.push(e);
    for (const r of sw.rules) if (!named.has(r.site)) warnings.push(`site wage: no shift is at a site called "${r.label}", so its wage is not used.`);
    if (!ctx.rates && sw.rules.some((r) => named.has(r.site))) warnings.push("site wage: nobody's wage changes at the sites listed (every wage is already at or above the floor), so it changes nothing.");
  }
  if (staff.some((p) => p.siteWages)) {
    const named = new Set(slots.filter((s) => s.site).map((s) => siteKey(s.site)));
    for (const p of staff) for (const w of (p.siteWages || new Map()).values()) if (!named.has(w.site)) warnings.push(`${p.name}: no shift is at a site called "${w.label}", so their wage there is not used.`);
  }
  if (o.travelPay || o.travelAllowance > 0) {
    const tv = parseTravel(options.travel);
    if (!ctx.tripPay) warnings.push("travel pay: fewer than two shifts name a site, so there are no trips between sites to pay.");
    else if (o.travelPay && !tv.all && !tv.pairs.length) warnings.push("travel pay: no travel time is set, so trips between sites are paid 0 minutes; set the travel time between sites.");
  }
  if (slots.some((s) => s.endMin > 1440 && s.day === 6) && staff.every((p) => p.prevEnd == null)) warnings.push("A Sunday-night shift runs into Monday; the rest rule is checked inside this one week only. To carry it into next week, add \"prev: Sun 10pm\" to each person next week.");

  const assignments = slots.map((s, i) => ({ slot: s, person: res.owner[i] >= 0 ? staff[res.owner[i]].name : null, ...(ctx.rates && res.owner[i] >= 0 ? { rate: ctx.rates.at[res.owner[i]][i] } : {}) }));
  const grid = staff.map((p, k) => ({
    name: p.name,
    days: DAYS.map((_, d) => res.lists[k].filter((i) => slots[i].day === d).map((i) => `${fmtClock(slots[i].startMin)}–${fmtClock(slots[i].endMin)}${slots[i].label ? " " + slots[i].label : ""}${slots[i].role ? " [" + slots[i].role + "]" : ""}${slots[i].site ? " @ " + slots[i].site : ""}`)),
  }));

  const savingVsListed = base.cost - res.cost;
  return {
    ok: true, options: o, slots: ctx.S, totalHours: ctx.totalHours,
    cost: res.cost, hours: res.hours, otHours: res.otHours, unfilledHours: res.unfilledHours, unfilledSlots: res.unfilled.length,
    people: res.people, assignments, grid, unfilled, onlyOne, critical, hireTest, warnings,
    listed: { cost: base.cost, otHours: base.otHours, unfilledHours: base.unfilledHours, unfilledSlots: base.unfilled.length },
    savingVsListed, score: best.score, owner: res.owner, optimality, budgetHit, timings, coverSlack,
    filledAll: res.unfilled.length === 0,
    ...(ctx.rates ? { siteWage: siteWageSummary(ctx, res) } : {}),
    ...(ctx.tripPay ? { travelPaid: res.people.reduce((t, p) => ({ trips: t.trips + p.trips, hours: t.hours + p.travelHours, cost: t.cost + p.travelCost }), { trips: 0, hours: 0, cost: 0 }) } : {}),
  };
}

// What wages by site add this week: per priced site, the hours worked there and the pay above each person's own wage for
// them; and the whole roster's payroll above what the same roster costs at everyone's own wage (overtime included, so it can
// differ slightly from the sum of the sites: the regular rate moves with the week's mix).
function siteWageSummary(ctx, res) {
  const { o, slots, staff } = ctx;
  const sw = parseSiteWage(o.siteWage), burden = 1 + o.burdenPct / 100;
  // Priced sites: every site rule, then every site where someone has their own rate (in the order the shifts name them).
  const rows = sw.rules.map((r) => ({ site: r.label, key: r.site, add: r.add, pct: r.pct, min: r.min }));
  for (const s of slots) {
    const k = s.site ? siteKey(s.site) : "";
    if (k && !rows.some((x) => x.key === k) && staff.some((p) => p.siteWages && p.siteWages.has(k))) rows.push({ site: s.site, key: k, add: 0, pct: 0, min: 0 });
  }
  const sites = [];
  for (const row of rows) {
    let hours = 0, extra = 0;
    const own = new Set();
    res.owner.forEach((p, i) => {
      if (p < 0 || !slots[i].site || siteKey(slots[i].site) !== row.key) return;
      const h = paidMinutes(o, slots[i]) / 60;
      hours += (slots[i].end - slots[i].start) / 60; extra += burden * h * (ctx.rates.at[p][i] - staff[p].wage);
      if (staff[p].siteWages && staff[p].siteWages.has(row.key)) own.add(staff[p].name);
    });
    const { key, ...out } = row;
    sites.push({ ...out, hours, extra, ...(own.size ? { ownRates: [...own].sort() } : {}) });
  }
  return { sites, extra: res.people.reduce((t, p) => t + (p.siteWageCost || 0), 0) };
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
  if (travelClash(ctx, base, slotIndex)) return "would have no time to travel from their shift at another site";
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

// One CSV cell. A name or label that starts with = + - @ (or a tab or CR) would run as a formula when the file is
// opened in a spreadsheet, so it gets a leading apostrophe; parseRosterCsv strips that again on the way back in.
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const unDefuse = (t) => (/^'[=+\-@\t\r]/.test(t) ? t.slice(1) : t);

export function rosterCsv(r) {
  const q = csvCell;
  // A "site" column is added only when some shift names a site, so one-shop files stay byte-identical.
  const sited = r.assignments.some((a) => a.slot.site);
  const rows = ["day,start,end,hours,label,assigned_to,role" + (sited ? ",site" : "")];
  for (const a of r.assignments) {
    const s = a.slot;
    rows.push([DAYS[s.day] + (s.endMin > 1440 ? " (overnight)" : ""), fmtClock(s.startMin), fmtClock(s.endMin), ((s.end - s.start) / 60).toFixed(2), q(s.label || ""), q(a.person || "UNFILLED"), q(s.role || ""), ...(sited ? [q(s.site || "")] : [])].join(","));
  }
  return rows.join("\n") + "\n";
}

// iCalendar file for one week, so each person can import their own shifts. weekStart is "YYYY-MM-DD" and
// must be a Monday; person limits the file to one name (default: everyone, with the name in the title).
export function rosterIcs(r, weekStart, person = null, { stable = false, bare = false } = {}) {
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
  const lines = bare ? [] : ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shift-roster-builder//EN", "CALSCALE:GREGORIAN"];
  r.assignments.forEach((a, k) => {
    if (!a.person || (person && a.person !== person)) return;
    const s = a.slot;
    const title = (s.label || "Shift") + (s.role ? ` (${s.role})` : "") + (person ? "" : ` - ${a.person}`);
    // A subscribed calendar matches events by UID: tie it to the shift, not its position in the list, so an edited week updates in place.
    const uid = stable ? `${weekStart}-${a.person.replace(/[^A-Za-z0-9]+/g, "_")}-${s.day}-${s.startMin}-${s.endMin}-${(s.label || "").replace(/[^A-Za-z0-9]+/g, "_")}` : `${weekStart}-${k}`;
    lines.push("BEGIN:VEVENT", `UID:roster-${uid}@shift-roster-builder`, `DTSTAMP:${stamp(0, 0)}Z`,
      `DTSTART:${stamp(s.startMin, s.day)}`, `DTEND:${stamp(s.endMin, s.day)}`, `SUMMARY:${esc(title)}`, "END:VEVENT");
  });
  if (!bare) lines.push("END:VCALENDAR");
  return lines.length ? lines.join("\r\n") + "\r\n" : "";
}

// A calendar-subscription feed for one person across several published weeks ([{weekStart, assignments}]), so a phone
// that subscribes once keeps showing past weeks and picks up each re-publish. Refresh hints are advisory; apps choose.
export function rosterFeedIcs(weeks, person, { name = "My shifts" } = {}) {
  const esc = (t) => String(t).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const body = weeks.filter((w) => w && w.weekStart).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => rosterIcs({ assignments: w.assignments }, w.weekStart, person, { stable: true, bare: true })).join("");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shift-roster-builder//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"].join("\r\n") + "\r\n" + body + "END:VCALENDAR\r\n";
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
    const who = unDefuse((c[5] || "").trim());
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
    const person = unDefuse((c[5] || "").trim());
    if (!person || person === "UNFILLED") continue;
    const day = dayIndex((c[0] || "").replace(/\s*\(overnight\)/i, "").trim());
    const start = parseTime(c[1]);
    let end = parseTime(c[2]);
    if (day < 0 || Number.isNaN(start) || Number.isNaN(end)) continue;
    if (end <= start) end += 1440;
    const site = unDefuse((c[7] || "").trim());
    out.push({ person, day, start: day * 1440 + start, end: day * 1440 + end, label: unDefuse((c[4] || "").trim()), ...(site ? { site } : {}) });
  }
  return out;
}

// Reissuing a posted week part-way through (2026-11-12): shifts that started before `changedAt` (minutes from Monday 00:00)
// already happened, so a rebuild must not move them. Each such shift is pinned (`fixed`) to whoever held it in the posted
// roster CSV, matched on day, start and end, one copy per row; a started shift that was open stays open (pinned to
// STARTED_OPEN, a name no one has). Later shifts are untouched. Returns { slots, pinned, open }.
export const STARTED_OPEN = "(started, open)";
export function pinStarted(slots, postedCsv, changedAt) {
  const rows = parseRosterCsv(postedCsv);
  const used = new Set();
  let pinned = 0, open = 0;
  const out = slots.map((s) => {
    if (!(s.start < changedAt)) return s;
    // With sites, a posted row pins only a shift at its own site (a row with no site, from an older file, pins any).
    const k = rows.findIndex((r, j) => !used.has(j) && r.start === s.start && r.end === s.end && (!r.site || siteKey(r.site) === siteKey(s.site)));
    if (k >= 0) { used.add(k); pinned++; return { ...s, fixed: rows[k].person }; }
    open++;
    return { ...s, fixed: STARTED_OPEN };
  });
  return { slots: out, pinned, open };
}

// What changed between the roster you posted and the one you are working from now, one entry per change:
// "added" (a shift someone did not have), "cancelled" (a posted shift they no longer have), "moved" (same person,
// same day, different hours; the hours gained or lost are reported). Notice is the hours between `changedAt`
// (minutes from Monday 00:00 of that week) and the earliest start the change touches. A change is "short notice" when
// that is under `noticeHours`, and then owes `premiumHours` of the person's wage unless their name is in `exempt`
// (swaps and changes the employee asked for). Whether a rule applies, its window and its premium are the operator's
// to enter: this is arithmetic on their numbers, not a statement of what any ordinance requires.
// Two more ways to price a short-notice change (2026-11-04): `cancelHours` prices a cancelled shift at that many hours
// of pay instead of `premiumHours` (some rules charge a cancellation at a fraction, e.g. 0.5), and `flat` charges a fixed
// dollar amount per short-notice change whatever the wage (some ordinances name a dollar figure per change; a number, or
// {added, moved, cancelled} for different amounts). With `flat` set no wage is needed.
export function scheduleChanges(postedCsv, revisedCsv, { changedAt = null, noticeHours = 336, premiumHours = 1, cancelHours = null, flat = null, wages = {}, exempt = [] } = {}) {
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
    const flatAmt = flat === null || flat === undefined ? null : typeof flat === "object" ? (Number.isFinite(Number(flat[ch.kind])) ? Number(flat[ch.kind]) : null) : Number(flat);
    const hrs = ch.kind === "cancelled" && cancelHours !== null && cancelHours !== undefined ? cancelHours : premiumHours;
    const due = ch.shortNotice && !ch.exempt;
    ch.premium = !due ? 0 : flatAmt !== null && flatAmt >= 0 ? Math.round(flatAmt * 100) / 100 : wage > 0 ? Math.round(hrs * wage * 100) / 100 : 0;
    ch.premiumUnpriced = due && !(flatAmt !== null && flatAmt >= 0) && !(wage > 0);
    owed += ch.premium;
  }
  changes.sort((x, y) => x.touchesFrom - y.touchesFrom || x.person.localeCompare(y.person));
  return { changes, owed: Math.round(owed * 100) / 100, shortNotice: changes.filter((c) => c.shortNotice && !c.exempt).length, noticeKnown: known };
}

// Short turnarounds in a roster CSV: every pair of one person's consecutive shifts with less than `restHours` between
// the end of one and the start of the next (a "clopen" when the first closes and the second opens). Each short
// turnaround owes `premiumHours` of the person's wage unless the person is in `exempt` (they asked for it). Within one
// week only unless `previousCsv` (last week's roster) is given, which adds the Sunday-to-Monday turnaround. Whether a rule applies, its rest
// window and its premium are the operator's to enter: arithmetic on their numbers, not a statement of any law.
export function restPremium(rosterCsv, { restHours = 11, premiumHours = 1, wages = {}, exempt = [], previousCsv = null } = {}) {
  // previousCsv (last week's roster) is shifted back seven days so Sunday night to Monday morning is seen.
  const before = previousCsv ? parseRosterCsv(previousCsv).map((x) => ({ ...x, start: x.start - 10080, end: x.end - 10080, day: x.day - 7, prevWeek: true })) : [];
  const rows = [...before, ...parseRosterCsv(rosterCsv)];
  const skip = new Set((exempt || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean));
  const wageOf = new Map(Object.entries(wages || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? "").trim() === "" ? NaN : Number(v)]));
  const found = [];
  let owed = 0;
  for (const who of [...new Set(rows.map((x) => x.person))]) {
    const mine = rows.filter((x) => x.person === who).sort((a, b) => a.start - b.start);
    for (let i = 1; i < mine.length; i++) {
      const gap = (mine[i].start - mine[i - 1].end) / 60;
      if (gap >= restHours) continue;
      if (mine[i].prevWeek) continue; // both shifts last week: that week's own business
      const wage = wageOf.get(who.toLowerCase());
      const isExempt = skip.has(who.toLowerCase());
      const premium = !isExempt && wage > 0 ? Math.round(premiumHours * wage * 100) / 100 : 0;
      owed += premium;
      found.push({ person: who, first: mine[i - 1], second: mine[i], restHours: Math.round(gap * 100) / 100, exempt: isExempt, premium, premiumUnpriced: !isExempt && !(wage > 0) });
    }
  }
  found.sort((x, y) => x.second.start - y.second.start || x.person.localeCompare(y.person));
  return { turnarounds: found, owed: Math.round(owed * 100) / 100, count: found.filter((f) => !f.exempt).length };
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
// `onWeek(done, of)` is called after each week is built (the page's worker posts it as progress); it changes nothing.
// The shifts each person worked in a roster, as a `keep` map for the next week's build.
export function keepFrom(roster) {
  const keep = {};
  for (const a of (roster && roster.assignments) || []) {
    if (!a.person) continue;
    (keep[a.person.toLowerCase()] ||= []).push(slotKey(a.slot));
  }
  // Sorted names and keys, so two rosters with the same people on the same shifts (copies swapped) give the same map, and the
  // planner's reuse check sees the same week.
  return Object.fromEntries(Object.keys(keep).sort().map((k) => [k, keep[k].sort()]));
}

// The same map from a roster CSV (last week's, as the page and --last-week read it). The CSV carries no role, so its keys
// match a shift at that day and time whatever its role ("*").
export function keepFromCsv(csv) {
  const keep = {};
  for (const r of parseRosterCsv(csv)) {
    const base = r.day * 1440;
    (keep[r.person.toLowerCase()] ||= []).push(slotKey({ day: r.day, startMin: r.start - base, endMin: r.end - base, role: "*", site: r.site }));
  }
  return keep;
}

export function planWeeks(staffText, shiftsText, options = {}) {
  const plan = planWeeksOnce(staffText, shiftsText, options);
  // The fallback: when a week's look-ahead found no roster that leaves the next week at its relaxation, the shortfall can come
  // from a choice two or more weeks back, which a one-week look cannot reach (eval/plan-lookahead.mjs: 1 of 122 plans, 2 open
  // hours). Then the whole plan is also built in the old order and the one with fewer open hours is returned (the new one on a
  // tie), so a plan never leaves more hours open than the old order did. Measured: 2 of 342 looked-ahead weeks set it off.
  if (!plan.ok || !plan.lookahead || !plan.weeks.some((w) => w.tiePick && w.tiePick.nextOpenHours > w.tiePick.relaxedNextOpenHours + 1e-9)) return plan;
  const old = planWeeksOnce(staffText, shiftsText, { ...options, onWeek: null, deferCover: false });
  if (old.ok && old.totalOpenHours < plan.totalOpenHours - 1e-9) return { ...old, lookahead: { ...plan.lookahead, fellBack: true, openHoursAhead: plan.totalOpenHours } };
  return { ...plan, lookahead: { ...plan.lookahead, fellBack: false, openHoursOld: old.ok ? old.totalOpenHours : null } };
}

function planWeeksOnce(staffText, shiftsText, { weeks = 4, weekStart = null, onWeek = null, reuse = true, lookahead = true, tieSeeds = null, steadyTies = true, ...given } = {}) {
  const n = Math.max(1, Math.min(8, Math.floor(weeks) || 1));
  // Order and ties (2026-11-13 later, README "The planner picks a week's tie by what it leaves the next"). Each week's last
  // shifts carry into the next week's rest gaps and streaks, so which tied best roster a week posts changes what the next can
  // do. Column generation first (fresh builds' order since 2026-11-13) lands on one tie whatever the seed; on its own it left
  // 2 of 122 four-week plans 2-3 open hours worse than the old order (plateau walk first). So with the new order the planner
  // looks one week ahead: it builds the next week from the posted tie and from a relaxation of it (the same staff with the
  // carried rest gaps and streaks left out, which can only allow more). When the two match, no other tie of this week can
  // leave the next week better, and nothing more is built. When they differ, the week is built again in the old order
  // (`tieSeeds`, default the caller's seed), and among the rosters with this week's open hours the one whose two weeks
  // together leave the fewest open hours, then the least summed score, is posted (`tiePick` on that week). So a roster a few
  // points worse this week is taken when it leaves next week an open shift fewer, never one that opens an hour this week. `deferCover: false` keeps
  // the old order with no look-ahead; `lookahead: false` keeps the new order without it.
  // keepValue > 0 ("keep people on their usual shifts") builds its weeks column generation first too since 2026-11-14 (README
  // "Keep usual shifts, column generation first"), but its usual rota (the anchor below) in the old order. With the anchor
  // column generation first as well, the leave sweep moved 4-20% more shifts week to week: that anchor is a different tie of the
  // usual week, and the weeks with someone off strayed further from it. With the anchor in the old order the sweep's churn, distance
  // from the usual rota, open hours and pay are identical to the old planner's, 1.3-1.8x faster (eval/steady-plan.keep-cg.txt).
  const options = given;
  const look = lookahead !== false && options.deferCover !== false && options.exact !== false && n > 1;
  const sh = parseShifts(shiftsText);
  if (sh.errors.length) return { error: sh.errors[0] };
  let text = String(staffText || "");
  const out = [];
  // A week whose parsed staff match an earlier week's exactly gets that week's roster again instead of a rebuild: the
  // shifts and options are the same, so the search would answer the same week (below its time budgets, the same roster).
  // The carried-over rest gaps and streaks settle after a week or two, so from week 3 on most plans repeat; the rolling
  // `tough:` tally keeps changing, but it only enters the search when the spread setting (toughBalance) is above 0, so
  // at 0 it is left out of the comparison. `sameAs` names the week reused; `reuse: false` rebuilds every week.
  const toughCounts = Number(options.toughBalance) > 0;
  const steady = Number(options.keepValue) > 0;
  // The usual rota: options.keep when the caller has one (the page's "Carry over last week" CSV), otherwise the week built from
  // the staff text with the dated days off left out (no week start, so they are skipped) and the bonus off. One extra build.
  // That build runs in the old order (plateau walk first) unless the caller sets `deferCover`; see the note on keepValue above.
  let anchor = null;
  if (steady) {
    if (options.keep && Object.keys(options.keep).length) anchor = options.keep;
    else {
      const st0 = parseStaff(text);
      if (!st0.errors.length) {
        const base = buildRoster(st0.staff, sh.slots, { ...options, keepValue: 0, keep: null, ...(given.deferCover === undefined ? { deferCover: false } : {}) });
        if (!base.error) anchor = keepFrom(base);
      }
    }
  }
  // keepValue > 0 ("keep people on their usual shifts"): every week is built with the usual rota as `keep`, so a dated day off
  // moves the shifts it has to, the rest stay where people usually have them, and the week after goes back to the usual.
  // Anchoring on the week before instead (measured 2026-11-12, café sample, Ana and Ben off in week 3) carried week 3's
  // reshuffle into week 4: 16 changes over the plan against 30 with no bonus, but 5 of them were week 4 not going back.
  const keep = anchor;
  const weekOpts = keep ? { ...options, keep } : options;
  // Builds are kept by (staff, order); `posted` maps staff to the week that first posted that roster (for `sameAs`).
  const cache = new Map(), posted = new Map();
  let builds = 0, looks = 0, picks = 0, steadied = 0;
  const weekFrom = (txt, k, order = null) => {
    const st = parseStaff(txt, { weekStart: addWeeks(weekStart, k) });
    if (st.errors.length) return { error: st.errors[0] };
    const key = JSON.stringify([toughCounts ? st.staff : st.staff.map((p) => ({ ...p, toughBefore: 0 })), keep]);
    const ck = key + "|" + (order ?? "");
    let roster = reuse ? cache.get(ck) : null;
    if (!roster) {
      roster = buildRoster(st.staff, sh.slots, order === null ? weekOpts : { ...weekOpts, deferCover: false, ...(order === "walk" ? {} : { seed: order }) });
      builds++;
      if (roster.error) return { error: roster.error };
      if (reuse) cache.set(ck, roster);
    }
    return { key, roster };
  };
  const nextText = (txt, csv) => {
    const worked = lastShiftEnds(csv);
    const cleaned = txt.split(/\r?\n/).map((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return raw;
      const cells = splitLine(line);
      if (worked.has((cells[0] || "").toLowerCase())) return raw;
      const kept = cells.filter((x) => !PREV_CELL.test(x) && !STREAK_CELL.test(x));
      return kept.length === cells.length ? raw : kept.join(line.includes("\t") ? "\t" : ", ");
    }).join("\n");
    return carryOverStaff(cleaned, csv).text;
  };
  const noCarry = (txt) => txt.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return raw;
    const cells = splitLine(line);
    const kept = cells.filter((x) => !PREV_CELL.test(x) && !STREAK_CELL.test(x));
    return kept.length === cells.length ? raw : kept.join(line.includes("\t") ? "\t" : ", ");
  }).join("\n");
  const better = (a, b) => a.unfilledHours < b.unfilledHours - 1e-9 || (Math.abs(a.unfilledHours - b.unfilledHours) < 1e-9 && a.score < b.score - 1e-6);
  const shape = (r) => JSON.stringify(keepFrom(r));
  for (let k = 0; k < n; k++) {
    const ws = addWeeks(weekStart, k);
    let cur = weekFrom(text, k);
    if (cur.error) return { error: cur.error };
    const was = reuse ? posted.get(cur.key) : null;
    let tiePick = null, kept = null;
    if (!was) {
      // Candidates in order of preference; the first is posted unless the look-ahead finds a later one leaves next week better.
      const cands = [{ c: cur, order: "default" }];
      // Steady ties: column generation lands on one tie per week, but a carried-over rest gap can move it to another tie of the
      // same score, so a plan with nothing changing reshuffled people week to week (the sample café cycled through three tied
      // rosters). When an earlier week's roster is still allowed this week and scores the same, the week is built again with a
      // small per-shift bonus for that roster's shifts (keepShift 0.01, starting from it), and that build is posted if its score
      // without the bonus ties. Not with keepValue > 0, whose usual rota already anchors every week.
      // Earlier weeks are tried newest first, so after a week with someone off the plan can go back to the rota before it. Only
      // weeks with no dated day off are copied: copying one carried its reshuffle into later weeks (the leave sweep's distance
      // from the usual rota rose 6-44% before this was added).
      if (look && steadyTies !== false && !steady && k > 0 && !out.some((w) => shape(w.roster) === shape(cur.roster)) && out.some((w) => !w.leave)) {
        const st = parseStaff(text, { weekStart: ws });
        const curSc = rosterScoreUnder(st.staff, sh.slots, weekOpts, cur.roster);
        const tried = new Set();
        for (let j = k - 1; j >= 0 && curSc.valid; j--) {
          if (out[j].leave) continue;
          const last = out[j].roster;
          if (tried.has(shape(last))) continue;
          tried.add(shape(last));
          const lastSc = rosterScoreUnder(st.staff, sh.slots, weekOpts, last);
          // A roster this week's rules no longer allow whole (someone off, a carried rest gap) is still built toward, once, for the
          // newest leave-free week only: the bonus keeps as much of it as a tie allows.
          if (lastSc.valid ? lastSc.score > curSc.score + 1e-6 : tried.size > 1) continue;
          const r = buildRoster(st.staff, sh.slots, { ...weekOpts, keep: keepFrom(last), keepShift: 0.01, keepValue: 0 });
          builds++;
          const sc = r.error ? null : rosterScoreUnder(st.staff, sh.slots, weekOpts, r);
          if (sc && sc.valid && sc.score <= curSc.score + 1e-6) {
            cands.unshift({ c: { key: cur.key, roster: { ...r, score: cur.roster.score + (sc.score - curSc.score), steadyBonus: r.score } }, order: "earlier week's" });
            kept = shape(r) === shape(last) ? `same as week ${j + 1}` : `closer to week ${j + 1}`;
            steadied++;
            break;
          }
        }
      }
      if (look && k < n - 1) {
        const nextOf = (c) => weekFrom(nextText(text, rosterCsv(c.roster)), k + 1);
        const nx = nextOf(cands[0].c);
        if (nx.error) return { error: nx.error };
        const relaxed = weekFrom(noCarry(nextText(text, rosterCsv(cands[0].c.roster))), k + 1);
        if (relaxed.error) return { error: relaxed.error };
        looks++;
        if (better(relaxed.roster, nx.roster)) {
          const seen = new Set([shape(cands[0].c.roster)]);
          // Two weeks together: open hours first (this week's are equal by construction), then the two weeks' scores summed.
          const pair = (c, nr) => ({ unfilledHours: c.roster.unfilledHours + nr.unfilledHours, score: c.roster.score + nr.score });
          let best = { ...cands[0], next: nx.roster };
          const seeds = tieSeeds && tieSeeds.length ? tieSeeds : ["walk"];
          const more = [...cands.slice(1), ...seeds.map((sd) => ({ sd }))];
          for (const m of more) {
            let c = m.c, order = m.order;
            if (!c) {
              c = weekFrom(text, k, m.sd);
              if (c.error) return { error: c.error };
              order = m.sd === "walk" ? "walk" : `walk, seed ${m.sd}`;
              if (Math.abs(c.roster.unfilledHours - cur.roster.unfilledHours) > 1e-9) continue;
            }
            if (seen.has(shape(c.roster))) continue;
            seen.add(shape(c.roster));
            const an = nextOf(c);
            if (an.error) return { error: an.error };
            if (better(pair(c, an.roster), pair(best.c, best.next))) best = { c, order, next: an.roster };
          }
          tiePick = { order: best.order, nextOpenHours: best.next.unfilledHours, defaultNextOpenHours: nx.roster.unfilledHours, relaxedNextOpenHours: relaxed.roster.unfilledHours, tried: seen.size };
          if (best.c !== cands[0].c) { picks++; if (best.order !== "earlier week's") kept = null; }
          cur = best.c;
        } else cur = cands[0].c;
      } else cur = cands[0].c;
    }
    const roster = was ? { ...was.roster } : { ...cur.roster };
    if (!was && reuse) posted.set(cur.key, { week: k + 1, roster: cur.roster });
    const csv = rosterCsv(roster);
    const bare = noCarry(text);
    const leave = !!weekStart && JSON.stringify(parseStaff(bare, { weekStart: ws }).staff) !== JSON.stringify(parseStaff(bare).staff);
    out.push({ week: k + 1, weekStart: ws, roster, csv, ...(was ? { sameAs: was.week } : {}), ...(tiePick ? { tiePick } : {}), ...(kept ? { steadied: kept } : {}), ...(leave ? { leave: true } : {}) });
    if (typeof onWeek === "function") onWeek(k + 1, n);
    if (k < n - 1) text = nextText(text, csv);
  }
  return { ok: true, weeks: out, totalCost: out.reduce((t, w) => t + w.roster.cost, 0), totalOpenHours: out.reduce((t, w) => t + w.roster.unfilledHours, 0), lookahead: look ? { builds, looks, picks, steadied } : null };
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
  // "$2,400 $3,100" is two days of sales, not four: a whitespace- or semicolon-separated
  // "2,400" is one number; commas separate only ungrouped numbers ("400,0,100").
  const sales = [];
  for (const raw of String(salesText).split(/[\s;]+/)) {
    const tok = raw.replace(/^,+|,+$/g, "");
    if (!tok) continue;
    if (/^\$?\d{1,3}(,\d{3})+(\.\d+)?$/.test(tok)) { sales.push(Number(tok.replace(/[$,]/g, ""))); continue; }
    for (const part of tok.split(",")) sales.push(part === "" ? NaN : Number(part.replace(/[$]/g, "")));
  }
  const days = DAYS.map((d, i) => ({ day: d, hours: 0, cost: 0, sales: sales[i] > 0 ? sales[i] : null, pct: null }));
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const h = (a.slot.endMin - a.slot.startMin) / 60;
    days[a.slot.day].hours += h;
    days[a.slot.day].cost += h * (a.rate ?? (wage.get(a.person) || 0)) * burden;
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

// Every assigned shift longer than `maxHours` (a double, or a stretch some rules call for extra pay or a break on).
// A heads-up only; the search does not enforce it. A shift of exactly `maxHours` is not listed.
export function longShifts(r, maxHours = 10) {
  const out = [];
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    const { day, startMin, endMin } = a.slot;
    const hours = ((endMin <= startMin ? endMin + 1440 : endMin) - startMin) / 60;
    if (hours > maxHours) out.push({ person: a.person, day: DAYS[day % 7], startMin, endMin, hours });
  }
  return out;
}

// Each person's longest run of consecutive days off in the Monday-to-Sunday week, and who has no run of `minRun` days
// (a "two days off in a row" wish, or a rule some workplaces set). A day counts as worked on the day a shift starts, so
// a closing shift past midnight does not take the next day. A person with no shift has all seven days off. The week is
// not wrapped, so Sun plus the next Mon is not counted. A heads-up only; the search does not enforce it.
export function daysOffRuns(r, minRun = 2) {
  const worked = new Map((r.people || []).map((p) => [p.name, new Set()]));
  for (const a of r.assignments || []) {
    if (!a.person) continue;
    if (!worked.has(a.person)) worked.set(a.person, new Set());
    worked.get(a.person).add(a.slot.day % 7);
  }
  const rows = [...worked].map(([person, days]) => {
    let best = 0, cur = 0;
    for (let d = 0; d < 7; d++) { cur = days.has(d) ? 0 : cur + 1; if (cur > best) best = cur; }
    return { person, daysWorked: days.size, longestOff: best, short: best < minRun };
  }).sort((a, b) => a.person.localeCompare(b.person));
  return { rows, short: rows.filter((x) => x.short) };
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
  for (const p of r.people) rows.push([csvCell(p.name), p.shifts, p.hours.toFixed(2), p.otHours.toFixed(2), p.cost.toFixed(2), p.minHours, p.short.toFixed(2)].join(","));
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
export const _internals = { buildContext, scoreOwner, ownerValid, validList, openHoursFloor, earlyOpenFloor, cliqueOpenFloor, keptStart, BIG, memoKey };
// Test hook: the fast and the original hard-rule check, so a test can hold them to the same answers.
export const _validListPair = { validList, validListSlow, validWith, insertSorted, buildContext };

// One pasted line into cells. A line with a tab is a spreadsheet paste: split on tabs only, so
// "1,200" stays one number. Otherwise read it as CSV: a cell that starts with a double quote keeps
// its commas (a spreadsheet's CSV export writes "$1,200") and "" inside it is a literal quote; a
// quote later in a cell (17" rims) is text. Before 2026-11-11 a quoted "1,200" split in two and
// shifted every later field (portfolio/quality, defect class input-handling).
export function splitCells(line) {
  const unq = (c) => { c = c.trim(); return /^".*"$/s.test(c) ? c.slice(1, -1).replace(/""/g, '"') : c; };
  if (line.includes("\t")) return line.split("\t").map(unq);
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') { cur += '"'; i++; }
      else q = false;
    } else if (ch === '"' && cur.trim() === "") { cur = ""; q = true; }
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Call-out exposure (2026-11-13). A roster is proven at the least open hours for the week as given, but several rosters
// often tie at the best score (on four of the five templates six seeds gave five or six different rosters, same score and
// payroll, eval/steady-for-callouts.out.txt), and they do not hold up equally when someone calls out. For every person-day
// worked from `fromDay` on, `calloutExposure` plays that one call-out the way the product handles it: the person is off
// that day, it is announced `noticeMin` minutes before the day starts (default 5pm the evening before), every shift that has
// started by then is pinned (pinStarted), and the week is rebuilt with the roster kept (keepShift 1). `added` is the open
// hours that leaves beyond the roster's own. The sum over the cases is the exposure; times a per-person-day call-out rate
// it is the expected open hours one week of independent call-outs adds, to first order. One rebuild per case.
// Two short cuts (2026-11-13 later), so the check is quick enough for the page:
//  - outright cover: when the person has one shift that day and coverOptions finds someone who can take it with every
//    hard rule holding and everyone else keeping their shifts, that roster leaves exactly the roster's own open hours,
//    so a rebuild that covers the most hours first adds 0. The case is scored 0 without the rebuild (`outright: true`).
//    Failing that, a hand-over chain (coverChain, up to `chainMoves` shifts changing hands, people outside the chain
//    keeping theirs; shifts already started are pinned, so no chain moves them) proves the same. `moves` says which.
//    Measured against rebuilding every case: README "A quicker call-out check".
//  - `stopAt`: stop as soon as the sum reaches it and return `stopped: true` with the sum so far, a lower bound. Used by
//    steadyRoster, which only needs to know a roster cannot beat the best one found.
// `onCase(done, of)` is called after each case.
export function calloutExposure(staff, slots, roster, options = {}, { fromDay = 1, noticeMin = 420, outright = true, chainMoves = 3, stopAt = Infinity, onCase = null, hint = null } = {}) {
  if (!roster || !roster.assignments) return { error: "Build a roster first." };
  const csv = rosterCsv(roster);
  const keep = keepFromCsv(csv);
  const plan = [];
  for (let d = fromDay; d < 7; d++) {
    const working = [...new Set(roster.assignments.filter((a) => a.person && a.slot.day === d).map((a) => a.person))].sort();
    for (const name of working) plan.push({ d, name });
  }
  // With `hint` (person|day -> open hours that call-out added on another roster), the likeliest costly cases go first, so
  // a roster that cannot win reaches `stopAt` early. Order changes nothing else: every case is still played unless stopped.
  if (hint) plan.sort((x, y) => (hint.get(y.name + "|" + y.d) ?? 0) - (hint.get(x.name + "|" + x.d) ?? 0));
  const cases = [];
  let sum = 0, rebuilt = 0;
  const pins = new Map();
  for (const { d, name } of plan) {
    if (!pins.has(d)) pins.set(d, pinStarted(slots, csv, d * 1440 - noticeMin).slots);
    const pinned = pins.get(d);
    const p = staff.findIndex((q) => q.name === name);
    const st = staff.map((q) => (q.name === name ? { ...q, days: q.days.map((w, k) => (k === d ? [] : w)) } : q));
    const mine = roster.owner ? pinned.map((s, i) => i).filter((i) => roster.owner[i] === p && pinned[i].day === d) : [];
    if (outright && mine.length === 1) {
      const c = coverOptions(st, pinned, roster, mine[0], options);
      const ch = !c.error && !c.fits.length && chainMoves > 1 ? coverChain(st, pinned, roster, mine[0], options, { maxMoves: chainMoves, limit: 1 }) : null;
      const moves = !c.error && c.fits.length ? 1 : ch && !ch.error && ch.chains.length ? ch.chains[0].moves : 0;
      if (moves) {
        cases.push({ person: name, day: d, openAfter: roster.unfilledHours, added: 0, outright: true, moves });
        if (onCase) onCase(cases.length, plan.length);
        continue;
      }
    }
    // deferCover: column generation before the plateau walk (as on big weeks). Only open hours are read from the rebuild, and on
    // 570 call-outs (five teams x six seeds) they came out the same as the default order's in every case, 71 s -> 31 s in all:
    // the walk ran its twelve full runs on rebuilds the column generation proves at once (README "Call-out rebuilds, column
    // generation first"; eval/callout-rebuild-order.mjs). The roster it lands on can differ at the same score; none is posted.
    const r = buildRoster(st, pinned, { ...options, keep, keepShift: 1, deferCover: options.deferCover ?? true });
    if (r.error) return { error: r.error };
    rebuilt++;
    const added = Math.max(0, r.unfilledHours - roster.unfilledHours);
    cases.push({ person: name, day: d, openAfter: r.unfilledHours, added });
    sum += added;
    if (onCase) onCase(cases.length, plan.length);
    if (sum >= stopAt && cases.length < plan.length) return { cases, exposure: sum, personDays: plan.length, rebuilt, stopped: true };
  }
  return { cases, exposure: sum, personDays: plan.length, rebuilt };
}

// Two rosters are the same schedule when they give everyone the same shifts. rosterCsv lists the shift copies in the order
// the search placed them, so two identical copies of one shift (two 3pm-9pm closes) held by Ruth and Sam in one build and
// by Sam and Ruth in another print as different files. The key sorts the rows (2026-11-13: before it, most "ties" at a
// reissue, and some at a fresh post, were one roster counted several times; README "How many rosters really tie?").
export function rosterKey(r) {
  return rosterCsv(r).trimEnd().split("\n").slice(1).sort().join("\n");
}

// Among the rosters that tie at the best score over `seeds` (the search's seed is the only thing varied, so every candidate
// has the same score, the managers' own settings untouched), post the one with the least call-out exposure. Costs nothing
// in the score by construction; costs one calloutExposure per distinct tied roster in time. The first seed's roster wins
// ties, so a week with one best roster is unchanged. `steady` on the result says what was compared.
export function steadyRoster(staff, slots, options = {}, { seeds = [1, 2, 3, 4, 5, 6], fromDay = 1, noticeMin = 420, prune = true, outright = true, onProgress = null } = {}) {
  const base = options.seed ?? 1;
  // The candidates. A fresh build runs column generation first (2026-11-13, README "Fresh builds, column generation first"),
  // and that lands on the same tied roster whatever the seed (the sample café: one roster for seeds 1-12), so varying the seed
  // alone would leave nothing to choose between. So the first candidate is the roster a plain build posts (`order` "default"),
  // and the seeds are built in the old order (plateau walk first, `deferCover: false`, `order` "walk"), whose seeds land on
  // different ties. A caller who sets `deferCover` gets every seed in that order. With the exact check off the two orders are
  // the same build, so the seeds are built once.
  const split = options.deferCover === undefined && options.exact !== false;
  const plan = split ? [{ seed: base, order: "default", opts: options }, ...[...new Set([base, ...seeds])].map((seed) => ({ seed, order: "walk", opts: { ...options, deferCover: false } }))]
    : [...new Set([base, ...seeds])].map((seed) => ({ seed, order: "default", opts: options }));
  const built = [];
  for (const { seed, order, opts } of plan) {
    built.push({ seed, order, i: built.length, r: buildRoster(staff, slots, { ...opts, seed }) });
    if (onProgress) onProgress({ stage: "build", done: built.length, of: plan.length });
    if (built[0].r.error) return built[0].r;
  }
  const best = Math.min(...built.map((b) => b.r.score));
  const seen = new Map();
  for (const b of built) {
    if (b.r.error || b.r.score > best + 1e-6) continue;
    const k = rosterKey(b.r);
    if (!seen.has(k)) seen.set(k, b);
  }
  // With `prune`, a later roster stops being checked once its sum reaches the best so far: it cannot win (ties go to
  // the earlier candidate), and its exposure is reported as at least that sum (`stopped`). `prune: false` scores every tie.
  const ties = [...seen.values()];
  const cands = [], hint = new Map();
  let bestX = Infinity;
  for (const [i, b] of ties.entries()) {
    const x = calloutExposure(staff, slots, b.r, options, { fromDay, noticeMin, outright, stopAt: prune ? bestX : Infinity, hint: prune ? hint : null,
      onCase: onProgress ? (done, of) => onProgress({ stage: "callouts", roster: i + 1, rosters: ties.length, done, of }) : null });
    if (x.error) return { ...built[0].r, steady: { error: x.error } };
    cands.push({ ...b, x });
    for (const c of x.cases) hint.set(c.person + "|" + c.day, Math.max(hint.get(c.person + "|" + c.day) ?? 0, c.added));
    if (!x.stopped) bestX = Math.min(bestX, x.exposure);
  }
  cands.sort((a, b) => (!!a.x.stopped - !!b.x.stopped) || a.x.exposure - b.x.exposure || a.i - b.i);
  const pick = cands[0];
  // The first candidate is the plain build's roster; a tie identical to it was dropped above, so it stands for both.
  const first = cands.find((c) => c.i === 0);
  return { ...pick.r, steady: { chosenSeed: pick.seed, chosenOrder: pick.order, chosen: pick.i, exposure: pick.x.exposure, firstSeedExposure: first && !first.x.stopped ? first.x.exposure : null, personDays: pick.x.personDays,
    tied: cands.map((c) => ({ seed: c.seed, order: c.order, i: c.i, exposure: c.x.exposure, ...(c.x.stopped ? { atLeast: true } : {}) })), rebuilt: cands.reduce((t, c) => t + c.x.rebuilt, 0),
    worst: pick.x.cases.filter((c) => c.added > 0) } };
}

// The priced call-out slack in words (CLI --cover-price and the page).
export function coverSlackText(cs, staff = null) {
  if (!cs) return "";
  const risky = (c) => `${staff ? staff[c.person].name : "someone"} on ${DAYS[c.day]}`;
  const left = cs.riskHours > 0
    ? `${num(cs.riskHours)} h on ${cs.riskyDays} of ${cs.personDays} person-days are still at risk${cs.cases && staff ? ` (${cs.cases.slice(0, 5).map(risky).join(", ")}${cs.cases.length > 5 ? ` and ${cs.cases.length - 5} more` : ""})` : ""}.`
    : "No single call-out leaves a shift nobody else can take.";
  if (!cs.moves) return `Call-out slack: priced at ${money2(cs.price)} an hour at risk, no hand-over or swap paid for itself, so the best-scoring roster stands. ${left}`;
  // Moves that free a stand-in (a relief, a two-shift trade, a relay) are named, since they change shifts of people who
  // are not themselves at risk.
  const two = [cs.relieves ? `${cs.relieves} freed a stand-in by moving one of their shifts` : "", cs.trades ? `${cs.trades} swapped two shifts between others so a stand-in had room` : "", cs.pairMoves ? `${cs.pairMoves} moved a shift and one of the stand-in's together` : ""].filter(Boolean);
  const how = two.length ? ` (${two.join("; ")})` : "";
  // A move can also lower the score: on a week the search did not prove, a trade between two people may find pay the search
  // left (seeded 40-person week 2, eval/cover-pairs.out.txt). Say so rather than print a negative cost.
  const give = cs.scoreAfter - cs.scoreBefore;
  const paid = give < -0.005 ? `and saved ${money2(-give)} of score (pay plus penalties) the search had left` : `at ${money2(give)} of score (pay plus penalties)`;
  const head = two.length ? `${cs.moves} move${cs.moves === 1 ? "" : "s"} cut` : `${cs.moves} shift${cs.moves === 1 ? "" : "s"} changed hands to cut`;
  return `Call-out slack: ${head} the hours at risk from ${num(cs.riskHoursBefore)} to ${num(cs.riskHours)}${how}, ${paid} at your price of ${money2(cs.price)} an hour at risk. ${left}`;
}

// The call-out check in words (CLI --steady and the page).
export function steadyText(s) {
  if (!s) return "";
  if (s.error) return `Call-out check: ${s.error}`;
  const rest = s.tied.filter((t) => (t.i ?? t.seed) !== (s.chosen ?? s.chosenSeed));
  // A tie stopped at the best sum is "at least as many": the check stops there because it can no longer win.
  const others = rest.every((t) => t.atLeast && t.exposure === s.exposure) ? `the other${rest.length > 1 ? "s" : ""} at least as many`
    : `the others ${rest.map((t) => (t.atLeast ? "at least " : "") + num(t.exposure)).join(", ")} h`;
  const head = s.tied.length < 2 ? "Call-out check: only one roster ties at the best score, so there was nothing to choose between."
    : `Call-out check: ${s.tied.length} rosters tie at the best score; this one adds the fewest open hours if someone calls out (${num(s.exposure)} h summed over ${s.personDays} person-days, ${others}).`;
  const worst = s.worst.slice().sort((a, b) => b.added - a.added).slice(0, 5).map((c) => `${c.person} on ${DAYS[c.day]} (+${num(c.added)} h)`);
  return `${head}\n${worst.length ? `Call-outs that would still leave hours open: ${worst.join(", ")}${s.worst.length > 5 ? ` and ${s.worst.length - 5} more` : ""}.` : "No single call-out Tue-Sun leaves an hour open."}`;
}

// Per-site split of a roster built across several shops (2026-11-14). For each site: shifts, hours needed, hours covered,
// hours left open, and payroll; a person's payroll (overtime included) is shared between sites in proportion to their hours
// at each, since overtime is earned on the week, not on one shop. `shared` lists everyone who works at two or more sites,
// with their hours at each. Shifts with no site are grouped under "" (shown as "(no site)"). Returns null when no shift
// names a site, so one-shop rosters show nothing new.
export function siteSplit(r) {
  const asg = (r && r.assignments) || [];
  if (!asg.some((a) => a.slot.site)) return null;
  const name = new Map(), by = new Map(), personSite = new Map(), personEarn = new Map(); // personEarn: hours x rate, wages by site only
  for (const a of asg) {
    const k = siteKey(a.slot.site);
    if (!name.has(k)) name.set(k, a.slot.site || "");
    const row = by.get(k) || { site: name.get(k), shifts: 0, hours: 0, covered: 0, open: 0, openShifts: 0, cost: 0, people: new Set() };
    const h = (a.slot.end - a.slot.start) / 60;
    row.shifts++; row.hours += h;
    if (a.person) {
      row.covered += h; row.people.add(a.person);
      const m = personSite.get(a.person) || new Map();
      m.set(k, (m.get(k) || 0) + h);
      personSite.set(a.person, m);
      if (a.rate !== undefined) { const e = personEarn.get(a.person) || new Map(); e.set(k, (e.get(k) || 0) + h * a.rate); personEarn.set(a.person, e); }
    } else { row.open += h; row.openShifts++; }
    by.set(k, row);
  }
  const costOf = new Map((r.people || []).map((p) => [p.name, p.cost || 0]));
  // With wages by site a person's pay is shared by what their hours earn at each site (hours x that site's rate), not by hours.
  for (const [person, hm] of personSite) {
    const m = personEarn.get(person) || hm;
    const total = [...m.values()].reduce((t, h) => t + h, 0);
    for (const [k, h] of m) by.get(k).cost += total > 0 ? (costOf.get(person) || 0) * (h / total) : 0;
  }
  const sites = [...by.values()].map((x) => ({ ...x, people: x.people.size }))
    .sort((a, b) => (a.site === "") - (b.site === "") || a.site.localeCompare(b.site));
  const shared = [...personSite].filter(([, m]) => m.size > 1)
    .map(([person, m]) => ({ name: person, hours: Object.fromEntries([...m].map(([k, h]) => [name.get(k), h])) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return personEarn.size ? { sites, shared, byEarnings: true } : { sites, shared };
}

// Plain-text form of siteSplit for the CLI and the copyable summary.
export function siteSplitText(split) {
  if (!split) return "";
  const nm = (s) => s || "(no site)";
  const w = Math.max(9, ...split.sites.map((s) => nm(s.site).length));
  const lines = [`By site (one staff list across ${split.sites.length} sites; payroll shared by each person's ${split.byEarnings ? "pay at each site's wage" : "hours at each site"}):`,
    ...split.sites.map((s) => `${nm(s.site).padEnd(w)} ${String(s.shifts).padStart(4)} shifts  ${num(s.covered).padStart(6)} of ${num(s.hours)} h covered${s.open > 0 ? `, ${num(s.open)} h open` : ""}  ${money(s.cost)}  ${s.people} ${s.people === 1 ? "person" : "people"}`)];
  if (split.shared.length) lines.push(`Working at more than one site: ${split.shared.map((p) => `${p.name} (${Object.entries(p.hours).map(([k, h]) => `${nm(k)} ${num(h)} h`).join(", ")})`).join("; ")}.`);
  else lines.push("Nobody works at more than one site this week.");
  return lines.join("\n");
}
