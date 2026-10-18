// Pure bid arithmetic for portable hot-tub / spa *installs* (not a
// pool-plaster resurface, not a walk-in shower, not a water-heater
// swap). No network, no state: every size, access path, circuit foot,
// pad, wage, and crane is an input, so the result stays a transparent
// calculation the dealer can check against their own invoices rather
// than a claim about what any spa "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$499 delivery and setup" special treats a compact four-person tub
// dropped on an existing patio with a live 50-amp GFCI ten feet away
// as the same job as a large swim spa that needs a crane over the
// fence, a new pad, a 60-amp disconnect, and sixty feet of trench.
// Homeowners (and a lot of estimator sheets) count "a hot tub." The
// crane, the pad, the circuit footage, and the haul-away do not live
// in that number. Matching a cheaper special written for the driveway
// drop is how a sold backyard crane job becomes a two-day loss after
// the first stuck disconnect.
//
// Distinct from pool *plaster* (water-surface, chip-out, pebble) and
// from a water-heater changeout. This prices the spa, the access, the
// circuit, the pad, and the extras that are not in the coupon.

export const SIZE_PRESETS = Object.freeze([
  { id: 'compact', label: 'Compact (4-person / ~5.5 ft)' },
  { id: 'mid', label: 'Mid (6-person / typical dealer tub)' },
  { id: 'large', label: 'Large / swim spa (7–8 person)' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'drive', label: 'Driveway / patio drop, crane-free' },
  { id: 'gate', label: 'Backyard through-gate / tight path' },
  { id: 'crane', label: 'Crane / boom over fence or house' },
]);

export const POWER_PRESETS = Object.freeze([
  { id: 'existing', label: 'Existing 50A GFCI within 10 ft' },
  { id: 'run50', label: 'New 50A GFCI run' },
  { id: 'run60', label: 'New 60A + disconnect' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Compact spa, driveway drop, existing 50A, existing pad (the $499 setup special)',
    size: 'compact',
    access: 'drive',
    power: 'existing',
    circuitFeet: 0,
    addPad: false,
    addHaul: false,
    addCoverLift: false,
    addSteps: false,
    addGas: false,
  },
  {
    label: 'Mid spa, through-gate, new 50A 40-ft run, existing pad, haul-away',
    size: 'mid',
    access: 'gate',
    power: 'run50',
    circuitFeet: 40,
    addPad: false,
    addHaul: true,
    addCoverLift: false,
    addSteps: true,
    addGas: false,
  },
  {
    label: 'Large swim spa, crane over fence, new 60A 60-ft, new pad, haul-away, cover lift',
    size: 'large',
    access: 'crane',
    power: 'run60',
    circuitFeet: 60,
    addPad: true,
    addHaul: true,
    addCoverLift: true,
    addSteps: true,
    addGas: false,
  },
  {
    label: 'Mid spa, driveway, existing 50A, new pad, haul-away',
    size: 'mid',
    access: 'drive',
    power: 'existing',
    circuitFeet: 0,
    addPad: true,
    addHaul: true,
    addCoverLift: false,
    addSteps: false,
    addGas: false,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function flag(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0 || value === '' || value == null) {
    return false;
  }
  return Boolean(value);
}

/**
 * Starting set hours and unit-cost multiplier from the tub size.
 * These are ballpark dealer figures, not a catalog. Picking a size
 * never overwrites a cost the shop has already typed.
 */
export function suggestedSizeKit(size) {
  const id = String(size);
  if (id === 'compact') {
    return { hoursSet: 2.5, unitCostMultiplier: 1 };
  }
  if (id === 'mid') {
    return { hoursSet: 3.4, unitCostMultiplier: 1.35 };
  }
  if (id === 'large') {
    return { hoursSet: 5.2, unitCostMultiplier: 2.1 };
  }
  throw new Error('Unknown spa size');
}

/**
 * Starting access hours that are not the crane fee. A driveway drop
 * is not a boom over a two-story fence.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'drive') return { hoursAccess: 0 };
  if (id === 'gate') return { hoursAccess: 1.8 };
  if (id === 'crane') return { hoursAccess: 3.6 };
  throw new Error('Unknown access path');
}

/**
 * Starting power hours that are not circuit footage. A 60-amp
 * disconnect is a half-day adder; footage bills by the foot instead.
 */
export function suggestedPowerKit(power) {
  const id = String(power);
  if (id === 'existing') return { hoursPower: 0 };
  if (id === 'run50') return { hoursPower: 0 };
  if (id === 'run60') return { hoursPower: 1.2 };
  throw new Error('Unknown power scope');
}

/**
 * Price a hot-tub install from the size, the access path, the
 * extras past a brochure driveway drop, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const circuitFeet = number(input.circuitFeet ?? 0, 'Circuit footage');

  const size = String(input.size ?? 'compact');
  if (!SIZE_PRESETS.some((item) => item.id === size)) {
    throw new Error('Unknown spa size');
  }
  const access = String(input.access ?? 'drive');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) {
    throw new Error('Unknown access path');
  }
  const power = String(input.power ?? 'existing');
  if (!POWER_PRESETS.some((item) => item.id === power)) {
    throw new Error('Unknown power scope');
  }

  const addPad = flag(input.addPad);
  const addHaul = flag(input.addHaul);
  const addCoverLift = flag(input.addCoverLift);
  const addSteps = flag(input.addSteps);
  const addGas = flag(input.addGas);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursSet = number(input.hoursSet ?? 0, 'Hours to set the spa');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Through-gate / crane hours');
  const hoursPower = number(input.hoursPower ?? 0, '60A / disconnect hours');
  const hoursPerCircuitFoot = number(input.hoursPerCircuitFoot ?? 0, 'Hours per circuit foot');
  const hoursPad = number(input.hoursPad ?? 0, 'Hours for a new pad');
  const hoursHaul = number(input.hoursHaul ?? 0, 'Hours to haul the old tub');
  const hoursCoverLift = number(input.hoursCoverLift ?? 0, 'Hours for a cover lift');
  const hoursSteps = number(input.hoursSteps ?? 0, 'Hours for steps');
  const hoursGas = number(input.hoursGas ?? 0, 'Hours for a gas run');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const unitCost = number(input.unitCost ?? 0, 'Spa unit cost');
  const unitCostMultiplier = number(input.unitCostMultiplier ?? 1, 'Size unit-cost multiplier');
  const craneFee = number(input.craneFee ?? 0, 'Crane / boom fee');
  const circuitKit = number(input.circuitKit ?? 0, 'GFCI / disconnect / whip');
  const circuitPerFoot = number(input.circuitPerFoot ?? 0, 'Circuit per foot');
  const padCost = number(input.padCost ?? 0, 'New pad');
  const haulFee = number(input.haulFee ?? 0, 'Haul-away / dump');
  const coverLiftCost = number(input.coverLiftCost ?? 0, 'Cover lift');
  const stepsCost = number(input.stepsCost ?? 0, 'Steps');
  const gasCost = number(input.gasCost ?? 0, 'Gas line / conversion');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const billCircuit = power !== 'existing';
  const billCrane = access === 'crane';

  const tripHours = hoursTrip;
  const setHours = hoursSet;
  const accessHours = hoursAccess;
  const powerHours = (billCircuit ? hoursPower : 0)
    + (billCircuit ? circuitFeet * hoursPerCircuitFoot : 0);
  const packageHours = (addPad ? hoursPad : 0)
    + (addHaul ? hoursHaul : 0)
    + (addCoverLift ? hoursCoverLift : 0)
    + (addSteps ? hoursSteps : 0)
    + (addGas ? hoursGas : 0);
  const totalHours = tripHours + setHours + accessHours + powerHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const spaMaterial = unitCost * unitCostMultiplier;
  const craneMaterial = billCrane ? craneFee : 0;
  const circuitMaterial = billCircuit ? circuitKit + circuitFeet * circuitPerFoot : 0;
  const padMaterial = addPad ? padCost : 0;
  const haulMaterial = addHaul ? haulFee : 0;
  const coverMaterial = addCoverLift ? coverLiftCost : 0;
  const stepsMaterial = addSteps ? stepsCost : 0;
  const gasMaterial = addGas ? gasCost : 0;
  const permitMaterial = permitFee;
  const materialCost = spaMaterial + craneMaterial + circuitMaterial + padMaterial
    + haulMaterial + coverMaterial + stepsMaterial + gasMaterial + permitMaterial;
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
    size,
    access,
    power,
    circuitFeet,
    addPad,
    addHaul,
    addCoverLift,
    addSteps,
    addGas,
    loadedWage,
    tripHours,
    setHours,
    accessHours,
    powerHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    spaMaterial,
    craneMaterial,
    circuitMaterial,
    padMaterial,
    haulMaterial,
    coverMaterial,
    stepsMaterial,
    gasMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSpa: price,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      set: hourShare(setHours),
      access: hourShare(accessHours),
      power: hourShare(powerHours),
      extras: hourShare(packageHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Hot tub / spa install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const size = SIZE_PRESETS.find((item) => item.id === result.size)?.label ?? result.size;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const power = POWER_PRESETS.find((item) => item.id === result.power)?.label ?? result.power;
  const extras = [
    result.access === 'crane' ? 'crane / boom included' : null,
    result.power !== 'existing' && result.circuitFeet ? `${result.circuitFeet} ft new circuit` : null,
    result.power === 'run60' ? '60A disconnect included' : null,
    result.addPad ? 'new concrete pad included' : null,
    result.addHaul ? 'haul-away of the old tub included' : 'no haul-away this bid',
    result.addCoverLift ? 'cover lift included' : null,
    result.addSteps ? 'steps included' : null,
    result.addGas ? 'gas run / conversion included' : null,
  ].filter(Boolean);
  return [
    'HOT TUB / SPA INSTALL BID',
    '',
    `Proposed spa price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${size}`,
    `Access: ${access}; power: ${power}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${size}; ${access}; ${power}`,
    `- Set labor: ${result.setHours.toFixed(1)} h; access / crane: ${result.accessHours.toFixed(1)} h; circuit: ${result.powerHours.toFixed(1)} h; extras: ${result.packageHours.toFixed(1)} h`,
    `- ${extras.join('; ') || 'standard brochure driveway drop'}`,
    '',
    'This is a draft for review. Confirm the tub size, the access path, circuit footage, pad, haul-away, and all pricing before sending. It is not an electrical design, a building-code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
