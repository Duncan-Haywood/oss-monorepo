// The sales channels compared, described declaratively so `calc.mjs` needs no
// per-channel branches and a new channel is a data edit rather than new math.
//
// Every rate is an editable default, never a claim about what a marketplace
// charges today. Published schedules change, vary by category, seller tier and
// country, and are frequently misquoted by fee-calculator pages. The seller
// enters the rates from their own statements; the tool supplies arithmetic.
//
// A rate's `role` is what the arithmetic does with it:
//   percent       — a percentage of the order total (item price + shipping charged)
//   fixed         — a flat amount charged once per order
//   monthlyCost   — a recurring platform cost, spread across `monthlyOrders`
//   monthlyOrders — the divisor for `monthlyCost`; never itself a fee

export const CHANNELS = [
  {
    id: "ebay",
    label: "eBay",
    note: "The final value fee applies to the whole order total, shipping included.",
    rates: [
      { id: "ebayFinalValueRate", label: "Final value fee (%)", role: "percent", default: 13.25, step: 0.01 },
      { id: "ebayFixedFee", label: "Per-order fixed fee", role: "fixed", default: 0.3, step: 0.01 },
      { id: "ebayPromotedRate", label: "Promoted listings (%)", role: "percent", default: 0, step: 0.1 },
    ],
  },
  {
    id: "etsy",
    label: "Etsy",
    note: "The listing fee is charged per listing, not per sale; it counts once here, which is right for an item that sells on its first listing and optimistic for one that is relisted.",
    rates: [
      { id: "etsyTransactionRate", label: "Transaction fee (%)", role: "percent", default: 6.5, step: 0.01 },
      { id: "etsyPaymentRate", label: "Payment processing (%)", role: "percent", default: 3, step: 0.01 },
      { id: "etsyPaymentFixed", label: "Payment fixed fee", role: "fixed", default: 0.25, step: 0.01 },
      { id: "etsyListingFee", label: "Listing fee", role: "fixed", default: 0.2, step: 0.01 },
      { id: "etsyOffsiteAdRate", label: "Offsite Ads (%)", role: "percent", default: 0, step: 0.1 },
    ],
  },
  {
    id: "amazon",
    label: "Amazon",
    note: "The referral fee applies to the order total. Add a fulfilment fee if Amazon ships it; leave it at zero if you do.",
    rates: [
      { id: "amazonReferralRate", label: "Referral fee (%)", role: "percent", default: 15, step: 0.01 },
      { id: "amazonPerItemFee", label: "Per-item fee", role: "fixed", default: 0, step: 0.01 },
      { id: "amazonFulfilmentFee", label: "Fulfilment fee", role: "fixed", default: 0, step: 0.01 },
    ],
  },
  {
    id: "shopify_payments",
    label: "Shopify + Shopify Payments",
    note: "The monthly plan is real money whether or not this order happens, so it is spread across your typical monthly order count.",
    rates: [
      { id: "shopifyPaymentsRate", label: "Shopify Payments (%)", role: "percent", default: 2.9, step: 0.01 },
      { id: "shopifyPaymentsFixed", label: "Payments fixed fee", role: "fixed", default: 0.3, step: 0.01 },
      { id: "shopifyPlanCost", label: "Monthly plan cost", role: "monthlyCost", default: 39, step: 1 },
      { id: "shopifyMonthlyOrders", label: "Orders per month", role: "monthlyOrders", default: 100, step: 1 },
    ],
  },
  {
    id: "shopify_third_party",
    label: "Shopify + outside processor",
    note: "Shopify adds a transaction fee on top of the outside processor's own cut.",
    rates: [
      { id: "shopifyOutsideProcessorRate", label: "Processor rate (%)", role: "percent", default: 3.49, step: 0.01 },
      { id: "shopifyOutsideProcessorFixed", label: "Processor fixed fee", role: "fixed", default: 0.49, step: 0.01 },
      { id: "shopifyOutsideTxnRate", label: "Shopify transaction fee (%)", role: "percent", default: 2, step: 0.01 },
      { id: "shopifyOutsidePlanCost", label: "Monthly plan cost", role: "monthlyCost", default: 39, step: 1 },
      { id: "shopifyOutsideMonthlyOrders", label: "Orders per month", role: "monthlyOrders", default: 100, step: 1 },
    ],
  },
  {
    id: "direct",
    label: "Your own site",
    note: "The baseline: card processing and hosting only, with no marketplace cut — and no marketplace audience.",
    rates: [
      { id: "directProcessorRate", label: "Card processing (%)", role: "percent", default: 2.9, step: 0.01 },
      { id: "directProcessorFixed", label: "Processing fixed fee", role: "fixed", default: 0.3, step: 0.01 },
      { id: "directMonthlyCost", label: "Monthly hosting/tools", role: "monthlyCost", default: 0, step: 1 },
      { id: "directMonthlyOrders", label: "Orders per month", role: "monthlyOrders", default: 100, step: 1 },
    ],
  },
];

// Costs that are the same wherever the item sells, so they are entered once.
export const SHARED_FIELDS = [
  { id: "price", label: "Item price", role: "money", default: 40, step: 0.01 },
  { id: "shippingCharged", label: "Shipping charged to buyer", role: "money", default: 6, step: 0.01 },
  { id: "costOfGoods", label: "You paid for the item", role: "money", default: 12, step: 0.01 },
  { id: "shippingCost", label: "Shipping label cost", role: "money", default: 5, step: 0.01 },
  { id: "packagingCost", label: "Packaging cost", role: "money", default: 1, step: 0.01 },
  { id: "otherCost", label: "Other per-order cost", role: "money", default: 0, step: 0.01 },
  { id: "targetMargin", label: "Target net margin (%)", role: "percent", default: 20, step: 0.1 },
];

/** Every field id mapped to its default, ready to seed a form or a calculation. */
export function defaultInput(channels = CHANNELS) {
  const input = {};
  for (const field of SHARED_FIELDS) input[field.id] = field.default;
  for (const channel of channels) {
    for (const rate of channel.rates) input[rate.id] = rate.default;
  }
  return input;
}
