// Trial-to-paid conversion planning. Pure: no I/O, no clock, no Node-only
// imports, so the same file runs in the browser simulator and in the
// self-hosted server. Times are UTC milliseconds.
//
// Two very different trials need two different plans:
//   card     a card is on file: the trial will convert by itself, so the job is
//            an honest heads-up (what will be charged, when, how to cancel) and,
//            for long trials, one activation nudge midway.
//   nocard   no card on file: the trial ends in a cancellation or a pause unless
//            the customer acts, so the job is to ask for a card, with rising
//            urgency, and (optionally) extend the trial once for people who
//            have not added one.

const DAY = 86400000;
const HOUR = 3600000;

export const DEFAULT_POLICY = {
  emailHourUtc: 15,
  // Days before trial end, per kind of trial. Fractions are allowed (0.25 = 6h).
  cardReminderDays: [3],
  nocardReminderDays: [5, 2, 0.25],
  // One activation nudge halfway through trials at least this long (0 = never).
  tipsMinTrialDays: 6,
  // 0 = never extend. Otherwise a card-less trial gets this many extra days, once,
  // shortly before it ends, if the customer still has no card.
  extendDays: 0,
  // An email more than this late is skipped, not sent: "ends in 3 days" is wrong
  // once the trial has ended (server down, restored from a backup).
  staleHours: 24,
};

export function mergePolicy(over = {}) {
  const p = { ...DEFAULT_POLICY, ...over };
  for (const k of ["cardReminderDays", "nocardReminderDays"]) {
    if (!Array.isArray(p[k]) || p[k].some((n) => !Number.isFinite(n) || n < 0)) throw new Error(`policy.${k} must be an array of non-negative numbers`);
  }
  for (const k of ["tipsMinTrialDays", "extendDays", "staleHours"]) {
    if (!Number.isFinite(p[k]) || p[k] < 0) throw new Error(`policy.${k} must be a non-negative number`);
  }
  if (!Number.isInteger(p.emailHourUtc) || p.emailHourUtc < 0 || p.emailHourUtc > 23) throw new Error("policy.emailHourUtc must be 0-23");
  return p;
}

const atHour = (ms, hour) => Math.floor(ms / DAY) * DAY + hour * HOUR;

// Steps for a trial running start..end. Each step: {id, kind, at, status, template?}.
// Ids are unique per plan so a re-plan can tell which steps already ran.
export function planTrial({ start, end, hasCard, policy, now = start, suffix = "" }) {
  const p = mergePolicy(policy);
  if (!(end > start)) return [];
  const steps = [];
  const push = (step) => { if (step.at >= now && step.at < end) steps.push({ status: "pending", ...step, id: `${step.id}${suffix}` }); };
  const days = (end - start) / DAY;
  const reminders = hasCard ? p.cardReminderDays : p.nocardReminderDays;
  const names = hasCard ? ["ending-card"] : ["addcard-first", "addcard-reminder", "addcard-final"];
  // Most distant reminder gets the first template, the nearest the last; extra
  // entries beyond the template list reuse the last (a custom policy may list more).
  const sorted = [...new Set(reminders)].sort((a, b) => b - a);
  sorted.forEach((d, i) => {
    const raw = end - d * DAY;
    const at = d >= 1 ? atHour(raw, p.emailHourUtc) : raw;
    if (at <= start) return; // a 3-day-before reminder on a 2-day trial would predate it
    const template = names[Math.min(i, names.length - 1)];
    push({ id: `${template}-${i}`, kind: "email", template, at: Math.min(at, end - HOUR) });
  });
  if (!steps.some((s) => s.kind === "email" && s.template !== "tips") && days > 0) {
    // Every reminder predated the trial (very short trial): one at the midpoint.
    const template = names[names.length - 1];
    push({ id: `${template}-mid`, kind: "email", template, at: start + (end - start) / 2 });
  }
  if (p.tipsMinTrialDays > 0 && days >= p.tipsMinTrialDays) {
    push({ id: "tips", kind: "email", template: "tips", at: atHour(start + (end - start) / 2, p.emailHourUtc) });
  }
  if (!hasCard && p.extendDays > 0) push({ id: "extend", kind: "extend", at: end - 2 * HOUR, days: p.extendDays });
  return steps.sort((a, b) => a.at - b.at);
}

// Re-plan an open case after something changed (card added, trial moved,
// trial extended). Done and skipped steps stay; pending ones are rebuilt from
// `now`, and a step whose id already ran is not scheduled again.
export function replan(c, { now, policy }) {
  const ran = new Set(c.steps.filter((s) => s.status !== "pending").map((s) => s.id));
  const fresh = planTrial({ start: c.trialStart, end: c.trialEnd, hasCard: c.hasCard, policy, now, suffix: c.extensions ? `-x${c.extensions}` : "" })
    .filter((s) => !(ran.has(s.id) || (s.kind === "extend" && c.extensions >= 1)));
  return [...c.steps.filter((s) => s.status !== "pending"), ...fresh].sort((a, b) => a.at - b.at);
}

export function formatMoney(minor, currency = "usd") {
  const zero = new Set(["jpy", "krw", "vnd", "clp", "ugx", "xof", "xaf"]);
  const major = zero.has(String(currency).toLowerCase()) ? minor : minor / 100;
  try { return new Intl.NumberFormat("en", { style: "currency", currency: String(currency).toUpperCase() }).format(major); } catch { return `${major.toFixed(2)} ${currency}`; }
}

// What a better conversion rate is worth. Your numbers in, your numbers out.
export function conversionValue({ trialsPerMonth, price, rateNow, rateTarget }) {
  const n = Math.max(0, Number(trialsPerMonth) || 0), a = Math.max(0, Number(price) || 0);
  const clamp = (x) => Math.min(100, Math.max(0, Number(x) || 0));
  const extraCustomers = (n * (clamp(rateTarget) - clamp(rateNow))) / 100;
  return { extraCustomers, extraMrr: extraCustomers * a };
}
