// Pure bid arithmetic for fireplace-*insert* installs (not a CSIA
// chimney sweep, not a full masonry rebuild sold as a house, not a
// standalone wood stove on an exterior chase). No network, no state:
// every fuel, liner foot, hearth, wage, and surround is an input, so
// the result stays a transparent calculation the shop can check against
// their own invoices rather than a claim about what any fireplace
// "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$2,499 installed" gas-insert special treats a small gas cassette in
// an existing masonry firebox with a live gas stub, no liner, and a
// one-story stack as the same job as a large wood insert, a 30-foot
// stainless liner, a new hearth pad, a surround, and a two-story
// chimney. Homeowners (and a lot of estimator sheets) count "an
// insert." The liner footage, the hearth, the gas run, a dedicated
// circuit, and the stack height do not live in that number. Matching a
// cheaper special written for the brochure gas hang is how a sold
// wood-and-liner job becomes a two-day loss after the first seized
// damper.
//
// Distinct from chimney *sweep* (flue, creosote, CSIA height) and from
// a full chimney rebuild sold as the job. This prices the insert, the
// liner, the hearth, and the extras that are not in the coupon.

export const FUEL_PRESETS = Object.freeze([
  { id: 'gas', label: 'Gas (NG / LP cassette)' },
  { id: 'pellet', label: 'Pellet insert' },
  { id: 'wood', label: 'Wood-burning insert' },
]);

export const SIZE_PRESETS = Object.freeze([
  { id: 'small', label: 'Small (up to ~35k BTU / compact box)' },
  { id: 'medium', label: 'Medium (typical masonry opening)' },
  { id: 'large', label: 'Large / high-output' },
]);

export const CHIMNEY_PRESETS = Object.freeze([
  { id: 'none', label: 'Existing liner / no liner this bid' },
  { id: 'liner', label: 'New stainless liner' },
  { id: 'rebuild', label: 'Masonry rebuild / reline package' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'one', label: 'One-story stack / ground roof' },
  { id: 'two', label: 'Two-story / tall stack / hard roof' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Small gas insert, existing stub, no liner, one story (the $2,499 installed special)',
    fuel: 'gas',
    size: 'small',
    chimney: 'none',
    access: 'one',
    linerFeet: 0,
    addHearth: false,
    addGasLine: false,
    addCircuit: false,
    addSurround: false,
    addDamper: false,
    tearOut: true,
  },
  {
    label: 'Small gas insert, short liner, existing gas, one story',
    fuel: 'gas',
    size: 'small',
    chimney: 'liner',
    access: 'one',
    linerFeet: 16,
    addHearth: false,
    addGasLine: false,
    addCircuit: false,
    addSurround: false,
    addDamper: true,
    tearOut: true,
  },
  {
    label: 'Large wood insert, 30 ft liner, new hearth, surround, damper, 2nd-story stack',
    fuel: 'wood',
    size: 'large',
    chimney: 'liner',
    access: 'two',
    linerFeet: 30,
    addHearth: true,
    addGasLine: false,
    addCircuit: false,
    addSurround: true,
    addDamper: true,
    tearOut: true,
  },
  {
    label: 'Medium pellet insert, dedicated circuit, 22 ft liner, new hearth',
    fuel: 'pellet',
    size: 'medium',
    chimney: 'liner',
    access: 'one',
    linerFeet: 22,
    addHearth: true,
    addGasLine: false,
    addCircuit: true,
    addSurround: false,
    addDamper: false,
    tearOut: true,
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
 * Starting set hours and unit-cost multiplier from the box size.
 * These are ballpark shop figures, not a catalog. Picking a size
 * never overwrites a cost the shop has already typed.
 */
export function suggestedSizeKit(size) {
  const id = String(size);
  if (id === 'small') {
    return { hoursSet: 3.5, unitCostMultiplier: 1 };
  }
  if (id === 'medium') {
    return { hoursSet: 4.4, unitCostMultiplier: 1.28 };
  }
  if (id === 'large') {
    return { hoursSet: 5.6, unitCostMultiplier: 1.62 };
  }
  throw new Error('Unknown insert size');
}

/**
 * Starting unit cost and set-hour premium from the fuel.
 */
export function suggestedFuelKit(fuel) {
  const id = String(fuel);
  if (id === 'gas') return { unitCost: 1850, hoursSetPremium: 0 };
  if (id === 'pellet') return { unitCost: 2450, hoursSetPremium: 0.5 };
  if (id === 'wood') return { unitCost: 2900, hoursSetPremium: 0.7 };
  throw new Error('Unknown insert fuel');
}

/**
 * Starting chimney hours that are not liner footage. A rebuild is
 * a day; a new liner bills by the foot instead.
 */
export function suggestedChimneyKit(chimney) {
  const id = String(chimney);
  if (id === 'none') return { hoursChimney: 0 };
  if (id === 'liner') return { hoursChimney: 0 };
  if (id === 'rebuild') return { hoursChimney: 8 };
  throw new Error('Unknown chimney scope');
}

/**
 * Starting access hours. A one-story stack is not a two-story
 * roof with a 32-foot chase.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'one') return { hoursAccess: 0 };
  if (id === 'two') return { hoursAccess: 1.4 };
  throw new Error('Unknown access / stack height');
}

/**
 * Price a fireplace-insert install from the fuel, the liner, the
 * extras past a brochure gas hang, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const linerFeet = number(input.linerFeet ?? 0, 'Liner footage');

  const fuel = String(input.fuel ?? 'gas');
  if (!FUEL_PRESETS.some((item) => item.id === fuel)) {
    throw new Error('Unknown insert fuel');
  }
  const size = String(input.size ?? 'small');
  if (!SIZE_PRESETS.some((item) => item.id === size)) {
    throw new Error('Unknown insert size');
  }
  const chimney = String(input.chimney ?? 'none');
  if (!CHIMNEY_PRESETS.some((item) => item.id === chimney)) {
    throw new Error('Unknown chimney scope');
  }
  const access = String(input.access ?? 'one');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) {
    throw new Error('Unknown access / stack height');
  }

  const addHearth = flag(input.addHearth);
  const addGasLine = flag(input.addGasLine);
  const addCircuit = flag(input.addCircuit);
  const addSurround = flag(input.addSurround);
  const addDamper = flag(input.addDamper);
  const tearOut = flag(input.tearOut);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursSet = number(input.hoursSet ?? 0, 'Hours to set the insert');
  const hoursSetPremium = number(input.hoursSetPremium ?? 0, 'Fuel set-hour premium');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Two-story / tall-stack hours');
  const hoursChimney = number(input.hoursChimney ?? 0, 'Rebuild / chimney-package hours');
  const hoursPerLinerFoot = number(input.hoursPerLinerFoot ?? 0, 'Hours per liner foot');
  const hoursHearth = number(input.hoursHearth ?? 0, 'Hours for a new hearth');
  const hoursGasLine = number(input.hoursGasLine ?? 0, 'Hours for a new gas run');
  const hoursCircuit = number(input.hoursCircuit ?? 0, 'Hours for a dedicated circuit');
  const hoursSurround = number(input.hoursSurround ?? 0, 'Hours for a surround / mantel');
  const hoursDamper = number(input.hoursDamper ?? 0, 'Hours for a damper / cap');
  const hoursTearOut = number(input.hoursTearOut ?? 0, 'Hours to tear out the old unit');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const unitCost = number(input.unitCost ?? 0, 'Insert unit cost');
  const unitCostMultiplier = number(input.unitCostMultiplier ?? 1, 'Size unit-cost multiplier');
  const linerKit = number(input.linerKit ?? 0, 'Liner kit / tee / cap');
  const linerPerFoot = number(input.linerPerFoot ?? 0, 'Liner per foot');
  const rebuildMaterial = number(input.rebuildMaterial ?? 0, 'Rebuild / masonry package');
  const hearthCost = number(input.hearthCost ?? 0, 'Hearth pad');
  const gasLineCost = number(input.gasLineCost ?? 0, 'Gas line / conversion');
  const circuitCost = number(input.circuitCost ?? 0, 'Dedicated circuit');
  const surroundCost = number(input.surroundCost ?? 0, 'Surround / mantel');
  const damperCost = number(input.damperCost ?? 0, 'Damper / cap');
  const dumpFee = number(input.dumpFee ?? 0, 'Dump / haul-away');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const billLiner = chimney === 'liner';
  const billRebuild = chimney === 'rebuild';

  const tripHours = hoursTrip;
  const setHours = hoursSet + hoursSetPremium;
  const accessHours = hoursAccess;
  const chimneyHours = (billRebuild ? hoursChimney : 0)
    + (billLiner ? linerFeet * hoursPerLinerFoot : 0);
  const packageHours = (addHearth ? hoursHearth : 0)
    + (addGasLine ? hoursGasLine : 0)
    + (addCircuit ? hoursCircuit : 0)
    + (addSurround ? hoursSurround : 0)
    + (addDamper ? hoursDamper : 0)
    + (tearOut ? hoursTearOut : 0);
  const totalHours = tripHours + setHours + accessHours + chimneyHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const insertMaterial = unitCost * unitCostMultiplier;
  const linerMaterial = billLiner ? linerKit + linerFeet * linerPerFoot : 0;
  const rebuildMat = billRebuild ? rebuildMaterial : 0;
  const hearthMaterial = addHearth ? hearthCost : 0;
  const gasMaterial = addGasLine ? gasLineCost : 0;
  const circuitMaterial = addCircuit ? circuitCost : 0;
  const surroundMaterial = addSurround ? surroundCost : 0;
  const damperMaterial = addDamper ? damperCost : 0;
  const dumpMaterial = tearOut ? dumpFee : 0;
  const permitMaterial = permitFee;
  const materialCost = insertMaterial + linerMaterial + rebuildMat + hearthMaterial
    + gasMaterial + circuitMaterial + surroundMaterial + damperMaterial
    + dumpMaterial + permitMaterial;
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
    fuel,
    size,
    chimney,
    access,
    linerFeet,
    addHearth,
    addGasLine,
    addCircuit,
    addSurround,
    addDamper,
    tearOut,
    loadedWage,
    tripHours,
    setHours,
    accessHours,
    chimneyHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    insertMaterial,
    linerMaterial,
    rebuildMat,
    hearthMaterial,
    gasMaterial,
    circuitMaterial,
    surroundMaterial,
    damperMaterial,
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
    pricePerInsert: price,
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
      chimney: hourShare(chimneyHours),
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
export function formatBidSummary(result, jobLabel = 'Fireplace insert install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const fuel = FUEL_PRESETS.find((item) => item.id === result.fuel)?.label ?? result.fuel;
  const size = SIZE_PRESETS.find((item) => item.id === result.size)?.label ?? result.size;
  const chimney = CHIMNEY_PRESETS.find((item) => item.id === result.chimney)?.label ?? result.chimney;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const extras = [
    result.chimney === 'liner' && result.linerFeet ? `${result.linerFeet} ft stainless liner` : null,
    result.chimney === 'rebuild' ? 'masonry rebuild / reline package' : null,
    result.addHearth ? 'new hearth pad included' : null,
    result.addGasLine ? 'new gas run / conversion included' : null,
    result.addCircuit ? 'dedicated circuit included' : null,
    result.addSurround ? 'surround / mantel included' : null,
    result.addDamper ? 'damper / cap included' : null,
    result.tearOut ? 'tear-out of the old unit included' : 'no tear-out this bid',
  ].filter(Boolean);
  return [
    'FIREPLACE INSERT INSTALL BID',
    '',
    `Proposed insert price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${fuel}; ${size}`,
    `Chimney: ${chimney}; access: ${access}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${fuel}; ${size}; ${chimney}; ${access}`,
    `- Set labor: ${result.setHours.toFixed(1)} h; stack / access: ${result.accessHours.toFixed(1)} h; chimney (liner / rebuild): ${result.chimneyHours.toFixed(1)} h; extras: ${result.packageHours.toFixed(1)} h`,
    `- ${extras.join('; ') || 'standard brochure gas hang'}`,
    '',
    'This is a draft for review. Confirm the fuel, the opening, liner footage, hearth, gas, circuit, surround, and all pricing before sending. It is not a fireplace design, a building-code determination, a permit, a WETT/CSIA inspection, or an engineering stamp.',
  ].join('\n');
}
