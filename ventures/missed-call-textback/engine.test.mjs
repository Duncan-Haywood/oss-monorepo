import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, classifyKeyword, smsSegments, handleInbound, checkConfig, roi, applySent, isOpen, nextSendTime, render, DEFAULTS, isE164 } from "./engine.mjs";

const cfg = { businessName: "Acme Plumbing", timeZone: "America/Chicago" };
// 2026-11-03 (Tuesday) 15:00 UTC = 09:00 CST; hand-computed, standard time.
const TUE_9AM = Date.UTC(2026, 10, 3, 15, 0);
const TUE_11PM = Date.UTC(2026, 10, 4, 5, 0); // 23:00 CST Tuesday
const SAT_NOON = Date.UTC(2026, 10, 7, 18, 0); // 12:00 CST Saturday
const miss = { from: "+15125550142", callStatus: "no-answer" };

test("opening hours use the business time zone", () => {
  const c = { ...DEFAULTS, ...cfg };
  assert.equal(isOpen(c, TUE_9AM), true);
  assert.equal(isOpen(c, SAT_NOON), false);
  assert.equal(isOpen(c, Date.UTC(2026, 10, 3, 13, 59)), false); // 07:59 CST
});

test("a missed call in the day gets the open-hours text with the opt-out line", () => {
  const d = decide(miss, TUE_9AM, cfg);
  assert.equal(d.action, "send");
  assert.match(d.body, /^Hi, this is Acme Plumbing\./);
  assert.match(d.body, /Reply STOP to opt out\.$/);
});

test("saturday noon is after hours but inside the send window, so the after-hours text goes now", () => {
  const d = decide(miss, SAT_NOON, cfg);
  assert.equal(d.action, "send");
  assert.match(d.body, /closed right now/);
});

test("11pm is quiet: deferred to 08:00 local, not sent", () => {
  const d = decide(miss, TUE_11PM, cfg);
  assert.equal(d.action, "defer");
  assert.equal(d.sendAt, Date.UTC(2026, 10, 4, 14, 0)); // 08:00 CST Wednesday
  assert.equal(nextSendTime({ ...DEFAULTS, ...cfg }, TUE_11PM), d.sendAt);
});

test("answered calls, hidden numbers, own numbers and bad numbers are skipped", () => {
  assert.match(decide({ from: "+15125550142", callStatus: "completed" }, TUE_9AM, cfg).reason, /answered/);
  assert.match(decide({ from: "anonymous", callStatus: "no-answer" }, TUE_9AM, cfg).reason, /hid/);
  assert.match(decide({ from: "+266696687", callStatus: "no-answer" }, TUE_9AM, cfg).reason, /hid/);
  assert.match(decide({ from: "5125550142", callStatus: "no-answer" }, TUE_9AM, cfg).reason, /valid/);
  assert.match(decide(miss, TUE_9AM, { ...cfg, ownNumbers: ["+15125550142"] }).reason, /own numbers/);
  assert.match(decide({ ...miss, lineType: "landline" }, TUE_9AM, cfg).reason, /landline/);
});

test("a voicemail counts as missed even if the status says completed", () => {
  assert.equal(decide({ from: "+15125550142", callStatus: "completed", recordingUrl: "https://x/r" }, TUE_9AM, cfg).action, "send");
});

test("STOP wins over everything; cooldown stops a second text; the daily cap stops a flood", () => {
  assert.match(decide(miss, TUE_9AM, cfg, { optOut: { "+15125550142": 1 } }).reason, /STOP/);
  const s = applySent({}, "+15125550142", TUE_9AM, cfg.timeZone);
  assert.match(decide(miss, TUE_9AM + 3600000, cfg, s).reason, /Already texted/);
  assert.equal(decide(miss, TUE_9AM + 25 * 3600000, cfg, s).action, "send");
  assert.match(decide(miss, TUE_9AM, { ...cfg, dailyCap: 1 }, applySent({}, "+15125550999", TUE_9AM, cfg.timeZone)).reason, /Daily cap/);
});

test("decide never changes the state it is given", () => {
  const s = Object.freeze({ optOut: Object.freeze({}), lastText: Object.freeze({}) });
  assert.doesNotThrow(() => decide(miss, TUE_9AM, cfg, s));
});

test("carrier keywords", () => {
  for (const w of ["STOP", " stop ", "Unsubscribe", "cancel", "END", "quit", "stopall", "Stop."]) assert.equal(classifyKeyword(w), "stop", w);
  for (const w of ["start", "YES", "unstop"]) assert.equal(classifyKeyword(w), "start", w);
  for (const w of ["help", "INFO"]) assert.equal(classifyKeyword(w), "help", w);
  for (const w of ["please stop calling me", "stopping by at 5", "", null, "yes please"]) assert.equal(classifyKeyword(w), null, String(w));
});

test("inbound STOP adds to the list, START removes, other text is for a human", () => {
  const c = { ...DEFAULTS, ...cfg };
  const a = handleInbound({ from: "+15125550142", body: "STOP", now: 5 }, c, {});
  assert.equal(a.state.optOut["+15125550142"], 5);
  assert.match(a.reply, /opted out/);
  const b = handleInbound({ from: "+15125550142", body: "start" }, c, a.state);
  assert.deepEqual(b.state.optOut, {});
  const m = handleInbound({ from: "+15125550142", body: "my sink is leaking" }, c, {});
  assert.equal(m.kind, "message"); assert.equal(m.reply, null);
  assert.match(handleInbound({ from: "+1", body: "help" }, c, {}).reply, /STOP/);
});

test("segment counting: GSM-7, extended characters, UCS-2", () => {
  assert.deepEqual(smsSegments("a".repeat(160)), { encoding: "GSM-7", units: 160, segments: 1 });
  assert.equal(smsSegments("a".repeat(161)).segments, 2);
  assert.equal(smsSegments("a".repeat(306)).segments, 2);
  assert.equal(smsSegments("a".repeat(307)).segments, 3);
  assert.equal(smsSegments("€").units, 2);
  assert.deepEqual(smsSegments("a".repeat(70) + "é".repeat(0) + "’"), { encoding: "UCS-2", units: 71, segments: 2 });
  assert.equal(smsSegments("").segments, 0);
});

test("config checks catch a missing name, a bad zone, a message without the business and a long one", () => {
  assert.ok(checkConfig({ ...DEFAULTS }).some((e) => /business name/.test(e)));
  assert.ok(checkConfig({ ...DEFAULTS, businessName: "A", timeZone: "Mars/Base" }).some((e) => /time zone/.test(e)));
  assert.ok(checkConfig({ ...DEFAULTS, businessName: "A", openMessage: "Sorry we missed you." }).some((e) => /\{business\}/.test(e)));
  assert.ok(checkConfig({ ...DEFAULTS, businessName: "A", openMessage: "{business} " + "x".repeat(400) }).some((e) => /segments/.test(e)));
  assert.ok(checkConfig({ ...DEFAULTS, businessName: "A", cooldownHours: 0 }).some((e) => /cooldown/.test(e)));
  assert.deepEqual(checkConfig({ ...DEFAULTS, businessName: "Acme Plumbing" }), []);
});

test("booking link is added to the text; opt-out line is not doubled", () => {
  const c = { ...DEFAULTS, ...cfg, bookingLink: "https://acme.example/book" };
  assert.match(render(c.openMessage, c), /Book online: https:\/\/acme\.example\/book Reply STOP/);
  assert.equal((render("{business} Reply STOP to opt out.", c).match(/STOP/g) || []).length, 1);
});

test("e164", () => { assert.ok(isE164("+15125550142")); assert.ok(!isE164("15125550142")); assert.ok(!isE164("+0123")); });

test("roi: hand arithmetic", () => {
  // 10 missed a week, none called back, 30% reply, 25% of repliers book, $400 job, $30 a month.
  // replies 3/wk, jobs 0.75/wk, revenue 0.75*400*52/12 = 1300/month, net 1270.
  const r = roi({ missedPerWeek: 10, replyPct: 30, closePct: 25, jobValue: 400, monthlyCost: 30 });
  assert.equal(r.repliesPerWeek, 3); assert.equal(r.jobsPerWeek, 0.75);
  assert.ok(Math.abs(r.revenueMonth - 1300) < 1e-9); assert.ok(Math.abs(r.net - 1270) < 1e-9);
  assert.ok(Math.abs(r.breakEvenJobsPerMonth - 0.075) < 1e-9);
  assert.equal(roi({ missedPerWeek: 10, replyPct: 30, closePct: 25, jobValue: 400, monthlyCost: 30, alreadyCalledBackPct: 50 }).uncoveredPerWeek, 5);
  assert.ok(roi({ missedPerWeek: -1, replyPct: 1, closePct: 1, jobValue: 1, monthlyCost: 1 }).error);
  assert.ok(roi({ missedPerWeek: 1, replyPct: 101, closePct: 1, jobValue: 1, monthlyCost: 1 }).error);
  assert.ok(roi({ missedPerWeek: "", replyPct: 1, closePct: 1, jobValue: 1, monthlyCost: 1 }).error === undefined); // "" reads as 0, a legal value
});
