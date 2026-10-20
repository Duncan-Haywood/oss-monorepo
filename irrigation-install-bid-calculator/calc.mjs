// Pure bid arithmetic for irrigation *system install* (not a
// winterization / blowout, not lawn-care mowing, not a French drain).
// No network, no state: every zone, head, trench foot, backflow,
// wage, and extra is an input, so the result stays a transparent
// calculation the contractor can check against their own invoices
// rather than a claim about what any yard "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$400 a zone installed" special treats a 6-zone front-yard spray
// system with a 3/4-inch PVB in dirt as the same job as a 10-zone
// backyard with extra heads, a 1.5-inch RPZ, rock trench, a drip
// conversion, a rain sensor, and a master valve. Homeowners (and a
// lot of estimator sheets) count "zones." Extra heads, trench
// footage, backflow size, and soil do not live in that number.
// Matching a cheaper special written for the brochure 6-zone spray
// system is how a sold rock drip job becomes a two-day loss after
// the first extra valve and the first extra hundred feet of trench.
//
// Distinct from irrigation *winterization* (blowout, backflow drain,
// seasonal service) and from lawn-care (mowing). This prices a new
// sprinkler-system install: the zones, the heads, the trench, the
// backflow, and the extras that are not in the coupon.

export const CONTROLLER_PRESETS = Object.freeze([
  { id: 'six', label: '6-station controller' },
  { id: 'twelve', label: '12-station controller' },
  { id: 'wifi', label: 'Wi-Fi / weather controller' },
]);

export const BACKFLOW_PRESETS = Object.freeze([
  { id: 'pvb', label: '3/4-inch PVB' },
  { id: 'rpz1', label: '1-inch RPZ' },
  { id: 'rpz15', label: '1.5-inch RPZ' },
]);

export const SOIL_PRESETS = Object.freeze([
  { id: 'dirt', label: 'Dirt / loam' },
  { id: 'clay', label: 'Clay' },
  { id: 'rock', label: 'Rock / hardpan' },
]);

export const INCLUDED_HEADS_PER_ZONE = 6;

export const JOB_PRESETS = Object.freeze([
  {
    label: '6-zone spray, 6 heads/zone, 3/4-inch PVB, dirt, 180 ft trench (the $400/zone special)',
    controller: 'six',
    backflow: 'pvb',
    soil: 'dirt',
    zones: 6,
    headsPerZone: 6,
    trenchFeet: 180,
    addDrip: false,
    addRain: false,
    addMaster: false,
  },
  {
    label: '8-zone spray, 8 heads/zone, 1-inch RPZ, dirt, rain sensor, 280 ft trench',
    controller: 'twelve',
    backflow: 'rpz1',
    soil: 'dirt',
    zones: 8,
    headsPerZone: 8,
    trenchFeet: 280,
    addDrip: false,
    addRain: true,
    addMaster: false,
  },
  {
    label: '10-zone, 10 heads/zone, Wi-Fi, 1.5-inch RPZ, rock, drip + rain + master, 420 ft',
    controller: 'wifi',
    backflow: 'rpz15',
    soil: 'rock',
    zones: 10,
    headsPerZone: 10,
    trenchFeet: 420,
    addDrip: true,
    addRain: true,
    addMaster: true,
  },
  {
    label: '6-zone drip conversion, 6 heads/zone, 1-inch RPZ, clay, drip + rain, 240 ft',
    controller: 'six',
    backflow: 'rpz1',
    soil: 'clay',
    zones: 6,
    headsPerZone: 6,
    trenchFeet: 240,
    addDrip: true,
    addRain: true,
    addMaster: false,
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
 * Starting controller hours and kit cost. A 6-station box is not a
 * Wi-Fi weather controller. Picking a controller never overwrites a
 * cost the contractor has already typed.
 */
export function suggestedControllerKit(controller) {
  const id = String(controller);
  if (id === 'six') return { hoursController: 1.2, controllerCost: 145 };
  if (id === 'twelve') return { hoursController: 1.6, controllerCost: 245 };
  if (id === 'wifi') return { hoursController: 1.8, controllerCost: 320 };
  throw new Error('Unknown irrigation controller');
}

/**
 * Starting backflow hours and kit cost. A 3/4-inch PVB is not a
 * 1.5-inch RPZ with a test-cock assembly and a larger tap.
 */
export function suggestedBackflowKit(backflow) {
  const id = String(backflow);
  if (id === 'pvb') return { hoursBackflow: 1.4, backflowCost: 185 };
  if (id === 'rpz1') return { hoursBackflow: 2.4, backflowCost: 420 };
  if (id === 'rpz15') return { hoursBackflow: 3.6, backflowCost: 780 };
  throw new Error('Unknown irrigation backflow');
}

/**
 * Starting soil hour factor on the trench. Dirt is not clay and is
 * not a rock ledge.
 */
export function suggestedSoilKit(soil) {
  const id = String(soil);
  if (id === 'dirt') return { soilHourFactor: 1 };
  if (id === 'clay') return { soilHourFactor: 1.4 };
  if (id === 'rock') return { soilHourFactor: 2 };
  throw new Error('Unknown irrigation soil');
}

/**
 * Price a new irrigation-system install from the zones, the extras
 * past a brochure 6-zone spray special, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const controller = String(input.controller ?? 'six');
  if (!CONTROLLER_PRESETS.some((item) => item.id === controller)) {
    throw new Error('Unknown irrigation controller');
  }
  const backflow = String(input.backflow ?? 'pvb');
  if (!BACKFLOW_PRESETS.some((item) => item.id === backflow)) {
    throw new Error('Unknown irrigation backflow');
  }
  const soil = String(input.soil ?? 'dirt');
  if (!SOIL_PRESETS.some((item) => item.id === soil)) {
    throw new Error('Unknown irrigation soil');
  }

  const addDrip = flag(input.addDrip);
  const addRain = flag(input.addRain);
  const addMaster = flag(input.addMaster);

  const zones = number(input.zones ?? 0, 'Zones');
  const headsPerZone = number(input.headsPerZone ?? 0, 'Heads per zone');
  const trenchFeet = number(input.trenchFeet ?? 0, 'Trench feet');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerZone = number(input.hoursPerZone ?? 0, 'Hours per zone');
  const hoursExtraHead = number(input.hoursExtraHead ?? 0, 'Hours per extra head');
  const hoursTrenchPerFoot = number(input.hoursTrenchPerFoot ?? 0, 'Hours per trench foot');
  const soilHourFactor = number(input.soilHourFactor ?? 1, 'Soil hour factor');
  const hoursController = number(input.hoursController ?? 0, 'Controller hours');
  const hoursBackflow = number(input.hoursBackflow ?? 0, 'Backflow hours');
  const hoursDrip = number(input.hoursDrip ?? 0, 'Drip-conversion hours');
  const hoursRain = number(input.hoursRain ?? 0, 'Rain-sensor hours');
  const hoursMaster = number(input.hoursMaster ?? 0, 'Master-valve hours');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const valveCost = number(input.valveCost ?? 0, 'Valve cost');
  const headCost = number(input.headCost ?? 0, 'Head cost');
  const pipeCostPerFoot = number(input.pipeCostPerFoot ?? 0, 'Pipe cost per foot');
  const controllerCost = number(input.controllerCost ?? 0, 'Controller kit');
  const backflowCost = number(input.backflowCost ?? 0, 'Backflow kit');
  const dripCost = number(input.dripCost ?? 0, 'Drip kit');
  const rainCost = number(input.rainCost ?? 0, 'Rain-sensor kit');
  const masterCost = number(input.masterCost ?? 0, 'Master-valve kit');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const extraHeadsPerZone = Math.max(0, headsPerZone - INCLUDED_HEADS_PER_ZONE);
  const headCount = zones * headsPerZone;

  const tripHours = hoursTrip;
  const zoneHours = zones * hoursPerZone;
  const extraHeadHours = zones * extraHeadsPerZone * hoursExtraHead;
  const trenchHours = trenchFeet * hoursTrenchPerFoot * soilHourFactor;
  const controllerHours = hoursController;
  const backflowHours = hoursBackflow;
  const dripHours = addDrip ? hoursDrip : 0;
  const rainHours = addRain ? hoursRain : 0;
  const masterHours = addMaster ? hoursMaster : 0;
  const packageHours = dripHours + rainHours + masterHours;
  const totalHours = tripHours + zoneHours + extraHeadHours + trenchHours
    + controllerHours + backflowHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const valveMaterial = zones * valveCost;
  const headMaterial = headCount * headCost;
  const pipeMaterial = trenchFeet * pipeCostPerFoot;
  const controllerMaterial = controllerCost;
  const backflowMaterial = backflowCost;
  const dripMaterial = addDrip ? dripCost : 0;
  const rainMaterial = addRain ? rainCost : 0;
  const masterMaterial = addMaster ? masterCost : 0;
  const permitMaterial = permitFee;
  const materialCost = valveMaterial + headMaterial + pipeMaterial
    + controllerMaterial + backflowMaterial + dripMaterial
    + rainMaterial + masterMaterial + permitMaterial;
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
  const pricePerZone = zones === 0 ? null : price / zones;

  return {
    controller,
    backflow,
    soil,
    zones,
    headsPerZone,
    trenchFeet,
    headCount,
    extraHeadsPerZone,
    addDrip,
    addRain,
    addMaster,
    loadedWage,
    tripHours,
    zoneHours,
    extraHeadHours,
    trenchHours,
    controllerHours,
    backflowHours,
    dripHours,
    rainHours,
    masterHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    valveMaterial,
    headMaterial,
    pipeMaterial,
    controllerMaterial,
    backflowMaterial,
    dripMaterial,
    rainMaterial,
    masterMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerZone,
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
      zones: hourShare(zoneHours + extraHeadHours),
      trench: hourShare(trenchHours),
      hardware: hourShare(controllerHours + backflowHours),
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
 * Format a bid as a plain-text draft the contractor can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Irrigation system install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const controller = CONTROLLER_PRESETS.find((item) => item.id === result.controller)?.label ?? result.controller;
  const backflow = BACKFLOW_PRESETS.find((item) => item.id === result.backflow)?.label ?? result.backflow;
  const soil = SOIL_PRESETS.find((item) => item.id === result.soil)?.label ?? result.soil;
  const extras = [
    result.addDrip ? 'drip conversion included' : null,
    result.addRain ? 'rain / weather sensor included' : null,
    result.addMaster ? 'master valve included' : null,
  ].filter(Boolean);
  const perZone = result.pricePerZone === null ? 'n/a' : money(result.pricePerZone);
  return [
    'IRRIGATION SYSTEM INSTALL BID',
    '',
    `Proposed irrigation-install price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.zones} zones; ${result.headCount} heads; ${result.trenchFeet} ft trench`,
    `Hardware: ${controller}; ${backflow}; ${soil}; ${perZone} per zone`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.zones} zones; ${result.headsPerZone} heads/zone; ${result.trenchFeet} ft trench; ${soil}`,
    `- Zone labor: ${result.zoneHours.toFixed(1)} h; extra heads: ${result.extraHeadHours.toFixed(1)} h; trench: ${result.trenchHours.toFixed(1)} h`,
    `- ${controller}; ${backflow}; ${extras.join('; ') || 'brochure spray system, no drip / rain / master'}`,
    '',
    'This is a draft for review. Confirm the zones, heads, trench, soil, backflow, controller, and all pricing before sending. It is not an irrigation design, a plumbing-code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
