// Evanston Fair Workweek (Ordinance 24-O-23, City Code 3-34) preset, from search summaries of the city's page and
// law-firm alerts; the primary text was out of reach (README "Evanston"). Times are UTC; WS is a Monday, so Mon 09:00
// is 2026-11-23T09:00Z.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readNoticeEnv, priceChange, shortRests, diffAssignments, logChanges, noticeReport } from "./notice.mjs";
import { handler, emptyState, publish } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const at = (iso) => Date.parse(iso);
const S = (day, sh, eh, label = "") => ({ day, startMin: Math.round(sh * 60), endMin: Math.round(eh * 60), label, role: "" });
const WS = "2026-11-23";
const ch = (iso, kind, from, to, extra = {}) => ({ id: 1, at: at(iso), weekStart: WS, person: "Ana", kind, from, to, cause: "republish", requested: false, ...extra });
const EV = readNoticeEnv({ FAIR_WORKWEEK: "evanston" });
const pay = (e, rules = EV, wage = 20) => priceChange(e, rules, { wage });

test("Evanston is read by name and alias, with 14 days and an 11 h rest at time and a half", () => {
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "Evanston IL" }).name, "evanston");
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "city of evanston" }).name, "evanston");
  assert.equal(EV.noticeDays, 14); assert.equal(EV.restHours, 11); assert.equal(EV.restMult, 1.5);
  assert.match(readNoticeEnv({ FAIR_WORKWEEK: "skokie" }).error, /berkeley, evanston or custom/);
});

test("under 14 days and more than 24 h, 1 h per changed shift, whatever the change", () => {
  assert.equal(pay(ch("2026-11-08T09:00:00Z", "cancelled", S(0, 9, 17), null)).premium, 0); // 15 days
  assert.equal(pay(ch("2026-11-13T09:00:00Z", "cancelled", S(0, 9, 17), null)).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-13T09:00:00Z", "added", null, S(0, 9, 17))).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16.75))).hoursOfPay, 1);
});

test("under 24 h, a cut pays the lesser of the scheduled shift's hours and 4 h, not the hours taken away", () => {
  // An hour off an 8-hour shift the evening before: 4 h (Berkeley's reading would give 1 h).
  const q = pay(ch("2026-11-23T05:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16)));
  assert.equal(q.hoursOfPay, 4); assert.equal(q.premium, 80);
  assert.equal(pay(ch("2026-11-23T05:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16)), readNoticeEnv({ FAIR_WORKWEEK: "berkeley" })).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 12), null)).hoursOfPay, 3); // 3 h shift
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 17), null)).hoursOfPay, 4);
});

test("under 24 h, an added shift or added hours owe 1 h; no de minimis grace", () => {
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "added", null, S(0, 9, 17))).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 19))).hoursOfPay, 1);
  // Five minutes added at the end still owes the hour (Emeryville and Berkeley let 10 minutes go).
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17 + 5 / 60))).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17 + 5 / 60)), readNoticeEnv({ FAIR_WORKWEEK: "emeryville" })).premium, 0);
});

test("employee-requested changes are exempt; a volunteer from a team offer is not", () => {
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "added", null, S(0, 9, 17), { cause: "trade", requested: true })).premium, 0);
  const offer = pay(ch("2026-11-21T09:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "team offer", massOffer: true, coverFor: "Ana" }));
  assert.equal(offer.hoursOfPay, 1); assert.match(offer.why, /no team-offer exception/);
});

test("a shift moved to another date stays two changes unless FWW_PAIR_DATES=1", () => {
  const d = diffAssignments([{ person: "Ana", slot: S(3, 9, 17) }], [{ person: "Ana", slot: S(4, 9, 17) }]);
  const st = { changeLog: [] };
  logChanges(st, d, { at: at("2026-11-20T09:00:00Z"), weekStart: WS, cause: "republish" });
  const w = new Map([["Ana", 20]]);
  assert.equal(noticeReport(st, EV, { wages: w }).changeTotal, 40);
  assert.equal(noticeReport(st, readNoticeEnv({ FAIR_WORKWEEK: "evanston", FWW_PAIR_DATES: "1" }), { wages: w }).changeTotal, 20);
});

test("rest: close at midnight, open at 8 is 3 h at time and a half, after any previous shift", () => {
  const week = { weekStart: WS, assignments: [{ person: "Ana", slot: S(5, 16, 24) }, { person: "Ana", slot: S(6, 8, 16) }, { person: "Ben", slot: S(2, 6, 10) }, { person: "Ben", slot: S(2, 14, 20) }] };
  const r = shortRests(week, null, EV, new Map([["Ana", 20], ["Ben", 20]]));
  const ana = r.find((x) => x.person === "Ana");
  assert.equal(ana.gapH, 8); assert.equal(ana.insideH, 3); assert.equal(ana.premium, 30);
  assert.ok(r.find((x) => x.person === "Ben"));
  assert.equal(shortRests(week, null, readNoticeEnv({ FAIR_WORKWEEK: "evanston", FWW_REST_ACROSS_DAYS: "1" }), new Map()).length, 1);
});

test("the hub's changes page names Evanston's rules and says where they came from", async () => {
  const state = emptyState();
  state.weekStart = WS;
  state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 6-23";
  state.shifts = "day, start, end, people needed, label\nMon, 9, 17, 1, open";
  assert.ok(publish(state, at("2026-11-08T09:00:00Z")).ok);
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: "evanston" }, () => at("2026-11-21T09:00:00Z"), null);
  const page = await (await serve(hub, new Request("https://hub.example/admin/changes?key=adm"))).text();
  assert.match(page, /Evanston Fair Workweek/);
  assert.match(page, /hours taken away the lesser of the shift's hours and 4 h/);
  assert.match(page, /1\.5x/);
  assert.match(page, /Evanston's come from search summaries/);
});
