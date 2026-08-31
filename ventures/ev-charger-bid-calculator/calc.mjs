// Pure bid arithmetic for a Level 2 EV charger (EVSE) install. No network,
// no state: every amperage, length, wage, and material figure is an input, so
// the result stays a transparent calculation an electrician can check against
// their own takeoff rather than a claim about what any house "should" cost.
//
// The method is the one the trade actually bids with: size the circuit at
// 125% of the charger's continuous current (NEC 625 / continuous-load rule),
// pick a copper conductor that carries that breaker *and* stays inside a 3%
// voltage-drop budget for the run, then stack labor for the run, the trench,
// and the panel work. That is what separates a defensible bid from a flat
// "$800 to hang a charger" guess — a 20-foot indoor run on a panel with a
// spare slot is a different job from a 70-foot trench to a detached garage
// that also needs a 200 A service upgrade, and a flat install price cannot
// see the difference.

export const INPUT_FIELDS = Object.freeze([
  'chargerAmps',
  'runFeet',
  'trenchFeet',
  'location',
  'installType',
  'panelWork',
  'existingServiceAmps',
  'estimatedExistingLoad',
  'hourlyWage',
  'burdenRate',
  'overheadRate',
  'targetMargin',
  'permitFee',
  'chargerHardware',
  'otherMaterials',
  'otherHours',
  'proposedPrice',
]);

// Continuous charger current → the breaker the circuit is usually landed on.
// 32 A → 40 A, 40 A → 50 A, 48 A → 60 A, 80 A → 100 A. These are the four
// Level 2 sizes a residential electrician actually quotes.
export const CHARGER_PRESETS = Object.freeze([
  { label: '32 A Level 2 (40 A circuit)', chargerAmps: 32 },
  { label: '40 A Level 2 (50 A circuit)', chargerAmps: 40 },
  { label: '48 A Level 2 (60 A circuit)', chargerAmps: 48 },
  { label: '80 A Level 2 (100 A circuit)', chargerAmps: 80 },
]);

export const LOCATION_PRESETS = Object.freeze([
  { id: 'indoor_garage', label: 'Indoor garage wall' },
  { id: 'outdoor_wall', label: 'Outdoor house wall' },
  { id: 'detached_garage', label: 'Detached garage (trench)' },
  { id: 'pedestal', label: 'Driveway pedestal' },
]);

export const INSTALL_TYPES = Object.freeze([
  { id: 'hardwired', label: 'Hardwired EVSE' },
  { id: 'nema_14_50', label: 'NEMA 14-50 receptacle' },
]);

export const PANEL_WORK = Object.freeze([
  { id: 'spare_slot', label: 'Spare breaker slot', hours: 0.4 },
  { id: 'relocate', label: 'Relocate / make space', hours: 1.5 },
  { id: 'subpanel', label: 'New subpanel', hours: 3.5 },
  { id: 'service_upgrade', label: 'Service upgrade (200 A)', hours: 8 },
]);

// Copper, 75 °C column, the ampacity an electrician uses for THHN/THWN in
// conduit on a typical residential EVSE run. Circular mils are for the
// voltage-drop check. Dollars are a starting takeoff for a 4-wire run
// (two hots, neutral, ground) — replace with the truck's current invoice.
export const WIRE_TABLE = Object.freeze([
  { awg: 8, ampacity: 50, circularMils: 16510, dollarsPerRunFoot: 2.4 },
  { awg: 6, ampacity: 65, circularMils: 26240, dollarsPerRunFoot: 3.8 },
  { awg: 4, ampacity: 85, circularMils: 41740, dollarsPerRunFoot: 5.6 },
  { awg: 3, ampacity: 100, circularMils: 52620, dollarsPerRunFoot: 7.2 },
  { awg: 2, ampacity: 115, circularMils: 66360, dollarsPerRunFoot: 9 },
  { awg: 1, ampacity: 130, circularMils: 83690, dollarsPerRunFoot: 11.2 },
]);

// Standard breaker sizes an electrician can actually buy. The 125% continuous
// load is rounded up to the next one of these, never left as a fractional amp.
export const STANDARD_BREAKERS = Object.freeze([
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200,
]);

export const COPPER_K = 12.9;
export const VOLTAGE = 240;
export const VOLTAGE_DROP_LIMIT = 0.03;
export const CONTINUOUS_LOAD_FACTOR = 1.25;

// Hours and material dollars that are *starting points*, not a standard.
// Every one is an input the electrician can overwrite from a timed job.
export const LABOR_RATES = Object.freeze({
  baseHours: 2,
  indoorMinutesPerFoot: 3.6, // 0.06 h/ft
  outdoorMinutesPerFoot: 5.4, // 0.09 h/ft
  trenchHoursPerFoot: 0.12,
  trenchSetupHours: 1,
  loadCalcHours: 0.75,
  inspectionHours: 1,
  outdoorDisconnectHours: 0.6,
  pedestalHours: 1.5,
  receptacleExtraHours: 0.4,
});

export const MATERIAL_RATES = Object.freeze({
  fittings: 85,
  outdoorDisconnect: 65,
  pedestal: 180,
  trenchRestorationPerFoot: 8,
  emtPerFoot: 1.8,
  pvcPerFoot: 1.4,
  nema1450Device: 45,
});

export const BREAKER_COST = Object.freeze({
  40: 45,
  50: 55,
  60: 70,
  80: 95,
  100: 130,
  125: 160,
  150: 210,
  200: 280,
});

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export function nextStandardBreaker(amps) {
  const needed = number(amps, 'Breaker amps', { allowZero: false });
  const match = STANDARD_BREAKERS.find(size => size >= needed);
  if (!match) throw new Error('Required breaker is larger than 200 A — this tool prices residential Level 2, not a commercial feeder');
  return match;
}

export function requiredBreakerAmps(chargerAmps) {
  return nextStandardBreaker(number(chargerAmps, 'Charger amps', { allowZero: false }) * CONTINUOUS_LOAD_FACTOR);
}

export function voltageDropPercent({ amps, runFeet, circularMils }) {
  const current = number(amps, 'Voltage-drop amps', { allowZero: false });
  const length = number(runFeet, 'Run length');
  const cm = number(circularMils, 'Circular mils', { allowZero: false });
  if (length === 0) return 0;
  // Single-phase: Vd = 2 * K * I * L / CM. Report as a percent of 240 V.
  return ((2 * COPPER_K * current * length) / cm / VOLTAGE) * 100;
}

export function recommendWire({ breakerAmps, chargerAmps, runFeet }) {
  const breaker = number(breakerAmps, 'Breaker', { allowZero: false });
  const current = number(chargerAmps, 'Charger amps', { allowZero: false });
  const length = number(runFeet, 'Run length');
  const byAmpacity = WIRE_TABLE.find(row => row.ampacity >= breaker);
  if (!byAmpacity) throw new Error('No copper size in the table carries that breaker — check the charger amps');

  let chosen = byAmpacity;
  for (const row of WIRE_TABLE) {
    if (row.ampacity < breaker) continue;
    const drop = voltageDropPercent({
      amps: current,
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
    amps: current,
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

function locationHours(location, runFeet, trenchFeet) {
  const outdoor = location === 'outdoor_wall' || location === 'detached_garage' || location === 'pedestal';
  const minutesPerFoot = outdoor ? LABOR_RATES.outdoorMinutesPerFoot : LABOR_RATES.indoorMinutesPerFoot;
  const runHours = (runFeet * minutesPerFoot) / 60;
  const trenchHours = trenchFeet > 0 ? LABOR_RATES.trenchSetupHours + trenchFeet * LABOR_RATES.trenchHoursPerFoot : 0;
  const disconnectHours = outdoor ? LABOR_RATES.outdoorDisconnectHours : 0;
  const pedestalHours = location === 'pedestal' ? LABOR_RATES.pedestalHours : 0;
  return { runHours, trenchHours, disconnectHours, pedestalHours, outdoor };
}

function panelHours(panelWork) {
  const row = PANEL_WORK.find(item => item.id === panelWork);
  if (!row) throw new Error('Panel work must be spare slot, relocate, subpanel, or service upgrade');
  return row.hours;
}

function breakerDollars(breakerAmps) {
  const keys = Object.keys(BREAKER_COST).map(Number).sort((a, b) => a - b);
  const key = keys.find(size => size >= breakerAmps) ?? keys[keys.length - 1];
  return BREAKER_COST[key];
}

/**
 * Price a residential Level 2 EV charger install from the circuit, the run,
 * the trench, and the panel work.
 *
 * @param {object} input
 */
export function calculateBid(input = {}) {
  const chargerAmps = number(input.chargerAmps ?? 0, 'Charger amps', { allowZero: false });
  const runFeet = number(input.runFeet ?? 0, 'Run length');
  const trenchFeet = number(input.trenchFeet ?? 0, 'Trench length');
  const location = String(input.location || 'indoor_garage');
  if (!LOCATION_PRESETS.some(item => item.id === location)) {
    throw new Error('Location must be indoor garage, outdoor wall, detached garage, or pedestal');
  }
  const installType = String(input.installType || 'hardwired');
  if (!INSTALL_TYPES.some(item => item.id === installType)) {
    throw new Error('Install type must be hardwired or NEMA 14-50');
  }
  const panelWork = String(input.panelWork || 'spare_slot');
  const existingServiceAmps = number(input.existingServiceAmps ?? 0, 'Existing service amps');
  const estimatedExistingLoad = number(input.estimatedExistingLoad ?? 0, 'Existing load');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');
  const chargerHardware = number(input.chargerHardware ?? 0, 'Charger hardware');
  const otherMaterials = number(input.otherMaterials ?? 0, 'Other materials');
  const otherHours = number(input.otherHours ?? 0, 'Other hours');

  const breakerAmps = requiredBreakerAmps(chargerAmps);
  const wire = recommendWire({ breakerAmps, chargerAmps, runFeet });
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const { runHours, trenchHours, disconnectHours, pedestalHours, outdoor } = locationHours(
    location,
    runFeet,
    trenchFeet,
  );
  const receptacleHours = installType === 'nema_14_50' ? LABOR_RATES.receptacleExtraHours : 0;
  const hours = {
    base: LABOR_RATES.baseHours,
    run: runHours,
    trench: trenchHours,
    panel: panelHours(panelWork),
    loadCalc: LABOR_RATES.loadCalcHours,
    inspection: LABOR_RATES.inspectionHours,
    disconnect: disconnectHours,
    pedestal: pedestalHours,
    receptacle: receptacleHours,
    other: otherHours,
  };
  const laborHours = Object.values(hours).reduce((sum, value) => sum + value, 0);
  const laborCost = laborHours * loadedWage;

  const conduitPerFoot = outdoor ? MATERIAL_RATES.pvcPerFoot : MATERIAL_RATES.emtPerFoot;
  const materials = {
    wire: wire.dollarsPerRunFoot * runFeet,
    conduit: conduitPerFoot * runFeet,
    breaker: breakerDollars(breakerAmps),
    fittings: MATERIAL_RATES.fittings,
    disconnect: outdoor ? MATERIAL_RATES.outdoorDisconnect : 0,
    pedestal: location === 'pedestal' ? MATERIAL_RATES.pedestal : 0,
    receptacle: installType === 'nema_14_50' ? MATERIAL_RATES.nema1450Device : 0,
    trenchRestoration: trenchFeet * MATERIAL_RATES.trenchRestorationPerFoot,
    chargerHardware,
    permit: permitFee,
    other: otherMaterials,
  };
  const materialsCost = Object.values(materials).reduce((sum, value) => sum + value, 0);

  const directCost = laborCost + materialsCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const serviceHeadroom = existingServiceAmps - estimatedExistingLoad;
  const serviceUpgradeSuggested = serviceHeadroom < breakerAmps && panelWork !== 'service_upgrade';

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const share = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const costShares = {
    labor: share(laborCost + overhead * (laborCost / (directCost || 1))),
    runAndWire: share(materials.wire + materials.conduit + hours.run * loadedWage),
    trench: share(materials.trenchRestoration + hours.trench * loadedWage),
    panel: share(materials.breaker + hours.panel * loadedWage),
    permitAndPaper: share(materials.permit + hours.loadCalc * loadedWage + hours.inspection * loadedWage),
    hardware: share(materials.chargerHardware),
  };

  const baseline = baselineJob(input);
  const vsBaseline = baseline.price === 0 ? null : price / baseline.price;

  return {
    chargerAmps,
    breakerAmps,
    runFeet,
    trenchFeet,
    location,
    installType,
    panelWork,
    wire,
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
    effectiveHourlyRate: laborHours === 0 ? null : price / laborHours,
    pricePerCircuitAmp: price / breakerAmps,
    pricePerRunFoot: runFeet === 0 ? null : price / runFeet,
    breakEvenPrice: totalCost,
    serviceHeadroom,
    serviceUpgradeSuggested,
    serviceUpgradeReason: serviceUpgradeSuggested
      ? `Existing headroom is ${serviceHeadroom} A and this circuit needs a ${breakerAmps} A breaker.`
      : null,
    costShares,
    baselinePrice: baseline.price,
    vsBaseline,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

// The "easy garage" job the rest of the quote is compared to: same wage,
// burden, overhead, margin, and permit, but a 20-foot indoor 48 A hardwired
// hang on a spare slot with no trench and no hardware. That is the number a
// homeowner already has in their head from a Facebook ad, and the comparison
// is what shows why *this* house is not that job.
function baselineJob(input) {
  if (input._baseline) {
    return { price: 0, laborHours: 0 };
  }
  const result = calculateBid({
    chargerAmps: 48,
    runFeet: 20,
    trenchFeet: 0,
    location: 'indoor_garage',
    installType: 'hardwired',
    panelWork: 'spare_slot',
    existingServiceAmps: input.existingServiceAmps ?? 200,
    estimatedExistingLoad: input.estimatedExistingLoad ?? 120,
    hourlyWage: input.hourlyWage ?? 0,
    burdenRate: input.burdenRate ?? 0,
    overheadRate: input.overheadRate ?? 0,
    targetMargin: input.targetMargin ?? 0,
    permitFee: input.permitFee ?? 0,
    chargerHardware: 0,
    otherMaterials: 0,
    otherHours: 0,
    _baseline: true,
  });
  return { price: result.price, laborHours: result.laborHours };
}

export function defaultInputs() {
  return {
    chargerAmps: 48,
    runFeet: 25,
    trenchFeet: 0,
    location: 'indoor_garage',
    installType: 'hardwired',
    panelWork: 'spare_slot',
    existingServiceAmps: 200,
    estimatedExistingLoad: 140,
    hourlyWage: 48,
    burdenRate: 32,
    overheadRate: 18,
    targetMargin: 25,
    permitFee: 150,
    chargerHardware: 0,
    otherMaterials: 0,
    otherHours: 0,
    proposedPrice: '',
  };
}
