// Pure Reverb sale arithmetic. No network, no stored fee schedule: every
// rate is an input so the result stays a checkable calculation against the
// seller's own Reverb statement, not a claim about Reverb's current fees.
//
// Marketplace / Reverb Gives apply to the item price. Payment processing
// applies to item + shipping charged, the usual card-network shape. A seller
// whose statement folds shipping into the marketplace line can put that
// extra into `otherCost` or raise the marketplace rate.

export const INPUT_FIELDS = [
  'price',
  'offerPrice',
  'shippingCharged',
  'shippingCost',
  'itemCost',
  'otherCost',
  'marketplaceRate',
  'paymentRate',
  'paymentFixed',
  'givesRate',
  'bumpFee',
  'meetupCost',
  'ebayFinalValueRate',
  'ebayFixedFee',
];

export const REVERB_DEFAULTS = {
  price: 800,
  offerPrice: 720,
  shippingCharged: 75,
  shippingCost: 65,
  itemCost: 450,
  otherCost: 10,
  marketplaceRate: 5,
  paymentRate: 2.9,
  paymentFixed: 0.3,
  givesRate: 0,
  bumpFee: 0,
  meetupCost: 0,
  ebayFinalValueRate: 13.25,
  ebayFixedFee: 0.3,
};

function number(value, name, fallback) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

function saleInputs(input, salePrice) {
  const shippingCharged = number(input.shippingCharged, 'Shipping charged', 0);
  const shippingCost = number(input.shippingCost, 'Shipping cost', 0);
  const itemCost = number(input.itemCost, 'What you paid for the item', 0);
  const otherCost = number(input.otherCost, 'Other per-sale cost', 0);
  const marketplaceRate = number(input.marketplaceRate, 'Reverb marketplace rate', 5);
  const paymentRate = number(input.paymentRate, 'Payment rate', 2.9);
  const paymentFixed = number(input.paymentFixed, 'Payment fixed fee', 0.3);
  const givesRate = number(input.givesRate, 'Reverb Gives rate', 0);
  const bumpFee = number(input.bumpFee, 'Bump fee on this listing', 0);
  if (marketplaceRate + paymentRate + givesRate >= 100) {
    throw new Error('Combined percentage fees must stay below 100%');
  }
  return {
    salePrice,
    shippingCharged,
    shippingCost,
    itemCost,
    otherCost,
    marketplaceRate,
    paymentRate,
    paymentFixed,
    givesRate,
    bumpFee,
  };
}

export function calculateReverbSale(input, salePrice = input?.price) {
  const price = number(salePrice, 'Sale price');
  const fields = saleInputs(input, price);
  const revenue = fields.salePrice + fields.shippingCharged;
  const marketplaceFee = fields.salePrice * fields.marketplaceRate / 100;
  const givesFee = fields.salePrice * fields.givesRate / 100;
  const paymentFee = revenue * fields.paymentRate / 100 + fields.paymentFixed;
  const fees = marketplaceFee + givesFee + paymentFee + fields.bumpFee;
  const variableCosts = fields.shippingCost + fields.itemCost + fields.otherCost;
  const costs = fees + variableCosts;
  const profit = revenue - costs;
  return {
    salePrice: fields.salePrice,
    revenue,
    fees: { marketplace: marketplaceFee, gives: givesFee, payment: paymentFee, bump: fields.bumpFee, total: fees },
    variableCosts,
    costs,
    profit,
    margin: revenue === 0 ? 0 : profit / revenue * 100,
  };
}

export function calculateEbaySale(input, salePrice = input?.price) {
  const price = number(salePrice, 'Sale price');
  const shippingCharged = number(input.shippingCharged, 'Shipping charged', 0);
  const shippingCost = number(input.shippingCost, 'Shipping cost', 0);
  const itemCost = number(input.itemCost, 'What you paid for the item', 0);
  const otherCost = number(input.otherCost, 'Other per-sale cost', 0);
  const finalValueRate = number(input.ebayFinalValueRate, 'eBay final value rate', 13.25);
  const fixedFee = number(input.ebayFixedFee, 'eBay fixed fee', 0.3);
  if (finalValueRate >= 100) throw new Error('eBay final value rate must be below 100%');
  const revenue = price + shippingCharged;
  const finalValueFee = revenue * finalValueRate / 100;
  const fees = finalValueFee + fixedFee;
  const variableCosts = shippingCost + itemCost + otherCost;
  const costs = fees + variableCosts;
  const profit = revenue - costs;
  return {
    salePrice: price,
    revenue,
    fees: { finalValue: finalValueFee, fixed: fixedFee, total: fees },
    variableCosts,
    costs,
    profit,
    margin: revenue === 0 ? 0 : profit / revenue * 100,
  };
}

export function compareOfferToList(input) {
  const listPrice = number(input.price, 'List price');
  const offerPrice = number(input.offerPrice, 'Offer price', listPrice);
  const list = calculateReverbSale(input, listPrice);
  const offer = calculateReverbSale(input, offerPrice);
  return {
    list,
    offer,
    leaveOnTable: list.profit - offer.profit,
    offerStillPays: offer.profit >= 0,
  };
}

export function compareReverbToEbay(input, salePrice = input?.price) {
  const reverb = calculateReverbSale(input, salePrice);
  const ebay = calculateEbaySale(input, salePrice);
  return {
    reverb,
    ebay,
    reverbExtra: reverb.profit - ebay.profit,
  };
}

// Reverb offer that leaves the same cash as selling this item on eBay at the
// list price. Solved from the same arithmetic as calculateReverbSale — not a
// recommended walk-away, just the crossover the seller can check.
export function offerThatMatchesEbayList(input) {
  const ebay = calculateEbaySale(input, number(input.price, 'List price'));
  const shippingCharged = number(input.shippingCharged, 'Shipping charged', 0);
  const shippingCost = number(input.shippingCost, 'Shipping cost', 0);
  const itemCost = number(input.itemCost, 'What you paid for the item', 0);
  const otherCost = number(input.otherCost, 'Other per-sale cost', 0);
  const marketplaceRate = number(input.marketplaceRate, 'Reverb marketplace rate', 5);
  const paymentRate = number(input.paymentRate, 'Payment rate', 2.9);
  const paymentFixed = number(input.paymentFixed, 'Payment fixed fee', 0.3);
  const givesRate = number(input.givesRate, 'Reverb Gives rate', 0);
  const bumpFee = number(input.bumpFee, 'Bump fee on this listing', 0);
  const keepRate = 1 - marketplaceRate / 100 - paymentRate / 100 - givesRate / 100;
  if (keepRate <= 0) throw new Error('Combined percentage fees must stay below 100%');
  const needed = ebay.profit
    - shippingCharged * (1 - paymentRate / 100)
    + paymentFixed
    + shippingCost
    + itemCost
    + otherCost
    + bumpFee;
  const offerPrice = needed / keepRate;
  if (!Number.isFinite(offerPrice) || offerPrice < 0) {
    throw new Error('No non-negative Reverb offer matches that eBay list cash');
  }
  const atOffer = calculateReverbSale(input, offerPrice);
  return {
    offerPrice,
    reverbProfit: atOffer.profit,
    ebayListProfit: ebay.profit,
  };
}

// Same listing, four ways to handle shipping. Marketplace and Reverb
// Gives sit on the item price, so folding postage into the list raises
// those lines. Absorbing the label keeps the typed list and leaves the
// postage on you. Local pickup drops shipping charged and, unless you
// type a meetup cost, the postage you pay.
export function compareShippingPaths(input, salePrice = input?.price) {
  const price = number(salePrice, 'Sale price');
  const shippingCharged = number(input.shippingCharged, 'Shipping charged', 0);
  const meetupCost = number(input.meetupCost, 'Meetup / pickup cost', 0);
  const buyerPays = calculateReverbSale(input, price);
  const included = calculateReverbSale({ ...input, shippingCharged: 0 }, price + shippingCharged);
  const pickup = calculateReverbSale({
    ...input,
    shippingCharged: 0,
    shippingCost: meetupCost,
  }, price);
  const absorbed = calculateReverbSale({ ...input, shippingCharged: 0 }, price);
  const rows = [
    { id: 'buyerPays', label: 'Buyer pays shipping', sale: buyerPays },
    { id: 'included', label: 'Shipping included in the price', sale: included },
    { id: 'pickup', label: 'Local pickup', sale: pickup },
    { id: 'absorbed', label: 'You absorb the label', sale: absorbed },
  ].map((row) => ({
    ...row,
    checkout: row.sale.revenue,
    vsBuyerPays: row.sale.profit - buyerPays.profit,
  }));
  const maxProfit = Math.max(...rows.map((row) => row.sale.profit));
  const leaders = rows.filter((row) => Math.abs(row.sale.profit - maxProfit) < 1e-9);
  return {
    buyerPays,
    included,
    pickup,
    absorbed,
    meetupCost,
    rows,
    extraMarketplaceOnIncluded: included.fees.marketplace - buyerPays.fees.marketplace,
    extraGivesOnIncluded: included.fees.gives - buyerPays.fees.gives,
    absorbVsIncluded: absorbed.profit - included.profit,
    includedListThatMatchesBuyerPays: includedListThatMatchesBuyerPays(input, buyerPays.profit),
    winner: leaders.length === 1 ? leaders[0].id : 'tie',
  };
}

function includedListThatMatchesBuyerPays(input, targetProfit) {
  const shippingCost = number(input.shippingCost, 'Shipping cost', 0);
  const itemCost = number(input.itemCost, 'What you paid for the item', 0);
  const otherCost = number(input.otherCost, 'Other per-sale cost', 0);
  const marketplaceRate = number(input.marketplaceRate, 'Reverb marketplace rate', 5);
  const paymentRate = number(input.paymentRate, 'Payment rate', 2.9);
  const paymentFixed = number(input.paymentFixed, 'Payment fixed fee', 0.3);
  const givesRate = number(input.givesRate, 'Reverb Gives rate', 0);
  const bumpFee = number(input.bumpFee, 'Bump fee on this listing', 0);
  const keepRate = 1 - marketplaceRate / 100 - paymentRate / 100 - givesRate / 100;
  if (keepRate <= 0) throw new Error('Combined percentage fees must stay below 100%');
  const needed = targetProfit + paymentFixed + shippingCost + itemCost + otherCost + bumpFee;
  const listPrice = needed / keepRate;
  if (!Number.isFinite(listPrice) || listPrice < 0) {
    throw new Error('No non-negative included list matches that buyer-pays cash');
  }
  return listPrice;
}
