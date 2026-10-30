import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDesk, normalizeDesk, exampleDesk } from "./engine.mjs";
import { planAutomations, dueMessages, recordSend, isQuiet, normalizePhone, contactsOf, smsKeyword, mergeAutomationState, setOptOut, automationSettings, recentSends, wallClock } from "./automations.mjs";

const T = (iso) => Date.parse(iso); // tests run in UTC wall time
const opts = (iso, extra = {}) => ({ now: T(iso), tz: "UTC", ...extra });

// An invented desk: one family with email and mobile, one with only a mobile.
function desk(rules = {}) {
  const d = emptyDesk();
  d.profile = { ...d.profile, name: "Grace Example", automations: { confirm: true, reminder: true, thankYou: true, rebook: true, unpaid: true, birthday: true, ...rules } };
  d.families = [
    { id: "fam_a", name: "Rivera family", contactName: "Ana Rivera", contact: "ana@example.com, (555) 201-0111", kids: [{ name: "Leo", birth: "2021-11-10" }, { name: "Mia", birth: "2023-09-10" }] },
    { id: "fam_b", name: "Chen family", contactName: "David Chen", contact: "555-201-0122", kids: [{ name: "Sam", birth: "2018-01-20" }] },
  ];
  return d;
}
const rules = (msgs) => msgs.map((m) => m.rule).sort();

test("with every rule off, nothing is planned", () => {
  const d = desk({ confirm: false, reminder: false, thankYou: false, rebook: false, unpaid: false, birthday: false });
  d.bookings = [{ id: "bk_1", familyId: "fam_a", date: "2026-11-05", start: "18:00", end: "21:00", kids: 2, status: "scheduled" }];
  assert.deepEqual(planAutomations(d, opts("2026-11-04T19:00:00Z")).messages, []);
  assert.deepEqual(planAutomations(exampleDesk(), { now: T("2026-11-02T12:00:00Z"), tz: "UTC" }).messages, []);
});

test("a saved sit is confirmed once, and again only when its time changes", () => {
  const d = desk({ reminder: false });
  d.bookings = [{ id: "bk_1", familyId: "fam_a", date: "2026-11-12", start: "18:00", end: "21:00", kids: 2, status: "scheduled" }];
  let p = planAutomations(d, opts("2026-11-02T10:00:00Z"));
  assert.equal(p.messages.length, 1);
  const m = p.messages[0];
  assert.equal(m.rule, "confirm");
  assert.equal(m.channel, "email");
  assert.equal(m.to, "ana@example.com");
  assert.match(m.body, /confirming babysitting on Thu 2026-11-12, 18:00-21:00 with Leo and Mia\. Each sit is about \$69 at my rates/);
  assert.match(m.body, /Unsubscribe|unsubscribe/);
  recordSend(d, m, true, "2026-11-02T10:00:00.000Z");
  assert.equal(planAutomations(d, opts("2026-11-02T10:05:00Z")).messages.length, 0);
  d.bookings[0].start = "17:00";
  p = planAutomations(d, opts("2026-11-02T11:00:00Z"));
  assert.equal(p.messages.length, 1);
  assert.match(p.messages[0].body, /Updated details: I'm confirming babysitting on Thu 2026-11-12, 17:00-21:00/);
});

test("the reminder goes inside the 24 hours before a sit, not earlier and not after", () => {
  const d = desk({ confirm: false });
  d.bookings = [{ id: "bk_1", familyId: "fam_b", date: "2026-11-05", start: "16:00", end: "19:00", kids: 1, status: "scheduled", repeatWeeks: 3 }];
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-04T15:59:00Z")).messages), []);
  const p = planAutomations(d, opts("2026-11-04T16:00:00Z"));
  assert.deepEqual(rules(p.messages), ["reminder"]);
  assert.equal(p.messages[0].channel, "sms", "the Chen family only has a mobile, so the email preference falls back to a text");
  assert.equal(p.messages[0].to, "+15552010122");
  assert.equal(p.messages[0].body, "Hi David! It's Grace Example. Looking forward to seeing Sam tomorrow at 16:00. Anything new I should know (bedtime, allergies, plans)? Reply STOP to opt out.");
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-05T16:01:00Z")).messages), []);
  // the second week of the repeat gets its own reminder
  assert.equal(planAutomations(d, opts("2026-11-12T09:00:00Z")).messages[0].key, "reminder:bk_1#1:2026-11-12");
});

test("quiet hours run 8pm to 8am by default and wrap midnight", () => {
  for (const [hhmm, quiet] of [["19:59", false], ["20:00", true], ["23:30", true], ["03:00", true], ["07:59", true], ["08:00", false], ["12:00", false]]) {
    const [h, m] = hhmm.split(":").map(Number);
    assert.equal(isQuiet(h * 60 + m), quiet, hhmm);
  }
  assert.equal(isQuiet(13 * 60, "12:00", "14:00"), true);
  assert.equal(isQuiet(13 * 60, "09:00", "09:00"), false);
  const d = desk();
  assert.equal(planAutomations(d, opts("2026-11-02T21:00:00Z")).quiet, true);
  assert.equal(planAutomations(d, opts("2026-11-02T21:00:00Z")).quietUntil, "08:00");
  assert.equal(wallClock(T("2026-11-02T21:00:00Z"), "America/Chicago").min, 15 * 60, "quiet hours use the sitter's own time zone");
});

test("a thank-you with a testimonial ask follows the first sit with a family, once", () => {
  const d = desk({ confirm: false, reminder: false, unpaid: false });
  d.bookings = [
    { id: "bk_1", familyId: "fam_a", date: "2026-11-01", start: "18:00", end: "21:00", kids: 2, status: "done", payments: [{ amount: 69, date: "2026-11-01" }] },
    { id: "bk_2", familyId: "fam_a", date: "2026-11-20", start: "18:00", end: "21:00", kids: 2, status: "scheduled" },
  ];
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-01T22:00:00Z", {})).messages), [], "not on the day itself");
  const p = planAutomations(d, opts("2026-11-02T10:00:00Z"));
  assert.deepEqual(rules(p.messages), ["thankYou"]);
  assert.match(p.messages[0].text, /Thank you for having me over to watch Leo and Mia\. I really enjoyed it\. I've loved watching your kids, and I'm putting together a simple website/);
  d.profile.automations.testimonialLink = "https://example.com/review";
  assert.match(planAutomations(d, opts("2026-11-02T10:00:00Z")).messages[0].text, /how it went\? https:\/\/example\.com\/review I'll only put your first name and last initial/);
  const linked = dueMessages(d, { ...opts("2026-11-02T10:00:00Z"), referenceLink: (f) => `https://sitter.example/reference?f=${f.id}` });
  assert.match(linked[0].text, /reference\?f=fam_a/, "a reference flow, when the app has one, wins over the settings link");
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-16T10:00:00Z")).messages), [], "not 15 days later");
  recordSend(d, planAutomations(d, opts("2026-11-02T10:00:00Z")).messages[0], true, "2026-11-02T10:00:00.000Z");
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-03T10:00:00Z")).messages), []);
});

test("a rebook nudge goes after the quiet spell, not before, and not if the sitter already nudged", () => {
  const d = desk({ confirm: false, reminder: false, thankYou: false, unpaid: false, rebookDays: 30 });
  d.bookings = [{ id: "bk_1", familyId: "fam_b", date: "2026-09-01", start: "15:00", end: "18:00", kids: 1, status: "done", payments: [{ amount: 60, date: "2026-09-01" }] }];
  assert.deepEqual(rules(planAutomations(d, opts("2026-09-30T12:00:00Z")).messages), []);
  const p = planAutomations(d, opts("2026-10-01T12:00:00Z"));
  assert.deepEqual(rules(p.messages), ["rebook"]);
  assert.match(p.messages[0].text, /I miss your crew! I have some openings coming up if you'd like a fall date night/);
  assert.deepEqual(rules(planAutomations(d, opts("2027-01-01T12:00:00Z")).messages), [], "a family quiet for months is left to the sitter");
  d.families[1].nudged = "2026-09-20";
  assert.deepEqual(rules(planAutomations(d, opts("2026-10-01T12:00:00Z")).messages), []);
  assert.equal(automationSettings({ rebookAfterDays: 45 }).rebookDays, 45, "blank uses the profile's own setting");
});

test("unpaid reminders go at 3 and 10 days, and never step back", () => {
  const d = desk({ confirm: false, reminder: false, thankYou: false, rebook: false });
  d.bookings = [{ id: "bk_1", familyId: "fam_a", date: "2026-11-01", start: "18:00", end: "21:00", kids: 2, status: "done" }];
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-03T12:00:00Z")).messages), []);
  const p3 = planAutomations(d, opts("2026-11-04T12:00:00Z"));
  assert.equal(p3.messages[0].key, "unpaid:bk_1:2026-11-01:3");
  assert.match(p3.messages[0].text, /A friendly reminder about \$69 for babysitting on Sun 2026-11-01/);
  recordSend(d, p3.messages[0], true, "2026-11-04T12:00:00.000Z");
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-08T12:00:00Z")).messages), []);
  const p10 = planAutomations(d, opts("2026-11-11T12:00:00Z"));
  assert.equal(p10.messages[0].key, "unpaid:bk_1:2026-11-01:10");
  assert.match(p10.messages[0].text, /If it already went through, thank you/);
  recordSend(d, p10.messages[0], true, "2026-11-11T12:00:00.000Z");
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-12T12:00:00Z")).messages), []);
  assert.deepEqual(rules(planAutomations(d, opts("2026-12-15T12:00:00Z")).messages), [], "past 30 days it is the sitter's call");
  d.bookings[0].payments = [{ amount: 69, date: "2026-11-05" }];
  assert.deepEqual(rules(dueMessages(d, opts("2026-11-11T12:00:00Z"))), []);
});

test("birthday notes only for families who opted in, with the age, and Feb 29 on Feb 28", () => {
  const d = desk({ confirm: false, reminder: false, thankYou: false, rebook: false, unpaid: false });
  assert.deepEqual(rules(planAutomations(d, opts("2026-11-10T12:00:00Z")).messages), []);
  d.families[0].birthdayNotes = true;
  const p = planAutomations(d, opts("2026-11-10T12:00:00Z"));
  assert.equal(p.messages[0].text, "Hi Ana! It's Grace Example. Happy 5th birthday to Leo! I hope it's a wonderful day.");
  d.families[0].kids.push({ name: "Joy", birth: "2024-02-29" });
  assert.match(dueMessages(d, opts("2027-02-28T12:00:00Z"))[0].text, /Happy 3rd birthday to Joy/);
  assert.equal(dueMessages(d, opts("2028-02-28T12:00:00Z")).length, 0);
  assert.match(dueMessages(d, opts("2028-02-29T12:00:00Z"))[0].text, /Happy 4th birthday to Joy/);
});

test("opt-outs: a family turned off, an unsubscribed email, a STOP text", () => {
  const d = desk({ reminder: false });
  d.bookings = [{ id: "bk_1", familyId: "fam_a", date: "2026-11-12", start: "18:00", end: "21:00", kids: 2, status: "scheduled" }, { id: "bk_2", familyId: "fam_b", date: "2026-11-13", start: "18:00", end: "21:00", kids: 1, status: "scheduled" }];
  const at = opts("2026-11-02T10:00:00Z");
  assert.equal(planAutomations(d, at).messages.length, 2);
  setOptOut(d, "email", "ANA@example.com", true, "unsubscribe link", "2026-11-02T09:00:00.000Z");
  setOptOut(d, "sms", "555.201.0122", true, "text STOP", "2026-11-02T09:00:00.000Z");
  let p = planAutomations(d, at);
  assert.equal(p.messages.length, 0, "an opted-out email is not moved to texts, and STOP stops texts");
  assert.deepEqual(p.held.map((h) => h.reason), ["the family opted out", "the family opted out"]);
  setOptOut(d, "sms", "+15552010122", false, "text START", "2026-11-02T09:30:00.000Z");
  assert.equal(planAutomations(d, at).messages.length, 1);
  d.families[1].optOut = true;
  p = planAutomations(d, at);
  assert.equal(p.messages.length, 0);
  assert.match(p.held[1].reason, /turned automated messages off/);
  d.families[1].optOut = false;
  d.profile.automations.prefer = "both";
  d.automations.optOuts = {};
  assert.deepEqual(planAutomations(d, at).messages.map((m) => m.channel), ["email", "sms", "sms"]);
  assert.deepEqual(planAutomations(d, { ...at, channels: { email: true, sms: false } }).messages.map((m) => m.channel), ["email"]);
  assert.match(planAutomations(d, { ...at, channels: { email: true, sms: false } }).held[0].reason, /no matching channel/);
});

test("contacts, phone numbers and STOP words", () => {
  assert.equal(normalizePhone("(555) 201-0111"), "+15552010111");
  assert.equal(normalizePhone("1-555-201-0111"), "+15552010111");
  assert.equal(normalizePhone("+44 20 7946 0000"), "+442079460000");
  assert.equal(normalizePhone("555-0111"), "", "seven digits is not a textable number");
  assert.deepEqual(contactsOf({ contact: "Ana@Example.com / 555 201 0111" }), { email: "ana@example.com", phone: "+15552010111" });
  assert.deepEqual(contactsOf({ email: "a@b.co", phone: "5552010111", contact: "x" }), { email: "a@b.co", phone: "+15552010111" });
  assert.deepEqual(contactsOf({ contact: "555-0111" }), { email: "", phone: "" });
  for (const w of ["STOP", "stop", " Stop. ", "unsubscribe", "QUIT", "end", "opt out", "Opt-out", "revoke"]) assert.equal(smsKeyword(w), "stop", w);
  for (const w of ["START", "unstop", "yes"]) assert.equal(smsKeyword(w), "start", w);
  for (const w of ["please stop by at 5", "yes see you then", ""]) assert.equal(smsKeyword(w), "", w);
});

test("the sent log and opt-outs survive a restart and a sync from the app", () => {
  const d = desk({ reminder: false });
  d.bookings = [{ id: "bk_1", familyId: "fam_a", date: "2026-11-12", start: "18:00", end: "21:00", kids: 2, status: "scheduled" }];
  const m = planAutomations(d, opts("2026-11-02T10:00:00Z")).messages[0];
  recordSend(d, m, true, "2026-11-02T10:00:00.000Z");
  setOptOut(d, "sms", "5552010122", true, "text STOP", "2026-11-02T10:01:00.000Z");
  const restarted = normalizeDesk(JSON.parse(JSON.stringify(d)));
  assert.equal(planAutomations(restarted, opts("2026-11-02T11:00:00Z")).messages.length, 0);
  // The app's copy predates the send; the server's record wins where it is newer.
  const app = { sent: {}, log: [], optOuts: { "sms:+15552010122": { out: false, at: "2026-11-01T00:00:00.000Z" }, "email:x@y.co": { out: true, at: "2026-11-01T00:00:00.000Z" } } };
  const merged = mergeAutomationState(d.automations, app);
  assert.equal(Object.keys(merged.sent).length, 1);
  assert.equal(merged.log.length, 1);
  assert.equal(merged.optOuts["sms:+15552010122"].out, true);
  assert.equal(merged.optOuts["email:x@y.co"].out, true);
  assert.equal(recentSends(d, "2026-11-01").length, 1);
  assert.equal(recentSends(d, "2026-11-03").length, 0);
  assert.equal(d.automations.log[0].to, "an…@example.com", "the log keeps a masked address");
});
