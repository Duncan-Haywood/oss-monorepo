export function formatOrderSummary(input, result, targetMargin, targetPrice) {
  const money = value => `$${value.toFixed(2)}`;
  const fees = result.fees;
  return [
    'Etsy order profit summary',
    `Item price: ${money(Number(input.price))}`,
    `Shipping charged: ${money(Number(input.shippingCharged))}`,
    `Total revenue: ${money(result.revenue)}`,
    '',
    'Costs',
    `Listing fee: ${money(fees.listing)}`,
    `Transaction fee: ${money(fees.transaction)}`,
    `Payment processing: ${money(fees.payment)}`,
    `Offsite ad fee: ${money(fees.offsiteAd)}`,
    `Shipping, materials, and other costs: ${money(result.costs - fees.listing - fees.transaction - fees.payment - fees.offsiteAd)}`,
    '',
    `Estimated net contribution: ${money(result.profit)}`,
    `Net margin: ${result.margin.toFixed(1)}%`,
    `Break-even item price: ${money(result.breakEvenPrice)}`,
    `Price for ${targetMargin}% target margin: ${money(targetPrice)}`,
    '',
    'Arithmetic estimate only. Verify current Etsy fees and your costs before relying on it.',
  ].join('\n');
}
