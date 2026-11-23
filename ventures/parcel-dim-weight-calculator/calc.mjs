// Parcel billable weight: the greater of what a package weighs and what the
// space it occupies is priced at. Pure arithmetic — no carrier rate lookup, no
// network, no account.
//
// The one number a small shipper is actually billed on is
// `max(actual, dimensional)`, rounded up to the next whole pound. Dimensional
// weight is `cube / divisor`, where the divisor is a contract term: the
// published US domestic figure has been 139 in³/lb for the major parcel
// carriers, but a negotiated agreement routinely carries 166, 194 or 250, and a
// better divisor is worth more than a rate discount to anyone shipping light
// bulky goods. So the divisor is an input here, never a constant.

// Published US domestic retail divisor for the major parcel carriers at the
// time of writing, and the value most shippers meet first. It is a default to
// start from, not a fact this module asserts — every output is recomputed from
// whatever the caller passes.
export const DEFAULT_DIVISOR = 139;

// Surcharge tripwires are dimensional, so they are arithmetic this module can
// do. What they *cost* is a rate-card question it deliberately does not answer.
// These are the long-standing US domestic ground thresholds and are supplied as
// defaults the caller may override; `flags` reports which are crossed and by
// how much, never a dollar figure.
export const DEFAULT_THRESHOLDS = {
  // Additional handling, whichever comes first.
  additionalHandlingLongestSide: 48,
  additionalHandlingSecondSide: 30,
  additionalHandlingGirth: 105, // length plus girth, like the other *Girth limits
  // Large/oversize package: length plus girth over 130 in, or the longest side
  // over 96 in, whichever comes first (UPS "Large Package", FedEx "Oversize").
  largePackageGirth: 130,
  largePackageLongestSide: 96,
  maximumLongestSide: 108,
  maximumGirth: 165,
};

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be greater than zero`);
  return number;
}

/**
 * Carriers measure each dimension and round it before cubing, which changes the
 * answer near a half inch: a 12.6″ side is billed as 13″. Whether that rounding
 * applies is a carrier/service question, so it is a caller's choice rather than
 * something assumed here — but when it is on it must happen *before* the
 * multiplication, not after, or the cube is wrong by the product of the errors.
 */
function measured(value, round) {
  // A side under half an inch would round to 0 and zero the cube; whole-inch
  // measuring reads any real side as at least 1 inch (red team 2026-11-23).
  return round ? Math.max(1, Math.round(value)) : value;
}

/**
 * Billable weight is rounded up to the next whole pound per package. That is a
 * ceiling, not a rounding: 3.01 lb bills as 4 lb, which is why a package sitting
 * a hundredth over a pound boundary is worth knowing about.
 */
function billableFrom(actual, dimensional) {
  return Math.ceil(Math.max(actual, dimensional));
}

/**
 * The largest height this package could have and still bill on its actual
 * weight — i.e. the height at which dimensional weight exactly equals actual.
 *
 * Length and width are the footprint a carton already has; height is the
 * dimension a shipper can most often change by choosing a shallower box or
 * packing flatter. Returns null when no positive height reaches the target,
 * which happens when the footprint alone already prices above the actual
 * weight: shortening the box cannot fix a box that is too wide.
 */
function heightAtDimWeight(targetWeight, length, width, divisor) {
  const height = targetWeight * divisor / (length * width);
  return Number.isFinite(height) && height > 0 ? height : null;
}

export function calculateBillableWeight(input) {
  const rawLength = positive(input.length, 'Length');
  const rawWidth = positive(input.width, 'Width');
  const rawHeight = positive(input.height, 'Height');
  const actualWeight = positive(input.weight, 'Weight');
  const divisor = positive(input.divisor ?? DEFAULT_DIVISOR, 'Divisor');
  const packages = positive(input.packages ?? 1, 'Packages');
  if (!Number.isSafeInteger(packages)) throw new Error('Packages must be a whole number');
  const roundDimensions = input.roundDimensions !== false;

  // Sort descending so "longest side" and "second-longest side" mean the same
  // thing however the visitor typed the box in. A carrier measures the carton,
  // not the order of the fields on a form.
  const sides = [rawLength, rawWidth, rawHeight].map(side => measured(side, roundDimensions));
  const [longestSide, secondSide, shortestSide] = [...sides].sort((a, b) => b - a);

  const length = measured(rawLength, roundDimensions);
  const width = measured(rawWidth, roundDimensions);
  const height = measured(rawHeight, roundDimensions);

  const cube = length * width * height;
  const dimWeight = cube / divisor;
  if (![cube, dimWeight].every(Number.isFinite)) {
    throw new Error('Values are too large to calculate safely');
  }

  // Both weights round up to the next pound before they are compared, so a
  // dimensional weight that rounds to the same pound as the goods costs nothing
  // extra: that package bills on its actual weight (red team 2026-11-23).
  const billedActual = Math.ceil(actualWeight);
  const billedOn = Math.ceil(dimWeight) > billedActual ? 'dimensional' : 'actual';
  const billableWeight = billableFrom(actualWeight, dimWeight);

  // Girth is the strap around the two shorter sides (2 x width + 2 x height
  // on the carriers' definition). Parcel surcharge tables are written in
  // length plus girth: the longest side plus that strap.
  const girth = 2 * (secondSide + shortestSide);
  const lengthPlusGirth = longestSide + girth;

  const thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds ?? {}) };
  const flags = [];
  if (longestSide > thresholds.maximumLongestSide || lengthPlusGirth > thresholds.maximumGirth) {
    flags.push({
      id: 'over-maximum',
      severity: 'blocking',
      text: `Longest side ${longestSide}″ or length plus girth ${lengthPlusGirth.toFixed(0)}″ exceeds the ground maximum (${thresholds.maximumLongestSide}″ / ${thresholds.maximumGirth}″). Most carriers will not accept this as a parcel at all — it moves as freight.`,
    });
  } else if (lengthPlusGirth > thresholds.largePackageGirth || longestSide > thresholds.largePackageLongestSide) {
    const why = lengthPlusGirth > thresholds.largePackageGirth
      ? `Length plus girth ${lengthPlusGirth.toFixed(0)}″ is over ${thresholds.largePackageGirth}″`
      : `Longest side ${longestSide}″ is over ${thresholds.largePackageLongestSide}″`;
    flags.push({
      id: 'large-package',
      severity: 'major',
      text: `${why}, so this bills as a large package: a flat surcharge, and a minimum billable weight (90 lb on the UPS and FedEx published terms) that replaces the ${billableWeight} lb above whenever it is higher.`,
    });
  } else if (
    longestSide > thresholds.additionalHandlingLongestSide
    || secondSide > thresholds.additionalHandlingSecondSide
    || lengthPlusGirth > thresholds.additionalHandlingGirth
  ) {
    flags.push({
      id: 'additional-handling',
      severity: 'minor',
      text: `This trips additional handling on dimensions (longest side ${longestSide}″, second ${secondSide}″, length plus girth ${lengthPlusGirth.toFixed(0)}″). The surcharge is charged per package on top of the rate for ${billableWeight} lb.`,
    });
  }

  // The lever, in the direction the shipper can act on it. If the package is
  // billed on air, say what it would take to stop being; if it is billed on its
  // actual weight, say how much bigger the box could get before that changes.
  // Both are the same equation read from opposite sides, solved for the billed
  // pound: any cube whose dimensional weight stays at or under it bills the same.
  const breakEvenCube = billedActual * divisor;
  const breakEvenHeight = heightAtDimWeight(billedActual, length, width, divisor);
  const lever = billedOn === 'dimensional'
    ? {
      direction: 'reduce',
      // Air paid for: the gap between what is billed and what the goods weigh.
      airWeight: billableWeight - billedActual,
      targetCube: breakEvenCube,
      cubeReduction: cube - breakEvenCube,
      targetHeight: breakEvenHeight,
      heightReduction: breakEvenHeight === null ? null : height - breakEvenHeight,
    }
    : {
      direction: 'headroom',
      airWeight: 0,
      targetCube: breakEvenCube,
      cubeHeadroom: breakEvenCube - cube,
      targetHeight: breakEvenHeight,
      heightHeadroom: breakEvenHeight === null ? null : breakEvenHeight - height,
    };

  return {
    length,
    width,
    height,
    roundedDimensions: roundDimensions && (length !== rawLength || width !== rawWidth || height !== rawHeight),
    actualWeight,
    divisor,
    packages,
    cube,
    dimWeight,
    billedOn,
    billableWeight,
    // Per-package figures multiplied out. A shipper quoting a run of identical
    // cartons is billed per package, so the total is the per-package billable
    // weight times the count — never the total cube re-divided, which would
    // quietly under-count every package's round-up.
    totalBillableWeight: billableWeight * packages,
    totalActualWeight: actualWeight * packages,
    longestSide,
    secondSide,
    shortestSide,
    girth,
    lengthPlusGirth,
    flags,
    lever,
  };
}
