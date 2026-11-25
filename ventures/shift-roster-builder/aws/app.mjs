// The team hub, hosted: many teams on the AWS SaaS starter (platform/aws/stacks/saas-starter, app-service module),
// built from the same handler as server.mjs and the Cloudflare Worker (hub.mjs). Stack: platform/aws/stacks/shift-roster.
//
//   self-hosted (server.mjs / hub-worker.mjs)    hosted (this file)
//   one team per deploy                          one row per team in Postgres (hub_teams)
//   ADMIN_KEY / TEAM_TOKEN env secrets           per-team random keys; only their SHA-256 is stored
//   state in a JSON file / one Durable Object    state jsonb, read and written under SELECT ... FOR UPDATE
//   settings in env (TIMEZONE, PAY_RULES, ...)   per-team settings jsonb (the same names, an allowlist)
//
// Why the row lock: a Durable Object handled one request at a time, so two staff sending a call-out in the same
// second could not overwrite each other. Every request that may write holds the team's row lock until it commits.
// Webhooks (NOTIFY_WEBHOOK_URL, TEAM_WEBHOOK_URL) are off here: the app has no internet route (no NAT) and a
// user-typed URL fetched from our network would be a server-side request forgery risk.
//
// Routes: /admin*?key=  and /team*?t=  (the hub, unchanged); /calc.mjs, /bnp.mjs (the admin page builds the roster
// in the browser, as on the Worker); /api/* behind the Cognito JWT authorizer: a signed-in manager creates teams
// (optionally from a hub's /admin/export.json), lists them and rotates their links.
import { handler } from "../hub.mjs";
import { serve, loadState } from "../hub-worker.mjs";
import { trimPunches } from "../timeclock.mjs";
import { readFile } from "node:fs/promises";

export const MAX_STATE = 1_500_000;      // bytes of JSON, the Worker's guard; jsonb could hold more, the pages could not
export const MAX_IMPORT = 2_000_000;      // bytes of an uploaded export
export const MAX_TEAMS_PER_USER = 25;
// Self-host env names a team may set for itself. Not here: ADMIN_KEY, TEAM_TOKEN, BUILD_IN_BROWSER (always on),
// PUBLIC_URL (set from the request), NOTIFY_* and TEAM_WEBHOOK_URL (no outbound calls, above).
export const SETTINGS = ["TIMEZONE", "TIME_CLOCK", "TIME_GRACE_MIN", "PUNCH_ROUND_MIN", "PAY_RULES", "MIN_WAGE", "NV_FOUR_TENS",
  "CLOCK_PIN", "CLOCK_GEOFENCE", "CLOCK_GEOFENCE_MODE", "LEAVE_ACCRUAL", "LEAVE_NAME", "LEAVE_YEAR_START", "LEAVE_YEAR_CAP",
  "LEAVE_BALANCE_CAP", "LEAVE_CARRYOVER_CAP", "FAIR_WORKWEEK"];

const enc = new TextEncoder();
export async function sha256(s) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
// 32 random bytes, base64url: unguessable, URL-safe, the same strength as `openssl rand -base64 32`.
export function newKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function cleanSettings(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const k of SETTINGS) {
    const v = input[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    out[k] = String(v).slice(0, 2000);
  }
  return out;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const text = (body, status = 200, type = "text/plain; charset=utf-8") => new Response(body, { status, headers: { "content-type": type, "x-content-type-options": "nosniff" } });

const STATIC = { "/calc.mjs": "calc.mjs", "/bnp.mjs": "bnp.mjs" };
// After `node build.mjs product`, the bundle sits in dist/app-roster_hub/ and aws/build.mjs copies the two modules to
// ./static beside it; unbundled (tests, local runs) they are one directory up from this file.
async function staticFile(name) {
  for (const base of [new URL("./static/", import.meta.url), new URL("../", import.meta.url)]) {
    try { return await readFile(new URL(name, base), "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  return null;
}

const LANDING = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team schedule hub</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem"><h1>Team schedule hub</h1><p>The hosted hub of <a href="https://marisstella.app/shift-roster-builder/">Shift Roster Builder</a>: publish the week, your staff open one link to see their shifts, clock in and send availability. Managers <a href="/start">sign in here</a> to create a hub; staff open the team link their manager shared.</p><p>Not legal advice: check breaks, minors and predictive-scheduling rules yourself.</p></body></html>`;

// The manager console: sign in with the product's Cognito pool (hosted sign-in, code + PKCE, no client secret), then
// create teams, see them, and get fresh links. Every value from the API is written with textContent, never as HTML.
const attr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
export function consolePage({ domain, clientId }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Your team hubs</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}input{font:inherit;padding:.4rem;width:100%;box-sizing:border-box}button{font:inherit;padding:.45rem .9rem;margin:.3rem .3rem .3rem 0}li{margin:.6rem 0}code{word-break:break-all;background:#f3f3f3;padding:.1rem .3rem}.err{color:#b00020}.note{color:#555;font-size:.9rem}</style></head><body>
<h1>Your team hubs</h1><div id="app" data-cfg="${attr(JSON.stringify({ domain, clientId }))}"><p>Loading…</p></div>
<p class="note">Each hub has an admin link (yours, keep it private) and a team link (share it with staff). Only fingerprints of the links are stored, so save them when they are shown; "New links" replaces lost ones. Not legal advice: check breaks, minors and predictive-scheduling rules yourself.</p>
<script type="module">${CONSOLE_JS}</script></body></html>`;
}
// Constant, so the page's CSP can allow exactly this script by hash instead of 'unsafe-inline'.
const CONSOLE_JS = `
const app = document.getElementById("app"), CFG = JSON.parse(app.dataset.cfg), redirect = location.origin + "/auth/callback";
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const show = (...kids) => app.replaceChildren(...kids);
async function signIn() {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32))), st = b64u(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem("pkce", JSON.stringify({ verifier, st }));
  const challenge = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({ response_type: "code", client_id: CFG.clientId, redirect_uri: redirect, scope: "openid email", code_challenge_method: "S256", code_challenge: challenge, state: st });
  location.assign(CFG.domain + "/oauth2/authorize?" + q);
}
async function finishSignIn(params) {
  const saved = JSON.parse(sessionStorage.getItem("pkce") || "null");
  sessionStorage.removeItem("pkce");
  if (!saved || params.get("state") !== saved.st) throw new Error("sign-in did not match; try again");
  const r = await fetch(CFG.domain + "/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: CFG.clientId, code: params.get("code"), redirect_uri: redirect, code_verifier: saved.verifier }) });
  if (!r.ok) throw new Error("sign-in failed (" + r.status + ")");
  sessionStorage.setItem("token", (await r.json()).access_token);
  history.replaceState(null, "", "/start");
}
async function api(path, method = "GET", body) {
  const r = await fetch(path, { method, headers: { authorization: "Bearer " + sessionStorage.getItem("token"), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { sessionStorage.removeItem("token"); throw new Error("signed out; sign in again"); }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error === "subscription required" ? "You have used your free hub; more hubs need a plan (not on sale yet)." : (out.error || "failed (" + r.status + ")"));
  return out;
}
const links = (o) => el("div", {}, ...(o.admin_url ? [el("p", {}, "Admin link (yours): ", el("code", { textContent: o.admin_url }))] : []), ...(o.team_url ? [el("p", {}, "Team link (for staff): ", el("code", { textContent: o.team_url }))] : []));
async function render(extra) {
  if (!sessionStorage.getItem("token")) return show(el("p", {}, "Sign in to create a hub for your team or manage the ones you have."), el("button", { textContent: "Sign in", onclick: signIn }));
  const { teams } = await api("/api/teams");
  const name = el("input", { placeholder: "Team name, e.g. Main St cafe", maxLength: 120 }), tz = el("input", { placeholder: "Time zone, e.g. America/Denver", value: Intl.DateTimeFormat().resolvedOptions().timeZone || "" });
  const create = el("button", { textContent: "Create a hub", onclick: () => run(async () => render(links(await api("/api/teams", "POST", { name: name.value || "My team", settings: tz.value ? { TIMEZONE: tz.value } : {} })))) });
  const list = el("ul", {}, ...teams.map((t) => el("li", {}, el("strong", { textContent: t.name }), " ",
    el("button", { textContent: "New links", onclick: () => run(async () => render(links(await api("/api/teams/" + t.id + "/rotate", "POST", { which: "both" })))) }),
    el("button", { textContent: "Delete", onclick: () => confirm("Delete " + t.name + " and everything in it?") && run(async () => { await api("/api/teams/" + t.id, "DELETE"); render(); }) }))));
  show(...(extra ? [extra] : []), el("h2", { textContent: "Hubs" }), teams.length ? list : el("p", { textContent: "None yet." }), el("h2", { textContent: "New hub" }), name, tz, create,
    el("p", { className: "note" }, "Moving from a self-hosted hub? Run aws/migrate-hub.mjs from the Shift Roster Builder folder: it copies your hub's backup into a new hosted hub."));
}
const run = (fn) => fn().catch((e) => show(el("p", { className: "err", textContent: e.message }), el("button", { textContent: "Back", onclick: () => run(render) })));
const params = new URLSearchParams(location.search);
run(async () => { if (location.pathname === "/auth/callback" && params.get("code")) await finishSignIn(params); await render(); });
`;
let consoleHash;
export async function consoleScriptHash() {
  consoleHash ||= btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(CONSOLE_JS)))));
  return `'sha256-${consoleHash}'`;
}

/**
 * The database side, over anything with pg's `connect()` / `query(text, params)` (env.pg from the starter).
 * Tables: aws/migrations/001_hub_teams.sql.
 */
export function pgStore(pool) {
  return {
    async withTeam(kind, hash, lock, fn) {
      const col = kind === "admin" ? "admin_hash" : "team_hash";
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT id, state, settings FROM hub_teams WHERE ${col} = $1${lock ? " FOR UPDATE" : ""}`, [hash]);
        if (!rows.length) { await client.query("ROLLBACK"); return null; }
        const out = await fn(rows[0], async (state) => {
          await client.query("UPDATE hub_teams SET state = $2, updated_at = now() WHERE id = $1", [rows[0].id, JSON.stringify(state)]);
        });
        await client.query("COMMIT");
        return out;
      } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
    },
    async countTeams(owner) {
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM hub_teams WHERE owner_sub = $1", [owner]);
      return rows[0].n;
    },
    async createTeam({ owner, name, adminHash, teamHash, state, settings }) {
      const { rows } = await pool.query(
        "INSERT INTO hub_teams (owner_sub, name, admin_hash, team_hash, state, settings) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at",
        [owner, name, adminHash, teamHash, JSON.stringify(state), JSON.stringify(settings)]);
      return rows[0];
    },
    async listTeams(owner) {
      const { rows } = await pool.query("SELECT id, name, settings, created_at, updated_at FROM hub_teams WHERE owner_sub = $1 ORDER BY created_at", [owner]);
      return rows;
    },
    async updateTeam(owner, id, { adminHash, teamHash, settings, name }) {
      const { rows } = await pool.query(
        `UPDATE hub_teams SET admin_hash = COALESCE($3, admin_hash), team_hash = COALESCE($4, team_hash),
           settings = COALESCE($5::jsonb, settings), name = COALESCE($6, name), updated_at = now()
         WHERE owner_sub = $1 AND id = $2 RETURNING id`,
        [owner, id, adminHash ?? null, teamHash ?? null, settings ? JSON.stringify(settings) : null, name ?? null]);
      return rows.length > 0;
    },
    async deleteTeam(owner, id) {
      const { rowCount } = await pool.query("DELETE FROM hub_teams WHERE owner_sub = $1 AND id = $2", [owner, id]);
      return rowCount > 0;
    },
  };
}

// Run the self-hosted handler for one team. `row.state` is jsonb (an object from pg, or a string from a fake).
async function runHub(request, row, persist, { adminKey, teamToken, origin }) {
  const state = loadState(typeof row.state === "string" ? JSON.parse(row.state) : row.state);
  const settings = typeof row.settings === "string" ? JSON.parse(row.settings) : row.settings || {};
  let dirty = false;
  const save = () => {
    if (JSON.stringify(state).length > MAX_STATE) { state.history = (state.history || []).slice(-4); trimPunches(state, 1500, Date.now()); }
    dirty = true;
  };
  const env = { ...cleanSettings(settings), ADMIN_KEY: adminKey, TEAM_TOKEN: teamToken, BUILD_IN_BROWSER: "1", PUBLIC_URL: origin };
  const res = await serve(handler(state, save, env, Date.now, null), request);
  if (dirty) await persist(state);
  return res;
}

async function readJson(request, limit) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > limit) return { error: "too large" };
  const body = await request.text();
  if (body.length > limit) return { error: "too large" };
  if (!body) return { value: {} };
  try { return { value: JSON.parse(body) }; } catch { return { error: "not JSON" }; }
}

export function makeApp({ store: storeFor = (env) => pgStore(env.pg) } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const p = url.pathname;
      const store = storeFor(env);
      const vars = env.VARS || {};
      if (p === "/healthz") return text("ok\n");
      if (p === "/" && request.method === "GET") return text(LANDING, 200, "text/html; charset=utf-8");
      if ((p === "/start" || p === "/auth/callback") && request.method === "GET") {
        const a = env.AUTH || {};
        if (!a.domain || !a.webClientId) return text("Sign-in is not configured here.\n", 503);
        return new Response(consolePage({ domain: a.domain, clientId: a.webClientId }), { headers: {
          "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
          "content-security-policy": `default-src 'none'; script-src ${await consoleScriptHash()}; style-src 'unsafe-inline'; connect-src 'self' ${a.domain}; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
        } });
      }
      if (STATIC[p] && request.method === "GET") {
        const body = await staticFile(STATIC[p]);
        return body == null ? text("not found\n", 404) : text(body, 200, "text/javascript; charset=utf-8");
      }

      const isAdmin = p === "/admin" || p.startsWith("/admin/"), isTeam = p === "/team" || p.startsWith("/team/");
      if (isAdmin || isTeam) {
        const secret = url.searchParams.get(isAdmin ? "key" : "t") || "";
        if (secret.length < 20 || secret.length > 200) return text("link required\n", 401);
        const lock = request.method !== "GET" && request.method !== "HEAD";
        const out = await store.withTeam(isAdmin ? "admin" : "team", await sha256(secret), lock, (row, persist) =>
          // The other secret is never needed for this side's pages; a fresh random value keeps the handler's
          // "both set" check satisfied without storing it.
          runHub(request, row, persist, { adminKey: isAdmin ? secret : newKey(), teamToken: isAdmin ? newKey() : secret, origin: url.origin }));
        return out || text("link required\n", 401);
      }

      if (!p.startsWith("/api/")) return text("not found\n", 404);
      if (!env.user?.sub) return json({ error: "sign in" }, 401);   // the JWT authorizer already enforces this
      const owner = env.user.sub;

      if (p === "/api/teams" && request.method === "GET") return json({ teams: await store.listTeams(owner) });

      if (p === "/api/teams" && request.method === "POST") {
        const body = await readJson(request, MAX_IMPORT);
        if (body.error) return json({ error: body.error }, body.error === "too large" ? 413 : 400);
        const { name = "My team", settings, state } = body.value || {};
        const have = await store.countTeams(owner);
        if (have >= MAX_TEAMS_PER_USER) return json({ error: `at most ${MAX_TEAMS_PER_USER} teams per account` }, 409);
        // The paid gate ships dark: FREE_TEAMS (module vars) teams per account without a plan; more need one.
        const free = Number(vars.FREE_TEAMS ?? 1);
        if (have >= free) {
          const ent = await env.entitlement();
          if (!ent.entitled) return json({ error: "subscription required", status: ent.status, free_teams: free }, 402);
        }
        if (state !== undefined && (!state || typeof state !== "object" || Array.isArray(state))) return json({ error: "state must be the object from /admin/export.json" }, 400);
        const loaded = loadState(state);
        if (JSON.stringify(loaded).length > MAX_STATE) return json({ error: "state too large" }, 413);
        const adminKey = newKey(), teamToken = newKey();
        const row = await store.createTeam({ owner, name: String(name).slice(0, 120), adminHash: await sha256(adminKey), teamHash: await sha256(teamToken), state: loaded, settings: cleanSettings(settings) });
        return json({
          id: row.id,
          admin_url: `${url.origin}/admin?key=${encodeURIComponent(adminKey)}`,
          team_url: `${url.origin}/team?t=${encodeURIComponent(teamToken)}`,
          note: "Save both links now: only their hashes are kept. Rotate them from /api/teams/<id>/rotate if one leaks or is lost.",
        }, 201);
      }

      const m = p.match(/^\/api\/teams\/([0-9a-f-]{36})(\/rotate)?$/);
      if (m && m[2] && request.method === "POST") {
        const body = await readJson(request, 10_000);
        if (body.error) return json({ error: body.error }, 400);
        const which = body.value?.which || "both";
        if (!["admin", "team", "both"].includes(which)) return json({ error: "which: admin | team | both" }, 400);
        const adminKey = which !== "team" ? newKey() : null, teamToken = which !== "admin" ? newKey() : null;
        const ok = await store.updateTeam(owner, m[1], { adminHash: adminKey && await sha256(adminKey), teamHash: teamToken && await sha256(teamToken) });
        if (!ok) return json({ error: "not found" }, 404);
        return json({
          ...(adminKey ? { admin_url: `${url.origin}/admin?key=${encodeURIComponent(adminKey)}` } : {}),
          ...(teamToken ? { team_url: `${url.origin}/team?t=${encodeURIComponent(teamToken)}` } : {}),
        });
      }
      if (m && !m[2] && request.method === "PATCH") {
        const body = await readJson(request, 20_000);
        if (body.error) return json({ error: body.error }, 400);
        const ok = await store.updateTeam(owner, m[1], { settings: body.value?.settings ? cleanSettings(body.value.settings) : null, name: body.value?.name ? String(body.value.name).slice(0, 120) : null });
        return ok ? json({ ok: true }) : json({ error: "not found" }, 404);
      }
      if (m && !m[2] && request.method === "DELETE") {
        return (await store.deleteTeam(owner, m[1])) ? json({ ok: true }) : json({ error: "not found" }, 404);
      }
      return json({ error: "not found" }, 404);
    },
  };
}

export default makeApp();
