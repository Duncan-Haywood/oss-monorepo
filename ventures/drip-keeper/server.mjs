#!/usr/bin/env node
// Self-hosted lifecycle email: your app posts events, sequences send the emails.
//   ADMIN_KEY=... BASE_URL=https://mail.example.com PRODUCT_NAME=Acme POSTAL_ADDRESS="1 Main St, City" \
//   RESEND_API_KEY=... MAIL_FROM="Acme <hi@example.com>" DRY_RUN=false node server.mjs
// DRY_RUN defaults to true: events and enrollments are recorded but nothing is sent and no step advances.
import http from "node:http";
import fs from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import * as E from "./engine.mjs";

const env = process.env;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const readBody = (req, max = 100_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const bearerOk = (req, ...keys) => keys.some((k) => Boolean(k) && same(req.headers.authorization || "", `Bearer ${k}`));
const parseJson = (raw) => { try { return JSON.parse(raw || "{}"); } catch { throw Object.assign(new Error("body is not valid JSON"), { status: 400 }); } };

// Standard Webhooks (Svix) signature, which Resend uses. Secret is "whsec_<base64>".
export function verifyResendWebhook(secret, headers, raw, nowMs = Date.now()) {
  const id = headers["webhook-id"], ts = headers["webhook-timestamp"], sigs = headers["webhook-signature"];
  if (!secret || !id || !ts || !sigs) return false;
  if (!(Math.abs(nowMs / 1000 - Number(ts)) <= 300)) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
  const want = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return sigs.split(" ").some((x) => x.startsWith("v1,") && same(x.slice(3), want));
}

// Which Resend events must stop all mail: spam complaints, permanent bounces, provider suppression.
export function resendSuppression(evt) {
  const d = (evt && evt.data) || {}, to = [].concat(d.to || []);
  let reason = null;
  if (evt.type === "email.complained") reason = "complaint";
  else if (evt.type === "email.bounced" && !/^transient$/i.test(String((d.bounce && d.bounce.type) || "Permanent"))) reason = "bounce";
  else if (evt.type === "email.suppressed") reason = "provider";
  return reason ? { reason, emails: to } : null;
}

// Stripe signature: header "t=<unix>,v1=<hex>[,v1=...]", HMAC-SHA256 of "<t>.<raw body>" with the endpoint secret.
export function verifyStripeWebhook(secret, header, raw, nowMs = Date.now()) {
  if (!secret || !header) return false;
  const parts = String(header).split(",").map((p) => p.trim().split("="));
  const t = (parts.find((p) => p[0] === "t") || [])[1];
  if (!t || !(Math.abs(nowMs / 1000 - Number(t)) <= 300)) return false;
  const want = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return parts.some((p) => p[0] === "v1" && p[1] && same(p[1], want));
}

// Map a Stripe event to a Drip Keeper event, so "stop the trial emails when they pay" needs no code in your app.
//   checkout.session.completed -> purchased   invoice.paid (first invoice) -> subscribed
//   invoice.payment_failed -> payment_failed   customer.subscription.deleted -> canceled (found by customer id)
export function stripeToEvent(evt) {
  const o = (evt && evt.data && evt.data.object) || {}, customer = typeof o.customer === "string" ? o.customer : null;
  switch (evt && evt.type) {
    case "checkout.session.completed":
      return { event: "purchased", email: (o.customer_details && o.customer_details.email) || o.customer_email, customer };
    case "invoice.paid":
      return o.billing_reason === "subscription_create" ? { event: "subscribed", email: o.customer_email, customer } : null;
    case "invoice.payment_failed":
      return { event: "payment_failed", email: o.customer_email, customer };
    case "customer.subscription.deleted":
      return { event: "canceled", email: null, customer };
    default: return null;
  }
}

export function limiter(max = 600, windowMs = 60_000) {
  const hits = new Map();
  return (ip, now) => { const w = Math.floor(now / windowMs), h = hits.get(ip); if (!h || h.w !== w) { hits.set(ip, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; } return ++h.n <= max; };
}

export function resendSender({ apiKey, from, fetchImpl = fetch }) {
  return async (m) => {
    const r = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html, headers: m.headers }) });
    if (!r.ok) throw new Error(`resend ${r.status}`);
  };
}

export const unsubToken = (secret, email) => `${Buffer.from(email).toString("base64url")}.${createHmac("sha256", secret).update(email).digest("base64url").slice(0, 32)}`;
export function unsubEmail(secret, token) {
  const [a, sig] = String(token).split("."); if (!a || !sig) return null;
  let email; try { email = Buffer.from(a, "base64url").toString("utf8"); } catch { return null; }
  return same(sig, createHmac("sha256", secret).update(email).digest("base64url").slice(0, 32)) ? email : null;
}

// One pass: send what is due. cfg: {state, save, send, dryRun, base, secret, product, address, now}
export async function runTick(cfg, { max = 200 } = {}) {
  const now = (cfg.now || Date.now)();
  const { items } = E.collectDue(cfg.state, now);
  const batch = items.slice(0, max), report = { due: items.length, sent: 0, failed: 0, dryRun: Boolean(cfg.dryRun || !cfg.send), preview: [] };
  if (report.dryRun) { report.preview = batch.slice(0, 20).map((it) => ({ to: it.email, sequence: it.seq, step: it.step + 1 })); return report; }
  for (const it of batch) {
    const url = `${cfg.base}/u/${unsubToken(cfg.secret, it.email)}`;
    const m = E.compose(cfg.state, it, { unsubUrl: url, address: cfg.address, product: cfg.product });
    m.headers = { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
    // Mark first and save, so a crash between send and save can lose one email but never send it twice.
    const en = cfg.state.contacts[it.email].en[it.seq], before = JSON.stringify(en);
    E.markSent(cfg.state, it, now); cfg.save();
    try { await cfg.send(m); report.sent++; }
    catch (e) {
      cfg.state.contacts[it.email].en[it.seq] = JSON.parse(before);
      E.markFailed(cfg.state, it, now); report.failed++; console.error(`send failed for sequence ${it.seq} step ${it.step + 1}: ${e.message}`); cfg.save();
    }
  }
  return report;
}

const CSS = `:root{font:17px system-ui,sans-serif;color:#1d2433;background:#f5f7fb}body{max-width:520px;margin:auto;padding:32px 20px}.card{background:#fff;border:1px solid #dce1ee;border-radius:14px;padding:22px}button{border:0;background:#2f5be7;color:#fff;border-radius:8px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}`;
const page = (t, b) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)}</title><style>${CSS}</style></head><body><div class="card">${b}</div></body></html>`;

export function handler(cfg) {
  const now = cfg.now || Date.now, allow = cfg.allow || limiter();
  const ingestKey = cfg.ingestKey || cfg.adminKey;
  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname;
    const reply = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2)); };
    const json = (c, b) => reply(c, b, "application/json");
    try {
      const ip = (cfg.trustProxy ? (req.headers["x-forwarded-for"] || "").split(",").pop().trim() : "") || req.socket.remoteAddress || "";
      if (path === "/healthz") return reply(200, "ok\n", "text/plain");
      if (!allow(ip, now())) return reply(429, "Slow down.\n", "text/plain");

      let m;
      if ((m = path.match(/^\/u\/([\w.-]+)$/))) {
        const email = unsubEmail(cfg.secret, m[1]);
        if (!email) return reply(400, page("Bad link", "<h1>That link did not work</h1>"));
        if (req.method === "GET") return reply(200, page("Unsubscribe", `<h1>Unsubscribe?</h1><p>Stop all emails to <b>${esc(email)}</b> from ${esc(cfg.product || "this sender")}.</p><form method="post"><button>Unsubscribe</button></form>`));
        if (req.method === "POST") { await readBody(req, 1000); E.unsubscribe(cfg.state, email, now()); cfg.save(); return reply(200, page("Unsubscribed", "<h1>You are unsubscribed</h1><p>No more emails will be sent to this address.</p>")); }
        return reply(405, "Method not allowed\n", "text/plain");
      }

      if (req.method === "POST" && path === "/v1/webhooks/resend") {
        if (!cfg.webhookSecret) return json(404, { error: "set RESEND_WEBHOOK_SECRET to enable" });
        const raw = await readBody(req);
        if (!verifyResendWebhook(cfg.webhookSecret, req.headers, raw, now())) return json(401, { error: "bad signature" });
        const sup = resendSuppression(parseJson(raw));
        const done = sup ? sup.emails.filter((e) => E.unsubscribe(cfg.state, e, now(), sup.reason)) : [];
        if (done.length) cfg.save();
        return json(200, { suppressed: done.length, reason: sup ? sup.reason : null });
      }

      if (req.method === "POST" && path === "/v1/webhooks/stripe") {
        if (!cfg.stripeSecret) return json(404, { error: "set STRIPE_WEBHOOK_SECRET to enable" });
        const raw = await readBody(req, 1_000_000);
        if (!verifyStripeWebhook(cfg.stripeSecret, req.headers["stripe-signature"], raw, now())) return json(401, { error: "bad signature" });
        const mapped = stripeToEvent(parseJson(raw));
        if (!mapped) return json(200, { ignored: true });
        let email = mapped.email;
        if (!email && mapped.customer) email = (Object.values(cfg.state.contacts).find((c) => c.props.stripe_customer === mapped.customer) || {}).email;
        if (!email) return json(200, { ignored: true, reason: "no known contact for this customer" });
        const r = E.track(cfg.state, { email, event: mapped.event, props: mapped.customer ? { stripe_customer: mapped.customer } : {}, at: now() });
        cfg.save(); return json(200, r);
      }

      if (req.method === "POST" && (path === "/v1/events" || path === "/v1/contacts")) {
        if (!bearerOk(req, ingestKey)) return json(401, { error: "bad key" });
        const b = parseJson(await readBody(req));
        const r = path === "/v1/events" ? E.track(cfg.state, { email: b.email, event: b.event, props: { ...(b.name ? { name: b.name } : {}), ...b.props }, at: now() }) : (E.upsert(cfg.state, b.email, { ...(b.name ? { name: b.name } : {}), ...b.props }, now()), { email: E.normalizeEmail(b.email) });
        cfg.save(); return json(200, r);
      }

      if (path.startsWith("/v1/admin")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        const a = path.slice(9);
        if (req.method === "GET" && a === "/stats") return json(200, E.stats(cfg.state));
        if (req.method === "GET" && a === "/export.csv") return reply(200, E.toCsv(cfg.state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="contacts.csv"' });
        if (req.method === "GET" && a === "/sequences") return json(200, cfg.state.sequences);
        if (req.method === "PUT" && a === "/sequences") { cfg.state.sequences = E.validateSequences(parseJson(await readBody(req))); cfg.save(); return json(200, { sequences: cfg.state.sequences.length }); }
        if (req.method === "POST" && a === "/tick") return json(200, await runTick(cfg));
        if (req.method === "POST" && a === "/suppress") { const b = parseJson(await readBody(req)); const ok = E.unsubscribe(cfg.state, b.email, now(), String(b.reason || "manual").slice(0, 40)); cfg.save(); return json(ok ? 200 : 404, { suppressed: ok }); }
        if ((m = a.match(/^\/contacts\/(.+)$/))) {
          const email = E.normalizeEmail(decodeURIComponent(m[1]));
          if (req.method === "GET") { const c = email && cfg.state.contacts[email]; return c ? json(200, c) : json(404, { error: "no such contact" }); }
          if (req.method === "DELETE") { const ok = email ? E.erase(cfg.state, email) : false; cfg.save(); return json(ok ? 200 : 404, { erased: ok }); }
        }
        return json(404, { error: "not found" });
      }
      return reply(404, "Not found\n", "text/plain");
    } catch (e) {
      const code = e.status || 500; if (code === 500) console.error(e);
      return json(code, { error: code === 500 ? "server error" : e.message });
    }
  };
}

export function loadState(file) {
  try { const s = JSON.parse(fs.readFileSync(file, "utf8")); return { ...E.newState(), ...s }; } catch { return E.newState(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16) { console.error("Set ADMIN_KEY (16+ characters)."); process.exit(1); }
  const file = env.STATE || "/tmp/state.json", state = loadState(file);
  if (!state.sequences.length && env.SEQUENCES_FILE) state.sequences = E.validateSequences(JSON.parse(fs.readFileSync(env.SEQUENCES_FILE, "utf8")));
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  const dryRun = env.DRY_RUN !== "false", base = (env.BASE_URL || `http://localhost:${env.PORT || 8080}`).replace(/\/$/, "");
  const send = env.RESEND_API_KEY && env.MAIL_FROM ? resendSender({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }) : null;
  if (!dryRun && !env.POSTAL_ADDRESS) console.error("warning: POSTAL_ADDRESS is empty. Marketing email in many countries (CAN-SPAM in the US) must carry a postal address.");
  const cfg = { state, save, adminKey: env.ADMIN_KEY, ingestKey: env.INGEST_KEY, secret: env.UNSUB_SECRET || env.ADMIN_KEY, base, product: env.PRODUCT_NAME || "", address: env.POSTAL_ADDRESS || "", dryRun, send, webhookSecret: env.RESEND_WEBHOOK_SECRET, stripeSecret: env.STRIPE_WEBHOOK_SECRET, trustProxy: env.TRUST_PROXY === "true" };
  http.createServer(handler(cfg)).listen(Number(env.PORT) || 8080, () => console.log(`drip-keeper on :${env.PORT || 8080} (dry run: ${dryRun || !send})`));
  let busy = false;
  setInterval(async () => { if (busy) return; busy = true; try { const r = await runTick(cfg); if (r.sent || r.failed) console.log(`tick: sent ${r.sent}, failed ${r.failed}`); } catch (e) { console.error("tick error", e.message); } finally { busy = false; } }, Math.max(10, Number(env.TICK_SECONDS) || 60) * 1000);
}
