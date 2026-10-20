// State-level transfer-tax starting points for the seller net sheet.
//
// Each rate is the statewide tax a seller customarily pays, as a percent of
// sale price, so the "Transfer tax (%)" field starts somewhere closer than one
// California number for every state. It is a starting point to edit, not a
// quote: cities and counties add their own taxes, graduated schedules and
// exemptions exist, and who pays is negotiable. States with graduated or
// buyer-side taxes this file cannot state in one number are left out on
// purpose rather than guessed; the title company's figure always wins.

export const TRANSFER_TAX_STATES = Object.freeze({
  AK: { name: "Alaska", rate: 0, note: "No statewide transfer tax." },
  AZ: { name: "Arizona", rate: 0, note: "No transfer tax; a small affidavit fee is part of recording." },
  CA: { name: "California", rate: 0.11, note: "County documentary transfer tax, $1.10 per $1,000. Some cities (for example Los Angeles, San Francisco, Oakland) add their own, which can be several times higher." },
  CO: { name: "Colorado", rate: 0.01, note: "Documentary fee, $0.01 per $100." },
  FL: { name: "Florida", rate: 0.7, note: "Documentary stamp tax on the deed, $0.70 per $100, customarily paid by the seller. Miami-Dade County uses a different rate." },
  GA: { name: "Georgia", rate: 0.1, note: "Transfer tax, $1 per $1,000." },
  ID: { name: "Idaho", rate: 0, note: "No transfer tax." },
  IL: { name: "Illinois", rate: 0.15, note: "State $0.50 per $500 plus county $0.25 per $500. Chicago and some other municipalities add more." },
  IN: { name: "Indiana", rate: 0, note: "No transfer tax." },
  KS: { name: "Kansas", rate: 0, note: "No transfer tax." },
  MA: { name: "Massachusetts", rate: 0.456, note: "Deed excise stamps, $4.56 per $1,000." },
  MN: { name: "Minnesota", rate: 0.33, note: "State deed tax, 0.33% of the price." },
  MO: { name: "Missouri", rate: 0, note: "No transfer tax." },
  NC: { name: "North Carolina", rate: 0.2, note: "Excise tax, $2 per $1,000." },
  NY: { name: "New York", rate: 0.4, note: "State transfer tax, $2 per $500, paid by the seller. New York City, Yonkers and some other places add a city tax, and the buyer owes the mansion tax on high-priced purchases." },
  OR: { name: "Oregon", rate: 0, note: "No statewide transfer tax. Washington County charges a small one." },
  PA: { name: "Pennsylvania", rate: 1, note: "State 1% plus local 1%, customarily split between buyer and seller, so the seller's half is 1%. Some cities charge more and the split is negotiable." },
  SC: { name: "South Carolina", rate: 0.37, note: "Deed recording fee, $1.85 per $500 (state plus county)." },
  TX: { name: "Texas", rate: 0, note: "No transfer tax." },
  UT: { name: "Utah", rate: 0, note: "No transfer tax." },
  VA: { name: "Virginia", rate: 0.1, note: "Grantor's tax, $0.50 per $500, paid by the seller. Some regions add a regional or recordation surcharge." },
});

export const TRANSFER_TAX_STATE_CODES = Object.freeze(Object.keys(TRANSFER_TAX_STATES));

/** Percent of sale price a seller would start with in `code`, or throws. */
export function transferTaxRateForState(code) {
  const state = TRANSFER_TAX_STATES[String(code ?? "").toUpperCase()];
  if (!state) throw new Error(`No transfer-tax starting point for state: ${code}`);
  return state.rate;
}

/** Dollars at `rate`% of `salePrice`, for the reference page's example column. */
export function transferTaxOn(salePrice, code) {
  const price = Number(salePrice);
  if (!Number.isFinite(price) || price < 0) throw new Error("Sale price must be a non-negative number");
  return (price * transferTaxRateForState(code)) / 100;
}
