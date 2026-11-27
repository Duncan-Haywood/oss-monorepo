// @ts-check
// The billing port, the same shape as apps/grants' BillingProvider (src/worker/ports/billing-provider.ts)
// cut down to what a static page with no server can do: open a hosted checkout and check a
// licence key. There is no webhook here (no server to receive one) and no secret: the
// merchant of record hosts checkout, tax and refunds, and its validate call is public.
//
//   createBillingProvider(config) -> null while every checkout link is empty (the paid path is dark)
//                                 -> a Lemon Squeezy provider once the owner sets a link
//   fakeBillingProvider(keys)     -> for tests; no network
import { buyLink, checkLicence, cleanKey } from "./licence.mjs";
import { isPlanKey } from "./plans.mjs";

/**
 * @typedef {{ valid: boolean, reason: string, plan: import("./plans.mjs").PlanKey | null }} Verdict
 * @typedef {{
 *   readonly name: string,
 *   checkoutUrl(planKey: string): string | null,
 *   validate(key: string): Promise<Verdict>,
 * }} BillingProvider
 * @typedef {{ checkoutUrls: Record<string, string>, validateUrl: string, variantPlans: Record<string, string> }} BillingConfig
 */

/**
 * The plan a validator's answer stands for: Lemon Squeezy answers with `meta.variant_id`.
 * An unknown or missing variant is no plan, never a guess.
 * @param {any} j @param {Record<string, string>} variantPlans
 */
export function planOf(j, variantPlans) {
  const v = j && typeof j === "object" && j.meta && typeof j.meta === "object" ? j.meta.variant_id : undefined;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const p = Object.hasOwn(variantPlans, String(v)) ? variantPlans[String(v)] : null;
  return isPlanKey(p) && p !== "free" ? p : null;
}

/** True while no plan has a checkout link: nothing is sold, so nothing is locked. @param {BillingConfig} c */
export const isDark = (c) => !Object.values(c.checkoutUrls || {}).some((u) => buyLink(u));

/**
 * @param {BillingConfig} c
 * @param {{ fetch?: typeof fetch }} [o]
 * @returns {BillingProvider | null}
 */
export function createBillingProvider(c, o = {}) {
  if (isDark(c) || !buyLink(c.validateUrl)) return null;
  return {
    name: "lemonsqueezy",
    checkoutUrl: (planKey) => (Object.hasOwn(c.checkoutUrls, planKey) ? buyLink(c.checkoutUrls[planKey]) : null),
    async validate(key) {
      /** @type {any} */
      let answer = null;
      const spy = o.fetch || (typeof fetch === "function" ? fetch : undefined);
      const f = spy && /** @type {typeof fetch} */ (async (u, init) => { const r = await spy(u, init); const j = await r.json(); answer = j; return /** @type {any} */ ({ json: async () => j }); });
      const v = await checkLicence(key, { fetch: f, url: c.validateUrl });
      if (!v.valid) return { ...v, plan: null };
      const plan = planOf(answer, c.variantPlans || {});
      return plan ? { valid: true, reason: "", plan } : { valid: false, reason: "this key is for a product this page does not sell", plan: null };
    },
  };
}

/**
 * A provider for tests: `keys` maps a licence key to its plan.
 * @param {Record<string, string>} keys @param {Record<string, string>} [checkoutUrls]
 * @returns {BillingProvider}
 */
export function fakeBillingProvider(keys, checkoutUrls = { report: "https://checkout.example.com/report" }) {
  return {
    name: "fake",
    checkoutUrl: (planKey) => (Object.hasOwn(checkoutUrls, planKey) ? buyLink(checkoutUrls[planKey]) : null),
    async validate(key) {
      const k = cleanKey(key);
      if (!k) return { valid: false, reason: "that does not look like a licence key", plan: null };
      const p = Object.hasOwn(keys, k) ? keys[k] : null;
      return isPlanKey(p) && p !== "free" ? { valid: true, reason: "", plan: p } : { valid: false, reason: "key not recognised", plan: null };
    },
  };
}
