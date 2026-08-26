// Pure bid arithmetic for an interior painting job. No network, no state:
// every rate, wage, and coverage figure is an input, so the result stays a
// transparent calculation the painter can check against their own payroll and
// paint invoices rather than a claim about what a room "should" cost.
//
// The method is the one the trade actually estimates with: each surface
// divided by a production rate (how much of that surface one painter covers
// per hour), extra coats at a fraction of first-coat time, plus separate prep
// and setup hours. That is what separates a defensible bid from a
// price-per-floor-square-foot guess — trim and doors take a large share of
// the day and almost none of the floor area, which is how a $2/sq ft bid
// that looked competitive turns out to lose money.

// Common starting points for production rates. These are ballpark figures to
// start from, NOT an industry standard or a guarantee: real rates depend on
// the painter, the house, the paint, and how much prep is already done.
// Painters should replace them with rates timed from their own jobs.
export const SURFACE_PRESETS = Object.freeze([
  {
    id: 'walls',
    label: 'Walls (cut and roll)',
    unit: 'sqft',
    unitLabel: 'sq ft',
    rateLabel: 'sq ft / hour',
    defaultRate: 200,
    areaPerUnit: 1,
    heightSensitive: true,
  },
  {
    id: 'ceilings',
    label: 'Ceilings',
    unit: 'sqft',
    unitLabel: 'sq ft',
    rateLabel: 'sq ft / hour',
    defaultRate: 175,
    areaPerUnit: 1,
    heightSensitive: false,
  },
  {
    id: 'trim',
    label: 'Trim / baseboard',
    unit: 'lf',
    unitLabel: 'linear ft',
    rateLabel: 'linear ft / hour',
    defaultRate: 50,
    areaPerUnit: 0.5,
    heightSensitive: false,
  },
  {
    id: 'doors',
    label: 'Doors (both sides + jamb)',
    unit: 'each',
    unitLabel: 'doors',
    rateLabel: 'doors / hour',
    defaultRate: 1.25,
    areaPerUnit: 40,
    heightSensitive: false,
  },
  {
    id: 'windows',
    label: 'Windows / sashes',
    unit: 'each',
    unitLabel: 'windows',
    rateLabel: 'windows / hour',
    defaultRate: 2.5,
    areaPerUnit: 12,
    heightSensitive: false,
  },
  {
    id: 'cabinets',
    label: 'Cabinet doors / drawers',
    unit: 'each',
    unitLabel: 'pieces',
    rateLabel: 'pieces / hour',
    defaultRate: 1.5,
    areaPerUnit: 8,
    heightSensitive: false,
  },
]);

export const SURFACE_BY_ID = Object.freeze(
  Object.fromEntries(SURFACE_PRESETS.map((preset) => [preset.id, preset])),
);

// Extra-coat labor as a fraction of first-coat hours. Second coat is usually
// faster (less cutting, wet-on-dry is quicker) — not a second full first coat.
export const DEFAULT_EXTRA_COAT_FACTOR = 0.65;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

// Ladder and staging time on walls. Standard 8–9 ft ceilings are the baseline
// the production rates assume; taller walls are the same square footage and a
// slower job. The steps are coarse on purpose — this is a starting adjustment,
// not a scaffolding quote.
export function heightFactor(ceilingHeightFeet) {
  const height = number(ceilingHeightFeet ?? 9, 'Ceiling height');
  if (height <= 9) return 1;
  if (height <= 10) return 1.12;
  if (height <= 12) return 1.3;
  return 1.55;
}

function presetFor(surface) {
  const id = typeof surface.type === 'string' ? surface.type.trim() : '';
  return SURFACE_BY_ID[id] ?? null;
}

/**
 * Price an interior painting job from its surfaces and cost structure.
 *
 * @param {object} input
 * @param {Array<{type?: string, name?: string, quantity: number, productionRate: number, coats: number}>} input.surfaces
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate            Payroll burden as a % on top of wage.
 * @param {number} input.prepHours             Patching, sanding, caulking, masking.
 * @param {number} input.setupHours            Daily setup, cleanup, and protection.
 * @param {number} input.paintPrice            $ per gallon (average of what this job uses).
 * @param {number} input.paintCoverage         Paintable sq ft one gallon covers, one coat.
 * @param {number} input.wastePercent          Leftover, spills, and tinting overage.
 * @param {number} input.travelCost            Gas, parking, and mileage for the job.
 * @param {number} input.otherCost             Drop cloths, tape, and anything else.
 * @param {number} input.overheadRate          Business overhead as a % on direct cost.
 * @param {number} input.targetMargin          Net profit as a % of the final price.
 * @param {number} [input.extraCoatFactor]     Extra-coat hours as a fraction of first coat.
 * @param {number} [input.ceilingHeightFeet]   Typical ceiling height; slows wall work above 9 ft.
 * @param {number} [input.floorSquareFeet]     Floor area, so the bid can be shown per floor sq ft.
 * @param {number} [input.commonFloorBid]      A $/floor-sq-ft rule of thumb to score against.
 * @param {number|null} [input.proposedPrice]  A price already on the table.
 */
export function calculateBid(input) {
  const surfacesInput = Array.isArray(input.surfaces) ? input.surfaces : [];
  if (surfacesInput.length === 0) throw new Error('Add at least one surface to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const prepHours = number(input.prepHours ?? 0, 'Prep hours');
  const setupHours = number(input.setupHours ?? 0, 'Setup hours');
  const paintPrice = number(input.paintPrice ?? 0, 'Paint price');
  const paintCoverage = number(input.paintCoverage ?? 350, 'Paint coverage', { allowZero: false });
  const wastePercent = number(input.wastePercent ?? 0, 'Waste');
  const travelCost = number(input.travelCost ?? 0, 'Travel cost');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const extraCoatFactor = number(
    input.extraCoatFactor ?? DEFAULT_EXTRA_COAT_FACTOR,
    'Extra-coat factor',
  );
  if (extraCoatFactor <= 0 || extraCoatFactor > 2) {
    throw new Error('Extra-coat factor must be greater than 0 and at most 2');
  }

  const ceilingHeightFeet = number(input.ceilingHeightFeet ?? 9, 'Ceiling height', { allowZero: false });
  const wallHeightFactor = heightFactor(ceilingHeightFeet);
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const surfaces = surfacesInput.map((surface, index) => {
    const preset = presetFor(surface);
    const label = surface.name?.trim() || preset?.label || `Surface ${index + 1}`;
    const quantity = number(surface.quantity ?? 0, `${label}: quantity`);
    const coats = number(surface.coats ?? 1, `${label}: coats`, { min: 1 });
    if (!Number.isInteger(coats)) throw new Error(`${label}: coats must be a whole number`);

    // A zero rate on a surface that has quantity would report a free paint,
    // so it is rejected rather than defaulted. A zero-quantity row is a
    // skipped surface and may keep its starting rate.
    const productionRate = number(
      surface.productionRate ?? 0,
      `${label}: production rate`,
      { allowZero: quantity === 0 },
    );
    if (quantity > 0 && productionRate === 0) {
      throw new Error(`${label}: production rate must be greater than zero`);
    }

    const areaPerUnit = preset?.areaPerUnit ?? 1;
    const heightSensitive = Boolean(preset?.heightSensitive);
    const appliedHeight = heightSensitive ? wallHeightFactor : 1;
    const firstCoatHours = productionRate === 0 ? 0 : (quantity / productionRate) * appliedHeight;
    const extraCoatHours = coats > 1 ? firstCoatHours * extraCoatFactor * (coats - 1) : 0;
    const laborHours = firstCoatHours + extraCoatHours;
    const paintableSqFt = quantity * areaPerUnit;
    const gallons = (paintableSqFt * coats * (1 + wastePercent / 100)) / paintCoverage;

    return {
      type: preset?.id || 'other',
      name: label,
      quantity,
      productionRate,
      coats,
      unit: preset?.unit || 'each',
      unitLabel: preset?.unitLabel || 'units',
      heightFactor: appliedHeight,
      firstCoatHours,
      extraCoatHours,
      laborHours,
      paintableSqFt,
      gallons,
      laborCost: laborHours * loadedWage,
      paintCost: gallons * paintPrice,
    };
  });

  const surfaceHours = surfaces.reduce((sum, row) => sum + row.laborHours, 0);
  const laborHours = surfaceHours + prepHours + setupHours;
  const laborCost = laborHours * loadedWage;
  const paintGallons = surfaces.reduce((sum, row) => sum + row.gallons, 0);
  const paintCost = paintGallons * paintPrice;
  const paintableSqFt = surfaces.reduce((sum, row) => sum + row.paintableSqFt, 0);

  // Overhead is a markup on the direct cost of this job, which is how a
  // small painter recovers office, admin, insurance paperwork, and sales.
  // It is deliberately not applied to itself or to profit.
  const directCost = laborCost + paintCost + travelCost + otherCost;
  const overhead = directCost * overheadRate / 100;
  const jobCost = directCost + overhead;
  const price = jobCost / (1 - targetMargin / 100);
  const profit = price - jobCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const hasFloor = input.floorSquareFeet !== null && input.floorSquareFeet !== undefined && input.floorSquareFeet !== '';
  const floorSquareFeet = hasFloor ? number(input.floorSquareFeet, 'Floor square feet') : 0;

  const hasCommon = input.commonFloorBid !== null && input.commonFloorBid !== undefined && input.commonFloorBid !== '';
  const commonFloorBid = hasCommon ? number(input.commonFloorBid, 'Common $/sq ft bid') : null;

  const commonBid = commonFloorBid === null || floorSquareFeet === 0
    ? null
    : {
      perSqFt: commonFloorBid,
      price: commonFloorBid * floorSquareFeet,
      profit: commonFloorBid * floorSquareFeet - jobCost,
      belowBreakEven: commonFloorBid * floorSquareFeet < jobCost,
    };

  return {
    surfaces: surfaces.map((row) => ({
      ...row,
      // Share of surface labor (prep/setup sit outside this split so the
      // painter can see which surfaces ate the day).
      hoursShare: surfaceHours === 0 ? 0 : row.laborHours / surfaceHours * 100,
    })),
    loadedWage,
    extraCoatFactor,
    ceilingHeightFeet,
    wallHeightFactor,
    surfaceHours,
    prepHours,
    setupHours,
    laborHours,
    laborCost,
    paintGallons,
    paintCost,
    paintableSqFt,
    travelCost,
    otherCost,
    overhead,
    jobCost,
    price,
    profit,
    // The two sanity numbers a painter checks a bid against: what it works
    // out to per floor square foot (the number customers quote) and per
    // paintable square foot (the number that actually took paint).
    pricePerFloorSqFt: floorSquareFeet === 0 ? null : price / floorSquareFeet,
    pricePerPaintableSqFt: paintableSqFt === 0 ? null : price / paintableSqFt,
    effectiveHourlyRate: laborHours === 0 ? null : price / laborHours,
    // Price at which the job stops making money — the walk-away number to
    // hold when a homeowner asks them to match a cheaper quote.
    breakEvenPrice: jobCost,
    floorSquareFeet: floorSquareFeet === 0 ? null : floorSquareFeet,
    commonBid,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - jobCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - jobCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      belowBreakEven: proposedPrice < jobCost,
    },
  };
}
