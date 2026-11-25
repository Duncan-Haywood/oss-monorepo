// The hosted hub (aws/app.mjs) with an in-memory store; the Postgres store is in aws/pg.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import app, { makeApp, cleanSettings, sha256, newKey, MAX_TEAMS_PER_USER } from "./app.mjs";
import { migrateHub } from "./migrate-hub.mjs";
import { memoryStore } from "./local.mjs";
import worker, { RosterHub } from "../hub-worker.mjs";
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

const ORIGIN = "https://hub.example";
function boot({ entitled = false, vars = {} } = {}) {
  const store = memoryStore();
  const a = makeApp({ store: () => store });
  const call = (path, { user, ...init } = {}) => a.fetch(new Request(ORIGIN + path, init), {
    VARS: vars, user: user ? { sub: user } : null,
    entitlement: async () => ({ entitled, status: entitled ? "active" : "none" }),
  });
  const api = (path, user, method = "GET", body) => call(path, { user, method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
  const form = (url, body) => a.fetch(new Request(url, { method: "POST", body: new URLSearchParams(body), redirect: "manual" }), { VARS: vars, user: null });
  const get = (url) => a.fetch(new Request(url), { VARS: vars, user: null });
  return { store, call, api, form, get };
}
const STAFF = "name, wage, max hours, min hours, availability\nAna, 23.17, 40, 0, any\nBen, 19.43, 40, 0, Mon-Wed 8-18";
const SHIFTS = "day, start, end, people needed, label\nMon-Fri, 9, 17, 1, day";
const owner = () => buildRoster(parseStaff(STAFF).staff, parseShifts(SHIFTS).slots).owner;

test("a signed-in manager gets a team; only hashes of its links are stored", async () => {
  const h = boot();
  const r = await h.api("/api/teams", "mgr-1", "POST", { name: "Cafe", settings: { TIMEZONE: "America/Denver", NOTIFY_WEBHOOK_URL: "http://169.254.169.254/" } });
  assert.equal(r.status, 201);
  const out = await r.json();
  const key = new URL(out.admin_url).searchParams.get("key"), t = new URL(out.team_url).searchParams.get("t");
  assert.ok(key.length >= 40 && t.length >= 40 && key !== t);
  const row = h.store.rows[0];
  assert.equal(row.admin_hash, await sha256(key));
  assert.equal(row.team_hash, await sha256(t));
  assert.ok(!JSON.stringify(row).includes(key) && !JSON.stringify(row).includes(t), "neither secret is stored");
  assert.deepEqual(row.settings, { TIMEZONE: "America/Denver" }, "webhook URLs are not accepted (no outbound calls)");
  assert.deepEqual((await (await h.api("/api/teams", "mgr-1")).json()).teams.map((x) => x.name), ["Cafe"]);
  assert.deepEqual((await (await h.api("/api/teams", "someone-else")).json()).teams, [], "teams are per account");
});

test("the hub runs per team: publish from the browser-built roster, staff see it without wages, teams are separate", async () => {
  const h = boot({ entitled: true });
  const a = await (await h.api("/api/teams", "mgr-1", "POST", { name: "A" })).json();
  const b = await (await h.api("/api/teams", "mgr-1", "POST", { name: "B" })).json();
  const html = await (await h.get(a.admin_url)).text();
  assert.match(html, /import\("\/calc\.mjs"\)/, "the admin page builds in the browser, as on the Worker");
  assert.match(html, /export\.json/);
  const js = await h.get(ORIGIN + "/calc.mjs");
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.match(await js.text(), /export function buildRoster/);

  const key = new URL(a.admin_url).searchParams.get("key");
  const r = await h.form(`${ORIGIN}/admin/save?key=${encodeURIComponent(key)}`, { act: "publish", weekStart: "2026-11-16", staff: STAFF, shifts: SHIFTS, owner: JSON.stringify(owner()) });
  assert.equal(r.status, 303);
  const team = await (await h.get(a.team_url)).text();
  assert.match(team, /week of 2026-11-16/);
  assert.match(team, /Ana/);
  assert.doesNotMatch(team, /23\.17|19\.43/, "wages never reach the staff page");
  assert.doesNotMatch(await (await h.get(b.team_url)).text(), /Ana/, "team B does not see team A");
  // The other side's secret does not open this side.
  assert.equal((await h.get(`${ORIGIN}/admin?key=${encodeURIComponent(new URL(a.team_url).searchParams.get("t"))}`)).status, 401);
  assert.equal((await h.get(`${ORIGIN}/team?t=${encodeURIComponent(key)}`)).status, 401);
  assert.equal((await h.get(`${ORIGIN}/admin?key=${newKey()}`)).status, 401);
  assert.equal((await h.get(`${ORIGIN}/admin`)).status, 401);
});

test("staff replies persist; GETs never write", async () => {
  const h = boot();
  const a = await (await h.api("/api/teams", "mgr-1", "POST", {})).json();
  const before = JSON.stringify(h.store.rows[0].state);
  await h.get(a.team_url);
  assert.equal(JSON.stringify(h.store.rows[0].state), before);
  const t = new URL(a.team_url).searchParams.get("t");
  const r = await h.form(`${ORIGIN}/team/reply?t=${encodeURIComponent(t)}`, { line: "Ana | Mon-Thu 8-18" });
  assert.equal(r.status, 200);
  assert.equal(h.store.rows[0].state.replies.length, 1);
});

test("the paid gate ships dark: FREE_TEAMS teams free, then a plan is needed; a cap per account", async () => {
  const h = boot({ vars: { FREE_TEAMS: "1" } });
  assert.equal((await h.api("/api/teams", "u", "POST", {})).status, 201);
  const r = await h.api("/api/teams", "u", "POST", {});
  assert.equal(r.status, 402);
  assert.equal((await r.json()).error, "subscription required");
  const paid = boot({ entitled: true, vars: { FREE_TEAMS: "0" } });
  for (let i = 0; i < MAX_TEAMS_PER_USER; i++) assert.equal((await paid.api("/api/teams", "u", "POST", {})).status, 201);
  assert.equal((await paid.api("/api/teams", "u", "POST", {})).status, 409);
  assert.equal((await h.api("/api/teams", null)).status, 401, "no sign-in, no API");
});

test("rotating a link retires the old one; settings and delete are owner-only", async () => {
  const h = boot();
  const a = await (await h.api("/api/teams", "mgr-1", "POST", {})).json();
  const id = h.store.rows[0].id;
  assert.equal((await h.api(`/api/teams/${id}/rotate`, "intruder", "POST", { which: "team" })).status, 404);
  const r = await (await h.api(`/api/teams/${id}/rotate`, "mgr-1", "POST", { which: "team" })).json();
  assert.ok(r.team_url && !r.admin_url);
  assert.equal((await h.get(a.team_url)).status, 401, "old team link is dead");
  assert.equal((await h.get(r.team_url)).status, 200);
  assert.equal((await h.get(a.admin_url)).status, 200, "admin link unchanged");
  assert.equal((await h.api(`/api/teams/${id}`, "mgr-1", "PATCH", { settings: { TIME_CLOCK: "0", ADMIN_KEY: "x" } })).status, 200);
  assert.deepEqual(h.store.rows[0].settings, { TIME_CLOCK: "0" });
  assert.equal((await h.api(`/api/teams/${id}`, "intruder", "DELETE")).status, 404);
  assert.equal((await h.api(`/api/teams/${id}`, "mgr-1", "DELETE")).status, 200);
  assert.equal(h.store.rows.length, 0);
});

test("bad input is refused", async () => {
  const h = boot();
  assert.equal((await h.call("/api/teams", { user: "u", method: "POST", body: "{not json" })).status, 400);
  assert.equal((await h.api("/api/teams", "u", "POST", { state: [1, 2] })).status, 400);
  assert.equal((await h.api("/api/teams", "u", "POST", { state: { staff: "x".repeat(1_600_000) } })).status, 413);
  assert.equal((await h.api(`/api/teams/not-a-uuid/rotate`, "u", "POST", {})).status, 404);
  assert.deepEqual(cleanSettings({ PAY_RULES: "CA", TEAM_WEBHOOK_URL: "https://x", BUILD_IN_BROWSER: "", PUBLIC_URL: "https://evil" , TIME_GRACE_MIN: { a: 1 } }), { PAY_RULES: "CA" });
  assert.equal((await app.fetch(new Request(ORIGIN + "/healthz"), {})).status, 200);
});

test("migrate-hub moves a Cloudflare Worker hub's state into a hosted team", async () => {
  // The old hub: the Worker with a stand-in Durable Object (as in hub-worker.test.mjs).
  const storage = new Map();
  const ns = { idFromName: (n) => n, get: () => (ns.obj ||= new RosterHub({ storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { storage.set(k, structuredClone(v)); } }, blockConcurrencyWhile: (fn) => fn() }, { ADMIN_KEY: "old-admin", TEAM_TOKEN: "old-team", HUB: ns })) };
  const oldEnv = { ADMIN_KEY: "old-admin", TEAM_TOKEN: "old-team", HUB: ns };
  const pub = await worker.fetch(new Request("https://old.example/admin/save?key=old-admin", { method: "POST", body: new URLSearchParams({ act: "publish", weekStart: "2026-11-16", staff: STAFF, shifts: SHIFTS, owner: JSON.stringify(owner()) }), redirect: "manual" }), oldEnv);
  assert.equal(pub.status, 303);
  await worker.fetch(new Request("https://old.example/team/reply?t=old-team", { method: "POST", body: new URLSearchParams({ line: "Ben | Tue-Wed 8-18" }) }), oldEnv);
  assert.equal((await worker.fetch(new Request("https://old.example/admin/export.json?key=wrong"), oldEnv)).status, 401, "export needs the admin key");

  const h = boot();
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    if (u.host === "old.example") return worker.fetch(new Request(url, init), oldEnv);
    assert.equal(init.headers.authorization, "Bearer tok");
    return h.call(u.pathname + u.search, { ...init, user: "mgr-9" });
  };
  const r = await migrateHub({ adminUrl: "https://old.example/admin?key=old-admin", hostedUrl: ORIGIN, token: "tok", name: "Moved", settings: { TIMEZONE: "Europe/Rome" }, fetchImpl });
  assert.equal(r.counts.staffLines, 3);
  const team = await (await h.get(r.team_url)).text();
  assert.match(team, /week of 2026-11-16/);
  assert.equal(h.store.rows[0].state.replies[0].line, "Ben | Tue-Wed 8-18");
  assert.deepEqual(h.store.rows[0].settings, { TIMEZONE: "Europe/Rome" });
  await assert.rejects(migrateHub({ adminUrl: "https://old.example/admin", hostedUrl: ORIGIN, token: "tok", fetchImpl }), /admin link/);
});
