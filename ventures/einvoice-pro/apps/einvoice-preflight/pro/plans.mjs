// @ts-check
// Plans, prices and metering units. Proprietary (see ../LICENSE, part 2).
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
 *   llmExplanationsPerMonth: number, clients: number, apiKeys: number, metered?: boolean }} Plan
 *   `metered`: the vendor API plan. `priceCents` is then the monthly minimum, billed in advance and
 *   credited against that month's usage at METER_RATES; usage above it is charged after the month
 *   ends (billing.mjs, settleUsage). Its document and explanation limits are safety caps, not tiers.
 */

/**
 * The metered vendor API's rates, exactly as apps/einvoice-site/content/pricing.mjs API_METER
 * publishes them (plans.test.mjs fails if they drift). Cents, excl. VAT.
 * - validationCents: one invoice checked that month with no errors (pass, or warnings only).
 * - explainedCents: one invoice whose check that month found errors; every error comes back
 *   explained, with the safe fixes where asked, and the price includes its validation.
 * An invoice counts once per account and month by the SHA-256 of its bytes, like every plan.
 */
export const METER_RATES = Object.freeze({ validationCents: 0.14, explainedCents: 4, minimumCents: 1900 });

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
  {
    key: "api",
    name: "API, metered",
    description:
      "For invoicing software vendors: €1.40 per 1,000 invoices validated, €0.04 per invoice with errors explained; €19 a month minimum, credited against usage.",
    priceCents: METER_RATES.minimumCents,
    annualPriceCents: null,
    purchasable: true,
    metered: true,
    // safety caps against a runaway client, not tiers: 200,000 invoices is €280 of validation; a
    // vendor who needs more asks (pro/README.md, "The metered API plan")
    documentsPerMonth: 200000,
    llmExplanationsPerMonth: 20000,
    clients: 10,
    apiKeys: 20,
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
  ...(p.metered ? { metered: { ...METER_RATES } } : {}),
  limits: {
    documentsPerMonth: p.documentsPerMonth,
    llmExplanationsPerMonth: p.llmExplanationsPerMonth,
    clients: p.clients,
    apiKeys: p.apiKeys,
  },
});

/**
 * What a metered month costs: invoices with errors at the explained rate, the rest at the
 * validation rate, the minimum credited. Amounts in whole cents (validation rounds up once on the
 * month's total, never per invoice).
 * @param {{ period: string, documents: number, errorDocuments?: number }} usage
 */
export function meterStatement(usage) {
  const explained = Math.min(usage.documents, Math.max(0, usage.errorDocuments ?? 0));
  const validations = usage.documents - explained;
  const validationCents = Math.ceil(Math.round(validations * METER_RATES.validationCents * 100) / 100);
  const explainedCents = explained * METER_RATES.explainedCents;
  const usageCents = validationCents + explainedCents;
  return {
    period: usage.period,
    currency: "EUR",
    validations,
    explained,
    validationCents,
    explainedCents,
    usageCents,
    minimumCents: METER_RATES.minimumCents,
    // billed: the minimum (the subscription price, paid in advance) plus anything above it
    overageCents: Math.max(0, usageCents - METER_RATES.minimumCents),
    totalCents: Math.max(usageCents, METER_RATES.minimumCents),
  };
}
