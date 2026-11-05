/**
 * One design, one price per market.
 *
 * A designer selling in Europe and the US sets one net margin target. The
 * shelf price that reaches it differs by market: EU and UK shelf prices
 * include VAT, US shelf prices do not include sales tax. This module takes the
 * landed cost and the plan from costing.mjs and returns, per market, the shelf
 * price that hits the target, the same price rounded to a price ending, and
 * the margin that rounded price really gives.
 *
 * The VAT rates below are STANDARD RATES. The European Commission's table
 * could not be reached from the build host (2026-11-05); the 27 rates were
 * cross-checked instead against search excerpts of commercial 2026 tables
 * (Numeral, Eurofiscalis, Vatai, CalculateVAT, Taxenlight) and agree. Those
 * are secondary sources: confirm with the member state before filing. They
 * are editable defaults, shown as such on the page. Reduced rates, distance
 * selling thresholds, OSS registration and US state sales tax are not applied.
 */

import { sellingSide, DEFAULT_PLAN } from "./costing.mjs";

export const VAT_SOURCE = "https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en";

/** Standard VAT percent by market. `tax: "included"` means the shelf price carries it. */
/**
 * `childrenVatPct` is the rate for children's clothing where it differs from the
 * standard one (UK and Ireland zero-rate it, with sizing and age conditions: UK
 * for garments designed for under-14s, Ireland for children's clothing and
 * footwear by size). Typed from memory, unverified: confirm with HMRC or Revenue.
 */
export const MARKETS = Object.freeze({
  AT: { label: "Austria", currency: "EUR", vatPct: 20, tax: "included" },
  BE: { label: "Belgium", currency: "EUR", vatPct: 21, tax: "included" },
  BG: { label: "Bulgaria", currency: "EUR", vatPct: 20, tax: "included" },
  HR: { label: "Croatia", currency: "EUR", vatPct: 25, tax: "included" },
  CY: { label: "Cyprus", currency: "EUR", vatPct: 19, tax: "included" },
  CZ: { label: "Czechia", currency: "CZK", vatPct: 21, tax: "included" },
  DK: { label: "Denmark", currency: "DKK", vatPct: 25, tax: "included" },
  EE: { label: "Estonia", currency: "EUR", vatPct: 24, tax: "included" },
  FI: { label: "Finland", currency: "EUR", vatPct: 25.5, tax: "included" },
  FR: { label: "France", currency: "EUR", vatPct: 20, tax: "included" },
  DE: { label: "Germany", currency: "EUR", vatPct: 19, tax: "included" },
  GR: { label: "Greece", currency: "EUR", vatPct: 24, tax: "included" },
  HU: { label: "Hungary", currency: "HUF", vatPct: 27, tax: "included" },
  IE: { label: "Ireland", currency: "EUR", vatPct: 23, tax: "included", childrenVatPct: 0 },
  IT: { label: "Italy", currency: "EUR", vatPct: 22, tax: "included" },
  LV: { label: "Latvia", currency: "EUR", vatPct: 21, tax: "included" },
  LT: { label: "Lithuania", currency: "EUR", vatPct: 21, tax: "included" },
  LU: { label: "Luxembourg", currency: "EUR", vatPct: 17, tax: "included" },
  MT: { label: "Malta", currency: "EUR", vatPct: 18, tax: "included" },
  NL: { label: "Netherlands", currency: "EUR", vatPct: 21, tax: "included" },
  PL: { label: "Poland", currency: "PLN", vatPct: 23, tax: "included" },
  PT: { label: "Portugal", currency: "EUR", vatPct: 23, tax: "included" },
  RO: { label: "Romania", currency: "RON", vatPct: 21, tax: "included" },
  SK: { label: "Slovakia", currency: "EUR", vatPct: 23, tax: "included" },
  SI: { label: "Slovenia", currency: "EUR", vatPct: 22, tax: "included" },
  ES: { label: "Spain", currency: "EUR", vatPct: 21, tax: "included" },
  SE: { label: "Sweden", currency: "SEK", vatPct: 25, tax: "included" },
  UK: { label: "United Kingdom", currency: "GBP", vatPct: 20, tax: "included", childrenVatPct: 0 },
  US: { label: "United States (before sales tax)", currency: "USD", vatPct: 0, tax: "excluded" },
});

const round2 = v => Math.round(v * 100) / 100;

/** Round a price up to the next ending, e.g. 0.95, 0.99 or a whole number. `ending` is the cents part wanted. */
export function priceEnding(price, ending = 0.95) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const whole = Math.floor(price);
  const cand = whole + ending;
  return round2(cand >= price ? cand : whole + 1 + ending);
}

/**
 * @param {{audience?:"adult"|"children", landed:number, quantity:number, currencyRates?:Record<string,number>, markets?:string[], vat?:Record<string,number>, ending?:number}} input
 *   landed is in the supplier sheet's currency; currencyRates maps a market currency to units per one of that
 *   currency (for a EUR sheet: {GBP: 0.85, USD: 1.08}). Missing rates stop that market, never guess.
 * @param {object} plan costing.mjs plan (fees, target margin, unsold share). Its salesTaxPct is replaced per market.
 */
export function marketPrices(input, plan = DEFAULT_PLAN, sheetCurrency = "EUR") {
  const { landed, quantity, currencyRates = {}, markets = Object.keys(MARKETS), vat = {}, ending = 0.95, audience = "adult" } = input;
  const out = [];
  for (const code of markets) {
    const m = MARKETS[code];
    if (!m) { out.push({ market: code, error: `Unknown market ${code}.` }); continue; }
    const base = audience === "children" && Number.isFinite(m.childrenVatPct) ? m.childrenVatPct : m.vatPct;
    const vatPct = Number.isFinite(vat[code]) ? vat[code] : base;
    if (vatPct < 0 || vatPct > 40) { out.push({ market: code, error: `VAT ${vatPct}% is outside 0 to 40.` }); continue; }
    const rate = m.currency === sheetCurrency ? 1 : currencyRates[m.currency];
    if (!(rate > 0)) { out.push({ market: code, label: m.label, error: `Needs a ${sheetCurrency} to ${m.currency} rate.` }); continue; }
    const landedLocal = landed * rate;
    const mp = { ...plan, salesTaxPct: m.tax === "included" ? vatPct : 0 };
    const exact = sellingSide({ landed: landedLocal, price: 1, quantity, currency: m.currency }, mp).priceForTargetMargin;
    if (exact == null) { out.push({ market: code, label: m.label, error: "No price reaches the target margin after tax and fees." }); continue; }
    const shelf = priceEnding(exact, ending);
    const at = sellingSide({ landed: landedLocal, price: shelf, quantity, currency: m.currency }, mp);
    out.push({
      market: code, label: m.label, currency: m.currency, vatPct: mp.salesTaxPct, rate,
      landed: round2(landedLocal), exactPrice: exact, shelfPrice: shelf,
      netOfTax: at.netOfTax, profitPerSale: at.profitPerSale, marginPct: at.marginPct,
      breakEvenUnits: at.breakEvenUnits,
    });
  }
  return out;
}

/** The EU-wide cross-border B2C threshold for sellers established in one EU country (Directive (EU) 2017/2455), in EUR. */
export const EU_DISTANCE_SELLING_THRESHOLD_EUR = 10000;

/**
 * Where a small EU seller stands against the EUR 10,000 cross-border threshold.
 * Below it the seller's home VAT may be charged on sales to other EU countries;
 * above it (the sale that crosses it, and all after) the shopper's own country's
 * VAT applies, usually reported through the One-Stop Shop. Applies only to sellers
 * established in a single EU country; UK, US or other sellers are outside it.
 * Counts net sales (without VAT) to shoppers in OTHER EU countries, in EUR,
 * this and last calendar year. A summary of the rule, not tax advice.
 * @param {{euCrossBorderSalesEur:number, priorYearEur?:number, plannedExtraEur?:number}} input
 */
export function ossThreshold({ euCrossBorderSalesEur, priorYearEur = 0, plannedExtraEur = 0 }) {
  const nums = [euCrossBorderSalesEur, priorYearEur, plannedExtraEur];
  if (nums.some(n => !Number.isFinite(n) || n < 0)) return { error: "Sales must be zero or more." };
  const projected = euCrossBorderSalesEur + plannedExtraEur;
  const T = EU_DISTANCE_SELLING_THRESHOLD_EUR;
  const over = euCrossBorderSalesEur > T || priorYearEur > T;
  const willCross = !over && projected > T;
  return {
    thresholdEur: T, thisYearEur: euCrossBorderSalesEur, priorYearEur, projectedEur: projected,
    headroomEur: Math.max(0, T - euCrossBorderSalesEur),
    status: over ? "over" : willCross ? "will-cross" : "under",
    message: over
      ? "Over EUR 10,000 (this or last year): charge each shopper's own country's VAT, usually registering for the One-Stop Shop."
      : willCross
        ? "Your plan crosses EUR 10,000 this year: the sale that crosses it must carry the shopper's country VAT. Prepare registration before then."
        : "Under EUR 10,000: your home VAT may apply to other EU sales. You can still opt in to destination VAT.",
  };
}
