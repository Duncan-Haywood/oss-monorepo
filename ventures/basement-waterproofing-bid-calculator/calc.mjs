// Pure bid arithmetic for basement waterproofing and crawl-space
// encapsulation. No network, no state: every lineal foot, well, crack,
// sump, and wage is an input, so the result stays a transparent
// calculation the contractor can check against their own invoices rather
// than a claim about what any basement "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "price per lineal foot of interior drain" quote treats an 80 lf
// finished basement with an existing sump as the same job as a 55 lf
// seepage house with four window wells, a new pit, a battery backup,
// and 60 feet of freeze-protected discharge. Homeowners (and a lot of
// estimator sheets) measure the same kind of number. Wells, pits,
// backups, and discharge do not scale with that footage. Matching a
// cheaper per-foot quote written for the brochure job is how a sold
// seepage house becomes a two-day loss after the first well.
//
// Distinct from gutter (eaves and downspouts), retaining-wall
// (height, geogrid, drainage behind a wall you are building), and
// irrigation winterization (blowout and backflow). This prices keeping
// groundwater *out* of a basement or crawl — interior drain tile,
// exterior excavation, wall membrane, window wells, sump, and
// discharge.

export const SYSTEM_PRESETS = Object.freeze([
  {
    id: 'interior_drain',
    label: 'Interior French drain + wall membrane',
    hoursPerDrainLf: 0.55,
    hoursPerExteriorLf: 0,
    hoursPer100Wall: 1.4,
    hoursPer100Floor: 0,
    drainCostPerLf: 18,
    exteriorCostPerLf: 0,
    membraneCostPerSqFt: 2.4,
    vaporCostPerSqFt: 0,
    pourbackCostPerLf: 12,
    disposalPerLf: 8,
  },
  {
    id: 'exterior_excavate',
    label: 'Exterior excavation + foundation membrane',
    hoursPerDrainLf: 0,
    hoursPerExteriorLf: 1.85,
    hoursPer100Wall: 1.8,
    hoursPer100Floor: 0,
    drainCostPerLf: 0,
    exteriorCostPerLf: 42,
    membraneCostPerSqFt: 0,
    vaporCostPerSqFt: 0,
    pourbackCostPerLf: 0,
    disposalPerLf: 22,
  },
  {
    id: 'crawl_encapsulate',
    label: 'Crawl-space encapsulation',
    hoursPerDrainLf: 0,
    hoursPerExteriorLf: 0,
    hoursPer100Wall: 1.6,
    hoursPer100Floor: 2.2,
    drainCostPerLf: 0,
    exteriorCostPerLf: 0,
    membraneCostPerSqFt: 1.8,
    vaporCostPerSqFt: 1.1,
    pourbackCostPerLf: 0,
    disposalPerLf: 0,
  },
]);

export const PUMP_PRESETS = Object.freeze([
  { id: 'none', label: 'No pump this trip', hours: 0, cost: 0 },
  { id: 'third', label: '1/3 HP primary', hours: 1.2, cost: 280 },
  { id: 'half', label: '1/2 HP primary', hours: 1.4, cost: 380 },
  { id: 'three_quarter', label: '3/4 HP primary', hours: 1.6, cost: 520 },
]);

export const BACKUP_PRESETS = Object.freeze([
  { id: 'none', label: 'No backup', hours: 0, cost: 0 },
  { id: 'battery', label: 'Battery backup', hours: 1.5, cost: 480 },
  { id: 'water_powered', label: 'Water-powered backup', hours: 2, cost: 620 },
  { id: 'dual', label: 'Battery + water-powered', hours: 2.8, cost: 980 },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '80 lf finished basement, existing sump (the brochure job)',
    systemId: 'interior_drain',
    perimeterLf: 80,
    wallHeightFt: 7.5,
    floorSqFt: 600,
    windowWells: 0,
    floorCrackLf: 0,
    wallCrackCount: 0,
    newSumpPit: false,
    pumpId: 'third',
    backupId: 'none',
    dischargeLf: 20,
    freezeDischarge: false,
    includeDehumidifier: false,
  },
  {
    label: '120 lf seepage house: new pit, battery, 3 wells, freeze discharge',
    systemId: 'interior_drain',
    perimeterLf: 120,
    wallHeightFt: 8,
    floorSqFt: 900,
    windowWells: 3,
    floorCrackLf: 20,
    wallCrackCount: 2,
    newSumpPit: true,
    pumpId: 'half',
    backupId: 'battery',
    dischargeLf: 45,
    freezeDischarge: true,
    includeDehumidifier: false,
  },
  {
    label: '100 lf exterior excavation (the yard-destroyer)',
    systemId: 'exterior_excavate',
    perimeterLf: 100,
    wallHeightFt: 8,
    floorSqFt: 750,
    windowWells: 0,
    floorCrackLf: 0,
    wallCrackCount: 0,
    newSumpPit: false,
    pumpId: 'half',
    backupId: 'none',
    dischargeLf: 30,
    freezeDischarge: false,
    includeDehumidifier: false,
  },
  {
    label: '800 sq ft crawl encapsulate + dehumidifier + mini-sump',
    systemId: 'crawl_encapsulate',
    perimeterLf: 90,
    wallHeightFt: 4,
    floorSqFt: 800,
    windowWells: 0,
    floorCrackLf: 0,
    wallCrackCount: 0,
    newSumpPit: true,
    pumpId: 'third',
    backupId: 'battery',
    dischargeLf: 25,
    freezeDischarge: false,
    includeDehumidifier: true,
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

export function suggestedSystem(systemId) {
  const preset = SYSTEM_PRESETS.find((item) => item.id === systemId);
  if (!preset) throw new Error('Unknown waterproofing system');
  return {
    hoursPerDrainLf: preset.hoursPerDrainLf,
    hoursPerExteriorLf: preset.hoursPerExteriorLf,
    hoursPer100Wall: preset.hoursPer100Wall,
    hoursPer100Floor: preset.hoursPer100Floor,
    drainCostPerLf: preset.drainCostPerLf,
    exteriorCostPerLf: preset.exteriorCostPerLf,
    membraneCostPerSqFt: preset.membraneCostPerSqFt,
    vaporCostPerSqFt: preset.vaporCostPerSqFt,
    pourbackCostPerLf: preset.pourbackCostPerLf,
    disposalPerLf: preset.disposalPerLf,
  };
}

export function suggestedPump(pumpId) {
  const preset = PUMP_PRESETS.find((item) => item.id === pumpId);
  if (!preset) throw new Error('Unknown sump pump');
  return { hours: preset.hours, cost: preset.cost };
}

export function suggestedBackup(backupId) {
  const preset = BACKUP_PRESETS.find((item) => item.id === backupId);
  if (!preset) throw new Error('Unknown backup pump');
  return { hours: preset.hours, cost: preset.cost };
}

export function wallAreaSqFt(perimeterLf, wallHeightFt) {
  return number(perimeterLf, 'Perimeter') * number(wallHeightFt, 'Wall height');
}

/**
 * Price a basement waterproofing or crawl encapsulation job from
 * perimeter, wall height, wells, cracks, sump, discharge, and the
 * contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const perimeterLf = number(input.perimeterLf ?? 0, 'Perimeter');
  const wallHeightFt = number(input.wallHeightFt ?? 0, 'Wall height');
  const floorSqFt = number(input.floorSqFt ?? 0, 'Floor area');
  if (perimeterLf + floorSqFt === 0) {
    throw new Error('Add perimeter lineal feet or floor area to price');
  }

  const windowWells = number(input.windowWells ?? 0, 'Window wells');
  const floorCrackLf = number(input.floorCrackLf ?? 0, 'Floor crack lineal feet');
  const wallCrackCount = number(input.wallCrackCount ?? 0, 'Wall crack count');
  const newSumpPit = flag(input.newSumpPit);
  const dischargeLf = number(input.dischargeLf ?? 0, 'Discharge run');
  const freezeDischarge = flag(input.freezeDischarge);
  const includeDehumidifier = flag(input.includeDehumidifier);

  const hoursPerDrainLf = number(input.hoursPerDrainLf ?? 0, 'Hours per interior drain foot');
  const hoursPerExteriorLf = number(input.hoursPerExteriorLf ?? 0, 'Hours per exterior foot');
  const hoursPer100Wall = number(input.hoursPer100Wall ?? 0, 'Hours per 100 sq ft of wall');
  const hoursPer100Floor = number(input.hoursPer100Floor ?? 0, 'Hours per 100 sq ft of floor');
  const hoursPerWell = number(input.hoursPerWell ?? 0, 'Hours per window well');
  const hoursPerFloorCrackLf = number(input.hoursPerFloorCrackLf ?? 0, 'Hours per floor-crack foot');
  const hoursPerWallCrack = number(input.hoursPerWallCrack ?? 0, 'Hours per wall crack');
  const hoursPerNewSump = number(input.hoursPerNewSump ?? 0, 'Hours for a new sump pit');
  const hoursPerExistingSump = number(input.hoursPerExistingSump ?? 0, 'Hours on an existing pit');
  const hoursPerDischargeLf = number(input.hoursPerDischargeLf ?? 0, 'Hours per discharge foot');
  const hoursPerFreezeKit = number(input.hoursPerFreezeKit ?? 0, 'Hours for freeze-proof discharge');
  const hoursPerPump = number(input.hoursPerPump ?? 0, 'Hours to set the primary pump');
  const hoursPerBackup = number(input.hoursPerBackup ?? 0, 'Hours to set the backup');
  const hoursPerDehumidifier = number(input.hoursPerDehumidifier ?? 0, 'Hours to set a dehumidifier');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const drainCostPerLf = number(input.drainCostPerLf ?? 0, 'Interior drain cost per foot');
  const exteriorCostPerLf = number(input.exteriorCostPerLf ?? 0, 'Exterior system cost per foot');
  const membraneCostPerSqFt = number(input.membraneCostPerSqFt ?? 0, 'Wall membrane cost per sq ft');
  const vaporCostPerSqFt = number(input.vaporCostPerSqFt ?? 0, 'Floor vapor cost per sq ft');
  const pourbackCostPerLf = number(input.pourbackCostPerLf ?? 0, 'Concrete pour-back per foot');
  const disposalPerLf = number(input.disposalPerLf ?? 0, 'Spoil and haul-off per foot');
  const wellCoverCost = number(input.wellCoverCost ?? 0, 'Window-well cover and drain');
  const floorCrackCostPerLf = number(input.floorCrackCostPerLf ?? 0, 'Floor-crack material per foot');
  const wallCrackCost = number(input.wallCrackCost ?? 0, 'Wall-crack injection each');
  const pitLinerCost = number(input.pitLinerCost ?? 0, 'New pit liner');
  const pumpCost = number(input.pumpCost ?? 0, 'Primary pump');
  const backupCost = number(input.backupCost ?? 0, 'Backup pump');
  const dischargeCostPerLf = number(input.dischargeCostPerLf ?? 0, 'Discharge pipe per foot');
  const freezeKitCost = number(input.freezeKitCost ?? 0, 'Freeze-proof discharge kit');
  const dehumidifierCost = number(input.dehumidifierCost ?? 0, 'Dehumidifier');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const wallArea = wallAreaSqFt(perimeterLf, wallHeightFt);
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  // Drain, excavation, membrane, wells, cracks, pit, discharge, and
  // backups stay their own hours so a cheap per-lineal-foot quote
  // cannot hide which part of a high number is a new pit or a well.
  const drainHours = perimeterLf * hoursPerDrainLf;
  const exteriorHours = perimeterLf * hoursPerExteriorLf;
  const wallHours = (wallArea / 100) * hoursPer100Wall;
  const floorHours = (floorSqFt / 100) * hoursPer100Floor;
  const wellHours = windowWells * hoursPerWell;
  const floorCrackHours = floorCrackLf * hoursPerFloorCrackLf;
  const wallCrackHours = wallCrackCount * hoursPerWallCrack;
  const sumpHours = newSumpPit ? hoursPerNewSump : (hoursPerPump > 0 ? hoursPerExistingSump : 0);
  const dischargeHours = dischargeLf * hoursPerDischargeLf + (freezeDischarge ? hoursPerFreezeKit : 0);
  const pumpHours = hoursPerPump;
  const backupHours = hoursPerBackup;
  const dehumidifierHours = includeDehumidifier ? hoursPerDehumidifier : 0;
  const crackHours = floorCrackHours + wallCrackHours;
  const mechanicalHours = sumpHours + pumpHours + backupHours + dehumidifierHours;
  const totalHours = drainHours + exteriorHours + wallHours + floorHours + wellHours
    + crackHours + mechanicalHours + dischargeHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const drainMaterial = perimeterLf * drainCostPerLf;
  const exteriorMaterial = perimeterLf * exteriorCostPerLf;
  const wallMaterial = wallArea * membraneCostPerSqFt;
  const floorMaterial = floorSqFt * vaporCostPerSqFt;
  const pourback = perimeterLf * pourbackCostPerLf;
  const disposal = perimeterLf * disposalPerLf;
  const wellMaterial = windowWells * wellCoverCost;
  const crackMaterial = floorCrackLf * floorCrackCostPerLf + wallCrackCount * wallCrackCost;
  const pitMaterial = newSumpPit ? pitLinerCost : 0;
  const pumpMaterial = pumpCost;
  const backupMaterial = backupCost;
  const dischargeMaterial = dischargeLf * dischargeCostPerLf + (freezeDischarge ? freezeKitCost : 0);
  const dehumidifierMaterial = includeDehumidifier ? dehumidifierCost : 0;
  const materialCost = drainMaterial + exteriorMaterial + wallMaterial + floorMaterial
    + pourback + disposal + wellMaterial + crackMaterial + pitMaterial
    + pumpMaterial + backupMaterial + dischargeMaterial + dehumidifierMaterial;
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
    perimeterLf,
    wallHeightFt,
    floorSqFt,
    wallArea,
    windowWells,
    floorCrackLf,
    wallCrackCount,
    newSumpPit,
    freezeDischarge,
    includeDehumidifier,
    loadedWage,
    drainHours,
    exteriorHours,
    wallHours,
    floorHours,
    wellHours,
    floorCrackHours,
    wallCrackHours,
    crackHours,
    sumpHours,
    dischargeHours,
    pumpHours,
    backupHours,
    dehumidifierHours,
    mechanicalHours,
    siteHours,
    totalHours,
    laborCost,
    drainMaterial,
    exteriorMaterial,
    wallMaterial,
    floorMaterial,
    pourback,
    disposal,
    wellMaterial,
    crackMaterial,
    pitMaterial,
    pumpMaterial,
    backupMaterial,
    dischargeMaterial,
    dehumidifierMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerLf: perimeterLf === 0 ? null : price / perimeterLf,
    costPerLf: perimeterLf === 0 ? null : totalCost / perimeterLf,
    pricePerSqFt: floorSqFt === 0 ? null : price / floorSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      drain: hourShare(drainHours + exteriorHours),
      walls: hourShare(wallHours + floorHours),
      wells: hourShare(wellHours),
      cracks: hourShare(crackHours),
      mechanical: hourShare(mechanicalHours + dischargeHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perLf: perimeterLf === 0 ? null : proposedPrice / perimeterLf,
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
export function formatBidSummary(result, systemLabel = 'Waterproofing system') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perLf = result.pricePerLf === null
    ? 'n/a (floor-only takeoff)'
    : `${money(result.pricePerLf)} / lf of perimeter`;
  const pit = result.newSumpPit ? 'new sump pit' : 'existing pit';
  const freeze = result.freezeDischarge ? 'with freeze-proof discharge' : 'without freeze-proof discharge';
  const dehumidifier = result.includeDehumidifier ? 'dehumidifier included' : 'no dehumidifier';
  return [
    'BASEMENT WATERPROOFING BID',
    '',
    `Proposed waterproofing price: ${money(result.price)}`,
    `Scope: ${systemLabel}; ${result.perimeterLf.toLocaleString('en-US')} lf perimeter, ${result.wallHeightFt} ft walls, ${result.windowWells} window well${result.windowWells === 1 ? '' : 's'}, ${pit}`,
    `Price per lineal foot of perimeter: ${perLf}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Perimeter: ${result.perimeterLf.toLocaleString('en-US')} lf`,
    `- Wall membrane area: ${result.wallArea.toFixed(0)} sq ft`,
    `- Floor / crawl area: ${result.floorSqFt.toLocaleString('en-US')} sq ft`,
    `- Window wells: ${result.windowWells}`,
    `- Floor cracks: ${result.floorCrackLf} lf; wall crack injections: ${result.wallCrackCount}`,
    `- Sump: ${pit}; discharge ${freeze}`,
    `- ${dehumidifier}`,
    `- Mechanical and discharge labor: ${result.mechanicalHours.toFixed(1)} h + ${result.dischargeHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm measurements, water-entry points, discharge path, pump sizing, permits, and all pricing before sending. It is not an engineering specification, a dry-basement warranty, or a guarantee of hydrostatic performance.',
  ].join('\n');
}
