/**
 * What one garment costs to make and land, what is left from each sale, and
 * how many must sell before the run and its marketing are paid back.
 *
 * Every price comes from the supplier sheet and the plan the designer types.
 * The studio adds and divides; it does not know what fabric or a factory
 * costs, and it says so on the page.
 *
 *   fabric      = price per metre x metres per garment x (1 + wastage)
 *   decoration  = for each placement: setup / quantity + per-unit price
 *                 (per-colour methods: both multiplied by the ink colours)
 *   goods       = fabric + cut and sew + decoration + trims + packaging
 *   landed      = goods + duty (duty % of goods) + freight per unit
 *   per sale    = price excluding sales tax - channel commission - payment fee
 *   margin      = (per sale - landed) / price excluding sales tax
 */

import { METHODS } from "./catalogue.mjs";
import { missingPrices } from "./suppliers.mjs";

export const DEFAULT_PLAN = Object.freeze({
  salesTaxPct: 0,        // VAT included in the shelf price (e.g. 22 in Italy); 0 when prices are shown before tax
  channelFeePct: 0,      // commission the shop or marketplace keeps, e.g. 10 to 15 for a multi-brand site
  paymentFeePct: 3,      // card processing, percent of the price
  paymentFixed: 0.3,     // card processing, per order
  unsoldPct: 10,         // share of the run expected not to sell at full price
  marketingBudget: 500,  // spent to launch this design
  targetMarginPct: 60,
});

const round2 = v => Math.round(v * 100) / 100;

export function decorationLines(design, sheet) {
  const qty = Math.max(1, design.quantity);
  return design.placements.map(p => {
    const price = sheet.methods[p.method] ?? { setup: 0, perUnit: 0 };
    const perColour = METHODS[p.method]?.setup === "per-colour";
    const mult = perColour ? Math.max(1, p.colours || 1) : 1;
    const setup = (METHODS[p.method]?.setup === "none" ? 0 : price.setup) * mult;
    return {
      id: p.id,
      label: p.label ?? p.kind,
      method: p.method,
      area: p.area,
      setupTotal: round2(setup),
      perUnit: round2(price.perUnit * mult + setup / qty),
    };
  });
}

/** Unit cost of a design at its quantity. Throws when the sheet cannot price it. */
export function unitCost(design, sheet) {
  const missing = missingPrices(sheet, design);
  if (missing.length) {
    const err = new Error(`The supplier sheet has no ${missing.join(", ")}.`);
    err.missing = missing;
    throw err;
  }
  const fabric = sheet.fabrics[design.fabric] * sheet.metresPerGarment[design.garment] * (1 + (sheet.wastagePct || 0) / 100);
  const cutSew = sheet.cutAndSew[design.garment];
  const decoration = decorationLines(design, sheet);
  const decorationTotal = decoration.reduce((s, d) => s + d.perUnit, 0);
  const goods = fabric + cutSew + decorationTotal + (sheet.trimsPerUnit || 0) + (sheet.packagingPerUnit || 0);
  const duty = goods * (sheet.dutyPct || 0) / 100;
  const landed = goods + duty + (sheet.freightPerUnit || 0);
  return {
    currency: sheet.currency,
    lines: [
      { label: "Fabric", value: round2(fabric), detail: `${sheet.fabrics[design.fabric]} per metre x ${sheet.metresPerGarment[design.garment]} m + ${sheet.wastagePct || 0}% wastage` },
      { label: "Cut and sew", value: round2(cutSew), detail: "per garment" },
      ...decoration.map(d => ({ label: `${METHODS[d.method]?.label ?? d.method} (${d.area})`, value: d.perUnit, detail: d.setupTotal ? `includes ${d.setupTotal} setup spread over ${design.quantity}` : "no setup" })),
      { label: "Labels and trims", value: round2(sheet.trimsPerUnit || 0), detail: "per garment" },
      { label: "Packaging", value: round2(sheet.packagingPerUnit || 0), detail: "per garment" },
      { label: "Duty", value: round2(duty), detail: `${sheet.dutyPct || 0}% of goods` },
      { label: "Freight to you", value: round2(sheet.freightPerUnit || 0), detail: "per garment" },
    ],
    setupTotal: round2(decoration.reduce((s, d) => s + d.setupTotal, 0)),
    landed: round2(landed),
  };
}

/**
 * The selling side for any product with a landed cost: margin, break-even,
 * cash needed and the price a target margin needs. Shared by garments,
 * sunglasses and wardrobe drops.
 */
export function sellingSide({ landed, price, quantity, moq = 0, currency = "EUR" }, plan = DEFAULT_PLAN) {
  const p = { ...DEFAULT_PLAN, ...plan };
  const net = price / (1 + p.salesTaxPct / 100);
  const fees = price * (p.channelFeePct + p.paymentFeePct) / 100 + p.paymentFixed;
  const perSale = net - fees;
  const profitPerSale = perSale - landed;
  const sellable = Math.floor(quantity * (1 - p.unsoldPct / 100));
  const cashUpFront = landed * quantity + p.marketingBudget;
  const breakEven = perSale > 0 ? Math.ceil(cashUpFront / perSale) : null;
  const denom = (1 - p.targetMarginPct / 100) / (1 + p.salesTaxPct / 100) - (p.channelFeePct + p.paymentFeePct) / 100;
  const priceForTarget = denom > 0 ? round2((landed + p.paymentFixed) / denom) : null;
  const notes = [];
  if (moq && quantity < moq) notes.push(`This run of ${quantity} is below the supplier's minimum order of ${moq}.`);
  if (breakEven != null && breakEven > sellable) notes.push(`Break-even needs ${breakEven} sales, more than the ${sellable} you expect to sell from this run: raise the price, cut the cost or the launch budget, or make more.`);
  if (breakEven == null) notes.push("Each sale loses money before the product is even paid for: the price is below fees and tax.");
  if (priceForTarget == null) notes.push("No price reaches the target margin once tax and fees are taken from it; lower the target.");
  return {
    currency,
    price: round2(price),
    netOfTax: round2(net),
    feesPerSale: round2(fees),
    profitPerSale: round2(profitPerSale),
    marginPct: net > 0 ? Math.round((profitPerSale / net) * 1000) / 10 : null,
    cashUpFront: round2(cashUpFront),
    breakEvenUnits: breakEven,
    sellableUnits: sellable,
    profitIfSellable: round2(sellable * perSale - cashUpFront),
    priceForTargetMargin: priceForTarget,
    notes,
  };
}

/** The selling side of a garment design. */
export function economics(design, sheet, plan = DEFAULT_PLAN) {
  const cost = unitCost(design, sheet);
  return { cost, ...sellingSide({ landed: cost.landed, price: design.price, quantity: design.quantity, moq: sheet.moq, currency: sheet.currency }, plan) };
}

/** The same design costed at several run sizes, to see where setup stops mattering. */
export function quantityBreaks(design, sheet, sizes = [25, 50, 100, 250, 500, 1000]) {
  return sizes.map(q => {
    const c = unitCost({ ...design, quantity: q }, sheet);
    return { quantity: q, landed: c.landed, belowMoq: !!(sheet.moq && q < sheet.moq) };
  });
}

/** Format a money amount for the page. */
export function money(v, currency = "EUR") {
  if (v == null || !Number.isFinite(v)) return "n/a";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}
