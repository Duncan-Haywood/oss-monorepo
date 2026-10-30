import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { exampleDesk, normalizeDesk } from "./engine.mjs";
import { openSlots, weekGrid, bookPage } from "./slots.mjs";
import * as W from "./waitlist.mjs";
import { handler } from "./server.mjs";

const T = "2026-11-02"; // a Monday
const AT = Date.parse("2026-11-02T15:00:00Z");
const H = 36e5;
const desk = () => exampleDesk(T);

test("joining the waitlist: validation, one entry per family per day, place in line", () => {
  const d = desk();
  assert.equal(W.joinWaitlist(d, { name: "Jo" }, { today: T }).ok, false);
  assert.match(W.joinWaitlist(d, { name: "Jo", contact: "jo@example.com", date: "2026-10-01", start: "18:00", end: "21:00" }, { today: T }).why, /passed/);
  const a = W.addToWaitlist(d, { name: "Jo Park", contact: "jo@example.com", date: "2026-11-03", start: "16:00", end: "18:00", kids: "3, 5" }, { today: T, at: AT, id: "w1" });
  assert.ok(a.ok);
  assert.deepEqual(a.entry.kids, ["3", "5"]);
  assert.match(W.joinWaitlist(d, { name: "Jo P", contact: "JO@example.com", date: "2026-11-03", start: "19:00", end: "21:00" }, { today: T }).why, /already/);
  W.addToWaitlist(d, { familyId: "fam_b", date: "2026-11-03", start: "15:30", end: "18:30" }, { today: T, at: AT + 1000, id: "w2" });
  assert.equal(W.placeInLine(d, "w1"), 1);
  assert.equal(W.placeInLine(d, "w2"), 2);
  assert.equal(W.waitlistOf(d).entries[1].name, "David Chen");
  assert.match(W.joinedMessage(a.entry, 1, d.profile), /Tue Nov 3, 4-6pm.*number 1 in line.*Grace Example/);
});

test("a cancelled sit is offered to the waitlist in order, with a deadline; no and lapse pass it on", () => {
  const d = desk();
  W.addToWaitlist(d, { name: "Jo Park", contact: "jo@example.com", date: "2026-11-10", start: "15:30", end: "18:30" }, { today: T, at: AT, id: "w1" });
  W.addToWaitlist(d, { name: "Kim Lee", contact: "kim@example.com", date: "2026-11-10", start: "16:00", end: "18:00" }, { today: T, at: AT + 1000, id: "w2" });
  W.addToWaitlist(d, { name: "Al Roe", contact: "al@example.com", date: "2026-11-11", start: "16:00", end: "18:00" }, { today: T, at: AT + 2000, id: "w3" });
  assert.equal(W.offerSlots(d, { today: T, at: AT }).length, 0, "nothing cancelled yet");
  d.bookings[3].skip = ["2026-11-10"]; // the Riveras skip one week of their repeat
  let [slot] = W.offerSlots(d, { today: T, at: AT, tz: "UTC" });
  assert.equal(slot.date, "2026-11-10");
  assert.deepEqual(slot.candidates.map((c) => c.entry.id), ["w1", "w2"], "Al asked for another day");
  assert.equal(slot.next.entry.id, "w1");
  assert.match(slot.message, /Hi Jo! Good news: a spot opened up on Tue Nov 10, 3:30-6:30pm\..*by Tue Nov 3, 3am/);
  W.offerTo(d, "w1", slot, { at: AT });
  [slot] = W.offerSlots(d, { today: T, at: AT });
  assert.equal(slot.offered.entry.id, "w1");
  assert.equal(slot.next, null, "one offer at a time");
  // Jo doesn't answer within 12 hours: it passes to Kim.
  assert.equal(W.expireHolds(d, AT + 13 * H), 1);
  [slot] = W.offerSlots(d, { today: T, at: AT + 13 * H });
  assert.equal(slot.next.entry.id, "w2");
  W.offerTo(d, "w2", slot, { at: AT + 13 * H });
  const r = W.answerOffer(d, "w2", true, { today: T, bookingId: "bk_w", newFamilyId: "fam_k" });
  assert.deepEqual([r.booking.date, r.booking.start, r.booking.end, r.booking.familyId], ["2026-11-10", "16:00", "18:00", "fam_k"]);
  assert.equal(d.families.at(-1).name, "Lee family");
  assert.equal(W.offerSlots(d, { today: T, at: AT + 13 * H }).length, 0, "the time is taken again");
});

test("default busy nights fall on the right dates", () => {
  const n = W.defaultPeakNights(2026);
  const by = Object.fromEntries(n.map((x) => [x.id, x.date]));
  assert.equal(by["mom-fri-2026"], "2026-05-08"); // Mother's Day 2026 is Sunday May 10
  assert.equal(by["mom-sat-2026"], "2026-05-09");
  assert.equal(by["vday-2026"], "2026-02-14");
  assert.equal(by["halloween-2026"], "2026-10-31");
  assert.equal(by["nye-2026"], "2026-12-31");
  assert.deepEqual(n.filter((x) => x.id.startsWith("xmas-sat")).map((x) => x.date), ["2026-12-12", "2026-12-19"]);
  assert.deepEqual(n.filter((x) => x.id.startsWith("xmas-fri")).map((x) => x.date), ["2026-12-11", "2026-12-18"]);
});

test("peak phases: told ahead, regulars only, then open to all", () => {
  const night = { id: "nye", name: "New Year's Eve", date: "2026-12-31", start: "18:00", end: "01:00" };
  const s = { ...W.WAITLIST_DEFAULTS, announceDays: 42, regularsDays: 7 };
  assert.deepEqual(W.peakPhase(night, "2026-11-01", s), { regularsFrom: "2026-11-19", openFrom: "2026-11-26", phase: "upcoming" });
  assert.equal(W.peakPhase(night, "2026-11-19", s).phase, "regulars");
  assert.equal(W.peakPhase(night, "2026-11-26", s).phase, "open");
  assert.equal(W.peakPhase(night, "2027-01-01", s).phase, "past");
});

test("priority: regulars by sits in the last 12 months (ties to the most recent), then the waitlist", () => {
  const d = desk();
  d.waitlist = { settings: { minSits: 2 } };
  d.bookings.push({ id: "bk_c2", familyId: "fam_b", date: "2026-10-30", start: "18:00", end: "21:00", status: "done" });
  d.bookings.push({ id: "bk_old", familyId: "fam_b", date: "2025-10-01", start: "18:00", end: "21:00", status: "done" }); // over a year ago
  d.bookings.push({ id: "bk_x", familyId: "fam_b", date: "2026-10-20", start: "18:00", end: "21:00", status: "cancelled" });
  const loy = W.loyalty(d, T);
  assert.equal(loy.get("fam_a").sits, 2);
  assert.equal(loy.get("fam_b").sits, 2);
  const regs = W.regulars(d, T);
  assert.deepEqual(regs.map((r) => r.familyId), ["fam_b", "fam_a"], "tie goes to the most recent sit (Oct 30 beats Oct 30 - 1)");
  W.addToWaitlist(d, { name: "Jo Park", contact: "jo@example.com", date: "2026-12-31", start: "18:00", end: "23:00" }, { today: T, at: AT, id: "w1" });
  W.addToWaitlist(d, { familyId: "fam_a", date: "2026-12-31", start: "19:00", end: "23:00" }, { today: T, at: AT + 1, id: "w2" });
  const night = W.peakOn(d, "2026-12-31", T);
  const list = W.priorityList(d, night, T);
  assert.deepEqual(list.map((r) => r.name), ["Chen family", "Rivera family", "Jo Park"], "Rivera is listed once, as a regular");
  assert.match(list[1].reason, /2 sits in the last 12 months; tied/);
  assert.match(list[2].reason, /number 1 in line/);
  const rules = W.priorityRules(d).join(" ");
  assert.match(rules, /at least 2 times in the last 12 months/);
  assert.doesNotMatch(rules, /faith|church|religio/i);
  const ann = W.announcement(d, night, T, d.families[0]);
  assert.match(ann, /^Hi Ana! New Year's Eve is Thu Dec 31.*6pm-1am.*first pick until Thu Nov 26.*holiday rate applies.*1\.5x/);
});

test("on a busy night still in its regulars window, regular families on the waitlist go first", () => {
  const d = desk();
  d.waitlist = { settings: { minSits: 2 } };
  d.bookings.push({ id: "bk_nye", familyId: "fam_b", date: "2026-12-31", start: "18:00", end: "23:00", status: "cancelled" });
  W.addToWaitlist(d, { name: "Jo Park", contact: "jo@example.com", date: "2026-12-31", start: "18:00", end: "23:00" }, { today: "2026-11-20", at: AT, id: "w1" });
  W.addToWaitlist(d, { familyId: "fam_a", date: "2026-12-31", start: "18:00", end: "23:00" }, { today: "2026-11-20", at: AT + 1, id: "w2" });
  const slot = W.offerSlots(d, { today: "2026-11-20", at: AT }).find((x) => x.date === "2026-12-31");
  assert.deepEqual(slot.candidates.map((c) => c.entry.id), ["w2", "w1"]);
  const after = W.offerSlots(d, { today: "2026-11-27", at: AT }).find((x) => x.date === "2026-12-31" && x.kind === "cancelled");
  assert.deepEqual(after.candidates.map((c) => c.entry.id), ["w1", "w2"], "once it opens to all, the line is first come");
});

test("holds: 24 or 48 hours, never on top of a sit, a request or another hold, and they lapse", () => {
  const d = desk();
  assert.equal(W.placeHold(d, { familyId: "fam_b", date: "2026-11-04", start: "16:00", end: "19:00", hours: 12 }, { at: AT, today: T }).ok, false);
  const clash = W.placeHold(d, { familyId: "fam_b", date: "2026-11-03", start: "16:00", end: "19:00", hours: 24 }, { at: AT, today: T });
  assert.equal(clash.ok, false);
  assert.match(clash.why[0], /overlaps a sit/);
  const ok = W.placeHold(d, { familyId: "fam_b", date: "2026-11-04", start: "15:00", end: "18:00", hours: 48 }, { at: AT, today: T, id: "h1" });
  assert.ok(ok.ok);
  assert.equal(ok.hold.expiresAt, "2026-11-04T15:00:00.000Z");
  assert.match(W.holdMessage(ok.hold, d.profile, "UTC"), /Hi David! I've pencilled you in for Wed Nov 4, 3-6pm\. I'll hold it for you until Wed Nov 4, 3pm/);
  const second = W.placeHold(d, { name: "Jo", date: "2026-11-04", start: "18:15", end: "21:00", hours: 24 }, { at: AT, today: T });
  assert.equal(second.ok, false);
  assert.match(second.why[0], /another hold/);
  // the hold keeps that time off the booking page and shows on the week grid
  const free = (dd, at) => openSlots(dd, { from: T, weeks: 1, at }).find((x) => x.date === "2026-11-04").windows.map((w) => `${w.start}-${w.end}`);
  assert.deepEqual(free(d, AT), ["18:30-22:00"]);
  const g = weekGrid(d, T, { today: T });
  assert.deepEqual(g.days[2].holds.map((h) => [h.kind, h.label]), [["hold", "Hold: Chen family"]]);
  // 48 hours later it has lapsed
  assert.deepEqual(free(d, AT + 49 * H), ["15:00-22:00"]);
  assert.equal(W.expireHolds(d, AT + 49 * H), 1);
  assert.equal(W.waitlistOf(d).holds[0].status, "expired");
  assert.throws(() => W.confirmHold(d, "h1", { at: AT + 49 * H, today: T }), /not active/);
});

test("confirming a hold books the sit; releasing frees the time", () => {
  const d = desk();
  W.placeHold(d, { familyId: "fam_b", date: "2026-11-05", start: "16:00", end: "19:00", hours: 24 }, { at: AT, today: T, id: "h1" });
  W.placeHold(d, { familyId: "fam_b", date: "2026-11-06", start: "16:00", end: "19:00", hours: 24 }, { at: AT, today: T, id: "h2" });
  const b = W.confirmHold(d, "h1", { at: AT + H, today: T, bookingId: "bk_h" });
  assert.equal(d.bookings.at(-1), b);
  assert.equal(b.status, "scheduled");
  W.releaseHold(d, "h2");
  assert.equal(W.activeHolds(d, AT + H).length, 0);
});

test("with peak nights on, a busy night is off /book until it opens to everyone", () => {
  const d = desk();
  const day = (from) => openSlots(d, { from, weeks: 1 }).find((x) => x.date === "2026-11-27");
  W.ensureWaitlist(d).nights = [{ id: "n1", name: "Black Friday date night", date: "2026-11-27", start: "17:00", end: "22:00" }];
  assert.ok(day("2026-11-23").windows.length, "off until the sitter turns it on");
  d.waitlist.settings.peakOn = true;
  d.waitlist.settings.announceDays = 14;
  assert.deepEqual(day("2026-11-23").windows.map((w) => `${w.start}-${w.end}`), ["15:00-22:00"], "Nov 13 + 7 days = Nov 20; on Nov 23 it is open to all");
  d.waitlist.settings.announceDays = 10; // regulars from Nov 17 to Nov 24
  assert.deepEqual(day("2026-11-23").windows, []);
  assert.deepEqual(day("2026-11-24").windows.map((w) => `${w.start}-${w.end}`), ["15:00-22:00"]);
});

test("the /book page offers the waitlist form, and it can be turned off", () => {
  const d = desk();
  const html = bookPage(d, openSlots(d, { from: T, weeks: 1 }));
  assert.match(html, /<form method="post" action="\/book\/waitlist">/);
  assert.match(html, /<input id="wd" name="date" type="date" required min="2026-11-02">/);
  W.ensureWaitlist(d).settings.publicJoin = false;
  assert.doesNotMatch(bookPage(d, openSlots(d, { from: T, weeks: 1 })), /book\/waitlist/);
});

test("sync keeps entries families added through /book and the desk keeps the waitlist", () => {
  const server = { entries: [{ id: "w_book", status: "waiting", date: "2026-11-10", created: "x" }, { id: "w_both", status: "waiting", date: "2026-11-10" }], holds: [] };
  const app = { entries: [{ id: "w_both", status: "removed", date: "2026-11-10" }], holds: [{ id: "h1", date: "2026-11-05", status: "held" }], settings: { minSits: 4 } };
  const m = W.mergeWaitlist(server, app, T);
  assert.deepEqual(m.entries.map((e) => [e.id, e.status]), [["w_both", "removed"], ["w_book", "waiting"]]);
  assert.equal(m.settings.minSits, 4);
  assert.equal(W.mergeWaitlist(server, undefined, T), server, "an older app without a waitlist leaves the server's alone");
  assert.deepEqual(normalizeDesk({ waitlist: m }).waitlist, m);
});

async function serve(state) {
  let saves = 0;
  const calls = [];
  const srv = http.createServer(handler(state, () => saves++, { TZ: "UTC", ADMIN_KEY: "k".repeat(32), NOTIFY_WEBHOOK_URL: "https://ntfy.example/x" }, () => AT, async (url, init) => { calls.push({ url, init }); return { ok: true }; }));
  await new Promise((r) => srv.listen(0, r));
  return { base: `http://127.0.0.1:${srv.address().port}`, calls, saves: () => saves, close: () => new Promise((r) => srv.close(r)) };
}
const form = (o) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o) });

test("POST /book/waitlist: a taken time joins the line, an open one goes back to the form, nobody's details leak", async () => {
  const state = { desk: desk() };
  const s = await serve(state);
  try {
    const taken = await fetch(`${s.base}/book/waitlist`, form({ name: "Jo Park", contact: "jo@example.com", date: "2026-11-03", start: "16:00", end: "18:00", familyId: "fam_a" }));
    assert.equal(taken.status, 200);
    assert.match(await taken.text(), /number 1 in line/);
    const e = W.waitlistOf(state.desk).entries[0];
    assert.deepEqual([e.name, e.source, e.familyId], ["Jo Park", "book", ""], "a public form can't claim to be a family");
    assert.equal(s.saves(), 1);
    assert.match(s.calls[0].init.body, /Waitlist: Jo Park, Tue Nov 3, 4-6pm/);
    const open = await fetch(`${s.base}/book/waitlist`, form({ name: "Kim", contact: "kim@example.com", date: "2026-11-04", start: "16:00", end: "19:00" }));
    assert.equal(open.status, 400);
    const html = await open.text();
    assert.match(html, /that time is open/);
    for (const secret of ["Rivera", "Chen", "Jo Park", "jo@example.com", "peanut"]) assert.ok(!html.includes(secret), secret);
    const bot = await fetch(`${s.base}/book/waitlist`, form({ name: "B", contact: "b@x.io", date: "2026-11-03", start: "16:00", end: "18:00", website: "spam" }));
    assert.equal(bot.status, 200);
    assert.equal(W.waitlistOf(state.desk).entries.length, 1);
    assert.equal((await fetch(`${s.base}/book/waitlist`, { redirect: "manual" })).status, 303);
  } finally { await s.close(); }
});

test("the server expires lapsed holds and keeps /book entries through a sync", async () => {
  const state = { desk: desk() };
  W.placeHold(state.desk, { familyId: "fam_b", date: "2026-11-04", start: "16:00", end: "19:00", hours: 24 }, { at: AT - 25 * H, today: "2026-11-01" });
  W.addToWaitlist(state.desk, { name: "Jo Park", contact: "jo@example.com", date: "2026-11-03", start: "16:00", end: "18:00" }, { today: T, at: AT, id: "w_book", source: "book" });
  const s = await serve(state);
  try {
    await fetch(`${s.base}/book`);
    assert.equal(W.waitlistOf(state.desk).holds[0].status, "expired");
    const app = { ...desk(), waitlist: { entries: [], holds: [], settings: { minSits: 2 } } };
    const r = await fetch(`${s.base}/api/desk`, { method: "PUT", headers: { authorization: `Bearer ${"k".repeat(32)}`, "content-type": "application/json" }, body: JSON.stringify(app) });
    const out = await r.json();
    assert.deepEqual(out.desk.waitlist.entries.map((e) => e.id), ["w_book"]);
    assert.equal(out.desk.waitlist.settings.minSits, 2);
  } finally { await s.close(); }
});
