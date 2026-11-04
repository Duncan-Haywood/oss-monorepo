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
 * The VAT rates below are STANDARD RATES typed in by hand and could not be
 * checked against the European Commission's table from the build host. They
 * are editable defaults, shown as such on the page. Reduced rates, distance
 * selling thresholds, OSS registration and US state sales tax are not applied.
 */

import { sellingSide, DEFAULT_PLAN } from "./costing.mjs";

export const VAT_SOURCE = "https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en";

/** Standard VAT percent by market. `tax: "included"` means the shelf price carries it. */
export const MARKETS = Object.freeze({
  IT: { label: "Italy", currency: "EUR", vatPct: 22, tax: "included" },
  FR: { label: "France", currency: "EUR", vatPct: 20, tax: "included" },
  DE: { label: "Germany", currency: "EUR", vatPct: 19, tax: "included" },
  ES: { label: "Spain", currency: "EUR", vatPct: 21, tax: "included" },
  NL: { label: "Netherlands", currency: "EUR", vatPct: 21, tax: "included" },
  UK: { label: "United Kingdom", currency: "GBP", vatPct: 20, tax: "included" },
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
 * @param {{landed:number, quantity:number, currencyRates?:Record<string,number>, markets?:string[], vat?:Record<string,number>, ending?:number}} input
 *   landed is in the supplier sheet's currency; currencyRates maps a market currency to units per one of that
 *   currency (for a EUR sheet: {GBP: 0.85, USD: 1.08}). Missing rates stop that market, never guess.
 * @param {object} plan costing.mjs plan (fees, target margin, unsold share). Its salesTaxPct is replaced per market.
 */
export function marketPrices(input, plan = DEFAULT_PLAN, sheetCurrency = "EUR") {
  const { landed, quantity, currencyRates = {}, markets = Object.keys(MARKETS), vat = {}, ending = 0.95 } = input;
  const out = [];
  for (const code of markets) {
    const m = MARKETS[code];
    if (!m) { out.push({ market: code, error: `Unknown market ${code}.` }); continue; }
    const vatPct = Number.isFinite(vat[code]) ? vat[code] : m.vatPct;
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
