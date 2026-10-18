// Cancellation-flow decisions. Pure functions, no I/O, no Node-only imports:
// the same file drives the server and the in-browser simulator.

export const REASONS = {
  too_expensive: { label: "It costs too much", stripe: "too_expensive" },
  not_using: { label: "I am not using it enough", stripe: "unused" },
  missing_feature: { label: "It is missing something I need", stripe: "missing_features" },
  switching: { label: "I am switching to another product", stripe: "switched_service" },
  temporary: { label: "I only need a break", stripe: "other" },
  technical: { label: "Something is not working", stripe: "low_quality" },
  other: { label: "Something else", stripe: "other" },
};

export const DEFAULT_POLICY = {
  offers: {
    too_expensive: { type: "discount", percent: 30, months: 3 },
    switching: { type: "discount", percent: 20, months: 3 },
    not_using: { type: "pause", months: 2 },
    temporary: { type: "pause", months: 3 },
    technical: { type: "help" },
    missing_feature: { type: "none" },
    other: { type: "none" },
  },
  cooldownDays: 365, // at most one accepted save offer per customer in this window
  supportUrl: "",
  // A/B tests: {too_expensive: {variants: {B: {type: "discount", percent: 20, months: 6}}}}.
  // The offer in `offers` is the control, "A". Customers are split evenly and stay in their arm.
  experiments: {},
};

const DAY = 86400000;

export function mergePolicy(over = {}) {
  return { ...DEFAULT_POLICY, ...over, offers: { ...DEFAULT_POLICY.offers, ...(over.offers || {}) }, experiments: over.experiments || {} };
}

const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };

// Which arm a customer is in for a reason: "A" (control) or a named variant, or null when
// no test runs for that reason. Same customer + reason always lands in the same arm.
export function assignVariant({ customer, reason, policy = {} }) {
  const names = Object.keys(policy.experiments?.[reason]?.variants || {}).sort();
  if (!names.length) return null;
  const arms = ["A", ...names.filter((n) => n !== "A")];
  return arms[fnv(`${reason}:${customer}`) % arms.length];
}

export function monthlyAmount(amount, interval, intervalCount = 1) {
  const n = Math.max(1, intervalCount || 1);
  if (interval === "year") return amount / (12 * n);
  if (interval === "month") return amount / n;
  if (interval === "week") return (amount * 52) / 12 / n;
  if (interval === "day") return (amount * 365) / 12 / n;
  return amount;
}

export function addMonths(ms, months) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

export function formatMoney(minor, currency = "usd") {
  const zero = ["jpy", "krw", "vnd", "clp"].includes(String(currency).toLowerCase());
  const v = zero ? minor : minor / 100;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency).toUpperCase() }).format(v); }
  catch { return `${v.toFixed(zero ? 0 : 2)} ${currency}`; }
}

// sub: {status, amount (minor units per interval), currency, interval, intervalCount, trialing, cancelAtPeriodEnd}
// history: past sessions for this customer: [{at, offer: {type}, outcome}]
// Returns {action: "confirm"|"offer"|"blocked", reason?, offer?}
export function decide({ reason, sub, history = [], policy = {}, now = Date.now(), variant = null }) {
  const p = mergePolicy(policy);
  if (!REASONS[reason]) return { action: "blocked", why: "unknown_reason" };
  if (!sub || ["canceled", "incomplete_expired"].includes(sub.status)) return { action: "blocked", why: "not_active" };
  if (sub.cancelAtPeriodEnd) return { action: "blocked", why: "already_canceling" };
  const cfg = (variant && variant !== "A" && p.experiments[reason]?.variants?.[variant]) || p.offers[reason] || { type: "none" };
  if (cfg.type === "none") return { action: "confirm", why: "no_offer_for_reason" };
  if (cfg.type === "help") return { action: "offer", offer: { type: "help", url: p.supportUrl || "" } };
  if (sub.status === "trialing") return { action: "confirm", why: "trialing" };
  const recent = history.some((h) => h.outcome === "saved" && now - h.at < p.cooldownDays * DAY);
  if (recent) return { action: "confirm", why: "cooldown" };
  const monthly = monthlyAmount(sub.amount, sub.interval, sub.intervalCount);
  if (cfg.type === "discount") {
    const percent = Math.min(100, Math.max(1, Math.round(cfg.percent)));
    const yearly = sub.interval === "year";
    const months = yearly ? 0 : Math.min(12, Math.max(1, Math.round(cfg.months)));
    const saving = yearly ? Math.round((sub.amount * percent) / 100) : Math.round(((sub.amount * percent) / 100) * months);
    return { action: "offer", offer: { type: "discount", percent, months, duration: yearly ? "once" : "repeating", saving, monthly: Math.round(monthly) } };
  }
  if (cfg.type === "pause") {
    const months = Math.min(6, Math.max(1, Math.round(cfg.months)));
    return { action: "offer", offer: { type: "pause", months, resumesAt: addMonths(now, months), monthly: Math.round(monthly) } };
  }
  return { action: "confirm", why: "unknown_offer_type" };
}

export function describeOffer(offer, currency = "usd") {
  if (offer.type === "discount") {
    return offer.duration === "once"
      ? `${offer.percent}% off your next renewal (saves ${formatMoney(offer.saving, currency)})`
      : `${offer.percent}% off for ${offer.months} month${offer.months > 1 ? "s" : ""} (saves ${formatMoney(offer.saving, currency)})`;
  }
  if (offer.type === "pause") return `Pause billing for ${offer.months} month${offer.months > 1 ? "s" : ""}; it resumes on ${new Date(offer.resumesAt).toISOString().slice(0, 10)}`;
  return "Talk to us first";
}

// Roll sessions up into the numbers an owner decides on.
export function summarize(sessions) {
  const out = { started: 0, answered: 0, offered: 0, saved: 0, canceled: 0, abandoned: 0, churned: 0, byReason: {}, savedByType: {}, saveRate: null, monthlyKept: 0 };
  for (const s of sessions) {
    out.started++;
    if (s.reason) { out.answered++; (out.byReason[s.reason] ||= { n: 0, saved: 0, canceled: 0 }).n++; }
    if (s.offer && s.offer.type !== "help") out.offered++;
    if (s.outcome === "saved") {
      out.saved++; if (s.reason) out.byReason[s.reason].saved++;
      out.savedByType[s.offer.type] = (out.savedByType[s.offer.type] || 0) + 1;
      // Pausing keeps the subscriber but not this month's revenue; discounts keep the discounted share.
      out.monthlyKept += s.offer.type === "discount" ? Math.round(s.offer.monthly * (1 - s.offer.percent / 100)) : 0;
    }
    if (s.outcome === "canceled") { out.canceled++; if (s.reason) out.byReason[s.reason].canceled++; }
    if (s.outcome === "abandoned") out.abandoned++;
    if (s.churned) out.churned++;
  }
  out.saveRate = out.offered ? Math.round((out.saved / out.offered) * 1000) / 10 : null;
  return out;
}

// Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf).
const phi = (z) => {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
};

// Two-sided two-proportion z-test. Returns null when an arm is empty.
export function twoProportionP(s1, n1, s2, n2) {
  if (!n1 || !n2) return null;
  const p = (s1 + s2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  return Math.round(2 * (1 - phi(Math.abs((s1 / n1 - s2 / n2) / se))) * 1000) / 1000;
}

export const MIN_PER_ARM = 30;

// Per reason with a test: save rate and revenue kept per arm, and a verdict against the control.
// A verdict needs MIN_PER_ARM offers in both arms and p < 0.05; until then it says "keep collecting".
export function summarizeExperiments(sessions) {
  const out = {};
  for (const s of sessions) {
    if (!s.variant || !s.reason) continue;
    const arm = ((out[s.reason] ||= {}) [s.variant] ||= { offered: 0, saved: 0, monthlyKept: 0 });
    if (s.offer && s.offer.type !== "help") arm.offered++;
    if (s.outcome === "saved") { arm.saved++; if (s.offer?.type === "discount") arm.monthlyKept += Math.round(s.offer.monthly * (1 - s.offer.percent / 100)); }
  }
  for (const arms of Object.values(out)) {
    const a = arms.A || { offered: 0, saved: 0 };
    for (const [name, arm] of Object.entries(arms)) {
      arm.saveRate = arm.offered ? Math.round((arm.saved / arm.offered) * 1000) / 10 : null;
      if (name === "A") continue;
      arm.p = twoProportionP(arm.saved, arm.offered, a.saved, a.offered);
      const enough = arm.offered >= MIN_PER_ARM && a.offered >= MIN_PER_ARM;
      arm.verdict = !enough ? "keep collecting" : arm.p < 0.05 ? (arm.saveRate > (a.offered ? (a.saved / a.offered) * 100 : 0) ? "beats control on save rate" : "loses to control on save rate") : "no clear difference";
    }
  }
  return out;
}
