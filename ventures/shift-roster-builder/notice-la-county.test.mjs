// Los Angeles County Fair Workweek (County Code 8.102, as amended 2025-11-18) preset, read from the county's own
// ordinance text (README "Los Angeles County"). Times are UTC; WS is a Monday, so Mon 09:00 is 2026-11-23T09:00Z.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readNoticeEnv, priceChange, shortRests } from "./notice.mjs";
import { handler, emptyState, publish } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const at = (iso) => Date.parse(iso);
const S = (day, sh, eh, label = "") => ({ day, startMin: Math.round(sh * 60), endMin: Math.round(eh * 60), label, role: "" });
const WS = "2026-11-23";
const ch = (iso, kind, from, to, extra = {}) => ({ id: 1, at: at(iso), weekStart: WS, person: "Ana", kind, from, to, cause: "republish", requested: false, ...extra });
const LAC = readNoticeEnv({ FAIR_WORKWEEK: "los-angeles-county" });
const CITY = readNoticeEnv({ FAIR_WORKWEEK: "los-angeles" });
const pay = (e, rules = LAC, wage = 20) => priceChange(e, rules, { wage });

test("the county is its own preset, apart from the City of Los Angeles", () => {
  for (const n of ["LA County", "lacounty", "county of los angeles", "los_angeles_county"]) assert.equal(readNoticeEnv({ FAIR_WORKWEEK: n }).name, "los-angeles-county", n);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "la" }).name, "los-angeles");
  assert.equal(LAC.noticeDays, 14); assert.equal(LAC.restHours, 10); assert.equal(LAC.restMult, 1.5); assert.equal(LAC.restWhole, 0);
  assert.match(readNoticeEnv({ FAIR_WORKWEEK: "pasadena" }).error, /los-angeles-county/);
});

test("8.102.080.A.2 as amended: half the time not worked, across the whole 14 days, once the cut reaches 15 minutes", () => {
  assert.equal(pay(ch("2026-11-08T09:00:00Z", "cancelled", S(0, 9, 17), null)).premium, 0); // 15 days ahead
  // Ten days ahead: no 24-hour tier, so still half of the 8 hours.
  const far = pay(ch("2026-11-13T09:00:00Z", "cancelled", S(0, 9, 17), null));
  assert.equal(far.hoursOfPay, 4); assert.equal(far.premium, 80);
  assert.equal(pay(ch("2026-11-23T05:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16))).hoursOfPay, 0.5);
  // Exactly 15 minutes cut owes; 14 does not.
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16.75))).hoursOfPay, 0.13);
  const small = pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17 - 14 / 60)));
  assert.equal(small.premium, 0); assert.match(small.why, /14 min taken away: under the 15 min/);
  // The city has no such floor: half of the 14 minutes.
  assert.ok(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17 - 14 / 60)), CITY).premium > 0);
});

test("8.102.080.A.1: 1 h for a move with no lost time or more than 15 added minutes; an added shift 1 h", () => {
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 10, 18))).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17.25))).premium, 0); // 15 min added
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17.5))).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "added", null, S(2, 9, 13))).hoursOfPay, 1);
  // A 10-minute slide loses no time, and the county text has no grace for it.
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9 + 1 / 6, 17 + 1 / 6))).hoursOfPay, 1);
});

test("8.102.080.B.2: accepted cover for an absence is exempt, one-to-one ask or team offer; the city prices it", () => {
  const ask = ch("2026-11-22T20:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "cover", coverFor: "Ana", absenceAt: at("2026-11-22T19:00:00Z") });
  const q = pay(ask);
  assert.equal(q.premium, 0); assert.match(q.why, /8\.102\.080\.B\.2/); assert.match(q.why, /voluntary/);
  assert.equal(pay({ ...ask, cause: "team offer", massOffer: true }).premium, 0);
  assert.equal(pay(ask, CITY).hoursOfPay, 1);
  // Cover that also takes hours from the coverer's own shift is not only added hours: the cut is still priced.
  assert.equal(pay({ ...ask, kind: "moved", from: S(0, 9, 17), to: S(0, 12, 16) }).hoursOfPay, 2);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "seattle" }).coverAccept, 0);
  assert.equal(pay(ask, readNoticeEnv({ FAIR_WORKWEEK: "seattle" })).hoursOfPay, 1);
  assert.equal(pay(ask, readNoticeEnv({ FAIR_WORKWEEK: "seattle", FWW_COVER_ACCEPT: "1" })).premium, 0);
});

test("on-call not called in: half the hours; the employee's own request exempt", () => {
  assert.equal(pay(ch("2026-11-23T08:00:00Z", "cancelled", S(0, 9, 13, "on-call"), null, { onCall: true })).hoursOfPay, 2);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 17), null, { requested: true })).premium, 0);
});

test("8.102.100: time and a half on the hours inside the 10 h only, not the whole shift as in the city", () => {
  const week = { weekStart: WS, assignments: [{ person: "Ana", slot: S(5, 16, 24) }, { person: "Ana", slot: S(6, 8, 16) }] };
  const w = new Map([["Ana", 20]]);
  const [c] = shortRests(week, null, LAC, w);
  assert.equal(c.insideH, 2); assert.equal(c.paidH, 2); assert.equal(c.premium, 20);
  assert.equal(shortRests(week, null, CITY, w)[0].premium, 80);
});

test("FWW_MIN_CUT_MIN types the cut floor into another rule set", () => {
  const r = readNoticeEnv({ FAIR_WORKWEEK: "custom", FWW_MIN_CUT_MIN: "30" });
  assert.equal(r.minCutMin, 30);
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16.75)), r).premium, 0);
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "custom", FWW_COVER_ACCEPT: "2" }).coverAccept, 0);
});

test("the hub's changes page names the county's rules and its unincorporated-only reach", async () => {
  const state = emptyState();
  state.weekStart = WS;
  state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 6-23";
  state.shifts = "day, start, end, people needed, label\nMon, 9, 17, 1, open";
  assert.ok(publish(state, at("2026-11-08T09:00:00Z")).ok);
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: "la-county" }, () => at("2026-11-21T09:00:00Z"), null);
  const page = await (await serve(hub, new Request("https://hub.example/admin/changes?key=adm"))).text();
  assert.match(page, /Los Angeles County Fair Workweek/);
  assert.match(page, /cuts under 15 min excepted/);
  assert.match(page, /team offer or one-to-one ask/);
  assert.match(page, /unincorporated areas only/);
});
