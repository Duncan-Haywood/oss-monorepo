// Time-off request planner: decide which leave requests can all be approved
// without dropping any role below its minimum cover. Hard rules (per-role
// minimum on duty, optional cap on people off per day, blackout dates) are
// never broken; among the sets of requests that satisfy them an exact
// branch-and-bound search keeps the one with the most weight (priority x
// requests or days). Pure functions, no DOM, no network, no randomness.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ALIASES = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};
const MAX_REQUESTS = 120;
const MAX_STAFF = 300;
const MAX_SPAN = 800; // days between earliest start and latest end
const NODE_LIMIT = 3_000_000;
const SCALE = 10000; // weight units: priority (x days) x SCALE, +500 so ties favour more approvals, minus list position

export const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
export const num = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: d });

// ---- dates -------------------------------------------------------------
// A date is an integer count of days since 1970-01-01 (UTC), so arithmetic is exact.
export function parseDate(tok) {
  const s = String(tok).trim();
  let y, m, d, mt;
  if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { m = +mt[1]; d = +mt[2]; y = +mt[3]; }
  else return null;
  const t = Date.UTC(y, m - 1, d);
  const chk = new Date(t);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== m - 1 || chk.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}
export function fmtDate(n) {
  const dt = new Date(n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
export const weekday = (n) => (((n + 3) % 7) + 7) % 7; // Mon = 0

function dayIndex(tok) {
  const v = ALIASES[String(tok).trim().toLowerCase()];
  return v === undefined ? -1 : v;
}
// "Mon-Fri", "Mon/Tue/Wed", "Tue-Sat", "daily". Returns null when unreadable.
export function parseWorkdays(spec) {
  const s = String(spec).trim().toLowerCase();
  if (s === "" ) return [0, 1, 2, 3, 4];
  if (s === "daily" || s === "all" || s === "every day" || s === "7") return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set();
  for (const part of s.split(/[\/,&+]|\s+and\s+/)) {
    const p = part.trim();
    if (!p) continue;
    const range = p.split(/\s*(?:-|–|—)\s*/);
    if (range.length === 1) {
      const d = dayIndex(range[0]);
      if (d < 0) return null;
      out.add(d);
    } else if (range.length === 2) {
      const a = dayIndex(range[0]), b = dayIndex(range[1]);
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) { out.add(d); if (d === b) break; }
    } else return null;
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

// ---- parsing -----------------------------------------------------------
function splitLine(line) {
  return line.split(/\t|,(?![^()]*\))/).map((c) => c.trim());
}
function isHeader(cells, word) {
  return cells[0] && cells[0].toLowerCase() === word;
}

// "name, role"
export function parsePeople(text) {
  const people = [], errors = [], seen = new Set();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = splitLine(line);
    if (i === 0 && isHeader(c, "name")) return;
    if (c.length < 2 || !c[0] || !c[1]) { errors.push(`People line ${i + 1}: need "name, role".`); return; }
    const key = c[0].toLowerCase();
    if (seen.has(key)) { errors.push(`People line ${i + 1}: "${c[0]}" is listed twice.`); return; }
    seen.add(key);
    people.push({ name: c[0], role: c[1] });
  });
  if (people.length > MAX_STAFF) errors.push(`At most ${MAX_STAFF} people.`);
  return { people, errors };
}

// "name, start, end, priority(optional 1-5, default 3)"
export function parseRequests(text) {
  const requests = [], errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = splitLine(line);
    if (i === 0 && isHeader(c, "name")) return;
    if (c.length < 3) { errors.push(`Request line ${i + 1}: need "name, first day off, last day off".`); return; }
    const start = parseDate(c[1]), end = parseDate(c[2]);
    if (start === null || end === null) { errors.push(`Request line ${i + 1}: dates must look like 2026-07-06 or 7/6/2026.`); return; }
    if (end < start) { errors.push(`Request line ${i + 1}: the last day is before the first day.`); return; }
    let priority = 3;
    if (c[3] !== undefined && c[3] !== "") {
      priority = Number(c[3]);
      if (!Number.isFinite(priority) || priority < 1 || priority > 5) { errors.push(`Request line ${i + 1}: priority is 1 (low) to 5 (high).`); return; }
    }
    requests.push({ name: c[0], start, end, priority, line: i + 1 });
  });
  if (requests.length > MAX_REQUESTS) errors.push(`At most ${MAX_REQUESTS} requests at a time.`);
  return { requests, errors };
}

// "role, minimum people on duty"
export function parseMinimums(text) {
  const mins = {}, errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = splitLine(line);
    const n = Number(c[1]);
    if (c.length < 2 || !c[0] || !Number.isInteger(n) || n < 0) { errors.push(`Minimums line ${i + 1}: need "role, whole number on duty".`); return; }
    mins[c[0].toLowerCase()] = n;
  });
  return { mins, errors };
}

// "2026-12-24 to 2026-12-26" or a single date, one per line or comma separated
export function parseBlackouts(text) {
  const ranges = [], errors = [];
  String(text || "").split(/\r?\n|;/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(/\s+(?:to|-|–|—)\s+|\s*\.\.\s*/);
    const a = parseDate(parts[0]), b = parts.length > 1 ? parseDate(parts[1]) : a;
    if (a === null || b === null || b < a) { errors.push(`Blackout "${line}": use 2026-12-24 to 2026-12-26.`); return; }
    ranges.push([a, b]);
  });
  return { ranges, errors };
}

// ---- solving -----------------------------------------------------------
export function solve(people, requests, options = {}) {
  const warnings = [];
  const workdays = options.workdays || [0, 1, 2, 3, 4];
  const mode = options.mode === "days" ? "days" : "requests";
  const maxOff = Number.isFinite(options.maxOffPerDay) && options.maxOffPerDay >= 0 ? options.maxOffPerDay : Infinity;
  const blackouts = options.blackouts || [];
  const mins = options.minimums || {};
  const byName = new Map(people.map((p) => [p.name.toLowerCase(), p]));
  if (!people.length) return { error: "Add at least one person." };
  if (!requests.length) return { error: "Add at least one time-off request." };

  const roleCount = {};
  for (const p of people) { const k = p.role.toLowerCase(); roleCount[k] = (roleCount[k] || 0) + 1; }
  const roleCap = {};
  for (const k of Object.keys(roleCount)) {
    const need = mins[k] === undefined ? 0 : mins[k];
    roleCap[k] = Math.max(0, roleCount[k] - need);
    if (need > roleCount[k]) warnings.push(`You need ${need} ${k} on duty but have only ${roleCount[k]}: nobody in that role can be off.`);
  }
  for (const k of Object.keys(mins)) if (!(k in roleCount)) warnings.push(`A minimum is set for "${k}" but nobody has that role.`);

  const lo = Math.min(...requests.map((r) => r.start)), hi = Math.max(...requests.map((r) => r.end));
  if (hi - lo + 1 > MAX_SPAN) return { error: `Requests span ${hi - lo + 1} days; keep them within ${MAX_SPAN}.` };
  const span = hi - lo + 1;
  const isBlack = (d) => blackouts.some(([a, b]) => d >= a && d <= b);
  const isWork = (d) => workdays.includes(weekday(d));

  // Prepare each request; unknown names are errors, blackout hits are denied up front.
  const items = [];
  const prelim = []; // decisions that never reach the search
  requests.forEach((r, idx) => {
    const p = byName.get(String(r.name).toLowerCase());
    if (!p) { prelim.push({ ...r, idx, person: null, role: "", days: [], decision: "denied", reason: `"${r.name}" is not in the people list.`, kind: "unknown" }); return; }
    const days = [];
    for (let d = r.start; d <= r.end; d++) if (isWork(d)) days.push(d);
    const item = { ...r, idx, person: p, role: p.role.toLowerCase(), roleLabel: p.role, days };
    if (!days.length) { prelim.push({ ...item, decision: "approved", reason: "Falls entirely on days nobody works, so it never reduces cover.", kind: "free" }); return; }
    const hit = days.find(isBlack);
    if (hit !== undefined) { prelim.push({ ...item, decision: "denied", reason: `${fmtDate(hit)} is a blackout date.`, kind: "blackout" }); return; }
    items.push(item);
  });
  const n = items.length;
  for (const it of items) it.weight = (mode === "days" ? it.days.length : 1) * it.priority * SCALE + 500 - it.idx;

  // Overlapping requests by one person: both would count them off twice.
  const lastByPerson = new Map();
  for (const it of [...items].sort((a, b) => a.start - b.start)) {
    const k = it.name.toLowerCase();
    const prev = lastByPerson.get(k);
    if (prev && it.start <= prev.end) warnings.push(`${it.name} has overlapping requests (lines ${prev.line} and ${it.line}); both would count them off, so only one is likely to be approved.`);
    if (!prev || it.end > prev.end) lastByPerson.set(k, it);
  }

  const roles = Object.keys(roleCount);
  const roleIx = Object.fromEntries(roles.map((k, i) => [k, i]));
  const R = roles.length;
  const capOf = roles.map((k) => roleCap[k]);
  const use = new Int32Array(span * R);
  const total = new Int32Array(span);
  for (const it of items) it.cells = it.days.map((d) => d - lo);

  const fits = (it) => {
    const ri = roleIx[it.role];
    for (const c of it.cells) if (use[c * R + ri] + 1 > capOf[ri] || total[c] + 1 > maxOff) return false;
    return true;
  };
  const apply = (it, s) => {
    const ri = roleIx[it.role];
    for (const c of it.cells) { use[c * R + ri] += s; total[c] += s; }
  };
  // A person who asks twice for the same day only counts once: forbid by treating self-overlap as a fit failure via per-person day sets.
  const personDays = new Map();
  const pdSet = (it) => { const k = it.name.toLowerCase(); if (!personDays.has(k)) personDays.set(k, new Map()); return personDays.get(k); };
  const selfFree = (it) => { const m = pdSet(it); return it.cells.every((c) => !m.get(c)); };
  const selfApply = (it, s) => { const m = pdSet(it); for (const c of it.cells) m.set(c, (m.get(c) || 0) + s); };
  const canTake = (it) => selfFree(it) && fits(it);
  const take = (it) => { apply(it, 1); selfApply(it, 1); };
  const drop = (it) => { apply(it, -1); selfApply(it, -1); };

  // First-come-first-served baseline: listed order, approve if it fits.
  const fcfs = new Set();
  let fcfsWeight = 0;
  for (const it of items) if (canTake(it)) { take(it); fcfs.add(it.idx); fcfsWeight += it.weight; }
  for (const it of [...items].reverse()) if (fcfs.has(it.idx)) drop(it);

  // Exact branch and bound, heaviest first; the baseline is the first incumbent.
  const order = [...items].sort((a, b) => b.weight - a.weight || a.idx - b.idx);
  const suffix = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + order[i].weight;
  let best = fcfsWeight, bestSet = new Set(fcfs), nodes = 0, exact = true;
  const chosen = [];
  const dfs = (i, cur) => {
    if (++nodes > NODE_LIMIT) { exact = false; return; }
    if (cur + suffix[i] <= best) return;
    if (i === n) { best = cur; bestSet = new Set(chosen.map((x) => x.idx)); return; }
    const it = order[i];
    if (canTake(it)) {
      take(it); chosen.push(it);
      dfs(i + 1, cur + it.weight);
      chosen.pop(); drop(it);
      if (!exact) return;
    }
    dfs(i + 1, cur);
  };
  dfs(0, 0);
  if (!exact) warnings.push("The request set is large enough that the exact search was cut off; the plan is the best found, not proven best.");

  // Rebuild usage for the chosen set to explain the rest.
  use.fill(0); total.fill(0); personDays.clear();
  const approvedItems = items.filter((it) => bestSet.has(it.idx));
  for (const it of approvedItems) take(it);
  const approvedOn = (cell, role) => approvedItems.filter((a) => a.role === role && a.cells.includes(cell));

  const decisions = [...prelim];
  for (const it of items) {
    if (bestSet.has(it.idx)) { decisions.push({ ...it, decision: "approved", reason: "", kind: "ok" }); continue; }
    let reason = "", kind = "capacity", blockers = [];
    const ri = roleIx[it.role];
    const own = personDaysConflict(approvedItems, it);
    if (own) { reason = `${it.name} is already off on ${fmtDate(own.d)} in another approved request.`; kind = "self"; }
    else {
      for (const c of it.cells) {
        if (use[c * R + ri] + 1 > capOf[ri]) {
          const who = approvedOn(c, it.role).map((a) => a.name);
          blockers = who;
          reason = capOf[ri] === 0
            ? `${fmtDate(c + lo)}: your minimum leaves no ${it.roleLabel} able to be off (${roleCount[it.role]} on staff, ${mins[it.role]} must be on duty).`
            : `${fmtDate(c + lo)} (${DAYS[weekday(c + lo)]}): ${use[c * R + ri]} of ${roleCount[it.role]} ${it.roleLabel} already off${who.length ? " (" + who.join(", ") + ")" : ""}, and ${mins[it.role] ?? 0} must stay on duty.`;
          break;
        }
        if (total[c] + 1 > maxOff) { blockers = []; reason = `${fmtDate(c + lo)} (${DAYS[weekday(c + lo)]}): ${total[c]} people are already off, which is your limit per day.`; kind = "cap"; break; }
      }
    }
    // Nearest window of the same length (calendar days) that would work with the approved set.
    let alt = null;
    const length = it.end - it.start + 1;
    for (let k = 1; k <= 42 && !alt; k++) {
      for (const shift of [k, -k]) {
        const s = it.start + shift, e = s + length - 1;
        const cand = [];
        for (let d = s; d <= e; d++) if (isWork(d)) cand.push(d);
        if (cand.some(isBlack)) continue;
        if (cand.some((d) => d - lo < 0 || d - lo >= span)) {
          // outside the tracked span means nobody else is off there
          const inside = cand.filter((d) => d - lo >= 0 && d - lo < span);
          if (inside.some((d) => use[(d - lo) * R + ri] + 1 > capOf[ri] || total[d - lo] + 1 > maxOff)) continue;
          if (capOf[ri] === 0 || maxOff === 0) continue;
          alt = { start: s, end: e, shift }; break;
        }
        if (capOf[ri] === 0 || maxOff === 0) continue;
        if (cand.every((d) => use[(d - lo) * R + ri] + 1 <= capOf[ri] && total[d - lo] + 1 <= maxOff)) {
          const clash = approvedItems.find((a) => a.name.toLowerCase() === it.name.toLowerCase() && a.days.some((d) => cand.includes(d)));
          if (clash) continue;
          alt = { start: s, end: e, shift }; break;
        }
      }
    }
    decisions.push({ ...it, decision: "denied", reason, kind, blockers, alt });
  }
  decisions.sort((a, b) => a.idx - b.idx);

  // Day-by-day cover for every day someone is approved off.
  const calendar = [];
  for (let c = 0; c < span; c++) {
    if (!total[c]) continue;
    const d = c + lo;
    const off = approvedItems.filter((a) => a.cells.includes(c));
    const perRole = roles.filter((k) => use[c * R + roleIx[k]] > 0).map((k) => {
      const offN = use[c * R + roleIx[k]];
      return { role: people.find((p) => p.role.toLowerCase() === k).role, off: offN, onDuty: roleCount[k] - offN, min: mins[k] ?? 0, tight: roleCount[k] - offN <= (mins[k] ?? 0) && (mins[k] ?? 0) > 0 };
    });
    calendar.push({ date: d, label: `${fmtDate(d)} ${DAYS[weekday(d)]}`, names: off.map((a) => a.name), perRole, offTotal: total[c] });
  }

  const approved = decisions.filter((d) => d.decision === "approved");
  const denied = decisions.filter((d) => d.decision === "denied");
  const wd = (list) => list.reduce((s, d) => s + d.days.length, 0);
  const fcfsDays = items.filter((it) => fcfs.has(it.idx)).reduce((s, it) => s + it.days.length, 0);
  const planDays = approvedItems.reduce((s, it) => s + it.days.length, 0);
  const score = (list) => list.reduce((s, it) => s + (mode === "days" ? it.days.length : 1) * it.priority, 0);
  return {
    decisions, approved, denied, calendar, warnings, exact, nodes, mode,
    counts: { requests: requests.length, approved: approved.length, denied: denied.length, approvedDays: wd(approved), deniedDays: wd(denied) },
    fcfs: { approved: fcfs.size + prelim.filter((p) => p.kind === "free").length, days: fcfsDays, score: score(items.filter((it) => fcfs.has(it.idx))) },
    plan: { approved: approvedItems.length + prelim.filter((p) => p.kind === "free").length, days: planDays, score: score(approvedItems) },
    roleCap: Object.fromEntries(roles.map((k) => [k, { staff: roleCount[k], min: mins[k] ?? 0, canBeOff: roleCap[k] }])),
    options: { workdays, mode, maxOff, blackouts },
  };
}

function personDaysConflict(approvedItems, it) {
  for (const a of approvedItems) {
    if (a.name.toLowerCase() !== it.name.toLowerCase()) continue;
    const d = it.days.find((x) => a.days.includes(x));
    if (d !== undefined) return { d };
  }
  return null;
}

// ---- output ------------------------------------------------------------
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function decisionsCsv(r) {
  const head = ["name", "role", "first_day", "last_day", "workdays_off", "priority", "decision", "reason", "suggested_dates"];
  const rows = r.decisions.map((d) => [d.name, d.roleLabel || "", fmtDate(d.start), fmtDate(d.end), d.days.length, d.priority, d.decision, d.reason, d.alt ? `${fmtDate(d.alt.start)} to ${fmtDate(d.alt.end)}` : ""]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
export function calendarCsv(r) {
  const head = ["date", "people_off", "names", "cover_by_role"];
  const rows = r.calendar.map((c) => [c.label, c.offTotal, c.names.join("; "), c.perRole.map((p) => `${p.role}: ${p.onDuty} on duty (min ${p.min})`).join("; ")]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function samplePeople() {
  return ["Ana, Barista", "Ben, Barista", "Cleo, Barista", "Dev, Barista", "Eli, Cook", "Fay, Cook", "Gus, Cook", "Hana, Cashier", "Ivo, Cashier"].join("\n");
}
export function sampleRequests() {
  return [
    "Ana, 2026-07-06, 2026-07-17, 2",
    "Ben, 2026-07-13, 2026-07-24, 2",
    "Cleo, 2026-07-13, 2026-07-17, 4",
    "Dev, 2026-07-15, 2026-07-22, 4",
    "Eli, 2026-07-06, 2026-07-10, 3",
    "Fay, 2026-07-08, 2026-07-14, 5",
    "Gus, 2026-07-13, 2026-07-17, 2",
    "Hana, 2026-07-20, 2026-07-24, 3",
    "Ivo, 2026-07-20, 2026-07-31, 3",
    "Ben, 2026-07-27, 2026-07-31, 1",
    "Cleo, 2026-07-27, 2026-08-07, 3",
  ].join("\n");
}
export function sampleMinimums() { return "Barista, 2\nCook, 2\nCashier, 1"; }

export const _internals = { NODE_LIMIT, SCALE };
