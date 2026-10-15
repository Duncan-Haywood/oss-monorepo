#!/usr/bin/env node
// Self-hosted deferred-revenue schedule for Stripe. Zero dependencies, read-only key.
//   STRIPE_SECRET_KEY=rk_... ADMIN_KEY=... COMPANY_NAME=Acme node server.mjs
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { createStripe } from "./stripe.mjs";
import { schedule, summary, journal, journalCsv } from "./revrec.mjs";
import { renderDashboard } from "./page.mjs";

export const newState = () => ({ lines: {}, lastSyncAt: null, currency: null, skipped: 0 });

const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function authorized(header, key) {
  if (!key || !header) return false;
  if (header.startsWith("Bearer ")) return eq(header.slice(7), key);
  if (header.startsWith("Basic ")) return eq(Buffer.from(header.slice(6), "base64").toString().split(":").slice(1).join(":"), key);
  return false;
}

// One pass. The first sync reads everything; later ones re-read the last 3 days
// (lines are keyed by id, so overlap is harmless) and pick up new credit notes.
export async function sync(cfg) {
  const st = cfg.state, now = cfg.now();
  const since = st.lastSyncAt ? Math.floor((st.lastSyncAt - 3 * 86400000) / 1000) : 0;
  const fresh = [...(await cfg.stripe.listLines(since)), ...(await cfg.stripe.listCreditNotes(since))];
  const counts = {};
  for (const l of fresh) counts[l.currency] = (counts[l.currency] || 0) + 1;
  st.currency = cfg.currency || st.currency || Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "usd";
  for (const l of fresh) st.lines[l.id] = l;
  st.skipped = Object.values(st.lines).filter((l) => l.currency !== st.currency).length;
  st.lastSyncAt = now;
  cfg.save();
  return { lines: Object.keys(st.lines).length, added: fresh.length, skipped: st.skipped };
}

const usable = (st) => Object.values(st.lines).filter((l) => l.currency === st.currency);

// cfg: {state, save, stripe, adminKey, company, currency, now, accounts}
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
      if (!authorized(req.headers.authorization, cfg.adminKey)) return send(401, "sign in with ADMIN_KEY as the password\n", "text/plain", { "www-authenticate": 'Basic realm="Rev Rec", charset="UTF-8"' });
      const now = cfg.now(), lines = usable(cfg.state);
      const rows = schedule(lines, { asOf: now });
      if (req.method === "GET" && url.pathname === "/") {
        return send(200, renderDashboard({ company: cfg.company || "Your company", summary: rows.length ? summary(rows, now) : null, rows, currency: cfg.state.currency || "usd", lastSyncAt: cfg.state.lastSyncAt, lineCount: lines.length, skipped: cfg.state.skipped }), "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
      }
      if (req.method === "GET" && url.pathname === "/v1/schedule") return send(200, { currency: cfg.state.currency, lastSyncAt: cfg.state.lastSyncAt, summary: rows.length ? summary(rows, now) : null, months: rows });
      if (req.method === "GET" && url.pathname === "/v1/journal.csv") {
        const through = url.searchParams.get("through");
        const rs = rows.filter((r) => !r.future && (!through || r.month <= through));
        return send(200, journalCsv(journal(rs, cfg.accounts)), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="rev-rec-journal.csv"' });
      }
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
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const accounts = { cash: env.ACCOUNT_RECEIVABLE || "Accounts receivable", deferred: env.ACCOUNT_DEFERRED || "Deferred revenue", revenue: env.ACCOUNT_REVENUE || "Subscription revenue" };
  const cfg = { state, save, stripe: createStripe({ key: env.STRIPE_SECRET_KEY, maxPages: Number(env.MAX_PAGES) || 500 }), adminKey: env.ADMIN_KEY, company: env.COMPANY_NAME, currency: env.CURRENCY && env.CURRENCY.toLowerCase(), accounts, now: Date.now };
  const h = handler(cfg);
  const tick = () => sync(cfg).then((r) => console.log("synced", JSON.stringify(r)), (e) => console.error("sync failed:", e.message));
  http.createServer(h).listen(Number(env.PORT || 8080), () => {
    console.log(`rev-rec on :${env.PORT || 8080}`);
    tick(); setInterval(tick, Math.max(5, Number(env.SYNC_MINUTES) || 360) * 60000).unref();
  });
}
