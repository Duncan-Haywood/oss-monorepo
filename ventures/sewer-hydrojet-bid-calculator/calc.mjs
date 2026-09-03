// Pure bid arithmetic for sewer camera inspections and hydro-jet /
// cable drain cleaning. No network, no state: every foot, access
// method, wage, and wear charge is an input, so the result stays a
// transparent calculation the shop can check against their own
// invoices rather than a claim about what any line "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$149 drain special" or published hydro-jet price treats a 50-foot
// cable from an existing cleanout as the same job as a 140-foot main
// with a toilet pull, roots at the street, 150 feet of hose from the
// truck, and a camera warranty pass. Homeowners (and a lot of
// estimator sheets) count the same kind of number. Extra footage past
// the included run, access, roots, grease, hose distance, and the
// camera pass do not scale with the trip charge. Matching a cheaper
// special written for the brochure cleanout is how a sold main-line
// jet becomes a two-hour loss after the first toilet pull.
//
// Distinct from septic pumping (a tank lid, hose, and extra gallons),
// water-heater replacement (vent, gas upsize, attic), kitchen-hood
// cleaning (canopy and rooftop fan), and dryer-vent cleaning (lint
// run and a roof cap). This prices a sewer or drain line: the machine,
// the footage past the included run, how you get into the pipe, and
// the camera that proves the work.

export const WORK_PRESETS = Object.freeze([
  { id: 'camera', label: 'Camera inspection only' },
  { id: 'cable', label: 'Cable / auger (the drain special)' },
  { id: 'jet', label: 'Hydro-jet only' },
  { id: 'combo', label: 'Hydro-jet + camera warranty pass' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'cleanout', label: 'Existing cleanout' },
  { id: 'toilet-pull', label: 'Toilet pull (no cleanout)' },
  { id: 'new-cleanout', label: 'Install a new cleanout first' },
  { id: 'roof-vent', label: 'Roof-vent access' },
]);

export const LINE_PRESETS = Object.freeze([
  { id: 'branch', label: 'Kitchen / laundry branch' },
  { id: 'main', label: 'Main sewer to the street' },
  { id: 'storm', label: 'Storm / yard drain' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '50 ft kitchen cable from a cleanout (the $149 brochure special)',
    work: 'cable',
    access: 'cleanout',
    line: 'branch',
    lineFeet: 50,
    includedFootage: 50,
    hoseRunFeet: 40,
    hasRoots: false,
    hasGrease: false,
    extraLine: false,
  },
  {
    label: '75 ft main, jet + camera, existing cleanout, light grease',
    work: 'combo',
    access: 'cleanout',
    line: 'main',
    lineFeet: 75,
    includedFootage: 50,
    hoseRunFeet: 60,
    hasRoots: false,
    hasGrease: true,
    extraLine: false,
  },
  {
    label: '140 ft main, toilet pull, roots, 150 ft hose, jet + camera',
    work: 'combo',
    access: 'toilet-pull',
    line: 'main',
    lineFeet: 140,
    includedFootage: 50,
    hoseRunFeet: 150,
    hasRoots: true,
    hasGrease: false,
    extraLine: false,
  },
  {
    label: '80 ft commercial kitchen jet, grease, second line, new cleanout',
    work: 'jet',
    access: 'new-cleanout',
    line: 'branch',
    lineFeet: 80,
    includedFootage: 50,
    hoseRunFeet: 70,
    hasRoots: false,
    hasGrease: true,
    extraLine: true,
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
 * Starting machine hours and wear from the work type. These are
 * ballpark shop figures, not a catalog. Picking a work type never
 * overwrites a rate the shop has already typed.
 */
export function suggestedWorkKit(work) {
  const id = String(work);
  if (id === 'camera') {
    return {
      hoursCameraBase: 0.75,
      hoursCableBase: 0,
      hoursJetBase: 0,
      cameraWear: 35,
      cableWear: 0,
      jetWear: 0,
    };
  }
  if (id === 'cable') {
    return {
      hoursCameraBase: 0,
      hoursCableBase: 0.75,
      hoursJetBase: 0,
      cameraWear: 0,
      cableWear: 15,
      jetWear: 0,
    };
  }
  if (id === 'jet') {
    return {
      hoursCameraBase: 0,
      hoursCableBase: 0,
      hoursJetBase: 1.25,
      cameraWear: 0,
      cableWear: 0,
      jetWear: 45,
    };
  }
  if (id === 'combo') {
    return {
      hoursCameraBase: 0.75,
      hoursCableBase: 0,
      hoursJetBase: 1.25,
      cameraWear: 35,
      cableWear: 0,
      jetWear: 45,
    };
  }
  throw new Error('Unknown work type');
}

/**
 * Starting access hours and fittings from how the crew gets into the
 * pipe. An existing cleanout is free access. A toilet pull, a new
 * cleanout, and a roof vent are not.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'cleanout') {
    return { hoursToiletPull: 0, hoursNewCleanout: 0, hoursRoofVent: 0, waxRing: 0, cleanoutFitting: 0 };
  }
  if (id === 'toilet-pull') {
    return { hoursToiletPull: 0.75, hoursNewCleanout: 0, hoursRoofVent: 0, waxRing: 12, cleanoutFitting: 0 };
  }
  if (id === 'new-cleanout') {
    return { hoursToiletPull: 0, hoursNewCleanout: 2.5, hoursRoofVent: 0, waxRing: 0, cleanoutFitting: 85 };
  }
  if (id === 'roof-vent') {
    return { hoursToiletPull: 0, hoursNewCleanout: 0, hoursRoofVent: 1.25, waxRing: 0, cleanoutFitting: 0 };
  }
  throw new Error('Unknown access method');
}

/**
 * Price a camera inspection, cable, hydro-jet, or combo from footage
 * past the included run, access, roots, grease, hose run, and the
 * contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const lineFeet = number(input.lineFeet ?? 0, 'Line footage', { allowZero: false });
  const includedFootage = number(input.includedFootage ?? 0, 'Included footage');
  const hoseRunFeet = number(input.hoseRunFeet ?? 0, 'Hose run from the truck');
  const includedHoseFeet = number(input.includedHoseFeet ?? 0, 'Included hose footage');
  if (includedFootage > lineFeet) {
    throw new Error('Included footage cannot exceed the line footage');
  }

  const work = String(input.work ?? 'combo');
  if (!WORK_PRESETS.some((item) => item.id === work)) {
    throw new Error('Unknown work type');
  }
  const access = String(input.access ?? 'cleanout');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) {
    throw new Error('Unknown access method');
  }
  const line = String(input.line ?? 'main');
  if (!LINE_PRESETS.some((item) => item.id === line)) {
    throw new Error('Unknown line type');
  }

  const hasRoots = flag(input.hasRoots);
  const hasGrease = flag(input.hasGrease);
  const extraLine = flag(input.extraLine);
  const includesCamera = work === 'camera' || work === 'combo';
  const includesCable = work === 'cable';
  const includesJet = work === 'jet' || work === 'combo';
  const extraFeet = Math.max(0, lineFeet - includedFootage);
  const extraHoseFeet = Math.max(0, hoseRunFeet - includedHoseFeet);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursCameraBase = number(input.hoursCameraBase ?? 0, 'Hours for a camera pass');
  const hoursCableBase = number(input.hoursCableBase ?? 0, 'Hours for a cable run');
  const hoursJetBase = number(input.hoursJetBase ?? 0, 'Hours for a hydro-jet pass');
  const hoursPerExtraFoot = number(input.hoursPerExtraFoot ?? 0, 'Hours per extra foot');
  const hoursToiletPull = number(input.hoursToiletPull ?? 0, 'Hours to pull the toilet');
  const hoursNewCleanout = number(input.hoursNewCleanout ?? 0, 'Hours to install a cleanout');
  const hoursRoofVent = number(input.hoursRoofVent ?? 0, 'Hours for roof-vent access');
  const hoursRootCut = number(input.hoursRootCut ?? 0, 'Hours to cut roots');
  const hoursGreasePass = number(input.hoursGreasePass ?? 0, 'Hours for a grease pass');
  const hoursSecondLine = number(input.hoursSecondLine ?? 0, 'Hours for a second line');
  const hoursPerExtraHoseFoot = number(input.hoursPerExtraHoseFoot ?? 0, 'Hours per extra hose foot');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const cameraWear = number(input.cameraWear ?? 0, 'Camera wear');
  const cableWear = number(input.cableWear ?? 0, 'Cable wear');
  const jetWear = number(input.jetWear ?? 0, 'Jet water / nozzle / disposal');
  const waxRing = number(input.waxRing ?? 0, 'Wax ring');
  const cleanoutFitting = number(input.cleanoutFitting ?? 0, 'Cleanout fitting');
  const rootCutterRental = number(input.rootCutterRental ?? 0, 'Root-cutter rental');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const cameraHours = includesCamera ? hoursCameraBase : 0;
  const cableHours = includesCable ? hoursCableBase : 0;
  const jetHours = includesJet ? hoursJetBase : 0;
  const footageHours = extraFeet * hoursPerExtraFoot;
  const toiletHours = access === 'toilet-pull' ? hoursToiletPull : 0;
  const cleanoutHours = access === 'new-cleanout' ? hoursNewCleanout : 0;
  const roofHours = access === 'roof-vent' ? hoursRoofVent : 0;
  const accessHours = toiletHours + cleanoutHours + roofHours;
  const rootHours = hasRoots ? hoursRootCut : 0;
  const greaseHours = hasGrease ? hoursGreasePass : 0;
  const secondLineHours = extraLine ? hoursSecondLine : 0;
  const hoseHours = extraHoseFeet * hoursPerExtraHoseFoot;
  const conditionHours = rootHours + greaseHours + secondLineHours;
  const machineHours = cameraHours + cableHours + jetHours;
  const runHours = footageHours + hoseHours;
  const totalHours = tripHours + machineHours + runHours + accessHours + conditionHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const cameraMaterial = includesCamera ? cameraWear : 0;
  const cableMaterial = includesCable ? cableWear : 0;
  const jetMaterial = includesJet ? jetWear : 0;
  const waxMaterial = access === 'toilet-pull' ? waxRing : 0;
  const cleanoutMaterial = access === 'new-cleanout' ? cleanoutFitting : 0;
  const rootMaterial = hasRoots ? rootCutterRental : 0;
  const permitMaterial = permitFee;
  const materialCost = cameraMaterial + cableMaterial + jetMaterial
    + waxMaterial + cleanoutMaterial + rootMaterial + permitMaterial;
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
    work,
    access,
    line,
    lineFeet,
    includedFootage,
    extraFeet,
    hoseRunFeet,
    includedHoseFeet,
    extraHoseFeet,
    hasRoots,
    hasGrease,
    extraLine,
    includesCamera,
    includesCable,
    includesJet,
    loadedWage,
    tripHours,
    cameraHours,
    cableHours,
    jetHours,
    footageHours,
    toiletHours,
    cleanoutHours,
    roofHours,
    accessHours,
    rootHours,
    greaseHours,
    secondLineHours,
    hoseHours,
    conditionHours,
    machineHours,
    runHours,
    siteHours,
    totalHours,
    laborCost,
    cameraMaterial,
    cableMaterial,
    jetMaterial,
    waxMaterial,
    cleanoutMaterial,
    rootMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerFoot: lineFeet === 0 ? null : price / lineFeet,
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
      machine: hourShare(machineHours),
      run: hourShare(runHours),
      access: hourShare(accessHours),
      conditions: hourShare(conditionHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perFoot: lineFeet === 0 ? null : proposedPrice / lineFeet,
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
export function formatBidSummary(result, jobLabel = 'Sewer camera / hydro-jet') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perFoot = result.pricePerFoot === null
    ? 'n/a'
    : `${money(result.pricePerFoot)} / ft of line`;
  const work = WORK_PRESETS.find((item) => item.id === result.work)?.label ?? result.work;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const line = LINE_PRESETS.find((item) => item.id === result.line)?.label ?? result.line;
  const roots = result.hasRoots ? 'root cutting included' : 'no root cutting this bid';
  const grease = result.hasGrease ? 'grease pass included' : 'no grease pass this bid';
  const second = result.extraLine ? 'second line included' : 'one line this bid';
  const camera = result.includesCamera ? 'camera inspection included' : 'no camera this bid';
  return [
    'SEWER CAMERA / HYDRO-JET BID',
    '',
    `Proposed camera / hydro-jet price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${work}; ${line}`,
    `Price per foot of line: ${perFoot}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${line}; ${result.lineFeet} ft of line (${result.extraFeet} ft past the included ${result.includedFootage} ft)`,
    `- Access: ${access}; hose from the truck: ${result.hoseRunFeet} ft`,
    `- ${camera}; ${roots}; ${grease}; ${second}`,
    `- Machine labor: ${result.machineHours.toFixed(1)} h; extra footage / hose: ${result.runHours.toFixed(1)} h; access: ${result.accessHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm line footage, access, roots, grease, disposal, permits, and all pricing before sending. It is not a plumbing specification, a code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
