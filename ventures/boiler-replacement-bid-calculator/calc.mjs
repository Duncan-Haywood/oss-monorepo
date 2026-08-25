// Pure bid arithmetic for residential boiler replacement.
// No network, no state: every MBH, zone, flue foot, wage, and
// boiler invoice is an input, so the result stays a transparent
// calculation the hydronic tech can check against their own tickets
// rather than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$4,500 boiler special" treats an 80 MBH gas hot-water like-for-like
// swap with two zones as the same job as a 140 MBH steam-to-hot-water
// conversion with four zones, an indirect tank, and a chimney liner.
// Homeowners (and a lot of estimator sheets) count the same kind of
// number. Zones, liner footage, an indirect, oil-to-gas, and a steam
// conversion do not live in that dump. Matching a cheap hot-water
// special on a steam conversion is how a sold boiler becomes a loss
// when the piping and the liner eat the margin.
//
// Distinct from *furnace* replacement (forced air, AFUE, matching
// coil), *water-heater* (a tank or tankless, not a hydronic plant),
// *mini-split* (line-set and heads), *fireplace-insert* (a liner in
// a firebox), and *chimney sweep* (a flue cleaning). This prices a
// boiler changeout: input MBH, system, scope, and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'like-for-like', label: 'Like-for-like swap — the cheap special' },
  { id: 'condensing-upgrade', label: 'Condensing upgrade — new vent and condensate' },
  { id: 'steam-to-hw', label: 'Steam-to-hot-water conversion — piping is the job' },
]);

export const SYSTEM_PRESETS = Object.freeze([
  { id: 'hot-water', label: 'Hot water / hydronic — circulators and zones' },
  { id: 'steam', label: 'Steam — Hartford loop and low-water cutoff' },
]);

export const FUEL_PRESETS = Object.freeze([
  { id: 'gas', label: 'Natural gas' },
  { id: 'oil', label: 'Oil' },
  { id: 'propane', label: 'Propane' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 80 MBH gas hot-water, 2 zones, like-for-like',
    inputMbh: 80,
    zones: 2,
    flueHeight: 18,
    scope: 'like-for-like',
    system: 'hot-water',
    fuel: 'gas',
    travelMiles: 10,
    includeIndirect: false,
    includeLiner: false,
    includeOilToGas: false,
    includePrimarySecondary: false,
  },
  {
    label: 'Typical condensing: 100 MBH gas, 3 zones, indirect, PVC vent',
    inputMbh: 100,
    zones: 3,
    flueHeight: 22,
    scope: 'condensing-upgrade',
    system: 'hot-water',
    fuel: 'gas',
    travelMiles: 14,
    includeIndirect: true,
    includeLiner: false,
    includeOilToGas: false,
    includePrimarySecondary: true,
  },
  {
    label: 'Steam swap: 140 MBH steam, 3 zones, liner, no conversion',
    inputMbh: 140,
    zones: 3,
    flueHeight: 28,
    scope: 'like-for-like',
    system: 'steam',
    fuel: 'gas',
    travelMiles: 16,
    includeIndirect: false,
    includeLiner: true,
    includeOilToGas: false,
    includePrimarySecondary: false,
  },
  {
    label: 'Losing job: 140 MBH oil steam → gas HW, 4 zones, liner, indirect',
    inputMbh: 140,
    zones: 4,
    flueHeight: 30,
    scope: 'steam-to-hw',
    system: 'steam',
    fuel: 'oil',
    travelMiles: 22,
    includeIndirect: true,
    includeLiner: true,
    includeOilToGas: true,
    includePrimarySecondary: true,
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

function requirePreset(presets, id, label) {
  const found = presets.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown ${label}`);
  return found;
}

/**
 * Travel hours from a trip plus miles. Miles of zero is a local
 * stop, not a missing input.
 */
export function travelHours(hoursTrip, travelMiles, hoursPerMile) {
  return number(hoursTrip, 'Trip hours')
    + number(travelMiles, 'Travel miles') * number(hoursPerMile, 'Hours per mile');
}

/**
 * Starting plant hours from how much of the boiler is actually
 * sold. Like-for-like is the cheap special. Condensing is a vent
 * and condensate change. Steam-to-hot-water is a piping job.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'like-for-like') {
    return {
      hoursPlant: 7.5,
      hoursVent: 1.2,
      hoursCondensate: 0,
      hoursConversion: 0,
      plantInvoice: 2400,
    };
  }
  if (id === 'condensing-upgrade') {
    return {
      hoursPlant: 9.5,
      hoursVent: 3.4,
      hoursCondensate: 1.6,
      hoursConversion: 0,
      plantInvoice: 3800,
    };
  }
  if (id === 'steam-to-hw') {
    return {
      hoursPlant: 16,
      hoursVent: 2.2,
      hoursCondensate: 0.8,
      hoursConversion: 8.5,
      plantInvoice: 4200,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Steam is a different plant than hydronic. Circulators and an
 * expansion tank do not show up on a steam special; a Hartford
 * loop and a low-water cutoff do not show up on a hot-water one.
 */
export function suggestedSystemKit(system) {
  const id = String(system);
  if (id === 'hot-water') {
    return {
      hoursPerZone: 1.4,
      hoursPerMbh: 0.012,
      zoneEach: 185,
      systemHardware: 220,
    };
  }
  if (id === 'steam') {
    return {
      hoursPerZone: 1.8,
      hoursPerMbh: 0.018,
      zoneEach: 95,
      systemHardware: 340,
    };
  }
  throw new Error('Unknown system');
}

/**
 * Fuel changes the boiler invoice and the conversion kit. Oil
 * is a tank and a burner. Propane is an orifice and a regulator.
 * Gas is the cheap-special assumption.
 */
export function suggestedFuelKit(fuel) {
  const id = String(fuel);
  if (id === 'gas') {
    return { fuelInvoicePerMbh: 6.5, fuelHardware: 80 };
  }
  if (id === 'oil') {
    return { fuelInvoicePerMbh: 8.2, fuelHardware: 240 };
  }
  if (id === 'propane') {
    return { fuelInvoicePerMbh: 7.4, fuelHardware: 160 };
  }
  throw new Error('Unknown fuel');
}

/**
 * Starting extras that do not live in a $4,500 special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.4,
    hoursPerMile: 0.035,
    hoursIndirect: 3.2,
    hoursLinerPerFt: 0.18,
    hoursOilToGas: 4.5,
    hoursPrimarySecondary: 2.4,
    siteHours: 1.2,
    indirectInvoice: 1450,
    linerPerFt: 28,
    oilToGasInvoice: 620,
    primarySecondaryInvoice: 380,
    travelPerMile: 2.8,
  };
}

/**
 * Price a boiler replacement from the plant, the system, the
 * scope, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const system = requirePreset(SYSTEM_PRESETS, input.system, 'system').id;
  const fuel = requirePreset(FUEL_PRESETS, input.fuel, 'fuel').id;

  const inputMbh = number(input.inputMbh ?? 0, 'Input MBH');
  const zones = number(input.zones ?? 0, 'Zones');
  const flueHeight = number(input.flueHeight ?? 0, 'Flue height');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeIndirect = flag(input.includeIndirect);
  const includeLiner = flag(input.includeLiner);
  const includeOilToGas = flag(input.includeOilToGas);
  const includePrimarySecondary = flag(input.includePrimarySecondary);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPlant = number(input.hoursPlant ?? 0, 'Plant hours');
  const hoursVent = number(input.hoursVent ?? 0, 'Vent hours');
  const hoursCondensate = number(input.hoursCondensate ?? 0, 'Condensate hours');
  const hoursConversion = number(input.hoursConversion ?? 0, 'Conversion hours');
  const hoursPerZone = number(input.hoursPerZone ?? 0, 'Hours per zone');
  const hoursPerMbh = number(input.hoursPerMbh ?? 0, 'Hours per MBH');
  const hoursIndirect = number(input.hoursIndirect ?? 0, 'Indirect hours');
  const hoursLinerPerFt = number(input.hoursLinerPerFt ?? 0, 'Liner hours per foot');
  const hoursOilToGas = number(input.hoursOilToGas ?? 0, 'Oil-to-gas hours');
  const hoursPrimarySecondary = number(input.hoursPrimarySecondary ?? 0, 'Primary-secondary hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const plantInvoice = number(input.plantInvoice ?? 0, 'Plant invoice');
  const fuelInvoicePerMbh = number(input.fuelInvoicePerMbh ?? 0, 'Fuel invoice per MBH');
  const fuelHardware = number(input.fuelHardware ?? 0, 'Fuel hardware');
  const zoneEach = number(input.zoneEach ?? 0, 'Zone each');
  const systemHardware = number(input.systemHardware ?? 0, 'System hardware');
  const indirectInvoice = number(input.indirectInvoice ?? 0, 'Indirect invoice');
  const linerPerFt = number(input.linerPerFt ?? 0, 'Liner per foot');
  const oilToGasInvoice = number(input.oilToGasInvoice ?? 0, 'Oil-to-gas invoice');
  const primarySecondaryInvoice = number(input.primarySecondaryInvoice ?? 0, 'Primary-secondary invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursZones = zones * hoursPerZone;
  const hoursSize = inputMbh * hoursPerMbh;
  const hoursIndirectApplied = includeIndirect ? hoursIndirect : 0;
  const hoursLinerApplied = includeLiner ? flueHeight * hoursLinerPerFt : 0;
  const hoursOilToGasApplied = includeOilToGas ? hoursOilToGas : 0;
  const hoursPrimaryApplied = includePrimarySecondary ? hoursPrimarySecondary : 0;
  const extraWorkHours = hoursVent + hoursCondensate + hoursConversion
    + hoursZones + hoursSize + hoursIndirectApplied + hoursLinerApplied
    + hoursOilToGasApplied + hoursPrimaryApplied;
  const totalHours = hoursTravel + hoursPlant + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const boilerMaterial = plantInvoice + inputMbh * fuelInvoicePerMbh + fuelHardware;
  const zoneMaterial = zones * zoneEach;
  const systemMaterial = systemHardware;
  const indirectMaterial = includeIndirect ? indirectInvoice : 0;
  const linerMaterial = includeLiner ? flueHeight * linerPerFt : 0;
  const oilToGasMaterial = includeOilToGas ? oilToGasInvoice : 0;
  const primaryMaterial = includePrimarySecondary ? primarySecondaryInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const plantMaterial = boilerMaterial + zoneMaterial + systemMaterial;
  const extraHardware = indirectMaterial + linerMaterial + oilToGasMaterial
    + primaryMaterial + travelInvoice;
  const materialCost = plantMaterial + extraHardware;

  const softCost = travelAndEquipment + otherCost;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const extraCost = extraHardware
    + hoursVent * loadedWage
    + hoursCondensate * loadedWage
    + hoursConversion * loadedWage
    + hoursZones * loadedWage
    + hoursSize * loadedWage
    + hoursIndirectApplied * loadedWage
    + hoursLinerApplied * loadedWage
    + hoursOilToGasApplied * loadedWage
    + hoursPrimaryApplied * loadedWage
    + hoursTravel * loadedWage;

  return {
    scope,
    system,
    fuel,
    inputMbh,
    zones,
    flueHeight,
    travelMiles,
    includeIndirect,
    includeLiner,
    includeOilToGas,
    includePrimarySecondary,
    loadedWage,
    hoursTravel,
    hoursPlant,
    hoursVent,
    hoursCondensate,
    hoursConversion,
    hoursZones,
    hoursSize,
    hoursIndirect: hoursIndirectApplied,
    hoursLiner: hoursLinerApplied,
    hoursOilToGas: hoursOilToGasApplied,
    hoursPrimarySecondary: hoursPrimaryApplied,
    siteHours,
    totalHours,
    laborCost,
    boilerMaterial,
    zoneMaterial,
    systemMaterial,
    indirectMaterial,
    linerMaterial,
    oilToGasMaterial,
    primaryMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    plantMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerMbh: inputMbh === 0 ? null : price / inputMbh,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      plant: costShare(plantMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      plant: hourShare(hoursPlant),
      vent: hourShare(hoursVent),
      condensate: hourShare(hoursCondensate),
      conversion: hourShare(hoursConversion),
      zones: hourShare(hoursZones),
      size: hourShare(hoursSize),
      indirect: hourShare(hoursIndirectApplied),
      liner: hourShare(hoursLinerApplied),
      oilToGas: hourShare(hoursOilToGasApplied),
      primary: hourShare(hoursPrimaryApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perMbh: inputMbh === 0 ? null : proposedPrice / inputMbh,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same plant three ways — like-for-like, condensing
 * upgrade, steam-to-hot-water — from the suggested scope kits so
 * the tech can see when piping and venting flip the cheap $4,500
 * special. User-typed scope rates are not reused here: the
 * comparison is apples-to-apples on the starting figures.
 * System and fuel kits stay with the current job.
 */
export function compareScope(input) {
  const systemKit = suggestedSystemKit(String(input.system ?? 'hot-water'));
  const fuelKit = suggestedFuelKit(String(input.fuel ?? 'gas'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...systemKit,
      ...fuelKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerMbh: bid.pricePerMbh,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursPlant: bid.hoursPlant,
      hoursConversion: bid.hoursConversion,
      hoursVent: bid.hoursVent,
      plantMaterial: bid.plantMaterial,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
    }))
    .sort((a, b) => a.price - b.price);
}

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a bid as a plain-text draft the tech can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Boiler replacement') {
  const perMbh = result.pricePerMbh === null
    ? 'n/a'
    : `${money(result.pricePerMbh)} / MBH`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const system = SYSTEM_PRESETS.find((item) => item.id === result.system)?.label ?? result.system;
  const fuel = FUEL_PRESETS.find((item) => item.id === result.fuel)?.label ?? result.fuel;
  const extras = [
    `${result.travelMiles} travel miles`,
    system,
    fuel,
    `${result.zones} zone${result.zones === 1 ? '' : 's'}`,
    `${result.flueHeight} ft of flue`,
    result.includeIndirect ? 'indirect water heater included' : 'no indirect',
    result.includeLiner ? 'chimney liner included' : 'no liner',
    result.includeOilToGas ? 'oil-to-gas conversion included' : 'no oil-to-gas',
    result.includePrimarySecondary ? 'primary/secondary piping included' : 'no primary/secondary',
  ].join('; ');
  return [
    'BOILER REPLACEMENT BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per input MBH: ${perMbh}`,
    `Plant: ${result.inputMbh.toLocaleString('en-US')} MBH input`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.inputMbh} MBH; ${system}; ${scope}; ${fuel}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; plant: ${result.hoursPlant.toFixed(1)} h; extras: ${(result.hoursVent + result.hoursCondensate + result.hoursConversion + result.hoursZones + result.hoursSize + result.hoursIndirect + result.hoursLiner + result.hoursOilToGas + result.hoursPrimarySecondary).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm input MBH, system, scope, fuel, extras, and all pricing before sending. It is not a heat-loss calculation, a fuel-gas code determination, a chimney design, a furnace changeout, a water-heater swap, or a product warranty.',
  ].join('\n');
}
