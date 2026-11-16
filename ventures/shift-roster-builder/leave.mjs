// Paid sick leave (or any accrued leave) earned from the time clock's worked hours (2026-11-16). No Node built-ins, so it
// runs on the Node server and the Cloudflare Worker alike.
//
// The deployer types the policy: hours earned per hours worked (LEAVE_ACCRUAL="1/30" is one hour per 30 worked), and
// optional caps on what can be earned in a leave year (LEAVE_YEAR_CAP), on the balance at any time (LEAVE_BALANCE_CAP) and
// on what carries into a new leave year (LEAVE_CARRYOVER_CAP), with the leave year's first day (LEAVE_YEAR_START=MM-DD,
// default 01-01). No state's or city's rule is preset: the numbers are the deployer's, and the page says so.
//
// The ledger is walked in time order per person: an opening balance (carried over from another system), each closed worked
// stretch (earning at its clock-out), each use the manager records. A new leave year first cuts the balance to the
// carryover cap and resets the year's earned total; an earning is cut to whatever room the year cap and the balance cap
// leave, so a person sitting at the balance cap earns nothing until they use some (the usual "accrual pauses at the cap").
// The time clock keeps the last MAX_PUNCHES punches; older stretches are folded into `state.leaveBank` before they are
// dropped (timeclock.mjs `trimPunches`), so the balance survives the trim.

import { localParts, zoneOf, fromLocal, workedSpans } from "./timeclock.mjs";

export const MAX_LEAVE_USES = 2000;

// "1/30", "1 per 30", "1:40", "0.0333" -> hours earned per hour worked; null when unset, { error } when unreadable.
export function parseAccrual(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s === "0" || s === "off") return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:\/|per|:|for every|for)\s*(\d+(?:\.\d+)?)$/);
  const rate = m ? Number(m[1]) / Number(m[2]) : Number(s);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) return { error: `LEAVE_ACCRUAL "${v}" is not a rate like 1/30 (one hour per 30 worked).` };
  return { rate, label: m ? `${Number(m[1])} h per ${Number(m[2])} h worked` : `${rate} h per hour worked` };
}

const capOf = (v, name, notes) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  notes.push(`${name} "${v}" is not a number of hours; no cap applied.`);
  return null;
};

// The policy from the environment, or null when leave tracking is off (LEAVE_ACCRUAL unset).
export function readLeaveEnv(env = {}) {
  const a = parseAccrual(env.LEAVE_ACCRUAL);
  if (!a) return null;
  const notes = [];
  if (a.error) return { error: a.error, notes };
  const start = String(env.LEAVE_YEAR_START || "01-01").trim();
  const sm = start.match(/^(\d{1,2})-(\d{1,2})$/);
  let yearStart = "01-01";
  if (sm && Number(sm[1]) >= 1 && Number(sm[1]) <= 12 && Number(sm[2]) >= 1 && Number(sm[2]) <= 31) yearStart = `${sm[1].padStart(2, "0")}-${sm[2].padStart(2, "0")}`;
  else notes.push(`LEAVE_YEAR_START "${start}" is not MM-DD; using 01-01.`);
  const name = String(env.LEAVE_NAME || "Paid sick leave").replace(/[\r\n<>]/g, "").trim().slice(0, 40) || "Paid sick leave";
  return { rate: a.rate, label: a.label, yearCap: capOf(env.LEAVE_YEAR_CAP, "LEAVE_YEAR_CAP", notes), balanceCap: capOf(env.LEAVE_BALANCE_CAP, "LEAVE_BALANCE_CAP", notes), carryCap: capOf(env.LEAVE_CARRYOVER_CAP, "LEAVE_CARRYOVER_CAP", notes), yearStart, name, notes };
}

// The leave year a local date ("2026-03-04") falls in, named by the year it starts in.
export function leaveYear(date, yearStart = "01-01") {
  const y = Number(date.slice(0, 4));
  return date.slice(5) >= yearStart ? y : y - 1;
}

const round2 = (x) => Math.round(x * 100) / 100;

// Every person's balance. `state` carries punches, leaveBank (stretches folded in before the punch trim), leaveUses
// ({ id, person, date, hours, note, at }) and leaveOpening ({ person: { hours, at } }).
export function leaveBalances(state, policy, { tz = "UTC", nowMs = Date.now() } = {}) {
  if (!policy || policy.error) return [];
  const zone = zoneOf(tz), events = new Map();
  const add = (person, e) => { if (!events.has(person)) events.set(person, []); events.get(person).push(e); };
  for (const [person, o] of Object.entries(state.leaveOpening || {})) if (o && Number.isFinite(o.hours)) add(person, { at: o.at, kind: "open", hours: o.hours });
  for (const [person, days] of Object.entries(state.leaveBank || {})) for (const [, b] of Object.entries(days || {})) add(person, { at: b.at, kind: "work", minutes: b.minutes, banked: true });
  for (const sp of workedSpans(state.punches || [], nowMs)) add(sp.person, { at: sp.outAt, kind: "work", minutes: (sp.outAt - sp.inAt) / 60000 });
  for (const u of state.leaveUses || []) add(u.person, { at: u.at, kind: "use", hours: u.hours, date: u.date, id: u.id, note: u.note || "" });
  const thisYear = leaveYear(localParts(nowMs, zone).date, policy.yearStart);
  const out = [];
  for (const [person, list] of events) {
    // Opening first on a tie (it is "as of" that moment), then work, then use.
    const order = { open: 0, work: 1, use: 2 };
    list.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);
    let bal = 0, year = null, earnedYear = 0, usedYear = 0, workedYearMin = 0, lostCap = 0, lostCarry = 0, overdrawn = [];
    for (const e of list) {
      const y = leaveYear(localParts(e.at, zone).date, policy.yearStart);
      if (year !== null && y > year) {
        if (policy.carryCap != null && bal > policy.carryCap) { lostCarry = bal - policy.carryCap; bal = policy.carryCap; } else lostCarry = 0;
        earnedYear = 0; usedYear = 0; workedYearMin = 0; lostCap = 0;
      }
      if (year === null || y > year) year = y;
      if (e.kind === "open") bal = e.hours;
      else if (e.kind === "work") {
        workedYearMin += e.minutes;
        let earn = (e.minutes / 60) * policy.rate;
        let room = Infinity;
        if (policy.yearCap != null) room = Math.min(room, Math.max(0, policy.yearCap - earnedYear));
        if (policy.balanceCap != null) room = Math.min(room, Math.max(0, policy.balanceCap - bal));
        if (earn > room) { lostCap += earn - room; earn = room; }
        bal += earn; earnedYear += earn;
      } else {
        bal -= e.hours; usedYear += e.hours;
        if (bal < -1e-9) overdrawn.push({ date: e.date, hours: e.hours, short: -bal });
      }
    }
    // A person with nothing in the current leave year starts it with what carries over.
    if (year !== null && thisYear > year) {
      if (policy.carryCap != null && bal > policy.carryCap) { lostCarry = bal - policy.carryCap; bal = policy.carryCap; } else lostCarry = 0;
      earnedYear = 0; usedYear = 0; workedYearMin = 0; lostCap = 0; year = thisYear;
    }
    const flags = [];
    if (policy.balanceCap != null && bal >= policy.balanceCap - 1e-9) flags.push(`at the ${policy.balanceCap} h balance cap: earning paused until some is used`);
    else if (policy.yearCap != null && earnedYear >= policy.yearCap - 1e-9) flags.push(`earned this leave year's ${policy.yearCap} h cap`);
    if (lostCarry > 1e-9) flags.push(`${round2(lostCarry)} h over the ${policy.carryCap} h carryover cap dropped at the year's start`);
    for (const o of overdrawn) flags.push(`${o.date}: used ${round2(o.hours)} h with ${round2(o.short)} h more than the balance`);
    out.push({ name: person, year, workedH: round2(workedYearMin / 60), earnedH: round2(earnedYear), usedH: round2(usedYear), balanceH: round2(bal), notEarnedH: round2(lostCap), flags });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// The manager records leave taken: a date and hours (in quarter hours, up to 24 in a day).
export function addLeaveUse(state, { person, date, hours, note = "" }, tz, nowMs) {
  if (!person) return { error: "Pick a person." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return { error: "Give the date as YYYY-MM-DD." };
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || h > 24) return { error: "Hours must be more than 0 and at most 24." };
  state.leaveUses = state.leaveUses || [];
  state.leaveSeq = (state.leaveSeq || 0) + 1;
  // Ordered at noon of that day in the site's zone, so a use on the day of a shift lands after the morning's earning.
  const at = fromLocal(date, 720, tz);
  if (at == null) return { error: "Give the date as YYYY-MM-DD." };
  const u = { id: state.leaveSeq, person, date, hours: Math.round(h * 4) / 4, note: String(note).replace(/[\r\n]+/g, " ").trim().slice(0, 140), at, recordedAt: nowMs };
  state.leaveUses.push(u);
  if (state.leaveUses.length > MAX_LEAVE_USES) state.leaveUses.splice(0, state.leaveUses.length - MAX_LEAVE_USES);
  return { ok: true, use: u };
}

export function removeLeaveUse(state, id) {
  const n = (state.leaveUses || []).length;
  state.leaveUses = (state.leaveUses || []).filter((u) => u.id !== Number(id));
  return state.leaveUses.length < n;
}

// A balance carried over from another system, as of now; earning from punches after now adds to it. An empty value clears it.
export function setLeaveOpening(state, person, hours, nowMs) {
  if (!person) return { error: "Pick a person." };
  state.leaveOpening = state.leaveOpening || {};
  if (hours === "" || hours == null) { const had = Object.hasOwn(state.leaveOpening, person); delete state.leaveOpening[person]; return { ok: true, cleared: had }; }
  const h = Number(hours);
  if (!Number.isFinite(h) || h < 0 || h > 2000) return { error: "An opening balance is 0 to 2000 hours." };
  state.leaveOpening[person] = { hours: Math.round(h * 100) / 100, at: nowMs };
  return { ok: true };
}

const q = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function leaveCsv(rows, policy, state) {
  const out = [["person", "leave_year", "worked_hours", "earned_hours", "used_hours", "balance_hours", "not_earned_over_caps", "checks"].join(",")];
  for (const r of rows) out.push([q(r.name), r.year, r.workedH.toFixed(2), r.earnedH.toFixed(2), r.usedH.toFixed(2), r.balanceH.toFixed(2), r.notEarnedH.toFixed(2), q(r.flags.join("; "))].join(","));
  out.push("");
  out.push(["person", "date_used", "hours", "note"].join(","));
  for (const u of [...(state.leaveUses || [])].sort((a, b) => a.at - b.at)) out.push([q(u.person), u.date, u.hours.toFixed(2), q(u.note || "")].join(","));
  out.push("");
  out.push(q(`policy: ${policy.name}, ${policy.label}; year cap ${policy.yearCap ?? "none"}; balance cap ${policy.balanceCap ?? "none"}; carryover cap ${policy.carryCap ?? "none"}; leave year starts ${policy.yearStart}`));
  return out.join("\n") + "\n";
}
