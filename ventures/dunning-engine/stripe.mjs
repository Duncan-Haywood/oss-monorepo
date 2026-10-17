// Minimal Stripe pieces, no SDK: webhook signature verification and the four
// API calls recovery needs. Use a restricted key (rk_...) with Invoices: write,
// Customer portal: write, Subscriptions: write (only if you enable cancelling),
// PaymentIntents: read, Customers: read, Subscriptions: read (expiry notices),
// PaymentMethods: read.
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
      e.status = res.status; e.code = json?.error?.code; e.declineCode = json?.error?.decline_code; e.body = json;
      throw e;
    }
    return json;
  }
  return {
    getInvoice: (id) => call("GET", `/v1/invoices/${encodeURIComponent(id)}`),
    // Pay an open invoice with the customer's default payment method. A decline
    // comes back as a 402 error carrying decline_code, which the caller records.
    payInvoice: (id, idempotencyKey) => call("POST", `/v1/invoices/${encodeURIComponent(id)}/pay`, {}, { "idempotency-key": idempotencyKey }),
    // The decline code lives on the PaymentIntent. Older API versions put the
    // intent on the invoice; 2025+ versions list it under invoice_payments.
    async declineCodeFor(invoice) {
      let pi = invoice.payment_intent;
      if (!pi) {
        const list = await call("GET", `/v1/invoice_payments?invoice=${encodeURIComponent(invoice.id)}&limit=1`).catch(() => null);
        pi = list?.data?.[0]?.payment?.payment_intent;
      }
      const id = typeof pi === "string" ? pi : pi?.id;
      if (!id) return null;
      const intent = typeof pi === "object" && pi.last_payment_error ? pi : await call("GET", `/v1/payment_intents/${encodeURIComponent(id)}`);
      const err = intent.last_payment_error;
      return err?.decline_code || err?.code || null;
    },
    // Portal session URLs are short-lived, so emails link to this service's own
    // /update/<token> route, which mints a fresh session on click.
    portalUrl: async (customer, returnUrl) => (await call("POST", "/v1/billing_portal/sessions", { customer, return_url: returnUrl })).url,
    // Active subscriptions with the card (and customer) expanded, for expiry
    // notices. Pages of 100, capped so a huge account cannot run away.
    async listSubscriptionsWithCards(maxPages = 50) {
      const out = [];
      let after;
      for (let i = 0; i < maxPages; i++) {
        const q = new URLSearchParams({ status: "active", limit: "100" });
        for (const e of ["data.default_payment_method", "data.customer", "data.customer.invoice_settings.default_payment_method"]) q.append("expand[]", e);
        if (after) q.set("starting_after", after);
        const page = await call("GET", `/v1/subscriptions?${q}`);
        out.push(...page.data);
        if (!page.has_more || !page.data.length) break;
        after = page.data[page.data.length - 1].id;
      }
      return out;
    },
    cancelSubscription: (id, idempotencyKey) => call("DELETE", `/v1/subscriptions/${encodeURIComponent(id)}`, null, { "idempotency-key": idempotencyKey }),
  };
}
