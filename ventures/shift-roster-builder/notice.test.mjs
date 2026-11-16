import { test } from "node:test";
import assert from "node:assert/strict";
import { readNoticeEnv, diffAssignments, logChanges, priceChange, latePosting, shortRests, noticeReport, noticeCsv, slotInstant, teamOfferText, onCallShifts, onCallNeverCalled, isOnCall, FWW_PRESETS } from "./notice.mjs";
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
  assert.match(readNoticeEnv({ FAIR_WORKWEEK: "nyc" }).error, /not one of/);
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
  // A start moved 20 min later with no lost time... loses 20 min: half of 1/3 h.
  assert.equal(priceChange(ch("2026-11-20T15:00:00Z", "moved", S(0, 9, 17), { ...S(0, 9, 17), startMin: 9 * 60 + 20 }), r, { wage }).premium, 2.5);
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
