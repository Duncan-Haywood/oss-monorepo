import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { exampleDesk } from "./engine.mjs";

// 2026-11-02T15:00Z is Monday 15:00 in UTC.
async function serve(state, env = { TZ: "UTC" }, fetchImpl) {
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, env, () => Date.parse("2026-11-02T15:00:00Z"), fetchImpl));
  await new Promise((r) => srv.listen(0, r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)), saves: () => saves };
}
const form = (o) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o) });

test("GET /book lists open times and none of the desk's people", async () => {
  const state = { desk: exampleDesk("2026-11-02") };
  const s = await serve(state);
  try {
    const r = await fetch(`${s.base}/book`);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /Open times/);
    assert.match(html, /<option value="2026-11-02" data-start="15:00" data-end="22:00"/); // from now (15:00) on
    assert.match(html, /<option value="2026-11-04"/);
    // Tuesday's 15:30-18:30 repeat sit leaves 19:00-22:00 (3 h after the 30 min buffer).
    assert.match(html, /<option value="2026-11-03" data-start="19:00" data-end="22:00"/);
  } finally { await s.close(); }
});

test("/book never shows a family, kid, allergy, address, lead or contact", async () => {
  const state = { desk: exampleDesk("2026-11-02") };
  const s = await serve(state);
  try {
    await fetch(`${s.base}/book`, form({ name: "Zed Secretname", contact: "zed@example.com", date: "2026-11-04", start: "16:00", end: "20:00", kids: "4" }));
    const html = await (await fetch(`${s.base}/book`)).text();
    for (const secret of ["Rivera", "Chen", "Leo", "Mia", "peanut", "Oak St", "Elm Ave", "555-0111", "555-0122", "555-0112", "Hannah", "Brooks", "Tom Ellis", "tom@example.com", "Zed", "zed@example.com", "Grandma", "prayers"]) assert.ok(!html.includes(secret), `/book leaks ${secret}`);
    // A bad request re-renders the page with a message, still without anyone's details.
    const bad = await fetch(`${s.base}/book`, form({ name: "Q", contact: "q@example.com", date: "2026-11-04", start: "16:00", end: "20:00" }));
    assert.equal(bad.status, 400);
    const badHtml = await bad.text();
    assert.match(badHtml, /not open/);
    assert.ok(!badHtml.includes("Zed"));
  } finally { await s.close(); }
});

test("a request becomes a 'requested' lead and alerts the sitter; no booking is made", async () => {
  const calls = [];
  const state = { desk: exampleDesk("2026-11-02") };
  const bookings = state.desk.bookings.length;
  const s = await serve(state, { TZ: "UTC", NOTIFY_WEBHOOK_URL: "https://ntfy.example/grace" }, async (url, init) => { calls.push({ url, init }); return { ok: true }; });
  try {
    const r = await fetch(`${s.base}/book`, form({ name: "Jo Park", contact: "jo@example.com", date: "2026-11-07", start: "10:00", end: "14:00", kids: "3, 5" }));
    assert.equal(r.status, 200);
    assert.match(await r.text(), /not booked until then/);
    const lead = state.desk.leads.at(-1);
    assert.equal(lead.status, "requested");
    assert.deepEqual(lead.requested, { date: "2026-11-07", start: "10:00", end: "14:00" });
    assert.equal(state.desk.bookings.length, bookings);
    assert.equal(s.saves(), 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0].init.body, /Booking request: Jo Park/);
    // The same time is now held, so a second family cannot request it.
    const again = await fetch(`${s.base}/book`, form({ name: "Al", contact: "al@example.com", date: "2026-11-07", start: "10:00", end: "14:00" }));
    assert.equal(again.status, 400);
  } finally { await s.close(); }
});

test("/book has a honeypot and a rate limit", async () => {
  const state = { desk: exampleDesk("2026-11-02") };
  const n = state.desk.leads.length;
  const s = await serve(state);
  try {
    const bot = await fetch(`${s.base}/book`, form({ name: "Bot", contact: "x@example.com", date: "2026-11-07", start: "10:00", end: "14:00", website: "spam" }));
    assert.equal(bot.status, 200);
    assert.equal(state.desk.leads.length, n);
    let last; // the honeypot request above counted as one of the ten
    for (let i = 0; i < 9; i++) last = await fetch(`${s.base}/book`, form({ name: "", contact: "" }));
    assert.equal(last.status, 400);
    assert.equal((await fetch(`${s.base}/book`, form({ name: "", contact: "" }))).status, 429);
  } finally { await s.close(); }
});

test("the app's slots module is served", async () => {
  const s = await serve({ desk: exampleDesk("2026-11-02") });
  try {
    const r = await fetch(`${s.base}/slots.mjs`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /export function openSlots/);
  } finally { await s.close(); }
});
