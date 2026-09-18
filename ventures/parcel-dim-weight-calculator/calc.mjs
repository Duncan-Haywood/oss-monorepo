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
  additionalHandlingGirth: 105,
  // Large/oversize package.
  largePackageGirth: 130,
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
  return round ? Math.round(value) : value;
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

  const billedOn = dimWeight > actualWeight ? 'dimensional' : 'actual';
  const billableWeight = billableFrom(actualWeight, dimWeight);

  // Girth is the strap-around measurement every parcel surcharge table is
  // written in: the longest side plus twice each of the other two.
  const girth = longestSide + 2 * (secondSide + shortestSide);

  const thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds ?? {}) };
  const flags = [];
  if (longestSide > thresholds.maximumLongestSide || girth > thresholds.maximumGirth) {
    flags.push({
      id: 'over-maximum',
      severity: 'blocking',
      text: `Longest side ${longestSide}″ or girth ${girth.toFixed(0)}″ exceeds the ground maximum (${thresholds.maximumLongestSide}″ / ${thresholds.maximumGirth}″). Most carriers will not accept this as a parcel at all — it moves as freight.`,
    });
  } else if (girth > thresholds.largePackageGirth) {
    flags.push({
      id: 'large-package',
      severity: 'major',
      text: `Girth ${girth.toFixed(0)}″ is over ${thresholds.largePackageGirth}″, so this bills as a large package: a flat surcharge plus a minimum billable weight that is usually well above the ${billableWeight} lb above.`,
    });
  } else if (
    longestSide > thresholds.additionalHandlingLongestSide
    || secondSide > thresholds.additionalHandlingSecondSide
    || girth > thresholds.additionalHandlingGirth
  ) {
    flags.push({
      id: 'additional-handling',
      severity: 'minor',
      text: `This trips additional handling on dimensions (longest side ${longestSide}″, second ${secondSide}″, girth ${girth.toFixed(0)}″). The surcharge is charged per package on top of the rate for ${billableWeight} lb.`,
    });
  }

  // The lever, in the direction the shipper can act on it. If the package is
  // billed on air, say what it would take to stop being; if it is billed on its
  // actual weight, say how much bigger the box could get before that changes.
  // Both are the same equation read from opposite sides.
  const breakEvenCube = actualWeight * divisor;
  const breakEvenHeight = heightAtDimWeight(actualWeight, length, width, divisor);
  const lever = billedOn === 'dimensional'
    ? {
      direction: 'reduce',
      // Air paid for: the gap between what is billed and what the goods weigh.
      airWeight: billableWeight - Math.ceil(actualWeight),
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
    flags,
    lever,
  };
}
