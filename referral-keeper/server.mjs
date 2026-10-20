#!/usr/bin/env node
// Self-hosted referral / affiliate programme for Stripe sellers. Zero dependencies.
//   STRIPE_WEBHOOK_SECRET=whsec_... ADMIN_KEY=... PUBLIC_URL=https://refs.example.com \
//   SITE_URL=https://example.com PROGRAM_JSON='{"percent":20,"months":12,"holdDays":30,"minPayout":5000}' node server.mjs
// It only receives Stripe webhooks: no Stripe API key, and it never moves money.
// Payouts are recorded and exported as a CSV you pay by hand (bank, PayPal, Wise).
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { verifySignature } from "./stripe.mjs";
import { newState, program, addAffiliate, setStatus, byPortal, click, applyEvent, balances, createPayouts, markPaid, voidPayout } from "./engine.mjs";
import { adminPage, portalPage, joinPage, payoutsCsv, trackerJs, esc, layout } from "./pages.mjs";

const env = process.env;

const readBody = (req, max = 1_000_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

function adminOk(req, key) {
  if (!key) return false;
  const h = req.headers.authorization || "";
  let given = "";
  if (h.startsWith("Bearer ")) given = h.slice(7);
  else if (h.startsWith("Basic ")) given = Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":");
  const a = Buffer.from(given), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Browsers attach Basic credentials to cross-site form posts. Refuse any state change that
// announces another origin.
export function sameOrigin(req) {
  if (req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(req.headers["sec-fetch-site"])) return false;
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

export function limiter(max = 60, windowMs = 60_000) {
  const hits = new Map();
  return (ip, now) => {
    const w = Math.floor(now / windowMs), h = hits.get(ip);
    if (!h || h.w !== w) { hits.set(ip, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; }
    return ++h.n <= max;
  };
}

const form = (raw) => Object.fromEntries(new URLSearchParams(raw));

// cfg: {trustProxy, state, save, webhookSecret, adminKey, program, publicUrl, siteUrl, company, now, allow, openSignup, hideSponsor}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const allow = cfg.allow || limiter();
  const publicUrl = (cfg.publicUrl || "").replace(/\/$/, "");
  const view = { publicUrl, siteUrl: cfg.siteUrl, company: cfg.company, hideSponsor: cfg.hideSponsor, dryRun: true, joinOpen: Boolean(cfg.openSignup) };
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
    };
    const html = (code, body) => send(code, body, "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'" });
    const back = (to = "/admin") => { res.writeHead(303, { location: to, "cache-control": "no-store" }); res.end(); };
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",").pop().trim()) || req.socket.remoteAddress || "?";
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");

      if (req.method === "GET" && url.pathname === "/r.js") return send(200, trackerJs(publicUrl), "application/javascript; charset=utf-8", { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" });

      if (url.pathname === "/v1/click" && (req.method === "POST" || req.method === "GET")) {
        const code = (url.searchParams.get("code") || "").toLowerCase();
        if (allow(ip, now())) { if (click(cfg.state, code)) cfg.save(); }
        res.writeHead(204, { "access-control-allow-origin": "*" }); return res.end();
      }

      if (req.method === "POST" && url.pathname === "/webhook/stripe") {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers["stripe-signature"], cfg.webhookSecret, Math.floor(now() / 1000))) return send(400, "bad signature\n", "text/plain");
        const log = applyEvent(cfg.state, JSON.parse(raw), { program: cfg.program, now: now() });
        cfg.save();
        log.forEach((l) => console.log(l));
        return send(200, { ok: true, log });
      }

      const portal = url.pathname.match(/^\/a\/([\w-]{10,64})(\.json)?$/);
      if (req.method === "GET" && portal) {
        if (!allow(ip, now())) return send(429, "slow down\n", "text/plain");
        const a = byPortal(cfg.state, portal[1]);
        if (!a) return send(404, "not found\n", "text/plain");
        const bal = balances(cfg.state, cfg.program, now());
        if (portal[2]) return send(200, { code: a.code, status: a.status, ...bal[a.id] });
        return html(200, portalPage(cfg.state, a, bal, cfg.program, now(), view));
      }

      if (cfg.openSignup && url.pathname === "/join") {
        if (req.method === "GET") return html(200, joinPage({ ...view, needsApproval: true }));
        if (req.method === "POST") {
          if (!sameOrigin(req) || !allow(ip, now())) return send(429, "slow down\n", "text/plain");
          const f = form(await readBody(req, 10_000));
          try {
            const a = addAffiliate(cfg.state, { name: f.name, email: f.email, code: f.code || undefined, status: "pending" }, now());
            cfg.save();
            return html(201, layout("Welcome", `<h1>You're in the queue</h1><p>Bookmark your private dashboard: <a href="/a/${esc(a.portal)}">${esc(publicUrl)}/a/${esc(a.portal)}</a>. Your code <code>${esc(a.code)}</code> starts tracking once the programme owner approves you.</p>`, view));
          } catch (e) { return html(400, joinPage({ ...view, needsApproval: true, message: `<p><strong>${esc(e.message)}</strong></p>` })); }
        }
      }

      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/v1/")) {
        if (!adminOk(req, cfg.adminKey)) return send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="Referral Keeper admin"' });
        const t = now();
        if (req.method === "GET" && url.pathname === "/admin") return html(200, adminPage(cfg.state, balances(cfg.state, cfg.program, t), cfg.program, t, view));
        if (req.method === "GET" && url.pathname === "/admin/payouts.csv") return send(200, payoutsCsv(cfg.state, Object.values(cfg.state.payouts).filter((p) => p.status === "open")), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="payouts.csv"' });
        if (req.method === "GET" && url.pathname === "/v1/summary") {
          const b = balances(cfg.state, cfg.program, t);
          return send(200, { affiliates: Object.keys(cfg.state.affiliates).length, customers: Object.keys(cfg.state.customers).length, commissions: Object.keys(cfg.state.commissions).length, balances: b });
        }
        if (req.method === "POST") {
          if (!sameOrigin(req)) return send(403, "cross-site request refused\n", "text/plain");
          const raw = await readBody(req, 20_000);
          const json = (req.headers["content-type"] || "").includes("json");
          const f = json ? JSON.parse(raw || "{}") : form(raw);
          const done = (code, body) => (json ? send(code, body) : back());
          let m;
          if (url.pathname === "/admin/affiliates") {
            const a = addAffiliate(cfg.state, { name: f.name, email: f.email, code: f.code || undefined, percent: f.percent === "" ? undefined : f.percent, months: f.months === "" ? undefined : f.months }, t);
            cfg.save(); return done(201, { id: a.id, code: a.code, portal: `${publicUrl}/a/${a.portal}` });
          }
          if ((m = url.pathname.match(/^\/admin\/affiliates\/(aff_[\w-]+)\/status$/))) {
            if (!setStatus(cfg.state, m[1], f.status)) return send(404, "no such affiliate\n", "text/plain");
            cfg.save(); return done(200, { ok: true });
          }
          if (url.pathname === "/admin/payouts") { const made = createPayouts(cfg.state, cfg.program, t, { affiliateId: f.affiliateId, force: f.force === true || f.force === "1" }); cfg.save(); return done(201, { created: made.length }); }
          if ((m = url.pathname.match(/^\/admin\/payouts\/(pay_[\w-]+)\/(paid|void)$/))) {
            const p = m[2] === "paid" ? markPaid(cfg.state, m[1], f.reference, t) : voidPayout(cfg.state, m[1]);
            if (!p) return send(404, "no such open payout\n", "text/plain");
            cfg.save(); return done(200, { ok: true });
          }
        }
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e instanceof SyntaxError ? 400 : e.status || (/required|must|taken|code/.test(e.message) ? 400 : 500), { ok: false, reason: e.status || /required|must|taken|code/.test(e.message) ? e.message : "error" });
    }
  };
}

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = ["STRIPE_WEBHOOK_SECRET", "ADMIN_KEY", "PUBLIC_URL"].filter((k) => !env[k]);
  if (missing.length) { console.error(`missing env: ${missing.join(", ")}`); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = { ...newState(), ...readJson(statePath, {}) };
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(`${statePath}.tmp`, statePath); };
  const cfg = {
    state, save, webhookSecret: env.STRIPE_WEBHOOK_SECRET, adminKey: env.ADMIN_KEY, publicUrl: env.PUBLIC_URL, siteUrl: env.SITE_URL,
    program: program(env.PROGRAM_JSON ? JSON.parse(env.PROGRAM_JSON) : {}), company: env.COMPANY_NAME, openSignup: env.OPEN_SIGNUP === "true", trustProxy: env.TRUST_PROXY === "true", hideSponsor: env.HIDE_SPONSOR_LINK === "true",
  };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`referral-keeper on :${env.PORT || 8080}`));
}
