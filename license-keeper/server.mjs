#!/usr/bin/env node
// Self-hosted license-key server for software sold through Stripe. Zero dependencies.
//   STRIPE_SECRET_KEY=rk_... STRIPE_WEBHOOK_SECRET=whsec_... ADMIN_KEY=... \
//   PLANS_JSON='{"price_123":{"product":"myapp","plan":"pro","machines":2,"days":null}}' \
//   RESEND_API_KEY=... MAIL_FROM="Acme <keys@example.com>" COMPANY_NAME=Acme node server.mjs
// DRY_RUN defaults to true: licenses are issued and logged, no email is sent, until DRY_RUN=false.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { verifySignature, createStripe } from "./stripe.mjs";
import { applyEvent, deliver } from "./engine.mjs";
import { newState, issue, revoke, activate, deactivate, status, claimsOf, summary } from "./store.mjs";
import { generateKeyPair, signLicense, verifyLicense, parseLicense } from "./token.mjs";

const env = process.env;

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

// Fixed-window limiter for the public endpoints (activation is unauthenticated by design).
export function limiter(max = 60, windowMs = 60_000) {
  const hits = new Map();
  return (ip, now) => {
    const w = Math.floor(now / windowMs), h = hits.get(ip);
    if (!h || h.w !== w) { hits.set(ip, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; }
    return ++h.n <= max;
  };
}

// cfg: {state, save, stripe, webhookSecret, adminKey, plans, now, dryRun, sendEmail, company, graceDays, allow}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const allow = cfg.allow || limiter();
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json") => {
      res.writeHead(code, { "content-type": type, "access-control-allow-origin": "*", "cache-control": "no-store" });
      res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
    };
    try {
      if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST" }); return res.end(); }
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
      if (req.method === "GET" && url.pathname === "/v1/pubkey") return send(200, { algorithm: "Ed25519", publicKey: cfg.state.keys.publicKey });

      if (req.method === "POST" && url.pathname === "/webhook/stripe") {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers["stripe-signature"], cfg.webhookSecret, Math.floor(now() / 1000))) return send(400, "bad signature\n", "text/plain");
        const log = await applyEvent(cfg.state, JSON.parse(raw), { plans: cfg.plans, stripe: cfg.stripe, signKey: cfg.state.keys.privateKey, sendEmail: cfg.sendEmail, company: cfg.company, graceDays: cfg.graceDays, now: now(), dryRun: cfg.dryRun });
        cfg.save();
        log.forEach((l) => console.log(l));
        return send(200, { ok: true, log });
      }

      // Public: the app calls these with its license token and a machine fingerprint.
      if (req.method === "POST" && ["/v1/activate", "/v1/validate", "/v1/deactivate"].includes(url.pathname)) {
        if (!allow(req.socket.remoteAddress || "?", now())) return send(429, { ok: false, reason: "rate-limited" });
        const body = JSON.parse((await readBody(req, 20_000)) || "{}");
        const v = await verifyLicense(cfg.state.keys.publicKey, body.license, { now: now() });
        // An expired token is still a genuine one: activation/validation is how it gets refreshed.
        const parsed = v.valid || v.reason === "expired" ? parseLicense(body.license) : null;
        if (!parsed) return send(400, { ok: false, reason: v.reason });
        const id = parsed.claims.id;
        if (url.pathname === "/v1/deactivate") { const ok = deactivate(cfg.state, id, body.fingerprint, now()); cfg.save(); return send(200, { ok }); }
        const r = url.pathname === "/v1/activate" ? activate(cfg.state, id, body.fingerprint, body.name, now()) : checkOnly(cfg.state, id, body.fingerprint, now());
        cfg.save();
        if (!r.ok) return send(200, { ok: false, reason: r.reason });
        return send(200, { ok: true, token: await signLicense(cfg.state.keys.privateKey, claimsOf(r.license)), expiresAt: r.license.exp ? new Date(r.license.exp * 1000).toISOString() : null });
      }

      if (url.pathname === "/v1/summary" || url.pathname.startsWith("/v1/licenses")) {
        if (!bearerOk(req, cfg.adminKey)) return send(401, "admin key required\n", "text/plain");
        const parts = url.pathname.split("/").filter(Boolean); // v1 licenses [id [revoke|token|resend]]
        if (url.pathname === "/v1/summary") return send(200, { dryRun: cfg.dryRun, ...summary(cfg.state, now()) });
        if (req.method === "GET" && parts.length === 2) return send(200, Object.values(cfg.state.licenses).map((l) => ({ ...l, status: status(l, now()) })));
        if (req.method === "POST" && parts.length === 2) {
          const l = issue(cfg.state, JSON.parse((await readBody(req, 20_000)) || "{}"), now());
          const token = await signLicense(cfg.state.keys.privateKey, claimsOf(l));
          cfg.save();
          return send(201, { id: l.id, token });
        }
        const l = cfg.state.licenses[parts[2]];
        if (!l) return send(404, "no such license\n", "text/plain");
        if (req.method === "GET" && parts[3] === "token") return send(200, { token: await signLicense(cfg.state.keys.privateKey, claimsOf(l)) });
        if (req.method === "POST" && parts[3] === "revoke") { revoke(cfg.state, l.id, "revoked by admin", now()); cfg.save(); return send(200, { ok: true }); }
        if (req.method === "POST" && parts[3] === "resend") { const m = await deliver(cfg.state, l, { signKey: cfg.state.keys.privateKey, sendEmail: cfg.sendEmail, company: cfg.company, now: now(), dryRun: cfg.dryRun }); cfg.save(); return send(200, { ok: true, message: m }); }
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e instanceof SyntaxError ? 400 : e.status || (/required/.test(e.message) ? 400 : 500), { ok: false, reason: "error" });
    }
  };
}

// validate = activate without consuming a new machine slot.
function checkOnly(state, id, fingerprint, now) {
  const l = state.licenses[id];
  if (!l) return { ok: false, reason: "unknown" };
  const s = status(l, now);
  if (s !== "active") return { ok: false, reason: s };
  if (!l.activations[fingerprint]) return { ok: false, reason: "not-activated" };
  l.activations[fingerprint].lastSeen = now;
  return { ok: true, license: l };
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ADMIN_KEY", "PLANS_JSON"].filter((k) => !env[k]);
  if (missing.length) { console.error(`missing env: ${missing.join(", ")}`); process.exit(1); }
  const dryRun = env.DRY_RUN !== "false";
  if (!dryRun && (!env.RESEND_API_KEY || !env.MAIL_FROM)) { console.error("DRY_RUN=false needs RESEND_API_KEY and MAIL_FROM"); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = { ...newState(), ...readJson(statePath, {}) };
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(`${statePath}.tmp`, statePath); };
  if (env.SIGNING_PUBLIC_KEY && env.SIGNING_PRIVATE_KEY) state.keys = { publicKey: env.SIGNING_PUBLIC_KEY, privateKey: env.SIGNING_PRIVATE_KEY };
  else if (!state.keys) { state.keys = await generateKeyPair(); save(); console.log("generated a signing key pair; back up STATE, or set SIGNING_PUBLIC_KEY and SIGNING_PRIVATE_KEY"); }
  console.log(`public key (embed in your app): ${state.keys.publicKey}`);
  const cfg = {
    state, save, stripe: createStripe({ key: env.STRIPE_SECRET_KEY }), webhookSecret: env.STRIPE_WEBHOOK_SECRET, adminKey: env.ADMIN_KEY,
    plans: JSON.parse(env.PLANS_JSON), dryRun, sendEmail: sendResend, company: env.COMPANY_NAME, graceDays: env.GRACE_DAYS ? Number(env.GRACE_DAYS) : 3,
  };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`license-keeper on :${env.PORT || 8080} (${dryRun ? "DRY RUN" : "LIVE"})`));
}
