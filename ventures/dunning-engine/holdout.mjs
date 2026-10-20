// Holdout experiment: leave a small, stable share of customers alone and compare
// how many of their failed invoices get paid with how many of the ones we work.
// Pure functions, no network. Arm choice is a hash of the customer id, so every
// invoice of one customer lands in the same arm and a restart changes nothing.
import { createHash } from "node:crypto";

export const MAX_HOLDOUT_PCT = 50;

export function clampPct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MAX_HOLDOUT_PCT, Math.max(0, Math.floor(n))) : 0;
}

export function assignArm(customer, holdoutPct, salt = "dunning-engine") {
  const pct = clampPct(holdoutPct);
  if (!pct) return "treatment";
  const h = createHash("sha256").update(`${salt}:${customer}`).digest();
  return h.readUInt32BE(0) % 100 < pct ? "holdout" : "treatment";
}

const Z = 1.96;

// Wilson score interval for k successes in n trials.
export function wilson(k, n) {
  if (!n) return { p: null, low: null, high: null };
  const p = k / n, z2 = Z * Z;
  const d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d;
  const h = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return { p, low: Math.max(0, c - h), high: Math.min(1, c + h) };
}

// Newcombe's hybrid-score interval for the difference of two proportions
// (treatment minus holdout). Behaves at small n and at 0 or 100 percent.
export function diffInterval(k1, n1, k2, n2) {
  const a = wilson(k1, n1), b = wilson(k2, n2);
  if (a.p === null || b.p === null) return null;
  const d = a.p - b.p;
  return {
    diff: d,
    low: d - Math.sqrt((a.p - a.low) ** 2 + (b.high - b.p) ** 2),
    high: d + Math.sqrt((a.high - a.p) ** 2 + (b.p - b.low) ** 2),
  };
}

// Resolved = recovered or lost. Voided and still-open invoices say nothing about
// whether recovery worked, so they stay out of the rates.
function tally(cases) {
  const t = { opened: 0, open: 0, recovered: 0, lost: 0, voided: 0 };
  for (const c of cases) {
    t.opened += 1;
    if (c.status === "open") t.open += 1;
    else if (c.status in t) t[c.status] += 1;
  }
  t.resolved = t.recovered + t.lost;
  t.rate = t.resolved ? t.recovered / t.resolved : null;
  return t;
}

// Rough invoices per arm needed to see `diff` at 80% power, 5% alpha (two-proportion normal approx).
export function casesPerArm(p1, p2) {
  const d = Math.abs(p1 - p2);
  if (!d) return null;
  const pbar = (p1 + p2) / 2;
  const n = ((1.96 * Math.sqrt(2 * pbar * (1 - pbar)) + 0.84 * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / (d * d);
  return Math.ceil(n);
}

export function experiment(cases) {
  const list = Object.values(cases || {}).filter((c) => c.arm);
  const hold = list.filter((c) => c.arm === "holdout");
  if (!hold.length) return null;
  const treatment = tally(list.filter((c) => c.arm === "treatment"));
  const holdout = tally(hold);
  const ci = diffInterval(treatment.recovered, treatment.resolved, holdout.recovered, holdout.resolved);
  let verdict = "Not enough resolved invoices in both groups yet.";
  let needed = null;
  if (ci) {
    if (ci.low > 0) verdict = "Recovery is working: treated invoices are paid more often than the holdout, beyond chance.";
    else if (ci.high < 0) verdict = "Treated invoices are paid less often than the holdout, beyond chance. Check your schedule and wording.";
    else {
      verdict = "No clear difference yet: the interval spans zero. Keep it running; do not read the gap as a win or a loss.";
      needed = casesPerArm(treatment.rate, holdout.rate);
    }
  }
  return { treatment, holdout, difference: ci, casesPerArmNeeded: needed, verdict };
}
