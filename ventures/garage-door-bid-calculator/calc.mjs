// Pure bid arithmetic for a garage-door replacement or spring service.
// No network, no state: every rate and part figure is an input, so the
// result stays a transparent calculation the technician can check against
// their own invoices rather than a claim about what any door "should" cost.
//
// The method is the one the trade actually loses money on when they skip it:
// a "$189 broken-spring special" is priced as if the only cost is the spring
// and an hour in the driveway. Travel labor, vehicle miles, after-hours
// premium, and the fact that a 16×7 is not two 8×7s are what turn that
// special into a loss. This calculator prices the job as parts + shop labor
// + travel + overhead + margin, and it reports the travel share so a tech
// can see when the drive ate the job.

export const DOOR_SIZE_PRESETS = Object.freeze([
  { id: 'single_8x7', label: 'Single 8×7', widthFt: 8, heightFt: 7 },
  { id: 'single_9x7', label: 'Single 9×7', widthFt: 9, heightFt: 7 },
  { id: 'single_10x8', label: 'Single 10×8', widthFt: 10, heightFt: 8 },
  { id: 'double_16x7', label: 'Double 16×7', widthFt: 16, heightFt: 7 },
  { id: 'double_16x8', label: 'Double 16×8', widthFt: 16, heightFt: 8 },
  { id: 'double_18x8', label: 'Double 18×8', widthFt: 18, heightFt: 8 },
]);

export const CONSTRUCTION_PRESETS = Object.freeze([
  { id: 'non_insulated', label: 'Non-insulated steel', costPerSqFt: 8.5 },
  { id: 'insulated_r9', label: 'Insulated steel (R-9)', costPerSqFt: 12.5 },
  { id: 'insulated_r16', label: 'Insulated steel (R-16)', costPerSqFt: 16.5 },
  { id: 'wood_carriage', label: 'Wood / carriage-house', costPerSqFt: 28 },
  { id: 'aluminum_glass', label: 'Aluminum & glass', costPerSqFt: 24 },
]);

export const JOB_TYPES = Object.freeze([
  {
    id: 'spring_only',
    label: 'Broken-spring service (keep the door)',
    includesDoor: false,
    includesSpring: true,
    includesOpener: false,
    laborHours: { single: 1, double: 1.25 },
  },
  {
    id: 'opener_only',
    label: 'Opener only (keep the door)',
    includesDoor: false,
    includesSpring: false,
    includesOpener: true,
    laborHours: { single: 1.5, double: 1.75 },
  },
  {
    id: 'replacement',
    label: 'Door replacement (reuse opener)',
    includesDoor: true,
    includesSpring: true,
    includesOpener: false,
    laborHours: { single: 3.25, double: 4.25 },
  },
  {
    id: 'replacement_with_opener',
    label: 'Door + new opener',
    includesDoor: true,
    includesSpring: true,
    includesOpener: true,
    laborHours: { single: 4.25, double: 5.5 },
  },
]);

export const OPENER_PRESETS = Object.freeze([
  { id: 'none', label: 'No opener on this ticket', cost: 0, extraHours: 0 },
  { id: 'chain_half', label: 'Chain-drive ½ HP', cost: 220, extraHours: 0 },
  { id: 'belt_three_quarter', label: 'Belt-drive ¾ HP', cost: 380, extraHours: 0 },
  { id: 'jackshaft', label: 'Jackshaft / wall-mount', cost: 520, extraHours: 0.4 },
]);

export const SPRING_KIT_COST = Object.freeze({ single: 95, double: 175 });
export const DEFAULT_AVERAGE_MPH = 30;
export const HIGH_CYCLE_SPRING_MULTIPLIER = 1.6;
export const SINGLE_WIDTH_FT = 10;

export function doorClass(widthFt) {
  return Number(widthFt) <= SINGLE_WIDTH_FT ? 'single' : 'double';
}

export function suggestedLaborHours(jobTypeId, widthFt) {
  const job = JOB_TYPES.find((item) => item.id === jobTypeId);
  if (!job) throw new Error('Unknown job type');
  return job.laborHours[doorClass(widthFt)];
}

export function suggestedDoorCost(widthFt, heightFt, constructionId) {
  const construction = CONSTRUCTION_PRESETS.find((item) => item.id === constructionId);
  if (!construction) throw new Error('Unknown door construction');
  return Number(widthFt) * Number(heightFt) * construction.costPerSqFt;
}

export function suggestedSpringCost(widthFt, highCycle = false) {
  const base = SPRING_KIT_COST[doorClass(widthFt)];
  return highCycle ? base * HIGH_CYCLE_SPRING_MULTIPLIER : base;
}

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function optionalNumber(value, name, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  return number(value, name);
}

/**
 * Price one garage-door ticket from its job type, door, parts, labor, and travel.
 *
 * @param {object} input
 * @param {string} input.jobType                 One of JOB_TYPES ids.
 * @param {number} input.widthFt                 Door width in feet.
 * @param {number} input.heightFt                Door height in feet.
 * @param {number} input.doorCost                Slab / section cost. Ignored on
 *   spring-only and opener-only tickets unless the tech still enters it.
 * @param {number} input.springCost              Torsion/extension kit.
 * @param {number} input.openerCost              Opener unit, 0 if none.
 * @param {number} input.hardwareCost            Tracks, rollers, cables, wind
 *   load, windows, weatherseal — anything else on the parts ticket.
 * @param {number} input.disposalCost            Old-door haul-off.
 * @param {number} input.permitCost              Permit / inspection if any.
 * @param {number} input.laborHours              Shop time on site, not drive.
 * @param {number} input.hourlyWage              What the tech is paid.
 * @param {number} input.burdenRate              Payroll burden as a % on wage.
 * @param {number} input.roundTripMiles          Drive both ways.
 * @param {number} input.costPerMile             Vehicle cost per mile.
 * @param {number} [input.averageMph]            Used to turn miles into drive
 *   hours when driveHours is omitted. Default 30.
 * @param {number} [input.driveHours]            Explicit drive time both ways.
 * @param {number} input.afterHoursMultiplier    1.0 weekday; 1.5 is a common
 *   evening/weekend premium on shop labor only, not on parts or travel.
 * @param {number} input.overheadRate            Overhead as a % of direct cost.
 * @param {number} input.targetMargin            Net profit as a % of price.
 * @param {number|null} input.proposedPrice      Optional price already quoted.
 */
export function calculateBid(input) {
  const job = JOB_TYPES.find((item) => item.id === input.jobType);
  if (!job) throw new Error('Job type must be spring_only, opener_only, replacement, or replacement_with_opener');

  const widthFt = number(input.widthFt ?? 0, 'Door width', { allowZero: false });
  const heightFt = number(input.heightFt ?? 0, 'Door height', { allowZero: false });
  const klass = doorClass(widthFt);

  const doorCost = job.includesDoor ? number(input.doorCost ?? 0, 'Door cost') : optionalNumber(input.doorCost, 'Door cost');
  const springCost = job.includesSpring ? number(input.springCost ?? 0, 'Spring cost') : optionalNumber(input.springCost, 'Spring cost');
  const openerCost = job.includesOpener ? number(input.openerCost ?? 0, 'Opener cost') : optionalNumber(input.openerCost, 'Opener cost');
  const hardwareCost = number(input.hardwareCost ?? 0, 'Hardware cost');
  const disposalCost = number(input.disposalCost ?? 0, 'Disposal cost');
  const permitCost = number(input.permitCost ?? 0, 'Permit cost');

  const laborHours = number(input.laborHours ?? 0, 'Labor hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const roundTripMiles = number(input.roundTripMiles ?? 0, 'Round-trip miles');
  const costPerMile = number(input.costPerMile ?? 0, 'Cost per mile');
  const averageMph = number(input.averageMph ?? DEFAULT_AVERAGE_MPH, 'Average mph', { allowZero: false });
  const driveHours = input.driveHours === null || input.driveHours === undefined || input.driveHours === ''
    ? roundTripMiles / averageMph
    : number(input.driveHours, 'Drive hours');
  const afterHoursMultiplier = number(input.afterHoursMultiplier ?? 1, 'After-hours multiplier', { min: 1 });
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const shopLaborCost = laborHours * loadedWage * afterHoursMultiplier;
  const travelLaborCost = driveHours * loadedWage;
  const travelVehicleCost = roundTripMiles * costPerMile;
  const travelCost = travelLaborCost + travelVehicleCost;

  const partsCost = doorCost + springCost + openerCost + hardwareCost + disposalCost + permitCost;
  const directCost = partsCost + shopLaborCost + travelCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const doorSqFt = widthFt * heightFt;
  const travelShare = price === 0 ? 0 : travelCost / price * 100;
  const partsShare = price === 0 ? 0 : partsCost / price * 100;
  const laborShare = price === 0 ? 0 : shopLaborCost / price * 100;

  // The trap this tool exists to catch: a cheap spring ticket whose drive
  // costs more than the shop work. Flagged when travel is at least 35% of
  // the price on a spring-only job, or when travel exceeds shop labor on
  // any job.
  const travelEatsJob = travelCost > 0 && (
    (job.id === 'spring_only' && travelShare >= 35) ||
    travelCost > shopLaborCost
  );

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    jobType: job.id,
    jobLabel: job.label,
    widthFt,
    heightFt,
    doorClass: klass,
    doorSqFt,
    loadedWage,
    doorCost,
    springCost,
    openerCost,
    hardwareCost,
    disposalCost,
    permitCost,
    partsCost,
    laborHours,
    shopLaborCost,
    driveHours,
    travelLaborCost,
    travelVehicleCost,
    travelCost,
    directCost,
    overhead,
    totalCost,
    price,
    profit,
    effectiveHourlyRate: laborHours === 0 ? null : price / laborHours,
    pricePerSqFt: job.includesDoor && doorSqFt > 0 ? price / doorSqFt : null,
    travelShare,
    partsShare,
    laborShare,
    travelEatsJob,
    breakEvenPrice: totalCost,
    afterHoursMultiplier,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
