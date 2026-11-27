// Proposed prices for the e-invoice fix-and-explain service, cost-plus like apps/grants/docs/PRICING.md.
// The site's pricing pages and docs/PRICING.md both render from this file; test/pricing.test.mjs
// keeps every plan's markup inside MARKUP_BAND. All costs are ESTIMATES (assumptions below), in euro
// cents, per month, assuming the customer uses the whole allowance.

/** Price band: price / full cost must stay inside it (same band as Grant Autopilot). */
export const MARKUP_BAND = [1.3, 2.0];

export const ASSUMPTIONS = {
  // Claude (claude-opus-5-5) list prices as in apps/grants/docs/PRICING.md: $4/M input, $20/M output.
  // One explanation: the validator's error list + the relevant invoice fields in, a plain-language
  // explanation and a proposed fix out. 3,000 input + 600 output tokens = $0.024.
  usdPerExplanation: 0.024,
  // Exchange rate assumption, check before launch.
  eurPerUsd: 0.92,
  // Deterministic validation (schema + EN 16931 + national rules) on Workers: CPU and request cost,
  // generous. Cents per invoice.
  validationCents: 0.05,
  // Hosting, storage of the uploaded file for 24 h, D1 rows, email: per active account per month.
  hostingCentsPerAccount: 100,
  // Merchant of record: 5% + €0.50 per transaction (monthly billing = one transaction per month).
  mor: { pct: 0.05, fixedCents: 50 },
  // Refunds and chargebacks reserve, share of price.
  refundReservePct: 0.03,
};

export const explanationCents = () =>
  Math.round(ASSUMPTIONS.usdPerExplanation * ASSUMPTIONS.eurPerUsd * 100 * 100) / 100;

/** Accountant plans (per firm). `clients` = client companies the firm can set up. */
export const PLANS = [
  {
    key: "starter",
    priceCents: 1900,
    clients: 10,
    invoices: 500,
    explanations: 300,
    name: { de: "Kanzlei S", fr: "Cabinet S", en: "Firm S", nl: "Kantoor S" },
  },
  {
    key: "standard",
    priceCents: 2900,
    clients: 30,
    invoices: 1500,
    explanations: 500,
    name: { de: "Kanzlei M", fr: "Cabinet M", en: "Firm M", nl: "Kantoor M" },
  },
  {
    key: "plus",
    priceCents: 4900,
    clients: 100,
    invoices: 4000,
    explanations: 850,
    name: { de: "Kanzlei L", fr: "Cabinet L", en: "Firm L", nl: "Kantoor L" },
  },
];

/** Metered API for invoicing software vendors, billed monthly in arrears. */
export const API_METER = {
  validationCents: 0.14, // per invoice validated (€1.40 per 1,000)
  explanationCents: 4, // per invoice with errors explained (includes its validation)
  minimumCents: 1900, // monthly minimum, credited against usage
};

/** Full monthly cost of a plan used to its limits, in cents. */
export function planCost(plan, a = ASSUMPTIONS) {
  const variable = plan.invoices * a.validationCents + plan.explanations * explanationCents();
  const mor = plan.priceCents * a.mor.pct + a.mor.fixedCents;
  const reserve = plan.priceCents * a.refundReservePct;
  return Math.round(variable + a.hostingCentsPerAccount + mor + reserve);
}

export const markup = (plan) => plan.priceCents / planCost(plan);

/**
 * Cost of one metered unit, at the scale of the monthly minimum: the MoR fixed fee and hosting are
 * spread over the units the minimum buys.
 */
export function meterUnitCost(kind, a = ASSUMPTIONS) {
  const price = kind === "explanation" ? API_METER.explanationCents : API_METER.validationCents;
  const units = API_METER.minimumCents / price;
  const variable =
    kind === "explanation" ? explanationCents() + a.validationCents : a.validationCents;
  const fixedShare = (a.mor.fixedCents + a.hostingCentsPerAccount) / units;
  return variable + fixedShare + price * (a.mor.pct + a.refundReservePct);
}

export const meterMarkup = (kind) =>
  (kind === "explanation" ? API_METER.explanationCents : API_METER.validationCents) /
  meterUnitCost(kind);

/** "19 €" / "€19" / "€ 19,50" style formatting per language (Dutch: sign first, a space, comma). */
export function euro(cents, lang) {
  const n = cents / 100;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  if (lang === "en") return `€${s}`;
  if (lang === "nl") return `€\u00a0${s.replace(".", ",")}`;
  return `${s.replace(".", ",")} €`;
}
