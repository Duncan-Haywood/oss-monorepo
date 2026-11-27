// @ts-check
// Plans, prices and metering units. FSL-1.1-MIT (see ../LICENSE, part 2).
//
// One metered unit = one invoice checked (with explanations and fix proposals). Explanations
// written by the model are the only per-use cost that grows with use beyond CPU, so they have
// their own monthly cap; template explanations are free and unlimited.
//
// Prices are cost-plus (packages/billing; plans.test.mjs asserts every paid plan keeps at least a
// 40% margin at full allowance). Prices are euro cents. They are proposals until the owner turns
// billing on (docs/BILLING.md); the Paddle catalog file is generated from this list
// (billing/paddle-catalog.json, `node pro/paddle-catalog.mjs --write`). Paid plans are sold only
// through the signed checkout in billing.mjs; `trial` is the floor every account falls back to.
import { definePlanCatalog } from "../../../packages/billing/src/index.ts";

/**
 * @typedef {{ key: string, name: string, description: string, priceCents: number,
 *   annualPriceCents: number | null, purchasable: boolean, documentsPerMonth: number,
 *   llmExplanationsPerMonth: number, clients: number, apiKeys: number }} Plan
 */

/**
 * Paid tiers are the ones the marketing site publishes (apps/einvoice-site/content/pricing.mjs:
 * Firm S/M/L at €19/€29/€49 a month, per firm, excl. VAT); plans.test.mjs fails if they drift.
 * Monthly only: annual billing is an open owner question on the site (docs/PRICING.md there).
 * `llmExplanationsPerMonth` counts invoices explained with the model (the long tail of rules without
 * a template), once per invoice per month however many calls it took (server.mjs, "Metering"); every
 * built-in rule has a DE/FR/EN template, which is free and unlimited.
 * @type {Plan[]}
 */
const PLAN_LIST = [
  {
    key: "trial",
    name: "Trial",
    description: "Try the checker, the explanations and the safe fixes on real invoices.",
    priceCents: 0,
    annualPriceCents: null,
    purchasable: false,
    documentsPerMonth: 100,
    llmExplanationsPerMonth: 50,
    clients: 3,
    apiKeys: 2,
  },
  {
    key: "starter",
    name: "Firm S",
    description: "For a sole practitioner: up to 10 client companies and 500 invoices checked a month.",
    priceCents: 1900,
    annualPriceCents: null,
    purchasable: true,
    documentsPerMonth: 500,
    llmExplanationsPerMonth: 300,
    clients: 10,
    apiKeys: 3,
  },
  {
    key: "standard",
    name: "Firm M",
    description: "For a small firm: up to 30 client companies and 1,500 invoices checked a month.",
    priceCents: 2900,
    annualPriceCents: null,
    purchasable: true,
    documentsPerMonth: 1500,
    llmExplanationsPerMonth: 500,
    clients: 30,
    apiKeys: 5,
  },
  {
    key: "plus",
    name: "Firm L",
    description: "For a larger firm: up to 100 client companies and 4,000 invoices checked a month.",
    priceCents: 4900,
    annualPriceCents: null,
    purchasable: true,
    documentsPerMonth: 4000,
    llmExplanationsPerMonth: 850,
    clients: 100,
    apiKeys: 10,
  },
];

export const catalog = definePlanCatalog(PLAN_LIST);

/** @type {Record<string, Plan>} */
export const PLANS = Object.fromEntries(PLAN_LIST.map((p) => [p.key, p]));

/** @param {string} key @returns {Plan} */
export const planOf = (key) => PLANS[key] ?? PLANS.trial;

/** Calendar month in UTC, e.g. "2026-11". @param {Date} now */
export const periodOf = (now) => now.toISOString().slice(0, 7);

/** What the public pricing endpoint and the account page show for a plan. @param {Plan} p */
export const publicPlan = (p) => ({
  key: p.key,
  name: p.name,
  description: p.description,
  priceCents: p.priceCents,
  annualPriceCents: p.annualPriceCents,
  currency: "EUR",
  purchasable: p.purchasable,
  limits: {
    documentsPerMonth: p.documentsPerMonth,
    llmExplanationsPerMonth: p.llmExplanationsPerMonth,
    clients: p.clients,
    apiKeys: p.apiKeys,
  },
});
