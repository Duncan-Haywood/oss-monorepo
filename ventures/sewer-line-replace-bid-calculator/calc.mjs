// Pure bid arithmetic for sewer-line replacement: open-cut, pipe
// bursting, and CIPP lining. No network, no state: every foot, surface,
// depth, wage, and restoration rate is an input, so the result stays a
// transparent calculation the shop can check against their own invoices
// rather than a claim about what any run "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$125 a foot" or a brochure open-cut price treats 40 feet under a
// lawn as the same job as 80 feet under a driveway with two laterals
// and a 7-foot bury. Homeowners (and a lot of estimator sheets) count
// the same kind of number. Restoration, laterals, depth, pits, and a
// bypass on an occupied house do not scale with the per-foot special.
// Matching a cheaper yard job on a driveway run is how a sold open-cut
// becomes a two-day loss after the first sawcut.
//
// Distinct from hydro-jet / sewer-camera work (cleaning an existing
// line: extra footage, toilet pull, roots, grease) and from septic
// pumping (a tank lid, hose, and extra gallons). This prices replacing
// or lining the pipe from the house to the tap, and putting the surface
// back.

export const METHOD_PRESETS = Object.freeze([
  { id: 'open-cut', label: 'Open-cut excavation' },
  { id: 'pipe-burst', label: 'Pipe bursting (trenchless)' },
  { id: 'cipp', label: 'CIPP lining (trenchless)' },
]);

export const SURFACE_PRESETS = Object.freeze([
  { id: 'lawn', label: 'Lawn / dirt only' },
  { id: 'driveway', label: 'Asphalt driveway' },
  { id: 'sidewalk', label: 'Concrete sidewalk' },
  { id: 'street', label: 'Street / roadway' },
]);

export const DIAMETER_PRESETS = Object.freeze([
  { id: 4, label: '4-inch' },
  { id: 6, label: '6-inch' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '40 ft open-cut under lawn (the cheap yard job)',
    method: 'open-cut',
    surface: 'lawn',
    runFeet: 40,
    hardFeet: 0,
    depthFt: 5,
    diameterIn: 4,
    laterals: 0,
    cleanouts: 1,
    pits: 0,
    occupiedHouse: false,
  },
  {
    label: '80 ft under a driveway, two laterals (where trenchless wins)',
    method: 'open-cut',
    surface: 'driveway',
    runFeet: 80,
    hardFeet: 80,
    depthFt: 6,
    diameterIn: 4,
    laterals: 2,
    cleanouts: 1,
    pits: 2,
    occupiedHouse: false,
  },
  {
    label: '120 ft CIPP liner, three laterals, house occupied',
    method: 'cipp',
    surface: 'lawn',
    runFeet: 120,
    hardFeet: 0,
    depthFt: 6,
    diameterIn: 6,
    laterals: 3,
    cleanouts: 0,
    pits: 0,
    occupiedHouse: true,
  },
  {
    label: '60 ft pipe-burst under sidewalk, two pits',
    method: 'pipe-burst',
    surface: 'sidewalk',
    runFeet: 60,
    hardFeet: 60,
    depthFt: 7,
    diameterIn: 4,
    laterals: 1,
    cleanouts: 0,
    pits: 2,
    occupiedHouse: false,
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

function integerCount(value, name) {
  const result = number(value, name);
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number`);
  return result;
}

/**
 * Starting machine hours and pipe / liner rates from the replacement
 * method and the pipe diameter. These are ballpark shop figures, not a
 * catalog. Picking a method never overwrites a rate the shop has already
 * typed.
 */
export function suggestedMethodKit(method, diameterIn = 4) {
  const inches = Number(diameterIn) === 6 ? 6 : 4;
  const id = String(method);
  if (id === 'open-cut') {
    return {
      hoursPerFootExcavate: 0.18,
      hoursPerFootPipe: 0.06,
      hoursPerPit: 0,
      hoursPerFootBurst: 0,
      hoursCippSetup: 0,
      hoursPerFootCipp: 0,
      hoursPerLateral: 0.35,
      pipePerFoot: inches === 6 ? 14 : 8.5,
      linerPerFoot: 0,
      lateralFitting: 45,
      spoilsDumpPerYard: 45,
    };
  }
  if (id === 'pipe-burst') {
    return {
      hoursPerFootExcavate: 0,
      hoursPerFootPipe: 0,
      hoursPerPit: 2.75,
      hoursPerFootBurst: 0.05,
      hoursCippSetup: 0,
      hoursPerFootCipp: 0,
      hoursPerLateral: 1,
      pipePerFoot: inches === 6 ? 14 : 8.5,
      linerPerFoot: 0,
      lateralFitting: 65,
      spoilsDumpPerYard: 45,
    };
  }
  if (id === 'cipp') {
    return {
      hoursPerFootExcavate: 0,
      hoursPerFootPipe: 0,
      hoursPerPit: 0,
      hoursPerFootBurst: 0,
      hoursCippSetup: 2.25,
      hoursPerFootCipp: 0.045,
      hoursPerLateral: 1.25,
      pipePerFoot: 0,
      linerPerFoot: inches === 6 ? 72 : 48,
      lateralFitting: 85,
      spoilsDumpPerYard: 0,
    };
  }
  throw new Error('Unknown replacement method');
}

/**
 * Starting restoration hours and hard-surface material from the surface
 * the crew has to put back. Lawn is cheap. Driveway, sidewalk, and
 * street are not — that is the usual reason trenchless wins.
 */
export function suggestedSurfaceKit(surface) {
  const id = String(surface);
  if (id === 'lawn') {
    return { hoursPerFootHardRestore: 0, restorePerFoot: 0, hoursRestorePit: 0.75, pitRestoreMaterial: 0 };
  }
  if (id === 'driveway') {
    return { hoursPerFootHardRestore: 0.22, restorePerFoot: 18, hoursRestorePit: 2.5, pitRestoreMaterial: 350 };
  }
  if (id === 'sidewalk') {
    return { hoursPerFootHardRestore: 0.28, restorePerFoot: 28, hoursRestorePit: 3, pitRestoreMaterial: 480 };
  }
  if (id === 'street') {
    return { hoursPerFootHardRestore: 0.35, restorePerFoot: 42, hoursRestorePit: 4.25, pitRestoreMaterial: 650 };
  }
  throw new Error('Unknown surface');
}

function restorationFor(method, {
  runFeet,
  lawnFeet,
  hardFeet,
  depthFt,
  pits,
  surface,
  hoursPerFootLawnRestore,
  hoursPerFootHardRestore,
  hoursRestorePit,
  restorePerFoot,
  pitRestoreMaterial,
  spoilsDumpPerYard,
  trenchWidthFt,
}) {
  if (method === 'open-cut') {
    const hoursLawn = lawnFeet * hoursPerFootLawnRestore;
    const hoursHard = hardFeet * hoursPerFootHardRestore;
    const restoreMaterial = hardFeet * restorePerFoot;
    const trenchYards = runFeet * depthFt * trenchWidthFt / 27;
    const dumpCost = trenchYards * spoilsDumpPerYard;
    return { hoursLawn, hoursHard, restoreMaterial, dumpCost, trenchYards };
  }
  if (method === 'pipe-burst') {
    const hoursLawn = surface === 'lawn' || hardFeet === 0 ? pits * hoursRestorePit : 0;
    const hoursHard = surface !== 'lawn' && hardFeet > 0 ? pits * hoursRestorePit : 0;
    const restoreMaterial = surface !== 'lawn' && hardFeet > 0 ? pits * pitRestoreMaterial : 0;
    const pitYards = pits * 4 * 4 * depthFt / 27;
    const dumpCost = pitYards * spoilsDumpPerYard;
    return { hoursLawn, hoursHard, restoreMaterial, dumpCost, trenchYards: pitYards };
  }
  return { hoursLawn: 0, hoursHard: 0, restoreMaterial: 0, dumpCost: 0, trenchYards: 0 };
}

/**
 * Price an open-cut, pipe-burst, or CIPP replacement from footage,
 * surface, depth, laterals, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const runFeet = number(input.runFeet ?? 0, 'Run footage', { allowZero: false });
  const hardFeet = number(input.hardFeet ?? 0, 'Hard-surface footage');
  if (hardFeet > runFeet) {
    throw new Error('Hard-surface footage cannot exceed the run footage');
  }
  const lawnFeet = runFeet - hardFeet;
  const depthFt = number(input.depthFt ?? 6, 'Bury depth', { allowZero: false });
  const diameterIn = number(input.diameterIn ?? 4, 'Pipe diameter', { allowZero: false });
  if (diameterIn !== 4 && diameterIn !== 6) {
    throw new Error('Pipe diameter must be 4 or 6 inches');
  }
  const laterals = integerCount(input.laterals ?? 0, 'Laterals');
  const cleanouts = integerCount(input.cleanouts ?? 0, 'Cleanouts');
  const pits = integerCount(input.pits ?? 0, 'Access pits');

  const method = String(input.method ?? 'open-cut');
  if (!METHOD_PRESETS.some((item) => item.id === method)) {
    throw new Error('Unknown replacement method');
  }
  const surface = String(input.surface ?? 'lawn');
  if (!SURFACE_PRESETS.some((item) => item.id === surface)) {
    throw new Error('Unknown surface');
  }
  const occupiedHouse = flag(input.occupiedHouse);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerFootExcavate = number(input.hoursPerFootExcavate ?? 0, 'Hours per foot to excavate');
  const hoursPerFootPipe = number(input.hoursPerFootPipe ?? 0, 'Hours per foot to set pipe');
  const hoursPerPit = number(input.hoursPerPit ?? 0, 'Hours per access pit');
  const hoursPerFootBurst = number(input.hoursPerFootBurst ?? 0, 'Hours per foot to burst');
  const hoursCippSetup = number(input.hoursCippSetup ?? 0, 'Hours to set up the liner');
  const hoursPerFootCipp = number(input.hoursPerFootCipp ?? 0, 'Hours per foot to line');
  const hoursPerLateral = number(input.hoursPerLateral ?? 0, 'Hours per lateral');
  const hoursPerCleanout = number(input.hoursPerCleanout ?? 0, 'Hours per cleanout');
  const hoursBypass = number(input.hoursBypass ?? 0, 'Hours for a bypass / occupied house');
  const hoursPerFootLawnRestore = number(input.hoursPerFootLawnRestore ?? 0, 'Hours per foot of lawn restore');
  const hoursPerFootHardRestore = number(input.hoursPerFootHardRestore ?? 0, 'Hours per foot of hard-surface restore');
  const hoursRestorePit = number(input.hoursRestorePit ?? 0, 'Hours to restore one pit');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');
  const trenchWidthFt = number(input.trenchWidthFt ?? 1.5, 'Trench width', { allowZero: false });

  const pipePerFoot = number(input.pipePerFoot ?? 0, 'Pipe cost per foot');
  const linerPerFoot = number(input.linerPerFoot ?? 0, 'Liner cost per foot');
  const lateralFitting = number(input.lateralFitting ?? 0, 'Lateral fitting');
  const cleanoutFitting = number(input.cleanoutFitting ?? 0, 'Cleanout fitting');
  const restorePerFoot = number(input.restorePerFoot ?? 0, 'Hard-surface restore per foot');
  const pitRestoreMaterial = number(input.pitRestoreMaterial ?? 0, 'Pit restore material');
  const spoilsDumpPerYard = number(input.spoilsDumpPerYard ?? 0, 'Spoils dump per yard');
  const bypassPumpRental = number(input.bypassPumpRental ?? 0, 'Bypass pump rental');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const depthFactor = depthFt / 6;

  const hoursExcavate = method === 'open-cut' ? runFeet * hoursPerFootExcavate * depthFactor : 0;
  const hoursPipe = method === 'open-cut' ? runFeet * hoursPerFootPipe : 0;
  const hoursBurst = method === 'pipe-burst' ? runFeet * hoursPerFootBurst : 0;
  const hoursPits = method === 'pipe-burst' ? pits * hoursPerPit * depthFactor : 0;
  const hoursCipp = method === 'cipp' ? hoursCippSetup + runFeet * hoursPerFootCipp : 0;
  const hoursLaterals = laterals * hoursPerLateral;
  const hoursCleanouts = cleanouts * hoursPerCleanout;
  const hoursOccupied = occupiedHouse ? hoursBypass : 0;

  const restore = restorationFor(method, {
    runFeet,
    lawnFeet,
    hardFeet,
    depthFt,
    pits,
    surface,
    hoursPerFootLawnRestore,
    hoursPerFootHardRestore,
    hoursRestorePit,
    restorePerFoot,
    pitRestoreMaterial,
    spoilsDumpPerYard,
    trenchWidthFt,
  });
  const hoursRestore = restore.hoursLawn + restore.hoursHard;
  const hoursMethod = hoursExcavate + hoursPipe + hoursBurst + hoursPits + hoursCipp;
  const totalHours = hoursTrip + hoursMethod + hoursLaterals + hoursCleanouts
    + hoursOccupied + hoursRestore + siteHours;
  const laborCost = totalHours * loadedWage;
  const restoreLabor = hoursRestore * loadedWage;

  const pipeMaterial = method === 'cipp' ? 0 : runFeet * pipePerFoot;
  const linerMaterial = method === 'cipp' ? runFeet * linerPerFoot : 0;
  const lateralMaterial = laterals * lateralFitting;
  const cleanoutMaterial = cleanouts * cleanoutFitting;
  const bypassMaterial = occupiedHouse ? bypassPumpRental : 0;
  const permitMaterial = permitFee;
  const materialCost = pipeMaterial + linerMaterial + lateralMaterial + cleanoutMaterial
    + restore.restoreMaterial + restore.dumpCost + bypassMaterial + permitMaterial;
  const softCost = travelAndEquipment;
  const restorationCost = restoreLabor + restore.restoreMaterial + restore.dumpCost;

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
    method,
    surface,
    runFeet,
    hardFeet,
    lawnFeet,
    depthFt,
    diameterIn,
    laterals,
    cleanouts,
    pits,
    occupiedHouse,
    extraFeet: runFeet,
    loadedWage,
    hoursTrip,
    hoursExcavate,
    hoursPipe,
    hoursBurst,
    hoursPits,
    hoursCipp,
    hoursMethod,
    hoursLaterals,
    hoursCleanouts,
    hoursOccupied,
    hoursRestore,
    hoursLawn: restore.hoursLawn,
    hoursHard: restore.hoursHard,
    siteHours,
    totalHours,
    laborCost,
    restoreLabor,
    pipeMaterial,
    linerMaterial,
    lateralMaterial,
    cleanoutMaterial,
    restoreMaterial: restore.restoreMaterial,
    dumpCost: restore.dumpCost,
    trenchYards: restore.trenchYards,
    bypassMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    restorationCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerFoot: runFeet === 0 ? null : price / runFeet,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      restore: costShare(restorationCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(hoursTrip),
      method: hourShare(hoursMethod),
      laterals: hourShare(hoursLaterals + hoursCleanouts),
      occupied: hourShare(hoursOccupied),
      restore: hourShare(hoursRestore),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perFoot: runFeet === 0 ? null : proposedPrice / runFeet,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same run three ways — open-cut, pipe-burst, CIPP — from
 * the suggested kits so the shop can see when restoration flips the
 * cheaper method. User-typed method rates are not reused here: the
 * comparison is apples-to-apples on the starting figures.
 */
export function compareMethods(input) {
  const rows = METHOD_PRESETS.map((preset) => {
    const diameterIn = Number(input.diameterIn ?? 4) === 6 ? 6 : 4;
    const methodKit = suggestedMethodKit(preset.id, diameterIn);
    const surfaceKit = suggestedSurfaceKit(input.surface ?? 'lawn');
    const pits = preset.id === 'pipe-burst'
      ? Math.max(2, integerCount(input.pits ?? 2, 'Access pits'))
      : 0;
    const bid = calculateBid({
      ...input,
      method: preset.id,
      pits,
      ...methodKit,
      ...surfaceKit,
    });
    return {
      method: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerFoot: bid.pricePerFoot,
      hoursRestore: bid.hoursRestore,
      restorationCost: bid.restorationCost,
      restoreShare: bid.shares.restore,
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
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Sewer line replacement') {
  const perFoot = result.pricePerFoot === null
    ? 'n/a'
    : `${money(result.pricePerFoot)} / ft of run`;
  const method = METHOD_PRESETS.find((item) => item.id === result.method)?.label ?? result.method;
  const surface = SURFACE_PRESETS.find((item) => item.id === result.surface)?.label ?? result.surface;
  const occupied = result.occupiedHouse ? 'bypass / occupied house included' : 'house can be offline during the work';
  return [
    'SEWER LINE REPLACEMENT BID',
    '',
    `Proposed replacement price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${method}`,
    `Price per foot of run: ${perFoot}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.runFeet} ft of ${result.diameterIn}-inch line at ${result.depthFt} ft bury (${result.hardFeet} ft under hard surface, ${result.lawnFeet} ft lawn)`,
    `- Surface: ${surface}; laterals: ${result.laterals}; cleanouts: ${result.cleanouts}; pits: ${result.pits}`,
    `- ${occupied}`,
    `- Method labor: ${result.hoursMethod.toFixed(1)} h; laterals / cleanouts: ${(result.hoursLaterals + result.hoursCleanouts).toFixed(1)} h; restore: ${result.hoursRestore.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm footage, depth, surface restoration, laterals, permits, and all pricing before sending. It is not a plumbing specification, a code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
