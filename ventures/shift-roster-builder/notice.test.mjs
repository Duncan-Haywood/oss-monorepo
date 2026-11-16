import { test } from "node:test";
import assert from "node:assert/strict";
import { readNoticeEnv, diffAssignments, logChanges, priceChange, latePosting, shortRests, noticeReport, noticeCsv, slotInstant, teamOfferText, onCallShifts, onCallNeverCalled, isOnCall, standbyNoticeText, standbyAskText, FWW_PRESETS } from "./notice.mjs";
import { handler, emptyState, publish } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const at = (iso) => Date.parse(iso);
const S = (day, sh, eh) => ({ day, startMin: sh * 60, endMin: eh * 60, label: "", role: "" });
const A = (person, slot) => ({ person, slot });
const WS = "2026-11-23"; // a Monday
// A change logged at `iso` to the week of WS.
const ch = (iso, kind, from, to, extra = {}) => ({ id: 1, at: at(iso), weekStart: WS, person: "Ana", kind, from, to, cause: "republish", requested: false, ...extra });

test("the rule set is read from FAIR_WORKWEEK, with typed overrides, and nothing is priced without it", () => {
  assert.equal(readNoticeEnv({}), null);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "off" }), null);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "Seattle" }).restMult, 1.5);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "OR" }).name, "oregon");
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "chicago" }).cancelWindowH, 24);
  assert.match(readNoticeEnv({ FAIR_WORKWEEK: "boston" }).error, /not one of/);
  const c = readNoticeEnv({ FAIR_WORKWEEK: "custom", FWW_NOTICE_DAYS: "10", FWW_REST_MULT: "0.5", FWW_ADD_HOURS: "x" });
  assert.equal(c.noticeDays, 10);
  assert.equal(c.restMult, 1.5); // under 1 would pay less than the wage: refused
  assert.equal(c.addHours, 1);
  assert.equal(c.notes.length, 2);
  assert.deepEqual(c.overrides, ["FWW_NOTICE_DAYS=10"]);
});

test("diff pairs each person's shifts: kept, moved on the same day, cancelled, added", () => {
  const before = [A("Ana", S(0, 9, 17)), A("Ana", S(2, 9, 17)), A("Ben", S(1, 14, 22)), A(null, S(3, 9, 13))];
  const after = [A("Ana", S(0, 9, 17)), A("Ana", S(2, 10, 15)), A("Ben", S(4, 14, 22)), A("Cleo", S(3, 9, 13))];
  assert.deepEqual(diffAssignments(before, after).map((c) => `${c.person} ${c.kind}`), ["Ana moved", "Ben cancelled", "Ben added", "Cleo added"]);
  assert.deepEqual(diffAssignments(before, before), []);
});

test("slot instants follow the site's zone, and an overnight end runs into the next day", () => {
  assert.equal(slotInstant(WS, 0, 9 * 60, "America/Chicago"), at("2026-11-23T15:00:00Z"));
  assert.equal(slotInstant(WS, 6, 26 * 60, "UTC"), at("2026-11-30T02:00:00Z"));
});

test("Seattle: an added or moved shift owes one hour; lost hours owe half, anywhere in the 14 days", () => {
  const r = FWW_PRESETS.seattle;
  const wage = 20;
  // Monday 09:00 shift; change made the Friday before (66 h notice).
  let p = priceChange(ch("2026-11-20T15:00:00Z", "added", null, S(0, 9, 17)), r, { wage });
  assert.equal(p.noticeH, 66);
  assert.equal(p.premium, 20);
  p = priceChange(ch("2026-11-20T15:00:00Z", "cancelled", S(0, 9, 17), null), r, { wage });
  assert.equal(p.premium, 80); // 0.5 x 8 h x $20
  p = priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), S(0, 9, 13)), r, { wage });
  assert.equal(p.lostH, 4);
  assert.equal(p.premium, 40);
  p = priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), S(0, 11, 19)), r, { wage });
  assert.equal(p.premium, 20);
  // Sent home at noon, during the shift: notice is negative, still half of the hours not worked.
  p = priceChange(ch("2026-11-23T12:00:00Z", "moved", S(0, 9, 17), S(0, 9, 12)), r, { wage });
  assert.ok(p.noticeH < 0);
  assert.equal(p.premium, 50);
  // 14 days or more: nothing; after the shift ended: a correction; employee-requested: exempt; no wage: unpriced.
  assert.equal(priceChange(ch("2026-11-09T09:00:00Z", "added", null, S(0, 9, 17)), r, { wage }).premium, 0);
  assert.match(priceChange(ch("2026-11-23T18:00:00Z", "cancelled", S(0, 9, 17), null), r, { wage }).why, /record correction/);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "cancelled", S(0, 9, 17), null, { requested: true }), r, { wage }).premium, 0);
  const u = priceChange(ch("2026-11-20T15:00:00Z", "added", null, S(0, 9, 17)), r, {});
  assert.equal(u.unpriced, true);
  assert.equal(u.premium, null);
});

test("Chicago: a cut with 24 h or more notice owes one hour, under 24 h half the lost hours; 15 min moves are free", () => {
  const r = FWW_PRESETS.chicago, wage = 16;
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "cancelled", S(0, 9, 17), null), r, { wage }).premium, 16);
  assert.equal(priceChange(ch("2026-11-22T15:00:00Z", "cancelled", S(0, 9, 17), null), r, { wage }).premium, 64);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 15, endMin: 17 * 60 + 15 }), r, { wage }).premium, 0);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 30, endMin: 17 * 60 + 30 }), r, { wage }).premium, 16);
});

test("Oregon: 30 minutes or less of added time owes nothing, more owes an hour", () => {
  const r = FWW_PRESETS.oregon, wage = 15;
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), endMin: 17 * 60 + 30 }), r, { wage }).premium, 0);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), endMin: 17 * 60 + 45 }), r, { wage }).premium, 15);
  // ORS 653.455(3)(a): a start or end changed by 30 min or less owes nothing, the lost 20 minutes included.
  const late = priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 20 }), r, { wage });
  assert.equal(late.premium, 0); assert.match(late.why, /hours lost included/);
  // 31 minutes later: half of the lost 31 minutes. Seattle has no such threshold and prices the 20 minutes.
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 31 }), r, { wage: 30 }).premium, 7.75);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 20 }), FWW_PRESETS.seattle, { wage }).premium, 2.5);
  // Both ends 20 min out: 40 min added is more than 30, so the hour is owed.
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 8 * 60 + 40, endMin: 17 * 60 + 20 }), r, { wage }).premium, 15);
  // Both shifted 30 min later, no hours lost: exempt.
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 30, endMin: 17 * 60 + 30 }), r, { wage }).premium, 0);
  // ORS 653.455(2)(a)(C): an additional shift owes the hour whatever its length; the 30 min is for time added to a shift.
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "added", null, { ...S(0, 9, 17), startMin: 9 * 60, endMin: 9 * 60 + 30 }), r, { wage }).premium, 15);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "seattle", FWW_MIN_EDGE_MIN: "15" }).minEdgeMin, 15);
});

test("Oregon's voluntary standby list: accepted hours exempt; a team offer before the list is asked is priced", () => {
  const r = FWW_PRESETS.oregon, wage = 20;
  const sb = ch("2026-11-22T12:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "standby list", standby: true, coverFor: "Ana" });
  const p = priceChange(sb, r, { wage });
  assert.equal(p.premium, 0); assert.match(p.why, /voluntary standby list to cover Ana and agreed: exempt \(ORS 653\.432\(4\)\)/);
  // Seattle and Chicago have no standby-list exception here; the hour is charged and the reason says so.
  for (const name of ["seattle", "chicago"]) {
    const q = priceChange(sb, FWW_PRESETS[name], { wage });
    assert.equal(q.premium, 20, name); assert.match(q.why, /no standby-list exception/, name);
  }
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "seattle", FWW_STANDBY: "1" }).standby, 1);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "oregon", FWW_STANDBY: "0" }).standby, 0);
  // ORS 653.455(3)(k)(C): two on the list not asked, so the team offer's exception fails in Oregon only.
  const offer = ch("2026-11-22T12:00:00Z", "added", null, S(0, 9, 17), { person: "Cleo", cause: "team offer", massOffer: true, coverFor: "Ana", standbyOpen: 2 });
  const o = priceChange(offer, r, { wage });
  assert.equal(o.premium, 20); assert.match(o.why, /standby list asked first \(ORS 653\.455\(3\)\(k\)\(C\)\); 2 on it were not/);
  assert.equal(priceChange(offer, FWW_PRESETS.seattle, { wage }).premium, 0);
  assert.equal(priceChange({ ...offer, standbyOpen: 0 }, r, { wage }).premium, 0);
  // The log keeps both marks.
  const state = { changeLog: [] };
  logChanges(state, [{ person: "Ben", kind: "added", from: null, to: S(0, 9, 17), standby: true, coverFor: "Ana" }, { person: "Cleo", kind: "added", from: null, to: S(1, 9, 17), massOffer: true, coverFor: "Ana", standbyOpen: 2 }], { at: 1, weekStart: WS, cause: "x" });
  assert.equal(state.changeLog[0].standby, true); assert.equal(state.changeLog[1].standbyOpen, 2); assert.equal(state.changeLog[0].standbyOpen, undefined);
  // The written notice says the four things ORS 653.432(1)(a)-(d) list.
  const n = standbyNoticeText().join(" ");
  for (const re of [/voluntary/, /come off it at any time/, /how|tells the people on the list/, /accept by pressing/, /do not have to accept/, /do not earn predictability pay/]) assert.match(n, re);
  assert.match(standbyAskText({ person: "Ana", day: 0, startMin: 540, endMin: 1020 }, WS), /Mon 09:00-17:00 \(week of 2026-11-23\), because Ana cannot work it\. You may decline/);
});

test("late posting and short rests, the rest reaching back into last week", () => {
  const r = FWW_PRESETS.seattle;
  const week = { weekStart: WS, assignments: [A("Ana", S(0, 9, 17)), A("Ana", S(1, 6, 14)), A("Ben", S(4, 9, 17)), A(null, S(2, 9, 17))] };
  const late = latePosting(week, at("2026-11-13T09:00:00Z"), r);
  assert.deepEqual(late.map((x) => `${x.person} ${x.slot.day}`), ["Ana 0", "Ana 1"]); // Ben's Friday is 14 days out
  const prev = { weekStart: "2026-11-16", assignments: [A("Ana", S(6, 16, 24))] };
  const rests = shortRests(week, prev, r, new Map([["Ana", 20]]));
  // Sun 16-24 then Mon 9-17: 9 h rest, 1 h inside; Mon 9-17 then Tue 6-14: 13 h, fine.
  assert.equal(rests.length, 1);
  assert.equal(rests[0].firstLastWeek, true);
  assert.equal(rests[0].insideH, 1);
  assert.equal(rests[0].premium, 10); // (1.5 - 1) x 1 h x $20
  assert.equal(shortRests(week, { ...prev, weekStart: "2026-11-09" }, r).length, 0); // not the week before
});

test("the report totals, and the CSV cannot carry a formula", () => {
  const state = { changeLog: [] };
  logChanges(state, [{ person: "=Ana", kind: "cancelled", from: S(0, 9, 17), to: null }], { at: at("2026-11-20T15:00:00Z"), weekStart: WS, cause: "republish" });
  const rep = noticeReport(state, FWW_PRESETS.seattle, { wages: new Map([["=Ana", 20]]), weeks: [] });
  assert.equal(rep.changeTotal, 80);
  const csv = noticeCsv(rep, { ...FWW_PRESETS.seattle, name: "seattle" });
  assert.match(csv, /^changed_at_utc,week_start,person/);
  assert.match(csv, /\n2026-11-20T15:00:00\.000Z,2026-11-23,'=Ana,cancelled,Mon 09:00-17:00,,republish,no,66,8\.00,0\.00,4\.00,80\.00,seattle,/);
});

// Red team 2026-11-16: a shift cut short after it started has negative notice hours, and the formula guard turned
// "-1" into the text "'-1", so a payroll sheet could not sum or sort the column. Plain numbers are not formulas; "-1+2"
// and "-cmd" still are.
test("the CSV keeps negative notice hours a number, and still defuses formulas that start with a minus", () => {
  const state = { changeLog: [] };
  logChanges(state, [{ person: "-Ana", kind: "moved", from: S(0, 9, 17), to: S(0, 9, 13) }], { at: at("2026-11-23T10:00:00Z"), weekStart: WS, cause: "republish" });
  const csv = noticeCsv(noticeReport(state, FWW_PRESETS.seattle, { wages: new Map([["-Ana", 20]]) }), { ...FWW_PRESETS.seattle, name: "seattle" });
  assert.match(csv, /\n2026-11-23T10:00:00\.000Z,2026-11-23,'-Ana,moved,Mon 09:00-17:00,Mon 09:00-13:00,republish,no,-1,4\.00,0\.00,2\.00,40\.00,seattle,/);
  const st2 = { changeLog: [] };
  logChanges(st2, [{ person: "-1+2", kind: "cancelled", from: S(0, 9, 17), to: null }], { at: at("2026-11-20T15:00:00Z"), weekStart: WS, cause: "republish" });
  assert.match(noticeCsv(noticeReport(st2, FWW_PRESETS.seattle, {}), { ...FWW_PRESETS.seattle, name: "seattle" }), /,'-1\+2,cancelled,/);
});

test("the hub logs a republished week, a cover and the posting time, and prices them on the changes page", async () => {
  const state = emptyState();
  state.weekStart = WS;
  state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 6-23\nBen, 18, 40, 0, Mon-Sun 6-23";
  state.shifts = "day, start, end, people needed, label\nMon, 9, 17, 1, open\nTue, 9, 17, 1, open";
  assert.ok(publish(state, at("2026-11-13T09:00:00Z")).ok);
  assert.equal(state.postedAt[WS], at("2026-11-13T09:00:00Z"));
  assert.equal(state.changeLog.length, 0);
  // Ben is no longer available on Monday: publishing again moves the Monday shift.
  const first = state.published.assignments.map((a) => `${a.person}`).join(",");
  state.staff = state.staff.replace("Ben, 18, 40, 0, Mon-Sun 6-23", "Ben, 18, 40, 0, Tue-Sun 6-23").replace("Ana, 20, 40, 0, Mon-Sun 6-23", "Ana, 20, 40, 0, Mon 6-23");
  assert.ok(publish(state, at("2026-11-20T15:00:00Z")).ok);
  const second = state.published.assignments.map((a) => `${a.person}`).join(",");
  assert.equal(second, "Ana,Ben");
  assert.equal(state.postedAt[WS], at("2026-11-13T09:00:00Z")); // the first posting stays
  assert.equal(first, "Ben,Ana");
  assert.deepEqual(state.changeLog.map((c) => `${c.person} ${c.kind}`), ["Ana cancelled", "Ana added", "Ben cancelled", "Ben added"]);
  const clock = { t: at("2026-11-21T12:00:00Z") };
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: "seattle" }, () => clock.t, null);
  const call = (p) => serve(hub, new Request("https://hub.example" + p));
  const post = (p, b) => serve(hub, new Request("https://hub.example" + p, { method: "POST", body: new URLSearchParams(b) }));
  // Ana calls out of Monday; the manager gives it to Ben (needs Ben free Monday again).
  state.staff = state.staff.replace("Tue-Sun 6-23", "Mon-Sun 6-23");
  state.published.staffText = state.staff;
  state.callouts.push({ person: "Ana", day: 0, startMin: 540, endMin: 1020, note: "" });
  const n0 = state.changeLog.length;
  const r = await post("/admin/cover?key=adm", { i: "0", name: "Ben" });
  assert.equal(r.status, 303);
  const logged = state.changeLog.slice(n0);
  assert.deepEqual(logged.map((c) => `${c.person} ${c.kind} ${c.cause} ${c.requested}`).sort(), ["Ana cancelled cover true", "Ben added cover false"]);
  let page = await (await call("/admin/changes?key=adm")).text();
  assert.match(page, /Seattle Secure Scheduling/);
  assert.match(page, /<strong>Ben<\/strong><\/td><td>added: Mon 09:00-17:00/);
  assert.match(page, /\$18\.00/); // Ben's hour of pay for the added shift, 45 h ahead
  assert.match(page, /Employee-requested \(a call-out, a trade or a pick-up they asked for\): exempt/);
  assert.match(page, /Posted with less than 14 days' notice/);
  // The manager marks Ben's pick as asked for: it drops to nothing.
  const id = logged.find((c) => c.person === "Ben").id;
  await post("/admin/change-mark?key=adm", { id: String(id), requested: "1" });
  assert.equal(state.changeLog.find((c) => c.id === id).requested, true);
  const csv = await (await call("/admin/changes.csv?key=adm")).text();
  assert.match(csv, /\n[^\n]*,Ben,added,,Mon 09:00-17:00,cover,yes,45,/);
  assert.equal((await call("/admin/changes?key=nope")).status, 401);
  assert.match(await (await call("/admin?key=adm")).text(), /Schedule changes and notice pay<\/a> \(\d+ change/);
  // Off by default: the log is shown, nothing priced.
  const off = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm" }, () => clock.t, null);
  page = await (await serve(off, new Request("https://hub.example/admin/changes?key=adm"))).text();
  assert.match(page, /No rule set is chosen/);
});

test("the team offer: exempt in Seattle and Oregon for the absent person's hours, priced in Chicago", () => {
  const add = ch("2026-11-22T12:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "team offer", massOffer: true, coverFor: "Ana" });
  for (const name of ["seattle", "oregon"]) {
    const p = priceChange(add, FWW_PRESETS[name], { wage: 18 });
    assert.equal(p.premium, 0, name);
    assert.match(p.why, /written offer to the whole team after Ana's absence: exempt/);
  }
  const chi = priceChange(add, FWW_PRESETS.chicago, { wage: 18 });
  assert.equal(chi.premium, 18);
  assert.match(chi.why, /no team-offer exception/);
  // Without the mark (the manager picked the person), Seattle prices it as before.
  assert.equal(priceChange({ ...add, massOffer: false }, FWW_PRESETS.seattle, { wage: 18 }).premium, 18);
  // The exception covers added hours only: a cut that carries the mark is still priced.
  assert.equal(priceChange(ch("2026-11-22T12:00:00Z", "moved", S(0, 9, 17), S(0, 9, 13), { massOffer: true }), FWW_PRESETS.seattle, { wage: 20 }).premium, 40);
  // FWW_MASS_OFFER turns it on or off for any preset; 2 is refused.
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "chicago", FWW_MASS_OFFER: "1" }).massOffer, 1);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "seattle", FWW_MASS_OFFER: "0" }).massOffer, 0);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "seattle", FWW_MASS_OFFER: "2" }).massOffer, 1);
  // The offer says the three things: to everyone, voluntary, may decline.
  const text = teamOfferText({ person: "Ana", day: 0, startMin: 540, endMin: 1020 }, WS);
  assert.match(text, /Mon 09:00-17:00 \(week of 2026-11-23\), because Ana cannot work it/);
  assert.match(text, /everyone at once/); assert.match(text, /voluntary/); assert.match(text, /may decline/);
  // logChanges keeps the mark and whom it covered.
  const state = {};
  logChanges(state, [{ person: "Ben", kind: "added", from: null, to: S(0, 9, 17), massOffer: true, coverFor: "Ana" }], { at: 1, weekStart: WS, cause: "team offer" });
  assert.equal(state.changeLog[0].massOffer, true); assert.equal(state.changeLog[0].coverFor, "Ana");
});

test("on-call shifts: released ones are cancellations, ones never called in are released at the start", () => {
  const oc = { ...S(2, 16, 22), label: "On-call close" };
  assert.ok(isOnCall(oc)); assert.ok(isOnCall({ label: "oncall" })); assert.ok(!isOnCall({ label: "Concall" })); assert.ok(!isOnCall(S(0, 9, 17)));
  const week = { weekStart: WS, assignments: [A("Ana", oc), A("Ben", S(0, 9, 17)), A(null, { ...oc })] };
  const list = onCallShifts(week, {});
  assert.deepEqual(list.map((x) => `${x.person} ${x.status}`), ["Ana waiting"]);
  // Released Tuesday noon (28 h ahead): Seattle half of 6 h; Chicago 1 h (outside 24 h).
  const rel = ch("2026-11-24T12:00:00Z", "cancelled", oc, null, { onCall: true, cause: "on-call not needed" });
  let p = priceChange(rel, FWW_PRESETS.seattle, { wage: 20 });
  assert.equal(p.premium, 60); assert.match(p.why, /^On-call shift not needed: cancelled inside/);
  assert.equal(priceChange(rel, FWW_PRESETS.chicago, { wage: 20 }).premium, 20);
  // Never marked, and the shift has ended: half of 6 h in all three (no notice).
  const after = at("2026-11-25T23:00:00Z");
  for (const name of ["seattle", "oregon", "chicago"]) {
    const n = onCallNeverCalled(week, {}, FWW_PRESETS[name], { nowMs: after, wages: new Map([["Ana", 20]]) });
    assert.equal(n.length, 1, name); assert.equal(n[0].premium, 60, name); assert.equal(n[0].noticeH, 0);
  }
  // Not yet ended, or marked: nothing.
  assert.equal(onCallNeverCalled(week, {}, FWW_PRESETS.seattle, { nowMs: at("2026-11-25T21:00:00Z") }).length, 0);
  assert.equal(onCallNeverCalled(week, { [list[0].key]: { status: "called" } }, FWW_PRESETS.seattle, { nowMs: after }).length, 0);
  const rep = noticeReport({ changeLog: [], onCall: {} }, FWW_PRESETS.seattle, { weeks: [week], nowMs: after, wages: new Map([["Ana", 20]]) });
  assert.equal(rep.onCallTotal, 60);
  assert.match(noticeCsv(rep, { ...FWW_PRESETS.seattle, name: "seattle" }), /\n,2026-11-23,Ana,on-call-never-called,Wed 16:00-22:00,,on-call never called,no,,6\.00,0\.00,3\.00,60\.00,seattle,/);
});

test("the hub: a call-out offered to the whole team, a yes from the staff page, and an on-call shift marked", async () => {
  const state = emptyState();
  state.weekStart = WS;
  state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 6-23\nBen, 18, 40, 0, Mon-Sun 6-23\nCleo, 19, 40, 0, Mon-Sun 6-23";
  state.shifts = "day, start, end, people needed, label\nMon, 9, 17, 1, open\nWed, 16, 22, 1, on-call close";
  assert.ok(publish(state, at("2026-11-13T09:00:00Z")).ok);
  const clock = { t: at("2026-11-21T12:00:00Z") };
  const sent = [];
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: "seattle", TEAM_WEBHOOK_URL: "https://hook.example/t" }, () => clock.t, async (u, o) => { sent.push(String(o && o.body)); return new Response("ok"); });
  const call = (p) => serve(hub, new Request("https://hub.example" + p));
  const post = (p, b) => serve(hub, new Request("https://hub.example" + p, { method: "POST", body: new URLSearchParams(b) }));
  const mon = state.published.assignments.find((a) => a.slot.day === 0);
  const caller = mon.person;
  state.callouts.push({ person: caller, day: 0, startMin: 540, endMin: 1020, note: "" });
  let admin = await (await call("/admin?key=adm")).text();
  assert.match(admin, /Offer to the whole team<\/button>/);
  assert.equal((await post("/admin/offer?key=adm", { i: "0" })).status, 303);
  assert.ok(state.callouts[0].offeredAt);
  assert.ok(sent.some((b) => /offered to the whole team/.test(b)));
  const team = await (await call("/team?t=tm")).text();
  assert.match(team, /Shifts offered to everyone/); assert.match(team, /voluntary and you may decline/);
  const taker = state.published.people.map((q) => q.name).find((n) => n !== caller && n !== state.published.assignments.find((a) => a.slot.day === 2).person) || state.published.people.map((q) => q.name).find((n) => n !== caller);
  assert.equal((await post("/team/offer?t=tm", { shift: `${caller}|0|540|1020`, name: caller })).status, 400); // not the caller
  assert.equal((await post("/team/offer?t=tm", { shift: `${caller}|0|540|1020`, name: taker })).status, 200);
  assert.deepEqual(state.callouts[0].accepts.map((a) => a.person), [taker]);
  admin = await (await call("/admin?key=adm")).text();
  assert.match(admin, new RegExp(`Give to ${taker} \\(said yes to the team offer\\)`));
  const n0 = state.changeLog.length;
  assert.equal((await post("/admin/cover?key=adm", { i: "0", name: taker })).status, 303);
  const logged = state.changeLog.slice(n0);
  assert.deepEqual(logged.map((c) => `${c.person === caller ? "caller" : "taker"} ${c.kind} ${c.cause} ${!!c.massOffer}`).sort(), ["caller cancelled team offer false", "taker added team offer true"]);
  let page = await (await call("/admin/changes?key=adm")).text();
  assert.match(page, new RegExp(`written offer to the whole team after ${caller}&#39;s absence: exempt`));
  // The on-call close: marked not needed, logged and priced; the button goes.
  admin = await (await call("/admin?key=adm")).text();
  assert.match(admin, /On-call shifts \(1 waiting\)/);
  const oc = state.published.assignments.find((a) => a.slot.day === 2);
  const key = `${WS}|${oc.person}|2|960|1320`;
  assert.equal((await post("/admin/oncall?key=adm", { key, act: "released" })).status, 303);
  assert.equal(state.onCall[key].status, "released");
  assert.equal(state.changeLog.at(-1).cause, "on-call not needed");
  page = await (await call("/admin/changes?key=adm")).text();
  assert.match(page, /On-call shift not needed: cancelled inside 14 days/);
  assert.match(await (await call("/admin?key=adm")).text(), /On-call shifts \(0 waiting\)/);
  assert.equal((await post("/admin/oncall?key=adm", { key, act: "called" })).status, 303); // already marked: refused
  assert.equal(state.onCall[key].status, "released");
});

test("the hub under Oregon: join the standby list in writing, ask it on a call-out, cover from it exempt; a team offer before asking it is priced", async () => {
  const state = emptyState();
  state.weekStart = WS;
  state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 6-23\nBen, 18, 40, 0, Mon-Sun 6-23\nCleo, 19, 40, 0, Mon-Sun 6-23\nDev, 17, 40, 0, Mon-Sun 6-23";
  state.shifts = "day, start, end, people needed, label\nMon, 9, 17, 1, open\nTue, 9, 17, 1, open";
  assert.ok(publish(state, at("2026-11-13T09:00:00Z")).ok);
  const clock = { t: at("2026-11-21T12:00:00Z") }, sent = [];
  const env = { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: "oregon", TEAM_WEBHOOK_URL: "https://hook.example/t" };
  const hub = handler(state, () => {}, env, () => clock.t, async (u, o) => { sent.push(String(o && o.body)); return new Response("ok"); });
  const call = (p) => serve(hub, new Request("https://hub.example" + p));
  const post = (p, b) => serve(hub, new Request("https://hub.example" + p, { method: "POST", body: new URLSearchParams(b) }));
  let team = await (await call("/team?t=tm")).text();
  assert.match(team, /Standby list \(voluntary\)/); assert.match(team, /do not earn predictability pay/);
  const mon = state.published.assignments.find((a) => a.slot.day === 0), tue = state.published.assignments.find((a) => a.slot.day === 1);
  const free = state.published.people.map((q) => q.name).filter((n) => n !== mon.person && n !== tue.person);
  assert.ok(free.length >= 2);
  const [sb, other] = free;
  // Joining needs the written agreement; a second join is a no-op; the record keeps it.
  assert.equal((await post("/team/standby?t=tm", { name: sb, act: "join" })).status, 400);
  assert.equal((await post("/team/standby?t=tm", { name: sb, act: "join", agree: "yes" })).status, 200);
  assert.equal((await post("/team/standby?t=tm", { name: sb, act: "join", agree: "yes" })).status, 200);
  assert.deepEqual(state.standby.map((x) => x.person), [sb]);
  assert.deepEqual(state.standbyHistory.map((h) => `${h.person} ${h.act} ${h.by}`), [`${sb} joined self`]);
  // Monday's caller: the admin page offers to ask the list (1), and says to ask it first.
  state.callouts.push({ person: mon.person, day: 0, startMin: 540, endMin: 1020, note: "" });
  let admin = await (await call("/admin?key=adm")).text();
  assert.match(admin, /Ask the standby list \(1\)<\/button>/); assert.match(admin, /ask the standby list first/);
  assert.match(admin, /Standby list \(1\)/);
  assert.equal((await post("/admin/standby-ask?key=adm", { i: "0" })).status, 303);
  assert.deepEqual(state.callouts[0].standbyAsked, [sb]);
  assert.ok(sent.some((b) => /Standby list: extra hours available Mon 09:00-17:00/.test(b)));
  team = await (await call("/team?t=tm")).text();
  assert.match(team, /Extra hours offered to the standby list/);
  // Only those asked can take it.
  assert.equal((await post("/team/standby-take?t=tm", { shift: `${mon.person}|0|540|1020`, name: other })).status, 400);
  assert.equal((await post("/team/standby-take?t=tm", { shift: `${mon.person}|0|540|1020`, name: sb })).status, 200);
  admin = await (await call("/admin?key=adm")).text();
  assert.match(admin, new RegExp(`Give to ${sb} \\(said yes from the standby list\\)`));
  let n0 = state.changeLog.length;
  assert.equal((await post("/admin/cover?key=adm", { i: "0", name: sb })).status, 303);
  const logged = state.changeLog.slice(n0);
  assert.deepEqual(logged.map((c) => `${c.person === sb ? "taker" : "caller"} ${c.kind} ${c.cause} ${!!c.standby}`).sort(), ["caller cancelled standby list false", "taker added standby list true"]);
  let page = await (await call("/admin/changes?key=adm")).text();
  assert.match(page, /voluntary standby list to cover .* and agreed: exempt/);
  // Tuesday's caller: offered to the whole team without asking the list; `other` takes it. The list's one member
  // was never asked, so Oregon prices the added shift.
  state.callouts.push({ person: tue.person, day: 1, startMin: 540, endMin: 1020, note: "" });
  assert.equal((await post("/admin/offer?key=adm", { i: "0" })).status, 303);
  const tueTaker = state.published.people.map((q) => q.name).find((n) => n !== tue.person && n !== sb);
  assert.equal((await post("/team/offer?t=tm", { shift: `${tue.person}|1|540|1020`, name: tueTaker })).status, 200);
  n0 = state.changeLog.length;
  const r = await post("/admin/cover?key=adm", { i: "0", name: tueTaker });
  assert.equal(r.status, 303);
  const added = state.changeLog.slice(n0).find((c) => c.person === tueTaker);
  assert.equal(added.massOffer, true); assert.equal(added.standbyOpen, 1);
  page = await (await call("/admin/changes?key=adm")).text();
  assert.match(page, /standby list asked first \(ORS 653\.455\(3\)\(k\)\(C\)\); 1 on it were not/);
  // Leaving, from the staff page or by the manager on request.
  assert.equal((await post("/team/standby?t=tm", { name: sb, act: "leave" })).status, 200);
  assert.deepEqual(state.standby, []);
  assert.equal((await post("/team/standby?t=tm", { name: sb, act: "join", agree: "yes" })).status, 200);
  assert.equal((await post("/admin/standby-remove?key=adm", { name: sb })).status, 303);
  assert.deepEqual(state.standbyHistory.map((h) => `${h.act} ${h.by}`), ["joined self", "left self", "joined self", "removed manager"]);
  // Under Seattle the list is off: no section, and its routes refuse.
  const sea = handler(state, () => {}, { ...env, FAIR_WORKWEEK: "seattle" }, () => clock.t, async () => new Response("ok"));
  assert.doesNotMatch(await (await serve(sea, new Request("https://hub.example/team?t=tm"))).text(), /Standby list/);
  assert.equal((await serve(sea, new Request("https://hub.example/team/standby?t=tm", { method: "POST", body: new URLSearchParams({ name: sb, act: "join", agree: "yes" }) }))).status, 404);
});

test("Philadelphia: 20 min edge changes free, half of lost hours, team offer exempt, and $40 per short rest after a prior day's shift", () => {
  const r = readNoticeEnv({ FAIR_WORKWEEK: "Philadelphia" }), wage = 18;
  assert.equal(r.name, "philadelphia");
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "philly" }).name, "philadelphia");
  // Added shift inside 14 days: 1 h; a cut 3 days out: half of 8 h (no 24 h split as in Chicago).
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "added", null, S(0, 9, 17)), r, { wage }).premium, 18);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "cancelled", S(0, 9, 17), null), r, { wage }).premium, 72);
  // Start moved 20 min later: free, the lost 20 min included; 21 min: half of 21 min.
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 20 }), r, { wage }).premium, 0);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 21 }), r, { wage: 20 }).premium, 3.5);
  // Hours taken from a written mass communication after a colleague's call-out: exempt.
  const add = ch("2026-11-22T12:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "team offer", massOffer: true, coverFor: "Ana" });
  assert.equal(priceChange(add, r, { wage }).premium, 0);
  // Rest: Sun 16-24 then Mon 08-16 is 8 h, under 9: $40 flat, no wage needed. Mon 9-13 then Mon 20-23 (same day) is not counted.
  const prev = { weekStart: "2026-11-16", assignments: [A("Ana", S(6, 16, 24))] };
  const week = { weekStart: WS, assignments: [A("Ana", S(0, 8, 16)), A("Ben", S(1, 9, 13)), A("Ben", S(1, 20, 23)), A("Cy", S(2, 14, 23)), A("Cy", S(3, 7, 12))] };
  const rests = shortRests(week, prev, r);
  assert.deepEqual(rests.map((x) => `${x.person} ${x.premium}`), ["Ana 40", "Cy 40"]);
  // Seattle counts Ben's same-day split (7 h apart) and prices hours, not a flat sum.
  assert.ok(shortRests(week, prev, FWW_PRESETS.seattle, new Map([["Ben", 20]])).some((x) => x.person === "Ben" && x.premium === 30));
});

test("Los Angeles (city): 15 min added free, half of lost hours, no team-offer exception, time and a half on the whole later shift", () => {
  const r = readNoticeEnv({ FAIR_WORKWEEK: "LA" }), wage = 20;
  assert.equal(r.name, "los-angeles");
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "los angeles" }).name, "los-angeles");
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), endMin: 17 * 60 + 15 }), r, { wage }).premium, 0);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), endMin: 17 * 60 + 16 }), r, { wage }).premium, 20);
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "cancelled", S(0, 9, 17), null), r, { wage }).premium, 80);
  const add = ch("2026-11-22T12:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "team offer", massOffer: true, coverFor: "Ana" });
  const p = priceChange(add, r, { wage });
  assert.equal(p.premium, 20); assert.match(p.why, /no team-offer exception/);
  // Sun 16-24 then Mon 08-16: 8 h rest. Seattle pays 0.5 x 2 h inside the window; the city of LA 0.5 x the whole 8 h shift.
  const prev = { weekStart: "2026-11-16", assignments: [A("Ana", S(6, 16, 24))] };
  const week = { weekStart: WS, assignments: [A("Ana", S(0, 8, 16))] };
  const wages = new Map([["Ana", 20]]);
  assert.equal(shortRests(week, prev, FWW_PRESETS.seattle, wages)[0].premium, 20);
  const la = shortRests(week, prev, r, wages)[0];
  assert.equal(la.paidH, 8); assert.equal(la.insideH, 2); assert.equal(la.premium, 80);
  // The new switches can be typed onto any preset, and flags above 1 are refused.
  const c = readNoticeEnv({ FAIR_WORKWEEK: "seattle", FWW_REST_WHOLE_SHIFT: "1", FWW_REST_FLAT: "25", FWW_REST_ACROSS_DAYS: "2" });
  assert.equal(c.restWhole, 1); assert.equal(c.restFlat, 25); assert.equal(c.restAcross, 0);
  assert.equal(shortRests(week, prev, c, wages)[0].premium, 105);
});

test("the hub's changes page states the Philadelphia and Los Angeles rest rules and prices a short rest", async () => {
  for (const [name, label, rule, cell] of [
    ["philadelphia", /Philadelphia Fair Workweek/, /a shift starting under 9 h after the end of a prior day&#39;s shift pays \$40\.00 each|a shift starting under 9 h after the end of a prior day's shift pays \$40\.00 each/, /\$40\.00/],
    ["los-angeles", /Los Angeles Fair Work Week \(city\)/, /under 10 h after the last shift pays 1\.5x for the whole later shift/, /\$80\.00/],
    ["new-york-city", /New York City Fair Workweek \(fast food\)/, /a shift starting under 11 h after the end of a prior day(&#39;|')s shift pays \$100\.00 each/, /\$100\.00/],
  ]) {
    const state = emptyState();
    state.weekStart = WS;
    state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 0-24";
    state.shifts = "day, start, end, people needed, label\nMon, 16, 24, 1, close\nTue, 8, 16, 1, open";
    assert.ok(publish(state, at("2026-11-01T09:00:00Z")).ok);
    // The builder itself avoids the close-then-open, so the manager fills Tuesday by hand.
    state.published.assignments[1].person = "Ana";
    const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: name }, () => at("2026-11-21T12:00:00Z"), null);
    const page = await (await serve(hub, new Request("https://hub.example/admin/changes?key=adm"))).text();
    assert.match(page, label, name);
    assert.match(page, rule, name);
    assert.match(page, /Short rests this week/, name);
    assert.match(page, cell, name);
  }
});

test("New York City fast food: flat premiums by tier, notice to the week's first day, rule 7-622(a)'s examples", () => {
  const r = readNoticeEnv({ FAIR_WORKWEEK: "nyc" });
  assert.equal(r.name, "new-york-city");
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "New York City" }).name, "new-york-city");
  const nyc = FWW_PRESETS["new-york-city"], thu = S(3, 9, 17);
  // Example 1: a Thursday shift cancelled on the Sunday before the Monday the schedule starts: under 24 hours, $75,
  // although the shift itself is four days off. Seattle, counting to the shift, would call it 4 days' notice.
  let p = priceChange(ch("2026-11-22T09:00:00Z", "cancelled", thu, null), nyc);
  assert.equal(p.premium, 75); assert.equal(p.noticeH, 15); assert.equal(p.hoursOfPay, null);
  assert.match(p.why, /under 24 hours' notice before the week's first day: \$75 flat/);
  assert.equal(priceChange(ch("2026-11-22T09:00:00Z", "cancelled", thu, null), FWW_PRESETS.seattle).noticeH, 96);
  // Example 2: cancelled the Monday before at 5 p.m. (151 h): $45. 8 days before: $20. 14 days or more: nothing.
  assert.equal(priceChange(ch("2026-11-16T17:00:00Z", "cancelled", thu, null), nyc).premium, 45);
  assert.equal(priceChange(ch("2026-11-15T00:00:00Z", "cancelled", thu, null), nyc).premium, 20);
  assert.equal(priceChange(ch("2026-11-09T00:00:00Z", "cancelled", thu, null), nyc).premium, 0);
  // Added or moved with no hours lost: $10, $15, $15. Hours cut on the day: $75. No wage needed for any of them.
  assert.equal(priceChange(ch("2026-11-13T00:00:00Z", "added", null, thu), nyc).premium, 10);
  assert.equal(priceChange(ch("2026-11-20T00:00:00Z", "added", null, thu), nyc).premium, 15);
  assert.equal(priceChange(ch("2026-11-23T08:00:00Z", "added", null, thu), nyc).premium, 15);
  assert.equal(priceChange(ch("2026-11-23T08:00:00Z", "moved", thu, S(3, 9, 13)), nyc).premium, 75);
  // De minimis (final rule): start and end each moved by 15 min or less owe nothing, even when both stretch the shift.
  const m = (to) => priceChange(ch("2026-11-20T00:00:00Z", "moved", thu, to), nyc);
  assert.equal(m({ ...thu, startMin: 9 * 60 - 15, endMin: 17 * 60 + 15 }).premium, 0);
  assert.equal(m({ ...thu, startMin: 9 * 60 + 15, endMin: 17 * 60 - 15 }).premium, 0);
  assert.equal(m({ ...thu, endMin: 17 * 60 + 20 }).premium, 15);
  assert.equal(m({ ...thu, endMin: 17 * 60 - 20 }).premium, 45);
  // Volunteers from a team offer still owe it (7-622(e)(6)); the employee's own request does not.
  p = priceChange(ch("2026-11-20T00:00:00Z", "added", null, thu, { massOffer: true, coverFor: "Ben" }), nyc);
  assert.equal(p.premium, 15); assert.match(p.why, /Volunteers and open-shift pick-ups still owe it/);
  assert.equal(priceChange(ch("2026-11-20T00:00:00Z", "cancelled", thu, null, { requested: true }), nyc).premium, 0);
});

test("New York City: a shift moved to another day is one $10 change (example 3), and a clopening pays $100", () => {
  const state = {};
  // Posted 14 days ahead, then on Fri 13 Nov (9.5 days before) Ana's Thursday shift is moved to Friday.
  const before = [A("Ana", S(3, 9, 17)), A("Ben", S(0, 9, 17))], after = [A("Ana", S(4, 9, 17)), A("Ben", S(0, 9, 17))];
  logChanges(state, diffAssignments(before, after), { at: at("2026-11-13T12:00:00Z"), weekStart: WS, cause: "republish" });
  assert.deepEqual(state.changeLog.map((e) => e.kind), ["cancelled", "added"]);
  const rep = noticeReport(state, FWW_PRESETS["new-york-city"], {});
  assert.equal(rep.changeTotal, 10);
  assert.match(rep.priced.find((x) => x.kind === "cancelled").why, /Moved to another day with 14 to 7 days' notice.*\$10 flat\. One change with entry #2/);
  assert.match(rep.priced.find((x) => x.kind === "added").why, /One change with entry #1/);
  // Seattle keeps pricing them as two changes in hours of pay.
  assert.equal(noticeReport(state, FWW_PRESETS.seattle, { wages: new Map([["Ana", 20]]) }).changeTotal, 100);
  // A move to a shorter shift on another day is hours taken away: $20.
  const s2 = {};
  logChanges(s2, diffAssignments(before, [A("Ana", S(4, 9, 13))]), { at: at("2026-11-13T12:00:00Z"), weekStart: WS, cause: "republish" });
  assert.equal(noticeReport(s2, FWW_PRESETS["new-york-city"], {}).priced.filter((x) => x.person === "Ana").reduce((t, x) => t + x.premium, 0), 20);
  // CSV: the flat premium with an empty hours-of-pay cell.
  assert.match(noticeCsv(rep, { ...FWW_PRESETS["new-york-city"], name: "new-york-city" }), /,Ana,cancelled,Thu 09:00-17:00,,republish,no,228,0\.00,0\.00,,10\.00,new-york-city,/);
  // Clopening: under 11 h across two calendar days pays $100 with no wage; a same-day split shift is not one.
  const week = { weekStart: WS, assignments: [A("Ana", S(0, 15, 23)), A("Ana", S(1, 9, 17)), A("Ben", S(2, 7, 11)), A("Ben", S(2, 17, 22))] };
  const rests = shortRests(week, null, FWW_PRESETS["new-york-city"]);
  assert.deepEqual(rests.map((x) => `${x.person} ${x.gapH} ${x.premium}`), ["Ana 10 100"]);
});

test("the hub's changes page states New York City's flat table", async () => {
  const state = emptyState();
  state.weekStart = WS;
  state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 0-24";
  state.shifts = "day, start, end, people needed, label\nMon, 9, 17, 1, day";
  assert.ok(publish(state, at("2026-11-01T09:00:00Z")).ok);
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: "nyc" }, () => at("2026-11-21T12:00:00Z"), null);
  const page = await (await serve(hub, new Request("https://hub.example/admin/changes?key=adm"))).text();
  assert.match(page, /counted to 12:00 a\.m\. on the week(&#39;|')s first day/);
  assert.match(page, /14 to 7 days, \$10\.00 added or moved, \$20\.00 hours taken away; 7 days to 24 h, \$15\.00 added or moved, \$45\.00 hours taken away; under 24 h, \$15\.00 added or moved, \$75\.00 hours taken away/);
  assert.match(page, /each moved by 15 min or less owe nothing/);
});
