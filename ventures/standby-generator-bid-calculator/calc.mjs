// Pure bid arithmetic for a residential standby (whole-house) generator
// install. No network, no state: every kilowatt, setback, wage, and material
// figure is an input, so the result stays a transparent calculation an
// electrician or generator dealer can check against their own takeoff rather
// than a claim about what any house "should" cost.
//
// The method is the one the trade actually bids with: size the feeder from the
// generator's 240 V nameplate current, size the transfer switch from the
// service — not from a Facebook-ad "installed" number — then stack labor for
// the pad, the ATS, the feeder, the gas or propane line, and the trench. That
// is what separates a defensible bid from a flat "$8,000 installed" guess. A
// 22 kW natural-gas unit beside the house on a precast pad is a different job
// from a 26 kW propane set 40 feet into the yard with a 400 A service-entrance
// ATS, and a flat install price cannot see the difference.

export const INPUT_FIELDS = Object.freeze([
  'generatorKw',
  'loadMode',
  'fuel',
  'serviceAmps',
  'transferSwitch',
  'atsAmps',
  'padType',
  'feederFeet',
  'gasLineFeet',
  'trenchFeet',
  'location',
  'gasMeter',
  'hourlyWage',
  'burdenRate',
  'overheadRate',
  'targetMargin',
  'permitFee',
  'generatorHardware',
  'otherMaterials',
  'otherHours',
  'proposedPrice',
]);

// Residential air-cooled and liquid-cooled sizes a dealer actually quotes.
// Above 48 kW this tool stops rather than guessing a commercial package.
export const GENERATOR_PRESETS = Object.freeze([
  { label: '10 kW air-cooled', generatorKw: 10 },
  { label: '14 kW air-cooled', generatorKw: 14 },
  { label: '18 kW air-cooled', generatorKw: 18 },
  { label: '22 kW air-cooled', generatorKw: 22 },
  { label: '24 kW liquid-cooled', generatorKw: 24 },
  { label: '26 kW liquid-cooled', generatorKw: 26 },
  { label: '32 kW liquid-cooled', generatorKw: 32 },
  { label: '48 kW liquid-cooled', generatorKw: 48 },
]);

export const LOAD_MODES = Object.freeze([
  { id: 'essential', label: 'Essential circuits' },
  { id: 'whole_house', label: 'Whole-house standby' },
]);

export const FUELS = Object.freeze([
  { id: 'natural_gas', label: 'Natural gas' },
  { id: 'propane', label: 'Propane (LP)' },
]);

export const LOCATIONS = Object.freeze([
  { id: 'beside_house', label: 'Beside the house (typical setback)' },
  { id: 'side_yard', label: 'Side yard (longer feeder)' },
  { id: 'far_yard', label: 'Far yard / behind a detached structure' },
]);

export const TRANSFER_SWITCHES = Object.freeze([
  { id: 'manual', label: 'Manual transfer switch', hours: 3 },
  { id: 'automatic', label: 'Automatic transfer switch', hours: 6.5 },
]);

export const PAD_TYPES = Object.freeze([
  { id: 'precast', label: 'Precast polymer pad', hours: 1.5, dollars: 380 },
  { id: 'poured', label: 'Poured concrete pad', hours: 4, dollars: 0 },
]);

export const SERVICE_AMPS = Object.freeze([100, 150, 200, 400]);
export const ATS_AMPS = Object.freeze([100, 150, 200, 400]);

export const GAS_METERS = Object.freeze([
  { id: 'adequate', label: 'Existing meter looks adequate' },
  { id: 'upgrade', label: 'Gas-meter / regulator upgrade' },
]);

// Copper, 75 °C column, the ampacity used for THHN/THWN in conduit on a
// typical residential generator feeder. Circular mils are for the voltage-drop
// check. Dollars are a starting takeoff for a 4-wire 240 V run — replace with
// the truck's current invoice.
export const WIRE_TABLE = Object.freeze([
  { awg: 4, ampacity: 85, circularMils: 41740, dollarsPerRunFoot: 5.6 },
  { awg: 3, ampacity: 100, circularMils: 52620, dollarsPerRunFoot: 7.2 },
  { awg: 2, ampacity: 115, circularMils: 66360, dollarsPerRunFoot: 9 },
  { awg: 1, ampacity: 130, circularMils: 83690, dollarsPerRunFoot: 11.2 },
  { awg: '1/0', ampacity: 150, circularMils: 105600, dollarsPerRunFoot: 14 },
  { awg: '2/0', ampacity: 175, circularMils: 133100, dollarsPerRunFoot: 17.5 },
  { awg: '3/0', ampacity: 200, circularMils: 167800, dollarsPerRunFoot: 21 },
  { awg: '4/0', ampacity: 230, circularMils: 211600, dollarsPerRunFoot: 26 },
  { awg: '250 kcmil', ampacity: 255, circularMils: 250000, dollarsPerRunFoot: 32 },
  { awg: '350 kcmil', ampacity: 310, circularMils: 350000, dollarsPerRunFoot: 44 },
  { awg: '500 kcmil', ampacity: 380, circularMils: 500000, dollarsPerRunFoot: 62 },
]);

export const STANDARD_BREAKERS = Object.freeze([
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200,
  225, 250, 300, 350, 400,
]);

export const VOLTAGE = 240;
export const COPPER_K = 12.9;
export const VOLTAGE_DROP_LIMIT = 0.03;
export const MAX_KW = 48;

// Hours and material dollars that are *starting points*, not a standard.
// Every one is an input the installer can overwrite from a timed job.
export const LABOR_RATES = Object.freeze({
  baseHours: 5,
  feederMinutesPerFoot: 4.8,
  trenchSetupHours: 1.2,
  trenchHoursPerFoot: 0.1,
  gasNgHoursPerFoot: 0.08,
  gasLpHoursPerFoot: 0.12,
  lpSetupHours: 1.5,
  meterUpgradeHours: 3.5,
  sideYardHours: 0.8,
  farYardHours: 2.5,
  liquidCooledHours: 1.5,
  inspectionHours: 1.5,
  commissionHours: 1.5,
  ats400ExtraHours: 3,
});

export const MATERIAL_RATES = Object.freeze({
  fittings: 160,
  pvcPerFoot: 2.2,
  ngPipePerFoot: 6.5,
  lpPipePerFoot: 7.5,
  lpRegulatorKit: 280,
  lpTankHookup: 180,
  trenchRestorationPerFoot: 9,
  meterUpgrade: 450,
  pouredPadPerSqFt: 14,
});

export const ATS_COST = Object.freeze({
  manual: { 100: 280, 150: 360, 200: 450, 400: 980 },
  automatic: { 100: 890, 150: 1100, 200: 1450, 400: 3200 },
});

export const BREAKER_COST = Object.freeze({
  60: 70,
  80: 95,
  100: 130,
  125: 160,
  150: 210,
  175: 240,
  200: 280,
  225: 340,
  250: 410,
  300: 520,
  350: 640,
  400: 780,
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

export function nextStandardBreaker(amps) {
  const needed = number(amps, 'Breaker amps', { allowZero: false });
  const match = STANDARD_BREAKERS.find((size) => size >= needed);
  if (!match) {
    throw new Error(
      'Required breaker is larger than 400 A — this tool prices residential standby, not a commercial package',
    );
  }
  return match;
}

// Nameplate current at 240 V single-phase. Installers size the feeder to this
// number, not to a 125% continuous-load rule — that rule is for EVSE and
// similar loads, not for a standby generator's nameplate.
export function nameplateAmps(generatorKw) {
  const kw = number(generatorKw, 'Generator kW', { allowZero: false });
  if (kw > MAX_KW) {
    throw new Error(
      `Generator is larger than ${MAX_KW} kW — this tool prices residential standby, not a commercial package`,
    );
  }
  return (kw * 1000) / VOLTAGE;
}

export function feederBreakerAmps(generatorKw) {
  return nextStandardBreaker(nameplateAmps(generatorKw));
}

export function voltageDropPercent({ amps, runFeet, circularMils }) {
  const current = number(amps, 'Voltage-drop amps', { allowZero: false });
  const length = number(runFeet, 'Feeder length');
  const cm = number(circularMils, 'Circular mils', { allowZero: false });
  if (length === 0) return 0;
  return ((2 * COPPER_K * current * length) / cm / VOLTAGE) * 100;
}

export function recommendWire({ breakerAmps, nameplateAmps: current, feederFeet }) {
  const breaker = number(breakerAmps, 'Breaker', { allowZero: false });
  const amps = number(current, 'Nameplate amps', { allowZero: false });
  const length = number(feederFeet, 'Feeder length');
  const byAmpacity = WIRE_TABLE.find((row) => row.ampacity >= breaker);
  if (!byAmpacity) {
    throw new Error('No copper size in the table carries that breaker — check the generator kW');
  }

  let chosen = byAmpacity;
  for (const row of WIRE_TABLE) {
    if (row.ampacity < breaker) continue;
    const drop = voltageDropPercent({
      amps,
      runFeet: length,
      circularMils: row.circularMils,
    });
    if (drop <= VOLTAGE_DROP_LIMIT * 100) {
      chosen = row;
      break;
    }
    chosen = row;
  }

  const drop = voltageDropPercent({
    amps,
    runFeet: length,
    circularMils: chosen.circularMils,
  });
  return {
    awg: chosen.awg,
    ampacity: chosen.ampacity,
    circularMils: chosen.circularMils,
    dollarsPerRunFoot: chosen.dollarsPerRunFoot,
    voltageDropPercent: drop,
    voltageDropOk: drop <= VOLTAGE_DROP_LIMIT * 100,
    upsizedFromAmpacity: chosen.awg !== byAmpacity.awg,
    ampacityAwg: byAmpacity.awg,
  };
}

// A starting kW the dealer can apply, not a load calculation they can stamp.
// Essential circuits on a 200 A service are a different machine than
// whole-house on 400 A, and a "22 kW for every house" rule cannot see that.
export function recommendedKw(loadMode, serviceAmps) {
  const mode = oneOf(loadMode, LOAD_MODES.map((row) => row.id), 'Load mode');
  const amps = number(serviceAmps, 'Service amps', { allowZero: false });
  if (mode === 'essential') {
    if (amps <= 100) return 10;
    if (amps <= 200) return 14;
    return 18;
  }
  if (amps <= 100) return 14;
  if (amps <= 150) return 18;
  if (amps <= 200) return 22;
  return 32;
}

export function padSquareFeet(generatorKw) {
  const kw = number(generatorKw, 'Generator kW', { allowZero: false });
  // Rough polymer/poured pad area that grows with the machine, not a
  // manufacturer drawing. Air-cooled pads sit near 16–24 sq ft; liquid-cooled
  // packages need more.
  return Math.max(16, Math.round(12 + kw * 0.55));
}

function atsCost(transferSwitch, atsAmps) {
  const table = ATS_COST[transferSwitch];
  return table[atsAmps] ?? table[200];
}

function breakerCost(amps) {
  const sizes = Object.keys(BREAKER_COST)
    .map(Number)
    .sort((a, b) => a - b);
  const match = sizes.find((size) => size >= amps) ?? sizes[sizes.length - 1];
  return BREAKER_COST[match];
}

export function defaultInputs() {
  return {
    generatorKw: 22,
    loadMode: 'whole_house',
    fuel: 'natural_gas',
    serviceAmps: 200,
    transferSwitch: 'automatic',
    atsAmps: 200,
    padType: 'precast',
    feederFeet: 20,
    gasLineFeet: 15,
    trenchFeet: 0,
    location: 'beside_house',
    gasMeter: 'adequate',
    hourlyWage: 52,
    burdenRate: 32,
    overheadRate: 18,
    targetMargin: 25,
    permitFee: 185,
    generatorHardware: 0,
    otherMaterials: 0,
    otherHours: 0,
    proposedPrice: '',
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

function moneyInputs(input) {
  return {
    hourlyWage: number(input.hourlyWage ?? 0, 'Hourly wage'),
    burdenRate: number(input.burdenRate ?? 0, 'Payroll burden'),
    overheadRate: number(input.overheadRate ?? 0, 'Overhead'),
    targetMargin: number(input.targetMargin ?? 0, 'Target margin'),
    permitFee: number(input.permitFee ?? 0, 'Permit fee'),
    generatorHardware: number(input.generatorHardware ?? 0, 'Generator hardware'),
    otherMaterials: number(input.otherMaterials ?? 0, 'Other materials'),
    otherHours: number(input.otherHours ?? 0, 'Other hours'),
  };
}

/**
 * Price a residential standby-generator install from the machine, the
 * transfer switch, the pad, the fuel, and the setback.
 */
export function calculateBid(input) {
  const generatorKw = number(input.generatorKw ?? 0, 'Generator kW', { allowZero: false });
  if (generatorKw > MAX_KW) {
    throw new Error(
      `Generator is larger than ${MAX_KW} kW — this tool prices residential standby, not a commercial package`,
    );
  }

  const loadMode = oneOf(input.loadMode, LOAD_MODES.map((row) => row.id), 'Load mode');
  const fuel = oneOf(input.fuel, FUELS.map((row) => row.id), 'Fuel');
  const location = oneOf(input.location, LOCATIONS.map((row) => row.id), 'Location');
  const transferSwitch = oneOf(
    input.transferSwitch,
    TRANSFER_SWITCHES.map((row) => row.id),
    'Transfer switch',
  );
  const padType = oneOf(input.padType, PAD_TYPES.map((row) => row.id), 'Pad type');
  const gasMeter = oneOf(input.gasMeter, GAS_METERS.map((row) => row.id), 'Gas meter');
  const serviceAmps = number(input.serviceAmps ?? 0, 'Service amps', { allowZero: false });
  const atsAmps = number(input.atsAmps ?? 0, 'ATS amps', { allowZero: false });
  if (!SERVICE_AMPS.includes(serviceAmps)) {
    throw new Error(`Service amps must be one of: ${SERVICE_AMPS.join(', ')}`);
  }
  if (!ATS_AMPS.includes(atsAmps)) {
    throw new Error(`ATS amps must be one of: ${ATS_AMPS.join(', ')}`);
  }

  const feederFeet = number(input.feederFeet ?? 0, 'Feeder length');
  const gasLineFeet = number(input.gasLineFeet ?? 0, 'Gas-line length');
  const trenchFeet = number(input.trenchFeet ?? 0, 'Trench length');
  const money = moneyInputs(input);
  if (money.targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const current = nameplateAmps(generatorKw);
  const breakerAmps = feederBreakerAmps(generatorKw);
  const wire = recommendWire({
    breakerAmps,
    nameplateAmps: current,
    feederFeet,
  });

  const transfer = TRANSFER_SWITCHES.find((row) => row.id === transferSwitch);
  const pad = PAD_TYPES.find((row) => row.id === padType);
  const padSqFt = padSquareFeet(generatorKw);
  const liquidCooled = generatorKw >= 24;

  const hours = {
    base: LABOR_RATES.baseHours,
    pad: pad.hours,
    transfer: transfer.hours + (atsAmps === 400 ? LABOR_RATES.ats400ExtraHours : 0),
    feeder: (feederFeet * LABOR_RATES.feederMinutesPerFoot) / 60,
    trench: trenchFeet > 0 ? LABOR_RATES.trenchSetupHours + trenchFeet * LABOR_RATES.trenchHoursPerFoot : 0,
    gas:
      (fuel === 'propane' ? LABOR_RATES.lpSetupHours : 0) +
      gasLineFeet * (fuel === 'propane' ? LABOR_RATES.gasLpHoursPerFoot : LABOR_RATES.gasNgHoursPerFoot),
    meter: gasMeter === 'upgrade' ? LABOR_RATES.meterUpgradeHours : 0,
    location:
      location === 'far_yard'
        ? LABOR_RATES.farYardHours
        : location === 'side_yard'
          ? LABOR_RATES.sideYardHours
          : 0,
    liquid: liquidCooled ? LABOR_RATES.liquidCooledHours : 0,
    inspection: LABOR_RATES.inspectionHours,
    commission: LABOR_RATES.commissionHours,
    other: money.otherHours,
  };
  const laborHours = Object.values(hours).reduce((sum, value) => sum + value, 0);

  const materials = {
    pad: padType === 'poured' ? padSqFt * MATERIAL_RATES.pouredPadPerSqFt : pad.dollars,
    ats: atsCost(transferSwitch, atsAmps),
    feederWire: feederFeet * wire.dollarsPerRunFoot,
    conduit: feederFeet * MATERIAL_RATES.pvcPerFoot,
    breaker: breakerCost(breakerAmps),
    fittings: MATERIAL_RATES.fittings,
    gas:
      gasLineFeet * (fuel === 'propane' ? MATERIAL_RATES.lpPipePerFoot : MATERIAL_RATES.ngPipePerFoot) +
      (fuel === 'propane' ? MATERIAL_RATES.lpRegulatorKit + MATERIAL_RATES.lpTankHookup : 0),
    trenchRestoration: trenchFeet * MATERIAL_RATES.trenchRestorationPerFoot,
    meter: gasMeter === 'upgrade' ? MATERIAL_RATES.meterUpgrade : 0,
    permit: money.permitFee,
    generatorHardware: money.generatorHardware,
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

  const suggestedKw = recommendedKw(loadMode, serviceAmps);
  const atsUndersized = atsAmps < serviceAmps;
  const feederBiggerThanAts = breakerAmps > atsAmps;
  const longNgRun = fuel === 'natural_gas' && gasLineFeet > 40 && gasMeter !== 'upgrade';

  const warnings = [];
  if (atsUndersized) {
    warnings.push(
      `The ${atsAmps} A transfer switch is smaller than the ${serviceAmps} A service — it will not carry the whole house unless the load is split.`,
    );
  }
  if (feederBiggerThanAts) {
    warnings.push(
      `The ${breakerAmps} A generator breaker is larger than the ${atsAmps} A transfer switch. Check the ATS rating against this machine.`,
    );
  }
  if (longNgRun) {
    warnings.push(
      `A ${gasLineFeet} ft natural-gas run often needs a meter or regulator look from the utility. The bid does not yet include that upgrade.`,
    );
  }
  if (generatorKw + 0.01 < suggestedKw) {
    warnings.push(
      `A ${loadMode === 'essential' ? 'essential-circuit' : 'whole-house'} job on ${serviceAmps} A service often starts at ${suggestedKw} kW, not ${generatorKw} kW. This is a starting hint, not a load calculation.`,
    );
  }

  const baseline = calculateBid._skipBaseline
    ? null
    : baselinePrice(money);

  return {
    generatorKw,
    loadMode,
    fuel,
    location,
    transferSwitch,
    padType,
    gasMeter,
    serviceAmps,
    atsAmps,
    feederFeet,
    gasLineFeet,
    trenchFeet,
    nameplateAmps: current,
    breakerAmps,
    wire,
    suggestedKw,
    padSquareFeet: padSqFt,
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
    pricePerKw: price / generatorKw,
    pricePerFeederFoot: feederFeet > 0 ? price / feederFeet : null,
    vsBaseline: baseline ? price / baseline : null,
    baselinePrice: baseline,
    warnings,
    proposed: proposedComparison(input.proposedPrice, totalCost, laborHours),
  };
}

// Recursion guard so the comparison bid does not compare itself.
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
      generatorHardware: 0,
      otherMaterials: 0,
      otherHours: 0,
      proposedPrice: '',
    });
    return result.price;
  } finally {
    calculateBid._skipBaseline = false;
  }
}
