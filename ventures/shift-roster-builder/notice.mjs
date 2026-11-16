// Predictive scheduling ("fair workweek") in the team hub: a dated record of every change to a posted week, and the
// premium each change would owe under the rule set the deployer picks. No Node built-ins, so it runs on the Node
// server and the Cloudflare Worker alike.
//
// Why the hub: the builder's changes report (scheduleChanges in calc.mjs) compares two rosters at one moment the
// manager types. The hub is where the changes really happen, one at a time, days apart: a republished week, an
// approved trade, a claimed open shift, a call-out given to someone else. Each is logged here with the moment it was
// made, who asked for it and what it did to whose hours, which is the record these laws ask an employer to keep.
//
// The rule sets are read from the cities' and state's own pages (2026-11-16): Seattle's Office of Labor Standards
// "Secure Scheduling" page, Oregon BOLI's "Predictive scheduling" page, and the City of Chicago's Fair Workweek
// notice and rules. They are a starting point to check against the current text, not legal advice: which employers
// are covered, the emergency and standby-list exceptions and the right to decline added hours are not modelled.
// FAIR_WORKWEEK=custom with the FWW_* numbers types any other rule set.
//
// Two more pieces (2026-11-16, read from search summaries of Seattle OLS's 2023 Q&A, 2024 model policy and one-pager,
// Oregon's ORS 653.455 and OAR 839-026, and Chicago's 2026 rules as summarised by law firms; the primary pages were
// out of reach from here):
// - The team offer (massOffer): a written offer of a called-out shift to the whole team, which says it is a group
//   offer, that taking it is voluntary and that the employee may decline. Seattle and Oregon exempt the added hours
//   when an employee accepts such an offer after another employee's absence, for that employee's hours only. No
//   matching exception turned up for Chicago, whose FAQ says employer-asked cover after a call-off owes pay, so the
//   Chicago preset still prices it.
// - On-call shifts (a shift whose label says "on-call"): released, or never called in, they are hours taken away.
//   Seattle and Oregon pay half the hours not worked; Chicago's 2026 rules treat them like other cancelled hours
//   (half inside 24 hours, 1 hour of pay before). So the cancellation arithmetic prices them, and one never called in
//   by its end counts as released at its start.
//
// Oregon from the statute's own text (2026-11-16, oregonlegislature.gov/bills_laws/ors/ors653.html, ORS 653.432,
// 653.436 and 653.455 as amended by 2024 c.20, read from this session):
// - 653.455(3)(a): a start or end time changed by 30 minutes or less owes nothing, hours lost included (minEdgeMin).
//   The preset had priced a start moved 20 minutes later as half of the lost 20 minutes.
// - 653.455(2)(a)(A) and (C): the 30-minute threshold is for work added to a shift; an additional shift owes the hour
//   whatever its length. The code had let a separate added shift of 30 minutes or less go free in every preset.
// - 653.432 and 653.455(3)(j): a voluntary standby list. Hours a listed employee agrees to work when asked from the
//   list owe nothing (standby). 653.455(3)(k)(C): where the employer keeps such a list, the exception for cover after
//   an absence holds only once everyone on the list has been contacted, so a team offer made while listed people were
//   not asked is priced (standbyOpen on the log entry).
import { fromLocal } from "./timeclock.mjs";

export const MAX_CHANGES = 1500;

// noticeDays: how far ahead a week must be posted, and the window in which a change owes a premium.
// addHours: hours of pay for an added shift, added time or a moved shift with no lost hours.
// minMoveMin: a move whose start and end each shift by no more than this owes nothing (Chicago: 15 min).
// minExtendMin: time added to a shift of no more than this owes nothing (Oregon: more than 30 min of added work owes).
// minEdgeMin: a start and end each changed by no more than this owes nothing, hours lost included, as long as the
//   time added stays within minExtendMin (Oregon ORS 653.455(3)(a): 30 min).
// standby: 1 where the rule set has a voluntary standby-list exception (Oregon ORS 653.432, 653.455(3)(j)).
// cancelWindowH / cancelFraction: lost hours inside this many hours of the shift are paid at this fraction.
// cancelElseHours: hours of pay for lost hours outside that window but inside the notice window (Chicago: 1).
// restHours / restMult: hours worked less than restHours after the previous shift ended are paid at restMult.
export const FWW_PRESETS = {
  seattle: { label: "Seattle Secure Scheduling", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 0, minEdgeMin: 0, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 10, restMult: 1.5, massOffer: 1, standby: 0 },
  oregon: { label: "Oregon predictive scheduling", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 30, minEdgeMin: 30, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 10, restMult: 1.5, massOffer: 1, standby: 1 },
  chicago: { label: "Chicago Fair Workweek", noticeDays: 14, addHours: 1, minMoveMin: 15, minExtendMin: 15, minEdgeMin: 0, cancelWindowH: 24, cancelFraction: 0.5, cancelElseHours: 1, restHours: 10, restMult: 1.25, massOffer: 0, standby: 0 },
  custom: { label: "Custom rule set", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 0, minEdgeMin: 0, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 10, restMult: 1.5, massOffer: 0, standby: 0 },
};
const ENV_FIELDS = { FWW_NOTICE_DAYS: "noticeDays", FWW_ADD_HOURS: "addHours", FWW_MIN_MOVE_MIN: "minMoveMin", FWW_MIN_EXTEND_MIN: "minExtendMin", FWW_CANCEL_WINDOW_HOURS: "cancelWindowH", FWW_CANCEL_FRACTION: "cancelFraction", FWW_CANCEL_ELSE_HOURS: "cancelElseHours", FWW_REST_HOURS: "restHours", FWW_REST_MULT: "restMult", FWW_MASS_OFFER: "massOffer", FWW_MIN_EDGE_MIN: "minEdgeMin", FWW_STANDBY: "standby" };

// The rule set from the environment, or null when FAIR_WORKWEEK is unset (the change log is still kept).
export function readNoticeEnv(env = {}) {
  const raw = String(env.FAIR_WORKWEEK ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!raw || raw === "0" || raw === "off") return null;
  const name = { or: "oregon", wa: "seattle", "seattle-wa": "seattle", il: "chicago", "chicago-il": "chicago" }[raw] || raw;
  if (!Object.hasOwn(FWW_PRESETS, name)) return { error: `FAIR_WORKWEEK "${String(env.FAIR_WORKWEEK).slice(0, 40)}" is not one of seattle, oregon, chicago or custom.` };
  const r = { name, ...FWW_PRESETS[name], notes: [], overrides: [] };
  for (const [k, f] of Object.entries(ENV_FIELDS)) {
    if (env[k] === undefined || String(env[k]).trim() === "") continue;
    const v = Number(String(env[k]).trim());
    if (!Number.isFinite(v) || v < 0 || (f === "restMult" && v < 1) || ((f === "massOffer" || f === "standby") && v > 1)) { r.notes.push(`${k} "${String(env[k]).slice(0, 20)}" is not a number we can use; the ${name} value ${r[f]} stays.`); continue; }
    r[f] = v; r.overrides.push(`${k}=${v}`);
  }
  return r;
}

const sameSlot = (a, b) => a.day === b.day && a.startMin === b.startMin && a.endMin === b.endMin;
const slotOf = (s) => ({ day: s.day, startMin: s.startMin, endMin: s.endMin, label: s.label || "", role: s.role || "" });

// Each person's shifts before and after, paired: kept shifts drop out, a shift on the same day with other hours is
// "moved", the rest are "cancelled" or "added". `before` and `after` are published assignments ({person, slot}).
export function diffAssignments(before, after) {
  const by = (list) => { const m = new Map(); for (const a of list || []) if (a.person) (m.get(a.person) || m.set(a.person, []).get(a.person)).push(slotOf(a.slot)); return m; };
  const was = by(before), now = by(after), out = [];
  for (const person of [...new Set([...was.keys(), ...now.keys()])].sort()) {
    const a = [...(was.get(person) || [])], b = [...(now.get(person) || [])];
    for (const x of [...a]) { const i = b.findIndex((y) => sameSlot(x, y)); if (i >= 0) { b.splice(i, 1); a.splice(a.indexOf(x), 1); } }
    for (const x of [...a]) {
      const i = b.findIndex((y) => y.day === x.day);
      if (i < 0) continue;
      out.push({ person, kind: "moved", from: x, to: b.splice(i, 1)[0] });
      a.splice(a.indexOf(x), 1);
    }
    for (const x of a) out.push({ person, kind: "cancelled", from: x, to: null });
    for (const y of b) out.push({ person, kind: "added", from: null, to: y });
  }
  return out;
}

// Append changes to the log. `cause` says what made them (republish, trade, claim, cover, call-out); `requested` marks
// the ones the employee asked for, which these laws exempt (the manager can change the mark later).
export function logChanges(state, changes, { at, weekStart, cause, requested = false }) {
  if (!Array.isArray(state.changeLog)) state.changeLog = [];
  for (const c of changes) {
    state.changeSeq = (state.changeSeq || 0) + 1;
    state.changeLog.push({ id: state.changeSeq, at, weekStart: weekStart || null, person: c.person, kind: c.kind, from: c.from, to: c.to, cause, requested: !!(c.requested ?? requested), ...(c.massOffer ? { massOffer: true, coverFor: c.coverFor || "" } : {}), ...(c.standby ? { standby: true, coverFor: c.coverFor || "" } : {}), ...(c.standbyOpen > 0 ? { standbyOpen: c.standbyOpen } : {}), ...(c.onCall ? { onCall: true } : {}) });
  }
  if (state.changeLog.length > MAX_CHANGES) state.changeLog.splice(0, state.changeLog.length - MAX_CHANGES);
  return changes.length;
}

export function markRequested(state, id, requested) {
  const e = (state.changeLog || []).find((x) => x.id === Number(id));
  if (!e) return false;
  e.requested = !!requested;
  return true;
}

const dateOf = (ws, d) => { const t = new Date(ws + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
// The instant a slot's minute falls at (minutes past 24:00 run into the next day).
export function slotInstant(weekStart, day, min, tz) {
  if (!weekStart) return null;
  const extra = Math.floor(min / 1440);
  return fromLocal(dateOf(weekStart, day + extra), min - extra * 1440, tz);
}
const H = 3600000, hrs = (s) => (s.endMin - s.startMin) / 60, r2 = (x) => Math.round(x * 100) / 100;

// One logged change priced under the rule set: notice, lost or gained hours, and the premium (null without a wage).
export function priceChange(e, rules, { tz = "UTC", wage = null } = {}) {
  const out = { ...e, noticeH: null, lostH: 0, gainedH: 0, premium: 0, unpriced: false, why: "" };
  const lost = (e.from ? hrs(e.from) : 0) - (e.to ? hrs(e.to) : 0);
  out.lostH = r2(Math.max(0, lost)); out.gainedH = r2(Math.max(0, -lost));
  if (!e.weekStart) { out.why = "The week had no Monday set, so the notice cannot be counted."; return out; }
  const starts = [e.from, e.to].filter(Boolean).map((s) => slotInstant(e.weekStart, s.day, s.startMin, tz));
  const ends = [e.from, e.to].filter(Boolean).map((s) => slotInstant(e.weekStart, s.day, s.endMin, tz));
  const touches = Math.min(...starts);
  out.noticeH = r2((touches - e.at) / H);
  if (Math.max(...ends) <= e.at) { out.why = "Changed after the shift ended: a record correction, no notice premium counted."; return out; }
  if (!rules) { out.why = "No rule set chosen (FAIR_WORKWEEK)."; return out; }
  if (e.requested) { out.why = "Employee-requested (a call-out, a trade or a pick-up they asked for): exempt. Keep the written request."; return out; }
  if (out.noticeH >= rules.noticeDays * 24) { out.why = `${rules.noticeDays} or more days' notice: nothing owed.`; return out; }
  if (e.standby && rules.standby && lost <= 0) { out.why = `Asked from the voluntary standby list${e.coverFor ? ` to cover ${e.coverFor}` : ""} and agreed: exempt (ORS 653.432(4)). Keep the written agreement to be on the list and the acceptance.`; return out; }
  const standbyFirst = rules.standby && e.standbyOpen > 0;
  if (e.massOffer && rules.massOffer && lost <= 0 && !standbyFirst) { out.why = `Taken from the written offer to the whole team after ${e.coverFor || "a colleague"}'s absence: exempt for those hours. Keep the offer and the acceptance.`; return out; }
  let hoursOfPay = 0;
  const ds = e.from && e.to ? Math.abs(e.to.startMin - e.from.startMin) : 0, de = e.from && e.to ? Math.abs(e.to.endMin - e.from.endMin) : 0;
  if (e.kind === "moved" && rules.minEdgeMin > 0 && ds <= rules.minEdgeMin && de <= rules.minEdgeMin && -lost * 60 <= rules.minExtendMin) { out.why = `Start or end changed by ${Math.max(ds, de)} min: at or under the ${rules.minEdgeMin} min threshold, hours lost included.`; return out; }
  if (lost > 0) {
    if (out.noticeH < rules.cancelWindowH) { hoursOfPay = rules.cancelFraction * lost; out.why = `${e.kind === "cancelled" ? "Cancelled" : "Shortened"} inside ${fmtH(rules.cancelWindowH)}: ${rules.cancelFraction} x ${r2(lost)} h not worked.`; }
    else { hoursOfPay = rules.cancelElseHours; out.why = `${e.kind === "cancelled" ? "Cancelled" : "Shortened"} with under ${rules.noticeDays} days' notice: ${rules.cancelElseHours} h of pay.`; }
  } else if (e.kind === "added") {
    // The threshold is for time added to a shift; an additional shift owes the hour whatever its length.
    hoursOfPay = rules.addHours; out.why = `Shift added with under ${rules.noticeDays} days' notice: ${rules.addHours} h of pay.`;
  } else {
    const extendOnly = e.to.startMin <= e.from.startMin && e.to.endMin >= e.from.endMin;
    if (extendOnly && (ds + de) <= rules.minExtendMin) { out.why = `${ds + de} min added: at or under the ${rules.minExtendMin} min threshold.`; return out; }
    if (!extendOnly && ds <= rules.minMoveMin && de <= rules.minMoveMin) { out.why = `Moved by ${Math.max(ds, de)} min: at or under the ${rules.minMoveMin} min threshold.`; return out; }
    hoursOfPay = rules.addHours; out.why = `${extendOnly ? "Time added" : "Hours moved"} with under ${rules.noticeDays} days' notice: ${rules.addHours} h of pay.`;
  }
  if (e.massOffer && !rules.massOffer && hoursOfPay > 0) out.why += ` This rule set has no team-offer exception.`;
  if (e.massOffer && standbyFirst && hoursOfPay > 0) out.why += ` The team-offer exception needs everyone on the standby list asked first (ORS 653.455(3)(k)(C)); ${e.standbyOpen} on it were not.`;
  if (e.standby && !rules.standby && hoursOfPay > 0) out.why += ` This rule set has no standby-list exception.`;
  if (e.onCall && lost > 0) out.why = `On-call shift not needed: ` + out.why.charAt(0).toLowerCase() + out.why.slice(1);
  if (!(wage > 0)) { out.unpriced = hoursOfPay > 0; out.premium = null; out.hoursOfPay = r2(hoursOfPay); return out; }
  out.hoursOfPay = r2(hoursOfPay); out.premium = r2(hoursOfPay * wage);
  return out;
}
const fmtH = (h) => (h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} h`);

// Shifts of a week that started inside the notice window of its first posting (no premium; the laws ask for the
// posting itself). `postedAt` is the first publish of that week.
export function latePosting(week, postedAt, rules, tz = "UTC") {
  if (!rules || !week || !week.weekStart || !Number.isFinite(postedAt)) return [];
  const out = [];
  for (const a of week.assignments || []) {
    if (!a.person) continue;
    const t = slotInstant(week.weekStart, a.slot.day, a.slot.startMin, tz), n = (t - postedAt) / H;
    if (n < rules.noticeDays * 24) out.push({ person: a.person, slot: a.slot, noticeH: r2(n) });
  }
  return out;
}

// Short rests in a posted week (and from the week before, when it is the previous Monday): hours of the later shift
// that fall inside the rest window, and the extra pay above the regular rate (restMult - 1) on them. These laws pay the
// premium even when the worker agreed to the shift, so nothing here is exempt.
export function shortRests(week, prevWeek, rules, wages = new Map()) {
  if (!rules || !(rules.restHours > 0) || !week) return [];
  const prevOk = prevWeek && week.weekStart && prevWeek.weekStart && Date.parse(week.weekStart) - Date.parse(prevWeek.weekStart) === 7 * 86400000;
  const rows = [];
  for (const [w, off] of [[week, 0], ...(prevOk ? [[prevWeek, -7]] : [])]) for (const a of w.assignments || []) if (a.person) rows.push({ person: a.person, slot: a.slot, s: (a.slot.day + off) * 1440 + a.slot.startMin, e: (a.slot.day + off) * 1440 + a.slot.endMin });
  const out = [];
  for (const who of [...new Set(rows.map((x) => x.person))].sort()) {
    const mine = rows.filter((x) => x.person === who).sort((a, b) => a.s - b.s);
    for (let i = 1; i < mine.length; i++) {
      if (mine[i].s < 0) continue; // both in last week
      const gapH = (mine[i].s - mine[i - 1].e) / 60;
      if (gapH >= rules.restHours) continue;
      const inside = Math.min((mine[i].e - mine[i].s) / 60, rules.restHours - Math.max(0, gapH));
      const wage = wages.get(who);
      out.push({ person: who, first: mine[i - 1].slot, firstLastWeek: mine[i - 1].s < 0, second: mine[i].slot, gapH: r2(Math.max(0, gapH)), insideH: r2(inside), premium: wage > 0 ? r2((rules.restMult - 1) * inside * wage) : null });
    }
  }
  return out;
}

// On-call shifts: a shift whose label says "on-call" (or "on call", "oncall"). Each published one is waiting until the
// manager marks it called in or not needed; one still waiting when it ends was never called in.
export const isOnCall = (slot) => /\bon[- ]?call\b/i.test((slot && slot.label) || "");
export const onCallKey = (weekStart, person, s) => `${weekStart || ""}|${person}|${s.day}|${s.startMin}|${s.endMin}`;
export function onCallShifts(week, marks = {}) {
  if (!week) return [];
  return (week.assignments || []).filter((a) => a.person && isOnCall(a.slot)).map((a) => {
    const key = onCallKey(week.weekStart, a.person, a.slot), m = marks[key];
    return { key, person: a.person, slot: slotOf(a.slot), status: m ? m.status : "waiting", at: m ? m.at : null };
  });
}
// Ended and never marked: priced as released at the start (no notice), under the rule set's cancellation terms.
export function onCallNeverCalled(week, marks, rules, { tz = "UTC", nowMs = Date.now(), wages = new Map() } = {}) {
  if (!week || !week.weekStart) return [];
  return onCallShifts(week, marks).filter((x) => x.status === "waiting" && slotInstant(week.weekStart, x.slot.day, x.slot.endMin, tz) <= nowMs).map((x) => {
    const e = { at: slotInstant(week.weekStart, x.slot.day, x.slot.startMin, tz), weekStart: week.weekStart, person: x.person, kind: "cancelled", from: x.slot, to: null, cause: "on-call never called", requested: false, onCall: true };
    // priceChange counts a change after the shift ended as a record correction, so price it as made at the start.
    return { ...priceChange(e, rules, { tz, wage: wages.get(x.person) }), key: x.key };
  });
}

// Everything the changes page and CSV need. weeks: newest first (current published week, then history).
export function noticeReport(state, rules, { tz = "UTC", wages = new Map(), weeks = [], nowMs = Date.now() } = {}) {
  const priced = [...(state.changeLog || [])].reverse().map((e) => priceChange(e, rules, { tz, wage: wages.get(e.person) }));
  const late = weeks.flatMap((w) => latePosting(w, (state.postedAt || {})[w.weekStart], rules, tz).map((x) => ({ ...x, weekStart: w.weekStart })));
  const rests = weeks[0] ? shortRests(weeks[0], weeks[1], rules, wages) : [];
  const sum = (xs) => r2(xs.reduce((t, x) => t + (x.premium || 0), 0));
  const never = weeks[0] && rules ? onCallNeverCalled(weeks[0], state.onCall || {}, rules, { tz, nowMs, wages }) : [];
  return { priced, late, rests, never, changeTotal: sum(priced), restTotal: sum(rests), onCallTotal: sum(never), unpriced: priced.filter((x) => x.unpriced).length + rests.filter((x) => x.premium === null).length + never.filter((x) => x.unpriced).length };
}

const DAYN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const clk = (m) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
export const slotLabel = (s) => (s ? `${DAYN[s.day]} ${clk(s.startMin)}-${clk(s.endMin)}` : "");
// A leading = + - @ tab or CR is defused, except a plain number: "-1" (notice hours on a change made mid-shift) is
// not a formula, and "'-1" is text a payroll sheet cannot sum.
const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// The written offer of a called-out shift to the whole team. The three things it must say come from Seattle's 2024
// model policy (a group offer, voluntary, the right to decline); the shift is the absent employee's hours only.
export function teamOfferText(c, weekStart = "", dayName = (d) => DAYN[d]) {
  return `Shift offered to the whole team: ${dayName(c.day)} ${clk(c.startMin)}-${clk(c.endMin)}${weekStart ? ` (week of ${weekStart})` : ""}, because ${c.person} cannot work it. This offer goes to everyone at once. Taking it is voluntary and you may decline; no predictability pay is owed for these hours if you accept.`;
}

// The written notice an employer gives each person who joins the voluntary standby list: the four things ORS
// 653.432(1)(a)-(d) list, in order, plus the right not to join (653.432(6)).
export function standbyNoticeText() {
  return [
    "Joining the standby list is voluntary. You can ask to come off it at any time, here on this page or by telling your manager.",
    "When extra hours come up (an unexpected absence or customer need), your manager tells the people on the list on this page and by the team message channel (text, chat or email), and you accept by pressing \"I'll take it\".",
    "You do not have to accept any hours you are offered, and saying no will not count against you.",
    "Hours you agree to work because you are on the standby list do not earn predictability pay for the change to your schedule.",
  ];
}
// The message to the standby list when a shift needs cover.
export function standbyAskText(c, weekStart = "", dayName = (d) => DAYN[d]) {
  return `Standby list: extra hours available ${dayName(c.day)} ${clk(c.startMin)}-${clk(c.endMin)}${weekStart ? ` (week of ${weekStart})` : ""}, because ${c.person} cannot work it. You may decline. If you accept, no predictability pay is owed for these hours.`;
}

export function noticeCsv(rep, rules) {
  const head = "changed_at_utc,week_start,person,change,before,after,cause,employee_requested,notice_hours,hours_lost,hours_gained,hours_of_pay,premium,rule_set,reason";
  const rows = rep.priced.map((p) => [new Date(p.at).toISOString(), p.weekStart || "", p.person, p.kind, slotLabel(p.from), slotLabel(p.to), p.cause, p.requested ? "yes" : "no", p.noticeH ?? "", p.lostH.toFixed(2), p.gainedH.toFixed(2), p.hoursOfPay == null ? "" : p.hoursOfPay.toFixed(2), p.premium == null ? "" : p.premium.toFixed(2), rules ? rules.name : "", p.why].map(cell).join(","));
  const rest = rep.rests.map((x) => ["", "", x.person, "short-rest", `${x.firstLastWeek ? "last week " : ""}${slotLabel(x.first)}`, slotLabel(x.second), "posted week", "", "", "", x.insideH.toFixed(2), "", x.premium == null ? "" : x.premium.toFixed(2), rules ? rules.name : "", `${x.gapH} h between shifts; ${x.insideH} h inside the ${rules.restHours} h rest window at ${rules.restMult}x`].map(cell).join(","));
  const never = (rep.never || []).map((p) => ["", p.weekStart || "", p.person, "on-call-never-called", slotLabel(p.from), "", p.cause, "no", "", p.lostH.toFixed(2), "0.00", p.hoursOfPay == null ? "" : p.hoursOfPay.toFixed(2), p.premium == null ? "" : p.premium.toFixed(2), rules ? rules.name : "", p.why].map(cell).join(","));
  return [head, ...rows, ...rest, ...never].join("\n") + "\n";
}
