// @ts-check
// What is sold, and what each plan unlocks (docs/PRICING.md has the reasons).
//
// Everything that shipped free before 2026-11-24 stays free in every state: the
// layout, order, cut list, drawings, every calculator page. The paid features are
// the new depth: the supplier material-list export and the branded bid package.
//
// While the paid path is dark (no checkout link for a plan, see checkout.mjs) every
// feature is open, so nobody meets a lock they cannot buy past.

/** @typedef {"material-list-export" | "bid-package"} Feature */
/** @typedef {"free" | "report" | "pro"} PlanKey */
/**
 * @typedef {{ key: PlanKey, name: string, kind: "free" | "one-off" | "subscription", priceUsd: number, interval: "month" | null, features: Feature[], scope: string }} Plan
 */

/** @type {Feature[]} */
export const PAID_FEATURES = ["material-list-export", "bid-package"];

/** @type {Record<PlanKey, Plan>} */
export const PLANS = {
  free: { key: "free", name: "Free", kind: "free", priceUsd: 0, interval: null, features: [], scope: "Layout, order, cut list, drawings and every calculator, on screen and as CSV." },
  report: { key: "report", name: "Job report", kind: "one-off", priceUsd: 29, interval: null, features: ["material-list-export", "bid-package"], scope: "One house: the supplier material list (walls, sheathing, roof) and the branded bid package, re-run as often as the plan changes." },
  pro: { key: "pro", name: "Contractor suite", kind: "subscription", priceUsd: 149, interval: "month", features: ["material-list-export", "bid-package"], scope: "Every job, inside the contractor suite (pay applications, estimating). Not sold until the suite ships it." },
};

/** @param {unknown} k @returns {k is PlanKey} */
export const isPlanKey = (k) => typeof k === "string" && Object.hasOwn(PLANS, k);

/**
 * What a buyer may use.
 * @param {{ dark: boolean, plan?: unknown, valid?: boolean }} s
 *   dark: no checkout is live; plan: the plan a validated licence maps to; valid: the licence verdict.
 * @returns {{ plan: PlanKey, features: Set<Feature>, open: boolean }}
 */
export function entitlement(s) {
  if (s.dark) return { plan: "free", features: new Set(PAID_FEATURES), open: true };
  const plan = s.valid === true && isPlanKey(s.plan) ? s.plan : "free";
  return { plan, features: new Set(PLANS[plan].features), open: false };
}

/**
 * The plan check every paid feature goes through.
 * @param {Feature} feature @param {{ features: Set<Feature>, open: boolean }} ent
 * @returns {{ allowed: true, reason: "" } | { allowed: false, reason: string, buy: PlanKey }}
 */
export function allowed(feature, ent) {
  if (ent.features.has(feature)) return { allowed: true, reason: "" };
  return { allowed: false, reason: `${feature === "material-list-export" ? "The material-list export" : "The branded bid package"} comes with a ${PLANS.report.name} ($${PLANS.report.priceUsd}, one house) licence key.`, buy: "report" };
}
