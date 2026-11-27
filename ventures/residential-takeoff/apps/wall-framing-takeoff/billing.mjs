// @ts-check
// The billing port, the same shape as apps/grants' BillingProvider (src/worker/ports/billing-provider.ts)
// cut down to what a static page can do: open Paddle's overlay checkout and check a licence key.
// The webhook, the signing key and Paddle's notification secret live in the owner's billing
// Worker (platform/billing/worker.mjs, on its own Cloudflare account), never in this page.
//
//   createBillingProvider(cfg) -> null while any public Paddle value is empty (the paid path is dark)
//                              -> a Paddle provider once the owner fills platform/billing/catalogue.mjs
//   fakeBillingProvider(keys)  -> for tests; no network
import { PADDLE } from "./checkout.mjs";
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
 * @typedef {typeof PADDLE} BillingConfig
 */

/**
 * What a valid key for this page's product unlocks. The billing Worker signs a key only for
 * the product whose price was paid, and `checkLicence` refuses a key for another product, so
 * a valid key here is the Job report (plans.mjs). The Contractor suite plan is sold from
 * apps/payapps, never from this page.
 */
export const PRODUCT_PLAN = /** @type {const} */ ("report");

/** True while any public Paddle value is missing: nothing is sold, so nothing is locked. @param {BillingConfig} [c] */
export const isDark = (c = PADDLE) => !onSale(c);

/**
 * @param {BillingConfig} [c]
 * @param {{ fetch?: typeof fetch, now?: number }} [o]
 * @returns {BillingProvider | null}
 */
export function createBillingProvider(c = PADDLE, o = {}) {
  if (isDark(c)) return null;
  return {
    name: "paddle",
    wireBuy: (el, h) => wireBuy(el, c, h),
    async validate(key) {
      const v = await checkLicence(key, { cfg: c, fetch: o.fetch, now: o.now });
      if (!v.valid) return { valid: false, reason: v.reason, plan: null };
      return v.renewed ? { valid: true, reason: "", plan: PRODUCT_PLAN, renewed: v.renewed } : { valid: true, reason: "", plan: PRODUCT_PLAN };
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
    wireBuy: (el) => { if (el) el.hidden = false; return !!el; },
    async validate(key) {
      const t = typeof key === "string" ? key.trim() : "";
      const k = /^[A-Za-z0-9][A-Za-z0-9._-]{7,99}$/.test(t) ? t : null;
      if (!k) return { valid: false, reason: "that does not look like a licence key", plan: null };
      const p = Object.hasOwn(keys, k) ? keys[k] : null;
      return isPlanKey(p) && p !== "free" ? { valid: true, reason: "", plan: p } : { valid: false, reason: "key not recognised", plan: null };
    },
  };
}
