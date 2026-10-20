// Minimal Stripe pieces, no SDK: webhook signature verification and the few API
// calls trial conversion needs. Use a restricted key (rk_...) with Customers:
// read, Customer portal: write, Subscriptions: read, and Subscriptions: write
// only if you enable trial extensions (EXTEND_DAYS).
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = String(header).split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const want = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

export function signPayload(rawBody, secret, tSec) {
  return `t=${tSec},v1=${createHmac("sha256", secret).update(`${tSec}.${rawBody}`).digest("hex")}`;
}

const form = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)).toString();

export function createStripe({ key, fetchImpl = fetch, base = "https://api.stripe.com" }) {
  async function call(method, path, body, headers = {}) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded", ...headers },
      body: body ? form(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(json?.error?.message || `stripe ${res.status}`);
      e.status = res.status; e.code = json?.error?.code; e.body = json;
      throw e;
    }
    return json;
  }
  const customer = (id) => call("GET", `/v1/customers/${encodeURIComponent(id)}`);
  return {
    getSubscription: (id) => call("GET", `/v1/subscriptions/${encodeURIComponent(id)}`),
    customerEmail: async (id) => { const c = await customer(id); return c.email ? { email: c.email, name: c.name || null } : null; },
    // A trial has a card if the subscription names one or the customer has a
    // default. Card-less trials (no payment method collected up front) have neither.
    async hasCardFor(sub) {
      if (sub.default_payment_method || sub.default_source) return true;
      const id = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (!id) return false;
      const c = await customer(id);
      return Boolean(c.invoice_settings?.default_payment_method || c.default_source);
    },
    // Portal session URLs are short-lived, so emails link to this service's own
    // /manage/<token> route, which mints a fresh session on click.
    portalUrl: async (cust, returnUrl) => (await call("POST", "/v1/billing_portal/sessions", { customer: cust, return_url: returnUrl })).url,
    extendTrial: (id, trialEndUnix, idempotencyKey) => call("POST", `/v1/subscriptions/${encodeURIComponent(id)}`, { trial_end: trialEndUnix, proration_behavior: "none" }, { "idempotency-key": idempotencyKey }),
  };
}
