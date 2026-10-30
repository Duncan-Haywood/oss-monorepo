// Babysitting Business Kit: the server side of invoices. A family's pay link shows the
// invoice and how to pay; card payments are optional and go to the sitter's OWN Stripe
// account, never anyone else's. Off until both variables are set:
//
//   STRIPE_SECRET_KEY      the sitter's secret key (sk_live_... or sk_test_...)
//   STRIPE_WEBHOOK_SECRET  the signing secret (whsec_...) of a webhook endpoint at
//                          PUBLIC_URL/stripe/webhook listening for checkout.session.completed
//
//   GET  /pay/<token>      the invoice, payment instructions, and (with Stripe) a card form
//   POST /pay/<token>      creates a Stripe Checkout Session for the balance (+ optional tip)
//                          and redirects the family to Stripe's hosted page
//   POST /stripe/webhook   verifies the Stripe-Signature header and records the payment on
//                          the invoice's sits, once per Checkout Session
//
// Stripe's signature scheme (https://docs.stripe.com/webhooks, "Verify webhook signatures
// manually"): the header is "t=<unix time>,v1=<hex>[,v1=...]"; the signed payload is the
// timestamp, ".", then the raw request body; the signature is HMAC-SHA256 of that with the
// endpoint secret; compare in constant time and reject timestamps outside a tolerance
// (Stripe's libraries default to 5 minutes). Schemes other than v1 are ignored.

import { createHmac, timingSafeEqual } from "node:crypto";
import { invoiceSettings, invoiceStatus, invoiceHTML, recordInvoicePayment, isPayToken } from "./invoices.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const MAX_WEBHOOK = 256 * 1024;
export const TOLERANCE_SEC = 300;
export const MIN_CHARGE_CENTS = 50; // Stripe's minimum charge in USD

export const stripeOn = (env) => !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

export function stripeSignature(secret, timestamp, body) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

// true only if one v1 signature matches and the timestamp is within the tolerance.
export function verifyStripeSignature(header, body, secret, nowSec, tolerance = TOLERANCE_SEC) {
  if (!secret || !header) return false;
  let t = null;
  const v1 = [];
  for (const part of String(header).split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1.push(v);
  }
  if (!t || !/^\d+$/.test(t) || !v1.length) return false;
  if (!(tolerance > 0) || Math.abs(nowSec - Number(t)) > tolerance) return false;
  const want = Buffer.from(stripeSignature(secret, t, body), "hex");
  return v1.some((s) => { const got = Buffer.from(s, "hex"); return got.length === want.length && timingSafeEqual(got, want); });
}

// Stripe's API takes form-encoded bodies with bracketed keys for nested objects.
export function formEncode(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(formEncode(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join("&");
}

// The tip a family picked on the pay page, in cents: "none", "10", "15", "20" (percent of
// the balance) or "custom" with a dollar amount, capped at the balance.
export function tipCents(fields, balanceCents) {
  const pick = String(fields.tip || "none");
  if (/^(10|15|20)$/.test(pick)) return Math.round((balanceCents * Number(pick)) / 100);
  if (pick === "custom") {
    const c = Math.round(Number(fields.tipAmount) * 100);
    return Number.isFinite(c) && c > 0 ? Math.min(c, balanceCents) : 0;
  }
  return 0;
}

export function checkoutParams(desk, inv, { balanceCents, tip, base, token }) {
  const who = desk.profile.businessName || desk.profile.name || "Babysitting";
  const line = (name, cents) => ({ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name } } });
  const items = [line(`Babysitting, invoice ${inv.number}`, balanceCents)];
  if (tip > 0) items.push(line("Tip", tip));
  const p = {
    mode: "payment",
    success_url: `${base}/pay/${token}?paid=1`,
    cancel_url: `${base}/pay/${token}`,
    client_reference_id: inv.id,
    metadata: { invoice_id: inv.id, invoice_number: inv.number, tip_cents: tip },
    payment_intent_data: { description: `${who}: invoice ${inv.number}`, metadata: { invoice_id: inv.id } },
  };
  items.forEach((it, i) => { p[`line_items[${i}]`] = it; });
  return p;
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:17px/1.6 Georgia,serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

function cardForm(desk, st) {
  const tips = invoiceSettings(desk.profile).tips;
  const choice = tips ? `<fieldset style="border:0;padding:0"><legend>Add a tip? (optional)</legend>${[["none", "No tip"], ["10", "10%"], ["15", "15%"], ["20", "20%"]].map(([v, l], i) => `<label style="display:inline-block;margin-right:1rem"><input type="radio" name="tip" value="${v}"${i === 0 ? " checked" : ""}> ${l}</label>`).join("")}<label style="display:inline-block"><input type="radio" name="tip" value="custom"> Other: $<input name="tipAmount" type="number" min="0" step="0.01" style="width:6rem" aria-label="Tip amount in dollars"></label></fieldset>` : "";
  return `<form method="post" class="noprint">${choice}<p><button type="submit">Pay $${st.balance.toFixed(2)} by card</button></p><p class="muted">Card payments are handled by Stripe on ${esc(desk.profile.businessName || desk.profile.name)}'s own Stripe account.</p></form>`;
}

const findInvoice = (desk, token) => {
  if (!isPayToken(token)) return null;
  const want = Buffer.from(token);
  return (desk.invoices || []).find((i) => { if (!i || i.status === "void" || !i.payToken) return false; const got = Buffer.from(String(i.payToken)); return got.length === want.length && timingSafeEqual(got, want); }) || null;
};

const localDate = (ms, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

async function readRaw(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) return null; chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

// Returns an async (req, url, send) => handled? for server.mjs.
export function invoiceRoutes(state, save, env, now = Date.now, fetchImpl = globalThis.fetch, notify = async () => false) {
  const hits = new Map();
  return async (req, url, send) => {
    const nostore = { "cache-control": "no-store" };
    if (url.pathname.startsWith("/pay/")) {
      if (req.method !== "GET" && req.method !== "POST") return send(405, "method not allowed\n", "text/plain"), true;
      const token = url.pathname.slice(5);
      const inv = findInvoice(state.desk, token);
      if (!inv) return send(404, page("Invoice not found", "<p>This payment link is not valid any more. Please ask your babysitter directly.</p>"), undefined, nostore), true;
      const today = localDate(now(), env.TZ);
      const st = invoiceStatus(state.desk, inv, today);
      const on = stripeOn(env) && st.balance * 100 >= MIN_CHARGE_CENTS;
      if (req.method === "GET") {
        const thanks = url.searchParams.get("paid") === "1" ? `<p class="paid"><strong>Thank you! Your card payment went through.</strong> It shows here as soon as Stripe confirms it, usually within a minute.</p>` : "";
        const html = invoiceHTML(state.desk, inv, today, { cardForm: on ? cardForm(state.desk, st) : "" }).replace("<body>", `<body>${thanks}`);
        return send(200, html, undefined, nostore), true;
      }
      if (!on) return send(400, page("Card payments are off", "<p>Please pay using the instructions on the invoice.</p>"), undefined, nostore), true;
      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
      const key = `pay|${ip}|${Math.floor(now() / 36e5)}`;
      hits.set(key, (hits.get(key) || 0) + 1);
      if (hits.size > 5000) hits.clear();
      if (hits.get(key) > 10) return send(429, page("Slow down", "<p>Too many tries from here. Please try again later.</p>")), true;
      const raw = await readRaw(req, 4096);
      if (raw === null) return send(413, page("Too long", "<p>That request was too long.</p>")), true;
      const fields = Object.fromEntries(new URLSearchParams(raw));
      const balanceCents = Math.round(st.balance * 100);
      const tip = invoiceSettings(state.desk.profile).tips ? tipCents(fields, balanceCents) : 0;
      const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
      const base = /^https?:\/\//.test(env.PUBLIC_URL || "") ? env.PUBLIC_URL.replace(/\/+$/, "") : `${proto}://${req.headers.host}`;
      try {
        const r = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
          method: "POST",
          headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
          body: formEncode(checkoutParams(state.desk, inv, { balanceCents, tip, base, token })),
          signal: AbortSignal.timeout(10000),
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || !/^https:\/\//.test(out.url || "")) throw new Error((out.error && out.error.message) || `Stripe said ${r.status}`);
        return send(303, "", "text/plain", { location: out.url, ...nostore }), true;
      } catch (e) {
        console.error("stripe checkout failed:", e.message);
        return send(502, page("Card payment unavailable", "<p>The card payment page could not be opened just now. Please try again later, or pay using the instructions on the invoice.</p>"), undefined, nostore), true;
      }
    }
    if (url.pathname === "/stripe/webhook" && req.method === "POST") {
      if (!stripeOn(env)) return send(404, "not found\n", "text/plain"), true;
      const raw = await readRaw(req, MAX_WEBHOOK);
      if (raw === null) return send(413, "too large\n", "text/plain"), true;
      if (!verifyStripeSignature(req.headers["stripe-signature"], raw, env.STRIPE_WEBHOOK_SECRET, Math.floor(now() / 1000))) return send(400, "bad signature\n", "text/plain"), true;
      let event;
      try { event = JSON.parse(raw); } catch { return send(400, "not JSON\n", "text/plain"), true; }
      const r = recordStripeEvent(state.desk, event, env.TZ);
      if (r.recorded) { save(); await notify(`Card payment: $${r.total.toFixed(2)} for invoice ${r.number}`, `${r.family}${r.tip ? `, including a $${r.tip.toFixed(2)} tip` : ""}. Sync the app to see it.`); }
      return send(200, JSON.stringify({ received: true, ...r }), "application/json"), true;
    }
    return false;
  };
}

// Apply a verified Stripe event. Only checkout.session.completed with payment_status
// "paid" records anything, and each session only once.
export function recordStripeEvent(desk, event, tz) {
  const s = event && event.data && event.data.object;
  if (!event || event.type !== "checkout.session.completed" || !s || s.payment_status !== "paid") return { recorded: false, why: "ignored" };
  const inv = (desk.invoices || []).find((i) => i && i.id === (s.metadata && s.metadata.invoice_id));
  if (!inv) return { recorded: false, why: "no such invoice" };
  const totalCents = Math.round(Number(s.amount_total) || 0);
  const tipC = Math.min(totalCents, Math.max(0, Math.round(Number(s.metadata.tip_cents) || 0)));
  const date = localDate((Number(event.created) || Number(s.created) || 0) * 1000, tz);
  const rid = recordInvoicePayment(desk, inv, { amount: (totalCents - tipC) / 100, tip: tipC / 100, date, method: "card (Stripe)", ref: s.id, stripe: s.id });
  if (!rid) return { recorded: false, why: "already recorded" };
  const fam = desk.families.find((f) => f.id === inv.familyId);
  return { recorded: true, receipt: rid, number: inv.number, total: totalCents / 100, tip: tipC / 100, family: fam ? fam.name : "A family" };
}
