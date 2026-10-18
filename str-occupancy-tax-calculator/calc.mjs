// Occupancy-tax arithmetic for one short-term-rental stay, split by tax
// layer and by who actually remits it.
//
// The mistake this exists to catch: a host reads "Airbnb collects and remits
// occupancy tax" and assumes the subject is closed. In most patchwork tax
// jurisdictions it collects *some* of what is owed and not all of it — a
// state sales tax, say, but not a county tourist-development tax layered on
// top of it, because the platform only holds a collection agreement with
// some of the taxing authorities a listing sits inside. The gap between
// "total tax owed" and "tax the platform already collected" is money the
// host owes the remaining authority directly, on their own filing, and it
// does not show up anywhere in a payout statement that only ever nets fees.
//
// No rate table ships here. Occupancy tax rates are set per state, county,
// city and sometimes per special district, they change, and a table baked
// into a free tool would be stale in the one place that is expensive to be
// wrong — a filed remittance. Every rate is an input, taken from the host's
// own jurisdiction, exactly as the IFTA calculator in this portfolio treats
// fuel-tax rates as inputs for the same reason.

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rate = (value) => num(value) / 100;

/**
 * Round to two decimals the way a remittance does — half away from zero,
 * rather than JavaScript's `Math.round`, which is half-up and so treats a
 * negative boundary differently from a positive one. Every figure here is
 * money, so mismatched rounding is the kind of half-cent drift that never
 * reconciles against a filed return.
 */
export function round2(value) {
  const scaled = Math.abs(value) * 100;
  const rounded = Math.round(scaled + Number.EPSILON * scaled) / 100;
  return value < 0 ? -rounded : rounded;
}

/** Fixed tax-layer rows the page renders (state, county, city, special district). */
export const LAYER_COUNT = 4;

/** The per-row input classes, in the order they appear across a row. */
export const LAYER_FIELDS = ['name', 'ratePercent', 'platformCollectsPercent'];

/** Inputs that are not part of the tax-layer table. */
export const GLOBAL_INPUT_IDS = [
  'nightlyRate', 'nights', 'cleaningFee', 'bookingsPerMonth',
  'flatFeePerNight', 'flatFeePlatformCollectsPercent',
];

const GLOBAL_LIMITS = {
  nightlyRate: { label: 'Nightly rate', min: 0, max: 100_000 },
  nights: { label: 'Nights', min: 0, max: 365 },
  cleaningFee: { label: 'Cleaning fee', min: 0, max: 100_000 },
  bookingsPerMonth: { label: 'Bookings per month', min: 0, max: 100 },
  flatFeePerNight: { label: 'Flat per-night fee', min: 0, max: 1_000 },
  flatFeePlatformCollectsPercent: { label: 'Platform share of the flat fee', min: 0, max: 100 },
};

const LAYER_LIMITS = {
  ratePercent: { label: 'Tax rate', min: 0, max: 100 },
  platformCollectsPercent: { label: 'Platform share', min: 0, max: 100 },
};

function readNumber(raw, limits, key, errors, rowLabel) {
  const spec = limits[key];
  const text = typeof raw === 'string' ? raw.trim() : raw;
  // Blank is zero for every numeric field here. A host who has no city tax
  // leaves the cell empty rather than typing a nought, and a calculator that
  // refused to compute over an empty cell would be unusable.
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
 * One tax layer's line: the amount it charges on the taxable base, and how
 * that amount splits between what the platform already collected and what
 * is left for the host to remit directly.
 */
export function layerLine(row, taxableBase) {
  const amount = round2(taxableBase * rate(row.ratePercent));
  const platformAmount = round2(amount * rate(row.platformCollectsPercent));
  const hostAmount = round2(amount - platformAmount);
  return { ...row, amount, platformAmount, hostAmount };
}

/**
 * Work one stay's occupancy tax across every layer, plus the flat per-night
 * fee some jurisdictions charge outside the percentage layers entirely.
 *
 * @param {object} input
 * @param {Array<object>} input.rows one entry per tax-layer row on the page
 * @param {string|number} input.nightlyRate
 * @param {string|number} input.nights
 * @param {string|number} [input.cleaningFee]
 * @param {string|number} [input.bookingsPerMonth] illustrative monthly rollup, not a forecast
 * @param {string|number} [input.flatFeePerNight]
 * @param {string|number} [input.flatFeePlatformCollectsPercent]
 * @returns {{ok: boolean, errors?: Array, ...}}
 */
export function calculateTax(input = {}) {
  const errors = [];

  const nightlyRate = readNumber(input.nightlyRate, GLOBAL_LIMITS, 'nightlyRate', errors, '');
  const nights = readNumber(input.nights, GLOBAL_LIMITS, 'nights', errors, '');
  const cleaningFee = readNumber(input.cleaningFee, GLOBAL_LIMITS, 'cleaningFee', errors, '');
  const bookingsPerMonth = readNumber(input.bookingsPerMonth, GLOBAL_LIMITS, 'bookingsPerMonth', errors, '');
  const flatFeePerNight = readNumber(input.flatFeePerNight, GLOBAL_LIMITS, 'flatFeePerNight', errors, '');
  const flatFeePlatformCollectsPercent = readNumber(
    input.flatFeePlatformCollectsPercent, GLOBAL_LIMITS, 'flatFeePlatformCollectsPercent', errors, '',
  );

  const rows = [];
  for (const [i, raw] of (input.rows || []).entries()) {
    const name = String(raw?.name ?? '').trim();
    const label = name || `Row ${i + 1}`;
    const ratePercent = readNumber(raw?.ratePercent, LAYER_LIMITS, 'ratePercent', errors, label);
    const platformCollectsPercent = readNumber(raw?.platformCollectsPercent, LAYER_LIMITS, 'platformCollectsPercent', errors, label);
    if (ratePercent === null || platformCollectsPercent === null) continue;
    // A row with nothing in it is an unused row on the form, not a layer.
    if (ratePercent === 0 && name === '') continue;
    rows.push({ index: i, name, label, ratePercent, platformCollectsPercent });
  }

  if (errors.length) return { ok: false, errors };

  if (nightlyRate <= 0 && cleaningFee <= 0) {
    return { ok: false, errors: [{ field: 'nightlyRate', message: 'Enter a nightly rate or a cleaning fee to tax.' }] };
  }
  if (nights <= 0) {
    return { ok: false, errors: [{ field: 'nights', message: 'Enter at least one night.' }] };
  }
  if (rows.length === 0 && flatFeePerNight === 0) {
    return { ok: false, errors: [{ field: 'rows', message: 'Enter at least one tax layer or a flat per-night fee.' }] };
  }

  const taxableBase = round2(nightlyRate * nights + cleaningFee);
  const layers = rows.map((row) => layerLine(row, taxableBase));

  const flatFeeAmount = round2(flatFeePerNight * nights);
  const flatFeePlatformAmount = round2(flatFeeAmount * rate(flatFeePlatformCollectsPercent));
  const flatFeeHostAmount = round2(flatFeeAmount - flatFeePlatformAmount);

  const layerTax = round2(layers.reduce((n, l) => n + l.amount, 0));
  const totalTax = round2(layerTax + flatFeeAmount);
  const platformCollected = round2(
    layers.reduce((n, l) => n + l.platformAmount, 0) + flatFeePlatformAmount,
  );
  const hostMustRemit = round2(totalTax - platformCollected);

  const monthlyTax = round2(totalTax * bookingsPerMonth);
  const monthlyHostMustRemit = round2(hostMustRemit * bookingsPerMonth);
  const monthlyPlatformCollected = round2(platformCollected * bookingsPerMonth);

  const warnings = [];
  if (totalTax > 0 && hostMustRemit > 0 && platformCollected > 0) {
    warnings.push({
      code: 'split-remittance',
      message: `The platform already collects ${round2(platformCollected).toFixed(2)} of this stay's ${totalTax.toFixed(2)} in tax. The remaining ${hostMustRemit.toFixed(2)} is not withheld anywhere — it is on you to track and remit to the authority that does not have a collection agreement with the platform.`,
    });
  } else if (totalTax > 0 && hostMustRemit === totalTax) {
    warnings.push({
      code: 'host-remits-all',
      message: 'None of this is collected by the platform at checkout. The full amount is the host’s own filing.',
    });
  } else if (totalTax > 0 && platformCollected === totalTax) {
    warnings.push({
      code: 'platform-remits-all',
      message: 'Every layer entered is already collected and remitted by the platform. Confirm that against the platform’s own tax page for this listing’s address — collection agreements are set per jurisdiction and change.',
    });
  }
  const zeroRateNamed = layers.filter((l) => l.name && l.ratePercent === 0);
  if (zeroRateNamed.length) {
    warnings.push({
      code: 'zero-rate',
      message: `${zeroRateNamed.map((l) => l.label).join(', ')}: named but entered at a 0% rate, which looks on the page exactly like a layer already accounted for.`,
    });
  }

  return {
    ok: true,
    nightlyRate,
    nights,
    cleaningFee,
    bookingsPerMonth,
    taxableBase,
    layers,
    flatFee: {
      perNight: flatFeePerNight,
      amount: flatFeeAmount,
      platformCollectsPercent: flatFeePlatformCollectsPercent,
      platformAmount: flatFeePlatformAmount,
      hostAmount: flatFeeHostAmount,
    },
    totalTax,
    platformCollected,
    hostMustRemit,
    monthlyTax,
    monthlyHostMustRemit,
    monthlyPlatformCollected,
    warnings,
  };
}
