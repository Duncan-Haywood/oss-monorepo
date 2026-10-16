import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { newState, saveEvent, slotsFor } from "./book.mjs";
import { zonedToUtc, parseIcsBusy } from "./slot.mjs";

const KEY = "k".repeat(16), NY = "America/New_York", NOW = zonedToUtc(2026, 10, 14, 8, 0, NY);
async function boot(over = {}) {
  const state = newState();
  saveEvent(state, { name: "Intro call", minutes: 30, tz: NY, hours: "mon-fri 09:00-12:00", noticeMin: 0, horizonDays: 14, location: "https://meet.example/x", ...over.ev });
  const sent = [], pings = [];
  const cfg = { state, save() {}, adminKey: KEY, company: "Acme <b>", sponsor: true, now: () => NOW, notify: (m) => pings.push(m), dryRun: false, sendEmail: async (m) => { sent.push(m); }, hostEmail: "host@acme.test", ...over.cfg };
  const server = http.createServer(handler(cfg)); await new Promise((r) => server.listen(0, r));
  return { base: `http://127.0.0.1:${server.address().port}`, state, sent, pings, cfg, close: () => server.close() };
}
const auth = { authorization: `Bearer ${KEY}` };
const form = (url, body, headers = {}) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body).toString() });
const first = (s, n = 0) => slotsFor(s.state, s.state.events["intro-call"], NOW)[n];
const bookIt = (s, start, extra = {}) => form(`${s.base}/b/intro-call/book`, { name: "Ann", email: "ann@x.test", start, tz: "Europe/London", ...extra });

test("a visitor sees open times in their zone, books one and gets an invite", async () => {
  const s = await boot();
  const page = await (await fetch(`${s.base}/b/intro-call?tz=Europe/London`)).text();
  assert.match(page, /2:00 PM/); assert.match(page, /Acme &lt;b&gt;/); assert.doesNotMatch(page, /Acme <b>/);
  const t = first(s);
  assert.match(await (await fetch(`${s.base}/b/intro-call/confirm?start=${t}&tz=Europe/London`)).text(), /Confirm booking/);
  const r = await bookIt(s, t);
  assert.equal(r.status, 303);
  const loc = r.headers.get("location"); assert.match(loc, /^\/c\/\w{20,}$/);
  assert.equal(s.sent.length, 2);
  assert.equal(s.sent[0].to, "ann@x.test"); assert.match(s.sent[0].text, /Europe\/London/); assert.match(s.sent[0].ics, /METHOD:REQUEST/);
  assert.equal(s.sent[1].to, "host@acme.test"); assert.equal(s.sent[1].replyTo, "ann@x.test");
  assert.equal(s.pings.length, 1);
  const mine = await (await fetch(`${s.base}${loc}`)).text();
  assert.match(mine, /You&#39;re booked|You're booked/); assert.match(mine, /Cancel this booking/);
  const ics = await fetch(`${s.base}${loc}.ics`); assert.match(ics.headers.get("content-type"), /text\/calendar/);
  s.close();
});

test("the second person to pick a taken time is told so, and nothing is emailed", async () => {
  const s = await boot(); const t = first(s);
  await bookIt(s, t); s.sent.length = 0;
  const r = await bookIt(s, t, { email: "bob@x.test", name: "Bob" });
  assert.equal(r.status, 409); assert.equal(s.sent.length, 0);
  const c = await fetch(`${s.base}/b/intro-call/confirm?start=${t}&tz=UTC`, { redirect: "manual" });
  assert.equal(c.status, 303, "a stale confirm link goes back to the picker");
  s.close();
});

test("the honeypot books nothing and says nothing", async () => {
  const s = await boot();
  const r = await bookIt(s, first(s), { _gotcha: "x" });
  assert.equal(r.status, 200); assert.equal(Object.keys(s.state.bookings).length, 0);
  s.close();
});

test("invitees can cancel and reschedule with their private link only", async () => {
  const s = await boot(); const t = first(s);
  const loc = (await bookIt(s, t)).headers.get("location"); const token = loc.slice(3);
  assert.equal((await fetch(`${s.base}/c/${"x".repeat(22)}`)).status, 404);
  s.sent.length = 0;
  const re = await bookIt(s, first(s, 3), { reschedule: token });
  assert.equal(re.status, 303);
  assert.equal(Object.values(s.state.bookings).filter((b) => b.status === "confirmed").length, 1);
  assert.ok(s.sent.some((m) => /CANCEL/.test(m.ics || "")), "old time is cancelled in their calendar");
  const newLoc = re.headers.get("location");
  assert.match(await (await fetch(`${s.base}/b/intro-call?reschedule=${newLoc.slice(3)}`)).text(), /Pick a new time/);
  s.sent.length = 0;
  const c = await form(`${s.base}${newLoc}/cancel`, {});
  assert.equal(c.status, 200); assert.ok(s.sent.length >= 1);
  assert.match(await (await fetch(`${s.base}${newLoc}`)).text(), /Booking cancelled/);
  assert.ok(slotsFor(s.state, s.state.events["intro-call"], NOW).includes(first(s, 0)));
  s.close();
});

test("the JSON slots endpoint is public, CORS-open and matches the page", async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/api/intro-call/slots?tz=Asia/Tokyo`);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  const j = await r.json(); assert.equal(j.tz, "Asia/Tokyo"); assert.equal(j.slots[0].startMs, first(s));
  assert.equal((await fetch(`${s.base}/api/nope/slots`)).status, 404);
  s.close();
});

test("a busy calendar feed removes slots from page, API and booking", async () => {
  const t = zonedToUtc(2026, 10, 14, 9, 0, NY);
  const s = await boot({ cfg: { external: () => [{ start: t, end: t + 3_600_000 }] } });
  assert.ok(!(await (await fetch(`${s.base}/api/intro-call/slots`)).json()).slots.some((x) => x.startMs === t));
  assert.equal((await bookIt(s, t)).status, 409);
  s.close();
});

test("the admin needs the key; a cross-site post is refused; the page escapes names", async () => {
  const s = await boot(); const t = first(s);
  await bookIt(s, t, { name: "<script>alert(1)</script>", notes: "<img src=x onerror=1>" });
  assert.equal((await fetch(`${s.base}/admin`)).status, 401);
  assert.equal((await fetch(`${s.base}/admin`, { headers: { authorization: "Bearer wrong-wrong-wrong" } })).status, 401);
  const html = await (await fetch(`${s.base}/admin`, { headers: auth })).text();
  assert.doesNotMatch(html, /<script>alert/); assert.doesNotMatch(html, /<img src=x/); assert.match(html, /&lt;script&gt;/);
  const basic = { authorization: `Basic ${Buffer.from(`me:${KEY}`).toString("base64")}` };
  assert.equal((await fetch(`${s.base}/admin`, { headers: basic })).status, 200);
  assert.equal((await form(`${s.base}/admin/b/b1/cancel`, {}, { ...basic, origin: "https://evil.example" })).status, 403);
  assert.equal((await form(`${s.base}/admin/b/b1/cancel`, {}, { ...basic, origin: s.base })).status, 303);
  assert.equal(s.state.bookings.b1.status, "cancelled"); assert.equal(s.state.bookings.b1.cancelledBy, "host");
  s.close();
});

test("the admin can create, edit, reject and delete event types, and export CSV", async () => {
  const s = await boot();
  const bad = await form(`${s.base}/admin/events`, { name: "Bad", tz: "Nowhere/City", hours: "mon 09:00-10:00" }, auth);
  assert.equal(bad.status, 400); assert.match(await bad.text(), /unknown time zone/);
  const ok = await form(`${s.base}/admin/events`, { name: "Deep dive", minutes: "60", tz: "Europe/Berlin", hours: "tue 10:00-16:00" }, auth);
  assert.equal(ok.status, 303); assert.equal(s.state.events["deep-dive"].minutes, 60);
  assert.match(await (await fetch(`${s.base}/admin/event/deep-dive`, { headers: auth })).text(), /tue 10:00-16:00/);
  await bookIt(s, first(s));
  const csv = await (await fetch(`${s.base}/admin/export.csv`, { headers: auth })).text();
  assert.match(csv, /^id,event,start_utc/); assert.match(csv, /ann@x\.test/);
  assert.equal((await form(`${s.base}/admin/events/deep-dive/delete`, {}, auth)).status, 303);
  assert.equal(s.state.events["deep-dive"], undefined);
  s.close();
});

test("the calendar feed needs its secret and lists only live bookings", async () => {
  const s = await boot(); await bookIt(s, first(s)); await bookIt(s, first(s, 1), { email: "z@x.test" }); s.state.bookings.b2.status = "cancelled";
  assert.equal((await fetch(`${s.base}/feed/${"a".repeat(24)}.ics`)).status, 404);
  const body = await (await fetch(`${s.base}/feed/${s.state.feedToken}.ics`)).text();
  assert.match(body, /^BEGIN:VCALENDAR\r\nVERSION:2\.0/); assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 1); assert.doesNotMatch(body, /METHOD:/);
  assert.equal(parseIcsBusy(body, NOW, NOW + 30 * 86_400_000, NY).length, 1);
  s.close();
});

test("security headers: no embedding unless allowed, no scripts ever", async () => {
  const s = await boot({ cfg: { embedOrigins: ["https://site.example"] } });
  const csp = (await fetch(`${s.base}/b/intro-call`)).headers.get("content-security-policy");
  assert.match(csp, /frame-ancestors https:\/\/site\.example/); assert.match(csp, /default-src 'none'/); assert.doesNotMatch(csp, /script-src/);
  assert.match((await fetch(`${s.base}/admin`, { headers: auth })).headers.get("content-security-policy"), /frame-ancestors 'none'/);
  s.close();
});

test("booking attempts are rate limited per address", async () => {
  const s = await boot({ cfg: { limits: { book: (() => { let n = 0; return () => ++n <= 2; })() } } });
  const t = first(s);
  await bookIt(s, t); await bookIt(s, t); assert.equal((await bookIt(s, t)).status, 429);
  s.close();
});
