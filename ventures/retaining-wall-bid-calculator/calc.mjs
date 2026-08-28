// Pure bid arithmetic for a retaining-wall / hardscape install.
// No network, no state: every length, height, wage, and adder is an
// input, so the result stays a transparent calculation the contractor
// can check against their own invoices rather than a claim about what
// any wall "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// per-linear-foot quote treats a 40 ft, 3 ft garden wall as the same
// job as a 40 ft, 6 ft engineered wall. Face area, drain-stone volume,
// and geogrid layers grow with height. An engineer stamp and a permit
// appear as a step, not a foot. Matching a cheaper per-foot quote
// written for a short garden wall is how a sold job becomes a loss.

// Wall-type labor multipliers and a starting face-material cost.
// These are ballpark figures to start from, NOT an industry standard:
// real hours depend on the crew, the soil, access, and the block.
export const WALL_TYPE_PRESETS = Object.freeze([
  { id: 'segmental', label: 'Segmental block (SRW)', factor: 1.0, blockCostPerSf: 12 },
  { id: 'timber', label: 'Timber / sleeper', factor: 0.9, blockCostPerSf: 8 },
  { id: 'poured', label: 'Poured concrete (formed)', factor: 1.4, blockCostPerSf: 18 },
  { id: 'boulder', label: 'Boulder / natural stone', factor: 1.3, blockCostPerSf: 15 },
]);

// Height multiplies face labor only. Drain pipe still runs the length;
// the excavator still has to show up once. Taller walls need more lifts,
// more compaction, and often scaffolding or a machine at the face.
export const HEIGHT_PRESETS = Object.freeze([
  { id: 'garden', label: 'Garden wall, under 3 ft exposed', factor: 1.0, maxExposed: 3 },
  { id: 'low', label: 'Low wall, 3–4 ft exposed', factor: 1.1, maxExposed: 4 },
  { id: 'mid', label: 'Mid wall, 4–6 ft exposed', factor: 1.25, maxExposed: 6 },
  { id: 'tall', label: 'Tall / engineered, over 6 ft', factor: 1.45, maxExposed: Infinity },
]);

// Engineer and permit extras that a per-foot quote almost always
// forgets. Many US jurisdictions treat ~4 ft exposed as the line
// where a permit or an engineer enters. Fees are starting points.
export const ENGINEER_PRESETS = Object.freeze([
  { id: 'none', label: 'No permit or engineer (short garden wall)', fee: 0 },
  { id: 'permit', label: 'Permit only', fee: 250 },
  { id: 'engineer', label: 'Engineer stamp + permit (typical over 4 ft)', fee: 1800 },
]);

export const WALL_PRESETS = Object.freeze([
  {
    label: '40 ft × 3 ft garden wall',
    lengthFeet: 40,
    exposedHeightFeet: 3,
    embedmentFeet: 0.67,
    corners: 0,
    geogridLayers: 0,
    excavationHours: 4,
  },
  {
    label: '40 ft × 4 ft, first geogrid layer',
    lengthFeet: 40,
    exposedHeightFeet: 4,
    embedmentFeet: 0.75,
    corners: 2,
    geogridLayers: 1,
    excavationHours: 8,
  },
  {
    label: '50 ft × 6 ft engineered',
    lengthFeet: 50,
    exposedHeightFeet: 6,
    embedmentFeet: 0.75,
    corners: 2,
    geogridLayers: 2,
    excavationHours: 14,
  },
  {
    label: '80 ft × 4 ft with two corners',
    lengthFeet: 80,
    exposedHeightFeet: 4,
    embedmentFeet: 0.75,
    corners: 2,
    geogridLayers: 1,
    excavationHours: 12,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Typical geogrid layer count from exposed height. Under 4 ft: none.
 * At 4 ft: one layer. Every additional 2 ft of exposed height adds a
 * layer. Manufacturers and soils differ — this is a starting count,
 * not a design.
 */
export function suggestedGeogridLayers(exposedHeightFeet) {
  const height = number(exposedHeightFeet, 'Exposed height');
  if (height < 4) return 0;
  return 1 + Math.floor((height - 4) / 2);
}

/**
 * Height labor factor that matches HEIGHT_PRESETS for an exposed height.
 */
export function suggestedHeightFactor(exposedHeightFeet) {
  const height = number(exposedHeightFeet, 'Exposed height');
  const preset = HEIGHT_PRESETS.find((item) => height <= item.maxExposed);
  return (preset ?? HEIGHT_PRESETS[HEIGHT_PRESETS.length - 1]).factor;
}

/**
 * Price a retaining wall from length, height, drainage, geogrid, corners,
 * and the contractor's own cost structure.
 *
 * @param {object} input
 * @param {number} input.lengthFeet
 * @param {number} input.exposedHeightFeet
 * @param {number} input.embedmentFeet         Buried depth below grade.
 * @param {number} input.blockCostPerSf        Face material, per sq ft of face.
 * @param {number} input.capCostPerFoot
 * @param {number} input.stoneCostPerCuYd      Drain stone / gravel.
 * @param {number} input.stoneDepthFeet        Drain-column depth behind the wall.
 * @param {number} input.drainPipeCostPerFoot
 * @param {number} input.geogridLayers
 * @param {number} input.geogridDepthFeet      How far each layer runs back.
 * @param {number} input.geogridCostPerSqYd
 * @param {number} input.wallTypeFactor        Multiplier on face labor.
 * @param {number} input.heightFactor          Multiplier on face labor.
 * @param {number} input.hoursPerFaceSqFt      Easy-access segmental hours / sf.
 * @param {number} input.corners               90° corners that need extra cuts.
 * @param {number} input.hoursPerCorner
 * @param {number} input.excavationHours       Dig, compact, and backfill.
 * @param {number} input.drainHours            Pipe, fabric, and stone place.
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.engineerAndPermitFee
 * @param {number} input.travelAndEquipment    Machine, dump, and travel.
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const lengthFeet = number(input.lengthFeet ?? 0, 'Wall length', { allowZero: false });
  const exposedHeightFeet = number(input.exposedHeightFeet ?? 0, 'Exposed height', { allowZero: false });
  const embedmentFeet = number(input.embedmentFeet ?? 0, 'Embedment');
  const blockCostPerSf = number(input.blockCostPerSf ?? 0, 'Block cost per sq ft');
  const capCostPerFoot = number(input.capCostPerFoot ?? 0, 'Cap cost per foot');
  const stoneCostPerCuYd = number(input.stoneCostPerCuYd ?? 0, 'Drain stone cost');
  const stoneDepthFeet = number(input.stoneDepthFeet ?? 0, 'Drain-stone depth');
  const drainPipeCostPerFoot = number(input.drainPipeCostPerFoot ?? 0, 'Drain-pipe cost');
  const geogridLayers = number(input.geogridLayers ?? 0, 'Geogrid layers');
  const geogridDepthFeet = number(input.geogridDepthFeet ?? 0, 'Geogrid depth');
  const geogridCostPerSqYd = number(input.geogridCostPerSqYd ?? 0, 'Geogrid cost');
  const wallTypeFactor = number(input.wallTypeFactor ?? 0, 'Wall-type factor', { allowZero: false });
  const heightFactor = number(input.heightFactor ?? 0, 'Height factor', { allowZero: false });
  const hoursPerFaceSqFt = number(input.hoursPerFaceSqFt ?? 0, 'Hours per face sq ft', { allowZero: false });
  const corners = number(input.corners ?? 0, 'Corners');
  const hoursPerCorner = number(input.hoursPerCorner ?? 0, 'Hours per corner');
  const excavationHours = number(input.excavationHours ?? 0, 'Excavation hours');
  const drainHours = number(input.drainHours ?? 0, 'Drain hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const engineerAndPermitFee = number(input.engineerAndPermitFee ?? 0, 'Engineer and permit fee');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const totalHeightFeet = exposedHeightFeet + embedmentFeet;
  const faceAreaSqFt = lengthFeet * totalHeightFeet;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  // Face labor scales with face area, then wall type, then height.
  // Corners, excavation, and drain placement do not — a 90° corner
  // is the same extra cuts on a 30 ft wall as on an 80 ft wall.
  const faceHours = faceAreaSqFt * hoursPerFaceSqFt * wallTypeFactor * heightFactor;
  const cornerHours = corners * hoursPerCorner;
  const totalHours = faceHours + cornerHours + excavationHours + drainHours;
  const laborCost = totalHours * loadedWage;

  const blockCost = faceAreaSqFt * blockCostPerSf;
  const capCost = lengthFeet * capCostPerFoot;
  const stoneCuYd = (lengthFeet * totalHeightFeet * stoneDepthFeet) / 27;
  const stoneCost = stoneCuYd * stoneCostPerCuYd;
  const drainPipeCost = lengthFeet * drainPipeCostPerFoot;
  const geogridSqYd = (lengthFeet * geogridDepthFeet * geogridLayers) / 9;
  const geogridCost = geogridSqYd * geogridCostPerSqYd;
  const materialCost = blockCost + capCost + stoneCost + drainPipeCost + geogridCost;
  const softCost = engineerAndPermitFee + travelAndEquipment;

  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);

  return {
    lengthFeet,
    exposedHeightFeet,
    embedmentFeet,
    totalHeightFeet,
    faceAreaSqFt,
    loadedWage,
    wallTypeFactor,
    heightFactor,
    geogridLayers,
    geogridSqYd,
    stoneCuYd,
    corners,
    faceHours,
    cornerHours,
    excavationHours,
    drainHours,
    totalHours,
    laborCost,
    blockCost,
    capCost,
    stoneCost,
    drainPipeCost,
    geogridCost,
    materialCost,
    engineerAndPermitFee,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerFoot: price / lengthFeet,
    costPerFoot: totalCost / lengthFeet,
    pricePerFaceSqFt: faceAreaSqFt === 0 ? null : price / faceAreaSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    breakEvenPerFoot: totalCost / lengthFeet,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perFoot: proposedPrice / lengthFeet,
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
  return [
    'RETAINING WALL / HARDSCAPE BID',
    '',
    `Proposed install price: ${money(result.price)}`,
    `Wall: ${result.lengthFeet.toFixed(1)} ft long, ${result.exposedHeightFeet.toFixed(1)} ft exposed (${result.faceAreaSqFt.toFixed(0)} sq ft of face)`,
    `Price per linear foot: ${money(result.pricePerFoot)}`,
    `Install labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Face ${result.faceAreaSqFt.toFixed(0)} sq ft including ${result.embedmentFeet.toFixed(2)} ft embedment`,
    `- Drain stone: ${result.stoneCuYd.toFixed(1)} cu yd`,
    result.geogridLayers > 0
      ? `- Geogrid: ${result.geogridLayers} layer${result.geogridLayers === 1 ? '' : 's'} (${result.geogridSqYd.toFixed(1)} sq yd)`
      : null,
    result.corners > 0 ? `- Corners: ${result.corners}` : null,
    result.engineerAndPermitFee > 0 ? `- Engineer / permit included in this draft` : null,
    '',
    'This is a draft for review. Confirm soils, drainage, geogrid design, embedment, permits, and all pricing before sending. It is not an engineered wall design.',
  ].filter((line) => line !== null).join('\n');
}
