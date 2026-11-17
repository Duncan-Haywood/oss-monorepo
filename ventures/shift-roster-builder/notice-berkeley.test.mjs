// Berkeley Fair Workweek (BMC 13.102, operational 2024-01-12) preset, from the city's official notice (January 2024)
// and its FAQ revised 2024-08-23 (berkeleyca.gov). README "Berkeley". Times are UTC; WS is a Monday, so Mon 09:00 is
// 2026-11-23T09:00Z.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readNoticeEnv, priceChange, shortRests, diffAssignments, logChanges, noticeReport } from "./notice.mjs";
import { handler, emptyState, publish } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const at = (iso) => Date.parse(iso);
const S = (day, sh, eh, label = "") => ({ day, startMin: Math.round(sh * 60), endMin: Math.round(eh * 60), label, role: "" });
const WS = "2026-11-23";
const ch = (iso, kind, from, to, extra = {}) => ({ id: 1, at: at(iso), weekStart: WS, person: "Ana", kind, from, to, cause: "republish", requested: false, ...extra });
const BK = readNoticeEnv({ FAIR_WORKWEEK: "berkeley" });
const pay = (e, rules = BK, wage = 20) => priceChange(e, rules, { wage });

test("Berkeley is read by name and alias, with 14 days and an 11 h rest", () => {
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "Berkeley CA" }).name, "berkeley");
  assert.equal(readNoticeEnv({ FAIR_WORKWEEK: "berkeley-ca" }).name, "berkeley");
  assert.equal(BK.noticeDays, 14); assert.equal(BK.restHours, 11); assert.equal(BK.restMult, 1.5);
  assert.match(readNoticeEnv({ FAIR_WORKWEEK: "oakland" }).error, /emeryville, berkeley or custom/);
});

test("FAQ 12a: under 14 days and 24 h or more, 1 h for any change", () => {
  assert.equal(pay(ch("2026-11-08T09:00:00Z", "cancelled", S(0, 9, 17), null)).premium, 0); // 15 days
  assert.equal(pay(ch("2026-11-13T09:00:00Z", "cancelled", S(0, 9, 17), null)).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-13T09:00:00Z", "added", null, S(0, 9, 17))).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-13T09:00:00Z", "moved", S(0, 9, 17), S(0, 11, 19))).hoursOfPay, 1);
  // 15 minutes cut with two days' notice: still the 1 h ("no matter what kind of schedule change it is").
  assert.equal(pay(ch("2026-11-21T09:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16.75))).hoursOfPay, 1);
});

test("FAQ 12b and 14: under 24 h, a cut pays the lesser of the hours taken away and 4 h", () => {
  // FAQ 14: cut 15 minutes early owes 0.25 h, not 1 h and not the shift's hours (Emeryville's rule).
  const q = pay(ch("2026-11-23T05:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16.75)));
  assert.equal(q.hoursOfPay, 0.25); assert.equal(q.premium, 5);
  assert.match(q.why, /lesser of the 0\.25 h taken away and 4 h, 0\.25 h of pay/);
  assert.equal(pay(ch("2026-11-23T05:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16)), readNoticeEnv({ FAIR_WORKWEEK: "emeryville" })).hoursOfPay, 4);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 12), null)).hoursOfPay, 3);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "cancelled", S(0, 9, 17), null)).hoursOfPay, 4);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 11, 17))).hoursOfPay, 2); // started 2 h late
});

test("FAQ 12c: under 24 h, an added shift, added hours or a move owe 1 h; a move that also cuts owes the more", () => {
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "added", null, S(0, 9, 17))).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 19))).hoursOfPay, 1);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 10, 18))).hoursOfPay, 1);
  // Moved an hour later and 30 minutes shorter: the move's 1 h beats 0.5 h cut.
  const m = pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 10, 17.5)));
  assert.equal(m.hoursOfPay, 1); assert.match(m.why, /^Moved and shortened/);
  // Moved 3 h later and 2.5 h shorter: the cut's 2.5 h.
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 12, 17.5))).hoursOfPay, 2.5);
});

test("FAQ 17: up to 10 minutes early and 10 minutes late is free, each end on its own", () => {
  const both = pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9 - 1 / 6, 17 + 1 / 6)));
  assert.equal(both.premium, 0); assert.match(both.why, /10 min added at the start and 10 at the end/);
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17.25))).hoursOfPay, 1);
  // The grace is for starting early and finishing late, not for cuts: 10 minutes off the end under 24 h is 1/6 h.
  assert.equal(pay(ch("2026-11-23T05:00:00Z", "moved", S(0, 9, 17), S(0, 9, 17 - 1 / 6))).hoursOfPay, 0.17);
});

test("a shift moved to another date is one change, 1 h, not a cancellation plus an addition", () => {
  const before = [{ person: "Ana", slot: S(3, 9, 17) }], after = [{ person: "Ana", slot: S(4, 9, 17) }];
  const d = diffAssignments(before, after);
  assert.deepEqual(d.map((x) => x.kind).sort(), ["added", "cancelled"]);
  const st = { changeLog: [] };
  logChanges(st, d, { at: at("2026-11-20T09:00:00Z"), weekStart: WS, cause: "republish" });
  const rep = noticeReport(st, BK, { wages: new Map([["Ana", 20]]) });
  assert.equal(rep.changeTotal, 20); // 1 h at $20
  assert.ok(rep.priced.some((p) => /One change with entry/.test(p.why)));
  // Without a wage in the staff list the pair is still one change: 1 h of pay to price, not 2.
  const bare = noticeReport(st, BK, { wages: new Map() });
  assert.equal(bare.priced.reduce((t, p) => t + (p.hoursOfPay || 0), 0), 1);
  assert.equal(bare.unpriced, 1);
  // Emeryville keeps its own reading (no pairing): 1 h + 1 h.
  assert.equal(noticeReport(st, readNoticeEnv({ FAIR_WORKWEEK: "emeryville" }), { wages: new Map([["Ana", 20]]) }).changeTotal, 40);
});

test("employee-arranged swaps are exempt; a volunteer from a team offer is not", () => {
  assert.equal(pay(ch("2026-11-22T23:00:00Z", "added", null, S(0, 9, 17), { cause: "trade", requested: true })).premium, 0);
  const offer = pay(ch("2026-11-21T09:00:00Z", "added", null, S(0, 9, 17), { person: "Ben", cause: "team offer", massOffer: true, coverFor: "Ana" }));
  assert.equal(offer.hoursOfPay, 1); assert.match(offer.why, /no team-offer exception/);
});

test("FAQ 23: close at midnight, open at 8: 3 h at time and a half; a short same-day gap counts too", () => {
  const week = { weekStart: WS, assignments: [{ person: "Ana", slot: S(5, 16, 24) }, { person: "Ana", slot: S(6, 8, 16) }, { person: "Ben", slot: S(2, 6, 10) }, { person: "Ben", slot: S(2, 14, 20) }] };
  const r = shortRests(week, null, BK, new Map([["Ana", 20], ["Ben", 20]]));
  const ana = r.find((x) => x.person === "Ana");
  assert.equal(ana.gapH, 8); assert.equal(ana.insideH, 3); assert.equal(ana.premium, 30);
  const ben = r.find((x) => x.person === "Ben");
  assert.equal(ben.gapH, 4); assert.equal(ben.insideH, 6); // the whole 6 h second piece is inside 11 h
  // FWW_REST_ACROSS_DAYS=1 reads "shift" as the day's shift and drops the split.
  assert.equal(shortRests(week, null, readNoticeEnv({ FAIR_WORKWEEK: "berkeley", FWW_REST_ACROSS_DAYS: "1" }), new Map()).length, 1);
});

test("the hub's changes page names Berkeley's rules and its sources", async () => {
  const state = emptyState();
  state.weekStart = WS;
  state.staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon-Sun 6-23";
  state.shifts = "day, start, end, people needed, label\nMon, 9, 17, 1, open";
  assert.ok(publish(state, at("2026-11-08T09:00:00Z")).ok);
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", FAIR_WORKWEEK: "berkeley" }, () => at("2026-11-21T09:00:00Z"), null);
  const page = await (await serve(hub, new Request("https://hub.example/admin/changes?key=adm"))).text();
  assert.match(page, /Berkeley Fair Workweek/);
  assert.match(page, /hours taken away the lesser of the hours taken away and 4 h/);
  assert.match(page, /up to 10 min added at the start and again at the end owes nothing/);
  assert.match(page, /a shift moved to another day is one change/);
  assert.match(page, /FAQ of 2024-08-23/);
});
