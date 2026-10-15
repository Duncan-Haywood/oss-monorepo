// Minimal Stripe pieces, no SDK. The server only ever READS from Stripe, and only
// as a fallback: a restricted key (rk_...) with Invoices: read is enough, and the
// program runs from webhooks alone without any key.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = String(header).split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const want = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => { const got = Buffer.from(s, "hex"); return got.length === want.length && timingSafeEqual(got, want); });
}

export function signPayload(rawBody, secret, tSec) {
  return `t=${tSec},v1=${createHmac("sha256", secret).update(`${tSec}.${rawBody}`).digest("hex")}`;
}

export function createStripe({ key, fetchImpl = fetch, base = "https://api.stripe.com" }) {
  async function get(path) {
    const res = await fetchImpl(`${base}${path}`, { headers: { authorization: `Bearer ${key}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json?.error?.message || `stripe ${res.status}`), { status: res.status });
    return json;
  }
  return {
    // Newer API versions no longer put charge / payment_intent on the invoice; this finds them
    // so a later refund can be matched back to the commission it came from.
    async invoicePaymentRefs(invoiceId) {
      const r = await get(`/v1/invoice_payments?invoice=${encodeURIComponent(invoiceId)}&limit=10`);
      const refs = [];
      for (const p of r.data || []) for (const k of ["charge", "payment_intent"]) if (typeof p.payment?.[k] === "string") refs.push(p.payment[k]);
      return refs;
    },
  };
}
