#!/usr/bin/env node
// Self-hosted feature flags: percentage rollouts, targeting rules, segments, prerequisites, audit log.
//   ADMIN_KEY=... SERVER_KEY=... CLIENT_KEY=... FLAGS_FILE=examples/flags.json node server.mjs
// Keys: ADMIN_KEY edits flags; SERVER_KEY reads the full config (for local evaluation in your backend);
// CLIENT_KEY may only ask "what does this user get?", so it is safe to ship in a web or mobile app.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import * as E from "./engine.mjs";

const env = process.env;
const readBody = (req, max = 200_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const bearerOk = (req, ...keys) => keys.some((k) => Boolean(k) && same(req.headers.authorization || "", `Bearer ${k}`));
const parseJson = (raw) => { try { return JSON.parse(raw || "{}"); } catch { throw Object.assign(new Error("body is not valid JSON"), { status: 400 }); } };
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

export function limiter(max = 3000, windowMs = 60_000) {
  const hits = new Map();
  return (ip, now) => { const w = Math.floor(now / windowMs), h = hits.get(ip); if (!h || h.w !== w) { hits.set(ip, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; } return ++h.n <= max; };
}

export const newState = () => ({ version: 1, salt: "", flags: {}, segments: {}, audit: [], counts: {} });
export function loadState(file, seed) {
  try { return { ...newState(), ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { /* first start */ }
  const s = newState();
  if (seed) { const errs = E.validateConfig(seed); if (errs.length) throw new Error(`FLAGS_FILE is invalid: ${errs.join("; ")}`); s.flags = structuredClone(seed.flags || {}); s.segments = structuredClone(seed.segments || {}); s.salt = seed.salt || ""; }
  return s;
}
const configOf = (st) => ({ version: st.version, salt: st.salt, flags: st.flags, segments: st.segments });

// cfg: {state, save, adminKey, serverKey, clientKey, now, allow, origins, assets}
export function handler(cfg) {
  const now = cfg.now || Date.now, allow = cfg.allow || limiter(), st = cfg.state;
  const streams = new Set();
  const publish = () => { for (const r of streams) r.write(`event: config\ndata: ${JSON.stringify({ version: st.version })}\n\n`); };
  const record = (actor, action, target, before, after) => {
    st.audit.push({ at: new Date(now()).toISOString(), actor: String(actor || "admin").slice(0, 80), action, target, before: before ?? null, after: after ?? null });
    if (st.audit.length > 500) st.audit.splice(0, st.audit.length - 500);
    st.version++; cfg.save(); publish();
  };
  const check = (next) => { const errs = E.validateConfig(next); if (errs.length) throw fail(400, errs[0], { errors: errs }); };
  const count = (r) => { if (!r.variant) return; const c = (st.counts[r.flag] ||= {}); const k = `${r.variant}`; c[k] = (c[k] || 0) + 1; };
  const handle = async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname;
    const origin = cfg.origins || "*";
    const reply = (code, body, type = "application/json", extra = {}) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2)); };
    const json = (c, b, extra) => reply(c, b, "application/json", extra);
    const cors = { "access-control-allow-origin": origin, vary: "origin" };
    const ip = (cfg.trustProxy ? (req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "") || req.socket.remoteAddress || "";
    try {
      if (path === "/healthz") return reply(200, "ok\n", "text/plain");
      if (req.method === "OPTIONS") return reply(204, "", "text/plain", { ...cors, "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST", "access-control-max-age": "600" });
      if (req.method === "GET" && cfg.assets && cfg.assets[path]) return reply(200, cfg.assets[path], "text/javascript; charset=utf-8", { ...cors, "cache-control": "public, max-age=300" });

      // Evaluation: client, server or admin key.
      if (req.method === "POST" && (path === "/v1/evaluate" || path === "/v1/evaluate-all")) {
        if (!bearerOk(req, cfg.clientKey, cfg.serverKey, cfg.adminKey)) return json(401, { error: "bad key" }, cors);
        if (!allow(ip, now())) return json(429, { error: "slow down" }, cors);
        const b = parseJson(await readBody(req)), ctx = b.context;
        if (!ctx || typeof ctx !== "object" || ctx.key === undefined || ctx.key === "") return json(400, { error: "context.key is required (a stable user or account id)" }, cors);
        if (path === "/v1/evaluate") {
          if (typeof b.flag !== "string") return json(400, { error: "flag is required" }, cors);
          const r = E.evaluate(configOf(st), b.flag, ctx); count(r);
          return json(r.reason === "not_found" ? 404 : 200, r, cors);
        }
        const out = E.evaluateAll(configOf(st), ctx);
        for (const [flag, v] of Object.entries(out)) count({ flag, variant: v.variant });
        return json(200, { version: st.version, flags: out }, cors);
      }

      // Server-side SDK: full config with ETag, and a change stream.
      if (req.method === "GET" && (path === "/v1/config" || path === "/v1/stream")) {
        if (!bearerOk(req, cfg.serverKey, cfg.adminKey)) return json(401, { error: "bad key" });
        if (path === "/v1/stream") {
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
          res.write(`event: config\ndata: ${JSON.stringify({ version: st.version })}\n\n`);
          streams.add(res); req.on("close", () => streams.delete(res)); return;
        }
        const tag = `"${st.version}"`;
        if (req.headers["if-none-match"] === tag) return reply(304, "", "text/plain", { etag: tag });
        return json(200, configOf(st), { etag: tag });
      }

      if (path.startsWith("/v1/admin")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        const a = path.slice(9), actor = req.headers["x-actor"]; let m;
        if (req.method === "GET" && a === "/config") return json(200, configOf(st));
        if (req.method === "GET" && a === "/audit") return json(200, { audit: st.audit.slice(-Math.min(Number(url.searchParams.get("limit")) || 100, 500)).reverse() });
        if (req.method === "GET" && a === "/stats") return json(200, { version: st.version, flags: Object.keys(st.flags).length, segments: Object.keys(st.segments).length, evaluations: st.counts });
        if (req.method === "PUT" && a === "/config") {
          const b = parseJson(await readBody(req, 2_000_000)); const next = { salt: b.salt ?? st.salt, flags: b.flags || {}, segments: b.segments || {} };
          check(next); const before = configOf(st); st.flags = next.flags; st.segments = next.segments; st.salt = next.salt;
          record(actor, "replace-config", "*", { flags: Object.keys(before.flags) }, { flags: Object.keys(st.flags) });
          return json(200, { version: st.version, flags: Object.keys(st.flags).length });
        }
        if (req.method === "POST" && a === "/impact") {
          const b = parseJson(await readBody(req)); if (typeof b.flag !== "string" || typeof b.proposed !== "object") throw fail(400, "send {flag, proposed: <flag object>, users?, attrs?}");
          const after = { ...configOf(st), flags: { ...st.flags, [b.flag]: { ...b.proposed, key: b.flag } } }; check(after);
          return json(200, E.impact(configOf(st), after, b.flag, { users: Math.min(Number(b.users) || 10000, 100000), attrs: b.attrs || {} }));
        }
        if ((m = a.match(/^\/flags\/([^/]+)$/))) {
          const key = decodeURIComponent(m[1]);
          if (req.method === "GET") return st.flags[key] ? json(200, st.flags[key]) : json(404, { error: "no such flag" });
          if (req.method === "PUT") {
            const f = parseJson(await readBody(req)); f.key = key; const before = st.flags[key];
            check({ ...configOf(st), flags: { ...st.flags, [key]: f } }); st.flags[key] = f;
            record(actor, before ? "update-flag" : "create-flag", key, before, f); return json(200, f);
          }
          if (req.method === "DELETE") {
            if (!st.flags[key]) throw fail(404, "no such flag");
            const users = Object.values(st.flags).filter((f) => (f.prerequisites || []).some((p) => p.flag === key)).map((f) => f.key);
            if (users.length) throw fail(409, `flag ${key} is a prerequisite of ${users.join(", ")}; remove that first`);
            const before = st.flags[key]; delete st.flags[key]; delete st.counts[key]; record(actor, "delete-flag", key, before, null); return json(200, { deleted: key });
          }
        }
        if (req.method === "POST" && (m = a.match(/^\/flags\/([^/]+)\/toggle$/))) {
          const key = decodeURIComponent(m[1]), f = st.flags[key]; if (!f) throw fail(404, "no such flag");
          const b = parseJson(await readBody(req)); const before = { ...f }; f.enabled = typeof b.enabled === "boolean" ? b.enabled : !f.enabled;
          record(actor, f.enabled ? "enable-flag" : "disable-flag", key, { enabled: before.enabled }, { enabled: f.enabled }); return json(200, f);
        }
        if ((m = a.match(/^\/segments\/([^/]+)$/))) {
          const key = decodeURIComponent(m[1]);
          if (req.method === "PUT") {
            const s = parseJson(await readBody(req)); const before = st.segments[key];
            check({ ...configOf(st), segments: { ...st.segments, [key]: s } }); st.segments[key] = s;
            record(actor, before ? "update-segment" : "create-segment", key, before, s); return json(200, s);
          }
          if (req.method === "DELETE") {
            if (!st.segments[key]) throw fail(404, "no such segment");
            const before = st.segments[key], rest = { ...st.segments }; delete rest[key];
            check({ ...configOf(st), segments: rest }); // refuses while a rule still uses it
            st.segments = rest; record(actor, "delete-segment", key, before, null); return json(200, { deleted: key });
          }
        }
        return json(404, { error: "not found" });
      }
      return reply(404, "Not found\n", "text/plain");
    } catch (e) {
      const code = e.status || 500; if (code === 500) console.error(e);
      return json(code, { error: code === 500 ? "server error" : e.message, ...(e.errors ? { errors: e.errors } : {}) }, { "access-control-allow-origin": cfg.origins || "*" });
    }
  };
  handle.streams = streams;
  return handle;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16) { console.error("Set ADMIN_KEY (16+ characters)."); process.exit(1); }
  for (const k of ["SERVER_KEY", "CLIENT_KEY"]) if (env[k] && env[k].length < 16) { console.error(`${k} must be 16+ characters (or unset).`); process.exit(1); }
  if (!env.CLIENT_KEY) console.warn("CLIENT_KEY is not set: web and mobile apps cannot evaluate flags (the admin key must never ship in an app).");
  const file = env.STATE || "/tmp/flags.json";
  let seed = null; if (env.FLAGS_FILE) { try { seed = JSON.parse(fs.readFileSync(env.FLAGS_FILE, "utf8")); } catch (e) { console.error(`cannot read FLAGS_FILE: ${e.message}`); process.exit(1); } }
  const state = loadState(file, seed);
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  const here = (n) => fs.readFileSync(new URL(`./${n}`, import.meta.url), "utf8");
  const assets = { "/engine.mjs": here("engine.mjs"), "/sdk.mjs": here("sdk.mjs") };
  const h = handler({ state, save, adminKey: env.ADMIN_KEY, serverKey: env.SERVER_KEY, clientKey: env.CLIENT_KEY, origins: env.ALLOWED_ORIGINS, trustProxy: env.TRUST_PROXY === "true", assets });
  const srv = http.createServer(h).listen(Number(env.PORT) || 8080, () => console.log(`flag-keeper on :${env.PORT || 8080} (${Object.keys(state.flags).length} flags)`));
  setInterval(() => { for (const r of h.streams) r.write(": ping\n\n"); }, 25_000).unref();
  setInterval(() => { try { save(); } catch (e) { console.error(`save failed: ${e.message}`); } }, 60_000).unref(); // evaluation counters
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { try { save(); } catch {} srv.close(); process.exit(0); });
}
