#!/usr/bin/env node
// Self-hosted error tracking. Zero dependencies; state in one JSON file.
//   INGEST_KEY=... ADMIN_KEY=... [ALLOWED_ORIGINS=https://app.example.com] [ALERT_WEBHOOK_URL=https://...] node server.mjs
// INGEST_KEY is meant to sit in your front-end code: it can only send events. ADMIN_KEY reads and manages issues.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual, createHmac } from "node:crypto";
import * as E from "./engine.mjs";

const env = process.env;
const readBody = (req, max = 200_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const same = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && timingSafeEqual(x, y); };
const bearer = (req) => (req.headers.authorization || "").replace(/^Bearer /, "");

/** POSTs an alert to your own URL, signed: x-keeper-signature = sha256=HMAC(secret, body). `text` makes it a valid Slack/Discord-style incoming webhook too. */
export function webhookSender({ url, secret, fetchImpl = fetch }) {
  return async (alert) => {
    const body = JSON.stringify({ ...alert, content: alert.text }), headers = { "content-type": "application/json", "user-agent": "error-keeper" };
    if (secret) headers["x-keeper-signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const r = await fetchImpl(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
  };
}
const brief = (i) => `${i.type}: ${i.title}`.slice(0, 160);
export const alertFor = (kind, i, extra = {}) => ({ type: `issue.${kind}`, text: `[error-keeper] ${kind === "new" ? "New error" : kind === "regressed" ? "Regression" : "Spike"} in ${i.project}: ${brief(i)}`, issue: i.id, project: i.project, count: i.count, users: i.userCount, release: i.lastRelease || null, ...extra });

// cfg: {state, save, ingestKey, adminKey, allowedOrigins, send, sdk, now}
export function handler(cfg) {
  const now = cfg.now || Date.now, hits = new Map();
  const allowed = (origin) => !cfg.allowedOrigins?.length || (origin && cfg.allowedOrigins.includes(origin));
  // One alert per (kind, issue, hour or regression); a failed send is forgotten so the next event for the issue retries it.
  const notify = (a) => {
    const k = [a.type, a.issue, a.hour, a.since].join("|");
    if (!cfg.send || cfg.state.alerted[k]) return;
    cfg.state.alerted[k] = now();
    cfg.send(a).catch((e) => { delete cfg.state.alerted[k]; console.error("alert failed:", e.message); });
  };
  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname, q = url.searchParams, origin = req.headers.origin;
    const cors = origin && allowed(origin) ? { "access-control-allow-origin": origin, vary: "origin" } : {};
    const json = (code, body) => { res.writeHead(code, { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(body, null, 2)); };
    try {
      if (path === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok\n"); }
      if (req.method === "GET" && /^\/sdk\.(mjs|js)$/.test(path) && cfg.sdk) { res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" }); return res.end(cfg.sdk[path.slice(5)]); }
      if (req.method === "GET" && path === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'" }); return res.end(cfg.dashboard || "error-keeper"); }
      if (req.method === "OPTIONS" && path === "/v1/events") { res.writeHead(204, { ...cors, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type, authorization", "access-control-max-age": "600" }); return res.end(); }

      if (req.method === "POST" && path === "/v1/events") {
        if (!same(bearer(req) || q.get("key"), cfg.ingestKey) && !same(bearer(req), cfg.adminKey)) return json(401, { error: "bad ingest key" });
        if (!allowed(origin)) return json(403, { error: "origin not allowed" });
        // Per-minute cap so one crash loop cannot fill the disk or the alert channel.
        const minute = Math.floor(now() / 60_000); for (const k of hits.keys()) if (k !== minute) hits.delete(k);
        const n = (hits.get(minute) || 0) + 1; hits.set(minute, n);
        if (n > (cfg.perMinute || 600)) return json(429, { error: "rate limit: events are being dropped for this minute" });
        const raw = await readBody(req), b = JSON.parse(raw || "{}"), list = Array.isArray(b.events) ? b.events : [b];
        if (list.length === 0 || list.length > 50) return json(400, { error: "send one event or {events:[...]} with up to 50" });
        const results = list.map((ev) => {
          try {
            const r = E.ingest(cfg.state, ev, now());
            if (r.duplicate) return { status: "duplicate" };
            const i = r.issue;
            if (r.isNew || (!cfg.state.alerted[["issue.new", i.id].join("|") + "||"] && now() - i.firstSeen < 6 * E.DAY && i.count < 1000)) notify(alertFor("new", i));
            if (r.regressed || (i.regressedAt && now() - i.regressedAt < 6 * E.DAY)) notify(alertFor("regressed", i, { since: i.regressedAt }));
            const sp = E.spike(i, now()); if (sp) notify(alertFor("spike", i, { spike: sp, hour: Math.floor(now() / E.HOUR) }));
            return { status: r.isNew ? "new" : r.regressed ? "regressed" : "grouped", issue: r.issue.id };
          } catch (e) { if (e.status !== 400) throw e; return { status: "rejected", error: e.message }; }
        });
        cfg.save();
        return json(results.every((r) => r.status === "rejected") ? 400 : 202, { results });
      }

      if (path.startsWith("/v1/")) {
        if (!same(bearer(req), cfg.adminKey)) return json(401, { error: "bad admin key" });
        let m;
        if (req.method === "GET" && path === "/v1/issues") return json(200, { issues: E.list(cfg.state, { project: q.get("project") || undefined, status: q.get("status") || "unresolved", now: now(), limit: Math.max(1, Math.min(200, Number(q.get("limit")) || 50)) }) });
        if (req.method === "GET" && (m = path.match(/^\/v1\/issues\/([0-9a-f]+)$/))) { const i = cfg.state.issues[m[1]]; return i ? json(200, { ...i, users: undefined, spike: E.spike(i, now()) }) : json(404, { error: "unknown issue" }); }
        if (req.method === "POST" && (m = path.match(/^\/v1\/issues\/([0-9a-f]+)\/(resolve|ignore|reopen)$/))) {
          const b = JSON.parse((await readBody(req)) || "{}");
          const i = m[2] === "resolve" ? E.resolve(cfg.state, m[1], b.release) : m[2] === "ignore" ? E.ignore(cfg.state, m[1]) : E.reopen(cfg.state, m[1]);
          cfg.save(); return json(200, { id: i.id, status: i.status, resolvedInRelease: i.resolvedInRelease ?? null });
        }
        if (req.method === "GET" && path === "/v1/releases") return json(200, { releases: E.releases(cfg.state, q.get("project") || undefined) });
      }
      return json(404, { error: "not found" });
    } catch (e) {
      const code = e instanceof SyntaxError ? 400 : e.status || 500; if (code === 500) console.error(e);
      return json(code, { error: code === 500 ? "server error" : e instanceof SyntaxError ? "body is not valid JSON" : e.message });
    }
  };
}

export function loadState(file) { try { return { ...E.newState(), ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { return E.newState(); } }

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const k of ["INGEST_KEY", "ADMIN_KEY"]) if (!env[k] || env[k].length < 16) { console.error(`Set ${k} (16+ characters).`); process.exit(1); }
  if (env.INGEST_KEY === env.ADMIN_KEY) { console.error("INGEST_KEY ships in your front end; ADMIN_KEY must be a different secret."); process.exit(1); }
  const file = env.STATE || "/tmp/state.json", state = loadState(file), read = (n) => fs.readFileSync(new URL(n, import.meta.url), "utf8");
  let dirty = false, timer = null;
  // Writes are coalesced: a crash loop of 600 events a minute rewrites the file at most once a second.
  const save = () => { dirty = true; timer ||= setTimeout(flush, 1000).unref(); };
  const flush = () => { timer = null; if (!dirty) return; dirty = false; fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  process.on("SIGTERM", () => { flush(); process.exit(0); });
  const send = env.ALERT_WEBHOOK_URL ? webhookSender({ url: env.ALERT_WEBHOOK_URL, secret: env.ALERT_WEBHOOK_SECRET }) : null;
  const origins = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  http.createServer(handler({ state, save, ingestKey: env.INGEST_KEY, adminKey: env.ADMIN_KEY, allowedOrigins: origins, send, perMinute: Number(env.MAX_EVENTS_PER_MINUTE) || 600, sdk: { js: read("./browser-sdk.js"), mjs: read("./sdk.mjs") }, dashboard: read("./dashboard.html") })).listen(Number(env.PORT) || 8080, () => console.log(`error-keeper on :${env.PORT || 8080}`));
  setInterval(() => { E.prune(state, Date.now()); save(); }, 3_600_000).unref();
}
