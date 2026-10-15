#!/usr/bin/env node
// Self-hosted failed-payment recovery for Stripe subscriptions. Zero dependencies.
//   STRIPE_SECRET_KEY=rk_... STRIPE_WEBHOOK_SECRET=whsec_... ADMIN_KEY=... \
//   LINK_SECRET=... PUBLIC_URL=https://dunning.example.com RESEND_API_KEY=... \
//   MAIL_FROM="Billing <billing@example.com>" COMPANY_NAME=Acme node server.mjs
// DRY_RUN defaults to true: it records and logs what it would do and touches
// neither Stripe nor your customers until you set DRY_RUN=false.
import http from "node:http";
import fs from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifySignature, createStripe } from "./stripe.mjs";
import { ADMIN_HTML, ADMIN_CSP } from "./admin.mjs";
import { applyEvent, tick, scanExpiring, summary, newState } from "./engine.mjs";

const env = process.env;

export function linkToken(secret, customer) {
  const body = Buffer.from(customer).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function customerFromToken(secret, token) {
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return Buffer.from(body, "base64url").toString();
}

const readBody = (req, max = 1_000_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

const bearerOk = (req, key) => {
  const a = Buffer.from(req.headers.authorization || "");
  const b = Buffer.from(`Bearer ${key}`);
  return Boolean(key) && a.length === b.length && timingSafeEqual(a, b);
};

// cfg: {state, save, stripe, webhookSecret, linkSecret, adminKey, publicUrl, policy, dryRun, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "text/plain") => { res.writeHead(code, { "content-type": type }); res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2)); };
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n");
      if (req.method === "POST" && url.pathname === "/webhook/stripe") {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers["stripe-signature"], cfg.webhookSecret, Math.floor(now() / 1000))) return send(400, "bad signature\n");
        const event = JSON.parse(raw);
        let declineCode = null;
        if (event.type === "invoice.payment_failed") declineCode = await cfg.stripe.declineCodeFor(event.data.object).catch(() => null);
        const result = applyEvent(cfg.state, event, { now: now(), policy: cfg.policy, declineCode });
        cfg.save();
        return send(200, result, "application/json");
      }
      if (req.method === "GET" && url.pathname.startsWith("/update/")) {
        const customer = customerFromToken(cfg.linkSecret, decodeURIComponent(url.pathname.slice(8)));
        if (!customer) return send(404, "link not valid\n");
        const to = await cfg.stripe.portalUrl(customer, cfg.publicUrl || "https://stripe.com");
        res.writeHead(302, { location: to }); return res.end();
      }
      if (req.method === "GET" && url.pathname === "/admin") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": ADMIN_CSP, "cache-control": "no-store", "x-content-type-options": "nosniff" });
        return res.end(ADMIN_HTML);
      }
      if (url.pathname === "/v1/summary" || url.pathname === "/v1/cases") {
        if (!bearerOk(req, cfg.adminKey)) return send(401, "admin key required\n");
        if (url.pathname === "/v1/summary") return send(200, { dryRun: cfg.dryRun, ...summary(cfg.state) }, "application/json");
        return send(200, Object.values(cfg.state.cases).map(({ steps, log, ...c }) => ({ ...c, steps: steps.map((s) => ({ id: s.id, kind: s.kind, at: new Date(s.at).toISOString(), status: s.status })), log: log.slice(-5) })), "application/json");
      }
      return send(404, "not found\n");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e.status || 500, "error\n");
    }
  };
}

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

async function sendResend(msg) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

async function alert(text) {
  console.log(text);
  if (env.ALERT_WEBHOOK_URL) await fetch(env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) }).catch(() => {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ADMIN_KEY", "LINK_SECRET"].filter((k) => !env[k]);
  if (missing.length) { console.error(`missing env: ${missing.join(", ")}`); process.exit(1); }
  const dryRun = env.DRY_RUN !== "false";
  const statePath = env.STATE || "state.json";
  const state = readJson(statePath, newState());
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const stripe = createStripe({ key: env.STRIPE_SECRET_KEY });
  const policy = env.POLICY_JSON ? JSON.parse(env.POLICY_JSON) : {};
  const publicUrl = (env.PUBLIC_URL || "").replace(/\/$/, "");
  const deps = {
    stripe, policy, dryRun, alert, sendEmail: sendResend, company: env.COMPANY_NAME, address: env.COMPANY_ADDRESS,
    cancelOnExpire: env.CANCEL_ON_EXPIRE === "true",
    expiryNotices: env.EXPIRY_NOTICES !== "false", expiryDays: Number(env.EXPIRY_DAYS || 30),
    updateUrl: (c) => (publicUrl ? `${publicUrl}/update/${linkToken(env.LINK_SECRET, c.customer)}` : c.hostedUrl || ""),
  };
  if (!dryRun && (!env.RESEND_API_KEY || !env.MAIL_FROM)) { console.error("DRY_RUN=false needs RESEND_API_KEY and MAIL_FROM"); process.exit(1); }
  setInterval(async () => { try { const now = Date.now();
    const log = [...await tick(state, now, deps), ...await scanExpiring(state, now, deps).catch((e) => [`expiry scan failed: ${e.message}`])]; log.forEach((l) => console.log(l)); if (log.length) save(); } catch (e) { console.error("tick failed:", e.message); } }, 60000).unref?.();
  const cfg = { state, save, stripe, webhookSecret: env.STRIPE_WEBHOOK_SECRET, linkSecret: env.LINK_SECRET, adminKey: env.ADMIN_KEY, publicUrl, policy, dryRun };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`dunning-engine on :${env.PORT || 8080} (${dryRun ? "DRY RUN" : "LIVE"})`));
}
