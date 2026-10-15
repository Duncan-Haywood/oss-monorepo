#!/usr/bin/env node
// Self-hosted MRR dashboard for Stripe. Zero dependencies, read-only key.
//   STRIPE_SECRET_KEY=rk_... ADMIN_KEY=... COMPANY_NAME=Acme node server.mjs
// Open the URL, sign in with any user name and ADMIN_KEY as the password.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { createStripe } from "./stripe.mjs";
import { backfill, applySync, liveMap, summarize, cohorts } from "./metrics.mjs";
import { renderDashboard } from "./page.mjs";
import { notify, validWebhook } from "./alerts.mjs";

export const newState = () => ({ months: {}, last: null, ever: {}, lastSyncAt: null, currency: null, cohorts: [] });

const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function authorized(header, key) {
  if (!key || !header) return false;
  if (header.startsWith("Bearer ")) return eq(header.slice(7), key);
  if (header.startsWith("Basic ")) {
    const pw = Buffer.from(header.slice(6), "base64").toString().split(":").slice(1).join(":");
    return eq(pw, key);
  }
  return false;
}

// One pass: list subscriptions, pick the currency, fold into state.
export async function sync(cfg) {
  const all = await cfg.stripe.listSubscriptions();
  const live = all.filter((s) => s.status === "active" || s.status === "past_due");
  const counts = {};
  for (const s of live) counts[s.currency] = (counts[s.currency] || 0) + 1;
  const currency = cfg.currency || cfg.state.currency || Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "usd";
  const subs = all.filter((s) => s.currency === currency);
  const skipped = all.length - subs.length;
  const now = cfg.now();
  const cur = liveMap(subs, { countPastDue: cfg.countPastDue !== false });
  const st = cfg.state;
  if (!st.last) {
    const b = backfill(subs, now, cfg.months || 12);
    st.months = Object.fromEntries(b.months.map((m) => [m.month, m]));
    st.ever = b.ever;
    st.last = cur;
    const row = b.months[b.months.length - 1];
    row.mrr = Object.values(cur).reduce((a, v) => a + v, 0); row.customers = Object.keys(cur).length;
    for (const id of Object.keys(cur)) st.ever[id] = 1;
    st.lastSyncAt = now;
  } else applySync(st, cur, now);
  st.currency = currency; st.skipped = skipped;
  st.cohorts = cohorts(subs, now, cfg.months || 12);
  cfg.save();
  try { await notify(cfg, monthList(st)); } catch (e) { console.error("alert failed:", e.message); }
  return { subscriptions: all.length, counted: Object.keys(cur).length, skipped };
}

export const monthList = (state) => Object.values(state.months).sort((a, b) => (a.month < b.month ? -1 : 1));

// cfg: {state, save, stripe, adminKey, company, currency, now, countPastDue, months}
export function handler(cfg) {
  let syncing = null;
  const runSync = () => (syncing ||= sync(cfg).finally(() => { syncing = null; }));
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
      if (!authorized(req.headers.authorization, cfg.adminKey)) return send(401, "sign in with ADMIN_KEY as the password\n", "text/plain", { "www-authenticate": 'Basic realm="MRR Pulse", charset="UTF-8"' });
      const months = monthList(cfg.state);
      if (req.method === "GET" && url.pathname === "/") {
        return send(200, renderDashboard({ company: cfg.company || "Your company", summary: summarize(months), months, currency: cfg.state.currency || "usd", lastSyncAt: cfg.state.lastSyncAt, skipped: cfg.state.skipped, cohorts: cfg.state.cohorts || [] }), "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
      }
      if (req.method === "GET" && url.pathname === "/v1/metrics") return send(200, { currency: cfg.state.currency, lastSyncAt: cfg.state.lastSyncAt, summary: summarize(months) });
      if (req.method === "GET" && url.pathname === "/v1/cohorts") return send(200, cfg.state.cohorts || []);
      if (req.method === "GET" && url.pathname === "/v1/months") return send(200, months);
      if (req.method === "POST" && url.pathname === "/v1/sync") return send(200, await runSync());
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e.status && e.status < 500 ? 502 : 500, { error: "sync failed; check STRIPE_SECRET_KEY and the server log" });
    }
  };
}

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env;
  const missing = ["STRIPE_SECRET_KEY", "ADMIN_KEY"].filter((k) => !env[k]);
  if (missing.length) { console.error(`missing env: ${missing.join(", ")}`); process.exit(1); }
  if (env.ADMIN_KEY.length < 12) { console.error("ADMIN_KEY must be at least 12 characters"); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = Object.assign(newState(), readJson(statePath, {}));
  if (env.ALERT_WEBHOOK_URL && !validWebhook(env.ALERT_WEBHOOK_URL)) { console.error("ALERT_WEBHOOK_URL must be an https URL"); process.exit(1); }
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const cfg = { state, save, stripe: createStripe({ key: env.STRIPE_SECRET_KEY, maxPages: Number(env.MAX_PAGES) || 500 }), adminKey: env.ADMIN_KEY, company: env.COMPANY_NAME, currency: env.CURRENCY && env.CURRENCY.toLowerCase(), countPastDue: env.COUNT_PAST_DUE !== "false", months: Number(env.HISTORY_MONTHS) || 12, now: Date.now, webhook: env.ALERT_WEBHOOK_URL, digestDays: env.DIGEST_DAYS === undefined ? 7 : Number(env.DIGEST_DAYS), churnAlertPct: (Number(env.CHURN_ALERT_PCT) || 5) / 100 };
  const h = handler(cfg);
  const tick = () => sync(cfg).then((r) => console.log("synced", JSON.stringify(r)), (e) => console.error("sync failed:", e.message));
  http.createServer(h).listen(Number(env.PORT || 8080), () => {
    console.log(`mrr-pulse on :${env.PORT || 8080}`);
    tick(); setInterval(tick, Math.max(5, Number(env.SYNC_MINUTES) || 360) * 60000).unref();
  });
}
