// Decline-code-aware failed-payment recovery planning. Pure: no I/O, no clock,
// no Node-only imports, so the same file runs in the browser simulator and in
// the self-hosted server. Times are UTC.

// Stripe decline_code -> what recovery should do about it.
//   hard   the issuer says do not retry (lost, stolen, restricted): ask for another card, never retry
//   update the card itself is unusable (expired, wrong number): retrying is futile until it is replaced
//   funds  insufficient funds / velocity limits: retrying can work, timing matters
//   auth   the bank wants the customer to authenticate (SCA/3DS): only the customer can fix it
//   soft   generic / temporary issuer declines: spaced retries
const CLASS_OF = {
  stolen_card: "hard", lost_card: "hard", pickup_card: "hard", fraudulent: "hard",
  restricted_card: "hard", invalid_account: "hard", new_account_information_failed: "hard",
  expired_card: "update", incorrect_number: "update", invalid_number: "update",
  invalid_expiry_month: "update", invalid_expiry_year: "update", invalid_cvc: "update",
  incorrect_cvc: "update", incorrect_zip: "update", card_not_supported: "update",
  currency_not_supported: "update",
  insufficient_funds: "funds", withdrawal_count_limit_exceeded: "funds", card_velocity_exceeded: "funds",
  authentication_required: "auth", authentication_not_handled: "auth",
};

export const DECLINE_CODES = Object.keys(CLASS_OF).concat([
  "generic_decline", "do_not_honor", "try_again_later", "issuer_not_available",
  "processing_error", "reenter_transaction", "call_issuer", "transaction_not_allowed",
]);

export function classifyDecline(code) {
  const c = String(code || "").trim().toLowerCase();
  return CLASS_OF[c] || "soft";
}

export const RETRYABLE = new Set(["funds", "soft"]);

export const DEFAULT_POLICY = {
  graceDays: 14,
  emailDays: [0, 3, 7, 11],
  softRetryDays: [1, 3, 6, 10],
  fundsRetryDays: [2, 5, 9, 13],
  paydayAware: true,
  retryHourUtc: 10,
  emailHourUtc: 15,
  maxRetries: 4,
};

export function mergePolicy(over = {}) {
  const p = { ...DEFAULT_POLICY, ...over };
  for (const k of ["emailDays", "softRetryDays", "fundsRetryDays"]) {
    if (!Array.isArray(p[k]) || p[k].some((n) => !Number.isFinite(n) || n < 0)) throw new Error(`policy.${k} must be an array of non-negative numbers`);
  }
  for (const k of ["graceDays", "maxRetries", "retryHourUtc", "emailHourUtc"]) {
    if (!Number.isFinite(p[k]) || p[k] < 0) throw new Error(`policy.${k} must be a non-negative number`);
  }
  if (p.retryHourUtc > 23 || p.emailHourUtc > 23) throw new Error("policy hours must be 0-23");
  return p;
}

const DAY = 86400000;
const startOfDay = (ms) => ms - (((ms % DAY) + DAY) % DAY);

// Cards issued to people on a wage tend to clear when the money lands. This is
// a heuristic, not a measured effect: nudge a "funds" retry to the first of
// 1st/2nd/15th/16th of the month or a Friday that falls within two days after
// its nominal day. Turn off with paydayAware: false.
export function snapToPayday(dayStartMs) {
  for (let i = 0; i <= 2; i++) {
    const d = new Date(dayStartMs + i * DAY);
    const dom = d.getUTCDate();
    if ([1, 2, 15, 16].includes(dom) || d.getUTCDay() === 5) return dayStartMs + i * DAY;
  }
  return dayStartMs;
}

export function emailTemplateFor(cls, index, total) {
  const stage = index === 0 ? "first" : index === total - 1 && total > 1 ? "final" : "reminder";
  return `${cls}-${stage}`;
}

// The ordered list of things recovery will do after a failed payment at time
// t0 (ms). Retries only exist for retryable classes. Every step id is stable,
// so a later failure of the same invoice can drop only what no longer applies.
export function planRecovery({ declineCode, t0, policy = {} }) {
  const p = mergePolicy(policy);
  const cls = classifyDecline(declineCode);
  const day0 = startOfDay(t0);
  const steps = [];
  const emailDays = [...new Set(p.emailDays)].sort((a, b) => a - b).filter((d) => d <= p.graceDays);
  emailDays.forEach((d, i) => {
    const at = d === 0 ? t0 : day0 + d * DAY + p.emailHourUtc * 3600000;
    steps.push({ id: `email${i}`, kind: "email", template: emailTemplateFor(cls, i, emailDays.length), at, status: "pending" });
  });
  if (RETRYABLE.has(cls)) {
    const days = (cls === "funds" ? p.fundsRetryDays : p.softRetryDays).slice(0, p.maxRetries);
    let prev = day0;
    days.forEach((d, i) => {
      let dayMs = day0 + d * DAY;
      if (cls === "funds" && p.paydayAware) dayMs = snapToPayday(dayMs);
      if (dayMs <= prev) dayMs = prev + DAY;
      prev = dayMs;
      if (dayMs - day0 > p.graceDays * DAY) return;
      steps.push({ id: `retry${i}`, kind: "retry", at: dayMs + p.retryHourUtc * 3600000, status: "pending" });
    });
  }
  steps.push({ id: "expire", kind: "expire", at: day0 + p.graceDays * DAY + p.emailHourUtc * 3600000, status: "pending" });
  steps.sort((a, b) => a.at - b.at || (a.kind === "email" ? -1 : 1));
  return { class: cls, steps };
}

// Re-plan after another failure of the same invoice. Done steps stay done. If
// the class changed (say a retry came back "lost_card"), pending steps are
// replaced by a plan for the new class, keeping the emails already sent so the
// customer is not sent "first notice" twice.
export function replan(existing, { declineCode, now, policy = {} }) {
  const next = planRecovery({ declineCode, t0: existing.t0, policy });
  if (next.class === existing.class) return { class: existing.class, steps: existing.steps };
  const kept = existing.steps.filter((s) => s.status !== "pending");
  const sentEmails = kept.filter((s) => s.kind === "email").length;
  const fresh = next.steps.filter((s) => s.id !== "expire" ? !(s.kind === "email" && Number(s.id.slice(5)) < sentEmails) : true)
    .filter((s) => s.at >= now - 1000 || s.id === "expire");
  const ids = new Set(kept.map((s) => s.id));
  return { class: next.class, steps: [...kept, ...fresh.filter((s) => !ids.has(s.id))].sort((a, b) => a.at - b.at) };
}

export function formatMoney(amountMinor, currency) {
  const cur = String(currency || "usd").toUpperCase();
  const zero = ["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "PYG", "RWF"].includes(cur);
  const n = zero ? amountMinor : amountMinor / 100;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: zero ? 0 : 2 }).format(n);
  } catch {
    return `${n.toFixed(zero ? 0 : 2)} ${cur}`;
  }
}
