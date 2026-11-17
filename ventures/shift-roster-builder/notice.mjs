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
//
// Philadelphia and the City of Los Angeles (2026-11-16, later; README "Philadelphia and Los Angeles"): from search
// summaries of the cities' FAQs and regulations and of law-firm alerts, the cities' own sites being out of reach here.
// Philadelphia: 14 days, 1 h for adds and moves, half the lost hours, a start or end moved by 20 min or less free, the
// mass-communication exception for hours opened by a call-out, and 9 h rest after a prior day's shift paid $40 a shift.
// Los Angeles: 14 days, 1 h, more than 15 min of added work owes, half the lost hours, no team-offer exception (the
// city FAQ says pay is owed when the employee volunteers), and time and a half on the whole shift after a rest under 10 h.
//
// New York City (2026-11-16, later; README "New York City fast food"): the fast food half of the city's Fair Workweek
// Law (Admin. Code 20-1201 et seq.). The premium table is section 20-1222(a) as the city's labour policy office set it
// out (CLASP 2018 slides, "Schedule Change Premiums"); the counting rules are DCWP's rules (RCNY 7-601 et seq.) as
// proposed in January 2022 (rules.cityofnewyork.us notice of hearing, 7-607, 7-622, 7-623) with the June 2022 final
// changes as Fisher Phillips summarised them. Unlike the other presets the premium is a flat sum, not hours of pay:
// $10 for an added or moved shift and $20 for hours taken away at 14 to 7 days' notice, $15 / $45 at 7 days to 24 hours,
// $15 / $75 under 24 hours. Notice counts from 12:00 a.m. on the first day of the work schedule, not from the shift
// (7-622(a): a change made on or after the day before that first day is under 24 hours). A start and an end each moved
// by 15 minutes or less owe nothing, not added together (final rule, de minimis). Volunteers, open-shift pick-ups and
// fill-ins owe the premium (7-622(e)(5)-(7)), so no team-offer exception; the absent employee owes nothing (7-622(d)),
// which the hub's call-out already marks as requested. A clopening (under 11 h between shifts on two calendar days,
// or after a shift spanning two days) pays $100 (20-1231, rule 7-601 definition). A shift moved to another day is one
// change (7-622(a) example 3: $10), not a cancellation plus an addition.
//
// San Francisco and Emeryville (2026-11-16, later; README "San Francisco and Emeryville"), the first two read from the
// cities' own documents, fetched from this session:
// - San Francisco, the Formula Retail Employee Rights Ordinances: Ordinance 117-15 (sfbos.org, Police Code 3300G.4,
//   now Labor and Employment Code 42.4) and OLSE's FAQ of 2025-08-08. Schedules posted two weeks ahead, but the
//   premium window is seven days: under 7 days and 24 h or more, 1 h of pay per changed shift; under 24 h, 2 h for a
//   shift of four hours or less and 4 h for a longer one (the 2025 FAQ: "the number of hours added or subtracted").
//   Flat hours per change, not a share of lost hours. On-call shifts are out of that table (3300G.4(c)(2)): one not
//   called in, or released with under 24 h notice, pays 2 h (4 h or less) or 4 h (longer). Exception (e)(4): the
//   employee who covers a colleague's illness, vacation or time off owes nothing when the employer had under seven
//   days' notice of the absence, team offer or not. No rest rule.
// - Emeryville, the Fair Workweek Ordinance (Municipal Code 5-39): the city's official notice and its "Predictability
//   Pay Structure" sheet (emeryville.org). 14 days; under 14 days and 24 h or more, 1 h of pay; under 24 h, hours
//   taken away pay the lesser of the scheduled shift's hours and 4 h, any other change 1 h. Additions and subtractions
//   of 10 minutes or less at a shift's start and end are free. Finding another employee to cover owes pay (no
//   team-offer exception). Hours worked under 11 h after the previous day's shift: time and a half.
//
// Berkeley, the Fair Workweek Ordinance (Berkeley Municipal Code 13.102, operational 2024-01-12; README "Berkeley"),
// read from the city's own documents fetched from this session (berkeleyca.gov): the official notice of January 2024
// and the FAQ revised 2024-08-23. 14 days. Under 14 days and 24 h or more, 1 h of pay for any change (FAQ 12a).
// Under 24 h, an added shift, added hours or a moved shift owe 1 h (12c), and hours cut or a shift cancelled owe
// "4 hours ... or the number of hours reduced ..., whichever is less" (12b): the hours taken away, not the shift's
// length as in Emeryville, so a shift cut 15 minutes early owes 0.25 h (FAQ 14). A shift moved to another date is
// one change ("moves shifts to another date or time": 1 h), not a cancellation plus an addition (pairDates). Starting
// up to 10 minutes early and finishing up to 10 minutes late owes nothing (FAQ 17, extendEach); the FAQ's further
// "up to 30 minutes after the end to finish serving a customer" is an on-the-day stay, not a schedule change, so it
// is not modelled. Swaps and cover the employees arrange are employee-initiated (FAQ 15); hours an employee
// volunteers for are owed pay (the notice: "When employees voluntarily agree to such changes ... employees are owed
// predictability pay"), so no team-offer exception. Rest: hours worked under 11 h after the end of the previous
// shift at time and a half (FAQ 23: close at midnight, open at 8, 3 h at 1.5x). The notice and FAQ say "the previous
// shift", not "the previous day's", so a same-day split shift with a short gap counts too; FWW_REST_ACROSS_DAYS=1
// turns that off if the code's definition of a shift says otherwise.
//
// Evanston, Illinois, the Fair Workweek Ordinance (24-O-23, City Code Title 3 Chapter 34; README "Evanston"), from
// search summaries of the city's Fair Workweek page and of law-firm alerts (Jackson Lewis, Littler, Fox Rothschild,
// Epstein Becker Green), 2026-11-17. The city's site, Municode and the ordinance PDF on CivicWeb were all refused by
// this session's network, so none of the primary text was read. What the summaries agree on: 14 days' notice; under
// 14 days and more than 24 h, 1 h of pay per changed shift; under 24 h, hours cut or a shift cancelled pay "four
// hours or the length of the scheduled shift, whichever is less" (Emeryville's cutShiftCap reading, not Berkeley's
// hours-taken-away one), any other change 1 h; exempt: employee-requested changes, mutually agreed changes and events
// outside the employer's control; agreeing to extra hours does not waive the pay, so no team-offer exception; rest:
// hours starting under 11 h after the previous shift ended, worked with written consent, at time and a half (one
// summary table also lists 1.25x, attached to a 10-hour rule, so 1.5x is the reading most sources give). No de
// minimis grace turned up, so none is applied. Sources disagree on when enforcement began (2023-09-01, 2024-01-01,
// later postponed): check the city's current notice.
//
// Los Angeles County, the Fair Workweek Ordinance (County Code Title 8 Chapter 8.102, in force 2025-07-01 for retail
// employers with 300 or more employees worldwide, in the county's unincorporated areas only; README "Los Angeles
// County"), read from the county's own documents fetched from this session (file.lacounty.gov): the ordinance as sent
// to the Board on 2024-04-09 (supdocs 189905) and the amendment to 8.102.080 adopted 2025-11-18 (supdocs 208681).
// 8.102.060.A: posted 14 days before the work period. 8.102.080.A.1: 1 h of pay for each change to a date, time or
// location that loses no time or adds more than 15 minutes. A.2 as amended: half the regular rate for the time not
// worked when the employer cuts scheduled work time by at least 15 minutes (minCutMin: under 15 owes nothing) or an
// on-call shift is not called in; there is no 24-hour tier, so the half applies across the whole 14 days.
// 8.102.080.B.2: hours an employee accepts because another scheduled employee is absent owe nothing, once the
// employer has said acceptance is voluntary and may be declined and documented the request and the consent. Unlike
// Seattle's, it is not limited to a written offer to the whole team, so a one-to-one cover ask is exempt too
// (coverAccept). 8.102.100: a shift starting under 10 h after the last one needs written consent and pays time and a
// half for each hour of it inside the 10 h, not the whole shift as the City of Los Angeles does. Not modelled: B.3
// (hours accepted from the 72-hour offer to current staff before hiring, 8.102.070), B.6 (hours already paid at
// overtime under Labor Code 510) and coverage.
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
// minCutMin: time taken away of less than this many minutes owes nothing (Los Angeles County 8.102.080.A.2 as amended
//   2025: a cut of "at least 15 minutes" owes).
// coverAccept: 1 where any hours accepted to cover another employee's absence are exempt, a one-to-one ask as much as a
//   team offer (Los Angeles County 8.102.080.B.2), given the voluntariness notice and documented consent.
// cancelElseHours: hours of pay for lost hours outside that window but inside the notice window (Chicago: 1).
// restHours / restMult: hours worked less than restHours after the previous shift ended are paid at restMult.
// restWhole: 1 where restMult applies to the whole later shift, not only its hours inside the rest window (the City
//   of Los Angeles: "time and a half for the Shift following the insufficient rest period").
// restFlat: a flat sum per short rest, owed whatever the wage (Philadelphia: $40 for each such shift worked).
// restAcross: 1 where only a shift on a later day counts (Philadelphia: rest after "the end of a prior day's shift" or a
//   shift that spanned two days), so a same-day split shift is not a short rest.
// flat: tiers of a flat premium per change, used instead of hours of pay: [{ fromH, add, cut }], highest fromH first;
//   a change made at least fromH hours ahead (and under noticeDays) owes `add` when no hours are lost and `cut` when
//   hours are taken away (New York City 20-1222(a)).
// noticeFromWeek: 1 where notice counts from 12:00 a.m. on the week's first day, not from the shift (New York City
//   rule 7-622(a)).
// edgeEach: 1 where the minEdgeMin grace applies to the start and the end separately, whatever the shift's length
//   becomes (New York City's final de minimis rule: 15 minutes before and after each shift).
// tiers: hours of pay per change by notice, used instead of addHours / cancelFraction (San Francisco, Emeryville):
//   [{ fromH, add, cut, overH, over, cutShiftCap }], highest fromH first. A change at least fromH hours ahead (and
//   under noticeDays) owes `add` h when no hours are lost and `cut` h when hours are taken away; `over` h instead when
//   the hours changed exceed overH (San Francisco: 4 h for more than four hours); cutShiftCap pays hours taken away
//   at the lesser of the scheduled shift's hours and this cap (Emeryville: 4); cutLostCap pays them at the lesser of
//   the hours taken away and this cap (Berkeley: 4; a shift moved and shortened owes the greater of that and `add`).
// extendEach: 1 where the minExtendMin grace applies to the start and the end separately (Berkeley: 10 min before
//   and 10 min after), not to their sum.
// pairDates: 1 where a cancellation and an addition logged together for one person are one change of date
//   (Berkeley "moves shifts to another date"; New York City always pairs them, rule 7-622(a)).
// onCallPay: on-call shifts priced on their own table (San Francisco 3300G.4(d)): released with at least windowH
//   hours' notice owes nothing, otherwise `small` h for a shift of overH hours or less and `big` h for a longer one.
// coverAbsenceDays: the employee covering a colleague's absence owes nothing when the absence was reported under this
//   many days before the shift (San Francisco 3300G.4(e)(4): 7).
// postDays: how far ahead the week must be posted, when it differs from the premium window (San Francisco: 14 vs 7).
const SF_TIERS = [{ fromH: 24, add: 1, cut: 1 }, { fromH: -Infinity, add: 2, cut: 2, overH: 4, over: 4 }];
const EMERYVILLE_TIERS = [{ fromH: 24, add: 1, cut: 1 }, { fromH: -Infinity, add: 1, cut: 4, cutShiftCap: 4 }];
const BERKELEY_TIERS = [{ fromH: 24, add: 1, cut: 1 }, { fromH: -Infinity, add: 1, cut: 4, cutLostCap: 4 }];
const NYC_TIERS = [{ fromH: 168, add: 10, cut: 20 }, { fromH: 24, add: 15, cut: 45 }, { fromH: -Infinity, add: 15, cut: 75 }];
export const FWW_PRESETS = {
  seattle: { label: "Seattle Secure Scheduling", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 0, minEdgeMin: 0, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 10, restMult: 1.5, massOffer: 1, standby: 0 },
  oregon: { label: "Oregon predictive scheduling", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 30, minEdgeMin: 30, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 10, restMult: 1.5, massOffer: 1, standby: 1 },
  chicago: { label: "Chicago Fair Workweek", noticeDays: 14, addHours: 1, minMoveMin: 15, minExtendMin: 15, minEdgeMin: 0, cancelWindowH: 24, cancelFraction: 0.5, cancelElseHours: 1, restHours: 10, restMult: 1.25, massOffer: 0, standby: 0 },
  philadelphia: { label: "Philadelphia Fair Workweek", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 20, minEdgeMin: 20, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 9, restMult: 1, restFlat: 40, restAcross: 1, massOffer: 1, standby: 0 },
  "los-angeles": { label: "Los Angeles Fair Work Week (city)", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 15, minEdgeMin: 0, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 10, restMult: 1.5, restWhole: 1, massOffer: 0, standby: 0 },
  "new-york-city": { label: "New York City Fair Workweek (fast food)", noticeDays: 14, addHours: 0, minMoveMin: 15, minExtendMin: 15, minEdgeMin: 15, edgeEach: 1, cancelWindowH: 336, cancelFraction: 0, cancelElseHours: 0, restHours: 11, restMult: 1, restFlat: 100, restAcross: 1, massOffer: 0, standby: 0, noticeFromWeek: 1, flat: NYC_TIERS },
  "san-francisco": { label: "San Francisco Formula Retail Employee Rights", noticeDays: 7, postDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 0, minEdgeMin: 0, cancelWindowH: 168, cancelFraction: 0, cancelElseHours: 1, restHours: 0, restMult: 1, massOffer: 0, standby: 0, tiers: SF_TIERS, onCallPay: { windowH: 24, overH: 4, small: 2, big: 4 }, coverAbsenceDays: 7 },
  emeryville: { label: "Emeryville Fair Workweek", noticeDays: 14, addHours: 1, minMoveMin: 10, minExtendMin: 10, minEdgeMin: 10, edgeEach: 1, cancelWindowH: 336, cancelFraction: 0, cancelElseHours: 1, restHours: 11, restMult: 1.5, restAcross: 1, massOffer: 0, standby: 0, tiers: EMERYVILLE_TIERS },
  berkeley: { label: "Berkeley Fair Workweek", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 10, extendEach: 1, minEdgeMin: 0, cancelWindowH: 336, cancelFraction: 0, cancelElseHours: 1, restHours: 11, restMult: 1.5, massOffer: 0, standby: 0, tiers: BERKELEY_TIERS, pairDates: 1 },
  "los-angeles-county": { label: "Los Angeles County Fair Workweek (unincorporated areas)", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 15, minEdgeMin: 0, minCutMin: 15, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 10, restMult: 1.5, massOffer: 1, coverAccept: 1, standby: 0 },
  evanston: { label: "Evanston Fair Workweek", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 0, minEdgeMin: 0, cancelWindowH: 336, cancelFraction: 0, cancelElseHours: 1, restHours: 11, restMult: 1.5, massOffer: 0, standby: 0, tiers: EMERYVILLE_TIERS },
  custom: { label: "Custom rule set", noticeDays: 14, addHours: 1, minMoveMin: 0, minExtendMin: 0, minEdgeMin: 0, cancelWindowH: 336, cancelFraction: 0.5, cancelElseHours: 0, restHours: 10, restMult: 1.5, massOffer: 0, standby: 0 },
};
const ENV_FIELDS = { FWW_NOTICE_DAYS: "noticeDays", FWW_ADD_HOURS: "addHours", FWW_MIN_MOVE_MIN: "minMoveMin", FWW_MIN_EXTEND_MIN: "minExtendMin", FWW_CANCEL_WINDOW_HOURS: "cancelWindowH", FWW_CANCEL_FRACTION: "cancelFraction", FWW_CANCEL_ELSE_HOURS: "cancelElseHours", FWW_REST_HOURS: "restHours", FWW_REST_MULT: "restMult", FWW_MASS_OFFER: "massOffer", FWW_MIN_EDGE_MIN: "minEdgeMin", FWW_STANDBY: "standby", FWW_REST_FLAT: "restFlat", FWW_REST_WHOLE_SHIFT: "restWhole", FWW_REST_ACROSS_DAYS: "restAcross", FWW_NOTICE_FROM_WEEK: "noticeFromWeek", FWW_EDGE_EACH: "edgeEach", FWW_EXTEND_EACH: "extendEach", FWW_PAIR_DATES: "pairDates", FWW_MIN_CUT_MIN: "minCutMin", FWW_COVER_ACCEPT: "coverAccept" };
const FLAGS = new Set(["massOffer", "standby", "restWhole", "restAcross", "noticeFromWeek", "edgeEach", "extendEach", "pairDates", "coverAccept"]);
export const PRESET_NAMES = "seattle, oregon, chicago, philadelphia, los-angeles, los-angeles-county, new-york-city, san-francisco, emeryville, berkeley, evanston or custom";

// The rule set from the environment, or null when FAIR_WORKWEEK is unset (the change log is still kept).
export function readNoticeEnv(env = {}) {
  const raw = String(env.FAIR_WORKWEEK ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!raw || raw === "0" || raw === "off") return null;
  const name = { or: "oregon", wa: "seattle", "seattle-wa": "seattle", il: "chicago", "chicago-il": "chicago", philly: "philadelphia", phl: "philadelphia", "philadelphia-pa": "philadelphia", la: "los-angeles", "los-angeles-city": "los-angeles", "los-angeles-ca": "los-angeles", losangeles: "los-angeles", nyc: "new-york-city", "new-york": "new-york-city", ny: "new-york-city", "nyc-fast-food": "new-york-city", "new-york-city-ny": "new-york-city", sf: "san-francisco", sanfrancisco: "san-francisco", "san-francisco-ca": "san-francisco", "sf-formula-retail": "san-francisco", "emeryville-ca": "emeryville", "berkeley-ca": "berkeley", "city-of-berkeley": "berkeley", "evanston-il": "evanston", "city-of-evanston": "evanston", "la-county": "los-angeles-county", lacounty: "los-angeles-county", "county-of-los-angeles": "los-angeles-county", "los-angeles-county-ca": "los-angeles-county", "unincorporated-los-angeles-county": "los-angeles-county" }[raw] || raw;
  if (!Object.hasOwn(FWW_PRESETS, name)) return { error: `FAIR_WORKWEEK "${String(env.FAIR_WORKWEEK).slice(0, 40)}" is not one of ${PRESET_NAMES}.` };
  const r = { name, restFlat: 0, restWhole: 0, restAcross: 0, noticeFromWeek: 0, edgeEach: 0, extendEach: 0, pairDates: 0, minCutMin: 0, coverAccept: 0, flat: null, tiers: null, onCallPay: null, coverAbsenceDays: 0, ...FWW_PRESETS[name], notes: [], overrides: [] };
  for (const [k, f] of Object.entries(ENV_FIELDS)) {
    if (env[k] === undefined || String(env[k]).trim() === "") continue;
    const v = Number(String(env[k]).trim());
    if (!Number.isFinite(v) || v < 0 || (f === "restMult" && v < 1) || (FLAGS.has(f) && v > 1)) { r.notes.push(`${k} "${String(env[k]).slice(0, 20)}" is not a number we can use; the ${name} value ${r[f]} stays.`); continue; }
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
    state.changeLog.push({ id: state.changeSeq, at, weekStart: weekStart || null, person: c.person, kind: c.kind, from: c.from, to: c.to, cause, requested: !!(c.requested ?? requested), ...(c.massOffer ? { massOffer: true, coverFor: c.coverFor || "" } : {}), ...(c.standby ? { standby: true, coverFor: c.coverFor || "" } : {}), ...(c.standbyOpen > 0 ? { standbyOpen: c.standbyOpen } : {}), ...(c.onCall ? { onCall: true } : {}), ...(c.coverFor && !c.massOffer && !c.standby ? { coverFor: c.coverFor } : {}), ...(Number.isFinite(c.absenceAt) ? { absenceAt: c.absenceAt } : {}) });
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
  // New York City counts notice to 12:00 a.m. on the schedule's first day (rule 7-622(a)), the others to the shift.
  const touches = rules && rules.noticeFromWeek ? slotInstant(e.weekStart, 0, 0, tz) : Math.min(...starts);
  out.noticeH = r2((touches - e.at) / H);
  if (Math.max(...ends) <= e.at) { out.why = "Changed after the shift ended: a record correction, no notice premium counted."; return out; }
  if (!rules) { out.why = "No rule set chosen (FAIR_WORKWEEK)."; return out; }
  if (e.requested) { out.why = "Employee-requested (a call-out, a trade or a pick-up they asked for): exempt. Keep the written request."; return out; }
  if (out.noticeH >= rules.noticeDays * 24) { out.why = `${rules.noticeDays} or more days' notice${rules.noticeFromWeek ? " before the week's first day" : ""}: nothing owed.`; return out; }
  if (e.standby && rules.standby && lost <= 0) { out.why = `Asked from the voluntary standby list${e.coverFor ? ` to cover ${e.coverFor}` : ""} and agreed: exempt (ORS 653.432(4)). Keep the written agreement to be on the list and the acceptance.`; return out; }
  if (rules.coverAbsenceDays > 0 && e.coverFor && lost <= 0 && Number.isFinite(e.absenceAt)) {
    const absenceH = (Math.min(...starts) - e.absenceAt) / H;
    if (absenceH < rules.coverAbsenceDays * 24) { out.why = `Covering ${e.coverFor}'s absence, reported ${absenceH >= 48 ? `${r2(absenceH / 24)} days` : `${r2(absenceH)} h`} before the shift (under ${rules.coverAbsenceDays} days): exempt. Keep the call-out record.`; return out; }
  }
  if (rules.coverAccept && e.coverFor && lost <= 0) { out.why = `Accepted to cover ${e.coverFor}'s absence: exempt, provided the employee was told taking the hours is voluntary and may be declined, and the request and the consent were documented in advance (LA County Code 8.102.080.B.2). Keep both.`; return out; }
  const standbyFirst = rules.standby && e.standbyOpen > 0;
  if (e.massOffer && rules.massOffer && lost <= 0 && !standbyFirst) { out.why = `Taken from the written offer to the whole team after ${e.coverFor || "a colleague"}'s absence: exempt for those hours. Keep the offer and the acceptance.`; return out; }
  let hoursOfPay = 0;
  const ds = e.from && e.to ? Math.abs(e.to.startMin - e.from.startMin) : 0, de = e.from && e.to ? Math.abs(e.to.endMin - e.from.endMin) : 0;
  // A shift moved to another day is a date change: no minute threshold applies to it.
  const sameDay = !(e.from && e.to) || e.from.day === e.to.day;
  if (e.kind === "moved" && sameDay && rules.minEdgeMin > 0 && ds <= rules.minEdgeMin && de <= rules.minEdgeMin && (rules.edgeEach || -lost * 60 <= rules.minExtendMin)) { out.why = `Start or end changed by ${Math.max(ds, de)} min: at or under the ${rules.minEdgeMin} min threshold, hours lost included.`; return out; }
  if (lost > 0 && rules.minCutMin > 0 && Math.round(lost * 60) < rules.minCutMin) { out.why = `${Math.round(lost * 60)} min taken away: under the ${rules.minCutMin} min a cut must reach to owe pay.`; return out; }
  if (lost > 0) {
    if (out.noticeH < rules.cancelWindowH) { hoursOfPay = rules.cancelFraction * lost; out.why = `${e.kind === "cancelled" ? "Cancelled" : "Shortened"} inside ${fmtH(rules.cancelWindowH)}: ${rules.cancelFraction} x ${r2(lost)} h not worked.`; }
    else { hoursOfPay = rules.cancelElseHours; out.why = `${e.kind === "cancelled" ? "Cancelled" : "Shortened"} with under ${rules.noticeDays} days' notice: ${rules.cancelElseHours} h of pay.`; }
  } else if (e.kind === "added") {
    // The threshold is for time added to a shift; an additional shift owes the hour whatever its length.
    hoursOfPay = rules.addHours; out.why = `Shift added with under ${rules.noticeDays} days' notice: ${rules.addHours} h of pay.`;
  } else {
    const extendOnly = e.to.startMin <= e.from.startMin && e.to.endMin >= e.from.endMin;
    if (sameDay && extendOnly && (rules.extendEach ? ds <= rules.minExtendMin && de <= rules.minExtendMin : (ds + de) <= rules.minExtendMin)) { out.why = rules.extendEach ? `${ds} min added at the start and ${de} at the end: each at or under the ${rules.minExtendMin} min grace.` : `${ds + de} min added: at or under the ${rules.minExtendMin} min threshold.`; return out; }
    if (sameDay && !extendOnly && ds <= rules.minMoveMin && de <= rules.minMoveMin) { out.why = `Moved by ${Math.max(ds, de)} min: at or under the ${rules.minMoveMin} min threshold.`; return out; }
    hoursOfPay = rules.addHours; out.why = `${extendOnly ? "Time added" : "Hours moved"} with under ${rules.noticeDays} days' notice: ${rules.addHours} h of pay.`;
  }
  if (e.onCall && lost > 0 && rules.onCallPay) {
    // San Francisco 3300G.4(d): an on-call shift's own table; the change table does not apply to it.
    const oc = rules.onCallPay, len = hrs(e.from);
    if (out.noticeH >= oc.windowH) { out.why = `On-call shift released ${fmtH(r2(out.noticeH))} ahead (${oc.windowH} h or more): nothing owed.`; return out; }
    hoursOfPay = len > oc.overH ? oc.big : oc.small;
    out.why = `On-call shift not called in (or released under ${oc.windowH} h ahead): ${hoursOfPay} h of pay for a shift ${len > oc.overH ? `over ${oc.overH}` : `of ${oc.overH} h or less`}.`;
  } else if (rules.tiers) {
    // Hours of pay per change by notice tier (San Francisco 3300G.4(c)(2), Emeryville's pay structure sheet).
    const tier = rules.tiers.find((t) => out.noticeH >= t.fromH) || rules.tiers[rules.tiers.length - 1];
    const changedH = lost > 0 ? lost : out.gainedH > 0 ? out.gainedH : hrs(e.to || e.from);
    const band = tier.fromH >= 24 ? `under ${rules.noticeDays} days' and ${tier.fromH} h or more` : `under ${rules.tiers[rules.tiers.indexOf(tier) - 1]?.fromH ?? 24} hours'`;
    const what = lost > 0 ? (e.kind === "cancelled" ? "Cancelled" : "Hours cut") : e.kind === "added" ? "Shift added" : out.gainedH > 0 ? "Time added" : "Hours moved";
    const cutOnly = e.kind === "cancelled" || (!!(e.from && e.to) && sameDay && e.to.startMin >= e.from.startMin && e.to.endMin <= e.from.endMin);
    if (lost > 0 && tier.cutLostCap) {
      // Berkeley FAQ 12b and 14: the lesser of the hours taken away and the cap. A shift also moved owes at least the
      // move's hour (12c), whichever is more.
      const capped = Math.min(lost, tier.cutLostCap);
      hoursOfPay = cutOnly ? capped : Math.max(capped, tier.add);
      out.why = `${cutOnly ? what : "Moved and shortened"} with ${band} notice: the lesser of the ${r2(lost)} h taken away and ${tier.cutLostCap} h${cutOnly ? "" : `, or ${tier.add} h for the move if more`}, ${r2(hoursOfPay)} h of pay.`;
    } else if (lost > 0 && tier.cutShiftCap) { const sh = hrs(e.from); hoursOfPay = Math.min(sh, tier.cutShiftCap); out.why = `${what} with ${band} notice: the lesser of the ${r2(sh)} h shift and ${tier.cutShiftCap} h, ${r2(hoursOfPay)} h of pay.`; }
    else if (tier.overH != null && changedH > tier.overH) { hoursOfPay = tier.over; out.why = `${what} with ${band} notice, ${r2(changedH)} h changed (over ${tier.overH}): ${tier.over} h of pay.`; }
    else { hoursOfPay = lost > 0 ? tier.cut : tier.add; out.why = `${what} with ${band} notice${tier.overH != null ? `, ${r2(changedH)} h changed (${tier.overH} or less)` : ""}: ${hoursOfPay} h of pay.`; }
    if (e.pairedWith) out.why += ` One change with entry #${e.pairedWith.id ?? ""} (the shift moved to another day).`;
    if (e.coverFor && rules.coverAbsenceDays > 0 && lost <= 0) out.why += ` Cover for ${e.coverFor}, but the absence was reported ${Number.isFinite(e.absenceAt) ? `${rules.coverAbsenceDays} or more days ahead` : "at an unknown time"}, so the exception does not apply.`;
  }
  if (rules.flat) {
    // A flat sum per change by notice tier (New York City 20-1222(a)): hours taken away pay the higher column.
    const tier = rules.flat.find((t) => out.noticeH >= t.fromH) || rules.flat[rules.flat.length - 1];
    const amt = lost > 0 ? tier.cut : tier.add, band = tier.fromH >= 168 ? "14 to 7 days'" : tier.fromH >= 24 ? "7 days' to 24 hours'" : "under 24 hours'";
    const what = lost > 0 ? (e.kind === "cancelled" || !sameDay ? "Hours taken away" : "Hours cut") : e.kind === "added" ? "Shift added" : !sameDay ? "Moved to another day" : out.gainedH > 0 ? "Time added" : "Hours moved";
    out.why = `${what} with ${band} notice${rules.noticeFromWeek ? " before the week's first day" : ""}: $${amt} flat.`;
    if (e.massOffer) out.why += ` Volunteers and open-shift pick-ups still owe it here.`;
    if (e.onCall && lost > 0) out.why = `On-call shift not needed: ` + out.why.charAt(0).toLowerCase() + out.why.slice(1);
    if (e.pairedWith) out.why += ` One change with entry #${e.pairedWith.id ?? ""} (the shift moved to another day).`;
    out.hoursOfPay = null; out.premium = amt;
    return out;
  }
  if (e.massOffer && !rules.massOffer && hoursOfPay > 0) out.why += ` This rule set has no team-offer exception.`;
  if (e.massOffer && standbyFirst && hoursOfPay > 0) out.why += ` The team-offer exception needs everyone on the standby list asked first (ORS 653.455(3)(k)(C)); ${e.standbyOpen} on it were not.`;
  if (e.standby && !rules.standby && hoursOfPay > 0) out.why += ` This rule set has no standby-list exception.`;
  if (e.onCall && lost > 0 && !rules.onCallPay) out.why = `On-call shift not needed: ` + out.why.charAt(0).toLowerCase() + out.why.slice(1);
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
    if (n < (rules.postDays || rules.noticeDays) * 24) out.push({ person: a.person, slot: a.slot, noticeH: r2(n) });
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
      // Philadelphia counts rest after a prior day's shift (or one that ran past midnight), not a same-day split.
      if (rules.restAcross && Math.floor(mine[i].s / 1440) === Math.floor(mine[i - 1].s / 1440) && mine[i - 1].e <= Math.floor(mine[i - 1].s / 1440) * 1440 + 1440) continue;
      const shiftH = (mine[i].e - mine[i].s) / 60;
      const inside = Math.min(shiftH, rules.restHours - Math.max(0, gapH));
      const paidH = rules.restWhole ? shiftH : inside;
      const wage = wages.get(who), flat = rules.restFlat > 0 ? rules.restFlat : 0, mult = rules.restMult > 1;
      const premium = mult ? (wage > 0 ? r2((rules.restMult - 1) * paidH * wage + flat) : null) : r2(flat);
      out.push({ person: who, first: mine[i - 1].slot, firstLastWeek: mine[i - 1].s < 0, second: mine[i].slot, gapH: r2(Math.max(0, gapH)), insideH: r2(inside), paidH: r2(paidH), premium });
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
  if (rules && (rules.flat || rules.pairDates)) pairDateChanges(priced, rules, { tz, wages });
  const late = weeks.flatMap((w) => latePosting(w, (state.postedAt || {})[w.weekStart], rules, tz).map((x) => ({ ...x, weekStart: w.weekStart })));
  const rests = weeks[0] ? shortRests(weeks[0], weeks[1], rules, wages) : [];
  const sum = (xs) => r2(xs.reduce((t, x) => t + (x.premium || 0), 0));
  const never = weeks[0] && rules ? onCallNeverCalled(weeks[0], state.onCall || {}, rules, { tz, nowMs, wages }) : [];
  return { priced, late, rests, never, changeTotal: sum(priced), restTotal: sum(rests), onCallTotal: sum(never), unpriced: priced.filter((x) => x.unpriced).length + rests.filter((x) => x.premium === null).length + never.filter((x) => x.unpriced).length };
}

// Where premiums are per change (New York City; Berkeley's "moves shifts to another date", pairDates), a cancellation
// and an addition for the same person, logged in the same moment for the same week by the same cause, are one change
// of date (NYC rule 7-622(a) example 3: a Thursday shift moved to Friday owes $10, not $20 + $10; Berkeley: 1 h, not
// 2 h). The pair is priced once, on the cancellation; the addition shows nothing owed and why.
export function pairDateChanges(priced, rules, { tz = "UTC", wages = new Map() } = {}) {
  const groups = new Map();
  priced.forEach((p, i) => { if (p.kind === "cancelled" || p.kind === "added") { const k = `${p.at}|${p.weekStart}|${p.person}|${p.cause}`; (groups.get(k) || groups.set(k, []).get(k)).push(i); } });
  for (const idx of groups.values()) {
    const cut = idx.filter((i) => priced[i].kind === "cancelled"), add = idx.filter((i) => priced[i].kind === "added");
    for (let j = 0; j < Math.min(cut.length, add.length); j++) {
      const c = priced[cut[j]], a = priced[add[j]];
      // Owed means a premium, or hours of pay when the staff list has no wage (the pair is still one change).
      const owes = (p) => p.premium > 0 || p.hoursOfPay > 0;
      if (c.requested || a.requested || c.onCall || a.onCall || !owes(c) || !owes(a)) continue;
      const one = priceChange({ ...c, kind: "moved", to: a.to, massOffer: c.massOffer || a.massOffer, pairedWith: { id: a.id } }, rules, { tz, wage: wages.get(c.person) });
      priced[cut[j]] = { ...one, kind: "cancelled", from: c.from, to: null };
      priced[add[j]] = { ...a, premium: a.premium == null ? null : 0, hoursOfPay: a.hoursOfPay == null ? null : 0, unpriced: false, lostH: 0, gainedH: 0, why: `One change with entry #${c.id ?? ""}: the shift moved to another day, priced there.` };
    }
  }
  return priced;
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
  const rest = rep.rests.map((x) => ["", "", x.person, "short-rest", `${x.firstLastWeek ? "last week " : ""}${slotLabel(x.first)}`, slotLabel(x.second), "posted week", "", "", "", (x.paidH ?? x.insideH).toFixed(2), "", x.premium == null ? "" : x.premium.toFixed(2), rules ? rules.name : "", `${x.gapH} h between shifts; ${x.insideH} h inside the ${rules.restHours} h rest window at ${rules.restMult}x`].map(cell).join(","));
  const never = (rep.never || []).map((p) => ["", p.weekStart || "", p.person, "on-call-never-called", slotLabel(p.from), "", p.cause, "no", "", p.lostH.toFixed(2), "0.00", p.hoursOfPay == null ? "" : p.hoursOfPay.toFixed(2), p.premium == null ? "" : p.premium.toFixed(2), rules ? rules.name : "", p.why].map(cell).join(","));
  return [head, ...rows, ...rest, ...never].join("\n") + "\n";
}
