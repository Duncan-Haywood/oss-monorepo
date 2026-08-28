// Pure bid arithmetic for exterior French-drain / yard-drainage *install*
// (not interior basement waterproofing, not gutter install, not a
// sump-pump swap). No network, no state: every foot, depth, soil,
// outlet, wage, and extra is an input, so the result stays a
// transparent calculation the contractor can check against their own
// invoices rather than a claim about what any yard "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$25 a foot installed" special treats a 40-foot shallow 4-inch
// daylight trench in dirt as the same job as an 80-foot deep 6-inch
// run in clay that has to hit a drywell, two catch basins, three
// downspout ties, and a driveway crossing. Homeowners (and a lot of
// estimator sheets) count "a French drain." Depth, pipe size, the
// outlet, basins, and soil do not live in that number. Matching a
// cheaper special written for the brochure 40-foot daylight trench
// is how a sold clay drywell job becomes a two-day loss after the
// first rock ledge and the first saw-cut.
//
// Distinct from basement waterproofing (interior perimeter drain,
// window wells, sump pit) and from gutter *install* (K-style,
// miters, fascia). This prices an exterior yard drain: the trench,
// the pipe, the outlet, and the extras that are not in the coupon.

export const DEPTH_PRESETS = Object.freeze([
  { id: 'shallow', label: 'Shallow (18 in)' },
  { id: 'standard', label: 'Standard (24–30 in)' },
  { id: 'deep', label: 'Deep (36–48 in)' },
]);

export const PIPE_PRESETS = Object.freeze([
  { id: 'four', label: '4-inch perforated' },
  { id: 'six', label: '6-inch perforated' },
]);

export const SOIL_PRESETS = Object.freeze([
  { id: 'dirt', label: 'Dirt / loam' },
  { id: 'clay', label: 'Clay' },
  { id: 'rock', label: 'Rock / hardpan' },
]);

export const OUTLET_PRESETS = Object.freeze([
  { id: 'daylight', label: 'Daylight to grade' },
  { id: 'drywell', label: 'Drywell / pop-up emitter' },
  { id: 'storm', label: 'Storm / catch-basin tie-in' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '40-ft shallow 4-inch daylight, dirt, lawn restore (the $25/ft special)',
    depth: 'shallow',
    pipe: 'four',
    soil: 'dirt',
    outlet: 'daylight',
    linearFeet: 40,
    extraSolidFeet: 0,
    catchBasins: 0,
    downspoutTies: 0,
    drivewayFeet: 0,
    addCatchBasins: false,
    addDownspouts: false,
    addDriveway: false,
    addLawnRestore: true,
  },
  {
    label: '60-ft standard 4-inch daylight, dirt, 1 basin, 2 downspouts, lawn',
    depth: 'standard',
    pipe: 'four',
    soil: 'dirt',
    outlet: 'daylight',
    linearFeet: 60,
    extraSolidFeet: 0,
    catchBasins: 1,
    downspoutTies: 2,
    drivewayFeet: 0,
    addCatchBasins: true,
    addDownspouts: true,
    addDriveway: false,
    addLawnRestore: true,
  },
  {
    label: '80-ft deep 6-inch drywell, clay, 2 basins, 3 downspouts, 15-ft driveway, lawn',
    depth: 'deep',
    pipe: 'six',
    soil: 'clay',
    outlet: 'drywell',
    linearFeet: 80,
    extraSolidFeet: 0,
    catchBasins: 2,
    downspoutTies: 3,
    drivewayFeet: 15,
    addCatchBasins: true,
    addDownspouts: true,
    addDriveway: true,
    addLawnRestore: true,
  },
  {
    label: '50-ft standard 4-inch storm tie-in, dirt, 1 basin, 30-ft solid pipe, lawn',
    depth: 'standard',
    pipe: 'four',
    soil: 'dirt',
    outlet: 'storm',
    linearFeet: 50,
    extraSolidFeet: 30,
    catchBasins: 1,
    downspoutTies: 0,
    drivewayFeet: 0,
    addCatchBasins: true,
    addDownspouts: false,
    addDriveway: false,
    addLawnRestore: true,
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
 * Starting trench hours per foot and gravel cost from the depth.
 * These are ballpark crew figures, not a catalog. Picking a depth
 * never overwrites a cost the contractor has already typed.
 */
export function suggestedDepthKit(depth) {
  const id = String(depth);
  if (id === 'shallow') return { hoursPerFoot: 0.12, gravelCostPerFoot: 4.5 };
  if (id === 'standard') return { hoursPerFoot: 0.16, gravelCostPerFoot: 6.4 };
  if (id === 'deep') return { hoursPerFoot: 0.22, gravelCostPerFoot: 9.2 };
  throw new Error('Unknown French-drain depth');
}

/**
 * Starting pipe cost and a per-foot hour premium from the pipe size.
 */
export function suggestedPipeKit(pipe) {
  const id = String(pipe);
  if (id === 'four') return { pipeCostPerFoot: 2.8, hoursPipePremium: 0 };
  if (id === 'six') return { pipeCostPerFoot: 5.4, hoursPipePremium: 0.03 };
  throw new Error('Unknown French-drain pipe');
}

/**
 * Starting soil hour factor and spoils dump from the dirt.
 */
export function suggestedSoilKit(soil) {
  const id = String(soil);
  if (id === 'dirt') return { soilHourFactor: 1, dumpFee: 85 };
  if (id === 'clay') return { soilHourFactor: 1.45, dumpFee: 185 };
  if (id === 'rock') return { soilHourFactor: 2.1, dumpFee: 320 };
  throw new Error('Unknown French-drain soil');
}

/**
 * Starting outlet hours and kit cost. Daylight is a daylighting
 * swale. A drywell is a rock pit and emitter. A storm tie-in is
 * an adapter, a permit, and a tap.
 */
export function suggestedOutletKit(outlet) {
  const id = String(outlet);
  if (id === 'daylight') return { hoursOutlet: 1.5, outletCost: 0 };
  if (id === 'drywell') return { hoursOutlet: 3.8, outletCost: 380 };
  if (id === 'storm') return { hoursOutlet: 4.2, outletCost: 265 };
  throw new Error('Unknown French-drain outlet');
}

/**
 * Price an exterior French-drain install from the trench, the
 * extras past a brochure 40-foot daylight special, and the
 * contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const depth = String(input.depth ?? 'shallow');
  if (!DEPTH_PRESETS.some((item) => item.id === depth)) {
    throw new Error('Unknown French-drain depth');
  }
  const pipe = String(input.pipe ?? 'four');
  if (!PIPE_PRESETS.some((item) => item.id === pipe)) {
    throw new Error('Unknown French-drain pipe');
  }
  const soil = String(input.soil ?? 'dirt');
  if (!SOIL_PRESETS.some((item) => item.id === soil)) {
    throw new Error('Unknown French-drain soil');
  }
  const outlet = String(input.outlet ?? 'daylight');
  if (!OUTLET_PRESETS.some((item) => item.id === outlet)) {
    throw new Error('Unknown French-drain outlet');
  }

  const addCatchBasins = flag(input.addCatchBasins);
  const addDownspouts = flag(input.addDownspouts);
  const addDriveway = flag(input.addDriveway);
  const addLawnRestore = flag(input.addLawnRestore);

  const linearFeet = number(input.linearFeet ?? 0, 'Linear feet');
  const extraSolidFeet = number(input.extraSolidFeet ?? 0, 'Extra solid-pipe feet');
  const catchBasins = number(input.catchBasins ?? 0, 'Catch basins');
  const downspoutTies = number(input.downspoutTies ?? 0, 'Downspout ties');
  const drivewayFeet = number(input.drivewayFeet ?? 0, 'Driveway crossing feet');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerFoot = number(input.hoursPerFoot ?? 0, 'Hours per trench foot');
  const hoursPipePremium = number(input.hoursPipePremium ?? 0, 'Pipe-size hour premium');
  const soilHourFactor = number(input.soilHourFactor ?? 1, 'Soil hour factor');
  const hoursOutlet = number(input.hoursOutlet ?? 0, 'Outlet hours');
  const hoursCatchBasin = number(input.hoursCatchBasin ?? 0, 'Hours per catch basin');
  const hoursDownspout = number(input.hoursDownspout ?? 0, 'Hours per downspout tie');
  const hoursDrivewayPerFoot = number(input.hoursDrivewayPerFoot ?? 0, 'Hours per driveway foot');
  const hoursLawn = number(input.hoursLawn ?? 0, 'Lawn-restore hours');
  const hoursSolidPerFoot = number(input.hoursSolidPerFoot ?? 0, 'Hours per solid-pipe foot');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const pipeCostPerFoot = number(input.pipeCostPerFoot ?? 0, 'Pipe cost per foot');
  const gravelCostPerFoot = number(input.gravelCostPerFoot ?? 0, 'Gravel cost per foot');
  const fabricCostPerFoot = number(input.fabricCostPerFoot ?? 0, 'Fabric cost per foot');
  const solidPipeCostPerFoot = number(input.solidPipeCostPerFoot ?? 0, 'Solid-pipe cost per foot');
  const outletCost = number(input.outletCost ?? 0, 'Outlet kit');
  const basinCost = number(input.basinCost ?? 0, 'Catch-basin kit');
  const downspoutCost = number(input.downspoutCost ?? 0, 'Downspout-tie kit');
  const drivewayPatchPerFoot = number(input.drivewayPatchPerFoot ?? 0, 'Driveway patch per foot');
  const lawnRestoreCost = number(input.lawnRestoreCost ?? 0, 'Lawn restore');
  const dumpFee = number(input.dumpFee ?? 0, 'Dump / spoils');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const trenchHours = linearFeet * (hoursPerFoot + hoursPipePremium) * soilHourFactor;
  const outletHours = hoursOutlet;
  const basinHours = addCatchBasins ? catchBasins * hoursCatchBasin : 0;
  const downspoutHours = addDownspouts ? downspoutTies * hoursDownspout : 0;
  const drivewayHours = addDriveway ? drivewayFeet * hoursDrivewayPerFoot : 0;
  const lawnHours = addLawnRestore ? hoursLawn : 0;
  const solidHours = extraSolidFeet * hoursSolidPerFoot;
  const packageHours = basinHours + downspoutHours + drivewayHours + lawnHours + solidHours;
  const totalHours = tripHours + trenchHours + outletHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const pipeMaterial = linearFeet * pipeCostPerFoot;
  const gravelMaterial = linearFeet * gravelCostPerFoot;
  const fabricMaterial = linearFeet * fabricCostPerFoot;
  const solidMaterial = extraSolidFeet * solidPipeCostPerFoot;
  const outletMaterial = outletCost;
  const basinMaterial = addCatchBasins ? catchBasins * basinCost : 0;
  const downspoutMaterial = addDownspouts ? downspoutTies * downspoutCost : 0;
  const drivewayMaterial = addDriveway ? drivewayFeet * drivewayPatchPerFoot : 0;
  const lawnMaterial = addLawnRestore ? lawnRestoreCost : 0;
  const dumpMaterial = dumpFee;
  const permitMaterial = permitFee;
  const materialCost = pipeMaterial + gravelMaterial + fabricMaterial + solidMaterial
    + outletMaterial + basinMaterial + downspoutMaterial + drivewayMaterial
    + lawnMaterial + dumpMaterial + permitMaterial;
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
  const pricePerFoot = linearFeet === 0 ? null : price / linearFeet;

  return {
    depth,
    pipe,
    soil,
    outlet,
    linearFeet,
    extraSolidFeet,
    catchBasins: addCatchBasins ? catchBasins : 0,
    downspoutTies: addDownspouts ? downspoutTies : 0,
    drivewayFeet: addDriveway ? drivewayFeet : 0,
    addCatchBasins,
    addDownspouts,
    addDriveway,
    addLawnRestore,
    loadedWage,
    tripHours,
    trenchHours,
    outletHours,
    basinHours,
    downspoutHours,
    drivewayHours,
    lawnHours,
    solidHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    pipeMaterial,
    gravelMaterial,
    fabricMaterial,
    solidMaterial,
    outletMaterial,
    basinMaterial,
    downspoutMaterial,
    drivewayMaterial,
    lawnMaterial,
    dumpMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerFoot,
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
      trench: hourShare(trenchHours),
      outlet: hourShare(outletHours),
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
export function formatBidSummary(result, jobLabel = 'French drain install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const depth = DEPTH_PRESETS.find((item) => item.id === result.depth)?.label ?? result.depth;
  const pipe = PIPE_PRESETS.find((item) => item.id === result.pipe)?.label ?? result.pipe;
  const soil = SOIL_PRESETS.find((item) => item.id === result.soil)?.label ?? result.soil;
  const outlet = OUTLET_PRESETS.find((item) => item.id === result.outlet)?.label ?? result.outlet;
  const extras = [
    result.addCatchBasins && result.catchBasins > 0 ? `${result.catchBasins} catch basin${result.catchBasins === 1 ? '' : 's'} included` : null,
    result.addDownspouts && result.downspoutTies > 0 ? `${result.downspoutTies} downspout tie${result.downspoutTies === 1 ? '' : 's'} included` : null,
    result.addDriveway && result.drivewayFeet > 0 ? `${result.drivewayFeet} ft driveway crossing included` : null,
    result.addLawnRestore ? 'lawn restore included' : 'no lawn restore this bid',
    result.extraSolidFeet > 0 ? `${result.extraSolidFeet} ft solid pipe to outlet included` : null,
  ].filter(Boolean);
  const perFoot = result.pricePerFoot === null ? 'n/a' : money(result.pricePerFoot);
  return [
    'FRENCH DRAIN / YARD DRAINAGE BID',
    '',
    `Proposed French-drain price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.linearFeet} ft; ${depth}; ${pipe}; ${soil}`,
    `Outlet: ${outlet}; ${perFoot} per installed foot`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.linearFeet} ft perforated; ${depth}; ${pipe}; ${soil}; ${outlet}`,
    `- Trench labor: ${result.trenchHours.toFixed(1)} h; outlet: ${result.outletHours.toFixed(1)} h; extras: ${result.packageHours.toFixed(1)} h`,
    `- ${extras.join('; ') || 'brochure daylight trench'}`,
    '',
    'This is a draft for review. Confirm the run, the depth, pipe, soil, outlet, basins, and all pricing before sending. It is not a drainage design, a building-code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
