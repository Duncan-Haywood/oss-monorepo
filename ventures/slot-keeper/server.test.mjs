import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, isPrivate, safeFeedUrl, feedLoader } from "./server.mjs";
import { newState, updateSettings, upsertType } from "./book.mjs";

const KEY = "k".repeat(16);
const NOW = Date.UTC(2026, 9, 19, 12, 0);
async function boot(over = {}) {
  const state = newState();
  updateSettings(state, { tz: "America/New_York", name: "Ann <b>Coaching</b>", weekly: "weekdays 09:00-17:00", hostEmail: "ann@host.test" });
  upsertType(state, { name: "Intro call", minutes: 30, notice: 60, location: "https://meet.example/ann" });
  let t = NOW; const sent = [], pings = [];
  const cfg = { state, save() {}, adminKey: KEY, sponsor: true, now: () => t, notify: (m) => pings.push(m), dryRun: false, sendEmail: async (m) => { sent.push(m); }, ...over };
  const server = http.createServer(handler(cfg)); await new Promise((r) => server.listen(0, r));
  return { base: `http://127.0.0.1:${server.address().port}`, state, sent, pings, cfg, clock: (n) => { t = n; }, close: () => server.close() };
}
const auth = { authorization: `Bearer ${KEY}` };
const form = (url, body, headers = {}) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body).toString() });
const START = Date.UTC(2026, 9, 19, 13, 0);

test("the public page lists times in the visitor's zone and escapes the host's name", async () => {
  const s = await boot();
  const home = await (await fetch(`${s.base}/`)).text();
  assert.match(home, /Ann &lt;b&gt;Coaching&lt;\/b&gt;/); assert.doesNotMatch(home, /<b>Coaching/);
  const r = await fetch(`${s.base}/e/intro-call?tz=Asia/Tokyo`); const html = await r.text();
  assert.equal(r.status, 200); assert.match(html, /Mon, Oct 19/); assert.match(html, />22:00</, "13:00Z is 22:00 in Tokyo");
  assert.match(r.headers.get("content-security-policy"), /script-src 'nonce-[\w-]+'/); assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const bad = await (await fetch(`${s.base}/e/intro-call?tz=Mars/Base`)).text(); assert.match(bad, />09:00</, "an unknown zone falls back to the host's");
  assert.equal((await fetch(`${s.base}/e/nope`)).status, 404);
  s.close();
});

test("the JSON API returns ISO times for custom front ends", async () => {
  const s = await boot();
  const j = await (await fetch(`${s.base}/api/slots/intro-call?from=2026-10-19&days=1&tz=America/New_York`)).json();
  assert.equal(j.slots[0].iso, "2026-10-19T13:00:00.000Z"); assert.equal(j.minutes, 30);
  s.close();
});

test("booking end to end: confirm, emails, calendar file, move, cancel", async () => {
  const s = await boot();
  const pick = await fetch(`${s.base}/e/intro-call/at/${START}?tz=Europe/Berlin`); assert.equal(pick.status, 200);
  assert.match(await pick.text(), /name="start" value="\d+"/);
  const r = await form(`${s.base}/e/intro-call/book`, { start: START, tz: "Europe/Berlin", name: "Bo", email: "bo@x.com", notes: "hello" });
  assert.equal(r.status, 303); const link = r.headers.get("location"); assert.match(link, /^\/b\/[0-9a-f]{32}$/);
  assert.equal(s.sent.length, 2); const [toInvitee, toHost] = s.sent;
  assert.equal(toInvitee.to, "bo@x.com"); assert.match(toInvitee.text, /3:00 PM/); assert.match(toInvitee.text, /meet\.example/); assert.match(toInvitee.text, /\.ics/);
  assert.equal(toHost.to, "ann@host.test"); assert.match(toHost.text, /hello/); assert.equal(s.pings.length, 1);
  const page = await (await fetch(`${s.base}${link}`)).text(); assert.match(page, /You're booked/); assert.match(page, /Cancel this booking/);
  const ics = await fetch(`${s.base}${link}.ics`); assert.match(ics.headers.get("content-type"), /text\/calendar/);
  const body = await ics.text(); assert.match(body, /DTSTART:20261019T130000Z/); assert.match(body, /ORGANIZER/);
  assert.equal((await form(`${s.base}/e/intro-call/book`, { start: START, name: "Cy", email: "cy@x.com" })).status, 409, "same time, second visitor");
  assert.equal((await fetch(`${s.base}${link}/reschedule?tz=UTC`)).status, 200);
  const mv = await fetch(`${s.base}${link}/reschedule/at/${START + 3_600_000}`); assert.match(await mv.text(), /Confirm new time/);
  assert.equal((await form(`${s.base}${link}/reschedule`, { start: START + 3_600_000 })).status, 303);
  assert.equal(Object.values(s.state.bookings)[0].start, START + 3_600_000); assert.equal(s.sent.length, 4);
  assert.equal((await form(`${s.base}${link}/cancel`, { reason: "busy" })).status, 303);
  assert.equal(Object.values(s.state.bookings)[0].status, "cancelled"); assert.equal(s.sent.length, 6);
  assert.match(await (await fetch(`${s.base}${link}`)).text(), /Booking cancelled/);
  const free = await (await fetch(`${s.base}/api/slots/intro-call?from=2026-10-19&days=1&tz=UTC`)).json();
  assert.ok(free.slots.some((x) => x.start === START), "cancelling frees the time");
  assert.equal((await fetch(`${s.base}/b/${"0".repeat(32)}`)).status, 404);
  s.close();
});

test("the honeypot books nothing and a form post cannot smuggle a header into email", async () => {
  const s = await boot();
  assert.equal((await form(`${s.base}/e/intro-call/book`, { start: START, name: "Bot", email: "b@x.com", _gotcha: "1" })).status, 303);
  assert.equal(Object.keys(s.state.bookings).length, 0);
  await form(`${s.base}/e/intro-call/book`, { start: START, name: "Evil\r\nBcc: x@y.z", email: "bo@x.com" });
  for (const m of s.sent) assert.doesNotMatch(m.subject, /[\r\n]/);
  s.close();
});

test("booking attempts are rate limited per address", async () => {
  const s = await boot({ limits: { book: (() => { let n = 0; return () => ++n <= 2; })() } });
  for (let i = 0; i < 2; i++) await form(`${s.base}/e/intro-call/book`, { start: START + i * 1_800_000, name: "Bo", email: `b${i}@x.com` });
  assert.equal((await form(`${s.base}/e/intro-call/book`, { start: START + 5_400_000, name: "Bo", email: "b9@x.com" })).status, 429);
  s.close();
});

test("admin needs the key, escapes names, manages types and settings, cancels, exports", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/admin`)).status, 401);
  assert.equal((await fetch(`${s.base}/admin`, { headers: { authorization: "Bearer wrong" } })).status, 401);
  await form(`${s.base}/e/intro-call/book`, { start: START, name: "<script>x</script>", email: "bo@x.com" });
  const html = await (await fetch(`${s.base}/admin`, { headers: auth })).text();
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>x/);
  assert.equal((await form(`${s.base}/admin/types`, { name: "Deep dive", minutes: "90", buffer: "15" }, auth)).status, 303);
  assert.equal(s.state.types["deep-dive"].minutes, 90);
  const bad = await form(`${s.base}/admin/settings`, { tz: "Nope/Zone" }, auth); assert.equal(bad.status, 400); assert.match(await bad.text(), /unknown time zone/);
  assert.equal((await form(`${s.base}/admin/settings`, { weekly: "mon 10:00-11:00" }, auth)).status, 303);
  assert.equal(s.state.settings.weekly[1][0][0], 600);
  assert.equal((await form(`${s.base}/admin/bookings/b1/cancel`, {}, auth)).status, 303); assert.equal(s.state.bookings.b1.cancelledBy, "host");
  assert.match(await (await fetch(`${s.base}/admin/export.csv`, { headers: auth })).text(), /&lt;|<script>x<\/script>|cancelled/);
  assert.equal((await form(`${s.base}/admin/types/deep-dive/delete`, {}, auth)).status, 303); assert.ok(!s.state.types["deep-dive"]);
  s.close();
});

test("a cross-site admin post riding browser credentials is refused", async () => {
  const s = await boot();
  const basic = { authorization: `Basic ${Buffer.from(`a:${KEY}`).toString("base64")}`, origin: "https://evil.example" };
  assert.equal((await form(`${s.base}/admin/types`, { name: "x" }, basic)).status, 403);
  s.close();
});

test("embedding is off unless the origin is listed", async () => {
  const s = await boot({ embedOrigins: ["https://ann.example"] });
  assert.match((await fetch(`${s.base}/e/intro-call`)).headers.get("content-security-policy"), /frame-ancestors https:\/\/ann\.example/);
  assert.match((await fetch(`${s.base}/admin`, { headers: auth })).headers.get("content-security-policy"), /frame-ancestors 'none'/);
  s.close();
});

test("reminders go out once when the clock reaches the window", async () => {
  const s = await boot({ baseUrl: "https://book.example" });
  await form(`${s.base}/e/intro-call/book`, { start: START, name: "Bo", email: "bo@x.com" });
  s.sent.length = 0;
  s.clock(START - 2 * 86_400_000); assert.equal(await s.cfg.sweep(), 0);
  s.clock(START - 3_600_000 * 20); assert.equal(await s.cfg.sweep(), 1); assert.equal(s.sent.length, 1);
  assert.match(s.sent[0].subject, /^Reminder/); assert.match(s.sent[0].text, /https:\/\/book\.example\/b\//);
  assert.equal(await s.cfg.sweep(), 0);
  s.close();
});

test("a busy calendar feed blocks slots, and a failing feed does not break booking", async () => {
  const feed = (st) => async () => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:${st}\r\nDTEND:20261019T140000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const s = await boot(); updateSettings(s.state, { icsUrl: "https://cal.example/a.ics" });
  s.cfg.external = feedLoader(s.state, { fetchText: feed("20261019T130000Z") });
  const j = await (await fetch(`${s.base}/api/slots/intro-call?from=2026-10-19&days=1&tz=UTC`)).json();
  assert.ok(!j.slots.some((x) => x.start === START), "13:00Z is busy");
  assert.equal((await form(`${s.base}/e/intro-call/book`, { start: START, name: "Bo", email: "bo@x.com" })).status, 409);
  s.cfg.external = async () => { throw new Error("feed down"); };
  assert.equal((await form(`${s.base}/e/intro-call/book`, { start: START, name: "Bo", email: "bo@x.com" })).status, 303);
  s.close();
});

test("the feed loader caches, keeps the last good copy, and the address check rejects private networks", async () => {
  const state = newState(); updateSettings(state, { icsUrl: "https://cal.example/a.ics" });
  let calls = 0, fail = false;
  const load = feedLoader(state, { ttl: 1000, fetchText: async () => { calls++; if (fail) throw new Error("down"); return "BEGIN:VEVENT\r\nDTSTART:20261019T130000Z\r\nDTEND:20261019T140000Z\r\nEND:VEVENT"; } });
  assert.equal((await load(NOW)).length, 1); await load(NOW + 500); assert.equal(calls, 1);
  fail = true; await assert.rejects(load(NOW + 2000)); assert.equal((await load(NOW + 2100)).length, 1, "stale copy served during the retry window");
  for (const a of ["127.0.0.1", "10.1.2.3", "192.168.0.9", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1"]) assert.ok(isPrivate(a), a);
  for (const a of ["8.8.8.8", "93.184.216.34", "2606:4700::1111"]) assert.ok(!isPrivate(a), a);
  await assert.rejects(safeFeedUrl("http://example.com/a.ics"), /https/);
  await assert.rejects(safeFeedUrl("https://127.0.0.1/a.ics"), /private/);
  await assert.rejects(safeFeedUrl("https://[::1]/a.ics"), /private/);
});
