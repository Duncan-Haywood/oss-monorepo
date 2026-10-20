// Minimal Stripe pieces, no SDK. Use a restricted key (rk_...) with
// Subscriptions: write, Coupons: write, Customers: read.
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

const form = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)).toString();

// Stripe returns the shape we need in slightly different places across API versions.
export function normalizeSubscription(s) {
  const item = s.items?.data?.[0];
  const price = item?.price || s.plan || {};
  return {
    id: s.id,
    customer: typeof s.customer === "string" ? s.customer : s.customer?.id,
    status: s.status,
    cancelAtPeriodEnd: Boolean(s.cancel_at_period_end || s.cancel_at),
    amount: (price.unit_amount ?? price.amount ?? 0) * (item?.quantity ?? 1),
    currency: price.currency || s.currency || "usd",
    interval: price.recurring?.interval || price.interval || "month",
    intervalCount: price.recurring?.interval_count || price.interval_count || 1,
    periodEnd: (item?.current_period_end ?? s.current_period_end ?? 0) * 1000,
    paused: Boolean(s.pause_collection),
  };
}

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
  const subPath = (id) => `/v1/subscriptions/${encodeURIComponent(id)}`;
  return {
    async getCustomer(id) { const c = await call("GET", `/v1/customers/${encodeURIComponent(id)}`); return { id: c.id, email: c.email || null, name: c.name || null, deleted: Boolean(c.deleted) }; },
    async hasActiveSubscription(customer) {
      const r = await call("GET", `/v1/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=10`);
      return (r.data || []).some((s) => ["active", "trialing", "past_due"].includes(s.status));
    },
    async getSubscription(id) { return normalizeSubscription(await call("GET", `${subPath(id)}`)); },
    // One coupon per (percent, duration, months), created on first use. The id is
    // deterministic so concurrent first uses converge instead of duplicating.
    async ensureCoupon({ percent, months, duration }) {
      const id = duration === "once" ? `cancelflow-${percent}-once` : `cancelflow-${percent}-${months}m`;
      try { await call("GET", `/v1/coupons/${id}`); return id; }
      catch (e) { if (e.status !== 404) throw e; }
      try {
        await call("POST", "/v1/coupons", { id, name: `Stay offer ${percent}% off`, percent_off: percent, duration, duration_in_months: duration === "repeating" ? months : undefined }, { "idempotency-key": `coupon-${id}` });
      } catch (e) { if (e.code !== "resource_already_exists") throw e; }
      return id;
    },
    applyDiscount: (sub, couponId, idem) => call("POST", subPath(sub), { "discounts[0][coupon]": couponId, "metadata[cancel_flow]": "saved_discount" }, { "idempotency-key": idem }),
    pause: (sub, resumesAtMs, idem) => call("POST", subPath(sub), { "pause_collection[behavior]": "void", "pause_collection[resumes_at]": Math.floor(resumesAtMs / 1000), "metadata[cancel_flow]": "saved_pause" }, { "idempotency-key": idem }),
    cancelAtPeriodEnd: (sub, feedback, comment, idem) => call("POST", subPath(sub), { cancel_at_period_end: "true", "cancellation_details[feedback]": feedback, "cancellation_details[comment]": comment ? String(comment).slice(0, 500) : undefined }, { "idempotency-key": idem }),
  };
}
