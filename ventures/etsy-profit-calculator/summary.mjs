export function formatOrderSummary(input, result, targetMargin, targetPrice) {
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const fees = result.fees;
  const roi = result.roi === null ? "n/a" : `${result.roi.toFixed(1)}%`;
  return [
    "Etsy order profit summary",
    `Item price: ${money(Number(input.price))}`,
    `Shipping charged: ${money(Number(input.shippingCharged))}`,
    `Total revenue: ${money(result.revenue)}`,
    "",
    "Costs",
    `Listing fee: ${money(fees.listing)}`,
    `Transaction fee: ${money(fees.transaction)}`,
    `Payment processing: ${money(fees.payment)}`,
    `Offsite ad fee: ${money(fees.offsiteAd)}`,
    `Shipping, materials, and other costs: ${money(result.costs - fees.listing - fees.transaction - fees.payment - fees.offsiteAd)}`,
    `Cash invested: ${money(result.cashInvested)}`,
    "",
    `Estimated net contribution: ${money(result.profit)}`,
    `Net margin: ${result.margin.toFixed(1)}%`,
    `Return on cash: ${roi}`,
    `Break-even item price: ${money(result.breakEvenPrice)}`,
    `Price for ${targetMargin}% target margin: ${money(targetPrice)}`,
    "",
    "Arithmetic estimate only. Verify current Etsy fees and your costs before relying on it.",
  ].join("\n");
}
