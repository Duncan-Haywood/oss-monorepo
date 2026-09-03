// Pure bid arithmetic for well-pump and pressure-tank replacement.
// No network, no state: every foot of drop pipe, horsepower, wage, and
// wear charge is an input, so the result stays a transparent calculation
// the shop can check against their own invoices rather than a claim about
// what any well "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$1,495 well-pump special" treats a 60-foot 1/2 HP swap with a good
// pitless adapter as the same job as a 280-foot 1.5 HP pull with a
// seized pitless, a stuck pump, a new tank, extra well cable, and a
// constant-pressure drive. Homeowners (and a lot of estimator sheets)
// count the same kind of number. Extra drop-pipe footage, extra cable,
// the tank, a stuck pull, and a seized pitless do not scale with the
// trip charge. Matching a cheaper special written for the brochure
// shallow well is how a sold deep-well job becomes a half-day loss
// after the first seized adapter.
//
// Distinct from water-heater replacement (vent, gas upsize, attic),
// septic pumping (a tank lid, hose, and extra gallons), hydro-jet /
// sewer-camera work (a drain line and a toilet pull), and electrical-
// panel upgrades (a feeder and a utility). This prices a well: the
// pump, the depth past the included footage, how the pitless comes
// apart, and the tank that keeps the well from short-cycling.

export const TYPE_PRESETS = Object.freeze([
  { id: 'submersible', label: 'Submersible (in the well)' },
  { id: 'jet', label: 'Jet / shallow (above ground)' },
]);

export const WORK_PRESETS = Object.freeze([
  { id: 'pump', label: 'Pump only (keep the tank)' },
  { id: 'pump-tank', label: 'Pump + pressure tank' },
  { id: 'full', label: 'Pump, tank, pitless, and switch' },
]);

export const HP_PRESETS = Object.freeze([
  { id: '0.5', label: '1/2 HP' },
  { id: '0.75', label: '3/4 HP' },
  { id: '1', label: '1 HP' },
  { id: '1.5', label: '1.5 HP' },
]);

export const PITLESS_PRESETS = Object.freeze([
  { id: 'good', label: 'Existing pitless comes apart' },
  { id: 'seized', label: 'Seized pitless — replace it' },
  { id: 'none', label: 'No pitless (jet / buried pit)' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '60 ft 1/2 HP submersible, keep the tank (the $1,495 brochure special)',
    type: 'submersible',
    work: 'pump',
    hp: '0.5',
    pitless: 'good',
    wellDepthFeet: 60,
    includedFootage: 100,
    cableFeet: 70,
    includedCableFeet: 100,
    stuckPump: false,
    addVfd: false,
  },
  {
    label: '120 ft 3/4 HP submersible, new tank, good pitless',
    type: 'submersible',
    work: 'pump-tank',
    hp: '0.75',
    pitless: 'good',
    wellDepthFeet: 120,
    includedFootage: 100,
    cableFeet: 130,
    includedCableFeet: 100,
    stuckPump: false,
    addVfd: false,
  },
  {
    label: '280 ft 1.5 HP, seized pitless, stuck pump, new tank, extra cable, VFD',
    type: 'submersible',
    work: 'full',
    hp: '1.5',
    pitless: 'seized',
    wellDepthFeet: 280,
    includedFootage: 100,
    cableFeet: 300,
    includedCableFeet: 100,
    stuckPump: true,
    addVfd: true,
  },
  {
    label: '40 ft jet pump + tank, no pitless (shallow well)',
    type: 'jet',
    work: 'pump-tank',
    hp: '0.75',
    pitless: 'none',
    wellDepthFeet: 40,
    includedFootage: 100,
    cableFeet: 20,
    includedCableFeet: 100,
    stuckPump: false,
    addVfd: false,
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
 * Starting pump cost from horsepower and type. These are ballpark
 * shop figures, not a catalog. Picking HP or type never overwrites a
 * cost the shop has already typed.
 */
export function suggestedHpKit(hp, type = 'submersible') {
  const id = String(hp);
  const kind = String(type);
  const table = kind === 'jet'
    ? { '0.5': 220, '0.75': 300, '1': 420, '1.5': 620 }
    : { '0.5': 280, '0.75': 380, '1': 520, '1.5': 780 };
  if (!(id in table)) throw new Error('Unknown horsepower');
  return { pumpCost: table[id] };
}

/**
 * Starting pull hours and hoist wear from the pump type. A jet pump
 * sits above ground. A submersible has to come out of the well.
 */
export function suggestedTypeKit(type) {
  const id = String(type);
  if (id === 'submersible') {
    return { hoursPumpBase: 2.5, hoistFee: 75 };
  }
  if (id === 'jet') {
    return { hoursPumpBase: 1.5, hoistFee: 0 };
  }
  throw new Error('Unknown pump type');
}

/**
 * Starting tank and switch hours and materials from the work package.
 * Pump-only keeps the existing tank. Full work also bills the switch.
 */
export function suggestedWorkKit(work) {
  const id = String(work);
  if (id === 'pump') {
    return { hoursTank: 0, tankCost: 0, hoursSwitch: 0, switchCost: 0 };
  }
  if (id === 'pump-tank') {
    return { hoursTank: 1, tankCost: 280, hoursSwitch: 0, switchCost: 0 };
  }
  if (id === 'full') {
    return { hoursTank: 1, tankCost: 280, hoursSwitch: 0.5, switchCost: 85 };
  }
  throw new Error('Unknown work package');
}

/**
 * Starting pitless hours and fittings from how the adapter comes
 * apart. A good existing pitless is free access. A seized one is not.
 * Jet pumps often have no pitless at all.
 */
export function suggestedPitlessKit(pitless) {
  const id = String(pitless);
  if (id === 'good' || id === 'none') {
    return { hoursPitless: 0, pitlessCost: 0 };
  }
  if (id === 'seized') {
    return { hoursPitless: 2, pitlessCost: 185 };
  }
  throw new Error('Unknown pitless condition');
}

/**
 * Price a well-pump replacement from depth past the included footage,
 * horsepower, tank, pitless, stuck pull, extra cable, a constant-
 * pressure drive, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const wellDepthFeet = number(input.wellDepthFeet ?? 0, 'Well depth', { allowZero: false });
  const includedFootage = number(input.includedFootage ?? 0, 'Included footage');
  const cableFeet = number(input.cableFeet ?? 0, 'Well-cable footage');
  const includedCableFeet = number(input.includedCableFeet ?? 0, 'Included cable footage');
  // A brochure special that "includes the first 100 ft" still prices a
  // shallower well — extra footage is zero, not an invalid takeoff.

  const type = String(input.type ?? 'submersible');
  if (!TYPE_PRESETS.some((item) => item.id === type)) {
    throw new Error('Unknown pump type');
  }
  const work = String(input.work ?? 'pump-tank');
  if (!WORK_PRESETS.some((item) => item.id === work)) {
    throw new Error('Unknown work package');
  }
  const hp = String(input.hp ?? '0.75');
  if (!HP_PRESETS.some((item) => item.id === hp)) {
    throw new Error('Unknown horsepower');
  }
  const pitless = String(input.pitless ?? 'good');
  if (!PITLESS_PRESETS.some((item) => item.id === pitless)) {
    throw new Error('Unknown pitless condition');
  }

  const stuckPump = flag(input.stuckPump);
  const addVfd = flag(input.addVfd);
  const replaceTank = work === 'pump-tank' || work === 'full';
  const replaceSwitch = work === 'full';
  const replacePitless = pitless === 'seized';
  const extraFeet = Math.max(0, wellDepthFeet - includedFootage);
  const extraCableFeet = Math.max(0, cableFeet - includedCableFeet);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPumpBase = number(input.hoursPumpBase ?? 0, 'Hours to pull and set the pump');
  const hoursPerExtraFoot = number(input.hoursPerExtraFoot ?? 0, 'Hours per extra drop-pipe foot');
  const hoursTank = number(input.hoursTank ?? 0, 'Hours to set a tank');
  const hoursPitless = number(input.hoursPitless ?? 0, 'Hours to replace a pitless');
  const hoursStuckPull = number(input.hoursStuckPull ?? 0, 'Hours for a stuck pull');
  const hoursSwitch = number(input.hoursSwitch ?? 0, 'Hours for the switch / control box');
  const hoursPerExtraCableFoot = number(input.hoursPerExtraCableFoot ?? 0, 'Hours per extra cable foot');
  const hoursVfd = number(input.hoursVfd ?? 0, 'Hours for a constant-pressure drive');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const pumpCost = number(input.pumpCost ?? 0, 'Pump cost');
  const tankCost = number(input.tankCost ?? 0, 'Tank cost');
  const pitlessCost = number(input.pitlessCost ?? 0, 'Pitless adapter');
  const cablePerFoot = number(input.cablePerFoot ?? 0, 'Cable cost per foot');
  const switchCost = number(input.switchCost ?? 0, 'Switch / control box');
  const vfdCost = number(input.vfdCost ?? 0, 'Constant-pressure drive');
  const hoistFee = number(input.hoistFee ?? 0, 'Pump hoist / crane');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const pumpHours = hoursPumpBase;
  const footageHours = extraFeet * hoursPerExtraFoot;
  const tankHours = replaceTank ? hoursTank : 0;
  const pitlessHours = replacePitless ? hoursPitless : 0;
  const stuckHours = stuckPump ? hoursStuckPull : 0;
  const switchHours = replaceSwitch ? hoursSwitch : 0;
  const cableHours = extraCableFeet * hoursPerExtraCableFoot;
  const vfdHours = addVfd ? hoursVfd : 0;
  const accessHours = pitlessHours + stuckHours;
  const packageHours = tankHours + switchHours + vfdHours;
  const runHours = footageHours + cableHours;
  const totalHours = tripHours + pumpHours + runHours + accessHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const pumpMaterial = pumpCost;
  const tankMaterial = replaceTank ? tankCost : 0;
  const pitlessMaterial = replacePitless ? pitlessCost : 0;
  const cableMaterial = extraCableFeet * cablePerFoot;
  const switchMaterial = replaceSwitch ? switchCost : 0;
  const vfdMaterial = addVfd ? vfdCost : 0;
  const hoistMaterial = type === 'submersible' ? hoistFee : 0;
  const permitMaterial = permitFee;
  const materialCost = pumpMaterial + tankMaterial + pitlessMaterial + cableMaterial
    + switchMaterial + vfdMaterial + hoistMaterial + permitMaterial;
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
    type,
    work,
    hp,
    pitless,
    wellDepthFeet,
    includedFootage,
    extraFeet,
    cableFeet,
    includedCableFeet,
    extraCableFeet,
    stuckPump,
    addVfd,
    replaceTank,
    replaceSwitch,
    replacePitless,
    loadedWage,
    tripHours,
    pumpHours,
    footageHours,
    tankHours,
    pitlessHours,
    stuckHours,
    switchHours,
    cableHours,
    vfdHours,
    accessHours,
    packageHours,
    runHours,
    siteHours,
    totalHours,
    laborCost,
    pumpMaterial,
    tankMaterial,
    pitlessMaterial,
    cableMaterial,
    switchMaterial,
    vfdMaterial,
    hoistMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerFoot: wellDepthFeet === 0 ? null : price / wellDepthFeet,
    pricePerExtraFoot: extraFeet === 0 ? null : price / extraFeet,
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
      pump: hourShare(pumpHours),
      run: hourShare(runHours),
      access: hourShare(accessHours),
      extras: hourShare(packageHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perFoot: wellDepthFeet === 0 ? null : proposedPrice / wellDepthFeet,
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
export function formatBidSummary(result, jobLabel = 'Well pump replacement') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perFoot = result.pricePerFoot === null
    ? 'n/a'
    : `${money(result.pricePerFoot)} / ft of well depth`;
  const type = TYPE_PRESETS.find((item) => item.id === result.type)?.label ?? result.type;
  const work = WORK_PRESETS.find((item) => item.id === result.work)?.label ?? result.work;
  const hp = HP_PRESETS.find((item) => item.id === result.hp)?.label ?? result.hp;
  const pitless = PITLESS_PRESETS.find((item) => item.id === result.pitless)?.label ?? result.pitless;
  const tank = result.replaceTank ? 'new pressure tank included' : 'existing tank kept';
  const stuck = result.stuckPump ? 'stuck-pump pull included' : 'no stuck-pump pull this bid';
  const vfd = result.addVfd ? 'constant-pressure drive included' : 'no constant-pressure drive this bid';
  return [
    'WELL PUMP / PRESSURE TANK BID',
    '',
    `Proposed well-pump price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${type}; ${hp}; ${work}`,
    `Price per foot of well depth: ${perFoot}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${type}; ${result.wellDepthFeet} ft of well (${result.extraFeet} ft past the included ${result.includedFootage} ft)`,
    `- Pitless: ${pitless}; well cable: ${result.cableFeet} ft`,
    `- ${tank}; ${stuck}; ${vfd}`,
    `- Pump labor: ${result.pumpHours.toFixed(1)} h; extra footage / cable: ${result.runHours.toFixed(1)} h; pitless / stuck pull: ${result.accessHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm well depth, horsepower, tank size, pitless condition, cable, permits, and all pricing before sending. It is not a well-drilling specification, a water-quality report, a permit, or an engineering stamp.',
  ].join('\n');
}
