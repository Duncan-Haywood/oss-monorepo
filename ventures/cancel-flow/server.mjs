#!/usr/bin/env node
// Self-hosted cancellation flow for Stripe subscriptions. Zero dependencies.
//   STRIPE_SECRET_KEY=rk_... STRIPE_WEBHOOK_SECRET=whsec_... ADMIN_KEY=... \
//   LINK_SECRET=... PUBLIC_URL=https://cancel.example.com COMPANY_NAME=Acme node server.mjs
// DRY_RUN defaults to true: the flow runs and is recorded, but no subscription is changed.
import http from "node:http";
import fs from "node:fs";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { verifySignature, createStripe } from "./stripe.mjs";
import { decide, describeOffer, summarize, REASONS, mergePolicy } from "./flow.mjs";
import { renderCancelPage } from "./page.mjs";
import { runWinback, summarizeWinback, readUnsubToken } from "./winback.mjs";

const env = process.env;
const MAX_SESSIONS = 20000;

export function mintToken(secret, { sub, customer, ttlMs = 3600_000, now = Date.now() }) {
  const body = Buffer.from(JSON.stringify({ j: randomBytes(9).toString("base64url"), s: sub, c: customer, e: now + ttlMs })).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function readToken(secret, token, now = Date.now()) {
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString());
    return t && t.j && t.s && t.c && t.e > now ? t : null;
  } catch { return null; }
}

export const newState = () => ({ sessions: {}, seen: [], optouts: {} });

const readBody = (req, max = 100_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const bearerOk = (req, key) => {
  const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`);
  return Boolean(key) && a.length === b.length && timingSafeEqual(a, b);
};

// cfg: {state, save, stripe, webhookSecret, linkSecret, adminKey, publicUrl, policy, dryRun, company, color, returnUrl, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const policy = mergePolicy(cfg.policy || {});
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "referrer-policy": "no-referrer", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const fail = (code, error) => send(code, { error });
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");

      if (req.method === "POST" && url.pathname === "/webhook/stripe") {
        const raw = await readBody(req, 1_000_000);
        if (!verifySignature(raw, req.headers["stripe-signature"], cfg.webhookSecret, Math.floor(now() / 1000))) return send(400, "bad signature\n", "text/plain");
        const event = JSON.parse(raw);
        if (cfg.state.seen.includes(event.id)) return send(200, { ignored: "duplicate" });
        cfg.state.seen.push(event.id); if (cfg.state.seen.length > 2000) cfg.state.seen.shift();
        let marked = 0;
        if (event.type === "customer.subscription.deleted") {
          for (const s of Object.values(cfg.state.sessions)) if (s.sub === event.data.object.id && !s.churned) { s.churned = true; s.churnedAt = now(); marked++; }
        }
        if (event.type === "customer.subscription.created") {
          // A cancelled customer who subscribes again after we emailed them is a win-back.
          for (const s of Object.values(cfg.state.sessions)) if (s.customer === event.data.object.customer && s.churned && s.winback?.sent?.some((x) => !x.dry)) { s.winback.won = true; marked++; }
        }
        cfg.save();
        return send(200, { received: event.type, marked });
      }

      const u = url.pathname.match(/^\/u\/([^/]+)$/);
      if (u) {
        const customer = readUnsubToken(cfg.linkSecret, decodeURIComponent(u[1]));
        const page = (msg, form) => send(200, `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>Unsubscribe</title><body style="font:16px system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem"><p>${msg}</p>${form || ""}`, "text/html; charset=utf-8");
        if (!customer) return send(410, "This link is not valid.\n", "text/plain");
        if (req.method === "POST") { (cfg.state.optouts ||= {})[customer] = now(); cfg.save(); return page("You are unsubscribed. We will not email you about coming back."); }
        if (req.method === "GET") return page("Stop emails about coming back?", `<form method=post><button>Unsubscribe</button></form>`);
      }

      const m = url.pathname.match(/^\/c\/([^/]+)(?:\/(answer|accept|cancel|keep))?$/);
      if (m) {
        const tok = readToken(cfg.linkSecret, decodeURIComponent(m[1]), now());
        if (!tok) return req.method === "GET" ? send(410, "This link has expired. Go back to your account and choose Cancel again.\n", "text/plain") : fail(410, "This link has expired. Please start again from your account.");
        const sessions = cfg.state.sessions;
        let s = sessions[tok.j];
        if (req.method === "GET" && !m[2]) {
          if (!s) {
            s = sessions[tok.j] = { id: tok.j, sub: tok.s, customer: tok.c, at: now(), reason: null, offer: null, outcome: null, dryRun: cfg.dryRun };
            const ids = Object.keys(sessions);
            if (ids.length > MAX_SESSIONS) for (const id of ids.slice(0, ids.length - MAX_SESSIONS)) delete sessions[id];
            cfg.save();
          }
          return send(200, renderCancelPage({ company: cfg.company || "us", color: cfg.color, reasons: REASONS, returnUrl: cfg.returnUrl, dryRun: cfg.dryRun }), "text/html; charset=utf-8", {
            "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors ${cfg.frameAncestors || "'none'"}`,
          });
        }
        if (req.method !== "POST" || !m[2]) return send(404, "not found\n", "text/plain");
        if (!s) return fail(409, "Please reload the page and start again.");
        if (s.outcome) return fail(409, "This request is already finished.");
        const step = m[2];
        const body = step === "answer" ? JSON.parse((await readBody(req)) || "{}") : {};
        const sub = await cfg.stripe.getSubscription(tok.s);
        if (sub.customer !== tok.c) return fail(403, "This link does not match that subscription.");
        const end = sub.periodEnd ? new Date(sub.periodEnd).toISOString().slice(0, 10) : null;

        if (step === "answer") {
          if (!REASONS[body.reason]) return fail(400, "Please choose a reason.");
          s.reason = body.reason; s.comment = String(body.comment || "").slice(0, 500);
          const history = Object.values(sessions).filter((x) => x.customer === tok.c && x.id !== s.id);
          const d = decide({ reason: s.reason, sub, history, policy, now: now() });
          if (d.action === "blocked") { cfg.save(); return fail(409, d.why === "already_canceling" ? "Your subscription is already set to cancel." : "This subscription can't be changed here."); }
          s.decision = d.action === "offer" ? d.offer : null;
          s.offer = d.action === "offer" && d.offer.type !== "help" ? { ...d.offer } : null;
          s.shownHelp = d.action === "offer" && d.offer.type === "help";
          s.currency = sub.currency;
          cfg.save();
          if (d.action === "confirm") return send(200, { action: "confirm" });
          return send(200, { action: "offer", offer: d.offer, text: describeOffer(d.offer, sub.currency), detail: d.offer.type === "help" ? "Many problems are quick to fix, and you can still cancel afterwards." : "" });
        }
        if (step === "accept") {
          if (!s.offer) return fail(409, "There is no offer to accept.");
          if (sub.cancelAtPeriodEnd) return fail(409, "Your subscription is already set to cancel.");
          const o = s.offer;
          if (!cfg.dryRun) {
            if (o.type === "discount") await cfg.stripe.applyDiscount(tok.s, await cfg.stripe.ensureCoupon(o), `cf-${s.id}-accept`);
            else await cfg.stripe.pause(tok.s, o.resumesAt, `cf-${s.id}-accept`);
          }
          s.outcome = "saved"; s.decidedAt = now(); cfg.save();
          return send(200, { text: o.type === "pause" ? `Billing is paused until ${new Date(o.resumesAt).toISOString().slice(0, 10)}. You will not be charged before then.` : `${describeOffer(o, sub.currency)} — applied. Thank you for staying.`, dryRun: cfg.dryRun });
        }
        if (step === "cancel") {
          if (!s.reason) return fail(409, "Please tell us a reason first.");
          if (!cfg.dryRun) await cfg.stripe.cancelAtPeriodEnd(tok.s, REASONS[s.reason].stripe, s.comment, `cf-${s.id}-cancel`);
          s.outcome = "canceled"; s.decidedAt = now(); cfg.save();
          return send(200, { text: end ? `You keep full access until ${end}, and you will not be charged again.` : "You will not be charged again.", dryRun: cfg.dryRun });
        }
        s.outcome = "abandoned"; s.decidedAt = now(); cfg.save();
        return send(200, { ok: true });
      }

      if (url.pathname.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return fail(401, "admin key required");
        const all = Object.values(cfg.state.sessions);
        if (req.method === "GET" && url.pathname === "/v1/summary") return send(200, { dryRun: cfg.dryRun, ...summarize(all), ...(cfg.winbackUrl ? { winback: summarizeWinback(all, cfg.state.optouts) } : {}) });
        if (req.method === "GET" && url.pathname === "/v1/sessions") {
          return send(200, all.slice(-200).map(({ id, sub, customer, ...rest }) => ({ id, ...rest, at: new Date(rest.at).toISOString() })));
        }
        if (req.method === "POST" && url.pathname === "/v1/links") {
          const { subscription, ttlMinutes } = JSON.parse((await readBody(req)) || "{}");
          if (!/^sub_[A-Za-z0-9]+$/.test(subscription || "")) return fail(400, "subscription must be a Stripe subscription id (sub_...)");
          const sub = await cfg.stripe.getSubscription(subscription);
          const token = mintToken(cfg.linkSecret, { sub: subscription, customer: sub.customer, ttlMs: Math.min(1440, Math.max(5, Number(ttlMinutes) || 60)) * 60000, now: now() });
          return send(200, { url: `${cfg.publicUrl}/c/${token}` });
        }
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e.status && e.status < 500 ? e.status : 500, { error: e.status === 404 ? "subscription not found" : "Something went wrong. Please try again." });
    }
  };
}

async function sendResend(msg) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, headers: { "List-Unsubscribe": `<${msg.unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ADMIN_KEY", "LINK_SECRET", "PUBLIC_URL"].filter((k) => !env[k]);
  if (missing.length) { console.error(`missing env: ${missing.join(", ")}`); process.exit(1); }
  const dryRun = env.DRY_RUN !== "false";
  const statePath = env.STATE || "state.json";
  const state = Object.assign(newState(), readJson(statePath, {}));
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const cfg = {
    state, save, stripe: createStripe({ key: env.STRIPE_SECRET_KEY }), webhookSecret: env.STRIPE_WEBHOOK_SECRET, linkSecret: env.LINK_SECRET,
    adminKey: env.ADMIN_KEY, publicUrl: env.PUBLIC_URL.replace(/\/$/, ""), policy: env.POLICY_JSON ? JSON.parse(env.POLICY_JSON) : {}, dryRun,
    company: env.COMPANY_NAME, color: env.BRAND_COLOR, returnUrl: env.RETURN_URL, frameAncestors: env.FRAME_ANCESTORS,
  };
  if (env.WINBACK_URL) {
    if (!dryRun && (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.COMPANY_ADDRESS)) { console.error("DRY_RUN=false with WINBACK_URL needs RESEND_API_KEY, MAIL_FROM and COMPANY_ADDRESS"); process.exit(1); }
    if (!/^https:\/\//.test(env.WINBACK_URL)) { console.error("WINBACK_URL must be an https URL"); process.exit(1); }
    cfg.winbackUrl = env.WINBACK_URL;
    const deps = { stripe: cfg.stripe, sendEmail: sendResend, dryRun, publicUrl: cfg.publicUrl, linkSecret: env.LINK_SECRET, company: env.COMPANY_NAME, address: env.COMPANY_ADDRESS,
      url: env.WINBACK_URL, code: env.WINBACK_CODE, codeText: env.WINBACK_CODE_TEXT, winback: env.WINBACK_JSON ? JSON.parse(env.WINBACK_JSON) : {} };
    setInterval(async () => { try { const log = await runWinback(state, Date.now(), deps); log.forEach((l) => console.log(l)); if (log.length) save(); } catch (e) { console.error("winback failed:", e.message); } }, 3600_000).unref?.();
  }
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`cancel-flow on :${env.PORT || 8080} (${dryRun ? "DRY RUN" : "LIVE"})`));
}
