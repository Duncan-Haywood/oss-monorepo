// Minimal Stripe pieces, no SDK: webhook signature verification and the two
// read calls issuing a license needs. Use a restricted key (rk_...) with
// Checkout Sessions: read and Subscriptions: read. This server never writes to Stripe.
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

export function createStripe({ key, fetchImpl = fetch, base = "https://api.stripe.com" }) {
  async function get(path) {
    const res = await fetchImpl(`${base}${path}`, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`stripe ${res.status} on ${path.split("?")[0]}`);
    return res.json();
  }
  return {
    // -> [{priceId, quantity}]
    async lineItems(sessionId) {
      const r = await get(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=20`);
      return r.data.map((i) => ({ priceId: i.price && i.price.id, quantity: i.quantity || 1 }));
    },
    subscription: (id) => get(`/v1/subscriptions/${encodeURIComponent(id)}`),
  };
}
