/**
 * Depreciation recapture and capital gains on the sale of a rental or other
 * investment property, as a deterministic module.
 *
 * A landlord who has depreciated a property for years learns two things
 * only when they try to sell, usually too late to plan around either:
 *
 * 1. **Depreciation is not free -- it is a loan from the IRS.** Every dollar
 *    of depreciation claimed while renting the property lowers the
 *    property's cost basis, which raises the taxable gain by the same
 *    amount when it sells. IRC Section 1250 then taxes that portion of the
 *    gain -- "unrecaptured Section 1250 gain" -- at ordinary rates, capped
 *    at 25%, not at the seller's usual long-term capital-gains rate. A
 *    seller who only budgets for capital-gains tax on the price-minus-cost
 *    difference is routinely surprised by a bill thousands of dollars
 *    higher than expected.
 * 2. **A 1031 like-kind exchange defers this, but only the part that stays
 *    invested.** Any cash or debt relief the seller actually pockets from
 *    the exchange ("boot") is taxed immediately, in the same order as an
 *    outright sale -- recapture first, then ordinary long-term gain.
 *
 * This module computes both: the tax on an outright sale, split into its
 * two components, and the tax on a 1031 exchange's boot, so the deferred
 * amount is not a guess.
 *
 * Every input is a number the seller already has from their own purchase
 * settlement statement, depreciation schedule (IRS Form 4562 / Schedule E),
 * and sale settlement statement -- nothing here is scraped, estimated from
 * an address, or looked up on the seller's behalf. This produces a planning
 * estimate to verify with a CPA before closing, never a filed amount.
 */

export const LTCG_BRACKETS = Object.freeze([
  { rate: 0, label: '0%' },
  { rate: 0.15, label: '15%' },
  { rate: 0.2, label: '20%' },
]);

// Section 1250 caps the rate on unrecaptured gain at 25% regardless of the
// seller's ordinary bracket, but never taxes it *above* that seller's own
// ordinary marginal rate if that rate happens to be lower (a seller whose
// top ordinary bracket is, say, 12% pays 12% on this portion, not 25%).
export const MAX_RECAPTURE_RATE = 0.25;

// The statutory NIIT rate (IRC Section 1411). This module applies it to the
// *entire* recognized gain when the checkbox is set, which is a
// simplification: the real rule taxes the lesser of net investment income
// or the amount MAGI exceeds the filer's threshold ($200,000 single /
// $250,000 married filing jointly, not inflation-adjusted). See the
// `niit-simplified` finding, which fires whenever the checkbox is set, so
// this tool cannot be mistaken for having applied the MAGI-threshold test.
export const NIIT_RATE = 0.038;

export const DEFAULTS = Object.freeze({
  purchasePrice: 300000,
  landValue: 60000,
  improvements: 20000,
  depreciationTaken: 87000,
  sellingPrice: 420000,
  sellingCosts: 25000,
  mortgagePayoff: 0,
  ltcgRate: 0.15,
  ordinaryRateCap: '',
  includeNiit: false,
  exchangeBoot: 0,
});

function num(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The recapture rate actually applied: capped at 25% by statute, and
 * further capped at the seller's own ordinary marginal rate when they
 * supply one lower than 25% -- Section 1250 recapture is never taxed above
 * a seller's true ordinary rate, only below-or-equal to 25%.
 */
export function recaptureRate(ordinaryRateCap) {
  const supplied = ordinaryRateCap === '' || ordinaryRateCap === null || ordinaryRateCap === undefined
    ? null
    : num(ordinaryRateCap, null);
  if (supplied === null || !Number.isFinite(supplied) || supplied < 0) return MAX_RECAPTURE_RATE;
  return Math.min(MAX_RECAPTURE_RATE, supplied);
}

/**
 * Splits a recognized gain into its two IRS-taxed components. Shared by the
 * outright-sale path and the 1031-boot path, because both tax a recognized
 * gain in the same order: recapture first (it cannot exceed the
 * depreciation actually taken, nor the gain itself), the remainder at the
 * seller's long-term capital-gains rate.
 */
export function splitGain(recognizedGain, depreciationTaken) {
  const gain = Math.max(0, recognizedGain);
  const depreciation = Math.max(0, depreciationTaken);
  const unrecapturedSection1250Gain = Math.min(gain, depreciation);
  const remainingGain = gain - unrecapturedSection1250Gain;
  return { unrecapturedSection1250Gain, remainingGain };
}

export function analyzeSale(rawInputs = {}) {
  const inputs = { ...DEFAULTS, ...rawInputs };
  const purchasePrice = num(inputs.purchasePrice);
  const landValue = num(inputs.landValue);
  const improvements = num(inputs.improvements);
  const depreciationTaken = Math.max(0, num(inputs.depreciationTaken));
  const sellingPrice = num(inputs.sellingPrice);
  const sellingCosts = num(inputs.sellingCosts);
  const mortgagePayoff = num(inputs.mortgagePayoff);
  const ltcgRate = num(inputs.ltcgRate, DEFAULTS.ltcgRate);
  const includeNiit = Boolean(inputs.includeNiit);
  const exchangeBoot = Math.max(0, num(inputs.exchangeBoot));
  const appliedRecaptureRate = recaptureRate(inputs.ordinaryRateCap);

  const findings = [];

  // The depreciable basis (building only -- land is never depreciable) is
  // context for the findings below, not an input to the gain arithmetic:
  // the gain formula only needs the total adjusted basis, and the
  // depreciation actually taken is supplied directly rather than
  // re-derived from a depreciation schedule this tool does not model.
  const depreciableBasis = Math.max(0, purchasePrice - landValue);
  if (landValue > purchasePrice) {
    findings.push({
      severity: 'high',
      title: 'Land value exceeds the purchase price',
      detail: 'Land value cannot be more than the total purchase price. Check the split between land and building on the original purchase settlement statement or property tax assessment.',
    });
  }

  const adjustedBasis = purchasePrice + improvements - depreciationTaken;
  const amountRealized = sellingPrice - sellingCosts;
  const totalGain = amountRealized - adjustedBasis;

  if (totalGain <= 0) {
    findings.push({
      severity: 'info',
      title: 'This sale shows a loss, not a gain',
      detail: 'Depreciation recapture only applies to a gain. A loss on rental property is a Section 1231 loss, which has its own rules (it can offset ordinary income, subject to the five-year look-back "unrecapture" rule) that this tool does not model -- a tax professional can size the actual benefit.',
    });
  }

  if (depreciationTaken > 0 && totalGain > 0 && depreciationTaken > totalGain) {
    findings.push({
      severity: 'medium',
      title: 'Depreciation taken exceeds the total gain',
      detail: 'The recapture portion below is capped at the total gain -- you cannot recapture more than you actually gained, even if you claimed more depreciation than that over the holding period.',
    });
  }

  const { unrecapturedSection1250Gain, remainingGain } = splitGain(totalGain, depreciationTaken);

  const recaptureTax = round2(unrecapturedSection1250Gain * appliedRecaptureRate);
  const ltcgTax = round2(remainingGain * ltcgRate);
  const niitTax = includeNiit ? round2(Math.max(0, totalGain) * NIIT_RATE) : 0;
  const totalTax = round2(recaptureTax + ltcgTax + niitTax);

  if (includeNiit) {
    findings.push({
      severity: 'medium',
      title: 'Net Investment Income Tax is simplified here',
      detail: 'This applies the 3.8% NIIT rate to the entire recognized gain. The actual rule taxes only the lesser of your net investment income or the amount your modified AGI exceeds $200,000 (single) / $250,000 (married filing jointly) -- not inflation-adjusted. If your MAGI is close to that threshold, the real NIIT owed may be smaller than shown.',
    });
  }

  if (appliedRecaptureRate >= MAX_RECAPTURE_RATE) {
    findings.push({
      severity: 'info',
      title: 'Recapture assumed at the 25% statutory cap',
      detail: 'Unrecaptured Section 1250 gain is taxed at your ordinary income rate, capped at 25% -- never higher. If your ordinary marginal rate is below 25%, enter it in the advanced field to use that lower rate instead.',
    });
  }

  findings.push({
    severity: 'info',
    title: 'State tax is not included',
    detail: 'Only federal depreciation recapture, capital-gains tax, and NIIT are estimated here. Most states tax this gain too, often as ordinary income with no capital-gains discount -- check your state’s own rules or a tax professional for the total bill.',
  });

  const netProceeds = round2(amountRealized - totalTax);
  const netProceedsAfterMortgage = round2(netProceeds - mortgagePayoff);

  // --- 1031 like-kind exchange comparison ---
  // A fully qualifying exchange (equal-or-greater value reinvested, no cash
  // or debt relief taken out) defers the entire gain: nothing is
  // recognized, so nothing is taxed today. "Boot" -- any cash received or
  // net debt relief -- breaks that deferral for exactly the boot amount,
  // recognized in the same recapture-then-capital-gains order as an
  // outright sale, and never more than the total gain itself.
  const recognizedGain = Math.min(Math.max(0, totalGain), exchangeBoot);
  const exchangeSplit = splitGain(recognizedGain, depreciationTaken);
  const exchangeRecaptureTax = round2(exchangeSplit.unrecapturedSection1250Gain * appliedRecaptureRate);
  const exchangeLtcgTax = round2(exchangeSplit.remainingGain * ltcgRate);
  const exchangeNiitTax = includeNiit ? round2(recognizedGain * NIIT_RATE) : 0;
  const exchangeTaxDue = round2(exchangeRecaptureTax + exchangeLtcgTax + exchangeNiitTax);
  const deferredGain = round2(Math.max(0, totalGain) - recognizedGain);
  const taxDeferred = round2(Math.max(0, totalTax - exchangeTaxDue));

  if (exchangeBoot > 0 && totalGain > 0) {
    findings.push({
      severity: 'info',
      title: '1031 exchange figures assume a qualifying like-kind exchange',
      detail: 'A valid Section 1031 exchange has strict timing rules (identify a replacement property within 45 days, close within 180 days) and must run through a qualified intermediary who holds the sale proceeds -- you cannot receive them directly and still defer. This estimates the tax on the boot only; it is not a determination that a specific exchange qualifies.',
    });
  }

  return {
    inputs: { purchasePrice, landValue, improvements, depreciationTaken, sellingPrice, sellingCosts, mortgagePayoff, ltcgRate, includeNiit, exchangeBoot },
    depreciableBasis: round2(depreciableBasis),
    adjustedBasis: round2(adjustedBasis),
    amountRealized: round2(amountRealized),
    totalGain: round2(totalGain),
    unrecapturedSection1250Gain: round2(unrecapturedSection1250Gain),
    remainingGain: round2(remainingGain),
    appliedRecaptureRate,
    recaptureTax,
    ltcgTax,
    niitTax,
    totalTax,
    netProceeds,
    netProceedsAfterMortgage,
    exchange: {
      exchangeBoot: round2(exchangeBoot),
      recognizedGain: round2(recognizedGain),
      deferredGain,
      taxDue: exchangeTaxDue,
      taxDeferred,
    },
    findings,
  };
}
