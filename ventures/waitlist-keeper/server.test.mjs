import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { newState } from "./engine.mjs";

const ADMIN = "admin-key-1234567890";
async function boot(over = {}) {
  const sent = []; const state = newState(); let t = 1_000_000;
  const cfg = { state, save() {}, adminKey: ADMIN, baseUrl: "https://w.test", product: "Acme", tagline: "Hi", tiers: [{ referrals: 1, reward: "early access" }], dryRun: false, send: async (m) => sent.push(m), now: () => (t += 10), ...over };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const join = (email, ref = "", ip = "10.0.0." + Math.floor(Math.random() * 250)) => fetch(base + "/join", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: new URLSearchParams({ email, ref }) });
  const get = (p, h = {}) => fetch(base + p, { redirect: "manual", headers: h });
  return { srv, state, sent, join, get, cfg, base };
}
const tokenOf = (m) => m.text.match(/t=([0-9a-f]+)/)[1];

test("join, confirm by email link, then see a place in line", async () => {
  const { srv, sent, join, get } = await boot();
  const r = await join("Ann@Example.com"); assert.equal(r.status, 200);
  assert.equal(sent.length, 1); assert.match(sent[0].subject, /Confirm your spot/);
  const c = await get(`/confirm?t=${tokenOf(sent[0])}`); assert.equal(c.status, 303);
  const page = await (await get(c.headers.get("location"))).text();
  assert.match(page, /#1/); assert.match(page, /on the list/);
  assert.doesNotMatch(page, /ann@example/i); // status page never shows an email
  srv.close();
});

test("a referral counts only after the friend confirms, and unlocks the tier", async () => {
  const { srv, sent, join, get, state } = await boot();
  await join("a@x.com"); const loc = (await get(`/confirm?t=${tokenOf(sent[0])}`)).headers.get("location");
  const code = loc.split("/").pop();
  await join("b@x.com", code);
  assert.equal(Object.values(state.people)[0].referrals, 0);
  await get(`/confirm?t=${tokenOf(sent[1])}`);
  const page = await (await get(loc)).text();
  assert.match(page, /1 friend confirmed/); assert.match(page, /early access/);
  srv.close();
});

test("dry run sends nothing and exposes the confirm link for testing", async () => {
  const { srv, sent, join } = await boot({ dryRun: true });
  const r = await join("d@x.com"); assert.equal(sent.length, 0);
  assert.match(await r.text(), /Dry-run mode/);
  srv.close();
});

test("honeypot, bad and disposable emails, and the rate limit", async () => {
  const { srv, state, join } = await boot({ allow: (() => { let n = 0; return () => ++n <= 4; })() });
  await fetch(`http://127.0.0.1:${srv.address().port}/join`, { method: "POST", body: new URLSearchParams({ email: "bot@x.com", website: "x" }) });
  assert.equal(Object.keys(state.people).length, 0);
  assert.equal((await join("nope")).status, 400);
  assert.equal((await join("a@mailinator.com")).status, 400);
  assert.equal((await join("ok@x.com")).status, 200);
  assert.equal((await join("ok2@x.com")).status, 429);
  srv.close();
});

test("admin: stats, CSV export and inviting the front of the line", async () => {
  const { srv, sent, join, get, base } = await boot();
  for (const e of ["a@x.com", "b@x.com", "c@x.com"]) { await join(e); }
  for (const m of sent.slice()) await get(`/confirm?t=${tokenOf(m)}`);
  const auth = { authorization: `Bearer ${ADMIN}` };
  assert.equal((await get("/v1/admin/stats")).status, 401);
  assert.equal((await (await get("/v1/admin/stats", auth)).json()).waiting, 3);
  const inv = await (await fetch(base + "/v1/admin/invite", { method: "POST", headers: auth, body: JSON.stringify({ count: 2, url: "https://app.test/start" }) })).json();
  assert.equal(inv.invited, 2);
  assert.ok(sent.some((m) => m.to === "a@x.com" && /app\.test\/start/.test(m.text)));
  assert.equal((await (await get("/v1/count")).json()).waiting, 1);
  const csv = await (await get("/v1/admin/export.csv", auth)).text();
  assert.match(csv, /^position,email,confirmed/); assert.match(csv, /c@x\.com,yes/);
  srv.close();
});

test("signups record a clean source, and the admin dashboard and CSV show it", async () => {
  const { srv, join, get, base, state } = await boot();
  await fetch(base + "/join", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ email: "s@x.com", src: "Twitter<script>" }) });
  assert.equal(Object.values(state.people)[0].src, "twitterscript");
  assert.equal((await get("/admin")).status, 401);
  const basic = { authorization: "Basic " + Buffer.from("me:" + ADMIN).toString("base64") };
  const dash = await (await get("/admin", basic)).text();
  assert.match(dash, /twitterscript/); assert.match(dash, /1 signups/);
  assert.match(await (await get("/v1/admin/export.csv", { authorization: `Bearer ${ADMIN}` })).text(), /twitterscript/);
  srv.close();
});

test("a person can delete their own data; the GET only asks, the POST erases", async () => {
  const { srv, sent, join, get, base, state } = await boot();
  await join("gone@x.com");
  assert.match(sent[0].text, /\/leave\?t=/);
  const t = tokenOf(sent[0]);
  assert.match(await (await get(`/leave?t=${t}`)).text(), /Delete my data/);
  assert.equal(Object.keys(state.people).length, 1); // prefetching the link erases nothing
  assert.equal((await fetch(`${base}/leave?t=${t}`, { method: "POST" })).status, 200);
  assert.equal(Object.keys(state.people).length, 0); assert.deepEqual(state.byEmail, {});
  assert.equal((await fetch(`${base}/leave?t=${t}`, { method: "POST" })).status, 404);
  srv.close();
});

test("operator erase by email, embed script, and no raw network address is stored", async () => {
  const { srv, join, base, state } = await boot();
  await join("e@x.com", "", "203.0.113.7");
  assert.doesNotMatch(JSON.stringify(state), /203\.0\.113\.7/);
  const auth = { authorization: `Bearer ${ADMIN}` };
  assert.equal((await fetch(base + "/v1/admin/erase", { method: "POST", headers: auth, body: JSON.stringify({ email: "E@x.com" }) })).status, 200);
  assert.equal(Object.keys(state.people).length, 0);
  assert.equal((await fetch(base + "/v1/admin/erase", { method: "POST", headers: auth, body: JSON.stringify({ email: "e@x.com" }) })).status, 404);
  assert.equal((await fetch(base + "/v1/admin/erase", { method: "POST", body: "{}" })).status, 401);
  const js = await fetch(base + "/embed.js"); assert.match(js.headers.get("content-type"), /javascript/); assert.match(await js.text(), /waitlist-keeper/);
  srv.close();
});
