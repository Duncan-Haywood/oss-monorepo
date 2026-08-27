// Pure bid arithmetic for a residential attic blown-in insulation job. No
// network, no state: every area, R-value, bag yield, and wage is an input, so
// the result stays a transparent calculation the contractor can check against
// their own bag invoices and payroll rather than a claim about what any attic
// "should" cost or what R-value a climate zone "requires."
//
// The method is the one the trade actually loses money on when they skip it:
// a flat price-per-square-foot cannot see that bags come from the R-value
// *delta*, not the floor area. An attic already at R-30 going to R-38 is a
// different truckload from the same attic sitting at R-13 going to R-49, and
// air sealing is a different labor list from the blow. That is what separates
// a defensible quote from a "$1.50 a foot" postcard special.

export const PRODUCT_PRESETS = Object.freeze([
  {
    id: 'cellulose',
    label: 'Loose-fill cellulose',
    rPerInch: 3.7,
    cuFtPerBag: 25,
    pricePerBag: 14,
    blowHoursPer1000: 1.4,
  },
  {
    id: 'fiberglass',
    label: 'Blown fiberglass',
    rPerInch: 2.5,
    cuFtPerBag: 40,
    pricePerBag: 38,
    blowHoursPer1000: 1.15,
  },
  {
    id: 'rockwool',
    label: 'Blown mineral wool',
    rPerInch: 3.2,
    cuFtPerBag: 20,
    pricePerBag: 42,
    blowHoursPer1000: 1.55,
  },
]);

export const ADD_ON_PRESETS = Object.freeze([
  { id: 'hatchDam', label: 'Attic hatch dam / insulated cover', hours: 0.6, parts: 45 },
  { id: 'recessedCans', label: 'Recessed-light boxes / IC covers', hours: 1.8, parts: 85 },
]);

export const HOURS_PER_BAFFLE = 0.04;
export const HOURS_PER_PENETRATION = 0.12;
export const REMOVAL_HOURS_PER_1000 = 2.4;
export const AIR_SEAL_PARTS_PER_PENETRATION = 2.25;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Extra haul-and-rake time when the added depth is a pile, not a dusting.
 * These are ballpark starting points, not a manufacturer coverage chart.
 */
export function depthMultiplier(inchesAdded) {
  const inches = number(inchesAdded ?? 0, 'Inches added');
  if (inches > 14) return 1.45;
  if (inches > 10) return 1.25;
  if (inches > 6) return 1.1;
  return 1.0;
}

/**
 * Price an attic blown-in job from its areas, product, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, lengthFt: number, widthFt: number, existingR: number, targetR: number, vaulted?: boolean}>} input.areas
 * @param {number} input.rPerInch
 * @param {number} input.cuFtPerBag
 * @param {number} input.pricePerBag
 * @param {number} input.blowHoursPer1000
 * @param {number} input.baffleCount
 * @param {number} input.bafflePrice
 * @param {number} input.penetrations
 * @param {boolean} input.removeExisting
 * @param {number} input.removalHoursPer1000
 * @param {Array<{id?: string, label?: string, hours: number, parts: number, enabled?: boolean}>} [input.addOns]
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.milesOneWay
 * @param {number} input.speedMph
 * @param {number} input.setupHours
 * @param {number} input.minOnSiteHours
 * @param {number} input.tripFee
 * @param {number} input.dumpsterCost
 * @param {number} input.otherCost
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const areasInput = Array.isArray(input.areas) ? input.areas : [];
  if (areasInput.length === 0) throw new Error('Add at least one attic area to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const speedMph = number(input.speedMph ?? 0, 'Travel speed', { allowZero: false });
  const setupHours = number(input.setupHours ?? 0, 'Setup hours');
  const minOnSiteHours = number(input.minOnSiteHours ?? 0, 'Minimum on-site hours');
  const tripFee = number(input.tripFee ?? 0, 'Trip / truck fee');
  const dumpsterCost = number(input.dumpsterCost ?? 0, 'Dumpster');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const rPerInch = number(input.rPerInch ?? 0, 'R-value per inch', { min: 0.1, allowZero: false });
  const cuFtPerBag = number(input.cuFtPerBag ?? 0, 'Cubic feet per bag', { min: 0.1, allowZero: false });
  const pricePerBag = number(input.pricePerBag ?? 0, 'Price per bag');
  const blowHoursPer1000 = number(input.blowHoursPer1000 ?? 0, 'Blow hours per 1,000 sq ft');
  const baffleCount = number(input.baffleCount ?? 0, 'Baffle count');
  const bafflePrice = number(input.bafflePrice ?? 0, 'Baffle price');
  const penetrations = number(input.penetrations ?? 0, 'Penetrations');
  const removalHoursPer1000 = number(
    input.removalHoursPer1000 ?? REMOVAL_HOURS_PER_1000,
    'Removal hours per 1,000 sq ft',
  );
  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const removeExisting = Boolean(input.removeExisting);

  const areas = areasInput.map((area, index) => {
    const label = area.name?.trim() || `Area ${index + 1}`;
    const lengthFt = number(area.lengthFt ?? 0, `${label}: length`);
    const widthFt = number(area.widthFt ?? 0, `${label}: width`);
    const existingR = number(area.existingR ?? 0, `${label}: existing R`);
    const targetR = number(area.targetR ?? 0, `${label}: target R`);
    const vaulted = Boolean(area.vaulted);
    const floorSqFt = lengthFt * widthFt;
    const rToAdd = vaulted ? 0 : Math.max(0, targetR - existingR);
    const inchesAdded = rToAdd / rPerInch;
    const cuFt = floorSqFt * inchesAdded / 12;
    return {
      name: label,
      lengthFt,
      widthFt,
      existingR,
      targetR,
      vaulted,
      floorSqFt,
      rToAdd,
      inchesAdded,
      cuFt,
      depthMultiplier: depthMultiplier(inchesAdded),
      alreadyAtTarget: !vaulted && targetR > 0 && existingR >= targetR,
    };
  });

  const atticSqFt = areas.reduce((sum, area) => sum + area.floorSqFt, 0);
  const vaultedSqFt = areas.reduce((sum, area) => sum + (area.vaulted ? area.floorSqFt : 0), 0);
  const blowableSqFt = atticSqFt - vaultedSqFt;
  const cuFt = areas.reduce((sum, area) => sum + area.cuFt, 0);
  const bags = cuFt === 0 ? 0 : Math.ceil(cuFt / cuFtPerBag);
  const bagMaterial = bags * pricePerBag;
  const weightedInches = blowableSqFt === 0
    ? 0
    : areas.reduce((sum, area) => sum + area.inchesAdded * (area.vaulted ? 0 : area.floorSqFt), 0) / blowableSqFt;
  const weightedRAdded = weightedInches * rPerInch;

  const blowHours = areas.reduce((sum, area) => {
    if (area.vaulted || area.cuFt === 0) return sum;
    return sum + (area.floorSqFt / 1000) * blowHoursPer1000 * area.depthMultiplier;
  }, 0);
  const airSealHours = penetrations * HOURS_PER_PENETRATION;
  const baffleHours = baffleCount * HOURS_PER_BAFFLE;
  const removalHours = removeExisting ? (blowableSqFt / 1000) * removalHoursPer1000 : 0;
  const airSealParts = penetrations * AIR_SEAL_PARTS_PER_PENETRATION;
  const baffleMaterial = baffleCount * bafflePrice;

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

  const rawOnSite = blowHours + airSealHours + baffleHours + removalHours + addOnHours + setupHours;
  const hasScope = atticSqFt > 0 || penetrations > 0 || baffleCount > 0 || addOnHours > 0;
  const minimumApplied = rawOnSite < minOnSiteHours && hasScope;
  const onSiteHours = minimumApplied ? minOnSiteHours : rawOnSite;
  const travelHours = (2 * milesOneWay) / speedMph;
  const totalHours = onSiteHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const dumpster = removeExisting ? dumpsterCost : 0;
  const directCost = laborCost + bagMaterial + baffleMaterial + airSealParts + addOnParts + dumpster + tripFee + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;
  const productiveHours = blowHours + airSealHours + baffleHours + removalHours;

  return {
    areas: areas.map(area => ({
      ...area,
      areaShare: atticSqFt === 0 ? 0 : area.floorSqFt / atticSqFt * 100,
    })),
    atticSqFt,
    blowableSqFt,
    vaultedSqFt,
    cuFt,
    bags,
    rPerInch,
    cuFtPerBag,
    pricePerBag,
    weightedInches,
    weightedRAdded,
    removeExisting,
    addOns,
    loadedWage,
    blowHours,
    airSealHours,
    baffleHours,
    removalHours,
    addOnHours,
    addOnParts,
    airSealParts,
    bagMaterial,
    baffleMaterial,
    setupHours,
    rawOnSiteHours: rawOnSite,
    onSiteHours,
    minimumApplied,
    minOnSiteHours,
    travelHours,
    totalHours,
    laborCost,
    dumpster,
    tripFee,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerAtticSqFt: atticSqFt === 0 ? null : price / atticSqFt,
    pricePerBlowableSqFt: blowableSqFt === 0 ? null : price / blowableSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    airSealShareOfLabor: productiveHours === 0
      ? null
      : airSealHours / productiveHours * 100,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
