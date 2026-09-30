// Illustrative estimate of what a cost segregation study could be worth on a
// rental or commercial property: extra depreciation in the early years, the tax
// that saves at the owner's bracket, the extra tax on sale, and whether a study
// fee pays back. No network calls. NOT tax advice and NOT an engineering study:
// a real study is done by a qualified engineer or cost segregation firm from the
// property's actual components, and the owner's CPA decides what can be deducted.
//
// Assumptions (stated, not verified for any one return):
//   - Residential rental property: 27.5-year straight line; nonresidential:
//     39-year straight line; both mid-month convention, placed in service in the
//     month the owner enters.
//   - A study reclassifies part of the building basis to 5-year personal
//     property and 15-year land improvements. Those get bonus depreciation at
//     the rate entered (100% by default for property acquired after 19 Jan 2025
//     under the 2025 tax law; 40% / 60% / 80% phase-down rates apply to older
//     acquisitions) and the remainder uses MACRS half-year tables.
//   - Mid-quarter convention, state conformity, AMT and section 179 are ignored.
//   - Recapture on sale is modelled conservatively: reclassified property's
//     depreciation is taxed at the ordinary rate entered, and the building's
//     depreciation at the lesser of that rate and 25%.
//   - Losses the owner cannot use against other income now (passive activity
//     rules) are carried and released in the year of a taxable sale.

export const BONUS_DEFAULT = 1;
export const DISCOUNT_DEFAULT = 0.05;

// Typical reclassification shares of depreciable basis, from published
// industry ranges; a real study can land well outside them.
export const PROPERTY_TYPES = {
  "single-family": { label: "Single-family rental", life: 27.5, five: 0.14, fifteen: 0.05 },
  multifamily: { label: "Multifamily (5+ units)", life: 27.5, five: 0.22, fifteen: 0.08 },
  "short-term-rental": { label: "Short-term rental (furnished)", life: 27.5, five: 0.28, fifteen: 0.07 },
  office: { label: "Office", life: 39, five: 0.18, fifteen: 0.1 },
  retail: { label: "Retail / restaurant", life: 39, five: 0.2, fifteen: 0.12 },
  industrial: { label: "Industrial / self-storage", life: 39, five: 0.1, fifteen: 0.15 },
};

const MACRS_5 = [0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576];
const MACRS_15 = [0.05, 0.095, 0.0855, 0.077, 0.0693, 0.0623, 0.059, 0.059, 0.0591, 0.059, 0.0591, 0.059, 0.0591, 0.059, 0.0591, 0.0295];

export function money(n) {
  const value = Math.round(Number(n) || 0);
  const text = `$${Math.abs(value).toLocaleString("en-US")}`;
  return value < 0 ? `-${text}` : text;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Straight-line, mid-month: year-1 months = (12 - month) + 0.5.
export function straightLineSchedule(basis, life, month, years) {
  const rows = [];
  const annual = basis / life;
  let remaining = basis;
  for (let y = 1; y <= years; y++) {
    const dep = y === 1 ? annual * ((12 - month + 0.5) / 12) : Math.min(annual, remaining);
    const d = Math.max(0, Math.min(dep, remaining));
    rows.push(d);
    remaining -= d;
  }
  return rows;
}

function tableSchedule(basis, table, years) {
  return Array.from({ length: years }, (_, i) => basis * (table[i] || 0));
}

export function costSegEstimate(input = {}) {
  const price = Math.max(0, num(input.price));
  const landShare = clamp(num(input.landShare, 0.2), 0, 0.95);
  const type = PROPERTY_TYPES[input.propertyType] || PROPERTY_TYPES["multifamily"];
  const life = input.life === 27.5 || input.life === 39 ? input.life : type.life;
  const fiveShare = clamp(num(input.fiveShare, type.five), 0, 0.9);
  const fifteenShare = clamp(num(input.fifteenShare, type.fifteen), 0, 0.9);
  const month = Math.round(clamp(num(input.month, 1), 1, 12));
  const bracket = clamp(num(input.bracket, 0.35), 0, 0.6);
  const bonus = clamp(num(input.bonus, BONUS_DEFAULT), 0, 1);
  const fee = Math.max(0, num(input.fee, 0));
  const hold = Math.round(clamp(num(input.holdYears, 10), 1, 40));
  const usable = clamp(num(input.usableShare, 1), 0, 1);
  const discount = clamp(num(input.discount, DISCOUNT_DEFAULT), 0, 0.25);
  const deferRecapture = Boolean(input.deferRecapture);

  const basis = price * (1 - landShare);
  const scale = fiveShare + fifteenShare > 0.95 ? 0.95 / (fiveShare + fifteenShare) : 1;
  const five = basis * fiveShare * scale;
  const fifteen = basis * fifteenShare * scale;
  const building = basis - five - fifteen;

  const baselineRows = straightLineSchedule(basis, life, month, hold);
  const bonusFive = five * bonus, bonusFifteen = fifteen * bonus;
  const s5 = tableSchedule(five - bonusFive, MACRS_5, hold);
  const s15 = tableSchedule(fifteen - bonusFifteen, MACRS_15, hold);
  const sb = straightLineSchedule(building, life, month, hold);
  const segRows = Array.from({ length: hold }, (_, i) =>
    (i === 0 ? bonusFive + bonusFifteen : 0) + s5[i] + s15[i] + sb[i]);

  const rows = [];
  let suspended = 0, cumBase = 0, cumSeg = 0, cumSaved = 0, pvSaved = 0;
  for (let i = 0; i < hold; i++) {
    const extra = segRows[i] - baselineRows[i];
    cumBase += baselineRows[i];
    cumSeg += segRows[i];
    // Extra deduction (positive early, negative later) usable now vs carried.
    const now = extra >= 0 ? extra * usable : extra;
    suspended += extra >= 0 ? extra - now : 0;
    let saved = now * bracket;
    // Later years give back deduction; absorb it from the carried balance first.
    if (extra < 0 && suspended > 0) {
      const absorb = Math.min(suspended, -extra);
      suspended -= absorb;
      saved = (now + absorb) * bracket;
    }
    cumSaved += saved;
    pvSaved += saved / (1 + discount) ** (i + 1);
    rows.push({ year: i + 1, baseline: baselineRows[i], costSeg: segRows[i], extra, taxSaved: saved, cumTaxSaved: cumSaved });
  }
  const releasedAtSale = deferRecapture ? 0 : suspended * bracket;
  const releasedPV = releasedAtSale / (1 + discount) ** hold;

  const acceleratedDep = Math.min(cumSeg, five + fifteen + building);
  const recaptureRate = Math.min(bracket, 0.25);
  const sumTo = (a, n) => a.slice(0, n).reduce((s, v) => s + v, 0);
  const segOrdinary = sumTo(s5, hold) + sumTo(s15, hold) + (five + fifteen ? (bonusFive + bonusFifteen) : 0);
  const segBuilding = sumTo(sb, hold);
  const recaptureSeg = deferRecapture ? 0 : segOrdinary * bracket + segBuilding * recaptureRate;
  const recaptureBase = deferRecapture ? 0 : cumBase * recaptureRate;
  const extraRecapture = recaptureSeg - recaptureBase;
  const extraRecapturePV = extraRecapture / (1 + discount) ** hold;

  const netUndiscounted = cumSaved + releasedAtSale - extraRecapture - fee;
  const netPV = pvSaved + releasedPV - extraRecapturePV - fee;
  const year1Extra = rows[0] ? rows[0].extra : 0;
  const year1Saved = rows[0] ? rows[0].taxSaved : 0;

  // First year cumulative tax saved reaches the fee.
  let paybackYear = null;
  for (const r of rows) if (r.cumTaxSaved >= fee && fee > 0) { paybackYear = r.year; break; }
  if (fee === 0) paybackYear = 1;

  const findings = [];
  if (basis <= 0) {
    findings.push({ severity: "high", title: "Enter a purchase price", detail: "There is no depreciable basis yet. Enter the purchase or construction cost and the land share." });
  }
  if (basis > 0 && basis < 400_000) {
    findings.push({ severity: "medium", title: "Small basis: fees can eat the benefit", detail: `A depreciable basis of ${money(basis)} is at the small end for a full engineered study. Ask about a lower-cost estimate or compare the fee below with year-one savings.` });
  }
  if (fee > 0 && year1Saved > 0 && fee > year1Saved) {
    findings.push({ severity: "medium", title: "Fee exceeds the first-year tax saved", detail: `The fee of ${money(fee)} is larger than year-one tax saved of ${money(year1Saved)}; it pays back in ${paybackYear ? `year ${paybackYear}` : "no year within your hold period"}.` });
  }
  if (usable < 1 && year1Extra > 0) {
    findings.push({ severity: "high", title: "Passive loss rules may defer the deduction", detail: `Only ${Math.round(usable * 100)}% of the extra deduction is assumed usable now. The rest (${money(suspended)} still carried at the end of the hold) is released only against passive income or on a taxable sale. Real estate professional status or the short-term-rental rules can change this; ask your CPA.` });
  }
  if (hold < 5 && !deferRecapture) {
    findings.push({ severity: "medium", title: "Short hold period", detail: "Selling within a few years gives much of the benefit back as recapture taxed at ordinary rates. Compare the net figure, not just year one." });
  }
  if (deferRecapture) {
    findings.push({ severity: "info", title: "Recapture assumed deferred", detail: "You assumed a 1031 exchange or a hold until death, so no recapture tax is charged here. Neither is guaranteed by law changes or by your plans." });
  }
  if (bonus < 1) {
    findings.push({ severity: "info", title: "Bonus below 100%", detail: "You entered a bonus rate under 100%, which suits property acquired before 20 January 2025. The remainder is depreciated over 5 or 15 years." });
  }
  findings.push({ severity: "info", title: "State tax and the look-back", detail: "Many states do not follow federal bonus depreciation. A study on a property owned for years can be claimed with a catch-up deduction (Form 3115) instead of amending old returns; that is not modelled." });

  return {
    price, basis, landShare, life, month, bracket, bonus, fee, hold, usable, discount, deferRecapture,
    propertyLabel: type.label, five, fifteen, building,
    year1Baseline: baselineRows[0] || 0, year1CostSeg: segRows[0] || 0, year1Extra, year1Saved,
    cumTaxSaved: cumSaved, releasedAtSale, extraRecapture, netUndiscounted, netPV, paybackYear,
    acceleratedDep, rows, findings, suspended,
    multipleOfFee: fee > 0 ? (cumSaved + releasedAtSale) / fee : null,
  };
}
