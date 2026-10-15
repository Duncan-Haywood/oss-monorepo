#!/usr/bin/env node
// Self-hosted webhook relay. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... ROUTES_JSON='[{"name":"stripe","scheme":"stripe","secret":"whsec_...","target":"https://app.example.com/hooks/stripe"}]' node server.mjs
// Providers POST to  <PUBLIC_URL>/in/<route-name>. The relay checks the
// signature, saves the event to disk BEFORE answering 200, then delivers it to
// the route's target with retries, so your app can be down or mid-deploy
// without losing a webhook. Replay any event from the dashboard at /admin.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { verify, SCHEMES } from "./verify.mjs";
import { DEFAULT_POLICY, newState, ingest, due, throttle, recordAttempt, replay, summary } from "./relay.mjs";
import { ADMIN_HTML } from "./admin.mjs";
import { validateFilter, matches } from "./filter.mjs";

const env = process.env;
const MAX_BODY = 1_000_000;
const SKIP_FORWARD = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade", "accept-encoding", "authorization", "cookie"]);

const NO_SET = new Set([...SKIP_FORWARD, "x-relay-event-id", "x-relay-attempt"].filter((h) => h !== "authorization"));

// "Bearer ${APP_TOKEN}" -> the env var's value, resolved once at start so a typo fails loudly.
function expandHeaders(h, env, what) {
  if (h === undefined) return undefined;
  if (!h || typeof h !== "object" || Array.isArray(h)) throw new Error(`${what}: headers must be an object of header name to value`);
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    const name = k.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(name) || typeof v !== "string") throw new Error(`${what}: bad header ${k}`);
    if (NO_SET.has(name)) throw new Error(`${what}: header ${k} is set by the relay and cannot be overridden`);
    out[name] = v.replace(/\$\{([A-Z0-9_]+)\}/g, (_, n) => {
      if (env[n] === undefined) throw new Error(`${what}: header ${k} uses \${${n}} but that environment variable is not set`);
      return env[n];
    });
  }
  return out;
}

export function parseRoutes(json, envVars = {}) {
  const routes = JSON.parse(json || "[]");
  if (!Array.isArray(routes) || !routes.length) throw new Error("ROUTES_JSON must be a non-empty array");
  const seen = new Set();
  return routes.map((r) => {
    if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(r.name || "")) throw new Error(`bad route name: ${r.name}`);
    if (seen.has(r.name)) throw new Error(`duplicate route: ${r.name}`);
    seen.add(r.name);
    if (!SCHEMES.includes(r.scheme || "none")) throw new Error(`route ${r.name}: unknown scheme ${r.scheme}`);
    if ((r.scheme || "none") !== "none" && !r.secret) throw new Error(`route ${r.name}: scheme ${r.scheme} needs a secret`);
    const raw = r.targets !== undefined ? r.targets : [r.target];
    if (!Array.isArray(raw) || !raw.length || raw.length > 10) throw new Error(`route ${r.name}: target must be an http(s) URL (or targets: up to 10 http(s) URLs)`);
    // A target is a URL, or {"url": ..., "filter": ...} to receive only matching events.
    const targets = raw.map((t) => (typeof t === "string" ? { url: t } : t));
    if (!targets.every((t) => t && /^https?:\/\//.test(t.url || ""))) throw new Error(`route ${r.name}: target must be an http(s) URL (or targets: up to 10 http(s) URLs)`);
    if (r.filter !== undefined) validateFilter(r.filter, `route ${r.name} filter`);
    for (const t of targets) if (t.filter !== undefined) validateFilter(t.filter, `route ${r.name} target ${t.url} filter`);
    // rateLimitPerMinute (route-wide, or per target) caps delivery attempts to a URL per rolling minute.
    const rate = (v, what) => {
      if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= 6000)) throw new Error(`${what}: rateLimitPerMinute must be a whole number from 1 to 6000`);
      return v;
    };
    rate(r.rateLimitPerMinute, `route ${r.name}`);
    for (const t of targets) rate(t.rateLimitPerMinute, `route ${r.name} target ${t.url}`);
    // headers (route-wide, or per target) are added to every delivery, e.g. an Authorization the receiver wants.
    const routeHeaders = expandHeaders(r.headers, envVars, `route ${r.name}`);
    const withHeaders = targets.map((t) => {
      const h = { ...routeHeaders, ...expandHeaders(t.headers, envVars, `route ${r.name} target ${t.url}`) };
      return Object.keys(h).length ? { ...t, headers: h } : { ...t, headers: undefined };
    });
    return { scheme: "none", ...r, headers: undefined, targets: withHeaders, target: targets[0].url };
  });
}

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

const bearerOk = (req, key) => {
  const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`);
  return Boolean(key) && a.length === b.length && timingSafeEqual(a, b);
};

const publicEvent = ({ bodyB64, headers, ...e }, full) => (full ? { ...e, headers, bodyB64 } : e);

// cfg: {state, save, routes, adminKey, policy, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const policy = cfg.policy || DEFAULT_POLICY;
  const byName = Object.fromEntries(cfg.routes.map((r) => [r.name, r]));
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
    };
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
      if (url.pathname === "/admin") return send(200, ADMIN_HTML, "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'", "referrer-policy": "no-referrer" });
      if (req.method === "POST" && url.pathname.startsWith("/in/")) {
        const route = byName[url.pathname.slice(4)];
        if (!route) return send(404, "unknown route\n", "text/plain");
        const body = await readBody(req);
        const v = verify(route.scheme, { headers: req.headers, body, secret: route.secret, nowSec: Math.floor(now() / 1000), header: route.header });
        if (!v.ok) { console.log(`rejected ${route.name}: ${v.reason}`); return send(401, `signature check failed: ${v.reason}\n`, "text/plain"); }
        const forward = {};
        for (const [k, val] of Object.entries(req.headers)) if (!SKIP_FORWARD.has(k) && typeof val === "string") forward[k] = val;
        const ctx = { headers: req.headers, bodyText: body.toString("utf8") };
        if (!matches(route.filter, ctx)) return send(200, { filtered: true, ids: [] });
        const urls = (route.targets || [{ url: route.target }]).filter((t) => matches(t.filter, ctx)).map((t) => t.url);
        if (!urls.length) return send(200, { filtered: true, ids: [] });
        const r = ingest(cfg.state, { route: route.name, targets: urls, headers: forward, body, now: now(), policy });
        if (!r.duplicate) cfg.save();
        return send(200, r);
      }
      if (url.pathname.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return send(401, "admin key required\n", "text/plain");
        const parts = url.pathname.slice(4).split("/");
        if (req.method === "GET" && parts[0] === "summary") return send(200, summary(cfg.state));
        if (req.method === "GET" && parts[0] === "events" && !parts[1]) {
          const status = url.searchParams.get("status"), route = url.searchParams.get("route");
          const list = Object.values(cfg.state.events)
            .filter((e) => (!status || e.status === status) && (!route || e.route === route))
            .sort((a, b) => b.receivedAt - a.receivedAt).slice(0, 200).map((e) => publicEvent(e, false));
          return send(200, list);
        }
        const e = parts[0] === "events" && cfg.state.events[parts[1]];
        if (parts[0] === "events" && parts[1] && !e) return send(404, "no such event\n", "text/plain");
        if (req.method === "GET" && e && !parts[2]) return send(200, publicEvent(e, true));
        if (req.method === "POST" && e && parts[2] === "replay") { replay(cfg.state, e.id, now()); cfg.save(); return send(200, publicEvent(e, false)); }
        if (req.method === "DELETE" && e && !parts[2]) { delete cfg.state.events[e.id]; cfg.save(); return send(200, { deleted: e.id }); }
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e.status || 500, "error\n", "text/plain");
    }
  };
}

// URL -> attempts per minute, the lowest cap any route or target sets for it.
export function rateLimits(routes) {
  const out = {};
  for (const r of routes) for (const t of r.targets) {
    const cap = t.rateLimitPerMinute ?? r.rateLimitPerMinute;
    if (cap) out[t.url] = Math.min(out[t.url] ?? Infinity, cap);
  }
  return out;
}

// URL -> extra headers to send with each delivery (secrets stay in memory, never in the state file).
export function deliveryHeaders(routes) {
  const out = {};
  for (const r of routes) for (const t of r.targets) if (t.headers) out[t.url] = { ...out[t.url], ...t.headers };
  return out;
}

// One delivery pass. deps: {fetch, alert, timeoutMs, concurrency, limits, extraHeaders}. Returns log lines.
export async function tick(state, now, deps) {
  const doFetch = deps.fetch || fetch;
  const log = [];
  const queue = throttle(state, due(state, now), now, deps.limits);
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const started = Date.now();
      let result;
      try {
        const res = await doFetch(e.target, {
          method: "POST",
          headers: { ...e.headers, ...deps.extraHeaders?.[e.target], "x-relay-event-id": e.id, "x-relay-attempt": String(e.attempts.length + 1) },
          body: Buffer.from(e.bodyB64, "base64"),
          redirect: "manual",
          signal: AbortSignal.timeout(deps.timeoutMs || 10_000),
        });
        result = { status: res.status, ms: Date.now() - started, retryAfter: res.headers.get("retry-after") };
      } catch (err) {
        result = { status: 0, ms: Date.now() - started, error: String(err.message || err).slice(0, 200) };
      }
      const verdict = recordAttempt(state, e.id, result, now, deps.policy || DEFAULT_POLICY);
      log.push(`${e.id} ${e.route} -> ${result.status || result.error} (${verdict}, attempt ${e.attempts.length})`);
      if (verdict === "dead" && deps.alert) await deps.alert(`webhook-relay: ${e.id} on route "${e.route}" is dead after ${e.attempts.length} attempt(s) (last: ${result.status || result.error}). Replay it from /admin once the receiver is fixed.`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(deps.concurrency || 4, queue.length) }, worker));
  return log;
}

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

async function alert(text) {
  console.log(text);
  if (env.ALERT_WEBHOOK_URL) await fetch(env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) }).catch(() => {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY) { console.error("missing env: ADMIN_KEY"); process.exit(1); }
  let routes;
  try { routes = parseRoutes(env.ROUTES_JSON, env); } catch (e) { console.error(`ROUTES_JSON: ${e.message}`); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = readJson(statePath, newState());
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const deps = { alert, limits: rateLimits(routes), extraHeaders: deliveryHeaders(routes) };
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { const log = await tick(state, Date.now(), deps); log.forEach((l) => console.log(l)); if (log.length) save(); } catch (e) { console.error("tick failed:", e.message); } finally { busy = false; }
  }, 2000).unref?.();
  http.createServer(handler({ state, save, routes, adminKey: env.ADMIN_KEY })).listen(Number(env.PORT || 8080), () =>
    console.log(`webhook-relay on :${env.PORT || 8080} with ${routes.length} route(s): ${routes.map((r) => r.name).join(", ")}`));
}
