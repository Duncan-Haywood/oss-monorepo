#!/usr/bin/env node
// Self-hosted uptime monitor + public status page. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... TITLE="Acme" MONITORS_JSON='[{"id":"site","name":"Website","url":"https://example.com"}]' node server.mjs
// GET /            the public status page (90-day bars, incidents, maintenance)
// GET /api/status.json, /feed.xml, /badge.svg   for machines, feed readers and READMEs
// POST /ping/<id>?token=...   heartbeat for cron jobs (monitors of type "push")
// POST /subscribe, GET /confirm?t=, GET|POST /unsubscribe?t=   email notices (only when RESEND_API_KEY + MAIL_FROM are set)
// POST /v1/incidents, /v1/incidents/<id>/updates, /v1/maintenance   admin API (Bearer ADMIN_KEY)
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { DEFAULTS, newState, recordCheck, recordPing, pushResult, createIncident, addUpdate, scheduleMaintenance, overall, LABELS, COLORS, humanDuration } from "./monitor.mjs";
import { statusPage, statusJson, atomFeed, badgeSvg, messagePage } from "./render.mjs";
import { subscribe, confirm, unsubscribe, activeCount, confirmationMail, notifyAll } from "./subscribers.mjs";

const env = process.env;

export function parseMonitors(json) {
  const list = JSON.parse(json || "[]");
  if (!Array.isArray(list) || !list.length) throw new Error("MONITORS_JSON must be a non-empty array");
  const seen = new Set();
  return list.map((m) => {
    if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(m.id || "")) throw new Error(`bad monitor id: ${m.id}`);
    if (seen.has(m.id)) throw new Error(`duplicate monitor: ${m.id}`);
    seen.add(m.id);
    const type = m.type || "http";
    if (type === "http" && !/^https?:\/\//.test(m.url || "")) throw new Error(`monitor ${m.id}: url must be http(s)`);
    if (type === "push" && !(m.token && String(m.token).length >= 12)) throw new Error(`monitor ${m.id}: push monitors need a token of at least 12 characters`);
    if (!["http", "push"].includes(type)) throw new Error(`monitor ${m.id}: type must be http or push`);
    return { ...DEFAULTS, ...m, type };
  });
}

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const bearerOk = (req, key) => Boolean(key) && safeEq(req.headers.authorization || "", `Bearer ${key}`);

const readJson = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > 100_000) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(Object.assign(new Error("invalid JSON"), { status: 400 })); } });
  req.on("error", reject);
});

// Form posts are small and urlencoded; JSON is accepted too.
const readBody = async (req) => {
  if (!(req.headers["content-type"] || "").includes("application/x-www-form-urlencoded")) return readJson(req);
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 10_000) throw Object.assign(new Error("too large"), { status: 413 }); chunks.push(c); }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
};

// cfg: {state, save, monitors, adminKey, title, publicUrl, now, sendEmail?}
// sendEmail({to, subject, text, headers?}) enables subscriptions; leave it out and the routes 404.
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const meta = { title: cfg.title || "Status", publicUrl: cfg.publicUrl || "/", emailEnabled: Boolean(cfg.sendEmail) };
  const notify = (event) => cfg.sendEmail ? notifyAll(cfg.state, event, meta, cfg.sendEmail) : Promise.resolve();
  const byId = Object.fromEntries(cfg.monitors.map((m) => [m.id, m]));
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
    };
    try {
      const t = now();
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
      if (req.method === "GET" && url.pathname === "/") return send(200, statusPage(cfg.state, cfg.monitors, meta, t), "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "cache-control": "public, max-age=30" });
      if (req.method === "GET" && url.pathname === "/api/status.json") return send(200, statusJson(cfg.state, cfg.monitors, meta, t), "application/json", { "access-control-allow-origin": "*", "cache-control": "public, max-age=30" });
      if (req.method === "GET" && url.pathname === "/feed.xml") return send(200, atomFeed(cfg.state, meta, t), "application/atom+xml; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/badge.svg") { const st = overall(cfg.state, cfg.monitors, t); return send(200, badgeSvg("status", LABELS[st].toLowerCase(), COLORS[st]), "image/svg+xml", { "cache-control": "public, max-age=60" }); }
      if (cfg.sendEmail && ["/subscribe", "/confirm", "/unsubscribe"].includes(url.pathname)) {
        const html = (code, title, body) => send(code, messagePage(meta, title, body), "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'", "cache-control": "no-store", "referrer-policy": "no-referrer" });
        const token = url.searchParams.get("t") || "";
        if (req.method === "POST" && url.pathname === "/subscribe") {
          const b = await readBody(req);
          const r = b.website ? { action: "invalid" } : subscribe(cfg.state, String(b.email || ""), t); // "website" is a honeypot field
          if (r.action === "invalid" && !b.website) return html(400, "That address does not look right", "<p>Check the email address and <a href=\"/\">try again</a>.</p>");
          if (r.action === "full") return html(503, "Subscriptions are full", "<p>This page cannot take more subscribers right now.</p>");
          if (r.action === "confirm") { cfg.save(); await cfg.sendEmail(confirmationMail(r.sub, meta)).catch((e) => console.error("confirmation failed:", e.message)); }
          // Same answer whether or not the address was new, so the form cannot be used to probe who subscribes.
          return html(202, "Check your inbox", "<p>If that address can be subscribed, we sent a confirmation link. Nothing is sent until you click it.</p>");
        }
        if (req.method === "GET" && url.pathname === "/confirm") {
          const s = confirm(cfg.state, token, t);
          if (!s) return html(404, "Link expired", "<p>This confirmation link is invalid or has expired. <a href=\"/\">Subscribe again</a>.</p>");
          cfg.save(); return html(200, "You are subscribed", "<p>You will get an email when an incident opens, updates or resolves, and before scheduled maintenance. Every email has an unsubscribe link.</p>");
        }
        if (url.pathname === "/unsubscribe" && req.method === "GET") return html(200, "Unsubscribe", `<form method="post" action="/unsubscribe?t=${encodeURIComponent(token)}"><p>Stop status emails to this address?</p><button type="submit">Unsubscribe</button></form>`);
        if (url.pathname === "/unsubscribe" && req.method === "POST") {
          const gone = unsubscribe(cfg.state, token);
          if (gone) cfg.save();
          return html(200, "Unsubscribed", "<p>You will not get any more status emails.</p>");
        }
      }
      if (req.method === "POST" && url.pathname.startsWith("/ping/")) {
        const def = byId[url.pathname.slice(6)];
        if (!def || def.type !== "push" || !safeEq(url.searchParams.get("token") || "", def.token)) return send(404, "not found\n", "text/plain");
        recordPing(cfg.state, def, t); cfg.save();
        return send(200, "ok\n", "text/plain");
      }
      if (url.pathname.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return send(401, "admin key required\n", "text/plain");
        const parts = url.pathname.slice(4).split("/");
        try {
          if (req.method === "POST" && parts[0] === "incidents" && !parts[1]) { const inc = createIncident(cfg.state, { ...(await readJson(req)), now: t }); cfg.save(); await notify({ kind: "incident", incident: inc }); return send(201, inc); }
          if (req.method === "POST" && parts[0] === "incidents" && parts[2] === "updates") { const inc = addUpdate(cfg.state, parts[1], { ...(await readJson(req)), now: t }); cfg.save(); await notify({ kind: inc.status === "resolved" ? "resolved" : "update", incident: inc }); return send(200, inc); }
          if (req.method === "POST" && parts[0] === "maintenance") { const b = await readJson(req); const m = scheduleMaintenance(cfg.state, { ...b, startsAt: Date.parse(b.startsAt), endsAt: Date.parse(b.endsAt) }); cfg.save(); await notify({ kind: "maintenance", maintenance: m }); return send(201, m); }
          if (req.method === "GET" && parts[0] === "subscribers") return send(200, { active: activeCount(cfg.state), total: (cfg.state.subscribers || []).length });
        } catch (e) { return send(e.status || 400, `${e.message}\n`, "text/plain"); }
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e.status || 500, "error\n", "text/plain");
    }
  };
}

export async function checkHttp(def, doFetch = fetch) {
  const started = Date.now();
  try {
    const res = await doFetch(def.url, { method: def.method || "GET", redirect: "manual", headers: { "user-agent": "status-keeper/1" }, signal: AbortSignal.timeout(def.timeoutMs) });
    const ms = Date.now() - started;
    const okStatus = Array.isArray(def.expectStatus) ? def.expectStatus.includes(res.status) : res.status < 400;
    if (!okStatus) return { ok: false, ms, error: `HTTP ${res.status}` };
    if (def.contains) { const text = (await res.text()).slice(0, 1_000_000); if (!text.includes(def.contains)) return { ok: false, ms, error: `response did not contain "${def.contains}"` }; }
    return { ok: true, ms };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: String(e.name === "TimeoutError" ? `timed out after ${def.timeoutMs}ms` : e.cause?.code || e.message || e).slice(0, 200) };
  }
}

// One pass over every monitor that is due. deps: {fetch, alert, notify(event)}. Returns true if state changed.
export async function tick(state, defs, now, deps = {}) {
  let changed = false;
  await Promise.all(defs.map(async (def) => {
    const m = state.monitors[def.id];
    if (m?.lastCheckAt && now - m.lastCheckAt < def.intervalSec * 1000) return;
    let result;
    if (def.type === "push") { if (!m || m.lastPingAt === null) return; result = pushResult(state, def, now); }
    else result = await checkHttp(def, deps.fetch);
    changed = true;
    for (const ev of recordCheck(state, def, result, now)) {
      if (deps.notify) await deps.notify({ kind: ev.type === "down" ? "incident" : "resolved", incident: ev.incident }).catch(() => {});
      if (!deps.alert) continue;
      await deps.alert(ev.type === "down"
        ? `status-keeper: ${def.name || def.id} is DOWN (${ev.incident.updates[0].message})`
        : `status-keeper: ${def.name || def.id} recovered after ${humanDuration(ev.downMs / 1000)}`);
    }
  }));
  return changed;
}

function readState(path) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return newState(); throw e; }
}

async function alert(text) {
  console.log(text);
  if (env.ALERT_WEBHOOK_URL) await fetch(env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) }).catch(() => {});
}

// Resend's HTTP API: one POST per message, no SMTP and no dependency.
async function sendResend(msg) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, headers: msg.headers }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY) { console.error("missing env: ADMIN_KEY"); process.exit(1); }
  let monitors;
  try { monitors = parseMonitors(env.MONITORS_JSON); } catch (e) { console.error(`MONITORS_JSON: ${e.message}`); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = readState(statePath);
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  if (Boolean(env.RESEND_API_KEY) !== Boolean(env.MAIL_FROM)) { console.error("email notices need both RESEND_API_KEY and MAIL_FROM"); process.exit(1); }
  const sendEmail = env.RESEND_API_KEY ? sendResend : undefined;
  if (sendEmail && !/^https:\/\//.test(env.PUBLIC_URL || "")) { console.error("email notices need PUBLIC_URL (https) so links in emails work"); process.exit(1); }
  const meta = { title: env.TITLE || "Status", publicUrl: env.PUBLIC_URL || "/" };
  const notify = sendEmail ? (event) => notifyAll(state, event, meta, sendEmail) : undefined;
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { if (await tick(state, monitors, Date.now(), { alert, notify })) save(); } catch (e) { console.error("tick failed:", e.message); } finally { busy = false; }
  }, 5000).unref?.();
  http.createServer(handler({ state, save, monitors, adminKey: env.ADMIN_KEY, title: env.TITLE, publicUrl: env.PUBLIC_URL, sendEmail })).listen(Number(env.PORT || 8080), () =>
    console.log(`status-keeper on :${env.PORT || 8080} watching ${monitors.length} monitor(s)`));
}
