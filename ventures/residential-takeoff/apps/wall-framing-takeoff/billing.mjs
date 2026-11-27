// @ts-check
// The billing port, the same shape as apps/grants' BillingProvider (src/worker/ports/billing-provider.ts)
// cut down to what a static page can do: open Paddle's overlay checkout and check a licence key.
// The page holds no secret: Paddle's webhook goes to the shared billing Worker
// (platform/billing/worker.mjs), which signs an Ed25519 key the page checks offline.
//
//   createBillingProvider(config) -> null while any public value in checkout.mjs is empty (dark)
//                                 -> a Paddle provider once the owner fills platform/billing/catalogue.mjs
//   fakeBillingProvider(keys)     -> for tests; no network
import { checkLicence } from "./licence.mjs";
import { onSale, wireBuy } from "./paddle.mjs";
import { isPlanKey } from "./plans.mjs";

/**
 * @typedef {{ valid: boolean, reason: string, plan: import("./plans.mjs").PlanKey | null, renewed?: string }} Verdict
 * @typedef {{
 *   readonly name: string,
 *   wireBuy(el: HTMLElement | null, h: { onKey: (key: string) => void, onStatus?: (msg: string) => void }): boolean,
 *   validate(key: string): Promise<Verdict>,
 * }} BillingProvider
 * @typedef {{ product: string, priceId: string, clientToken: string, publicKey: string, edge: string, environment: string }} BillingConfig
 */

/**
 * The plan a verified key stands for. The key's product is checked against this page's
 * product before it gets here (paddle.mjs `verifyLicence`); its billing decides the plan:
 * a one-off key is a Job report, a subscription key the contractor suite. Anything else is
 * no plan, never a guess.
 * @param {any} claims
 */
export function planOf(claims) {
  const t = claims && typeof claims === "object" ? claims.t : undefined;
  const p = t === "one-off" ? "report" : t === "subscription" ? "pro" : null;
  return isPlanKey(p) ? p : null;
}

/** True while the report is not on sale: nothing is sold, so nothing is locked. @param {BillingConfig} c */
export const isDark = (c) => !onSale(c);

/**
 * @param {BillingConfig} c
 * @param {{ fetch?: typeof fetch, now?: number }} [o]
 * @returns {BillingProvider | null}
 */
export function createBillingProvider(c, o = {}) {
  if (isDark(c)) return null;
  return {
    name: "paddle",
    wireBuy: (el, h) => wireBuy(el, /** @type {any} */ (c), h),
    async validate(key) {
      /** @type {any} */
      let claims = null;
      const v = await checkLicence(key, { cfg: c, fetch: o.fetch, now: o.now, claims: (x) => { claims = x; } });
      if (!v.valid) return { valid: false, reason: v.reason, plan: null };
      const plan = planOf(claims);
      if (!plan) return { valid: false, reason: "this key is for a plan this page does not sell", plan: null };
      return v.renewed ? { valid: true, reason: "", plan, renewed: v.renewed } : { valid: true, reason: "", plan };
    },
  };
}

/**
 * A provider for tests: `keys` maps a licence key to its plan.
 * @param {Record<string, string>} keys
 * @returns {BillingProvider}
 */
export function fakeBillingProvider(keys) {
  return {
    name: "fake",
    wireBuy: (el) => { if (!el) return false; el.hidden = false; return true; },
    async validate(key) {
      const k = String(key || "").trim();
      if (!k) return { valid: false, reason: "that does not look like a licence key", plan: null };
      const p = Object.hasOwn(keys, k) ? keys[k] : null;
      return isPlanKey(p) && p !== "free" ? { valid: true, reason: "", plan: p } : { valid: false, reason: "key not recognised", plan: null };
    },
  };
}
