// Pure bid arithmetic for a residential deck-building job. No network, no
// state: every section size, height above grade, material system, railing
// run, and wage is an input, so the result stays a transparent calculation
// the contractor can check against their own lumber tickets and payroll
// rather than a claim about what any backyard "should" cost.
//
// The method is the one the trade actually loses money on when they skip it:
// a flat price-per-square-foot cannot see height, railing, or stairs. A 14x20
// patio deck 10 inches off grade is not a 14x20 elevated deck 8 feet up —
// the second one needs more posts, guardrail the square footage never
// counted, fall-protection time, and usually a stair run. That is what
// separates a defensible quote from a "$28 a foot" postcard special.

/** Typical residential guard trigger, in feet (30 inches). Not a code table. */
export const GUARD_HEIGHT_FT = 2.5;
/** Height at which framing, posts, and access jump again. */
export const ELEVATED_HEIGHT_FT = 6;

export const HEIGHT_GUARD_HOURS_MULT = 1.25;
export const HEIGHT_ELEVATED_HOURS_MULT = 1.55;
export const HEIGHT_GUARD_POST_ADD = 0.35;
export const HEIGHT_ELEVATED_POST_ADD = 0.85;

export const DEFAULT_DISPOSAL_PER_SF = 2.4;
export const DEFAULT_FOOTING_EACH = 85;
export const DEMO_HOURS_PER_SF = 0.08;
export const POST_BAY_FT = 7;
export const STAIR_BASE_HOURS = 4.5;
export const STAIR_HOURS_PER_RISER = 0.18;
export const STAIR_HOURS_PER_WIDTH_FT = 0.25;
export const STAIR_BASE_PARTS = 85;
export const STAIR_PARTS_PER_RISER = 14;
export const STAIR_PARTS_PER_WIDTH_FT = 18;

export const MATERIAL_PRESETS = Object.freeze([
  {
    id: 'pt',
    label: 'Pressure-treated pine',
    deckingPerSf: 3.8,
    framingPerSf: 4.2,
    deckingHoursPerSf: 0.12,
    framingHoursPerSf: 0.1,
    wastePct: 8,
  },
  {
    id: 'cedar',
    label: 'Cedar / redwood',
    deckingPerSf: 7.5,
    framingPerSf: 4.2,
    deckingHoursPerSf: 0.14,
    framingHoursPerSf: 0.1,
    wastePct: 10,
  },
  {
    id: 'composite',
    label: 'Composite (capped)',
    deckingPerSf: 12.5,
    framingPerSf: 4.4,
    deckingHoursPerSf: 0.16,
    framingHoursPerSf: 0.11,
    wastePct: 12,
  },
  {
    id: 'pvc',
    label: 'PVC / cellular',
    deckingPerSf: 14,
    framingPerSf: 4.4,
    deckingHoursPerSf: 0.17,
    framingHoursPerSf: 0.11,
    wastePct: 12,
  },
]);

export const RAILING_PRESETS = Object.freeze([
  { id: 'wood', label: 'Wood / PT rail', hoursPerLf: 0.45, materialPerLf: 28 },
  { id: 'aluminum', label: 'Aluminum / metal', hoursPerLf: 0.35, materialPerLf: 55 },
  { id: 'cable', label: 'Cable rail', hoursPerLf: 0.65, materialPerLf: 72 },
  { id: 'glass', label: 'Glass panel', hoursPerLf: 0.8, materialPerLf: 140 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function presetById(list, id, fallbackId) {
  return list.find(item => item.id === id) || list.find(item => item.id === fallbackId) || list[0];
}

/**
 * Extra framing/post hours once the deck is no longer a patio platform.
 * These are ballpark starting points, not an IRC table or a stamped calc.
 */
export function heightHoursMultiplier(heightFt) {
  const height = number(heightFt ?? 0, 'Height above grade');
  if (height >= ELEVATED_HEIGHT_FT) return HEIGHT_ELEVATED_HOURS_MULT;
  if (height >= GUARD_HEIGHT_FT) return HEIGHT_GUARD_HOURS_MULT;
  return 1;
}

/** Extra post-set hours per 100 sf once a guard or elevated frame is in play. */
export function heightPostHoursPerSf(heightFt) {
  const height = number(heightFt ?? 0, 'Height above grade');
  if (height >= ELEVATED_HEIGHT_FT) return HEIGHT_ELEVATED_POST_ADD / 100;
  if (height >= GUARD_HEIGHT_FT) return HEIGHT_GUARD_POST_ADD / 100;
  return 0;
}

export function estimatedFootings(squareFeet, heightFt) {
  const sf = number(squareFeet ?? 0, 'Square feet');
  const height = number(heightFt ?? 0, 'Height above grade');
  if (sf <= 0) return 0;
  const bay = height >= ELEVATED_HEIGHT_FT ? POST_BAY_FT - 1 : POST_BAY_FT;
  return Math.max(4, Math.ceil(sf / (bay * bay)));
}

export function stairHours(risers, widthFt) {
  const riseCount = number(risers ?? 0, 'Risers');
  const width = number(widthFt ?? 0, 'Stair width');
  if (riseCount === 0 && width === 0) return 0;
  return STAIR_BASE_HOURS + riseCount * STAIR_HOURS_PER_RISER + width * STAIR_HOURS_PER_WIDTH_FT;
}

export function stairParts(risers, widthFt) {
  const riseCount = number(risers ?? 0, 'Risers');
  const width = number(widthFt ?? 0, 'Stair width');
  if (riseCount === 0 && width === 0) return 0;
  return STAIR_BASE_PARTS + riseCount * STAIR_PARTS_PER_RISER + width * STAIR_PARTS_PER_WIDTH_FT;
}

/**
 * Price a deck job from its surfaces, railing, stairs, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, lengthFt: number, widthFt: number, heightFt?: number, material?: string}>} input.sections
 * @param {number} input.railingLf
 * @param {string} [input.railingStyle]
 * @param {Array<{name?: string, runs?: number, widthFt: number, risers: number}>} [input.stairs]
 * @param {number} input.demoSf
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.milesOneWay
 * @param {number} input.speedMph
 * @param {number} input.setupHours
 * @param {number} input.minOnSiteHours
 * @param {number} input.tripFee
 * @param {number} input.disposalPerSf
 * @param {number} input.footingEach
 * @param {number} input.permitCost
 * @param {number} input.otherCost
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const sectionsInput = Array.isArray(input.sections) ? input.sections : [];
  if (sectionsInput.length === 0) throw new Error('Add at least one deck section to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const speedMph = number(input.speedMph ?? 0, 'Travel speed', { allowZero: false });
  const setupHours = number(input.setupHours ?? 0, 'Setup hours');
  const minOnSiteHours = number(input.minOnSiteHours ?? 0, 'Minimum on-site hours');
  const tripFee = number(input.tripFee ?? 0, 'Trip / truck fee');
  const disposalPerSf = number(input.disposalPerSf ?? DEFAULT_DISPOSAL_PER_SF, 'Disposal per sq ft');
  const footingEach = number(input.footingEach ?? DEFAULT_FOOTING_EACH, 'Cost per footing');
  const permitCost = number(input.permitCost ?? 0, 'Permit');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const railingLf = number(input.railingLf ?? 0, 'Railing lineal feet');
  const railingStyle = presetById(RAILING_PRESETS, input.railingStyle, 'wood');
  const demoSf = number(input.demoSf ?? 0, 'Demo square feet');
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const sections = sectionsInput.map((section, index) => {
    const label = section.name?.trim() || `Section ${index + 1}`;
    const material = presetById(MATERIAL_PRESETS, section.material, 'pt');
    const lengthFt = number(section.lengthFt ?? 0, `${label}: length`);
    const widthFt = number(section.widthFt ?? 0, `${label}: width`);
    const heightFt = number(section.heightFt ?? 0, `${label}: height`);
    const squareFeet = lengthFt * widthFt;
    const wasteMult = 1 + material.wastePct / 100;
    const heightMult = heightHoursMultiplier(heightFt);
    const postHours = squareFeet * heightPostHoursPerSf(heightFt);
    const framingHours = squareFeet * material.framingHoursPerSf * heightMult + postHours;
    const deckingHours = squareFeet * material.deckingHoursPerSf;
    const hours = framingHours + deckingHours;
    const deckingMaterial = squareFeet * material.deckingPerSf * wasteMult;
    const framingMaterial = squareFeet * material.framingPerSf * heightMult;
    const materialCost = deckingMaterial + framingMaterial;
    const footings = estimatedFootings(squareFeet, heightFt);
    return {
      name: label,
      material: material.id,
      materialLabel: material.label,
      lengthFt,
      widthFt,
      heightFt,
      squareFeet,
      heightMult,
      needsGuard: heightFt >= GUARD_HEIGHT_FT,
      elevated: heightFt >= ELEVATED_HEIGHT_FT,
      framingHours,
      deckingHours,
      postHours,
      hours,
      deckingMaterial,
      framingMaterial,
      materialCost,
      footings,
    };
  });

  const stairsInput = Array.isArray(input.stairs) ? input.stairs : [];
  const stairs = stairsInput
    .filter(row => row && (Number(row.runs ?? 1) > 0 || Number(row.risers ?? 0) > 0 || Number(row.widthFt ?? 0) > 0))
    .map((row, index) => {
      const label = row.name?.trim() || `Stair ${index + 1}`;
      const runs = number(row.runs ?? 1, `${label}: runs`, { allowZero: false });
      const widthFt = number(row.widthFt ?? 0, `${label}: width`);
      const risers = number(row.risers ?? 0, `${label}: risers`);
      const unitHours = stairHours(risers, widthFt);
      const unitParts = stairParts(risers, widthFt);
      return {
        name: label,
        runs,
        widthFt,
        risers,
        unitHours,
        unitParts,
        hours: unitHours * runs,
        materialCost: unitParts * runs,
      };
    });

  const deckSquareFeet = sections.reduce((sum, row) => sum + row.squareFeet, 0);
  const sectionHours = sections.reduce((sum, row) => sum + row.hours, 0);
  const sectionMaterial = sections.reduce((sum, row) => sum + row.materialCost, 0);
  const footingCount = sections.reduce((sum, row) => sum + row.footings, 0);
  const footingCost = footingCount * footingEach;
  const stairHoursTotal = stairs.reduce((sum, row) => sum + row.hours, 0);
  const stairMaterial = stairs.reduce((sum, row) => sum + row.materialCost, 0);
  const railingHours = railingLf * railingStyle.hoursPerLf;
  const railingMaterial = railingLf * railingStyle.materialPerLf;
  const demoHours = demoSf * DEMO_HOURS_PER_SF;
  const disposal = demoSf * disposalPerSf;

  const productiveHours = sectionHours + stairHoursTotal + railingHours + demoHours;
  const travelHours = 2 * milesOneWay / speedMph;
  const onSiteHours = Math.max(setupHours + productiveHours, minOnSiteHours);
  const laborHours = onSiteHours + travelHours;
  const laborCost = laborHours * loadedWage;

  const elevatedHours = sections
    .filter(row => row.needsGuard)
    .reduce((sum, row) => sum + row.hours, 0);
  const heightShareOfLabor = productiveHours === 0 ? 0 : elevatedHours / productiveHours * 100;
  const needsGuard = sections.some(row => row.squareFeet > 0 && row.needsGuard);
  const missingGuard = needsGuard && railingLf === 0;

  const directCost = laborCost + sectionMaterial + stairMaterial + railingMaterial
    + footingCost + disposal + tripFee + permitCost + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;
  const railingShareOfPrice = price === 0 ? 0 : (railingMaterial + railingHours * loadedWage) / price * 100;
  const pricePerSf = deckSquareFeet === 0 ? null : price / deckSquareFeet;
  const effectiveHourlyRate = laborHours === 0 ? null : price / laborHours;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    sections,
    stairs,
    deckSquareFeet,
    loadedWage,
    railingLf,
    railingStyle: railingStyle.id,
    railingStyleLabel: railingStyle.label,
    railingHours,
    railingMaterial,
    stairHours: stairHoursTotal,
    stairMaterial,
    demoSf,
    demoHours,
    disposal,
    footingCount,
    footingCost,
    sectionHours,
    sectionMaterial,
    productiveHours,
    travelHours,
    onSiteHours,
    laborHours,
    laborCost,
    tripFee,
    permitCost,
    otherCost,
    directCost,
    overhead,
    totalCost,
    price,
    profit,
    breakEvenPrice: totalCost,
    pricePerSf,
    effectiveHourlyRate,
    heightShareOfLabor,
    railingShareOfPrice,
    needsGuard,
    missingGuard,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      belowBreakEven: proposedPrice < totalCost,
      perSf: deckSquareFeet === 0 ? null : proposedPrice / deckSquareFeet,
    },
  };
}
