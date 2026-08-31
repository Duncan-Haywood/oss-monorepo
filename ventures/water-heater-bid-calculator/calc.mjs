// Pure bid arithmetic for a residential water-heater replacement. No network,
// no state: every gallon, vent, wage, and material figure is an input, so the
// result stays a transparent calculation a plumber can check against their own
// takeoff rather than a claim about what any house "should" cost.
//
// The method is the one the trade actually bids with: price the swap from the
// heater type, the location, the vent, and the gas or electrical path — not
// from a search-result "$1,200 installed" number. A same-day 50-gallon electric
// tank in a garage is a different job from a condensing tankless on a 3/4"
// gas upsize with a sidewall vent through brick and an attic carry, and a
// flat replace-the-heater price cannot see the difference.

export const INPUT_FIELDS = Object.freeze([
  'heaterType',
  'capacityGallons',
  'tanklessGpm',
  'location',
  'venting',
  'ventFeet',
  'gasLine',
  'gasLineFeet',
  'electrical',
  'expansionTank',
  'dripPan',
  'condensate',
  'recirc',
  'haulAway',
  'seismic',
  'mixingValve',
  'isolationValves',
  'hourlyWage',
  'burdenRate',
  'overheadRate',
  'targetMargin',
  'permitFee',
  'heaterHardware',
  'otherMaterials',
  'otherHours',
  'proposedPrice',
]);

export const HEATER_TYPES = Object.freeze([
  { id: 'tank_electric', label: 'Electric tank', family: 'tank', fuel: 'electric' },
  { id: 'tank_gas_atmo', label: 'Gas tank (atmospheric / B-vent)', family: 'tank', fuel: 'gas' },
  { id: 'tank_gas_power', label: 'Gas tank (power-vent)', family: 'tank', fuel: 'gas' },
  { id: 'tankless_gas', label: 'Gas tankless (condensing)', family: 'tankless', fuel: 'gas' },
  { id: 'tankless_electric', label: 'Electric tankless', family: 'tankless', fuel: 'electric' },
  { id: 'heat_pump', label: 'Heat-pump water heater', family: 'tank', fuel: 'electric' },
]);

export const LOCATIONS = Object.freeze([
  { id: 'garage', label: 'Garage / utility room (easy access)' },
  { id: 'basement', label: 'Basement' },
  { id: 'closet', label: 'Interior closet' },
  { id: 'attic', label: 'Attic' },
  { id: 'crawl', label: 'Crawl space' },
]);

export const VENTING = Object.freeze([
  { id: 'none', label: 'No vent (electric / heat pump)' },
  { id: 'reuse_existing', label: 'Reuse existing vent' },
  { id: 'new_b_vent', label: 'New B-vent (atmospheric)' },
  { id: 'power_vent_sidewall', label: 'Power-vent sidewall' },
  { id: 'concentric_condensing', label: 'Concentric / PVC sidewall (condensing)' },
]);

export const GAS_LINES = Object.freeze([
  { id: 'none', label: 'No gas work' },
  { id: 'existing_ok', label: 'Existing gas line looks adequate' },
  { id: 'upsize_3_4', label: 'Upsize to 3/4 in (tankless killer)' },
  { id: 'new_run', label: 'New gas run' },
]);

export const ELECTRICAL = Object.freeze([
  { id: 'none', label: 'No electrical work' },
  { id: 'existing_ok', label: 'Existing circuit looks adequate' },
  { id: 'new_240v', label: 'New 240 V dedicated circuit' },
  { id: 'new_120v', label: 'New 120 V receptacle / condensate' },
  { id: 'panel_slots', label: 'Panel work (electric tankless / 3×40 A)' },
]);

export const GALLON_PRESETS = Object.freeze([40, 50, 75, 80]);
export const GPM_PRESETS = Object.freeze([5, 7, 9, 11]);

export const MAX_GALLONS = 120;
export const MAX_GPM = 15;

// Hours and material dollars that are *starting points*, not a standard.
// Every one is an input the plumber can overwrite from a timed job.
export const LABOR_RATES = Object.freeze({
  tankSwapHours: 3.5,
  tanklessHours: 6.5,
  heatPumpHours: 5,
  atticHours: 2.5,
  crawlHours: 1.8,
  closetHours: 0.8,
  basementHours: 0.3,
  ventReuseHours: 0.5,
  ventBHours: 3.5,
  ventPowerHours: 2.5,
  ventConcentricHours: 3,
  ventHoursPerFoot: 0.08,
  gasExistingHours: 0.4,
  gasUpsizeHours: 3.5,
  gasNewSetupHours: 1.2,
  gasHoursPerFoot: 0.09,
  electricalExistingHours: 0.3,
  electrical240Hours: 2.2,
  electrical120Hours: 1.2,
  electricalPanelHours: 3.5,
  expansionHours: 0.6,
  panHours: 0.4,
  condensateHours: 0.8,
  recircHours: 1.5,
  haulHours: 0.4,
  seismicHours: 0.5,
  mixingHours: 0.7,
  isolationHours: 0.4,
  inspectionHours: 0.8,
});

export const MATERIAL_RATES = Object.freeze({
  fittingsTank: 95,
  fittingsTankless: 165,
  fittingsHeatPump: 120,
  ventReuse: 25,
  ventBPerFoot: 18,
  ventPowerPerFoot: 14,
  ventConcentricPerFoot: 16,
  ventTermination: 85,
  gasExisting: 35,
  gasPipePerFoot: 8.5,
  gasUpsizeKit: 220,
  gasNewKit: 160,
  electricalExisting: 20,
  electrical240: 285,
  electrical120: 95,
  electricalPanel: 640,
  expansionTank: 85,
  dripPan: 45,
  condensate: 95,
  recirc: 280,
  haulAway: 35,
  seismic: 55,
  mixingValve: 95,
  isolationValves: 65,
});

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function oneOf(value, allowed, name) {
  const text = String(value ?? '').trim();
  if (!allowed.includes(text)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return text;
}

function flag(value, name) {
  if (value === true || value === 1 || value === '1' || value === 'yes' || value === 'on') return 1;
  if (value === false || value === 0 || value === '0' || value === 'no' || value === '' || value == null) {
    return 0;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && (numeric === 0 || numeric === 1)) return numeric;
  throw new Error(`${name} must be yes or no`);
}

export function heaterFamily(heaterType) {
  const row = HEATER_TYPES.find((item) => item.id === heaterType);
  if (!row) throw new Error(`Heater type must be one of: ${HEATER_TYPES.map((item) => item.id).join(', ')}`);
  return row;
}

// Starting BTU or kW the plumber can apply, not a load calculation they can
// stamp. A 50-gallon electric tank and an 11 GPM gas tankless are not the
// same machine, and a "$1,200 replace the heater" rule cannot see that.
export function recommendedCapacity(heaterType) {
  const row = heaterFamily(heaterType);
  if (row.family === 'tankless') return { gallons: null, gpm: 7, btu: row.fuel === 'gas' ? 180000 : null, kw: row.fuel === 'electric' ? 27 : null };
  if (row.id === 'heat_pump') return { gallons: 50, gpm: null, btu: null, kw: 4.5 };
  if (row.fuel === 'gas') return { gallons: 50, gpm: null, btu: 40000, kw: null };
  return { gallons: 50, gpm: null, btu: null, kw: 4.5 };
}

export function defaultInputs() {
  return {
    heaterType: 'tank_electric',
    capacityGallons: 50,
    tanklessGpm: 7,
    location: 'garage',
    venting: 'none',
    ventFeet: 0,
    gasLine: 'none',
    gasLineFeet: 0,
    electrical: 'existing_ok',
    expansionTank: 1,
    dripPan: 0,
    condensate: 0,
    recirc: 0,
    haulAway: 1,
    seismic: 0,
    mixingValve: 0,
    isolationValves: 0,
    hourlyWage: 48,
    burdenRate: 30,
    overheadRate: 16,
    targetMargin: 25,
    permitFee: 85,
    heaterHardware: 0,
    otherMaterials: 0,
    otherHours: 0,
    proposedPrice: '',
  };
}

function moneyInputs(input) {
  return {
    hourlyWage: number(input.hourlyWage ?? 0, 'Hourly wage'),
    burdenRate: number(input.burdenRate ?? 0, 'Payroll burden'),
    overheadRate: number(input.overheadRate ?? 0, 'Overhead'),
    targetMargin: number(input.targetMargin ?? 0, 'Target margin'),
    permitFee: number(input.permitFee ?? 0, 'Permit fee'),
    heaterHardware: number(input.heaterHardware ?? 0, 'Heater hardware'),
    otherMaterials: number(input.otherMaterials ?? 0, 'Other materials'),
    otherHours: number(input.otherHours ?? 0, 'Other hours'),
  };
}

function proposedComparison(proposedPrice, totalCost, laborHours) {
  if (proposedPrice === '' || proposedPrice == null) return null;
  const price = number(proposedPrice, 'Proposed price');
  const profit = price - totalCost;
  const margin = price === 0 ? 0 : (profit / price) * 100;
  return {
    price,
    profit,
    margin,
    belowBreakEven: profit < 0,
    hourlyRate: laborHours > 0 ? price / laborHours : null,
  };
}

function locationHours(location) {
  if (location === 'attic') return LABOR_RATES.atticHours;
  if (location === 'crawl') return LABOR_RATES.crawlHours;
  if (location === 'closet') return LABOR_RATES.closetHours;
  if (location === 'basement') return LABOR_RATES.basementHours;
  return 0;
}

function ventHours(venting, ventFeet) {
  if (venting === 'none') return 0;
  const base =
    venting === 'reuse_existing'
      ? LABOR_RATES.ventReuseHours
      : venting === 'new_b_vent'
        ? LABOR_RATES.ventBHours
        : venting === 'power_vent_sidewall'
          ? LABOR_RATES.ventPowerHours
          : LABOR_RATES.ventConcentricHours;
  return base + ventFeet * LABOR_RATES.ventHoursPerFoot;
}

function ventMaterials(venting, ventFeet) {
  if (venting === 'none') return 0;
  if (venting === 'reuse_existing') return MATERIAL_RATES.ventReuse;
  const perFoot =
    venting === 'new_b_vent'
      ? MATERIAL_RATES.ventBPerFoot
      : venting === 'power_vent_sidewall'
        ? MATERIAL_RATES.ventPowerPerFoot
        : MATERIAL_RATES.ventConcentricPerFoot;
  return MATERIAL_RATES.ventTermination + ventFeet * perFoot;
}

function gasHours(gasLine, gasLineFeet) {
  if (gasLine === 'none') return 0;
  if (gasLine === 'existing_ok') return LABOR_RATES.gasExistingHours;
  if (gasLine === 'upsize_3_4') {
    return LABOR_RATES.gasUpsizeHours + gasLineFeet * LABOR_RATES.gasHoursPerFoot;
  }
  return LABOR_RATES.gasNewSetupHours + gasLineFeet * LABOR_RATES.gasHoursPerFoot;
}

function gasMaterials(gasLine, gasLineFeet) {
  if (gasLine === 'none') return 0;
  if (gasLine === 'existing_ok') return MATERIAL_RATES.gasExisting;
  if (gasLine === 'upsize_3_4') {
    return MATERIAL_RATES.gasUpsizeKit + gasLineFeet * MATERIAL_RATES.gasPipePerFoot;
  }
  return MATERIAL_RATES.gasNewKit + gasLineFeet * MATERIAL_RATES.gasPipePerFoot;
}

function electricalHours(electrical) {
  if (electrical === 'none') return 0;
  if (electrical === 'existing_ok') return LABOR_RATES.electricalExistingHours;
  if (electrical === 'new_240v') return LABOR_RATES.electrical240Hours;
  if (electrical === 'new_120v') return LABOR_RATES.electrical120Hours;
  return LABOR_RATES.electricalPanelHours;
}

function electricalMaterials(electrical) {
  if (electrical === 'none') return 0;
  if (electrical === 'existing_ok') return MATERIAL_RATES.electricalExisting;
  if (electrical === 'new_240v') return MATERIAL_RATES.electrical240;
  if (electrical === 'new_120v') return MATERIAL_RATES.electrical120;
  return MATERIAL_RATES.electricalPanel;
}

function fittings(family, id) {
  if (id === 'heat_pump') return MATERIAL_RATES.fittingsHeatPump;
  if (family === 'tankless') return MATERIAL_RATES.fittingsTankless;
  return MATERIAL_RATES.fittingsTank;
}

function baseHours(family, id) {
  if (id === 'heat_pump') return LABOR_RATES.heatPumpHours;
  if (family === 'tankless') return LABOR_RATES.tanklessHours;
  return LABOR_RATES.tankSwapHours;
}

/**
 * Price a residential water-heater replacement from the machine, the
 * location, the vent, and the gas or electrical path.
 */
export function calculateBid(input) {
  const type = heaterFamily(input.heaterType);
  const location = oneOf(input.location, LOCATIONS.map((row) => row.id), 'Location');
  const venting = oneOf(input.venting, VENTING.map((row) => row.id), 'Venting');
  const gasLine = oneOf(input.gasLine, GAS_LINES.map((row) => row.id), 'Gas line');
  const electrical = oneOf(input.electrical, ELECTRICAL.map((row) => row.id), 'Electrical');

  const capacityGallons = number(input.capacityGallons ?? 0, 'Capacity gallons');
  const tanklessGpm = number(input.tanklessGpm ?? 0, 'Tankless GPM');
  if (capacityGallons > MAX_GALLONS) {
    throw new Error(
      `Tank is larger than ${MAX_GALLONS} gallons — this tool prices a residential replacement, not a commercial package`,
    );
  }
  if (tanklessGpm > MAX_GPM) {
    throw new Error(
      `Tankless is larger than ${MAX_GPM} GPM — this tool prices a residential replacement, not a commercial package`,
    );
  }
  if (type.family === 'tankless' && tanklessGpm <= 0) {
    throw new Error('Tankless GPM must be greater than zero');
  }
  if (type.family === 'tank' && capacityGallons <= 0) {
    throw new Error('Capacity gallons must be greater than zero');
  }

  const ventFeet = number(input.ventFeet ?? 0, 'Vent length');
  const gasLineFeet = number(input.gasLineFeet ?? 0, 'Gas-line length');
  const addons = {
    expansionTank: flag(input.expansionTank, 'Expansion tank'),
    dripPan: flag(input.dripPan, 'Drip pan'),
    condensate: flag(input.condensate, 'Condensate'),
    recirc: flag(input.recirc, 'Recirc'),
    haulAway: flag(input.haulAway, 'Haul-away'),
    seismic: flag(input.seismic, 'Seismic straps'),
    mixingValve: flag(input.mixingValve, 'Mixing valve'),
    isolationValves: flag(input.isolationValves, 'Isolation valves'),
  };
  const money = moneyInputs(input);
  if (money.targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const hours = {
    base: baseHours(type.family, type.id),
    location: locationHours(location),
    vent: ventHours(venting, ventFeet),
    gas: gasHours(gasLine, gasLineFeet),
    electrical: electricalHours(electrical),
    expansion: addons.expansionTank ? LABOR_RATES.expansionHours : 0,
    pan: addons.dripPan ? LABOR_RATES.panHours : 0,
    condensate: addons.condensate ? LABOR_RATES.condensateHours : 0,
    recirc: addons.recirc ? LABOR_RATES.recircHours : 0,
    haul: addons.haulAway ? LABOR_RATES.haulHours : 0,
    seismic: addons.seismic ? LABOR_RATES.seismicHours : 0,
    mixing: addons.mixingValve ? LABOR_RATES.mixingHours : 0,
    isolation: addons.isolationValves ? LABOR_RATES.isolationHours : 0,
    inspection: LABOR_RATES.inspectionHours,
    other: money.otherHours,
  };
  const laborHours = Object.values(hours).reduce((sum, value) => sum + value, 0);

  const materials = {
    fittings: fittings(type.family, type.id),
    vent: ventMaterials(venting, ventFeet),
    gas: gasMaterials(gasLine, gasLineFeet),
    electrical: electricalMaterials(electrical),
    expansion: addons.expansionTank ? MATERIAL_RATES.expansionTank : 0,
    pan: addons.dripPan ? MATERIAL_RATES.dripPan : 0,
    condensate: addons.condensate ? MATERIAL_RATES.condensate : 0,
    recirc: addons.recirc ? MATERIAL_RATES.recirc : 0,
    haul: addons.haulAway ? MATERIAL_RATES.haulAway : 0,
    seismic: addons.seismic ? MATERIAL_RATES.seismic : 0,
    mixing: addons.mixingValve ? MATERIAL_RATES.mixingValve : 0,
    isolation: addons.isolationValves ? MATERIAL_RATES.isolationValves : 0,
    permit: money.permitFee,
    heaterHardware: money.heaterHardware,
    other: money.otherMaterials,
  };
  const materialsCost = Object.values(materials).reduce((sum, value) => sum + value, 0);

  const loadedWage = money.hourlyWage * (1 + money.burdenRate / 100);
  const laborCost = laborHours * loadedWage;
  const direct = laborCost + materialsCost;
  const overhead = direct * (money.overheadRate / 100);
  const totalCost = direct + overhead;
  const price = money.targetMargin >= 100 ? totalCost : totalCost / (1 - money.targetMargin / 100);
  const profit = price - totalCost;

  const hint = recommendedCapacity(type.id);
  const warnings = [];
  if (type.id === 'tankless_gas' && gasLine === 'existing_ok') {
    warnings.push(
      'A gas tankless often needs a 3/4 in supply. Pricing the existing 1/2 in line as “adequate” is how a $1,200 tank swap quote dies on the first visit.',
    );
  }
  if (type.id === 'tankless_gas' && (venting === 'none' || venting === 'reuse_existing' || venting === 'new_b_vent')) {
    warnings.push(
      'A condensing tankless does not reuse a B-vent. The usual takeoff is a concentric or PVC sidewall termination, not the old atmospheric stack.',
    );
  }
  if (type.id === 'tankless_electric' && electrical !== 'panel_slots' && electrical !== 'new_240v') {
    warnings.push(
      'An electric tankless is usually two or three 40 A 240 V circuits, not the 30 A the old tank used. The bid does not yet include that panel work.',
    );
  }
  if (type.id === 'heat_pump' && location === 'closet') {
    warnings.push(
      'A heat-pump water heater needs room volume and condensate. An interior closet often fails that, and this is a starting hint, not a manufacturer clearance you can stamp.',
    );
  }
  if (type.id === 'heat_pump' && !addons.condensate) {
    warnings.push(
      'A heat-pump water heater makes condensate. The bid does not yet include a drain or pump.',
    );
  }
  if (location === 'attic' && !addons.dripPan) {
    warnings.push(
      'An attic heater without a pan and drain is the leak that soaks the bedrooms. The bid does not yet include a pan.',
    );
  }
  if (type.id === 'tank_gas_atmo' && location === 'closet') {
    warnings.push(
      'An atmospheric gas tank in a closet needs combustion air. Confirm the existing louver or add it before you treat this as a same-day swap.',
    );
  }
  if (type.fuel === 'gas' && gasLine === 'none') {
    warnings.push('This is a gas heater with no gas work on the ticket. Confirm the existing connection is actually reusable.');
  }
  if (type.fuel === 'electric' && type.id !== 'tankless_electric' && electrical === 'none') {
    warnings.push('This is an electric heater with no electrical look on the ticket. Confirm the existing circuit is actually reusable.');
  }
  if (type.family === 'tankless' && !addons.isolationValves) {
    warnings.push('Tankless service valves are how the next flush happens without cutting copper. The bid does not yet include them.');
  }
  if (type.family === 'tank' && capacityGallons + 0.01 < (hint.gallons ?? 0) && capacityGallons > 0) {
    warnings.push(
      `A typical ${type.label.toLowerCase()} replacement starts at ${hint.gallons} gallons, not ${capacityGallons}. This is a starting hint, not a first-hour rating you can stamp.`,
    );
  }

  const baseline = calculateBid._skipBaseline ? null : baselinePrice(money);

  return {
    heaterType: type.id,
    heaterLabel: type.label,
    family: type.family,
    fuel: type.fuel,
    location,
    venting,
    gasLine,
    electrical,
    capacityGallons,
    tanklessGpm,
    ventFeet,
    gasLineFeet,
    addons,
    hint,
    hours,
    laborHours,
    loadedWage,
    laborCost,
    materials,
    materialsCost,
    overhead,
    totalCost,
    price,
    profit,
    breakEvenPrice: totalCost,
    effectiveHourlyRate: laborHours > 0 ? price / laborHours : null,
    pricePerGallon: type.family === 'tank' && capacityGallons > 0 ? price / capacityGallons : null,
    pricePerGpm: type.family === 'tankless' && tanklessGpm > 0 ? price / tanklessGpm : null,
    vsBaseline: baseline ? price / baseline : null,
    baselinePrice: baseline,
    warnings,
    proposed: proposedComparison(input.proposedPrice, totalCost, laborHours),
  };
}

calculateBid._skipBaseline = false;

function baselinePrice(money) {
  calculateBid._skipBaseline = true;
  try {
    const result = calculateBid({
      ...defaultInputs(),
      hourlyWage: money.hourlyWage,
      burdenRate: money.burdenRate,
      overheadRate: money.overheadRate,
      targetMargin: money.targetMargin,
      permitFee: money.permitFee,
      heaterHardware: 0,
      otherMaterials: 0,
      otherHours: 0,
      proposedPrice: '',
    });
    return result.price;
  } finally {
    calculateBid._skipBaseline = false;
  }
}
