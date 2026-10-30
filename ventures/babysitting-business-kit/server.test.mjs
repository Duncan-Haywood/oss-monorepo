import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, dailyDigest, webhookBody } from "./server.mjs";
import { exampleDesk, emptyDesk } from "./engine.mjs";

async function serve(state, env, fetchImpl) {
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, env, () => Date.parse("2026-11-02T15:00:00Z"), fetchImpl));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => new Promise((r) => srv.close(r)), saves: () => saves };
}
function fakeFetch() {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
  f.calls = calls;
  return f;
}

test("the app, engine and generated site are served", async () => {
  const s = await serve({ desk: exampleDesk() }, {});
  try {
    assert.match(await (await fetch(`${s.base}/`)).text(), /Babysitting Business Kit/);
    assert.equal((await fetch(`${s.base}/engine.mjs`)).headers.get("content-type"), "text/javascript; charset=utf-8");
    const site = await (await fetch(`${s.base}/site`)).text();
    assert.match(site, /Grace Notes Babysitting/);
    assert.match(site, /action="\/inquiry"/);
    assert.equal((await fetch(`${s.base}/../server.mjs`)).status, 404);
  } finally { await s.close(); }
});

test("the multi-page site is served under /site/ with its robots.txt and sitemap", async () => {
  const desk = exampleDesk();
  desk.profile.site = { url: "https://gracenotes.example", towns: "Springfield, Riverside", sick: "Fever means we reschedule, no fee." };
  const s = await serve({ desk }, {});
  try {
    const r = await fetch(`${s.base}/site`, { redirect: "manual" });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get("location"), "/site/");
    for (const f of ["about.html", "policies.html", "faq.html"]) assert.equal((await fetch(`${s.base}/site/${f}`)).status, 200, f);
    assert.match(await (await fetch(`${s.base}/site/policies.html`)).text(), /Fever means we reschedule/);
    const robots = await fetch(`${s.base}/site/robots.txt`);
    assert.equal(robots.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.match(await robots.text(), /Sitemap: https:\/\/gracenotes\.example\/sitemap\.xml/);
    assert.equal((await fetch(`${s.base}/site/sitemap.xml`)).headers.get("content-type"), "application/xml; charset=utf-8");
    for (const bad of ["constructor", "__proto__", "nope.html", "../server.mjs"]) assert.equal((await fetch(`${s.base}/site/${bad}`)).status, 404, bad);
    assert.equal((await fetch(`${s.base}/site.mjs`)).status, 200, "the app's engine imports site.mjs");
  } finally { await s.close(); }
});

test("an inquiry becomes a scored lead, auto-replies by email and alerts the sitter", async () => {
  const f = fakeFetch();
  const state = { desk: exampleDesk() };
  const env = { RESEND_API_KEY: "k", FROM_EMAIL: "Grace <hi@example.com>", AUTO_REPLY: "1", NOTIFY_WEBHOOK_URL: "https://ntfy.example/grace" };
  const s = await serve(state, env, f);
  try {
    const r = await fetch(`${s.base}/inquiry`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ name: "Jo Park", contact: "jo@example.com", kids: "3, 5", schedule: "Sat 18-22", wants: "weekly", source: "referral" }) });
    assert.equal(r.status, 200);
    const lead = state.desk.leads.at(-1);
    assert.equal(lead.name, "Jo Park");
    assert.equal(lead.followUps, 1);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].url, "https://api.resend.com/emails");
    assert.deepEqual(JSON.parse(f.calls[0].init.body).to, ["jo@example.com"]);
    assert.match(f.calls[1].init.body, /New babysitting lead: Jo Park/);
    assert.equal(s.saves(), 1);
  } finally { await s.close(); }
});

test("without keys an inquiry is still saved and nothing is sent", async () => {
  const f = fakeFetch();
  const state = { desk: emptyDesk() };
  const s = await serve(state, {}, f);
  try {
    await fetch(`${s.base}/inquiry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Al", contact: "555-0100" }) });
    assert.equal(state.desk.leads.length, 1);
    assert.equal(f.calls.length, 0);
  } finally { await s.close(); }
});

test("honeypot, missing fields and flooding are refused without saving", async () => {
  const state = { desk: emptyDesk() };
  const s = await serve(state, {});
  try {
    const post = (body) => fetch(`${s.base}/inquiry`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
    assert.equal((await post({ name: "Bot", contact: "x", website: "spam.example" })).status, 200);
    assert.equal((await post({ name: "", contact: "" })).status, 400);
    assert.equal(state.desk.leads.length, 0);
    let last;
    for (let i = 0; i < 11; i++) last = await post({ name: `P${i}`, contact: "555" });
    assert.equal(last.status, 429);
    assert.equal(state.desk.leads.length, 8); // 2 earlier requests used the hour's budget too
  } finally { await s.close(); }
});

test("the desk API needs the admin key and keeps leads that arrived since the last sync", async () => {
  const state = { desk: exampleDesk() };
  const s = await serve(state, { ADMIN_KEY: "secret-key" });
  try {
    assert.equal((await fetch(`${s.base}/api/desk`)).status, 401);
    assert.equal((await fetch(`${s.base}/api/desk`, { headers: { authorization: "Bearer nope" } })).status, 401);
    const got = await (await fetch(`${s.base}/api/desk`, { headers: { authorization: "Bearer secret-key" } })).json();
    const known = got.leads.map((l) => l.id);
    state.desk.leads.push({ id: "lead_web", name: "From the site", status: "new" });
    const browser = { ...got, leads: got.leads.filter((l) => l.id !== "lead_2"), knownLeadIds: known };
    const r = await (await fetch(`${s.base}/api/desk`, { method: "PUT", headers: { authorization: "Bearer secret-key" }, body: JSON.stringify(browser) })).json();
    assert.equal(r.added, 1);
    const ids = state.desk.leads.map((l) => l.id);
    assert.ok(ids.includes("lead_web"));
    assert.ok(!ids.includes("lead_2"), "a lead deleted in the app stays deleted");
    const today = await (await fetch(`${s.base}/api/today`, { headers: { authorization: "Bearer secret-key" } })).json();
    assert.ok(Array.isArray(today) && today.length > 0);
  } finally { await s.close(); }
});

test("the calendar feed needs its token", async () => {
  const s = await serve({ desk: exampleDesk() }, { CAL_TOKEN: "cal123" });
  try {
    assert.equal((await fetch(`${s.base}/calendar.ics`)).status, 401);
    const r = await fetch(`${s.base}/calendar.ics?t=cal123`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /BEGIN:VCALENDAR/);
  } finally { await s.close(); }
});

test("the daily digest sends the to-do list and due follow-ups only when switched on", async () => {
  const f = fakeFetch();
  const state = { desk: exampleDesk("2026-11-02") };
  state.desk.leads.push({ id: "lead_e", created: "2026-10-31", name: "Em Lee", contact: "em@example.com", kids: ["4"], schedule: "Fri 18-21", status: "contacted", followUps: 1 });
  let r = await dailyDigest(state, () => {}, { NOTIFY_WEBHOOK_URL: "https://hook.example", NOTIFY_FORMAT: "slack" }, "2026-11-02", f);
  assert.equal(r.sent, 0);
  assert.equal(f.calls.length, 1);
  assert.match(JSON.parse(f.calls[0].init.body).text, /Babysitting to-do/);
  r = await dailyDigest(state, () => {}, { RESEND_API_KEY: "k", FROM_EMAIL: "a@b.co", AUTO_FOLLOW_UP: "1" }, "2026-11-02", f);
  assert.equal(r.sent, 1);
  assert.equal(state.desk.leads.find((l) => l.id === "lead_e").followUps, 2);
});

test("webhook bodies match each service", () => {
  assert.equal(webhookBody("ntfy", "hi").body, "hi");
  assert.equal(JSON.parse(webhookBody("discord", "hi").body).content, "hi");
  assert.equal(JSON.parse(webhookBody("slack", "hi").body).text, "hi");
});
