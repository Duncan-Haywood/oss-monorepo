// Pure bid arithmetic for a garage-floor coating job. No network, no state:
// every rate, wage, and material figure is an input, so the result stays a
// transparent calculation the contractor can check against their own kit
// invoices and timed grind hours rather than a claim about what any slab
// "should" cost.
//
// The method is the one the trade actually bids with: the slab is ground (or
// it is not), then coats and flake are applied with waste, then cracks and
// pits are patched as extra hours and extra material. A flat dollars-per-
// square-foot special cannot see that a 400 sq ft two-car with 40 linear feet
// of cracks and a moisture barrier is a different job from a clean slab, or
// that skipping the grind is how a $3/sq ft special comes back as a peel.

export const GARAGE_PRESETS = Object.freeze([
  { id: '1-car', label: '1-car (12×20)', width: 12, length: 20 },
  { id: '2-car', label: '2-car (20×20)', width: 20, length: 20 },
  { id: '2.5-car', label: '2.5-car (24×22)', width: 24, length: 22 },
  { id: '3-car', label: '3-car (32×22)', width: 32, length: 22 },
  { id: 'custom', label: 'Custom size', width: null, length: null },
]);

// Starting kit and production figures, NOT a standard or a guarantee. Real
// coverage, pot life, and grind rate depend on the slab, the temperature,
// and the crew. Every figure is editable.
export const COATING_SYSTEMS = Object.freeze([
  {
    id: 'solid-epoxy',
    label: 'Solid-color 2-coat epoxy',
    coats: 2,
    wastePct: 8,
    coatingPerSqFt: 1.45,
    flakeLbPerSqFt: 0,
    coatSqFtPerHour: 300,
  },
  {
    id: 'full-flake',
    label: 'Full-broadcast flake + topcoat',
    coats: 3,
    wastePct: 12,
    coatingPerSqFt: 2.85,
    flakeLbPerSqFt: 0.2,
    coatSqFtPerHour: 220,
  },
  {
    id: 'metallic',
    label: 'Metallic epoxy',
    coats: 3,
    wastePct: 10,
    coatingPerSqFt: 3.5,
    flakeLbPerSqFt: 0,
    coatSqFtPerHour: 180,
  },
  {
    id: 'polyaspartic',
    label: '1-day polyaspartic flake',
    coats: 2,
    wastePct: 12,
    coatingPerSqFt: 4.25,
    flakeLbPerSqFt: 0.18,
    coatSqFtPerHour: 280,
  },
]);

export const PREP_METHODS = Object.freeze([
  { id: 'degrease', label: 'Degrease / acid etch only (no grind)', sqFtPerHour: 250, skipGrind: true },
  { id: 'light-grind', label: 'Light diamond grind', sqFtPerHour: 125, skipGrind: false },
  { id: 'full-grind', label: 'Full diamond grind to profile', sqFtPerHour: 80, skipGrind: false },
  { id: 'shot-blast', label: 'Shot blast', sqFtPerHour: 100, skipGrind: false },
]);

// Full-broadcast flake typically lands around 0.15–0.25 lb/sq ft. Below this
// the floor looks starved and the contractor is usually buying another bag
// on the way back to the job.
export const STARVED_FLAKE_LB_PER_SQ_FT = 0.12;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function lookup(list, id, name) {
  const found = list.find(item => item.id === id);
  if (!found) throw new Error(`${name} is not a recognised option`);
  return found;
}

/**
 * Price a garage-floor coating job from the slab, the system, and the shop.
 *
 * @param {object} input
 * @param {string} [input.garageId]         Preset opening, or `custom`.
 * @param {number} [input.width]            Feet, used with length when custom
 *   or when the preset is overridden.
 * @param {number} [input.length]
 * @param {number} [input.squareFeet]       Direct area; wins over width×length
 *   when set.
 * @param {string} input.systemId
 * @param {string} input.prepId
 * @param {number} input.crackLinearFeet
 * @param {number} input.pitSquareFeet
 * @param {boolean} input.moistureBarrier
 * @param {number} [input.coatingPerSqFt]   Override the system kit $/sq ft.
 * @param {number} [input.flakeLbPerSqFt]   Override the system flake load.
 * @param {number} [input.coatSqFtPerHour]
 * @param {number} [input.prepSqFtPerHour]
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate         Payroll burden as a % on wage.
 * @param {number} input.flakePricePerLb
 * @param {number} input.moisturePerSqFt
 * @param {number} input.crackFillPerLf
 * @param {number} input.pitFillPerSf
 * @param {number} input.otherJobCost       Consumables, tape, spikes, extra.
 * @param {number} input.roundTripMiles
 * @param {number} input.travelMph
 * @param {number} input.vehiclePerMile
 * @param {number} input.overheadRate       Overhead as a % on direct cost.
 * @param {number} input.targetMargin       Net profit as a % of the price.
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const system = lookup(COATING_SYSTEMS, input.systemId ?? 'full-flake', 'Coating system');
  const prep = lookup(PREP_METHODS, input.prepId ?? 'full-grind', 'Prep method');

  const squareFeet = resolveArea(input);
  const crackLinearFeet = number(input.crackLinearFeet ?? 0, 'Crack length');
  const pitSquareFeet = number(input.pitSquareFeet ?? 0, 'Pit / spall area');
  const moistureBarrier = Boolean(input.moistureBarrier);

  const coatingPerSqFt = number(input.coatingPerSqFt ?? system.coatingPerSqFt, 'Coating cost per sq ft');
  const flakeLbPerSqFt = number(input.flakeLbPerSqFt ?? system.flakeLbPerSqFt, 'Flake pounds per sq ft');
  const coatSqFtPerHour = number(input.coatSqFtPerHour ?? system.coatSqFtPerHour, 'Coat production rate', { allowZero: false });
  const prepSqFtPerHour = number(input.prepSqFtPerHour ?? prep.sqFtPerHour, 'Prep production rate', { allowZero: false });
  const crackLfPerHour = number(input.crackLfPerHour ?? 20, 'Crack production rate', { allowZero: false });
  const pitSqFtPerHour = number(input.pitSqFtPerHour ?? 15, 'Pit production rate', { allowZero: false });

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const flakePricePerLb = number(input.flakePricePerLb ?? 0, 'Flake price per pound');
  const moisturePerSqFt = number(input.moisturePerSqFt ?? 0, 'Moisture barrier per sq ft');
  const crackFillPerLf = number(input.crackFillPerLf ?? 0, 'Crack fill per linear foot');
  const pitFillPerSf = number(input.pitFillPerSf ?? 0, 'Pit fill per sq ft');
  const otherJobCost = number(input.otherJobCost ?? 0, 'Other job cost');
  const roundTripMiles = number(input.roundTripMiles ?? 0, 'Round-trip miles');
  const travelMph = number(input.travelMph ?? 0, 'Travel speed', { allowZero: false });
  const vehiclePerMile = number(input.vehiclePerMile ?? 0, 'Vehicle cost per mile');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const wastePct = number(input.wastePct ?? system.wastePct, 'Waste percent');
  const coats = number(input.coats ?? system.coats, 'Coats', { allowZero: false });

  const billableSquareFeet = squareFeet * (1 + wastePct / 100);
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const prepHours = squareFeet / prepSqFtPerHour;
  const coatHours = (billableSquareFeet / coatSqFtPerHour) * coats;
  const crackHours = crackLinearFeet / crackLfPerHour;
  const pitHours = pitSquareFeet / pitSqFtPerHour;
  const shopHours = prepHours + coatHours + crackHours + pitHours;
  const travelHours = roundTripMiles / travelMph;
  const laborHours = shopHours + travelHours;

  const laborCost = laborHours * loadedWage;
  const vehicleCost = roundTripMiles * vehiclePerMile;
  const coatingCost = billableSquareFeet * coatingPerSqFt;
  const flakePounds = billableSquareFeet * flakeLbPerSqFt;
  const flakeCost = flakePounds * flakePricePerLb;
  const moistureCost = moistureBarrier ? squareFeet * moisturePerSqFt : 0;
  const crackMaterial = crackLinearFeet * crackFillPerLf;
  const pitMaterial = pitSquareFeet * pitFillPerSf;
  const materialCost = coatingCost + flakeCost + moistureCost + crackMaterial + pitMaterial;

  const directCost = laborCost + vehicleCost + materialCost + otherJobCost;
  const overhead = directCost * overheadRate / 100;
  const jobCost = directCost + overhead;
  const price = jobCost / (1 - targetMargin / 100);
  const profit = price - jobCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const flakeSystem = flakeLbPerSqFt > 0;
  const warnings = [];
  if (prep.skipGrind) {
    warnings.push({
      id: 'skip-grind',
      severity: flakeSystem || system.id === 'metallic' || system.id === 'polyaspartic' ? 'high' : 'medium',
      message: 'This bid skips a mechanical grind. Cheap specials that only etch fail as hot-tire pickup and peel — prep is usually most of the labor.',
    });
  }
  if (flakeSystem && flakeLbPerSqFt < STARVED_FLAKE_LB_PER_SQ_FT) {
    warnings.push({
      id: 'starved-flake',
      severity: 'high',
      message: `Full-broadcast flake under ${STARVED_FLAKE_LB_PER_SQ_FT} lb/sq ft looks starved. Contractors who "guess a couple of bags" buy more on the way back.`,
    });
  }
  if (travelHours > 0 && shopHours > 0 && travelHours >= shopHours * 0.4) {
    warnings.push({
      id: 'travel-heavy',
      severity: 'medium',
      message: 'Travel is a large share of shop time. A neighborhood special that ignores the drive often costs more than the hour on the slab.',
    });
  }

  return {
    garage: {
      width: input.width == null || input.width === '' ? null : number(input.width, 'Width'),
      length: input.length == null || input.length === '' ? null : number(input.length, 'Length'),
      squareFeet,
      billableSquareFeet,
      wastePct,
    },
    system: {
      id: system.id,
      label: system.label,
      coats,
    },
    prep: {
      id: prep.id,
      label: prep.label,
      skipGrind: prep.skipGrind,
    },
    loadedWage,
    hours: {
      prep: prepHours,
      coat: coatHours,
      crack: crackHours,
      pit: pitHours,
      shop: shopHours,
      travel: travelHours,
      total: laborHours,
    },
    costs: {
      labor: laborCost,
      vehicle: vehicleCost,
      coating: coatingCost,
      flake: flakeCost,
      moisture: moistureCost,
      crack: crackMaterial,
      pit: pitMaterial,
      material: materialCost,
      other: otherJobCost,
      direct: directCost,
      overhead,
      total: jobCost,
    },
    flakePounds,
    moistureBarrier,
    price,
    profit,
    pricePerSqFt: squareFeet === 0 ? null : price / squareFeet,
    effectiveHourlyRate: laborHours === 0 ? null : price / laborHours,
    breakEvenPrice: jobCost,
    warnings,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - jobCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - jobCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      belowBreakEven: proposedPrice < jobCost,
    },
  };
}

function resolveArea(input) {
  if (input.squareFeet !== undefined && input.squareFeet !== null && input.squareFeet !== '') {
    return number(input.squareFeet, 'Square feet', { allowZero: false });
  }
  const preset = GARAGE_PRESETS.find(item => item.id === input.garageId);
  const width = input.width !== undefined && input.width !== null && input.width !== ''
    ? number(input.width, 'Width', { allowZero: false })
    : preset && preset.width
      ? preset.width
      : null;
  const length = input.length !== undefined && input.length !== null && input.length !== ''
    ? number(input.length, 'Length', { allowZero: false })
    : preset && preset.length
      ? preset.length
      : null;
  if (width == null || length == null) {
    throw new Error('Set the slab size — pick a garage or enter width and length');
  }
  return width * length;
}
