// Pure seller-net-sheet arithmetic. No network, no state.
//
// After the NAR settlement, buyer-broker compensation is a negotiated seller
// concession (or a buyer-paid amount), not an automatic split of "the
// commission." A higher offer that asks for 2.5% buyer-broker pay plus closing
// help can leave the seller with less cash than a cleaner, lower offer. This
// file keeps those lines separate so the comparison is visible.
//
// Every rate is an input. The result is a transparent worksheet the seller or
// listing agent can check against a title/escrow estimate — not a closing
// disclosure, a tax opinion, or advice about what anyone should accept.

export const COMMISSION_PRESETS = Object.freeze({
  listing_only: {
    label: "Listing 2.5%, no buyer-broker offer",
    listingRate: 2.5,
    buyerBrokerRate: 0,
  },
  traditional_restated: {
    label: "2.5% listing + 2.5% buyer-broker (old 5% restated)",
    listingRate: 2.5,
    buyerBrokerRate: 2.5,
  },
  six_percent_restated: {
    label: "3% listing + 3% buyer-broker (old 6% restated)",
    listingRate: 3,
    buyerBrokerRate: 3,
  },
  flat_listing: {
    label: "Flat listing fee, no buyer-broker offer",
    listingRate: 0,
    buyerBrokerRate: 0,
    listingFlat: 4000,
  },
});

function number(value, name, { min = 0, allowZero = true } = {}) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function moneyLine(ratePercent, flat, base, name) {
  const rate = number(ratePercent, `${name} rate`);
  const cash = number(flat, `${name} flat`);
  if (rate > 100) throw new Error(`${name} rate must be at most 100%`);
  return {
    rate,
    flat: cash,
    amount: base * (rate / 100) + cash,
  };
}

/**
 * Estimate a property-tax proration the seller would credit at close.
 * This is a day-count helper only. Who owes what depends on whether taxes
 * are paid in arrears or in advance, and on the local custom — the title
 * company has the real figure.
 */
export function estimateTaxProration({ annualTax, daysChargedToSeller }) {
  const tax = number(annualTax, "Annual property tax");
  const days = number(daysChargedToSeller, "Days charged to seller");
  return tax * (days / 365);
}

export function applyCommissionPreset(input, presetId) {
  const preset = COMMISSION_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown commission preset: ${presetId}`);
  return {
    ...input,
    listingRate: preset.listingRate,
    buyerBrokerRate: preset.buyerBrokerRate,
    listingFlat: preset.listingFlat ?? input.listingFlat ?? 0,
  };
}

function lineItems(salePrice, input) {
  const listing = moneyLine(input.listingRate, input.listingFlat, salePrice, "Listing broker");
  const buyerBroker = moneyLine(
    input.buyerBrokerRate,
    input.buyerBrokerFlat,
    salePrice,
    "Buyer-broker compensation",
  );
  const concession = moneyLine(
    input.concessionRate,
    input.concessionFlat,
    salePrice,
    "Seller concession",
  );
  const title = moneyLine(input.titleRate, input.titleFlat, salePrice, "Title / escrow");
  const transferTax = moneyLine(
    input.transferTaxRate,
    input.transferTaxFlat,
    salePrice,
    "Transfer tax",
  );

  const recording = number(input.recording, "Recording fees");
  const hoa = number(input.hoaFees, "HOA / resale fees");
  const homeWarranty = number(input.homeWarranty, "Home warranty");
  const repairs = number(input.repairsCredits, "Repair credits");
  const taxProration = number(input.taxProration, "Tax proration");
  const otherClosing = number(input.otherClosing, "Other closing costs");
  const prepCash = number(input.prepCash, "Prep / staging cash");
  const loanPayoff = number(input.loanPayoff, "Loan payoff");

  return {
    listing,
    buyerBroker,
    concession,
    title,
    transferTax,
    recording,
    hoa,
    homeWarranty,
    repairs,
    taxProration,
    otherClosing,
    prepCash,
    loanPayoff,
  };
}

function variableRatePercent(items) {
  return (
    items.listing.rate +
    items.buyerBroker.rate +
    items.concession.rate +
    items.title.rate +
    items.transferTax.rate
  );
}

function fixedSellingCosts(items) {
  return (
    items.listing.flat +
    items.buyerBroker.flat +
    items.concession.flat +
    items.title.flat +
    items.transferTax.flat +
    items.recording +
    items.hoa +
    items.homeWarranty +
    items.repairs +
    items.taxProration +
    items.otherClosing +
    items.prepCash
  );
}

/**
 * Cash a seller would take home from one offer, given the costs they entered.
 *
 * @param {object} input
 * @param {number} input.salePrice
 * @param {number} [input.loanPayoff]
 * @param {number} [input.listingRate]           Listing broker, % of sale price
 * @param {number} [input.listingFlat]
 * @param {number} [input.buyerBrokerRate]       Optional seller-paid buyer-broker %
 * @param {number} [input.buyerBrokerFlat]
 * @param {number} [input.concessionRate]        Other seller concessions, %
 * @param {number} [input.concessionFlat]        Other seller concessions, $
 * @param {number} [input.titleRate]
 * @param {number} [input.titleFlat]
 * @param {number} [input.transferTaxRate]
 * @param {number} [input.transferTaxFlat]
 * @param {number} [input.recording]
 * @param {number} [input.hoaFees]
 * @param {number} [input.homeWarranty]
 * @param {number} [input.repairsCredits]
 * @param {number} [input.taxProration]
 * @param {number} [input.otherClosing]
 * @param {number} [input.prepCash]              Cash spent before close (staging)
 * @param {number} [input.targetNet]             Optional: solve for the sale price
 */
export function calculateNetSheet(input = {}) {
  const salePrice = number(input.salePrice, "Sale price");
  const items = lineItems(salePrice, input);

  const sellingCosts =
    items.listing.amount +
    items.buyerBroker.amount +
    items.concession.amount +
    items.title.amount +
    items.transferTax.amount +
    items.recording +
    items.hoa +
    items.homeWarranty +
    items.repairs +
    items.taxProration +
    items.otherClosing +
    items.prepCash;

  const net = salePrice - items.loanPayoff - sellingCosts;
  const costOfSaleRate = salePrice === 0 ? 0 : (sellingCosts / salePrice) * 100;
  const targetNet =
    input.targetNet === undefined || input.targetNet === null || input.targetNet === ""
      ? null
      : number(input.targetNet, "Target net");

  return {
    salePrice,
    loanPayoff: items.loanPayoff,
    items,
    sellingCosts,
    net,
    costOfSaleRate,
    targetNet,
    salePriceForTarget: targetNet === null ? null : salePriceForTargetNet({ ...input, targetNet }),
  };
}

/**
 * Sale price that produces a chosen net, holding every other input fixed.
 * Percentage costs scale with price; flat costs and the loan payoff do not.
 */
export function salePriceForTargetNet(input = {}) {
  const targetNet = number(input.targetNet, "Target net");
  const items = lineItems(0, input);
  const rate = variableRatePercent(items) / 100;
  if (rate >= 1) {
    return { salePrice: Infinity, reachable: false, variableRatePercent: rate * 100 };
  }
  const fixed = items.loanPayoff + fixedSellingCosts(items);
  const salePrice = (targetNet + fixed) / (1 - rate);
  return {
    salePrice,
    reachable: true,
    variableRatePercent: rate * 100,
    fixedCosts: fixed,
  };
}

/**
 * Compare two offers that share the same loan payoff and the same closing-cost
 * structure, but can differ on price, buyer-broker compensation, and other
 * seller concessions. That is the comparison a listing agent actually makes
 * after NAR: the higher number on the offer sheet is not always more cash.
 */
export function compareOffers(shared = {}, offerA = {}, offerB = {}) {
  const a = calculateNetSheet({ ...shared, ...offerA });
  const b = calculateNetSheet({ ...shared, ...offerB });
  const delta = a.net - b.net;
  return {
    a,
    b,
    delta,
    better: delta > 0 ? "a" : delta < 0 ? "b" : "tie",
    priceGap: a.salePrice - b.salePrice,
  };
}

/**
 * Net to the seller across a grid of prices (rows) and buyer-broker rates
 * (columns), everything else held fixed. Answers "what does each half point I
 * concede cost me at this price" without re-typing the sheet.
 */
export function netGrid(input = {}, { prices, buyerRates } = {}) {
  const base = number(input.salePrice, "Sale price");
  const priceList = prices ?? [-2, -1, 0, 1, 2].map((pct) => Math.round(base * (1 + pct / 100)));
  const rateList = buyerRates ?? [0, 1, 2, 2.5, 3];
  const rows = priceList.map((salePrice) => ({
    salePrice,
    nets: rateList.map(
      (buyerBrokerRate) =>
        calculateNetSheet({ ...input, salePrice, buyerBrokerRate, targetNet: undefined }).net,
    ),
  }));
  return { buyerRates: rateList, rows };
}

/**
 * The most Offer A can ask for buyer-broker compensation (as % of its price,
 * flat amount unchanged) and still leave the seller as much cash as Offer B.
 * Net is linear in that rate, so this is exact. A negative result means A
 * trails B even with no buyer-broker pay at all.
 */
export function breakEvenBuyerBrokerRate(shared = {}, offerA = {}, offerB = {}) {
  const { a, b } = compareOffers(shared, offerA, offerB);
  if (a.salePrice === 0) return { rate: null, askedRate: a.items.buyerBroker.rate, headroom: null };
  const askedRate = a.items.buyerBroker.rate;
  const rate = askedRate + ((a.net - b.net) * 100) / a.salePrice;
  return { rate, askedRate, headroom: rate - askedRate };
}

/**
 * Rank several offers on what the seller can expect to hold, not only on the
 * cash each would leave if it closed.
 *
 * Two things the net sheet cannot see, both typed in by the seller:
 *   - days to close, priced at what it costs to own the house per day
 *     (mortgage interest, taxes, insurance, utilities);
 *   - the chance the offer falls through (financing, appraisal, inspection or
 *     sale-of-buyer's-home contingencies). A failed deal sends the seller back
 *     to a fallback sale (price they choose, default the lowest offer) that
 *     closes `fallbackDays` later, after the days already spent.
 *
 * expected = (1 - p) * (net - carry * days)
 *          + p * (fallbackNet - carry * (days + fallbackDays))
 *
 * The chances are the seller's own judgement, not statistics: the tool ships
 * no default. Net is linear in p, so the break-even chance is exact.
 */
export function rankOffers(shared = {}, offers = [], options = {}) {
  if (!Array.isArray(offers) || offers.length === 0) throw new Error("Add at least one offer");
  if (offers.length > 12) throw new Error("Compare at most 12 offers at a time");
  const carryPerDay = number(options.carryPerDay, "Carrying cost per day");
  const fallbackDays = number(options.fallbackDays, "Days to a fallback sale");
  const sheets = offers.map((offer, index) => {
    const fallThroughPct = number(offer.fallThroughPct, `Offer ${index + 1} fall-through chance`);
    if (fallThroughPct > 100) throw new Error(`Offer ${index + 1} fall-through chance must be at most 100%`);
    const days = number(offer.daysToClose, `Offer ${index + 1} days to close`);
    const sheet = calculateNetSheet({ ...shared, ...offer, targetNet: undefined });
    return { label: offer.label || `Offer ${index + 1}`, index, days, fallThroughPct, sheet };
  });
  const lowest = Math.min(...sheets.map((s) => s.sheet.salePrice));
  const fallbackInput = { ...(options.fallback ?? {}) };
  if (fallbackInput.salePrice === undefined || fallbackInput.salePrice === null || fallbackInput.salePrice === "") {
    fallbackInput.salePrice = lowest;
  }
  const fallbackSheet = calculateNetSheet({ ...shared, ...fallbackInput, targetNet: undefined });
  const rows = sheets.map((s) => {
    const p = s.fallThroughPct / 100;
    const carryToClose = carryPerDay * s.days;
    const ifCloses = s.sheet.net - carryToClose;
    const ifFails = fallbackSheet.net - carryPerDay * (s.days + fallbackDays);
    return {
      label: s.label,
      index: s.index,
      salePrice: s.sheet.salePrice,
      net: s.sheet.net,
      days: s.days,
      fallThroughPct: s.fallThroughPct,
      carryToClose,
      ifCloses,
      ifFails,
      expected: (1 - p) * ifCloses + p * ifFails,
      sheet: s.sheet,
    };
  });
  for (const row of rows) {
    const rivals = rows.filter((r) => r !== row);
    if (rivals.length === 0) {
      row.maxFallThroughPct = null;
      continue;
    }
    const bestRival = Math.max(...rivals.map((r) => r.expected));
    const gap = row.ifCloses - row.ifFails;
    if (row.ifCloses <= bestRival) row.maxFallThroughPct = null;
    else if (gap <= 0) row.maxFallThroughPct = 100;
    else row.maxFallThroughPct = Math.min(100, ((row.ifCloses - bestRival) / gap) * 100);
  }
  const byExpected = [...rows].sort((x, y) => y.expected - x.expected || y.net - x.net || x.index - y.index);
  const topPrice = rows.reduce((best, r) => (r.salePrice > best.salePrice ? r : best), rows[0]);
  const topNet = rows.reduce((best, r) => (r.net > best.net ? r : best), rows[0]);
  const winner = byExpected[0];
  return {
    rows: byExpected,
    fallback: { salePrice: fallbackSheet.salePrice, net: fallbackSheet.net, days: fallbackDays },
    carryPerDay,
    winner,
    topPrice,
    topNet,
    winnerIsTopPrice: winner === topPrice,
    winnerIsTopNet: winner === topNet,
    expectedGapToRunnerUp: byExpected.length > 1 ? winner.expected - byExpected[1].expected : null,
  };
}

export function formatNetSheetSummary(result, { offerLabel = "Offer" } = {}) {
  if (!result) throw new Error("No net sheet to summarize");
  const money = (value) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const { items } = result;
  const lines = [
    `SELLER NET SHEET — ${offerLabel}`,
    "",
    `Sale / offer price: ${money(result.salePrice)}`,
    `Loan payoff: ${money(result.loanPayoff)}`,
    "",
    "SELLING COSTS",
    `- Listing broker (${items.listing.rate}% + ${money(items.listing.flat)}): ${money(items.listing.amount)}`,
    `- Buyer-broker compensation (${items.buyerBroker.rate}% + ${money(items.buyerBroker.flat)}): ${money(items.buyerBroker.amount)}`,
    `- Other seller concessions (${items.concession.rate}% + ${money(items.concession.flat)}): ${money(items.concession.amount)}`,
    `- Title / escrow: ${money(items.title.amount)}`,
    `- Transfer tax: ${money(items.transferTax.amount)}`,
    `- Recording: ${money(items.recording)}`,
    `- HOA / resale: ${money(items.hoa)}`,
    `- Home warranty: ${money(items.homeWarranty)}`,
    `- Repair credits: ${money(items.repairs)}`,
    `- Tax / HOA proration: ${money(items.taxProration)}`,
    `- Other closing costs: ${money(items.otherClosing)}`,
    `- Prep / staging (cash before close): ${money(items.prepCash)}`,
    "",
    `Total selling costs: ${money(result.sellingCosts)} (${result.costOfSaleRate.toFixed(2)}% of price)`,
    `NET TO SELLER: ${money(result.net)}`,
  ];
  if (result.salePriceForTarget && result.salePriceForTarget.reachable) {
    lines.push(
      "",
      `Sale price that hits the entered target net: ${money(result.salePriceForTarget.salePrice)}`,
    );
  }
  lines.push(
    "",
    "Draft worksheet only. Confirm every figure with title/escrow, the lender payoff, and your broker before accepting or countering an offer.",
  );
  return lines.join("\n");
}

export function formatOfferComparison(comparison) {
  const money = (value) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const { a, b, better } = comparison;
  let verdict;
  if (better === "tie") {
    verdict = "Both offers leave the same net on these assumptions.";
  } else {
    // Ground the explanation in the two things that actually move net cash —
    // price and total deductions (loan payoff + selling costs) — instead of
    // inferring "extra concessions" from price direction alone. Net = price -
    // payoff - selling costs, so net - net = priceDiff - deductionDiff exactly;
    // a winner can have BOTH a higher price AND lower costs than the other
    // offer, which the price-direction heuristic could not say.
    const winner = better === "a" ? a : b;
    const loser = better === "a" ? b : a;
    const netDiff = winner.net - loser.net;
    const priceDiff = winner.salePrice - loser.salePrice;
    const deductionDiff = (winner.loanPayoff + winner.sellingCosts) - (loser.loanPayoff + loser.sellingCosts);
    const winnerLabel = better === "a" ? "A" : "B";
    const loserLabel = better === "a" ? "B" : "A";
    const priceNote =
      priceDiff > 0
        ? `a ${money(priceDiff)} higher price`
        : priceDiff < 0
          ? `a ${money(-priceDiff)} lower price`
          : "the same price";
    const costNote =
      deductionDiff < 0
        ? `${money(-deductionDiff)} lower payoff and selling costs`
        : deductionDiff > 0
          ? `${money(deductionDiff)} higher payoff and selling costs`
          : "the same payoff and selling costs";
    verdict = `Offer ${winnerLabel} nets ${money(netDiff)} more, with ${priceNote} and ${costNote} than Offer ${loserLabel}.`;
  }
  return [
    "OFFER COMPARISON — CASH TO SELLER",
    "",
    `Offer A price: ${money(a.salePrice)}  →  net ${money(a.net)}`,
    `Offer B price: ${money(b.salePrice)}  →  net ${money(b.net)}`,
    "",
    verdict,
    "",
    "The higher offer is not always more cash after buyer-broker compensation and seller concessions. Confirm both worksheets with title/escrow before deciding.",
  ].join("\n");
}
