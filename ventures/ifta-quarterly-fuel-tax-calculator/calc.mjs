// The IFTA quarterly fuel tax return, worked out from a carrier's own trip and
// fuel records.
//
// Every carrier running a qualified vehicle (over 26,000 lb, or three axles)
// across two or more member jurisdictions files one of these four times a
// year. The filing is a single netted payment to the carrier's base
// jurisdiction, and it is arithmetic — but it is arithmetic with four rules
// that a spreadsheet built by hand gets wrong, and getting them wrong is what
// an IFTA audit finds.
//
// ## The four rules
//
// **1. There is one fleet MPG, and it is fleet-wide.** Taxable gallons in
// Illinois are not the gallons bought in Illinois — they are Illinois taxable
// miles divided by the average MPG of the whole fleet across the whole
// quarter. Carriers who compute a per-jurisdiction MPG produce numbers that
// look reasonable and reconcile to nothing.
//
// **2. That MPG is rounded to two decimals before it is used.** The return
// asks for MPG to two places and every downstream gallon figure is derived
// from the rounded value, so a worksheet carrying full precision disagrees
// with the filed return by a few dollars per jurisdiction — small, and exactly
// the kind of unexplainable variance that extends an audit.
//
// **3. A surcharge is charged on taxable gallons, not net taxable gallons,
// and it is never credited.** Indiana, Kentucky and Virginia levy part of
// their diesel tax as a surcharge collected on the return rather than at the
// pump. Buying more fuel in Kentucky reduces the tax line and does nothing at
// all to the surcharge line. Carriers who model the surcharge as "another tax
// rate" under-report it every quarter they run a credit in those states.
//
// **4. Interest on a late return is per jurisdiction, and a credit in one
// jurisdiction does not offset interest owed to another.** A return that nets
// to a refund can still owe interest. This is the rule that surprises people
// who filed late and assumed a credit balance meant nothing was owed.
//
// ## What this deliberately does not carry
//
// **Tax rates.** They change every quarter, in 58 jurisdictions, and some
// change mid-quarter. A tool that shipped a rate table would be wrong within
// weeks and wrong in the direction that matters — a filed return. The rates
// are inputs, taken from the official IFTA rate sheet for the quarter being
// filed, and the page says where to get them.
//
// Nothing here is a determination. It is the return's own arithmetic on the
// carrier's own figures; the base jurisdiction assesses the return.

/**
 * How many jurisdiction rows the page offers. The page renders this many
 * fixed rows rather than adding them with script, so every input has a real
 * accessible name in the markup — see `page.test.mjs`.
 */
export const ROW_COUNT = 12;

/** The per-row input classes, in the order they appear across a row. */
export const ROW_FIELDS = [
  'jurisdiction',
  'totalMiles',
  'taxableMiles',
  'taxPaidGallons',
  'taxRate',
  'surchargeRate',
];

/** Inputs that are not part of the jurisdiction table. */
export const GLOBAL_INPUT_IDS = ['interestAnnualPercent', 'monthsLate'];

const ROW_LIMITS = {
  totalMiles: { label: 'Total miles', min: 0, max: 1_000_000 },
  taxableMiles: { label: 'Taxable miles', min: 0, max: 1_000_000 },
  taxPaidGallons: { label: 'Tax-paid gallons', min: 0, max: 200_000 },
  taxRate: { label: 'Tax rate', min: 0, max: 5 },
  surchargeRate: { label: 'Surcharge rate', min: 0, max: 5 },
};

const GLOBAL_LIMITS = {
  interestAnnualPercent: { label: 'Annual interest rate', min: 0, max: 50 },
  monthsLate: { label: 'Months late', min: 0, max: 60 },
};

/**
 * The band a diesel tractor's fleet MPG realistically falls in. Outside it the
 * likeliest explanation is a data-entry error — miles and gallons swapped, a
 * jurisdiction's miles left out, or gallons entered in litres — not a
 * remarkable fleet. Flagged rather than rejected: a light-duty qualified
 * vehicle really can return 15, and refusing to compute would be worse than
 * saying "check this".
 */
export const PLAUSIBLE_MPG = { min: 3, max: 12 };

function readNumber(raw, limits, key, errors, rowLabel) {
  const spec = limits[key];
  const text = typeof raw === 'string' ? raw.trim() : raw;
  // Blank is zero for every numeric field here. A carrier who ran no miles in
  // a jurisdiction leaves the cell empty rather than typing a nought, and a
  // return that refused to compute over an empty cell would be unusable.
  if (text === '' || text === null || text === undefined) return 0;
  const value = typeof text === 'number' ? text : Number.parseFloat(text);
  const where = rowLabel ? `${rowLabel}: ` : '';
  if (!Number.isFinite(value)) {
    errors.push({ field: key, message: `${where}${spec.label} needs a number.` });
    return null;
  }
  if (value < spec.min) {
    errors.push({ field: key, message: `${where}${spec.label} cannot be below ${spec.min}.` });
    return null;
  }
  if (value > spec.max) {
    errors.push({ field: key, message: `${where}${spec.label} cannot be above ${spec.max.toLocaleString('en-US')}.` });
    return null;
  }
  return value;
}

/**
 * Round to two decimals the way a filing does — half away from zero, rather
 * than JavaScript's `Math.round`, which is half-up and so rounds -0.125 to
 * -0.12 while rounding 0.125 to 0.13. Every figure here that can be negative
 * is money, and a return whose credits round differently from its debits is
 * the kind of half-cent drift that never reconciles.
 */
export function round2(value) {
  const scaled = Math.abs(value) * 100;
  // The epsilon corrects binary representation, e.g. 1.005 * 100 === 100.49999.
  const rounded = Math.round(scaled + Number.EPSILON * scaled) / 100;
  return value < 0 ? -rounded : rounded;
}

/**
 * The average fleet MPG the return is computed from: every mile the fleet ran
 * anywhere, over every gallon it put in a tank anywhere, rounded to two
 * decimals because that is the figure the return carries and every gallon
 * below is derived from.
 */
export function fleetMileage(totalMiles, totalGallons) {
  if (!(totalGallons > 0)) return null;
  return round2(totalMiles / totalGallons);
}

/**
 * One jurisdiction's lines on the return.
 *
 * `taxableGallons` is what the jurisdiction says the fleet burned there;
 * `taxPaidGallons` is what it already collected at the pump. The difference is
 * what changes hands. The surcharge sits outside that netting entirely — it is
 * charged on the full taxable gallons and there is nothing to credit it
 * against, which is rule 3 above and the line this tool exists to get right.
 */
export function jurisdictionLine(row, mpg) {
  const taxableGallons = round2(row.taxableMiles / mpg);
  const netTaxableGallons = round2(taxableGallons - row.taxPaidGallons);
  const taxDue = round2(netTaxableGallons * row.taxRate);
  const surchargeDue = round2(taxableGallons * row.surchargeRate);
  return {
    ...row,
    taxableGallons,
    netTaxableGallons,
    taxDue,
    surchargeDue,
    rowTotal: round2(taxDue + surchargeDue),
  };
}

/**
 * Interest on a late return, per jurisdiction.
 *
 * IFTA accrues interest on the tax owed to each jurisdiction separately, at
 * 1/12 of the annual rate for each month or part of a month the return is
 * late. A jurisdiction the carrier is owed a refund from accrues nothing —
 * and, crucially, does not reduce the interest owed to any other. So a return
 * that nets to a credit can still carry interest, which is why this is
 * computed on the positive rows alone.
 */
export function interestOnRow(rowTotal, annualRate, monthsLate) {
  if (!(rowTotal > 0) || !(annualRate > 0) || !(monthsLate > 0)) return 0;
  return round2(rowTotal * (annualRate / 12) * Math.ceil(monthsLate));
}

function warn(warnings, code, message) {
  warnings.push({ code, message });
}

/**
 * Work the whole return.
 *
 * @param {object} input
 * @param {Array<object>} input.rows one entry per jurisdiction row on the page
 * @param {string|number} [input.interestAnnualPercent] annual IFTA interest rate
 * @param {string|number} [input.monthsLate] months (or part months) the return is late
 * @returns {{ok: boolean, errors?: Array, ...}}
 */
export function calculateReturn(input) {
  const errors = [];
  const warnings = [];

  const interestAnnualPercent = readNumber(
    input.interestAnnualPercent, GLOBAL_LIMITS, 'interestAnnualPercent', errors, '',
  );
  const monthsLate = readNumber(input.monthsLate, GLOBAL_LIMITS, 'monthsLate', errors, '');

  const rows = [];
  for (const [i, raw] of (input.rows || []).entries()) {
    const jurisdiction = String(raw.jurisdiction ?? '').trim();
    const label = jurisdiction || `Row ${i + 1}`;

    const totalMiles = readNumber(raw.totalMiles, ROW_LIMITS, 'totalMiles', errors, label);
    const taxPaidGallons = readNumber(raw.taxPaidGallons, ROW_LIMITS, 'taxPaidGallons', errors, label);
    const taxRate = readNumber(raw.taxRate, ROW_LIMITS, 'taxRate', errors, label);
    const surchargeRate = readNumber(raw.surchargeRate, ROW_LIMITS, 'surchargeRate', errors, label);

    // Taxable miles default to total miles when the cell is left blank. Most
    // carriers have no exempt miles at all, so requiring the figure twice
    // would be six columns of duplicate typing for the common case — and a
    // blank that silently meant *zero* taxable miles would under-report the
    // return, which is the dangerous direction to be wrong in.
    const taxableRaw = raw.taxableMiles;
    const taxableBlank = taxableRaw === '' || taxableRaw === null || taxableRaw === undefined;
    const taxableMiles = taxableBlank
      ? totalMiles
      : readNumber(taxableRaw, ROW_LIMITS, 'taxableMiles', errors, label);

    if ([totalMiles, taxableMiles, taxPaidGallons, taxRate, surchargeRate].some((v) => v === null)) continue;

    // A row with nothing in it is an unused row on the form, not an error.
    if (totalMiles === 0 && taxPaidGallons === 0 && jurisdiction === '') continue;

    if (taxableMiles > totalMiles) {
      errors.push({
        field: 'taxableMiles',
        message: `${label}: taxable miles (${taxableMiles.toLocaleString('en-US')}) cannot exceed total miles (${totalMiles.toLocaleString('en-US')}).`,
      });
      continue;
    }

    rows.push({
      index: i,
      jurisdiction,
      label,
      totalMiles,
      taxableMiles,
      taxableMilesWasImplied: taxableBlank,
      taxPaidGallons,
      taxRate,
      surchargeRate,
    });
  }

  if (errors.length) return { ok: false, errors };

  if (rows.length === 0) {
    return {
      ok: false,
      errors: [{ field: 'rows', message: 'Enter at least one jurisdiction with miles or fuel.' }],
    };
  }

  const totalMiles = rows.reduce((n, r) => n + r.totalMiles, 0);
  const totalGallons = rows.reduce((n, r) => n + r.taxPaidGallons, 0);

  if (totalGallons === 0) {
    return {
      ok: false,
      errors: [{
        field: 'taxPaidGallons',
        message: 'Enter the gallons you bought somewhere. Average fleet MPG is total miles over total gallons, so with no gallons the return has no MPG to compute taxable gallons from.',
      }],
    };
  }
  if (totalMiles === 0) {
    return {
      ok: false,
      errors: [{ field: 'totalMiles', message: 'Enter the miles you ran. A quarter with fuel and no miles has no taxable gallons to report.' }],
    };
  }

  const mpg = fleetMileage(totalMiles, totalGallons);
  const lines = rows.map((row) => jurisdictionLine(row, mpg));

  const taxDue = round2(lines.reduce((n, l) => n + l.taxDue, 0));
  const surchargeDue = round2(lines.reduce((n, l) => n + l.surchargeDue, 0));
  const subtotal = round2(taxDue + surchargeDue);

  const annualRate = interestAnnualPercent / 100;
  const withInterest = lines.map((l) => ({ ...l, interest: interestOnRow(l.rowTotal, annualRate, monthsLate) }));
  const interest = round2(withInterest.reduce((n, l) => n + l.interest, 0));
  const grandTotal = round2(subtotal + interest);

  // --- the checks a carrier would otherwise only hear about from an auditor

  if (rows.length === 1) {
    warn(warnings, 'single-jurisdiction',
      'Only one jurisdiction has figures. IFTA covers travel in two or more member jurisdictions — if the fleet really ran in one, this quarter may not need an IFTA return at all. Check with your base jurisdiction.');
  }
  if (mpg < PLAUSIBLE_MPG.min || mpg > PLAUSIBLE_MPG.max) {
    warn(warnings, 'implausible-mpg',
      `Average fleet MPG came out at ${mpg.toFixed(2)}, outside the ${PLAUSIBLE_MPG.min}–${PLAUSIBLE_MPG.max} band a qualified vehicle usually returns. The usual causes are a jurisdiction's miles or gallons left out, miles and gallons entered in the wrong columns, or litres entered as gallons. Every taxable-gallon figure below is derived from this number, so check it before you file.`);
  }
  const fuelNoMiles = withInterest.filter((l) => l.taxPaidGallons > 0 && l.totalMiles === 0);
  if (fuelNoMiles.length) {
    warn(warnings, 'fuel-without-miles',
      `${fuelNoMiles.map((l) => l.label).join(', ')}: fuel bought in a jurisdiction the fleet recorded no miles in. That is a standard audit query — either the trip records are missing those miles or the purchase belongs to another jurisdiction.`);
  }
  const milesNoRate = withInterest.filter((l) => l.taxableMiles > 0 && l.taxRate === 0);
  if (milesNoRate.length) {
    warn(warnings, 'zero-rate',
      `${milesNoRate.map((l) => l.label).join(', ')}: taxable miles at a tax rate of zero, so those jurisdictions contribute nothing to the total. If that is not deliberate, fill the rate in from the official rate table for the quarter you are filing.`);
  }
  const creditedSurcharge = withInterest.filter((l) => l.surchargeRate > 0 && l.netTaxableGallons < 0);
  if (creditedSurcharge.length) {
    warn(warnings, 'surcharge-not-credited',
      `${creditedSurcharge.map((l) => l.label).join(', ')}: a fuel credit here does not reduce the surcharge. The surcharge is charged on all taxable gallons burned in the jurisdiction, whatever was bought there — this is the line most hand-built worksheets under-report.`);
  }
  if (interest > 0 && subtotal < 0) {
    warn(warnings, 'interest-despite-credit',
      `This return nets to a credit of ${Math.abs(subtotal).toFixed(2)} and still owes ${interest.toFixed(2)} in interest. Interest accrues to each jurisdiction you owe tax to; a credit somewhere else does not offset it.`);
  }

  return {
    ok: true,
    mpg,
    totalMiles,
    totalGallons: round2(totalGallons),
    lines: withInterest,
    taxDue,
    surchargeDue,
    subtotal,
    interest,
    grandTotal,
    // Split out because the return nets to one payment but a carrier reading
    // it wants to see the two sides: what is owed, and what is being credited
    // back. Neither is visible in the net figure alone.
    owedTotal: round2(withInterest.filter((l) => l.rowTotal > 0).reduce((n, l) => n + l.rowTotal, 0)),
    creditTotal: round2(withInterest.filter((l) => l.rowTotal < 0).reduce((n, l) => n + l.rowTotal, 0)),
    warnings,
  };
}
