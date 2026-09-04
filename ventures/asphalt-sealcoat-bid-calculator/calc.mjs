// Pure bid arithmetic for an asphalt sealcoating job. No network, no state:
// every gallon, wage, and add-on is an input, so the result stays a
// transparent calculation the contractor can check against their own sealer
// invoices and payroll rather than a claim about what any driveway "should"
// cost or whether a pavement is sound enough to coat.
//
// The method is the one the trade actually loses money on when they skip it:
// a flat "cents per square foot" special cannot see that an oxidized parking
// lot with oil spots, crack fill, and two coats is a different job from a
// tight residential driveway. Hours come from area × coats × crew rate, then
// prep, striping, travel, and materials layer on. That is what separates a
// defensible quote from a neighborhood special.

export const SURFACE_PRESETS = Object.freeze([
  { id: 'driveway', label: 'Residential driveway', firstCoatSqFtPerGal: 90, secondCoatSqFtPerGal: 120 },
  { id: 'parking-lot', label: 'Commercial parking lot', firstCoatSqFtPerGal: 80, secondCoatSqFtPerGal: 110 },
  { id: 'court', label: 'Basketball / play court', firstCoatSqFtPerGal: 85, secondCoatSqFtPerGal: 115 },
  { id: 'walkway', label: 'Walkway / apron', firstCoatSqFtPerGal: 95, secondCoatSqFtPerGal: 125 },
]);

// First-coat coverage multiplier. Oxidized pavement drinks sealer; a recently
// sealed lot does not. Second coat is already thinner and is not adjusted —
// the first coat did the drinking.
export const CONDITION_COVERAGE = Object.freeze({
  good: 1.2,
  oxidized: 1.0,
  failing: 0.75,
});

// Crew square feet per hour for one coat pass. Squeegee is slower and uses
// more sealer into the texture; spray is faster. These are ballpark starting
// points, not a production standard.
export const METHOD_PRESETS = Object.freeze({
  squeegee: { label: 'Squeegee / brush', sqFtPerCrewHour: 900 },
  spray: { label: 'Spray rig', sqFtPerCrewHour: 1600 },
});

export const ADD_ON_PRESETS = Object.freeze([
  { id: 'sand', label: 'Sand / aggregate in sealer', hours: 0.2, parts: 0 },
  { id: 'handicap', label: 'Handicap / stencil symbols', hours: 0.3, parts: 18 },
]);

export const HOURS_PER_OIL_SPOT = 0.12;
export const PRIMER_GALLONS_PER_SPOT = 0.08;
export const CRACK_FEET_PER_HOUR = 80;
export const HOURS_PER_STALL = 0.08;
export const SAND_LBS_PER_GALLON = 4;
export const LBS_PER_SAND_BAG = 50;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price a sealcoating stop from its surfaces, coats, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, squareFeet: number, coats: number, firstCoatSqFtPerGal: number, secondCoatSqFtPerGal: number}>} input.surfaces
 * @param {'good'|'oxidized'|'failing'} input.condition
 * @param {'squeegee'|'spray'} input.method
 * @param {number} input.oilSpots
 * @param {number} input.crackFeet
 * @param {number} input.stalls
 * @param {boolean} input.sand
 * @param {Array<{id?: string, label?: string, hours: number, parts: number, enabled?: boolean}>} [input.addOns]
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.milesOneWay
 * @param {number} input.speedMph
 * @param {number} input.setupHours
 * @param {number} input.minOnSiteHours
 * @param {number} input.tripFee
 * @param {number} input.sealerPerGallon
 * @param {number} input.primerPerGallon
 * @param {number} input.crackFillerPerFoot
 * @param {number} input.sandPerBag
 * @param {number} input.paintPerStall
 * @param {number} input.otherCost
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const surfacesInput = Array.isArray(input.surfaces) ? input.surfaces : [];
  if (surfacesInput.length === 0) throw new Error('Add at least one surface to price');

  const condition = input.condition || 'oxidized';
  if (!(condition in CONDITION_COVERAGE)) throw new Error('Condition must be good, oxidized, or failing');
  const method = input.method || 'squeegee';
  if (!(method in METHOD_PRESETS)) throw new Error('Method must be squeegee or spray');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const speedMph = number(input.speedMph ?? 0, 'Travel speed', { allowZero: false });
  const setupHours = number(input.setupHours ?? 0, 'Setup hours');
  const minOnSiteHours = number(input.minOnSiteHours ?? 0, 'Minimum on-site hours');
  const tripFee = number(input.tripFee ?? 0, 'Trip / truck fee');
  const sealerPerGallon = number(input.sealerPerGallon ?? 0, 'Sealer per gallon');
  const primerPerGallon = number(input.primerPerGallon ?? 0, 'Primer per gallon');
  const crackFillerPerFoot = number(input.crackFillerPerFoot ?? 0, 'Crack filler per foot');
  const sandPerBag = number(input.sandPerBag ?? 0, 'Sand per bag');
  const paintPerStall = number(input.paintPerStall ?? 0, 'Paint per stall');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const oilSpots = number(input.oilSpots ?? 0, 'Oil spots');
  const crackFeet = number(input.crackFeet ?? 0, 'Crack feet');
  const stalls = number(input.stalls ?? 0, 'Stalls');
  const sand = Boolean(input.sand);

  const coverageMult = CONDITION_COVERAGE[condition];
  const sqFtPerCrewHour = METHOD_PRESETS[method].sqFtPerCrewHour;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const surfaces = surfacesInput.map((surface, index) => {
    const label = surface.name?.trim() || `Surface ${index + 1}`;
    const squareFeet = number(surface.squareFeet ?? 0, `${label}: square feet`);
    const coats = number(surface.coats ?? 0, `${label}: coats`);
    if (coats > 4) throw new Error(`${label}: coats must be 4 or fewer`);
    const firstCoatSqFtPerGal = number(surface.firstCoatSqFtPerGal ?? 0, `${label}: first-coat coverage`, { allowZero: false });
    const secondCoatSqFtPerGal = number(surface.secondCoatSqFtPerGal ?? 0, `${label}: second-coat coverage`, { allowZero: false });
    const firstGallons = squareFeet / (firstCoatSqFtPerGal * coverageMult);
    const extraCoatGallons = coats > 1 ? (coats - 1) * (squareFeet / secondCoatSqFtPerGal) : 0;
    const gallons = firstGallons + extraCoatGallons;
    const applyHours = coats > 0 && squareFeet > 0 ? (squareFeet * coats) / sqFtPerCrewHour : 0;
    return {
      name: label,
      squareFeet,
      coats,
      firstCoatSqFtPerGal,
      secondCoatSqFtPerGal,
      firstGallons,
      extraCoatGallons,
      gallons,
      applyHours,
    };
  });

  const totalSquareFeet = surfaces.reduce((sum, surface) => sum + surface.squareFeet, 0);
  const totalGallons = surfaces.reduce((sum, surface) => sum + surface.gallons, 0);
  const coatPasses = surfaces.reduce((sum, surface) => sum + surface.coats, 0);
  const applyHours = surfaces.reduce((sum, surface) => sum + surface.applyHours, 0);
  const oilHours = oilSpots * HOURS_PER_OIL_SPOT;
  const crackHours = crackFeet / CRACK_FEET_PER_HOUR;
  const stripeHours = stalls * HOURS_PER_STALL;

  const addOnsInput = Array.isArray(input.addOns) ? input.addOns : [];
  const addOns = addOnsInput
    .filter(item => item && item.enabled !== false)
    .map((item, index) => {
      const label = item.label?.trim() || item.id || `Add-on ${index + 1}`;
      return {
        id: item.id || `addon-${index + 1}`,
        label,
        hours: number(item.hours ?? 0, `${label}: hours`),
        parts: number(item.parts ?? 0, `${label}: parts`),
      };
    });
  const addOnHours = addOns.reduce((sum, item) => sum + item.hours, 0);
  const addOnParts = addOns.reduce((sum, item) => sum + item.parts, 0);
  const sandHours = sand ? 0.15 + totalGallons * 0.01 : 0;

  const rawOnSite = applyHours + oilHours + crackHours + stripeHours + addOnHours + sandHours + setupHours;
  const minimumApplied = rawOnSite < minOnSiteHours && totalSquareFeet > 0;
  const onSiteHours = minimumApplied ? minOnSiteHours : rawOnSite;
  const travelHours = (2 * milesOneWay) / speedMph;
  const totalHours = onSiteHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const sealerCost = totalGallons * sealerPerGallon;
  const primerGallons = oilSpots * PRIMER_GALLONS_PER_SPOT;
  const primerCost = primerGallons * primerPerGallon;
  const crackCost = crackFeet * crackFillerPerFoot;
  const sandBags = sand ? (totalGallons * SAND_LBS_PER_GALLON) / LBS_PER_SAND_BAG : 0;
  const sandCost = sandBags * sandPerBag;
  const paintCost = stalls * paintPerStall;
  const materials = sealerCost + primerCost + crackCost + sandCost + paintCost + addOnParts;
  const directCost = laborCost + materials + tripFee + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    surfaces: surfaces.map(surface => ({
      ...surface,
      hoursShare: applyHours === 0 ? 0 : surface.applyHours / applyHours * 100,
    })),
    totalSquareFeet,
    totalGallons,
    coatPasses,
    condition,
    coverageMult,
    method,
    sqFtPerCrewHour,
    applyHours,
    oilHours,
    crackHours,
    stripeHours,
    sandHours,
    addOnHours,
    addOns,
    setupHours,
    rawOnSite,
    minimumApplied,
    onSiteHours,
    travelHours,
    totalHours,
    loadedWage,
    laborCost,
    sealerCost,
    primerGallons,
    primerCost,
    crackCost,
    sandBags,
    sandCost,
    paintCost,
    materials,
    tripFee,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: totalSquareFeet === 0 ? null : price / totalSquareFeet,
    pricePerGallon: totalGallons === 0 ? null : price / totalGallons,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      perSqFt: totalSquareFeet === 0 ? null : proposedPrice / totalSquareFeet,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
