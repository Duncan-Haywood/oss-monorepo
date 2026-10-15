// Read-only Stripe client, no SDK. Needs a restricted key (rk_...) with
// Subscriptions: read, and nothing else. This code never writes to Stripe.
import { monthlyAmount } from "./metrics.mjs";

// One Stripe subscription -> {id, customer, status, mrr, currency, created, endedAt}.
// Every item is normalised to a month and summed; a percent-off discount is
// netted. Fixed-amount coupons and metered usage are NOT included (README says so).
export function normalizeSubscription(s) {
  const items = s.items?.data?.length ? s.items.data : s.plan ? [{ price: s.plan, quantity: s.quantity ?? 1 }] : [];
  let gross = 0, currency = s.currency || "usd";
  const lines = {};
  for (const it of items) {
    const p = it.price || it.plan || {};
    if (p.recurring?.usage_type === "metered" || p.usage_type === "metered") continue;
    currency = p.currency || currency;
    const m = monthlyAmount(p.unit_amount ?? p.amount ?? 0, p.recurring?.interval || p.interval, p.recurring?.interval_count || p.interval_count || 1, it.quantity ?? 1);
    gross += m;
    const name = String(p.nickname || (typeof p.product === "string" ? p.product : p.product?.name || p.product?.id) || p.id || "unknown").slice(0, 80);
    lines[name] = (lines[name] || 0) + m;
  }
  const pctOff = [s.discount, ...(Array.isArray(s.discounts) ? s.discounts : [])].reduce((a, d) => a + (d && typeof d === "object" ? d.coupon?.percent_off || 0 : 0), 0);
  const paused = Boolean(s.pause_collection);
  const net = Math.round(gross * (1 - Math.min(100, pctOff) / 100));
  // Per-plan share of the discounted MRR; rounding drift goes to the largest line.
  const plans = {};
  for (const [k, v] of Object.entries(lines)) plans[k] = gross > 0 ? Math.round((v * net) / gross) : 0;
  const top = Object.keys(plans).sort((a, b) => plans[b] - plans[a])[0];
  if (top) plans[top] += net - Object.values(plans).reduce((a, b) => a + b, 0);
  return {
    id: s.id,
    plans,
    customer: typeof s.customer === "string" ? s.customer : s.customer?.id,
    status: paused && s.status === "active" ? "paused" : s.status,
    mrr: net,
    currency,
    created: (s.created || 0) * 1000,
    endedAt: s.ended_at ? s.ended_at * 1000 : null,
  };
}

export function createStripe({ key, fetchImpl = fetch, base = "https://api.stripe.com", maxPages = 500 }) {
  async function get(path) {
    const res = await fetchImpl(`${base}${path}`, { headers: { authorization: `Bearer ${key}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json?.error?.message || `stripe ${res.status}`), { status: res.status });
    return json;
  }
  return {
    // Every subscription, any status, oldest page last (Stripe's default order).
    async listSubscriptions() {
      const out = []; let after = null;
      for (let page = 0; page < maxPages; page++) {
        const j = await get(`/v1/subscriptions?status=all&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
        for (const s of j.data || []) out.push(normalizeSubscription(s));
        if (!j.has_more || !j.data?.length) return out;
        after = j.data[j.data.length - 1].id;
      }
      throw new Error(`more than ${maxPages * 100} subscriptions; raise MAX_PAGES`);
    },
  };
}
