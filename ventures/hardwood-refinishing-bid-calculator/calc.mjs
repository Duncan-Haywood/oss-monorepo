// Pure bid arithmetic for hardwood floor refinishing (sand-and-finish /
// screen-and-recoat). No network, no state: every square foot, tread count,
// wage, and adder is an input, so the result stays a transparent calculation
// the contractor can check against their own invoices rather than a claim
// about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "price per square foot" quote treats a 400 sq ft living room of
// screen-and-recoat as the same job as 400 sq ft of hallway plus fourteen
// stair treads, two closets, a stain change, and a three-coat waterborne
// system. Stairs, closets, stain, and extra coats do not scale with the
// room square footage the homeowner measures. Matching a cheaper
// per-square-foot quote written for a same-color screen-and-recoat is how
// a sold sand-and-stain job becomes a loss.
//
// Distinct from a flooring *install* takeoff (LVP / hardwood / tile waste
// and tear-out). This prices refinishing existing hardwood.

export const STAIR_SQ_FT_PER_TREAD = 4;

export const METHOD_PRESETS = Object.freeze([
  { id: 'screen', label: 'Screen and recoating (same color)', hoursPer100: 3.5, baseCoats: 2 },
  { id: 'full_sand', label: 'Full sand (cut-in and field)', hoursPer100: 8, baseCoats: 3 },
]);

export const STAIN_PRESETS = Object.freeze([
  { id: 'poly_only', label: 'Poly / waterborne only', staining: false, extraCoats: 0 },
  { id: 'stain', label: 'Stain then finish', staining: true, extraCoats: 0 },
  { id: 'color_change', label: 'Stain color change (extra coat)', staining: true, extraCoats: 1 },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '400 sq ft living room, screen-and-recoat',
    floorSqFt: 400,
    treads: 0,
    closets: 0,
    methodId: 'screen',
    stainId: 'poly_only',
    furnitureHours: 2,
    repairHours: 0.5,
  },
  {
    label: '800 sq ft first floor, full sand, 12 stairs',
    floorSqFt: 800,
    treads: 12,
    closets: 2,
    methodId: 'full_sand',
    stainId: 'poly_only',
    furnitureHours: 3,
    repairHours: 1.5,
  },
  {
    label: '1,200 sq ft ranch, sand and stain',
    floorSqFt: 1200,
    treads: 0,
    closets: 4,
    methodId: 'full_sand',
    stainId: 'stain',
    furnitureHours: 5,
    repairHours: 2,
  },
  {
    label: '250 sq ft hallway + 14 treads (stairs trap)',
    floorSqFt: 250,
    treads: 14,
    closets: 0,
    methodId: 'full_sand',
    stainId: 'stain',
    furnitureHours: 1,
    repairHours: 1,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export function suggestedHoursPer100(methodId) {
  const preset = METHOD_PRESETS.find((item) => item.id === methodId);
  if (!preset) throw new Error('Unknown refinish method');
  return preset.hoursPer100;
}

export function suggestedBaseCoats(methodId) {
  const preset = METHOD_PRESETS.find((item) => item.id === methodId);
  if (!preset) throw new Error('Unknown refinish method');
  return preset.baseCoats;
}

export function suggestedStain(stainId) {
  const preset = STAIN_PRESETS.find((item) => item.id === stainId);
  if (!preset) throw new Error('Unknown stain choice');
  return { staining: preset.staining, extraCoats: preset.extraCoats };
}

export function stairMaterialSqFt(treads, sqFtPerTread = STAIR_SQ_FT_PER_TREAD) {
  return number(treads, 'Stair treads') * number(sqFtPerTread, 'Square feet per tread');
}

export function gallonCount(area, coats, coverage) {
  const finishArea = number(area, 'Finish area');
  const coatCount = number(coats, 'Coats');
  const perGallon = number(coverage, 'Coverage', { allowZero: false });
  if (finishArea === 0 || coatCount === 0) return 0;
  return Math.ceil((finishArea * coatCount) / perGallon);
}

/**
 * Price a hardwood refinishing job from field square footage, stair treads,
 * closets, method, stain, coats, and the contractor's own costs.
 *
 * @param {object} input
 * @param {number} input.floorSqFt
 * @param {number} input.treads
 * @param {number} input.closets
 * @param {number} input.hoursPer100
 * @param {number} input.hoursPerTread
 * @param {number} input.hoursPerCloset
 * @param {number} input.methodLaborFactor
 * @param {boolean} input.staining
 * @param {number} input.stainHoursPer100
 * @param {number} input.extraCoats
 * @param {number} input.extraCoatHoursPer100
 * @param {number} input.furnitureHours
 * @param {number} input.repairHours
 * @param {number} input.baseCoats
 * @param {number} input.finishCoverage
 * @param {number} input.stainCoverage
 * @param {number} input.finishCost
 * @param {number} input.stainCost
 * @param {number} input.suppliesPer100
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.travelAndEquipment
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} [input.proposedPrice]
 */
export function calculateBid(input) {
  const floorSqFt = number(input.floorSqFt ?? 0, 'Floor square feet');
  const treads = number(input.treads ?? 0, 'Stair treads');
  const closets = number(input.closets ?? 0, 'Closets');
  if (floorSqFt + treads === 0) {
    throw new Error('Add floor square footage or at least one stair tread');
  }

  const hoursPer100 = number(input.hoursPer100 ?? 0, 'Hours per 100 sq ft', { allowZero: false });
  const hoursPerTread = number(input.hoursPerTread ?? 0, 'Hours per stair tread');
  const hoursPerCloset = number(input.hoursPerCloset ?? 0, 'Hours per closet');
  const methodLaborFactor = number(input.methodLaborFactor ?? 0, 'Method labor factor', { allowZero: false });
  const staining = Boolean(input.staining);
  const stainHoursPer100 = number(input.stainHoursPer100 ?? 0, 'Stain hours per 100 sq ft');
  const extraCoats = number(input.extraCoats ?? 0, 'Extra coats');
  const extraCoatHoursPer100 = number(input.extraCoatHoursPer100 ?? 0, 'Extra-coat hours per 100 sq ft');
  const furnitureHours = number(input.furnitureHours ?? 0, 'Furniture hours');
  const repairHours = number(input.repairHours ?? 0, 'Repair hours');
  const baseCoats = number(input.baseCoats ?? 0, 'Base coats', { allowZero: false });
  const finishCoverage = number(input.finishCoverage ?? 0, 'Finish coverage', { allowZero: false });
  const stainCoverage = number(input.stainCoverage ?? 0, 'Stain coverage', { allowZero: false });
  const finishCost = number(input.finishCost ?? 0, 'Finish cost');
  const stainCost = number(input.stainCost ?? 0, 'Stain cost');
  const suppliesPer100 = number(input.suppliesPer100 ?? 0, 'Supplies per 100 sq ft');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const stairSqFt = stairMaterialSqFt(treads);
  const finishArea = floorSqFt + stairSqFt;
  const totalCoats = baseCoats + extraCoats;
  const finishGallons = gallonCount(finishArea, totalCoats, finishCoverage);
  const stainGallons = staining ? gallonCount(finishArea, 1, stainCoverage) : 0;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  // Method factor applies to the field only — stairs, closets, furniture,
  // and repairs stay their own hours. Stain and extra coats follow the
  // finish area so a 14-tread hallway picks up stain time the square-foot
  // quote never sees.
  const floorHours = (floorSqFt / 100) * hoursPer100 * methodLaborFactor;
  const stairHours = treads * hoursPerTread;
  const closetHours = closets * hoursPerCloset;
  const stainHours = staining ? (finishArea / 100) * stainHoursPer100 : 0;
  const extraCoatHours = extraCoats * (finishArea / 100) * extraCoatHoursPer100;
  const totalHours = floorHours + stairHours + closetHours + stainHours + extraCoatHours + furnitureHours + repairHours;
  const laborCost = totalHours * loadedWage;

  const finishTotal = finishGallons * finishCost;
  const stainTotal = stainGallons * stainCost;
  const supplies = (finishArea / 100) * suppliesPer100;
  const materialCost = finishTotal + stainTotal + supplies;
  const softCost = travelAndEquipment;

  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);

  return {
    floorSqFt,
    treads,
    closets,
    stairSqFt,
    finishArea,
    staining,
    extraCoats,
    baseCoats,
    totalCoats,
    finishGallons,
    stainGallons,
    loadedWage,
    floorHours,
    stairHours,
    closetHours,
    stainHours,
    extraCoatHours,
    furnitureHours,
    repairHours,
    totalHours,
    laborCost,
    finishTotal,
    stainTotal,
    supplies,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: floorSqFt === 0 ? null : price / floorSqFt,
    costPerSqFt: floorSqFt === 0 ? null : totalCost / floorSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      field: hourShare(floorHours),
      stairs: hourShare(stairHours),
      closets: hourShare(closetHours),
      stain: hourShare(stainHours + extraCoatHours),
      furniture: hourShare(furnitureHours + repairHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: floorSqFt === 0 ? null : proposedPrice / floorSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the contractor can paste into a
 * proposal. Costs and wages are omitted on purpose — this is the
 * customer-facing side.
 */
export function formatBidSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perSqFt = result.pricePerSqFt === null ? 'n/a (stairs-only takeoff)' : `${money(result.pricePerSqFt)} / sq ft of field`;
  return [
    'HARDWOOD FLOOR REFINISHING BID',
    '',
    `Proposed refinish price: ${money(result.price)}`,
    `Scope: ${result.floorSqFt.toLocaleString('en-US')} sq ft of field, ${result.treads} stair tread${result.treads === 1 ? '' : 's'}, ${result.closets} closet${result.closets === 1 ? '' : 's'}`,
    `Price per field square foot: ${perSqFt}`,
    `Refinish labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Field: ${result.floorSqFt.toLocaleString('en-US')} sq ft`,
    `- Stair treads: ${result.treads} (about ${result.stairSqFt} sq ft of tread and riser)`,
    `- Closets: ${result.closets}`,
    `- Finish coats: ${result.totalCoats} (${result.finishGallons} gallon${result.finishGallons === 1 ? '' : 's'})`,
    result.staining ? `- Stain: ${result.stainGallons} gallon${result.stainGallons === 1 ? '' : 's'}` : '- No stain (poly / waterborne only)',
    result.extraCoats > 0 ? `- Extra finish coat(s) for color change: ${result.extraCoats}` : '- No extra color-change coat',
    '',
    'This is a draft for review. Confirm square footage, stair count, stain, coats, furniture move, repairs, and all pricing before sending. It is not a flooring specification or a guarantee of adhesion or sheen.',
  ].join('\n');
}
