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
  'safeShippingCost',
  'claimCost',
  'unprotectedLossRatePct',
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
  'shopSalePrice',
  'consignmentRate',
  'shopCashOffer',
  'returnShippingCost',
  'feeRefundOnReturnPct',
  'relistPrice',
  'partialRefund',
];

// When the seller has not quoted a Safe Shipping label yet, show own-label
// plus this premium so the table is never an empty "$0 vs $0" row. A typed
// quote replaces it.
export const ILLUSTRATED_SAFE_SHIPPING_PREMIUM = 15;

export const REVERB_DEFAULTS = {
  price: 800,
  offerPrice: 720,
  shippingCharged: 75,
  shippingCost: 65,
  safeShippingCost: 80,
  claimCost: 450,
  unprotectedLossRatePct: 2,
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
  shopSalePrice: 800,
  consignmentRate: 30,
  shopCashOffer: 520,
  returnShippingCost: 75,
  feeRefundOnReturnPct: 61,
  relistPrice: 720,
  partialRefund: 150,
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

// Same buyer checkout, two labels. Reverb Safe Shipping is a more expensive
// label that is supposed to cover a damaged or lost shipment. Your own label
// is cheaper and you eat the claim. Expected keep = sale profit minus
// (claim rate × cash you lose on an unprotected claim). The extra label is
// worth it only when that expected claim is larger than the extra postage.
// Distinct from who pays postage (buyer / included / pickup) and from
// absorbing the label into the list.
export function compareSafeShipping(input, salePrice = input?.price) {
  const price = number(salePrice, 'Sale price');
  const ownLabel = number(input.shippingCost, 'Shipping you pay', 0);
  const typedSafe = number(input.safeShippingCost, 'Safe Shipping label', 0);
  const itemCost = number(input.itemCost, 'What you paid for the item', 0);
  const claimCost = number(input.claimCost, 'Unprotected claim cost', itemCost);
  const lossRatePct = number(input.unprotectedLossRatePct, 'Unprotected claim rate', 2);
  if (lossRatePct > 100) throw new Error('Unprotected claim rate must be at most 100%');

  const usedIllustratedQuote = typedSafe === 0;
  const safeLabel = usedIllustratedQuote ? ownLabel + ILLUSTRATED_SAFE_SHIPPING_PREMIUM : typedSafe;
  const own = calculateReverbSale(input, price);
  const safe = calculateReverbSale({ ...input, shippingCost: safeLabel }, price);
  const extraLabelCost = safeLabel - ownLabel;
  const expectedClaim = claimCost * lossRatePct / 100;
  const ownExpectedProfit = own.profit - expectedClaim;
  const breakEvenLossRatePct = claimCost > 0 ? extraLabelCost / claimCost * 100 : Infinity;

  const rows = [
    {
      id: 'ownIfNothing',
      label: 'Own label if nothing goes wrong',
      sale: own,
      labelCost: ownLabel,
      expectedClaim: 0,
      expectedProfit: own.profit,
    },
    {
      id: 'ownExpected',
      label: 'Own label after expected claims',
      sale: own,
      labelCost: ownLabel,
      expectedClaim,
      expectedProfit: ownExpectedProfit,
    },
    {
      id: 'safeShipping',
      label: usedIllustratedQuote ? 'Reverb Safe Shipping (illustrated quote)' : 'Reverb Safe Shipping',
      sale: safe,
      labelCost: safeLabel,
      expectedClaim: 0,
      expectedProfit: safe.profit,
    },
  ].map((row) => ({
    ...row,
    vsOwnExpected: row.expectedProfit - ownExpectedProfit,
  }));

  const decision = [rows[1], rows[2]];
  const maxProfit = Math.max(...decision.map((row) => row.expectedProfit));
  const leaders = decision.filter((row) => Math.abs(row.expectedProfit - maxProfit) < 1e-9);
  return {
    own,
    safe,
    rows,
    ownLabel,
    safeLabel,
    extraLabelCost,
    claimCost,
    lossRatePct,
    expectedClaim,
    ownExpectedProfit,
    safeExpectedProfit: safe.profit,
    breakEvenLossRatePct,
    usedIllustratedQuote,
    safePays: safe.profit >= ownExpectedProfit,
    winner: leaders.length === 1 ? leaders[0].id : 'tie',
  };
}

// Same guitar, three ways to get paid. Listing it yourself keeps Reverb
// fees, postage, and packing. A shop consignment cut is a percent of
// *their* sale — they ship, they collect, you do not pay marketplace or
// a label. Their cash offer is a buy today: no wait, no fees, no shipping.
// Distinct from offer-versus-eBay, who pays postage, Safe Shipping, and
// from open PRs that compare a bump or absorbing the label into the list.
export function compareConsignment(input, salePrice = input?.price) {
  const listPrice = number(salePrice, 'Sale price');
  const offerPrice = number(input.offerPrice, 'Offer price', listPrice);
  const shopSalePrice = number(input.shopSalePrice, 'Shop sale price', listPrice);
  const consignmentRate = number(input.consignmentRate, 'Shop consignment cut', 30);
  const shopCashOffer = number(input.shopCashOffer, 'Shop cash offer', 0);
  const itemCost = number(input.itemCost, 'What you paid for the item', 0);
  if (consignmentRate > 100) throw new Error('Shop consignment cut must be at most 100%');

  const selfList = calculateReverbSale(input, listPrice);
  const selfOffer = calculateReverbSale(input, offerPrice);
  const shopPayout = shopSalePrice * (1 - consignmentRate / 100);
  const consignProfit = shopPayout - itemCost;
  const cashProfit = shopCashOffer - itemCost;
  const neededToMatchList = selfList.profit + itemCost;
  const keepRate = 1 - consignmentRate / 100;
  const breakEvenConsignmentRatePct = shopSalePrice > 0
    ? (1 - neededToMatchList / shopSalePrice) * 100
    : -Infinity;
  const breakEvenShopSalePrice = keepRate > 0 ? neededToMatchList / keepRate : Infinity;
  const breakEvenShopCash = neededToMatchList;
  const shopSaleCanMatch = shopSalePrice >= neededToMatchList;

  const rows = [
    {
      id: 'selfList',
      label: 'List it yourself on Reverb',
      price: listPrice,
      youReceive: selfList.profit + itemCost,
      profit: selfList.profit,
    },
    {
      id: 'consign',
      label: 'Consign at the shop',
      price: shopSalePrice,
      youReceive: shopPayout,
      profit: consignProfit,
    },
    {
      id: 'cash',
      label: 'Take their cash offer today',
      price: shopCashOffer,
      youReceive: shopCashOffer,
      profit: cashProfit,
    },
  ].map((row) => ({
    ...row,
    vsSelfList: row.profit - selfList.profit,
  }));

  const maxProfit = Math.max(...rows.map((row) => row.profit));
  const leaders = rows.filter((row) => Math.abs(row.profit - maxProfit) < 1e-9);
  return {
    selfList,
    selfOffer,
    shopSalePrice,
    consignmentRate,
    shopCashOffer,
    shopPayout,
    consignProfit,
    cashProfit,
    itemCost,
    neededToMatchList,
    breakEvenConsignmentRatePct,
    breakEvenShopSalePrice,
    breakEvenShopCash,
    shopSaleCanMatch,
    vsOffer: consignProfit - selfOffer.profit,
    rows,
    winner: leaders.length === 1 ? leaders[0].id : 'tie',
  };
}

export function consignmentNote(comparison) {
  const money = (value) => {
    const format = (value) => `$${Number(value).toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const pct = (value) => `${Number(value).toFixed(2)}%`;
  const rate = comparison.consignmentRate;
  const shop = money(comparison.shopSalePrice);
  const cash = money(comparison.shopCashOffer);
  const listBeatConsign = comparison.selfList.profit - comparison.consignProfit;
  const listBeatCash = comparison.selfList.profit - comparison.cashProfit;
  const cutLine = comparison.shopSaleCanMatch && Number.isFinite(comparison.breakEvenConsignmentRatePct)
    ? `The shop cut would have to drop to ${pct(comparison.breakEvenConsignmentRatePct)} — or they would have to sell it at ${money(comparison.breakEvenShopSalePrice)} — to match Reverb list cash.`
    : `Even a 0% shop cut on a ${shop} sale cannot match Reverb list cash.`;
  const cashLine = `Their cash offer would have to be ${money(comparison.breakEvenShopCash)}.`;

  if (comparison.winner === 'selfList') {
    return `Listing it yourself on Reverb still leaves ${money(listBeatConsign)} more than a ${rate}% shop cut on a ${shop} shop sale, and ${money(listBeatCash)} more than their ${cash} cash offer. ${cutLine} ${cashLine}`;
  }
  if (comparison.winner === 'consign') {
    return `Consigning at ${rate}% on a ${shop} shop sale still leaves ${money(-listBeatConsign)} more than listing it yourself on Reverb. ${cutLine} ${cashLine}`;
  }
  if (comparison.winner === 'cash') {
    return `Taking their ${cash} cash offer still leaves ${money(-listBeatCash)} more than listing it yourself on Reverb. ${cutLine} ${cashLine}`;
  }
  return `Two shop-or-list paths leave the same cash on these inputs. ${cutLine} ${cashLine}`;
}

// Percentage-fee cash as a share of the order, used to price the fee credit a
// refund earns back. The fixed per-order payment line and a bump already spent
// are not refund-linked, so both stay out of it. Derived from the sale itself
// rather than re-reading the rates, so a seller who overwrites a rate gets the
// credit on their rate.
function percentFeeRate(sale, paymentFixed) {
  const percentFees = sale.fees.marketplace + sale.fees.gives + (sale.fees.payment - paymentFixed);
  return sale.revenue <= 1e-12 ? 0 : percentFees / sale.revenue;
}

// A returned guitar is not a returned phone case. Three things separate the
// two, and all three make the return worse on Reverb than the same call on a
// marketplace of identical commodity units:
//
//   1. Freight runs three legs, not one — out, back, and out again on the
//      relist. On a combo amp each leg is real money.
//   2. The item is one of one. There is no second unit on the shelf, so the
//      cash you recover is whatever the *relist* fetches, and a piece that has
//      shipped twice and had a claim opened rarely fetches the first price.
//   3. Reverb credits the selling fee on a refund; the card processor
//      generally keeps its cut. That residue is charged whether the buyer
//      keeps the item or ships it back.
//
// So the useful answer is almost never "return or no return" — it is *how big
// a partial refund is still cheaper than the return*, which is what
// `breakEvenPartialRefund` reports.
export function compareReturnResolution(input, salePrice = input?.price) {
  const price = number(salePrice, 'Sale price');
  const sold = calculateReverbSale(input, price);
  const shippingCost = number(input.shippingCost, 'Shipping cost', 0);
  const otherCost = number(input.otherCost, 'Other per-sale cost', 0);
  const itemCost = number(input.itemCost, 'What you paid for the item', 0);
  const paymentFixed = number(input.paymentFixed, 'Payment fixed fee', 0.3);
  const returnShippingCost = number(input.returnShippingCost, 'Return shipping you pay', 0);
  const relistPrice = number(input.relistPrice, 'Relist price', 0);
  const partialRefund = number(input.partialRefund, 'Partial refund', 0);
  const feeRefundPct = number(input.feeRefundOnReturnPct, 'Fee refund on a refund', 100);
  if (feeRefundPct > 100) throw new Error('Fee refund on a refund must be at most 100%');
  if (partialRefund > sold.revenue + 1e-9) {
    throw new Error('Partial refund cannot exceed the order total');
  }

  const feeRefundRate = feeRefundPct / 100;
  const percentRate = percentFeeRate(sold, paymentFixed);
  const feeCreditOn = (amount) => amount * percentRate * feeRefundRate;

  // A relist at $0 is the piece that came back unsellable: no second sale, no
  // second freight, and the item cost is simply gone.
  const itemResellable = relistPrice > 0;
  const relist = itemResellable ? calculateReverbSale(input, relistPrice) : null;
  const relistNet = itemResellable ? relist.profit : -itemCost;

  const unrefundedFees = sold.fees.total * (1 - feeRefundRate);
  const returnPosition = -(shippingCost + returnShippingCost + otherCost + unrefundedFees) + relistNet;
  const keepPosition = (amount) => sold.profit - amount + feeCreditOn(amount);

  const rows = [
    {
      id: 'sale',
      label: 'Sale stands, no adjustment',
      cashBack: 0,
      itemRecovered: false,
      feeCredit: 0,
      position: sold.profit,
    },
    {
      id: 'partial',
      label: 'Partial refund, they keep it',
      cashBack: partialRefund,
      itemRecovered: false,
      feeCredit: feeCreditOn(partialRefund),
      position: keepPosition(partialRefund),
    },
    {
      id: 'return',
      label: 'Take the return, relist it',
      cashBack: sold.revenue,
      itemRecovered: true,
      feeCredit: sold.fees.total * feeRefundRate,
      position: returnPosition,
    },
    {
      id: 'keepItemFull',
      label: 'Full refund, they keep it',
      cashBack: sold.revenue,
      itemRecovered: false,
      feeCredit: feeCreditOn(sold.revenue),
      position: keepPosition(sold.revenue),
    },
  ].map((row) => ({ ...row, vsReturn: row.position - returnPosition }));

  const maxPosition = Math.max(...rows.map((row) => row.position));
  const leaders = rows.filter((row) => Math.abs(row.position - maxPosition) < 1e-9);

  // The largest concession that still beats shipping it back. Every dollar
  // refunded costs a dollar less the fee credit it earns, so the gap is
  // grossed up by that keep rate.
  const denom = 1 - percentRate * feeRefundRate;
  const breakEvenPartialRefund = denom > 1e-12
    ? Math.max(0, (sold.profit - returnPosition) / denom)
    : Infinity;

  return {
    sold,
    relist,
    itemResellable,
    relistNet,
    relistPrice,
    partialRefund,
    returnShippingCost,
    feeRefundOnReturnPct: feeRefundPct,
    unrefundedFees,
    percentFeeRate: percentRate,
    freightOnReturnPath: shippingCost + returnShippingCost + (itemResellable ? shippingCost : 0),
    relistHaircut: sold.profit - relistNet,
    returnPosition,
    partialPosition: rows[1].position,
    saleStandsPosition: sold.profit,
    costOfTakingTheReturn: sold.profit - returnPosition,
    breakEvenPartialRefund,
    breakEvenRefundCappedByOrder: breakEvenPartialRefund > sold.revenue,
    rows,
    winner: leaders.length === 1 ? leaders[0].id : 'tie',
  };
}

export function returnResolutionNote(comparison) {
  const money = (value) => {
    const text = `$${Math.abs(Number(value)).toFixed(2)}`;
    return Number(value) < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const capped = comparison.breakEvenRefundCappedByOrder;
  const ceiling = capped
    ? `Even refunding the whole ${money(comparison.sold.revenue)} order and letting them keep it beats the return on these inputs.`
    : `Any partial refund up to ${money(comparison.breakEvenPartialRefund)} leaves more than taking it back.`;
  const unsellable = comparison.itemResellable
    ? ''
    : ' The relist price is $0, so the return is priced as a piece that comes back unsellable.';

  if (comparison.costOfTakingTheReturn > 1e-9) {
    // Two legs when nothing goes back out, three when it is relisted.
    const legs = comparison.itemResellable ? 'three legs' : 'two legs';
    return `Taking the return costs ${money(comparison.costOfTakingTheReturn)} against letting the sale stand — ${money(comparison.freightOnReturnPath)} of freight over ${legs}, ${money(comparison.unrefundedFees)} of fees no refund gives back, and ${money(comparison.relistHaircut)} given up on the relist. ${ceiling}${unsellable}`;
  }
  if (comparison.costOfTakingTheReturn < -1e-9) {
    return `Taking the return leaves ${money(-comparison.costOfTakingTheReturn)} more than letting the sale stand on these inputs — the relist is worth more than the original sale after the refund credits. No partial refund is cheaper than shipping it back.${unsellable}`;
  }
  return `Taking the return and letting the sale stand leave the same cash on these inputs.${unsellable}`;
}

// Typical Reverb bump when the seller has not typed one. A $0 bump makes the
// four-row table collapse to "same sale twice"; the illustration is the
// cash a bump costs, not a claim about Reverb's current bump prices.
export const ILLUSTRATED_BUMP_DEFAULT = 3;

function keepRateOnItem(input) {
  const marketplaceRate = number(input.marketplaceRate, 'Reverb marketplace rate', 5);
  const paymentRate = number(input.paymentRate, 'Payment rate', 2.9);
  const givesRate = number(input.givesRate, 'Reverb Gives rate', 0);
  const keepRate = 1 - marketplaceRate / 100 - paymentRate / 100 - givesRate / 100;
  if (keepRate <= 0) throw new Error('Combined percentage fees must stay below 100%');
  return keepRate;
}

function illustratedBumpFee(input) {
  const typed = number(input.bumpFee, 'Bump fee on this listing', 0);
  return typed > 0 ? typed : ILLUSTRATED_BUMP_DEFAULT;
}

// Same offer and same list, with and without a bump. A bump is a fixed cash
// out of this sale — it never pays on the same price. It only pays if it
// changes the price you take (list instead of the offer, or a higher offer).
export function compareBump(input) {
  const listPrice = number(input.price, 'List price');
  const offerPrice = number(input.offerPrice, 'Offer price', listPrice);
  const bump = illustratedBumpFee(input);
  const noBump = { ...input, bumpFee: 0 };
  const withBump = { ...input, bumpFee: bump };
  const offerNoBump = calculateReverbSale(noBump, offerPrice);
  const offerWithBump = calculateReverbSale(withBump, offerPrice);
  const listNoBump = calculateReverbSale(noBump, listPrice);
  const listWithBump = calculateReverbSale(withBump, listPrice);
  const extraSaleToCoverBump = bump / keepRateOnItem(input);
  const rows = [
    { id: 'offerNoBump', label: 'Take the offer, no bump', sale: offerNoBump },
    { id: 'offerWithBump', label: 'Take the offer, pay the bump', sale: offerWithBump },
    { id: 'listNoBump', label: 'Sell at list, no bump', sale: listNoBump },
    { id: 'listWithBump', label: 'Sell at list, pay the bump', sale: listWithBump },
  ].map((row) => ({
    ...row,
    vsOfferNoBump: row.sale.profit - offerNoBump.profit,
  }));
  const maxProfit = Math.max(...rows.map((row) => row.sale.profit));
  const leaders = rows.filter((row) => Math.abs(row.sale.profit - maxProfit) < 1e-9);
  return {
    bump,
    usedTypedBump: number(input.bumpFee, 'Bump fee on this listing', 0) > 0,
    offerNoBump,
    offerWithBump,
    listNoBump,
    listWithBump,
    extraSaleToCoverBump,
    offerThatCoversBump: offerPrice + extraSaleToCoverBump,
    listThatCoversBump: listPrice + extraSaleToCoverBump,
    bumpPaysIfYouReachList: listWithBump.profit > offerNoBump.profit,
    cashBumpSavesVsOfferIfYouReachList: listWithBump.profit - offerNoBump.profit,
    rows,
    winner: leaders.length === 1 ? leaders[0].id : 'tie',
  };
}
