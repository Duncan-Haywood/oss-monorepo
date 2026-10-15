#!/usr/bin/env node
// Self-hosted referral / affiliate program for Stripe. Zero dependencies.
//   STRIPE_WEBHOOK_SECRET=whsec_... ADMIN_KEY=... LINK_SECRET=... \
//   PUBLIC_URL=https://partners.example.com LANDING_URL=https://example.com/pricing \
//   COMPANY_NAME=Acme node server.mjs
// It never moves money and never writes to Stripe: it reads webhooks, keeps a ledger,
// and tells you who to pay and how much.
import http from "node:http";
import fs from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifySignature, createStripe } from "./stripe.mjs";
import { mergePolicy, newState, extractCode, attribute, accrue, applyRefund, createAffiliate, recordClick, balances, markPaid, statsFor, summarize, payoutCsv, CODE_RE, money } from "./commission.mjs";
import { renderJoin, renderDashboard } from "./page.mjs";
import { snippetSource } from "./snippet.mjs";

export { newState };
const env = process.env;
const MAX_AFFILIATES = 5000, MAX_SEEN = 3000, MAX_ORPHANS = 200, DAY = 86400000;

export const dashToken = (secret, code) => `${code}.${createHmac("sha256", secret).update(`affiliate:${code}`).digest("base64url").slice(0, 24)}`;
export function readDashToken(secret, token) {
  const [code, sig] = String(token).split(".");
  if (!code || !sig || !CODE_RE.test(code)) return null;
  const want = Buffer.from(dashToken(secret, code).split(".")[1]), got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want) ? code : null;
}

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

// Only https URLs on a host you listed, or a path on the landing site: never an open redirect.
export function landingTarget(cfg, to, code) {
  let base; try { base = new URL(cfg.landingUrl); } catch { return null; }
  const hosts = new Set([base.host, ...(cfg.landingHosts || [])]);
  let target;
  if (!to) target = new URL(base);
  else if (to.startsWith("/") && !to.startsWith("//") && !to.includes("\\")) target = new URL(to, base.origin);
  else { try { target = new URL(to); } catch { return null; } }
  if (target.protocol !== "https:" || !hosts.has(target.host)) return null;
  if (code) target.searchParams.set("ref", code);
  return target.toString();
}

export const policySentence = (policy) =>
  `Earn ${Math.round(policy.rate * 1000) / 10}% of what each customer you refer pays${policy.months ? `, for their first ${policy.months} months` : ", for as long as they stay"}. Commission is held ${policy.holdDays} days, then payable once your balance reaches ${money(policy.minPayoutCents)}.`;

// cfg: {state, save, stripe, webhookSecret, linkSecret, adminKey, publicUrl, landingUrl, landingHosts, policy, openSignup, company, color, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const policy = mergePolicy(cfg.policy || {});
  const state = cfg.state;
  const company = cfg.company || "Our";
  const joinHits = []; // timestamps, for a coarse global signup throttle

  async function onInvoicePaid(invoice) {
    let res = accrue(state, invoice, policy, now());
    if (res.why === "not_referred") {
      // invoice.paid can beat checkout.session.completed; keep it briefly and replay on attribution.
      const o = (state.orphans ||= {});
      if (invoice.customer && (o[invoice.customer] || Object.keys(o).length < MAX_ORPHANS)) {
        const list = (o[invoice.customer] ||= { at: now(), invoices: [] });
        if (list.invoices.length < 5 && !list.invoices.some((i) => i.id === invoice.id)) list.invoices.push(slimInvoice(invoice));
      }
      return res;
    }
    if (res.ok) await fillRefs(invoice);
    return res;
  }
  async function fillRefs(invoice) {
    const e = state.entries.find((x) => x.invoice === invoice.id && x.kind === "commission");
    if (!e || e.charge || e.paymentIntent || !cfg.stripe) return;
    try { const refs = await cfg.stripe.invoicePaymentRefs(invoice.id); e.charge = refs.find((x) => x.startsWith("ch_")) || null; e.paymentIntent = refs.find((x) => x.startsWith("pi_")) || null; } catch (err) { console.error("invoice_payments lookup failed:", err.message); }
  }
  async function replayOrphans(customer) {
    const o = state.orphans?.[customer];
    if (!o) return;
    delete state.orphans[customer];
    for (const inv of o.invoices) { const r = accrue(state, inv, policy, now()); if (r.ok) await fillRefs(inv); }
  }
  const slimInvoice = (i) => ({ id: i.id, customer: i.customer, customer_email: i.customer_email, amount_paid: i.amount_paid, total: i.total, tax: i.tax, total_excluding_tax: i.total_excluding_tax, currency: i.currency, created: i.created, charge: i.charge, payment_intent: i.payment_intent });
  function pruneOrphans() {
    const o = state.orphans; if (!o) return;
    for (const [c, v] of Object.entries(o)) if (now() - v.at > 2 * DAY) delete o[c];
  }

  async function onEvent(event) {
    const obj = event.data.object;
    pruneOrphans();
    switch (event.type) {
      case "checkout.session.completed": {
        const customer = obj.customer || (obj.mode === "payment" ? `guest_${obj.id}` : null);
        const code = extractCode(obj);
        const out = { attributed: false };
        if (code && customer) {
          const r = attribute(state, { customer, code, email: obj.customer_details?.email || obj.customer_email, now: now() });
          out.attributed = r.ok; out.why = r.why;
          if (r.ok) await replayOrphans(customer);
        }
        // One-time payments have no invoice unless you turned invoice creation on.
        if (obj.mode === "payment" && !obj.invoice && obj.payment_status === "paid" && customer && state.customers[customer]) {
          const tax = obj.total_details?.amount_tax || 0;
          const r = accrue(state, { id: obj.id, customer, customer_email: obj.customer_details?.email || obj.customer_email, amount_paid: obj.amount_total, total_excluding_tax: obj.amount_total - tax, currency: obj.currency, created: obj.created, payment_intent: obj.payment_intent }, policy, now());
          out.accrued = r.ok;
        }
        return out;
      }
      case "customer.created": {
        const code = extractCode(obj);
        if (!code) return { attributed: false };
        const r = attribute(state, { customer: obj.id, code, email: obj.email, now: now() });
        if (r.ok) await replayOrphans(obj.id);
        return { attributed: r.ok, why: r.why };
      }
      case "invoice.paid": return onInvoicePaid(obj);
      case "charge.refunded": return { adjusted: applyRefund(state, { keys: [obj.id, obj.payment_intent, obj.invoice], amount: obj.amount, amountRefunded: obj.amount_refunded }, now()) };
      case "charge.dispute.created": return { adjusted: applyRefund(state, { keys: [obj.charge, obj.payment_intent], full: true }, now()) };
      default: return { ignored: true };
    }
  }

  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const fail = (code, error) => send(code, { error });
    const html = (code, body) => send(code, body, "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
    const sentence = policySentence(policy);
    const linkFor = (code) => `${cfg.publicUrl}/r/${code}`;
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");

      if (req.method === "POST" && url.pathname === "/webhook/stripe") {
        const raw = await readBody(req, 1_000_000);
        if (!verifySignature(raw, req.headers["stripe-signature"], cfg.webhookSecret, Math.floor(now() / 1000))) return send(400, "bad signature\n", "text/plain");
        const event = JSON.parse(raw);
        if (state.seen.includes(event.id)) return send(200, { ignored: "duplicate" });
        state.seen.push(event.id); if (state.seen.length > MAX_SEEN) state.seen.shift();
        const out = await onEvent(event);
        cfg.save();
        return send(200, { received: event.type, ...out });
      }

      if (url.pathname === "/rk.js" && req.method === "GET") return send(200, snippetSource({ cookieDays: policy.cookieDays }), "text/javascript; charset=utf-8", { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" });

      const r = url.pathname.match(/^\/r\/([^/]+)$/);
      if (r && req.method === "GET") {
        const code = decodeURIComponent(r[1]).toLowerCase();
        const aff = state.affiliates[code];
        const active = aff && aff.status === "active";
        const target = landingTarget(cfg, url.searchParams.get("to"), active ? code : null);
        if (!target) return fail(400, "That destination is not allowed.");
        if (active) { recordClick(state, code, now()); cfg.save(); }
        return send(302, "", "text/plain", { location: target });
      }

      if (url.pathname === "/join") {
        if (!cfg.openSignup) return send(404, "not found\n", "text/plain");
        if (req.method === "GET") return html(200, renderJoin({ company, color: cfg.color, policyText: sentence }));
        if (req.method === "POST") {
          const t = now(); while (joinHits.length && t - joinHits[0] > 3600_000) joinHits.shift();
          if (joinHits.length >= 60 || Object.keys(state.affiliates).length >= MAX_AFFILIATES) return html(429, renderJoin({ company, color: cfg.color, policyText: sentence, error: "Sign-ups are busy right now. Please try again later." }));
          const form = new URLSearchParams(await readBody(req, 5000));
          const out = createAffiliate(state, { name: form.get("name"), email: form.get("email") }, t);
          if (out.error) return html(400, renderJoin({ company, color: cfg.color, policyText: sentence, error: out.error }));
          joinHits.push(t); cfg.save();
          return send(303, "", "text/plain", { location: `/a/${dashToken(cfg.linkSecret, out.affiliate.code)}` });
        }
      }

      const a = url.pathname.match(/^\/a\/([^/]+)$/);
      if (a && req.method === "GET") {
        const code = readDashToken(cfg.linkSecret, decodeURIComponent(a[1]));
        const aff = code && state.affiliates[code];
        if (!aff) return send(404, "not found\n", "text/plain");
        return html(200, renderDashboard({ company, color: cfg.color, affiliate: aff, link: linkFor(code), stats: statsFor(state, code, policy, now()), policyText: aff.rate ? sentence.replace(/Earn [\d.]+%/, `Earn ${Math.round(aff.rate * 1000) / 10}%`) : sentence }));
      }

      if (url.pathname.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return fail(401, "admin key required");
        if (req.method === "GET" && url.pathname === "/v1/summary") return send(200, summarize(state, policy, now()));
        if (url.pathname === "/v1/affiliates") {
          if (req.method === "GET") {
            const bal = balances(state, policy, now());
            return send(200, Object.values(state.affiliates).map((x) => ({ ...x, link: linkFor(x.code), dashboard: `${cfg.publicUrl}/a/${dashToken(cfg.linkSecret, x.code)}`, balances: bal[x.code] || {} })));
          }
          if (req.method === "POST") {
            if (Object.keys(state.affiliates).length >= MAX_AFFILIATES) return fail(409, "affiliate limit reached");
            const out = createAffiliate(state, JSON.parse((await readBody(req)) || "{}"), now());
            if (out.error) return fail(400, out.error);
            cfg.save();
            return send(201, { ...out.affiliate, link: linkFor(out.affiliate.code), dashboard: `${cfg.publicUrl}/a/${dashToken(cfg.linkSecret, out.affiliate.code)}` });
          }
        }
        const st = url.pathname.match(/^\/v1\/affiliates\/([^/]+)\/status$/);
        if (st && req.method === "POST") {
          const aff = state.affiliates[decodeURIComponent(st[1])];
          const { status } = JSON.parse((await readBody(req)) || "{}");
          if (!aff) return fail(404, "no such affiliate");
          if (!["active", "suspended"].includes(status)) return fail(400, "status must be active or suspended");
          aff.status = status; cfg.save();
          return send(200, aff);
        }
        if (req.method === "GET" && url.pathname === "/v1/payouts") {
          const due = [];
          for (const [code, byCur] of Object.entries(balances(state, policy, now()))) for (const [currency, b] of Object.entries(byCur)) if (b.due) due.push({ code, currency, cents: b.due, name: state.affiliates[code]?.name, email: state.affiliates[code]?.email });
          return send(200, { due, history: state.payouts.slice(-100) });
        }
        if (req.method === "GET" && url.pathname === "/v1/payouts.csv") return send(200, payoutCsv(state, policy, now()), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="payouts-due.csv"' });
        if (req.method === "POST" && url.pathname === "/v1/payouts") {
          const b = JSON.parse((await readBody(req)) || "{}");
          if (!state.affiliates[b.code]) return fail(404, "no such affiliate");
          const out = markPaid(state, { code: b.code, currency: String(b.currency || "usd").toLowerCase(), method: b.method, reference: b.reference }, policy, now());
          if (out.error) return fail(409, out.error);
          cfg.save();
          return send(201, out.payout);
        }
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e.status && e.status < 500 ? e.status : e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? "invalid JSON" : "Something went wrong." });
    }
  };
}

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = ["STRIPE_WEBHOOK_SECRET", "ADMIN_KEY", "LINK_SECRET", "PUBLIC_URL", "LANDING_URL"].filter((k) => !env[k]);
  if (missing.length) { console.error(`missing env: ${missing.join(", ")}`); process.exit(1); }
  if (!/^https:\/\//.test(env.LANDING_URL)) { console.error("LANDING_URL must be an https URL"); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = Object.assign(newState(), readJson(statePath, {}));
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const cfg = {
    state, save, stripe: env.STRIPE_SECRET_KEY ? createStripe({ key: env.STRIPE_SECRET_KEY }) : null, webhookSecret: env.STRIPE_WEBHOOK_SECRET, linkSecret: env.LINK_SECRET, adminKey: env.ADMIN_KEY,
    publicUrl: env.PUBLIC_URL.replace(/\/$/, ""), landingUrl: env.LANDING_URL, landingHosts: (env.LANDING_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean),
    policy: env.POLICY_JSON ? JSON.parse(env.POLICY_JSON) : {}, openSignup: env.OPEN_SIGNUP === "true", company: env.COMPANY_NAME, color: env.BRAND_COLOR,
  };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`referral-keeper on :${env.PORT || 8080}${cfg.openSignup ? " (open sign-up)" : ""}`));
}
