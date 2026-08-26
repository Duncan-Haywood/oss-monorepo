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
  };
}
