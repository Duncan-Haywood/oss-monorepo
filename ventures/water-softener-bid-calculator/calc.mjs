// Pure bid arithmetic for water-softener and iron-filter installation.
// No network, no state: every grain of capacity, foot of pipe, wage, and
// wear charge is an input, so the result stays a transparent calculation
// the shop can check against their own invoices rather than a claim about
// what any house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$799 installed" water-softener special treats a 32k PEX garage
// hang with ten included feet as the same job as a 64k copper cut-in
// with an iron filter, a long drain, haul-away of the old unit, and a
// brine-tank receptacle. Homeowners (and a lot of estimator sheets)
// count the same kind of number. Extra pipe past the included run,
// copper versus PEX, the iron filter, the drain, and the haul-away do
// not scale with the trip charge. Matching a cheaper special written
// for the brochure garage hang is how a sold copper-and-iron job
// becomes a half-day loss after the first soldered cut-in.
//
// Distinct from well-pump replacement (drop-pipe footage, pitless,
// VFD), water-heater replacement (vent, gas upsize, attic), and
// septic pumping (a tank lid, hose, and extra gallons). This prices
// a water-treatment install: the softener, the run from the main,
// how the pipe is cut in, and the iron or RO that is not in the
// coupon.

export const CAPACITY_PRESETS = Object.freeze([
  { id: '24k', label: '24,000 grain' },
  { id: '32k', label: '32,000 grain' },
  { id: '48k', label: '48,000 grain' },
  { id: '64k', label: '64,000 grain' },
]);

export const SYSTEM_PRESETS = Object.freeze([
  { id: 'salt', label: 'Salt / resin (metered)' },
  { id: 'salt-free', label: 'Salt-free / TAC' },
]);

export const WORK_PRESETS = Object.freeze([
  { id: 'softener', label: 'Softener only' },
  { id: 'softener-iron', label: 'Softener + iron filter' },
  { id: 'softener-ro', label: 'Softener + under-sink RO' },
]);

export const PIPE_PRESETS = Object.freeze([
  { id: 'pex', label: 'PEX (new or existing)' },
  { id: 'copper', label: 'Copper (cut-in / solder)' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '32k salt, PEX garage hang, first 10 ft included (the $799 brochure special)',
    capacity: '32k',
    system: 'salt',
    work: 'softener',
    pipe: 'pex',
    pipeFeet: 8,
    includedPipeFeet: 10,
    drainFeet: 6,
    includedDrainFeet: 15,
    haulAway: false,
    addElectrical: false,
  },
  {
    label: '48k salt, copper cut-in, 25 ft extra, haul-away',
    capacity: '48k',
    system: 'salt',
    work: 'softener',
    pipe: 'copper',
    pipeFeet: 35,
    includedPipeFeet: 10,
    drainFeet: 12,
    includedDrainFeet: 15,
    haulAway: true,
    addElectrical: false,
  },
  {
    label: '64k salt + iron filter, copper, long drain, haul-away, brine receptacle',
    capacity: '64k',
    system: 'salt',
    work: 'softener-iron',
    pipe: 'copper',
    pipeFeet: 45,
    includedPipeFeet: 10,
    drainFeet: 40,
    includedDrainFeet: 15,
    haulAway: true,
    addElectrical: true,
  },
  {
    label: 'Salt-free TAC, 40 ft copper, no brine drain',
    capacity: '32k',
    system: 'salt-free',
    work: 'softener',
    pipe: 'copper',
    pipeFeet: 40,
    includedPipeFeet: 10,
    drainFeet: 0,
    includedDrainFeet: 15,
    haulAway: false,
    addElectrical: false,
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
 * Starting softener cost from grain capacity. These are ballpark
 * shop figures, not a catalog. Picking capacity never overwrites a
 * cost the shop has already typed.
 */
export function suggestedCapacityKit(capacity) {
  const id = String(capacity);
  const table = { '24k': 320, '32k': 380, '48k': 580, '64k': 780 };
  if (!(id in table)) throw new Error('Unknown grain capacity');
  return { softenerCost: table[id] };
}

/**
 * Starting hang hours and brine-drain fittings from the system type.
 * Salt/resin needs a drain. Salt-free / TAC does not.
 */
export function suggestedSystemKit(system) {
  const id = String(system);
  if (id === 'salt') {
    return { hoursSoftenerBase: 1.75, hoursDrainBase: 0.25, drainFittingCost: 35 };
  }
  if (id === 'salt-free') {
    return { hoursSoftenerBase: 1.5, hoursDrainBase: 0, drainFittingCost: 0 };
  }
  throw new Error('Unknown system type');
}

/**
 * Starting iron / RO hours and materials from the work package.
 * Softener-only keeps those adders off. Iron and RO are not a
 * blended markup on the coupon.
 */
export function suggestedWorkKit(work) {
  const id = String(work);
  if (id === 'softener') {
    return { hoursIron: 0, ironCost: 0, hoursRo: 0, roCost: 0 };
  }
  if (id === 'softener-iron') {
    return { hoursIron: 1.5, ironCost: 620, hoursRo: 0, roCost: 0 };
  }
  if (id === 'softener-ro') {
    return { hoursIron: 0, ironCost: 0, hoursRo: 1.25, roCost: 340 };
  }
  throw new Error('Unknown work package');
}

/**
 * Starting extra-pipe hours and material from how the main is cut in.
 * PEX is a crimp. Copper is soldered time that a brochure special
 * never sees.
 */
export function suggestedPipeKit(pipe) {
  const id = String(pipe);
  if (id === 'pex') {
    return { hoursPerExtraPipeFoot: 0.08, pipePerFoot: 1.2 };
  }
  if (id === 'copper') {
    return { hoursPerExtraPipeFoot: 0.16, pipePerFoot: 8.5 };
  }
  throw new Error('Unknown pipe material');
}

/**
 * Price a water-softener install from extra pipe past the included
 * run, copper versus PEX, iron or RO, drain, haul-away, a brine
 * receptacle, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const pipeFeet = number(input.pipeFeet ?? 0, 'Pipe run', { allowZero: false });
  const includedPipeFeet = number(input.includedPipeFeet ?? 0, 'Included pipe footage');
  const drainFeet = number(input.drainFeet ?? 0, 'Drain run');
  const includedDrainFeet = number(input.includedDrainFeet ?? 0, 'Included drain footage');
  // A brochure special that "includes the first 10 ft" still prices a
  // shorter garage hang — extra footage is zero, not an invalid takeoff.

  const capacity = String(input.capacity ?? '32k');
  if (!CAPACITY_PRESETS.some((item) => item.id === capacity)) {
    throw new Error('Unknown grain capacity');
  }
  const system = String(input.system ?? 'salt');
  if (!SYSTEM_PRESETS.some((item) => item.id === system)) {
    throw new Error('Unknown system type');
  }
  const work = String(input.work ?? 'softener');
  if (!WORK_PRESETS.some((item) => item.id === work)) {
    throw new Error('Unknown work package');
  }
  const pipe = String(input.pipe ?? 'pex');
  if (!PIPE_PRESETS.some((item) => item.id === pipe)) {
    throw new Error('Unknown pipe material');
  }

  const haulAway = flag(input.haulAway);
  const addElectrical = flag(input.addElectrical);
  const addIron = work === 'softener-iron';
  const addRo = work === 'softener-ro';
  const needsDrain = system === 'salt';
  const extraPipeFeet = Math.max(0, pipeFeet - includedPipeFeet);
  const extraDrainFeet = needsDrain ? Math.max(0, drainFeet - includedDrainFeet) : 0;

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursSoftenerBase = number(input.hoursSoftenerBase ?? 0, 'Hours to hang the softener');
  const hoursPerExtraPipeFoot = number(input.hoursPerExtraPipeFoot ?? 0, 'Hours per extra pipe foot');
  const hoursDrainBase = number(input.hoursDrainBase ?? 0, 'Hours for the brine drain');
  const hoursPerExtraDrainFoot = number(input.hoursPerExtraDrainFoot ?? 0, 'Hours per extra drain foot');
  const hoursIron = number(input.hoursIron ?? 0, 'Hours to set an iron filter');
  const hoursRo = number(input.hoursRo ?? 0, 'Hours to set under-sink RO');
  const hoursHaulAway = number(input.hoursHaulAway ?? 0, 'Hours to haul the old unit');
  const hoursElectrical = number(input.hoursElectrical ?? 0, 'Hours for a brine receptacle');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const softenerCost = number(input.softenerCost ?? 0, 'Softener cost');
  const ironCost = number(input.ironCost ?? 0, 'Iron filter');
  const roCost = number(input.roCost ?? 0, 'Under-sink RO');
  const bypassCost = number(input.bypassCost ?? 0, 'Bypass valve');
  const pipePerFoot = number(input.pipePerFoot ?? 0, 'Pipe cost per foot');
  const drainFittingCost = number(input.drainFittingCost ?? 0, 'Drain fittings');
  const drainPerFoot = number(input.drainPerFoot ?? 0, 'Drain cost per foot');
  const haulFee = number(input.haulFee ?? 0, 'Haul-away / disposal');
  const electricalCost = number(input.electricalCost ?? 0, 'Brine receptacle');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const hangHours = hoursSoftenerBase;
  const pipeHours = extraPipeFeet * hoursPerExtraPipeFoot;
  const drainHours = needsDrain ? hoursDrainBase + extraDrainFeet * hoursPerExtraDrainFoot : 0;
  const ironHours = addIron ? hoursIron : 0;
  const roHours = addRo ? hoursRo : 0;
  const haulHours = haulAway ? hoursHaulAway : 0;
  const electricalHours = addElectrical ? hoursElectrical : 0;
  const runHours = pipeHours + drainHours;
  const packageHours = ironHours + roHours + haulHours + electricalHours;
  const totalHours = tripHours + hangHours + runHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const softenerMaterial = softenerCost;
  const ironMaterial = addIron ? ironCost : 0;
  const roMaterial = addRo ? roCost : 0;
  const bypassMaterial = bypassCost;
  const pipeMaterial = extraPipeFeet * pipePerFoot;
  const drainMaterial = needsDrain ? drainFittingCost + extraDrainFeet * drainPerFoot : 0;
  const haulMaterial = haulAway ? haulFee : 0;
  const electricalMaterial = addElectrical ? electricalCost : 0;
  const permitMaterial = permitFee;
  const materialCost = softenerMaterial + ironMaterial + roMaterial + bypassMaterial
    + pipeMaterial + drainMaterial + haulMaterial + electricalMaterial + permitMaterial;
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
    capacity,
    system,
    work,
    pipe,
    pipeFeet,
    includedPipeFeet,
    extraPipeFeet,
    drainFeet,
    includedDrainFeet,
    extraDrainFeet,
    haulAway,
    addElectrical,
    addIron,
    addRo,
    needsDrain,
    loadedWage,
    tripHours,
    hangHours,
    pipeHours,
    drainHours,
    ironHours,
    roHours,
    haulHours,
    electricalHours,
    runHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    softenerMaterial,
    ironMaterial,
    roMaterial,
    bypassMaterial,
    pipeMaterial,
    drainMaterial,
    haulMaterial,
    electricalMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerPipeFoot: pipeFeet === 0 ? null : price / pipeFeet,
    pricePerExtraPipeFoot: extraPipeFeet === 0 ? null : price / extraPipeFeet,
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
      hang: hourShare(hangHours),
      run: hourShare(runHours),
      extras: hourShare(packageHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perPipeFoot: pipeFeet === 0 ? null : proposedPrice / pipeFeet,
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
export function formatBidSummary(result, jobLabel = 'Water softener install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perFoot = result.pricePerPipeFoot === null
    ? 'n/a'
    : `${money(result.pricePerPipeFoot)} / ft of pipe run`;
  const capacity = CAPACITY_PRESETS.find((item) => item.id === result.capacity)?.label ?? result.capacity;
  const system = SYSTEM_PRESETS.find((item) => item.id === result.system)?.label ?? result.system;
  const work = WORK_PRESETS.find((item) => item.id === result.work)?.label ?? result.work;
  const pipe = PIPE_PRESETS.find((item) => item.id === result.pipe)?.label ?? result.pipe;
  const iron = result.addIron ? 'iron filter included' : 'no iron filter this bid';
  const ro = result.addRo ? 'under-sink RO included' : 'no under-sink RO this bid';
  const haul = result.haulAway ? 'haul-away of the old unit included' : 'no haul-away this bid';
  const electrical = result.addElectrical ? 'brine receptacle included' : 'no brine receptacle this bid';
  return [
    'WATER SOFTENER / IRON FILTER BID',
    '',
    `Proposed water-softener price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${capacity}; ${system}; ${work}`,
    `Price per foot of pipe run: ${perFoot}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${capacity}; ${system}; ${pipe}; ${result.pipeFeet} ft of pipe (${result.extraPipeFeet} ft past the included ${result.includedPipeFeet} ft)`,
    `- Drain: ${result.needsDrain ? `${result.drainFeet} ft (${result.extraDrainFeet} ft past the included ${result.includedDrainFeet} ft)` : 'no brine drain (salt-free)'}`,
    `- ${iron}; ${ro}; ${haul}; ${electrical}`,
    `- Hang labor: ${result.hangHours.toFixed(1)} h; extra pipe / drain: ${result.runHours.toFixed(1)} h; iron / RO / haul / receptacle: ${result.packageHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm grain capacity, hardness, pipe material, drain, permits, and all pricing before sending. It is not a water-quality report, a treatment specification, a permit, or an engineering stamp.',
  ].join('\n');
}
