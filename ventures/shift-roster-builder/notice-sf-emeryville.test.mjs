// San Francisco (Ordinance 117-15, Police Code 3300G.4 / L.E.C. 42.4; OLSE FAQ 2025-08-08) and Emeryville (Fair
// Workweek Ordinance, the city's notice and "Predictability Pay Structure" sheet) presets. README "San Francisco and
// Emeryville". Times are UTC; WS is a Monday, so Mon 09:00 is 2026-11-23T09:00Z.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readNoticeEnv, priceChange, latePosting, shortRests, onCallNeverCalled, logChanges, noticeReport } from "./notice.mjs";
import { handler, emptyState, publish } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const at = (iso) => Date.parse(iso);
const S = (day, sh, eh, label = "") => ({ day, startMin: Math.round(sh * 60), endMin: Math.round(eh * 60), label, role: "" });
const WS = "2026-11-23";
const ch = (iso, kind, from, to, extra = {}) => ({ id: 1, at: at(iso), weekStart: WS, person: "Ana", kind, from, to, cause: "republish", requested: false, ...extra });
const SF = readNoticeEnv({ FAIR_WORKWEEK: "san-francisco" }), EM = readNoticeEnv({ FAIR_WORKWEEK: "emeryville" });
const pay = (e, rules, wage = 20) => priceChange(e, rules, { wage });

test("the two presets are read by name and alias", () => {
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "SF" }).name, "san-francisco");
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "San Francisco" }).name, "san-francisco");
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "emeryville-ca" }).name, "emeryville");
  assert.equal(SF.noticeDays, 7); assert.equal(SF.postDays, 14);
  assert.equal(EM.noticeDays, 14); assert.equal(EM.restHours, 11);
  assert.match(readNoticeEnv({ FAIR_WORKWEEK: "oakland" }).error, /san-francisco, emeryville/);
});

test("San Francisco: 7 days' notice, then 1 h, then 2 h or 4 h under 24 h by the hours changed", () => {
  // Posted 14 days ahead; a change 8 days ahead is outside the premium window.
  assert.equal(pay(ch("2026-11-15T09:00:00Z", "added", null, S(0, 9, 17)), SF).premium, 0);
  // Under 7 days and 24 h or more: 1 h per changed shift, added or cut.
  assert.equal(pay(ch("2026-11-20T09:00:00Z", "added", null, S(0, 9, 17)), SF).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-20T09:00:00Z", "cancelled", S(0, 9, 17), null), SF).hoursOfPay, 1);
  // Under 24 h: 2 h for four hours or less changed, 4 h for more.
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "added", null, S(0, 9, 13)), SF).hoursOfPay, 2);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "added", null, S(0, 9, 15)), SF).hoursOfPay, 4);
  const cut = pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 17), null), SF);
  assert.equal(cut.hoursOfPay, 4); assert.equal(cut.premium, 80);
  assert.match(cut.why, /8 h changed \(over 4\): 4 h of pay/);
  // FAQ VII.d.4 example 2: a 4 h shift made 6 h at the start of the shift: 2 h of predictability pay.
  assert.equal(pay(ch("2026-11-23T09:00:00Z", "moved", S(0, 9, 13), S(0, 9, 15)), SF).hoursOfPay, 2);
  // An 8 h shift cut by 2 h with under 24 h notice: 2 h changed, so 2 h of pay (the 2025 FAQ's "hours subtracted").
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 15)), SF).hoursOfPay, 2);
  // No minute threshold in San Francisco: a 10 min move owes.
  assert.equal(pay(ch("2026-11-20T09:00:00Z", "moved", S(0, 9, 17), S(0, 9 + 1 / 6, 17 + 1 / 6)), SF).hoursOfPay, 1);
  // Employee-requested changes and trades are exempt, as everywhere.
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 17), null, { requested: true }), SF).premium, 0);
});

test("San Francisco: posting is checked against 14 days, premiums against 7", () => {
  const week = { weekStart: WS, assignments: [{ person: "Ana", slot: S(0, 9, 17) }] };
  assert.equal(latePosting(week, at("2026-11-13T09:00:00Z"), SF).length, 1); // 10 days ahead
  assert.equal(latePosting(week, at("2026-11-09T09:00:00Z"), SF).length, 0); // 14 days ahead
});

test("San Francisco: on-call shifts on their own table, 2 h or 4 h unless released 24 h ahead", () => {
  const oc = (iso, slot) => pay(ch(iso, "cancelled", slot, null, { onCall: true, cause: "on-call not needed" }), SF);
  assert.equal(oc("2026-11-22T08:00:00Z", S(0, 9, 13, "on-call")).premium, 0); // 25 h ahead
  assert.equal(oc("2026-11-20T09:00:00Z", S(0, 9, 17, "on-call")).premium, 0); // 3 days: the change table does not apply
  assert.equal(oc("2026-11-23T05:00:00Z", S(0, 9, 13, "on-call")).hoursOfPay, 2);
  const big = oc("2026-11-23T05:00:00Z", S(0, 9, 17, "on-call"));
  assert.equal(big.hoursOfPay, 4); assert.match(big.why, /^On-call shift not called in/);
  // Never called in, by its end: counted as released at the start.
  const week = { weekStart: WS, assignments: [{ person: "Ana", slot: S(0, 9, 15, "on-call") }] };
  const never = onCallNeverCalled(week, {}, SF, { nowMs: at("2026-11-23T16:00:00Z"), wages: new Map([["Ana", 20]]) });
  assert.equal(never.length, 1); assert.equal(never[0].premium, 80);
});

test("San Francisco: cover for an absence reported under 7 days ahead is exempt, team offer or not", () => {
  const cover = (absenceIso, extra = {}) => pay(ch("2026-11-21T09:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "cover", coverFor: "Ana", absenceAt: at(absenceIso), ...extra }), SF);
  const ok = cover("2026-11-21T08:00:00Z");
  assert.equal(ok.premium, 0); assert.match(ok.why, /Covering Ana's absence, reported 2\.04 days before the shift/);
  assert.equal(cover("2026-11-21T08:00:00Z", { massOffer: true, cause: "team offer" }).premium, 0);
  // Reported 8 days ahead: the employer had a week's notice, so the cover is priced (a change 2 days out, 1 h).
  const late = cover("2026-11-15T08:00:00Z");
  assert.equal(late.hoursOfPay, 1); assert.match(late.why, /the exception does not apply/);
  // A cover with no call-out time on record is priced, and says why.
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "cover", coverFor: "Ana" }), SF).hoursOfPay, 1);
  // Seattle has no such exception: the same cover still owes there.
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "cover", coverFor: "Ana", absenceAt: at("2026-11-21T08:00:00Z") }), readNoticeEnv({ FAIR_WORKWEEK: "seattle" })).hoursOfPay, 1);
});

test("Emeryville: 1 h inside 14 days; under 24 h, hours taken away pay the lesser of the shift and 4 h", () => {
  assert.equal(pay(ch("2026-11-08T09:00:00Z", "cancelled", S(0, 9, 17), null), EM).premium, 0); // 15 days
  assert.equal(pay(ch("2026-11-13T09:00:00Z", "cancelled", S(0, 9, 17), null), EM).hoursOfPay, 1); // 10 days
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "added", null, S(0, 9, 17)), EM).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 12), null), EM).hoursOfPay, 3);
  const eight = pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 17), null), EM);
  assert.equal(eight.hoursOfPay, 4); assert.match(eight.why, /lesser of the 8 h shift and 4 h/);
  // The sheet counts the scheduled shift's hours, not the hours cut: 1 h off an 8 h shift under 24 h owes 4 h.
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16)), EM).hoursOfPay, 4);
  // All other changes under 24 h: 1 h.
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "added", null, S(0, 9, 17)), EM).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 10, 18)), EM).hoursOfPay, 1);
});

test("Emeryville: 10 minutes or less at each end is free; a team offer is not exempt", () => {
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9 - 1 / 6, 17 + 1 / 6)), EM).premium, 0);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9 + 1 / 6, 17 - 1 / 6)), EM).premium, 0);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17.25)), EM).hoursOfPay, 1);
  const offer = pay(ch("2026-11-21T09:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "team offer", massOffer: true, coverFor: "Ana" }), EM);
  assert.equal(offer.hoursOfPay, 1); assert.match(offer.why, /no team-offer exception/);
});

test("Emeryville: hours worked under 11 h after the previous day's shift at time and a half", () => {
  const week = { weekStart: WS, assignments: [{ person: "Ana", slot: S(0, 15, 23) }, { person: "Ana", slot: S(1, 7, 15) }, { person: "Ben", slot: S(2, 6, 10) }, { person: "Ben", slot: S(2, 14, 20) }] };
  const r = shortRests(week, null, EM, new Map([["Ana", 20], ["Ben", 20]]));
  assert.equal(r.length, 1); // Ben's same-day split is not a rest between days
  assert.equal(r[0].person, "Ana"); assert.equal(r[0].gapH, 8); assert.equal(r[0].insideH, 3); assert.equal(r[0].premium, 30);
  // San Francisco has no rest rule.
  assert.equal(shortRests(week, null, SF, new Map()).length, 0);
});

test("the hub: a cover under San Francisco's rules is logged with the call-out time and exempted", async () => {
  const state = emptyState();
  state.weekStart = WS;
  state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 6-23\nBen, 18, 40, 0, Mon-Sun 6-23";
  state.shifts = "day, start, end, people needed, label\nMon, 9, 17, 1, open";
  assert.ok(publish(state, at("2026-11-08T09:00:00Z")).ok);
  const who = state.published.assignments[0].person, other = who === "Ana" ? "Ben" : "Ana";
  state.callouts.push({ person: who, day: 0, startMin: 540, endMin: 1020, note: "", at: "2026-11-21T08:00:00.000Z" });
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: "sf" }, () => at("2026-11-21T09:00:00Z"), null);
  const post = (p, b) => serve(hub, new Request("https://hub.example" + p, { method: "POST", body: new URLSearchParams(b) }));
  assert.equal((await post("/admin/cover?key=adm", { i: "0", name: other })).status, 303);
  const added = state.changeLog.find((c) => c.person === other);
  assert.equal(added.coverFor, who); assert.equal(added.absenceAt, at("2026-11-21T08:00:00Z"));
  const rep = noticeReport(state, SF, { wages: new Map([["Ana", 20], ["Ben", 18]]) });
  assert.equal(rep.changeTotal, 0);
  const page = await (await serve(hub, new Request("https://hub.example/admin/changes?key=adm"))).text();
  assert.match(page, /San Francisco Formula Retail Employee Rights/);
  assert.match(page, /Post 14 days ahead \(premiums start under 7 days\)/);
  assert.match(page, /on-call shift not called in/);
  assert.match(page, /no rest-between-shifts premium/);
  assert.match(page, /Covering [A-Za-z]+&#39;s absence|Covering [A-Za-z]+'s absence/);
});

test("logChanges keeps coverFor and absenceAt on a plain cover", () => {
  const st = { changeLog: [] };
  logChanges(st, [{ person: "Ben", kind: "added", from: null, to: S(0, 9, 17), coverFor: "Ana", absenceAt: 5 }], { at: 10, weekStart: WS, cause: "cover" });
  assert.equal(st.changeLog[0].coverFor, "Ana"); assert.equal(st.changeLog[0].absenceAt, 5);
});
