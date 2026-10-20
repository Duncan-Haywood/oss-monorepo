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
  // The result panel shows five line items -- Loaded labor, Plant, Extra
  // work, Travel/other, Overhead -- as a breakdown of the Total cost
  // printed right below them. extraCost used to add the loaded-wage cost
  // of the vent/condensate/conversion/zones/size/indirect/liner/oil-to-gas/
  // primary-secondary/travel hours on top of extraHardware -- but every one
  // of those hours is already inside laborCost (totalHours * loadedWage,
  // where totalHours = hoursTravel + hoursPlant + extraWorkHours +
  // siteHours). So a job with real extras charged that labor twice: once
  // under "Loaded labor" and again under "Extra work", and the five
  // displayed lines summed to more than the total cost shown beneath them.
  // extraCost is now just extraHardware -- the extras' material/invoice
  // spend, with all labor staying in laborCost where it is counted once.
  const extraCost = extraHardware;

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

/**
 * Starting figures for the no-heat "just patch it" call. A
 * circulator or relief-valve swap, plus the extra visits a
 * leaking heat exchanger actually generates before spring.
 * Replacement site-hours and van-pack stay off these visits —
 * a service call is a trip and parts, not a changeout punch list.
 */
export function suggestedRepairKit() {
  return {
    hoursRepair: 2.2,
    repairParts: 210,
    extraCallsThisWinter: 2,
    hoursPerExtraCall: 1.8,
    partsPerExtraCall: 165,
    remainingWinters: 3,
    callsPerLaterWinter: 3,
    patchPrice: 280,
  };
}

function wholeNumber(value, name, { min = 0 } = {}) {
  const result = number(value, name, { min, allowZero: min === 0 });
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number`);
  return result;
}

/**
 * Price one service call from trip, on-site hours, and parts.
 * Uses the same loaded wage, overhead, and target margin as the
 * plant bid so a $280 circulator special is scored against the
 * same shop — not a different margin story. Replacement
 * travelAndEquipment and siteHours stay out: those are changeout
 * costs, not a no-heat dispatch.
 */
export function priceRepairVisit(input) {
  const hoursLabor = number(input.hoursLabor ?? 0, 'Repair hours');
  const parts = number(input.parts ?? 0, 'Repair parts');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const totalHours = hoursTravel + hoursLabor;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;
  const travelInvoice = travelMiles * travelPerMile;
  const materialCost = parts + travelInvoice;
  const directCost = laborCost + materialCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  return {
    hoursTravel,
    hoursLabor,
    totalHours,
    loadedWage,
    laborCost,
    parts,
    travelInvoice,
    materialCost,
    directCost,
    overhead,
    totalCost,
    price,
    profit: price - totalCost,
    breakEvenPrice: totalCost,
  };
}

function scorePatchPrice(visit, patchPrice) {
  if (patchPrice === null) return null;
  return {
    price: patchPrice,
    profit: patchPrice - visit.totalCost,
    margin: patchPrice === 0 ? 0 : (patchPrice - visit.totalCost) / patchPrice * 100,
    hourlyRate: visit.totalHours === 0 ? null : patchPrice / visit.totalHours,
    belowBreakEven: patchPrice < visit.totalCost,
  };
}

/**
 * Price the no-heat "just fix it for $280" call against the
 * replacement bid on the same plant.
 *
 * This visit is a trip plus the parts on the truck. This winter
 * adds the extra callbacks a cracked section actually produces.
 * Remaining winters stack later seasons of the same call so the
 * owner can see when band-aids catch the plant price. The $280
 * (options.patchPrice, else input.patchPrice) is scored only
 * against this visit — that is the number techs get shopped on
 * at 9 p.m., not the season total.
 */
export function compareRepairVsReplace(input, options = {}) {
  const extra = suggestedExtraKit();
  const repair = suggestedRepairKit();
  const hoursTrip = number(input.hoursTrip ?? extra.hoursTrip, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? extra.hoursPerMile, 'Hours per mile');
  const travelPerMile = number(input.travelPerMile ?? extra.travelPerMile, 'Travel per mile');
  const hoursRepair = number(input.hoursRepair ?? repair.hoursRepair, 'Repair hours');
  const repairParts = number(input.repairParts ?? repair.repairParts, 'Repair parts');
  const extraCallsThisWinter = wholeNumber(
    input.extraCallsThisWinter ?? repair.extraCallsThisWinter,
    'Extra calls this winter',
  );
  const hoursPerExtraCall = number(
    input.hoursPerExtraCall ?? repair.hoursPerExtraCall,
    'Hours per extra call',
  );
  const partsPerExtraCall = number(
    input.partsPerExtraCall ?? repair.partsPerExtraCall,
    'Parts per extra call',
  );
  const remainingWinters = wholeNumber(
    input.remainingWinters ?? repair.remainingWinters,
    'Remaining winters',
    { min: 1 },
  );
  const callsPerLaterWinter = wholeNumber(
    input.callsPerLaterWinter ?? repair.callsPerLaterWinter,
    'Calls per later winter',
  );

  let patchPrice = null;
  const rawPatch = options.patchPrice !== undefined ? options.patchPrice : input.patchPrice;
  if (rawPatch !== null && rawPatch !== undefined && rawPatch !== '') {
    patchPrice = number(rawPatch, 'Patch price');
  }

  const visitRates = {
    travelMiles: input.travelMiles,
    hoursTrip,
    hoursPerMile,
    travelPerMile,
    hourlyWage: input.hourlyWage,
    burdenRate: input.burdenRate,
    overheadRate: input.overheadRate,
    targetMargin: input.targetMargin,
  };
  const thisVisit = priceRepairVisit({
    ...visitRates,
    hoursLabor: hoursRepair,
    parts: repairParts,
  });
  const extraCall = priceRepairVisit({
    ...visitRates,
    hoursLabor: hoursPerExtraCall,
    parts: partsPerExtraCall,
  });
  const replace = calculateBid(input);

  const thisWinterPrice = thisVisit.price + extraCallsThisWinter * extraCall.price;
  const laterWinterCount = remainingWinters - 1;
  const laterWinterPrice = laterWinterCount * callsPerLaterWinter * extraCall.price;
  const horizonPrice = thisWinterPrice + laterWinterPrice;

  let wintersUntilReplaceCatches = null;
  if (thisWinterPrice >= replace.price) {
    wintersUntilReplaceCatches = 1;
  } else if (callsPerLaterWinter > 0 && extraCall.price > 0) {
    const afterThisWinter = replace.price - thisWinterPrice;
    const perLaterWinter = callsPerLaterWinter * extraCall.price;
    wintersUntilReplaceCatches = 1 + Math.ceil(afterThisWinter / perLaterWinter);
  }

  const rows = [
    {
      id: 'this-visit',
      label: 'This patch visit',
      price: thisVisit.price,
      totalCost: thisVisit.totalCost,
      totalHours: thisVisit.totalHours,
      patchOnly: scorePatchPrice(thisVisit, patchPrice),
    },
    {
      id: 'this-winter',
      label: 'This winter of patches',
      price: thisWinterPrice,
      totalCost: thisVisit.totalCost + extraCallsThisWinter * extraCall.totalCost,
      totalHours: thisVisit.totalHours + extraCallsThisWinter * extraCall.totalHours,
      patchOnly: null,
    },
    {
      id: 'horizon',
      label: `${remainingWinters} winter${remainingWinters === 1 ? '' : 's'} of patches`,
      price: horizonPrice,
      totalCost: thisVisit.totalCost
        + extraCallsThisWinter * extraCall.totalCost
        + laterWinterCount * callsPerLaterWinter * extraCall.totalCost,
      totalHours: thisVisit.totalHours
        + extraCallsThisWinter * extraCall.totalHours
        + laterWinterCount * callsPerLaterWinter * extraCall.totalHours,
      patchOnly: null,
    },
    {
      id: 'replace',
      label: 'Replace the plant',
      price: replace.price,
      totalCost: replace.totalCost,
      totalHours: replace.totalHours,
      patchOnly: null,
    },
  ];
  const cheapest = Math.min(...rows.map((row) => row.price));
  return {
    thisVisit,
    extraCall,
    extraCallsThisWinter,
    remainingWinters,
    callsPerLaterWinter,
    laterWinterCount,
    thisWinterPrice,
    laterWinterPrice,
    horizonPrice,
    replace: {
      price: replace.price,
      totalCost: replace.totalCost,
      totalHours: replace.totalHours,
      breakEvenPrice: replace.breakEvenPrice,
    },
    patchStillCheaper: horizonPrice < replace.price,
    wintersUntilReplaceCatches,
    patchPrice,
    rows: rows.map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
    })),
  };
}

/**
 * One-line verdict: name the $280 visit loss first (that is the
 * number on the table tonight), then whether remaining winters of
 * patches still undercut the plant bid.
 */
export function repairVsReplaceNote(comparison) {
  if (!comparison || !Array.isArray(comparison.rows) || comparison.rows.length < 4) {
    throw new Error('Repair-vs-replace comparison is missing rows');
  }
  const visit = comparison.rows.find((row) => row.id === 'this-visit');
  const horizon = comparison.rows.find((row) => row.id === 'horizon');
  const replace = comparison.rows.find((row) => row.id === 'replace');
  if (!visit || !horizon || !replace) {
    throw new Error('Repair-vs-replace comparison is missing a row');
  }

  const winters = comparison.remainingWinters;
  const winterWord = winters === 1 ? 'winter' : 'winters';
  const catchLine = comparison.wintersUntilReplaceCatches === null
    ? 'Later winters never catch replacement at these call rates.'
    : comparison.wintersUntilReplaceCatches <= winters
      ? `${winters} ${winterWord} of patches already catch the plant bid.`
      : `Replacement catches around winter ${comparison.wintersUntilReplaceCatches} at these call rates.`;

  if (visit.patchOnly) {
    const asked = visit.patchOnly.price;
    if (visit.patchOnly.belowBreakEven) {
      const loss = Math.abs(visit.patchOnly.profit);
      if (comparison.patchStillCheaper) {
        return `At ${money(asked)} this patch loses ${money(loss)} — walk-away on the visit is ${money(visit.totalCost)}. ${winters} ${winterWord} of patches (${money(horizon.price)}) still undercut replacement (${money(replace.price)}). ${catchLine}`;
      }
      return `At ${money(asked)} this patch loses ${money(loss)} — walk-away on the visit is ${money(visit.totalCost)}. ${winters} ${winterWord} of patches (${money(horizon.price)}) already cost more than replacing (${money(replace.price)}).`;
    }
    if (comparison.patchStillCheaper) {
      return `At ${money(asked)} this visit holds a margin. ${winters} ${winterWord} of patches (${money(horizon.price)}) still undercut replacement (${money(replace.price)}). ${catchLine}`;
    }
    return `At ${money(asked)} this visit holds a margin, but ${winters} ${winterWord} of patches (${money(horizon.price)}) already cost more than replacing (${money(replace.price)}).`;
  }

  if (comparison.patchStillCheaper) {
    return `${winters} ${winterWord} of patches come to ${money(horizon.price)} and still undercut replacement at ${money(replace.price)}. ${catchLine}`;
  }
  return `${winters} ${winterWord} of patches come to ${money(horizon.price)} — more than replacing the plant at ${money(replace.price)}.`;
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export const SUPPLY_PRESETS = Object.freeze([
  {
    id: 'tech-supplied',
    label: 'You supply the boiler',
    detail: 'Plant invoice stays in the bid',
  },
  {
    id: 'owner-fits',
    label: 'Owner supplies — it matches',
    detail: 'No plant invoice, same hang hours',
  },
  {
    id: 'owner-wrong',
    label: 'Owner supplies — wrong unit',
    detail: 'Second trip plus adapters',
  },
]);

/**
 * Starting callback hours and adapter hardware when the
 * owner's supply-house or online boiler does not match the
 * plant. Taken from the extra-kit trip so a typed 16-hour
 * steam conversion does not inflate the callback.
 */
export function suggestedOwnerCallbackKit() {
  const extra = suggestedExtraKit();
  return {
    hoursCallbackTrip: extra.hoursTrip,
    hoursWrongPlant: 3.5,
    wrongPlantHardware: 280,
  };
}

function scoreInstallOnly(bid, installPrice) {
  if (installPrice === null) return null;
  return {
    price: installPrice,
    profit: installPrice - bid.totalCost,
    margin: installPrice === 0 ? 0 : (installPrice - bid.totalCost) / installPrice * 100,
    hourlyRate: bid.totalHours === 0 ? null : installPrice / bid.totalHours,
    belowBreakEven: installPrice < bid.totalCost,
  };
}

/**
 * Price the same plant three ways: you supply the boiler, the
 * owner supplies one that matches, or the owner supplies one
 * that does not match and costs a second trip.
 *
 * Owner rows zero the plant invoice and the fuel add-on and
 * keep the current hang hours — setting a Ferguson crate is
 * still a changeout. The wrong-unit row adds a starting
 * callback trip, extra near-boiler hours, and an adapter kit
 * on top of the current rates so a typed invoice does not
 * leak into the "they bought it" case.
 *
 * An install-only price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost
 * base. That is the $4,500 "just hang what I bought" number
 * techs actually get shopped on.
 */
export function compareOwnerSupply(input, options = {}) {
  const callback = suggestedOwnerCallbackKit();
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPlant = number(input.hoursPlant ?? 0, 'Plant hours');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const tech = calculateBid(input);
  const ownerFits = calculateBid({
    ...input,
    plantInvoice: 0,
    fuelInvoicePerMbh: 0,
    fuelHardware: 0,
  });
  const ownerWrong = calculateBid({
    ...input,
    plantInvoice: 0,
    fuelInvoicePerMbh: 0,
    fuelHardware: 0,
    hoursTrip: hoursTrip + callback.hoursCallbackTrip,
    hoursPlant: hoursPlant + callback.hoursWrongPlant,
    otherCost: otherCost + callback.wrongPlantHardware,
  });

  const rows = [
    {
      supply: 'tech-supplied',
      label: SUPPLY_PRESETS[0].label,
      detail: SUPPLY_PRESETS[0].detail,
      bid: tech,
    },
    {
      supply: 'owner-fits',
      label: SUPPLY_PRESETS[1].label,
      detail: SUPPLY_PRESETS[1].detail,
      bid: ownerFits,
    },
    {
      supply: 'owner-wrong',
      label: SUPPLY_PRESETS[2].label,
      detail: SUPPLY_PRESETS[2].detail,
      bid: ownerWrong,
    },
  ].map((row) => ({
    supply: row.supply,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    boilerMaterial: row.bid.boilerMaterial,
    plantMaterial: row.bid.plantMaterial,
    hoursTravel: row.bid.hoursTravel,
    hoursPlant: row.bid.hoursPlant,
    softCost: row.bid.softCost,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    savedVsTech: tech.price - row.bid.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    installOnlyPrice: installPrice,
  }));
}

/**
 * One-line verdict for the owner-supplied table. Names the
 * install-only loss when that number is on the table; otherwise
 * names the bid drop from zeroing the plant.
 */
export function ownerSupplyNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Owner-supply comparison is missing rows');
  }
  const tech = rows.find((row) => row.supply === 'tech-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  if (!tech || !fits || !wrong) {
    throw new Error('Owner-supply comparison is missing a supply row');
  }

  const drop = tech.price - fits.price;
  const callbackLift = wrong.price - fits.price;
  if (tech.installOnly && fits.installOnly) {
    const asked = tech.installOnly.price;
    if (tech.installOnly.belowBreakEven && fits.installOnly.belowBreakEven) {
      return `At ${money(asked)} hang-only you lose money even when they bought the boiler. Walk-away on the owner-supplied set is ${money(fits.breakEvenPrice)}.`;
    }
    if (tech.installOnly.belowBreakEven && !fits.installOnly.belowBreakEven) {
      return `At ${money(asked)} the tech-supplied job loses ${money(Math.abs(tech.installOnly.profit))}. The same hang-only number covers the set if their unit actually matches.`;
    }
    if (wrong.installOnly?.belowBreakEven) {
      return `At ${money(asked)} the set covers if their unit matches. A wrong-unit callback still loses ${money(Math.abs(wrong.installOnly.profit))} — walk-away then is ${money(wrong.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} both supply paths hold a margin. A wrong-unit callback still adds ${money(callbackLift)} to the bid.`;
  }
  return `Zeroing the boiler invoice drops the bid ${money(drop)}. A wrong-unit callback puts ${money(callbackLift)} back on.`;
}

export const ACCESS_PRESETS = Object.freeze([
  {
    id: 'weekday-scheduled',
    label: 'Weekday, scheduled',
    detail: 'They can wait; you book the day',
  },
  {
    id: 'same-day-no-heat',
    label: 'Same-day, no heat',
    detail: 'Same wage, slower plant hang and punch-list',
  },
  {
    id: 'after-hours',
    label: 'After-hours / Saturday emergency',
    detail: 'Overtime wage plus a second dispatch',
  },
]);

/**
 * Starting pace and overtime when they will not wait for a
 * weekday slot, or want Saturday / after 5pm because the house
 * is cold. Occupied pace is a multiplier on the typed plant
 * hang and punch-list hours — working in a no-heat house they
 * stay in is slower, not a different wage. After-hours is
 * time-and-a-half on the typed wage plus a second emergency
 * dispatch from the extra-kit trip, so a typed 16-hour steam
 * conversion does not inflate the extra trip.
 */
export function suggestedAccessKit() {
  const extra = suggestedExtraKit();
  return {
    occupiedPaceMultiplier: 1.2,
    afterHoursWageMultiplier: 1.5,
    afterHoursExtraTripHours: extra.hoursTrip,
  };
}

/**
 * Price the same plant three ways: weekday scheduled,
 * same-day while they stay home with no heat, or after-hours
 * / Saturday emergency.
 *
 * Occupied keeps the typed wage and adds clock hours on the
 * plant hang and punch-list. After-hours keeps the typed
 * hours and raises the wage, then adds a starting second
 * dispatch because a Friday-night no-heat call is not a stop
 * you combine with a weekday route. Scope, system, fuel,
 * invoice, and extras stay.
 *
 * An install-only price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost
 * base. That is the "$4,500 Saturday" number techs actually
 * get shopped on.
 */
export function compareAccess(input, options = {}) {
  const kit = suggestedAccessKit();
  const hoursPlant = number(input.hoursPlant ?? 0, 'Plant hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const weekday = calculateBid(input);
  const occupied = calculateBid({
    ...input,
    hoursPlant: hoursPlant * kit.occupiedPaceMultiplier,
    siteHours: siteHours * kit.occupiedPaceMultiplier,
  });
  const afterHours = calculateBid({
    ...input,
    hourlyWage: hourlyWage * kit.afterHoursWageMultiplier,
    hoursTrip: hoursTrip + kit.afterHoursExtraTripHours,
  });

  const rows = [
    {
      access: 'weekday-scheduled',
      label: ACCESS_PRESETS[0].label,
      detail: ACCESS_PRESETS[0].detail,
      bid: weekday,
    },
    {
      access: 'same-day-no-heat',
      label: ACCESS_PRESETS[1].label,
      detail: ACCESS_PRESETS[1].detail,
      bid: occupied,
    },
    {
      access: 'after-hours',
      label: ACCESS_PRESETS[2].label,
      detail: ACCESS_PRESETS[2].detail,
      bid: afterHours,
    },
  ].map((row) => ({
    access: row.access,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    loadedWage: row.bid.loadedWage,
    hoursTravel: row.bid.hoursTravel,
    hoursPlant: row.bid.hoursPlant,
    siteHours: row.bid.siteHours,
    laborCost: row.bid.laborCost,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    liftFromWeekday: row.bid.price - weekday.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    installOnlyPrice: installPrice,
  }));
}

/**
 * One-line verdict for the access table. Names the Saturday
 * / after-hours loss when that number is on the table;
 * otherwise names the bid lift from a weekday slot.
 */
export function accessNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Access comparison is missing rows');
  }
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'same-day-no-heat');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  if (!weekday || !occupied || !afterHours) {
    throw new Error('Access comparison is missing an access row');
  }

  const occupiedLift = occupied.price - weekday.price;
  const afterHoursLift = afterHours.price - weekday.price;
  if (weekday.installOnly && afterHours.installOnly) {
    const asked = weekday.installOnly.price;
    if (weekday.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} you lose money even on a weekday slot. Walk-away after-hours is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (!weekday.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} the weekday set covers. The same Saturday / after-hours number loses ${money(Math.abs(afterHours.installOnly.profit))} — walk-away then is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (occupied.installOnly?.belowBreakEven) {
      return `At ${money(asked)} a weekday slot covers. Same-day with no heat still loses ${money(Math.abs(occupied.installOnly.profit))} — walk-away then is ${money(occupied.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} every access window still holds a margin. After-hours still adds ${money(afterHoursLift)} to the bid.`;
  }
  return `Same-day with no heat adds ${money(occupiedLift)} to the bid. After-hours / Saturday adds ${money(afterHoursLift)}.`;
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
