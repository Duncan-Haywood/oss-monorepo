// Pure bid arithmetic for artificial turf / synthetic grass installs:
// landscape turf, pet turf, and putting-green / sports turf. No network,
// no state: every square foot, waste factor, base depth, sod demo, infill,
// seam, and wage is an input, so the result stays a transparent calculation
// the shop can check against their own rolls and quarry tickets rather than
// a claim about what any yard "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$8 a square foot installed" or a brochure landscape special treats
// 600 sq ft of landscape turf on a prepared pad as the same job as 800 sq ft
// of pet turf with sod demo, a 4-inch crushed-rock base, zeolite infill, and
// two tree wells. Homeowners (and a lot of estimator sheets) count the same
// kind of number. Turf you buy is larger than the lawn because rolls are
// 15 feet wide. Base tons scale with depth. Infill, seams, nails, and
// drainage do not live in a per-foot special. Matching a cheap landscape
// special on a pet yard is how a sold turf job becomes a two-day loss after
// the first seam fails and the odor call comes back.
//
// Distinct from lawn-care *mowing* (a recurring stop on living grass) and
// from paver / concrete patio pours (hardscape). This prices *placing
// synthetic turf* — landscape, pet, or putting — and putting the base and
// seams in.

export const CRUSHED_LB_PER_CF = 100;
export const SOD_LB_PER_CF = 75;
export const INFILL_LB_PER_BAG = 50;

export const TURF_PRESETS = Object.freeze([
  { id: 'landscape', label: 'Landscape turf' },
  { id: 'pet', label: 'Pet / play turf' },
  { id: 'putting', label: 'Putting green / sports' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '600 sq ft landscape, 3 in base, sod demo (the cheap special)',
    turfType: 'landscape',
    lawnSqFt: 600,
    wastePercent: 10,
    baseDepthIn: 3,
    sodDemo: true,
    geotextile: true,
    perimeterLf: 100,
    seamLf: 40,
    treeWells: 0,
  },
  {
    label: '800 sq ft pet turf, 4 in base, 2 tree wells (where landscape loses)',
    turfType: 'pet',
    lawnSqFt: 800,
    wastePercent: 12,
    baseDepthIn: 4,
    sodDemo: true,
    geotextile: true,
    perimeterLf: 120,
    seamLf: 55,
    treeWells: 2,
  },
  {
    label: '400 sq ft putting green on a prepared pad, extra seams',
    turfType: 'putting',
    lawnSqFt: 400,
    wastePercent: 15,
    baseDepthIn: 4.5,
    sodDemo: false,
    geotextile: true,
    perimeterLf: 80,
    seamLf: 80,
    treeWells: 0,
  },
  {
    label: '1,200 sq ft landscape, 10% waste, no sod (new pad)',
    turfType: 'landscape',
    lawnSqFt: 1200,
    wastePercent: 10,
    baseDepthIn: 3,
    sodDemo: false,
    geotextile: true,
    perimeterLf: 150,
    seamLf: 80,
    treeWells: 1,
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
 * Turf you have to buy: the lawn plus the waste from 15-foot rolls and
 * cuts. A 10% waste factor on 600 sq ft is 60 sq ft of turf that never
 * shows up on the "$8 a square foot" special.
 */
export function turfBuySqFt(lawnSqFt, wastePercent) {
  const area = number(lawnSqFt, 'Lawn square feet', { allowZero: false });
  const waste = number(wastePercent, 'Waste percent');
  return area * (1 + waste / 100);
}

/**
 * Compacted crushed-rock tons from area and base depth.
 */
export function baseTons(squareFeet, depthIn, poundsPerCf = CRUSHED_LB_PER_CF) {
  const area = number(squareFeet, 'Lawn square feet');
  const inches = number(depthIn, 'Base depth');
  const density = number(poundsPerCf, 'Crushed-rock density', { allowZero: false });
  return area * (inches / 12) * density / 2000;
}

/**
 * Sod / existing-lawn dump tons from area and strip depth.
 */
export function sodTons(squareFeet, depthIn, poundsPerCf = SOD_LB_PER_CF) {
  const area = number(squareFeet, 'Sod square feet');
  const inches = number(depthIn, 'Sod depth');
  const density = number(poundsPerCf, 'Sod density', { allowZero: false });
  return area * (inches / 12) * density / 2000;
}

/**
 * Starting hours and material rates from the turf type. These are ballpark
 * shop figures, not a catalog. Picking a type never overwrites a rate the
 * shop has already typed.
 */
export function suggestedTurfKit(turfType) {
  const id = String(turfType);
  if (id === 'landscape') {
    return {
      hoursPerSqFtDemo: 0.006,
      hoursPerSqFtBase: 0.007,
      hoursPerSqFtInstall: 0.011,
      hoursPerSqFtInfill: 0.0035,
      hoursPerLfSeam: 0.07,
      hoursPerWell: 0.45,
      hoursPerSqFtDrain: 0,
      turfPerSqFt: 2.15,
      infillPerSqFt: 0.32,
      infillLbsPerSqFt: 1.5,
      drainagePerSqFt: 0,
      geotextilePerSqFt: 0.18,
      gravelPerTon: 32,
      dumpPerTon: 18,
      seamPerLf: 1.75,
      nailEach: 0.11,
      nailsPerLf: 3,
    };
  }
  if (id === 'pet') {
    return {
      hoursPerSqFtDemo: 0.006,
      hoursPerSqFtBase: 0.0085,
      hoursPerSqFtInstall: 0.013,
      hoursPerSqFtInfill: 0.0045,
      hoursPerLfSeam: 0.08,
      hoursPerWell: 0.5,
      hoursPerSqFtDrain: 0.0025,
      turfPerSqFt: 3.4,
      infillPerSqFt: 0.88,
      infillLbsPerSqFt: 2.4,
      drainagePerSqFt: 0.48,
      geotextilePerSqFt: 0.22,
      gravelPerTon: 32,
      dumpPerTon: 18,
      seamPerLf: 1.9,
      nailEach: 0.11,
      nailsPerLf: 3.5,
    };
  }
  if (id === 'putting') {
    return {
      hoursPerSqFtDemo: 0.006,
      hoursPerSqFtBase: 0.01,
      hoursPerSqFtInstall: 0.018,
      hoursPerSqFtInfill: 0.005,
      hoursPerLfSeam: 0.12,
      hoursPerWell: 0.55,
      hoursPerSqFtDrain: 0,
      turfPerSqFt: 4.75,
      infillPerSqFt: 0.58,
      infillLbsPerSqFt: 3.2,
      drainagePerSqFt: 0,
      geotextilePerSqFt: 0.2,
      gravelPerTon: 32,
      dumpPerTon: 18,
      seamPerLf: 2.4,
      nailEach: 0.11,
      nailsPerLf: 4,
    };
  }
  throw new Error('Unknown turf type');
}

/**
 * Price a landscape, pet, or putting-green turf job from lawn area, waste,
 * base depth, sod demo, seams, perimeter, tree wells, and the contractor's
 * own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const lawnSqFt = number(input.lawnSqFt ?? 0, 'Lawn square feet', { allowZero: false });
  const wastePercent = number(input.wastePercent ?? 10, 'Waste percent');
  const baseDepthIn = number(input.baseDepthIn ?? 3, 'Base depth', { allowZero: false });
  const sodDepthIn = number(input.sodDepthIn ?? 2, 'Sod depth');
  const crushedLbPerCf = number(input.crushedLbPerCf ?? CRUSHED_LB_PER_CF, 'Crushed-rock density', { allowZero: false });
  const sodLbPerCf = number(input.sodLbPerCf ?? SOD_LB_PER_CF, 'Sod density', { allowZero: false });
  const perimeterLf = number(input.perimeterLf ?? 0, 'Perimeter lineal feet');
  const seamLf = number(input.seamLf ?? 0, 'Seam lineal feet');
  const treeWells = number(input.treeWells ?? 0, 'Tree wells');

  const turfType = String(input.turfType ?? 'landscape');
  if (!TURF_PRESETS.some((item) => item.id === turfType)) {
    throw new Error('Unknown turf type');
  }
  const sodDemo = flag(input.sodDemo);
  const geotextile = flag(input.geotextile);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / move-in');
  const hoursPerSqFtDemo = number(input.hoursPerSqFtDemo ?? 0, 'Hours per sq ft to demo sod');
  const hoursPerSqFtBase = number(input.hoursPerSqFtBase ?? 0, 'Hours per sq ft of base');
  const hoursPerSqFtInstall = number(input.hoursPerSqFtInstall ?? 0, 'Hours per sq ft to install turf');
  const hoursPerSqFtInfill = number(input.hoursPerSqFtInfill ?? 0, 'Hours per sq ft to infill');
  const hoursPerLfSeam = number(input.hoursPerLfSeam ?? 0, 'Hours per lineal foot of seam');
  const hoursPerWell = number(input.hoursPerWell ?? 0, 'Hours per tree well');
  const hoursPerSqFtDrain = number(input.hoursPerSqFtDrain ?? 0, 'Hours per sq ft of drainage');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const turfPerSqFt = number(input.turfPerSqFt ?? 0, 'Turf cost per square foot');
  const infillPerSqFt = number(input.infillPerSqFt ?? 0, 'Infill cost per square foot');
  const infillLbsPerSqFt = number(input.infillLbsPerSqFt ?? 0, 'Infill pounds per square foot');
  const drainagePerSqFt = number(input.drainagePerSqFt ?? 0, 'Drainage per square foot');
  const geotextilePerSqFt = number(input.geotextilePerSqFt ?? 0, 'Geotextile per square foot');
  const gravelPerTon = number(input.gravelPerTon ?? 0, 'Gravel cost per ton');
  const dumpPerTon = number(input.dumpPerTon ?? 0, 'Sod dump per ton');
  const seamPerLf = number(input.seamPerLf ?? 0, 'Seam tape per lineal foot');
  const nailEach = number(input.nailEach ?? 0, 'Nail cost each');
  const nailsPerLf = number(input.nailsPerLf ?? 0, 'Nails per lineal foot');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const buySqFt = turfBuySqFt(lawnSqFt, wastePercent);
  const wasteSqFt = buySqFt - lawnSqFt;
  const crushedTons = baseTons(lawnSqFt, baseDepthIn, crushedLbPerCf);
  const demoTons = sodDemo ? sodTons(lawnSqFt, sodDepthIn, sodLbPerCf) : 0;
  const infillLbs = lawnSqFt * infillLbsPerSqFt;
  const infillBags = infillLbs === 0 ? 0 : Math.ceil(infillLbs / INFILL_LB_PER_BAG);
  const nailCount = perimeterLf * nailsPerLf;

  const hoursDemo = sodDemo ? lawnSqFt * hoursPerSqFtDemo : 0;
  const hoursBase = lawnSqFt * hoursPerSqFtBase;
  const hoursInstall = buySqFt * hoursPerSqFtInstall;
  const hoursInfill = lawnSqFt * hoursPerSqFtInfill;
  const hoursSeam = seamLf * hoursPerLfSeam;
  const hoursWells = treeWells * hoursPerWell;
  const hoursDrain = turfType === 'pet' ? lawnSqFt * hoursPerSqFtDrain : 0;
  const hoursMethod = hoursDemo + hoursBase + hoursInstall + hoursInfill + hoursSeam + hoursWells + hoursDrain;
  const totalHours = hoursTrip + hoursMethod + siteHours;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const turfMaterial = buySqFt * turfPerSqFt;
  const baseMaterial = crushedTons * gravelPerTon;
  const sodDump = demoTons * dumpPerTon;
  const infillMaterial = lawnSqFt * infillPerSqFt;
  const drainMaterial = turfType === 'pet' ? lawnSqFt * drainagePerSqFt : 0;
  const fabricMaterial = geotextile ? lawnSqFt * geotextilePerSqFt : 0;
  const seamMaterial = seamLf * seamPerLf;
  const nailMaterial = nailCount * nailEach;
  const permitMaterial = permitFee;
  const extraMaterial = sodDump + drainMaterial + fabricMaterial + seamMaterial + nailMaterial + permitMaterial;
  const materialCost = turfMaterial + baseMaterial + infillMaterial + extraMaterial;
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
  const extraCost = extraMaterial + baseMaterial + infillMaterial
    + (hoursDemo + hoursBase + hoursInfill + hoursSeam + hoursWells + hoursDrain) * loadedWage;

  return {
    turfType,
    lawnSqFt,
    wastePercent,
    wasteSqFt,
    buySqFt,
    baseDepthIn,
    sodDepthIn,
    sodDemo,
    geotextile,
    perimeterLf,
    seamLf,
    treeWells,
    crushedTons,
    demoTons,
    infillLbs,
    infillBags,
    nailCount,
    loadedWage,
    hoursTrip,
    hoursDemo,
    hoursBase,
    hoursInstall,
    hoursInfill,
    hoursSeam,
    hoursWells,
    hoursDrain,
    hoursMethod,
    siteHours,
    totalHours,
    laborCost,
    turfMaterial,
    baseMaterial,
    sodDump,
    infillMaterial,
    drainMaterial,
    fabricMaterial,
    seamMaterial,
    nailMaterial,
    permitMaterial,
    extraMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    extraCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: lawnSqFt === 0 ? null : price / lawnSqFt,
    pricePerBuySqFt: buySqFt === 0 ? null : price / buySqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      turf: costShare(turfMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(hoursTrip),
      demo: hourShare(hoursDemo),
      base: hourShare(hoursBase),
      install: hourShare(hoursInstall),
      infill: hourShare(hoursInfill),
      seam: hourShare(hoursSeam + hoursWells),
      drain: hourShare(hoursDrain),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: lawnSqFt === 0 ? null : proposedPrice / lawnSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same lawn three ways — landscape, pet, putting — from the
 * suggested kits so the shop can see when sod demo, pet drainage, or a
 * putting-green seam count flips the cheaper type. User-typed type rates
 * are not reused here: the comparison is apples-to-apples on the starting
 * figures. Job takeoffs (area, waste, seams, wells, sod demo) stay as typed.
 */
export function compareTurfTypes(input) {
  const rows = TURF_PRESETS.map((preset) => {
    const kit = suggestedTurfKit(preset.id);
    const typedBase = Number(input.baseDepthIn);
    const baseDepthIn = Number.isFinite(typedBase) && typedBase > 0
      ? (preset.id === String(input.turfType ?? 'landscape') ? typedBase : kitBaseDepth(preset.id))
      : kitBaseDepth(preset.id);
    const bid = calculateBid({
      ...input,
      turfType: preset.id,
      baseDepthIn,
      ...kit,
    });
    return {
      turfType: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      buySqFt: bid.buySqFt,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
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

function kitBaseDepth(turfType) {
  if (turfType === 'pet') return 4;
  if (turfType === 'putting') return 4.5;
  return 3;
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
export function formatBidSummary(result, jobLabel = 'Artificial turf install') {
  const perSqFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const type = TURF_PRESETS.find((item) => item.id === result.turfType)?.label ?? result.turfType;
  const sod = result.sodDemo ? `sod demo (${result.demoTons.toFixed(1)} t)` : 'no sod demo';
  const fabric = result.geotextile ? 'geotextile included' : 'no geotextile';
  return [
    'ARTIFICIAL TURF BID',
    '',
    `Proposed turf price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${type}`,
    `Price per square foot: ${perSqFt}`,
    `Turf to buy: ${result.buySqFt.toFixed(0)} sq ft (${result.wastePercent}% waste)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.lawnSqFt} sq ft lawn; ${result.baseDepthIn} in crushed-rock base (${result.crushedTons.toFixed(1)} t)`,
    `- ${sod}; ${fabric}; ${result.infillBags} infill bags (${result.infillLbs.toFixed(0)} lb)`,
    `- Seams: ${result.seamLf} lf; perimeter nails: ${result.nailCount.toFixed(0)}; tree wells: ${result.treeWells}`,
    `- Demo: ${result.hoursDemo.toFixed(1)} h; base: ${result.hoursBase.toFixed(1)} h; install: ${result.hoursInstall.toFixed(1)} h; infill / drain: ${(result.hoursInfill + result.hoursDrain).toFixed(1)} h; seams / wells: ${(result.hoursSeam + result.hoursWells).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm square footage, waste, base depth, sod demo, seams, infill, and all pricing before sending. It is not a landscaping specification, a drainage design, a permit, or an engineering stamp.',
  ].join('\n');
}
