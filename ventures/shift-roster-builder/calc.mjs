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
const parseRoles = (cell) => cell.replace(ROLE_CELL, "").split(/[|/&+]/).map((r) => r.trim().toLowerCase()).filter(Boolean);

// "prev: Sun 10pm" = when this person's last shift LAST week ended, so the rest rule also holds across the week boundary.
// Stored as minutes relative to this week's Monday 00:00 (negative). A time after 24:00 ("Sun 1am" is read as Sun 01:00).
const PREV_CELL = /^prev(ious)?\s*:/i;
function parsePrevEnd(cell) {
  const m = cell.replace(PREV_CELL, "").trim().match(/^(\S+)\s+(.+)$/);
  if (!m) return null;
  const d = dayIndex(m[1]), t = parseTime(m[2]);
  if (d < 0 || Number.isNaN(t)) return null;
  return (d - 7) * 1440 + t;
}

// One person per line: name, hourly wage, max hours per week, min hours per week, availability, [roles: a|b]
export function parseStaff(text) {
  const staff = [], errors = [];
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
    const av = parseAvailability(tail.filter((x) => !ROLE_CELL.test(x) && !PREV_CELL.test(x)).join(","));
    av.errors.forEach((e) => errors.push(`${where} (${c[0]}): ${e}`));
    staff.push({ name: c[0], wage, maxHours: maxH, minHours: Math.min(minH, maxH), roles, days: av.days, anyTime: av.any, prevEnd });
  });
  if (!staff.length && !errors.length) errors.push("Add at least one person.");
  if (staff.length > MAX_STAFF) errors.push(`That is ${staff.length} people; this tool handles up to ${MAX_STAFF}.`);
  return { staff, errors };
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
    const label = ROLE_CELL.test(c[4] || "") ? "" : (c[4] || "");
    const roleCell = c.slice(4).find((x) => ROLE_CELL.test(x));
    const role = roleCell ? parseRoles(roleCell)[0] || "" : (c[5] || "").trim().toLowerCase();
    for (const d of days) for (let k = 0; k < count; k++) {
      const end = b <= a ? b + 1440 : b; // an end at or before the start runs overnight
      slots.push({ day: d, startMin: a, endMin: end, start: d * 1440 + a, end: d * 1440 + end, label, role, copy: k + 1, of: count });
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
  burdenPct: 0, otAfter: 40, otMult: 1.5, minRestHours: 10, maxConsecDays: 6,
  balance: 25, shortfallValue: 8, seed: 1, restarts: 4, iterations: 0,
};

function qualified(person, slot) {
  return !slot.role || (person.roles || []).includes(slot.role);
}

function available(person, slot) {
  if (!qualified(person, slot)) return false;
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
  const carry = staff.map((p) => (o.carry && o.carry[p.name.toLowerCase()]) || null);
  return { o, staff, slots, P, S, elig, target, avgWage, totalHours, carry, restMin: Math.max(0, o.minRestHours) * 60 };
}

// Last week's tail, so the rest and days-in-a-row rules hold across the week boundary.
// One line per person: "name, <day> <time> [, days in a row]", e.g. "Ana, Sun 11pm, 5" = last week's final shift
// ended Sunday 11pm and she had worked 5 days in a row up to and including Sunday (blank = 1).
// Returns { carry: { lowercased name: { end, streak } }, errors }; `end` is minutes before this Monday 00:00 (negative).
export function parseCarry(text, staff = []) {
  const carry = {}, errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = splitLine(line);
    const where = `Last-week line ${i + 1}`;
    const name = (c[0] || "").trim();
    const person = staff.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (staff.length && !person) { errors.push(`${where}: "${name}" is not in the staff list`); return; }
    const m = /^\s*([A-Za-z]+)\s+(.+)$/.exec(c[1] || "");
    const d = m ? dayIndex(m[1]) : -1, t = m ? parseTime(m[2]) : NaN;
    if (d < 0 || Number.isNaN(t)) { errors.push(`${where} (${name}): write the last shift's end like "Sun 11pm"`); return; }
    const streak = (c[2] || "") === "" ? 1 : Number(c[2]);
    if (!Number.isInteger(streak) || streak < 0 || streak > 30) { errors.push(`${where} (${name}): days in a row must be a whole number`); return; }
    const end = (d - 7) * 1440 + t;
    if (end > 0) { errors.push(`${where} (${name}): a shift that ends after this Monday starts belongs in this week`); return; }
    carry[(person ? person.name : name).toLowerCase()] = { end, streak: d === 6 ? streak : 0 };
  });
  return { carry, errors };
}

function validList(ctx, p, list) {
  const { slots, staff, restMin, o } = ctx;
  let minutes = 0, maxEnd = staff[p].prevEnd ?? -Infinity;
  const days = new Set();
  const cf = ctx.carry && ctx.carry[p];
  if (cf) {
    maxEnd = cf.end;
    for (let k = 1; k <= cf.streak; k++) days.add(-k);
  }
  for (const i of list) {
    const s = slots[i];
    if (s.start < maxEnd + restMin) return false;
    if (s.end > maxEnd) maxEnd = s.end;
    minutes += s.end - s.start;
    days.add(s.day);
  }
  if (minutes > staff[p].maxHours * 60 + 1e-9) return false;
  const sorted = [...days].sort((a, b) => a - b);
  let run = 0, prev = -9;
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
function payroll(ctx, p, h) {
  const { o, staff } = ctx;
  const reg = Math.min(h, o.otAfter), ot = Math.max(0, h - o.otAfter);
  return staff[p].wage * (1 + o.burdenPct / 100) * (reg + ot * o.otMult);
}
function softPenalty(ctx, p, h) {
  const { o, staff, target, avgWage } = ctx;
  const short = Math.max(0, staff[p].minHours - h) * o.shortfallValue;
  const fair = (o.balance / 100) * avgWage * 0.1 * (h - target[p]) ** 2;
  return short + fair;
}
function personScore(ctx, p, list) {
  const h = hoursOf(ctx, list);
  return payroll(ctx, p, h) + softPenalty(ctx, p, h);
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

function search(ctx, restarts, iterations) {
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const res = anneal(ctx, ctx.o.seed + r * 7919, iterations, r === 0 ? 0 : ctx.avgWage * 0.6);
    const re = scoreOwner(ctx, res.owner); // recompute exactly: the running total drifts by float error
    if (!best || re.total < best.score - 1e-9) best = { owner: res.owner, score: re.total };
  }
  return best;
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
    const ot = Math.max(0, h - ctx.o.otAfter);
    const c = payroll(ctx, k, h);
    cost += c; otHours += ot; hours += h;
    return {
      name: p.name, shifts: lists[k].length, hours: h, otHours: ot, cost: c, wage: p.wage,
      minHours: p.minHours, maxHours: p.maxHours, short: Math.max(0, p.minHours - h),
      daysWorked: new Set(lists[k].map((i) => slots[i].day)).size, slotIds: lists[k],
    };
  });
  const unfilledHours = unfilled.reduce((t, i) => t + (slots[i].end - slots[i].start) / 60, 0);
  return { owner: owner.slice(), people, cost, otHours, hours, unfilled, unfilledHours, lists };
}

function restClash(ctx, p, base, slot) {
  const cf = ctx.carry[p];
  if (cf && slot.start < cf.end + ctx.restMin) return true;
  return base.some((k) => slot.start < ctx.slots[k].end + ctx.restMin && ctx.slots[k].start < slot.end + ctx.restMin);
}

function whyUnfilled(ctx, owner, i) {
  const slot = ctx.slots[i];
  const lists = Array.from({ length: ctx.P }, () => []);
  owner.forEach((p, k) => { if (p >= 0) lists[p].push(k); });
  const why = { free: 0, hours: 0, rest: 0, days: 0, overlap: 0 };
  for (let p = 0; p < ctx.P; p++) {
    if (!ctx.elig[p][i]) continue;
    why.free++;
    const base = lists[p].slice().sort((a, b) => ctx.slots[a].start - ctx.slots[b].start);
    const nl = insertSorted(ctx, base, i);
    if (validList(ctx, p, nl)) continue; // not blocked in this snapshot (a swap elsewhere is possible but costs coverage)
    const mins = nl.reduce((t, k) => t + ctx.slots[k].end - ctx.slots[k].start, 0);
    if (mins > ctx.staff[p].maxHours * 60 + 1e-9) { why.hours++; continue; }
    if (base.some((k) => ctx.slots[k].start < slot.end && slot.start < ctx.slots[k].end)) { why.overlap++; continue; }
<<<<<<< HEAD
    const gapBad = restClash(ctx, p, base, slot);
=======
    const gapBad = slot.start < (ctx.staff[p].prevEnd ?? -Infinity) + ctx.restMin
      || base.some((k) => slot.start < ctx.slots[k].end + ctx.restMin && ctx.slots[k].start < slot.end + ctx.restMin);
>>>>>>> origin/main
    if (gapBad) why.rest++; else why.days++;
  }
  let text;
  const skilled = slot.role ? ctx.staff.filter((p) => qualified(p, slot)).length : ctx.P;
  if (slot.role && skilled === 0) text = `nobody listed has the role "${slot.role}"`;
  else if (why.free === 0) text = slot.role ? `nobody with the role "${slot.role}" is available for this whole shift` : "nobody listed is available for this whole shift";
  else {
    const bits = [];
    if (why.overlap) bits.push(`${why.overlap} already on another shift`);
    if (why.rest) bits.push(`${why.rest} would break the rest rule`);
    if (why.hours) bits.push(`${why.hours} at their weekly hour limit`);
    if (why.days) bits.push(`${why.days} at the consecutive-days limit`);
    text = `${why.free} ${slot.role ? `with the role "${slot.role}" ` : ""}${why.free === 1 ? "person is" : "people are"} free then, but ${bits.join(", ") || "the others are needed elsewhere"}`;
  }
  return { ...why, text };
}

export function buildRoster(staff, slots, options = {}) {
  const ctx = buildContext(staff, slots, options);
  if (!ctx.P) return { error: "Add at least one person." };
  if (!ctx.S) return { error: "Add at least one shift to cover." };
  const o = ctx.o;
  const iterations = o.iterations > 0 ? o.iterations : Math.max(9000, ctx.S * 70);
  const best = search(ctx, o.restarts, iterations);
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
    if (covered > 1e-9) hireTest = { wage, maxHours, coveredHours: covered, stillUnfilledHours: hres.unfilledHours, extraCost: hres.cost - res.cost };
  }

  const warnings = [];
  staff.forEach((p, k) => {
    if (!ctx.elig[k].some(Boolean)) warnings.push(`${p.name} is not available for any of the shifts, so they get no hours.`);
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
    savingVsListed, score: best.score, owner: res.owner,
    filledAll: res.unfilled.length === 0,
  };
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
  const dollars = (p, list) => payroll(ctx, p, hoursOf(ctx, list));
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
      fits.push({ name: staff[p].name, extraCost: delta, hoursAfter: h, overtimeAfter: Math.max(0, h - ctx.o.otAfter) });
      continue;
    }
    let reason;
    const mins = nl.reduce((t, k) => t + slots[k].end - slots[k].start, 0);
    if (base.some((k) => slots[k].start < slot.end && slot.start < slots[k].end)) reason = "already on a shift at that time";
    else if (mins > staff[p].maxHours * 60 + 1e-9) reason = "would go over their weekly hour limit";
<<<<<<< HEAD
    else if (restClash(ctx, p, base, slot)) reason = "would break the rest rule";
=======
    else if (slot.start < (staff[p].prevEnd ?? -Infinity) + ctx.restMin
      || base.some((k) => slot.start < slots[k].end + ctx.restMin && slots[k].start < slot.end + ctx.restMin)) reason = "would break the rest rule";
>>>>>>> origin/main
    else reason = "would break the days-in-a-row limit";
    blocked.push({ name: staff[p].name, reason });
  }
  fits.sort((a, b) => a.extraCost - b.extraCost || a.name.localeCompare(b.name));
  return { slot, current: current >= 0 ? staff[current].name : null, fits, blocked };
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

export function hoursCsv(r) {
  const rows = ["person,shifts,hours,overtime_hours,estimated_payroll,minimum_hours,hours_under_minimum"];
  for (const p of r.people) rows.push([p.name.includes(",") ? `"${p.name}"` : p.name, p.shifts, p.hours.toFixed(2), p.otHours.toFixed(2), p.cost.toFixed(2), p.minHours, p.short.toFixed(2)].join(","));
  return rows.join("\n") + "\n";
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

export const _internals = { buildContext, scoreOwner, ownerValid, validList, BIG };
