/**
 * Wholesale to stockists: what a boutique pays, what the brand keeps, and the
 * retail price that makes selling through shops worth it.
 *
 * A shop buys at a wholesale price and marks up to the retail price. The usual
 * "keystone" split is wholesale = half of the retail price excluding sales tax
 * (so the shop's markup is 2x). The brand's costs on a wholesale order are the
 * landed cost, a payment fee, a returns/free-shipping allowance (percent of the
 * order), a fixed cost per order and the cost of money tied up while the shop
 * pays late (net-30/60 terms).
 *
 *   retailNet   = retailPrice / (1 + salesTax)
 *   wholesale   = retailNet x (1 - shopMargin)
 *   direct      = retailNet - fees - landed        (online, paid on the spot)
 *
 * Rules of thumb for the verdicts (labelled as such, not laws): wholesale
 * should be at least 2x landed cost so the brand can pay for design, samples
 * and marketing; a shop expects about half the tax-free retail price.
 * Typed numbers in, estimates out; not financial advice.
 */

const round2 = (v) => Math.round(v * 100) / 100;
const num = (v, d) => (v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);

export const DEFAULTS = Object.freeze({
  salesTaxPct: 20, shopMarginPct: 50, allowancePct: 5, paymentFeePct: 2.9, paymentFixed: 0.3,
  directFeePct: 3, minOrderUnits: 12, fixedPerOrder: 25, termsDays: 60, costOfMoneyPct: 12,
  wholesaleShare: 40, minMultiple: 2,
});

export function planWholesale(input) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) o[k] = num(input?.[k], o[k]);
  const notes = [];
  const landed = num(input?.landed, NaN), price = num(input?.price, NaN);
  if (!(landed >= 0) || !(price > 0)) return { ok: false, error: "Enter a landed cost (0 or more) and a retail price above 0.", notes };
  if (o.shopMarginPct < 0 || o.shopMarginPct >= 100) return { ok: false, error: "Shop margin must be from 0 to under 100 percent.", notes };
  for (const k of Object.keys(DEFAULTS)) if (o[k] < 0) return { ok: false, error: `${k} cannot be negative.`, notes };
  if (o.allowancePct >= 100 || o.wholesaleShare > 100) return { ok: false, error: "Allowance must be under 100 percent and wholesale share at most 100.", notes };

  const retailNet = price / (1 + o.salesTaxPct / 100);
  const wholesale = retailNet * (1 - o.shopMarginPct / 100);
  const units = Math.max(1, Math.round(o.minOrderUnits));
  const orderValue = wholesale * units;
  const fee = orderValue * o.paymentFeePct / 100 + o.paymentFixed;
  const allowance = orderValue * o.allowancePct / 100;
  const moneyCost = landed * units * (o.costOfMoneyPct / 100) * (o.termsDays / 365);
  const wholesaleProfitPerUnit = (orderValue - fee - allowance - moneyCost - o.fixedPerOrder) / units - landed;
  const directProfit = retailNet - (price * o.directFeePct / 100 + o.paymentFixed) - landed;
  const share = o.wholesaleShare / 100;
  const blended = share * wholesaleProfitPerUnit + (1 - share) * directProfit;

  const retailForMultiple = round2(landed * o.minMultiple / (1 - o.shopMarginPct / 100) * (1 + o.salesTaxPct / 100));
  const multiple = landed > 0 ? wholesale / landed : null;
  let verdict = "worth-it";
  if (wholesaleProfitPerUnit <= 0) verdict = "loses-money";
  else if (multiple != null && multiple < o.minMultiple) verdict = "thin";
  if (verdict === "loses-money") notes.push("Each unit sold to a shop loses money after fees, the returns allowance, the cost of waiting for payment and the order's fixed cost.");
  if (verdict === "thin") notes.push(`Wholesale is ${round2(multiple)}x landed cost, under the ${o.minMultiple}x rule of thumb: little is left for design, samples and marketing.`);
  if (verdict !== "worth-it") notes.push(`A retail price of about ${retailForMultiple} (tax included) would put wholesale at ${o.minMultiple}x landed cost with a ${o.shopMarginPct}% shop margin.`);
  if (wholesaleProfitPerUnit > 0 && directProfit > 0 && wholesaleProfitPerUnit < directProfit * 0.4)
    notes.push("A wholesale unit earns under 40% of a direct online sale: wholesale pays mainly in reach, not margin.");
  if (o.shopMarginPct < 45) notes.push("Shops commonly expect about half of the tax-free retail price; below 45% some will decline to stock it.");

  return {
    ok: true, verdict,
    retailNet: round2(retailNet), wholesale: round2(wholesale), multipleOfLanded: multiple == null ? null : round2(multiple),
    orderValue: round2(orderValue), units,
    wholesaleProfitPerUnit: round2(wholesaleProfitPerUnit), wholesaleMarginPct: wholesale > 0 ? round2(wholesaleProfitPerUnit / wholesale * 100) : null,
    directProfitPerUnit: round2(directProfit), blendedProfitPerUnit: round2(blended),
    cashTiedUp: round2(landed * units), retailForMultiple, notes,
  };
}

export const VERDICT_TEXT = Object.freeze({
  "worth-it": "Worth selling through shops at this price.",
  thin: "Thin: shops would carry it but little is left for the brand.",
  "loses-money": "Loses money to stockists at this price.",
});
