// Deterministic payout/profit arithmetic for a StockX seller flipping
// sneakers, streetwear, and trading cards through StockX's bid/ask
// marketplace — not a general resale-fee calculator (see `ebay-fee-
// calculator`, `poshmark-fee-calculator`, `whatnot-seller-payout` for those
// storefronts) and not a sourcing or authentication tool: StockX itself runs
// verification, and this never touches that.
//
// The product exists because the number a seller sees on the sale
// confirmation ("Sold for $150") is not the number that lands in their bank
// account. Three deductions come out before payout, and none of them are the
// same for every seller:
//
//   - **Seller fee** (StockX calls it the "Transaction Fee"): a percentage of
//     the sale price that drops as a seller's own Seller Level rises (more
//     completed sales and a clean history earn a lower rate) — so two sellers
//     moving the identical pair at the identical price keep different amounts.
//   - **Fast Shipping discount**: StockX knocks a further percentage off the
//     seller fee for sellers enrolled in its Fast Shipping program (shipping
//     from a pre-verified local inventory). It stacks with the seller-level
//     rate rather than replacing it.
//   - **Payment processing fee**: a flat percentage of the sale price,
//     charged regardless of seller level.
//   - **Outbound shipping cost**: what the seller pays to ship the item to a
//     StockX verification center — a flat dollar cost that does not scale
//     with the sale price the way the two fees above do, so it matters far
//     more on a cheap item than an expensive one.
//   - **Other per-sale costs**: the box, tape, tissue, a replacement lace
//     bag, printer labels, the drive to the drop-off. Another flat dollar
//     cost that behaves exactly like shipping does above, and one this
//     calculator left out until 2026-09-22 — every sibling in this portfolio
//     (`ebay-fee-calculator`, `whatnot-seller-payout`, `poshmark-fee-
//     calculator`) has carried such a bucket since it shipped. Its absence
//     also made the cross-channel handoff below lossy: `where-to-sell-
//     calculator` compares an item carrying packaging and other per-unit
//     cash, and with nowhere here to put either, following the link into
//     this page printed a *higher* profit than the comparison the seller had
//     just read. Defaults to 0, so nothing about an existing saved draft,
//     shared link, or worked example moves.
//
// No rate below is StockX's published, current fee schedule — seller-level
// bands and the processing rate both change over time and by seller, region,
// and category, and StockX does not publish an API a static calculator could
// read live. Every number is a placeholder you replace with the line on your
// own payout statement or seller dashboard. Same two-layer shape as this
// portfolio's other per-item-then-roll-up calculators (`ebay-fee-calculator`,
// `whatnot-seller-payout`, the route-margin cluster):
//
//   calculate(input)           — net payout and net profit for ONE sale, from
//                                 the sale price, what the seller paid for
//                                 the item, the seller-fee percentage, the
//                                 Fast Shipping discount, the payment
//                                 processing percentage, the outbound
//                                 shipping cost, and any other per-sale cash.
//   computeMonthProfit(sales)  — roll a list of sales' net profit up into
//                                 total profit for the month.
//   incomeGap(...)             — compare that monthly profit to a target and
//                                 say how many more sales, at the same
//                                 average profit, close the gap.

export const DEFAULTS = {
  salePrice: 150,
  itemCostBasis: 100,
  sellerFeePct: 9,
  fastShippingDiscountPct: 0,
  paymentProcessingFeePct: 3,
  shippingCost: 6,
  otherCost: 0,
  targetMonthlyProfit: 1000,
};

function number(value, label, { min = 0, max = null, exclusiveMax = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== null) {
    if (exclusiveMax && parsed >= max) throw new Error(`${label} must be below ${max}.`);
    if (!exclusiveMax && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  }
  return parsed;
}

/**
 * Net payout and net profit for a single StockX sale.
 *
 * @param {object} input
 * @param {number} input.salePrice The price the item sold for on StockX
 *   (the "Ask" a buyer accepted, or the winning "Bid").
 * @param {number} input.itemCostBasis What you paid to acquire this item —
 *   retail price, tax, and any inbound shipping to you. 0 if you are only
 *   checking payout, not profit.
 * @param {number} input.sellerFeePct StockX's seller/transaction fee
 *   percentage before any Fast Shipping discount — this drops as your
 *   Seller Level rises. Read it off your own seller dashboard; it is not a
 *   fixed published number.
 * @param {number} input.fastShippingDiscountPct Percentage points knocked
 *   off `sellerFeePct` for Fast Shipping enrollment. 0 if you are not
 *   enrolled.
 * @param {number} input.paymentProcessingFeePct Flat payment-processing
 *   percentage charged on the sale price regardless of seller level.
 * @param {number} input.shippingCost What you pay, in dollars, to ship the
 *   item to a StockX verification center. 0 if StockX provides a prepaid
 *   label you don't pay for directly.
 * @param {number} [input.otherCost] Anything else this one sale costs you in
 *   cash — box, tape, poly mailer, a replacement lace bag, label stock, the
 *   drive to the drop-off. Optional and 0 by default, so an older saved
 *   draft or shared link that predates the field prices exactly as before.
 */
export function calculate(input) {
  const salePrice = number(input.salePrice, 'Sale price');
  const itemCostBasis = number(input.itemCostBasis, 'Item cost basis');
  const sellerFeePct = number(input.sellerFeePct, 'Seller fee percentage', { max: 100 });
  const fastShippingDiscountPct = number(input.fastShippingDiscountPct, 'Fast Shipping discount percentage', { max: 100 });
  const paymentProcessingFeePct = number(input.paymentProcessingFeePct, 'Payment processing fee percentage', { max: 100 });
  const shippingCost = number(input.shippingCost, 'Shipping cost');
  // Absent means zero, not an error: a link or saved draft written before
  // this field existed must still price, and `Number(undefined)` is NaN.
  const otherCost = number(input.otherCost ?? 0, 'Other per-sale costs');

  // Fast Shipping only ever reduces the seller fee, and never below zero —
  // a discount larger than the base rate does not hand the seller a rebate.
  const effectiveSellerFeePct = Math.max(0, sellerFeePct - fastShippingDiscountPct);
  const sellerFeeAmount = salePrice * (effectiveSellerFeePct / 100);
  const paymentProcessingFeeAmount = salePrice * (paymentProcessingFeePct / 100);
  // `totalFees` has always carried the flat shipping cost alongside the two
  // percentage fees — it is what comes off the sale before the cost basis,
  // not a fees-only subtotal — so the other-cost bucket belongs here too.
  const totalFees = sellerFeeAmount + paymentProcessingFeeAmount + shippingCost + otherCost;

  const netPayout = salePrice - totalFees;
  const netProfit = netPayout - itemCostBasis;

  const effectiveFeeRatePct = salePrice > 0 ? (totalFees / salePrice) * 100 : null;
  const profitMarginPct = salePrice > 0 ? (netProfit / salePrice) * 100 : null;
  const roiPct = itemCostBasis > 0 ? (netProfit / itemCostBasis) * 100 : null;

  return {
    effectiveSellerFeePct, sellerFeeAmount, paymentProcessingFeeAmount, otherCost, totalFees,
    netPayout, netProfit, effectiveFeeRatePct, profitMarginPct, roiPct,
  };
}

/**
 * The lowest sale price that still leaves `targetMarginPct` of itself as net
 * profit. Fees scale with price and shipping/supplies do not, so the answer is
 * (cost + flat costs) / (1 - fee% - processing% - margin%). With a margin of 0
 * this is the break-even ask: any sale below it loses money. Returns null when
 * the percentage take alone is 100% or more, because no price clears it.
 */
export function minimumSalePrice(input, targetMarginPct = 0) {
  const itemCostBasis = number(input.itemCostBasis, 'Item cost basis');
  const sellerFeePct = number(input.sellerFeePct, 'Seller fee percentage', { max: 100 });
  const fastShippingDiscountPct = number(input.fastShippingDiscountPct, 'Fast Shipping discount percentage', { max: 100 });
  const paymentProcessingFeePct = number(input.paymentProcessingFeePct, 'Payment processing fee percentage', { max: 100 });
  const shippingCost = number(input.shippingCost, 'Shipping cost');
  const otherCost = number(input.otherCost ?? 0, 'Other per-sale costs');
  const margin = number(targetMarginPct, 'Target margin percentage', { max: 100, exclusiveMax: true });
  const feePct = Math.max(0, sellerFeePct - fastShippingDiscountPct) + paymentProcessingFeePct + margin;
  if (feePct >= 100) return null;
  return (itemCostBasis + shippingCost + otherCost) / (1 - feePct / 100);
}

/**
 * Roll a list of sales' net profit up into total profit for the month.
 * @param {{netProfit: number}[]} sales
 */
export function computeMonthProfit(sales) {
  let totalMonthlyProfit = 0;
  for (const [i, sale] of sales.entries()) {
    totalMonthlyProfit += number(sale.netProfit, `Sale ${i + 1} net profit`, { min: -Infinity });
  }
  const saleCount = sales.length;
  const averageProfitPerSale = saleCount > 0 ? totalMonthlyProfit / saleCount : 0;
  return { totalMonthlyProfit, saleCount, averageProfitPerSale };
}

/**
 * Compare monthly profit to a target and say how many more sales, at the
 * same average profit, close the gap.
 */
export function incomeGap(targetMonthlyProfit, totalMonthlyProfit, averageProfitPerSale) {
  const target = number(targetMonthlyProfit, 'Target monthly profit');
  const profit = number(totalMonthlyProfit, 'Total monthly profit', { min: -Infinity });
  const avg = number(averageProfitPerSale, 'Average profit per sale', { min: -Infinity });
  const gap = Math.max(0, target - profit);
  const additionalSalesNeeded = gap === 0 ? 0 : (avg > 0 ? Math.ceil(gap / avg) : null);
  return { gap, additionalSalesNeeded, meetsTarget: profit >= target };
}
