// Density-based estimate only. Carrier rules, freight characteristics, and
// accessorials can change the final class and quote.
export const CLASS_BANDS = [
  { minDensity: 50, freightClass: 50 },
  { minDensity: 35, freightClass: 55 },
  { minDensity: 30, freightClass: 60 },
  { minDensity: 22.5, freightClass: 65 },
  { minDensity: 15, freightClass: 70 },
  { minDensity: 13.5, freightClass: 77.5 },
  { minDensity: 12, freightClass: 85 },
  { minDensity: 10.5, freightClass: 92.5 },
  { minDensity: 9, freightClass: 100 },
  { minDensity: 8, freightClass: 110 },
  { minDensity: 7, freightClass: 125 },
  { minDensity: 6, freightClass: 150 },
  { minDensity: 5, freightClass: 175 },
  { minDensity: 4, freightClass: 200 },
  { minDensity: 2, freightClass: 250 },
  { minDensity: 1, freightClass: 300 },
  { minDensity: 0.5, freightClass: 400 },
  { minDensity: 0, freightClass: 500 },
];

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be greater than zero`);
  return number;
}

/**
 * The packed height at which this freight would sit exactly on `targetDensity`.
 *
 * Density is `weight * 1728 / (length * width * height)` — the piece count
 * cancels out of both halves, which is why this works on one piece and answers
 * for the whole shipment. Rearranged for height, it is the only lever in the
 * formula a shipper can usually move on the day: the weight is the goods and
 * the footprint is the pallet.
 *
 * Returns null when the target density is zero, where the height is unbounded.
 */
function heightAtDensity(weight, length, width, targetDensity) {
  if (targetDensity <= 0) return null;
  const height = weight * 1728 / (length * width * targetDensity);
  return Number.isFinite(height) ? height : null;
}

export function estimateFreightClass(input) {
  const length = positive(input.length, 'Length');
  const width = positive(input.width, 'Width');
  const height = positive(input.height, 'Height');
  const weight = positive(input.weight, 'Weight');
  const pieces = positive(input.pieces ?? 1, 'Pieces');
  if (!Number.isSafeInteger(pieces)) throw new Error('Pieces must be a whole number');
  const pieceCube = length * width * height / 1728;
  const totalCube = pieceCube * pieces;
  const totalWeight = weight * pieces;
  const density = totalWeight / totalCube;
  if (![pieceCube, totalCube, totalWeight, density].every(Number.isFinite)) {
    throw new Error('Values are too large to calculate safely');
  }
  const band = CLASS_BANDS.find(candidate => density >= candidate.minDensity);
  const bandIndex = CLASS_BANDS.indexOf(band);
  const nextBand = CLASS_BANDS[bandIndex - 1] ?? null;
  const dearerBand = CLASS_BANDS[bandIndex + 1] ?? null;

  // "You are 1.00 lb/ft³ from the next band" is true and useless: nobody ships
  // a lb/ft³. The two things a shipper can actually change on the dock are how
  // tall the pallet is packed and how much goes on it, so the gap is restated
  // in both of those units.
  const cheaper = nextBand === null ? null : (() => {
    const maxHeight = heightAtDensity(weight, length, width, nextBand.minDensity);
    const requiredWeight = nextBand.minDensity * pieceCube;
    return {
      freightClass: nextBand.freightClass,
      requiredDensity: nextBand.minDensity,
      densityGap: nextBand.minDensity - density,
      // Null when no positive height reaches the band — the footprint alone
      // already holds too much air for this weight, so shortening cannot fix it.
      maxHeight,
      heightReduction: maxHeight === null ? null : height - maxHeight,
      requiredWeight,
      weightIncrease: requiredWeight - weight,
    };
  })();

  // The other direction, and the one that costs money unannounced: a carrier
  // dimensioner that finds the pallet taller than the bill of lading claims
  // re-rates it. Knowing the headroom before that happens is the difference
  // between packing to 46" on purpose and eating a re-class notice.
  //
  // Null in the bottom band, whose floor is zero density: there is no dearer
  // class to fall into and no positive height that would reach one.
  const dearer = dearerBand === null || band.minDensity <= 0 ? null : (() => {
    const maxHeight = heightAtDensity(weight, length, width, band.minDensity);
    const minWeight = band.minDensity * pieceCube;
    return {
      freightClass: dearerBand.freightClass,
      floorDensity: band.minDensity,
      densityHeadroom: density - band.minDensity,
      maxHeight,
      heightHeadroom: maxHeight === null ? null : maxHeight - height,
      minWeight,
      weightHeadroom: weight - minWeight,
    };
  })();

  return {
    length,
    width,
    height,
    weight,
    pieces,
    pieceCube,
    totalCube,
    totalWeight,
    density,
    freightClass: band.freightClass,
    bandMinimumDensity: band.minDensity,
    nextLowerClass: nextBand?.freightClass ?? null,
    nextLowerClassDensity: nextBand?.minDensity ?? null,
    // The density gap restated in the units a dock actually works in.
    // `cheaper` is what it would take to earn the next class down;
    // `dearer` is how much slack there is before losing the one you have.
    levers: { cheaper, dearer },
  };
}
