// Pure bid arithmetic for crawl space encapsulation.
// No network, no state: every floor foot, liner hour, dehumidifier,
// wage, and dump ticket is an input, so the result stays a
// transparent calculation the contractor can check against their own
// invoices rather than a claim about what any crawl "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$4 / sq ft encapsulation special" treats a dry, walkable 36-inch
// ranch with 6-mil liner-only (no wall liner, no dehumidifier) as the
// same job as an 18-inch wet belly crawl with 20-mil floor and wall
// liner, a sealed rim, a commercial dehumidifier, a dedicated circuit,
// and a debris clean-out. Homeowners (and a lot of estimator sheets)
// count the same kind of number. Access, water, and extras do not
// scale with that liner dump. Matching a cheap dry-hatch special on a
// wet encapsulate-and-dehumidifier job is how a sold crawl becomes a
// two-day loss after the first pump-out.
//
// Distinct from *basement waterproofing* (an interior perimeter drain
// in a finished basement, window wells, a sump pit — not a dirt crawl),
// *French drain* (a yard trench and an outlet), *sump-pump* (a pit and
// a discharge swap), *radon* (SSD pipes and a fan), *foundation
// repair* (helical or push piers as the job), *mold* (containment and
// clearance), *spray-foam* (board-foot insulation as the job), and
// *attic blown-in* (bags above a ceiling). This prices crawl space
// encapsulation: the liner, the access, and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'liner', label: 'Liner-only — 6-mil on dirt (the cheap special)' },
  { id: 'encapsulate', label: 'Sealed encapsulate — floor + wall liner' },
  { id: 'encapsulate-dehu', label: 'Encapsulate + commercial dehumidifier' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'hatch', label: 'Hatch / walkable — 36 in+ clearance' },
  { id: 'tight', label: 'Belly crawl — 18–24 in clearance' },
  { id: 'wet', label: 'Wet / standing water — pump-out first' },
]);

export const INSULATION_PRESETS = Object.freeze([
  { id: 'none', label: 'No insulation' },
  { id: 'belly', label: 'Faced belly batts in the joists' },
  { id: 'closed-cell', label: 'Closed-cell on the rim and stem (line item)' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Dry ranch, hatch, 6-mil liner-only (the cheap special)',
    lengthFt: 40,
    widthFt: 28,
    wallHeightIn: 24,
    scope: 'liner',
    access: 'hatch',
    insulation: 'none',
    travelMiles: 10,
    cleanoutYards: 0,
    supportPiers: 0,
    dedicatedCircuit: false,
    exteriorGrade: false,
  },
  {
    label: 'Typical encapsulate, hatch, belly batts, 70-pint dehu',
    lengthFt: 42,
    widthFt: 32,
    wallHeightIn: 36,
    scope: 'encapsulate-dehu',
    access: 'hatch',
    insulation: 'belly',
    travelMiles: 16,
    cleanoutYards: 0,
    supportPiers: 0,
    dedicatedCircuit: true,
    exteriorGrade: true,
  },
  {
    label: 'Wet tight crawl, 20-mil, 90-pint, rim foam, clean-out (where the special loses)',
    lengthFt: 36,
    widthFt: 24,
    wallHeightIn: 18,
    scope: 'encapsulate-dehu',
    access: 'wet',
    insulation: 'closed-cell',
    travelMiles: 22,
    cleanoutYards: 4,
    supportPiers: 6,
    dedicatedCircuit: true,
    exteriorGrade: true,
  },
  {
    label: 'Garage / addition crawl, hatch, sealed encapsulate, no dehu',
    lengthFt: 24,
    widthFt: 22,
    wallHeightIn: 30,
    scope: 'encapsulate',
    access: 'hatch',
    insulation: 'none',
    travelMiles: 8,
    cleanoutYards: 1,
    supportPiers: 0,
    dedicatedCircuit: false,
    exteriorGrade: false,
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
 * Dirt-floor area. Either dimension at zero is a zero-area crawl,
 * not a missing input — the contractor can still price rates
 * without a shape.
 */
export function floorAreaSqFt(lengthFt, widthFt) {
  return number(lengthFt, 'Length') * number(widthFt, 'Width');
}

/**
 * Stem-wall area from the perimeter and a height in inches.
 * Height of zero is a slab-on-grade edge, not a missing input.
 */
export function wallAreaSqFt(lengthFt, widthFt, wallHeightIn) {
  const perimeter = 2 * (number(lengthFt, 'Length') + number(widthFt, 'Width'));
  return perimeter * (number(wallHeightIn, 'Wall height') / 12);
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
 * Starting hours and liner invoices from how much of the crawl is
 * actually sealed. Liner-only is a dirt cover. Encapsulate is floor
 * plus walls plus a sealed rim. Encapsulate-plus-dehumidifier adds
 * the machine and a drain.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'liner') {
    return {
      hoursPerSqFtFloor: 0.018,
      hoursPerSqFtWall: 0,
      linerPerSqFt: 0.42,
      wallLinerPerSqFt: 0,
      hoursSeal: 0.4,
      dehuInvoice: 0,
      hoursDehu: 0,
      tapePerSqFt: 0.08,
    };
  }
  if (id === 'encapsulate') {
    return {
      hoursPerSqFtFloor: 0.028,
      hoursPerSqFtWall: 0.055,
      linerPerSqFt: 1.15,
      wallLinerPerSqFt: 0.95,
      hoursSeal: 2.6,
      dehuInvoice: 0,
      hoursDehu: 0,
      tapePerSqFt: 0.18,
    };
  }
  if (id === 'encapsulate-dehu') {
    return {
      hoursPerSqFtFloor: 0.028,
      hoursPerSqFtWall: 0.055,
      linerPerSqFt: 1.15,
      wallLinerPerSqFt: 0.95,
      hoursSeal: 3.1,
      dehuInvoice: 890,
      hoursDehu: 2.6,
      tapePerSqFt: 0.18,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Hatch is a walkable day. Tight is a belly crawl. Wet is a
 * pump-out plus mud.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'hatch') {
    return { hoursAccess: 0.8, accessPremiumPerSqFt: 0, pumpInvoice: 0, hoursPump: 0 };
  }
  if (id === 'tight') {
    return { hoursAccess: 3.4, accessPremiumPerSqFt: 0.012, pumpInvoice: 0, hoursPump: 0 };
  }
  if (id === 'wet') {
    return { hoursAccess: 5.8, accessPremiumPerSqFt: 0.018, pumpInvoice: 185, hoursPump: 2.4 };
  }
  throw new Error('Unknown access');
}

/**
 * Insulation is a line item on an encapsulate, not a spray-foam
 * or attic job. None is skip. Belly is faced batts. Closed-cell
 * is rim and stem only.
 */
export function suggestedInsulationKit(insulation) {
  const id = String(insulation);
  if (id === 'none') {
    return { hoursPerSqFtInsulation: 0, insulationPerSqFt: 0, hoursRimFoam: 0, rimFoamInvoice: 0 };
  }
  if (id === 'belly') {
    return { hoursPerSqFtInsulation: 0.022, insulationPerSqFt: 1.35, hoursRimFoam: 0, rimFoamInvoice: 0 };
  }
  if (id === 'closed-cell') {
    return { hoursPerSqFtInsulation: 0, insulationPerSqFt: 0, hoursRimFoam: 3.8, rimFoamInvoice: 620 };
  }
  throw new Error('Unknown insulation');
}

/**
 * Starting extras that do not live in a $4 / sq ft liner special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.5,
    hoursPerMile: 0.035,
    hoursPerYard: 0.9,
    hoursPerPier: 0.85,
    hoursCircuit: 2.8,
    hoursGrade: 2.2,
    siteHours: 1.4,
    dumpPerYard: 85,
    pierEach: 95,
    circuitInvoice: 285,
    gradeInvoice: 165,
    travelPerMile: 2.8,
  };
}

/**
 * Price a crawl space encapsulation from the liner, the access,
 * and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const access = requirePreset(ACCESS_PRESETS, input.access, 'access').id;
  const insulation = requirePreset(INSULATION_PRESETS, input.insulation, 'insulation').id;

  const lengthFt = number(input.lengthFt ?? 0, 'Length');
  const widthFt = number(input.widthFt ?? 0, 'Width');
  const wallHeightIn = number(input.wallHeightIn ?? 0, 'Wall height');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const cleanoutYards = number(input.cleanoutYards ?? 0, 'Clean-out yards');
  const supportPiers = number(input.supportPiers ?? 0, 'Support piers');
  const dedicatedCircuit = flag(input.dedicatedCircuit);
  const exteriorGrade = flag(input.exteriorGrade);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPerSqFtFloor = number(input.hoursPerSqFtFloor ?? 0, 'Floor hours per sq ft');
  const hoursPerSqFtWall = number(input.hoursPerSqFtWall ?? 0, 'Wall hours per sq ft');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Access hours');
  const hoursSeal = number(input.hoursSeal ?? 0, 'Seal hours');
  const hoursDehu = number(input.hoursDehu ?? 0, 'Dehumidifier hours');
  const hoursPump = number(input.hoursPump ?? 0, 'Pump hours');
  const hoursPerSqFtInsulation = number(input.hoursPerSqFtInsulation ?? 0, 'Insulation hours per sq ft');
  const hoursRimFoam = number(input.hoursRimFoam ?? 0, 'Rim-foam hours');
  const hoursPerYard = number(input.hoursPerYard ?? 0, 'Hours per clean-out yard');
  const hoursPerPier = number(input.hoursPerPier ?? 0, 'Hours per pier');
  const hoursCircuit = number(input.hoursCircuit ?? 0, 'Circuit hours');
  const hoursGrade = number(input.hoursGrade ?? 0, 'Grade hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const linerPerSqFt = number(input.linerPerSqFt ?? 0, 'Liner per sq ft');
  const wallLinerPerSqFt = number(input.wallLinerPerSqFt ?? 0, 'Wall liner per sq ft');
  const tapePerSqFt = number(input.tapePerSqFt ?? 0, 'Tape per sq ft');
  const accessPremiumPerSqFt = number(input.accessPremiumPerSqFt ?? 0, 'Access premium per sq ft');
  const insulationPerSqFt = number(input.insulationPerSqFt ?? 0, 'Insulation per sq ft');
  const dehuInvoice = number(input.dehuInvoice ?? 0, 'Dehumidifier invoice');
  const pumpInvoice = number(input.pumpInvoice ?? 0, 'Pump invoice');
  const rimFoamInvoice = number(input.rimFoamInvoice ?? 0, 'Rim-foam invoice');
  const dumpPerYard = number(input.dumpPerYard ?? 0, 'Dump per yard');
  const pierEach = number(input.pierEach ?? 0, 'Pier each');
  const circuitInvoice = number(input.circuitInvoice ?? 0, 'Circuit invoice');
  const gradeInvoice = number(input.gradeInvoice ?? 0, 'Grade invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const floorSqFt = floorAreaSqFt(lengthFt, widthFt);
  const wallsSqFt = wallAreaSqFt(lengthFt, widthFt, wallHeightIn);
  const linerSqFt = floorSqFt + (scope === 'liner' ? 0 : wallsSqFt);

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursFloor = floorSqFt * hoursPerSqFtFloor;
  const hoursWall = wallsSqFt * hoursPerSqFtWall;
  const hoursAccessPremium = floorSqFt * accessPremiumPerSqFt;
  const hoursInsulation = floorSqFt * hoursPerSqFtInsulation;
  const hoursCleanout = cleanoutYards * hoursPerYard;
  const hoursPiers = supportPiers * hoursPerPier;
  const hoursCircuitApplied = dedicatedCircuit ? hoursCircuit : 0;
  const hoursGradeApplied = exteriorGrade ? hoursGrade : 0;
  const totalHours = hoursTravel + hoursFloor + hoursWall + hoursAccess
    + hoursAccessPremium + hoursSeal + hoursDehu + hoursPump
    + hoursInsulation + hoursRimFoam + hoursCleanout + hoursPiers
    + hoursCircuitApplied + hoursGradeApplied + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const floorLinerMaterial = floorSqFt * (linerPerSqFt + tapePerSqFt);
  const wallLinerMaterial = wallsSqFt * wallLinerPerSqFt;
  const insulationMaterial = floorSqFt * insulationPerSqFt;
  const cleanoutMaterial = cleanoutYards * dumpPerYard;
  const pierMaterial = supportPiers * pierEach;
  const circuitMaterial = dedicatedCircuit ? circuitInvoice : 0;
  const gradeMaterial = exteriorGrade ? gradeInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const extraHardware = dehuInvoice + pumpInvoice + rimFoamInvoice
    + cleanoutMaterial + pierMaterial + circuitMaterial + gradeMaterial
    + travelInvoice;
  const materialCost = floorLinerMaterial + wallLinerMaterial
    + insulationMaterial + extraHardware;

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
  const extraCost = extraHardware;

  return {
    scope,
    access,
    insulation,
    lengthFt,
    widthFt,
    wallHeightIn,
    travelMiles,
    cleanoutYards,
    supportPiers,
    dedicatedCircuit,
    exteriorGrade,
    floorSqFt,
    wallsSqFt,
    linerSqFt,
    loadedWage,
    hoursTravel,
    hoursFloor,
    hoursWall,
    hoursAccess,
    hoursAccessPremium,
    hoursSeal,
    hoursDehu,
    hoursPump,
    hoursInsulation,
    hoursRimFoam,
    hoursCleanout,
    hoursPiers,
    hoursCircuit: hoursCircuitApplied,
    hoursGrade: hoursGradeApplied,
    siteHours,
    totalHours,
    laborCost,
    floorLinerMaterial,
    wallLinerMaterial,
    insulationMaterial,
    dehuInvoice,
    pumpInvoice,
    rimFoamInvoice,
    cleanoutMaterial,
    pierMaterial,
    circuitMaterial,
    gradeMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: floorSqFt === 0 ? null : price / floorSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      liner: costShare(floorLinerMaterial + wallLinerMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      floor: hourShare(hoursFloor),
      wall: hourShare(hoursWall),
      access: hourShare(hoursAccess + hoursAccessPremium),
      seal: hourShare(hoursSeal),
      dehu: hourShare(hoursDehu),
      pump: hourShare(hoursPump),
      insulation: hourShare(hoursInsulation + hoursRimFoam),
      cleanout: hourShare(hoursCleanout),
      piers: hourShare(hoursPiers),
      circuit: hourShare(hoursCircuitApplied),
      grade: hourShare(hoursGradeApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: floorSqFt === 0 ? null : proposedPrice / floorSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same floor three ways — liner-only, sealed encapsulate,
 * encapsulate-plus-dehumidifier — from the suggested scope kits so
 * the contractor can see when a sealed crawl flips the cheap $4 /
 * sq ft special. User-typed scope rates are not reused here: the
 * comparison is apples-to-apples on the starting figures. Access
 * and insulation kits stay with the current job.
 */
export function compareScope(input) {
  const accessKit = suggestedAccessKit(String(input.access ?? 'hatch'));
  const insulationKit = suggestedInsulationKit(String(input.insulation ?? 'none'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...accessKit,
      ...insulationKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursWall: bid.hoursWall,
      dehuInvoice: bid.dehuInvoice,
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
 * Format a bid as a plain-text draft the contractor can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Crawl space encapsulation') {
  const perFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const insulation = INSULATION_PRESETS.find((item) => item.id === result.insulation)?.label ?? result.insulation;
  const extras = [
    `${result.travelMiles} travel miles`,
    access,
    insulation,
    `${result.cleanoutYards} yd clean-out`,
    `${result.supportPiers} support pier${result.supportPiers === 1 ? '' : 's'}`,
    result.dedicatedCircuit ? 'dedicated dehumidifier circuit included' : 'no dedicated circuit',
    result.exteriorGrade ? 'exterior grade / downspout work included' : 'no exterior grade work',
  ].join('; ');
  return [
    'CRAWL SPACE ENCAPSULATION BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per square foot of dirt floor: ${perFt}`,
    `Floor: ${result.floorSqFt.toLocaleString('en-US')} sq ft; stem wall: ${result.wallsSqFt.toFixed(0)} sq ft`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.lengthFt} ft × ${result.widthFt} ft dirt floor (${result.floorSqFt.toLocaleString('en-US')} sq ft)`,
    `- Stem wall ${result.wallHeightIn} in; liner coverage ${result.linerSqFt.toFixed(0)} sq ft`,
    `- ${scope}; ${access}; ${insulation}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; floor: ${result.hoursFloor.toFixed(1)} h; wall: ${result.hoursWall.toFixed(1)} h; extras: ${(result.hoursCleanout + result.hoursPiers + result.hoursCircuit + result.hoursGrade + result.hoursDehu + result.hoursPump).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm floor area, scope, access, insulation, extras, and all pricing before sending. It is not a waterproofing specification, an engineered stamp, a radon or mold clearance, a building-code determination, or a moisture-control guarantee.',
  ].join('\n');
}
