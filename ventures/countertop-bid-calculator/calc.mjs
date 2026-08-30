// Pure bid arithmetic for quartz / granite / marble countertop fabrication
// and install. No network, no state: every square foot, cutout, slab cost,
// and wage is an input, so the result stays a transparent calculation the
// fabricator can check against their own invoices rather than a claim about
// what any kitchen "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "price per finished square foot" quote treats a 40 sq ft galley with a
// drop-in sink as the same job as a 28 sq ft island with two waterfall
// ends. The homeowner measures the same kind of number. Slabs, cutouts,
// polished holes, and mitered edges do not scale with that footage.
// Matching a cheaper per-square-foot quote written for a straight run is
// how a sold waterfall island becomes a two-slab loss.
//
// Distinct from cabinet *refinishing* (painting existing doors) and from
// flooring *install* (LVP / hardwood / tile waste and tear-out). This
// prices stone fabrication — slabs, sink and cooktop cutouts, edges,
// backsplash, and waterfalls.

export const SLAB_SQ_FT_DEFAULT = 46;
export const WATERFALL_HEIGHT_IN = 36;
export const WATERFALL_DEPTH_IN = 25.5;

export const MATERIAL_PRESETS = Object.freeze([
  { id: 'quartz', label: 'Quartz (engineered)', slabSqFt: 46, defaultSlabCost: 850 },
  { id: 'granite', label: 'Granite', slabSqFt: 46, defaultSlabCost: 650 },
  { id: 'marble', label: 'Marble', slabSqFt: 40, defaultSlabCost: 1100 },
]);

export const LAYOUT_PRESETS = Object.freeze([
  { id: 'galley', label: 'Straight / galley', wastePct: 12 },
  { id: 'l_shape', label: 'L-shape', wastePct: 20 },
  { id: 'u_shape', label: 'U-shape', wastePct: 28 },
  { id: 'with_island', label: 'Run + island', wastePct: 24 },
]);

export const EDGE_PRESETS = Object.freeze([
  { id: 'eased', label: 'Eased / pencil', hoursPerLf: 0.08 },
  { id: 'bevel', label: 'Bevel', hoursPerLf: 0.12 },
  { id: 'ogee', label: 'Ogee / bullnose', hoursPerLf: 0.22 },
  { id: 'mitered', label: 'Mitered laminated', hoursPerLf: 0.45 },
]);

export const SINK_PRESETS = Object.freeze([
  { id: 'none', label: 'No sink cutout', hours: 0 },
  { id: 'drop_in', label: 'Drop-in / top-mount', hours: 0.6 },
  { id: 'undermount', label: 'Undermount (polish the hole)', hours: 2 },
  { id: 'farmhouse', label: 'Farmhouse / apron-front', hours: 3 },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '40 sq ft galley, drop-in, eased',
    finishedSqFt: 40,
    perimeterLf: 22,
    layoutId: 'galley',
    materialId: 'quartz',
    sinkId: 'drop_in',
    sinkCount: 1,
    cooktopCount: 0,
    faucetHoles: 1,
    waterfallEnds: 0,
    edgeId: 'eased',
    backsplashLf: 0,
    backsplashHeightIn: 4,
    seams: 0,
    templateHours: 1.5,
    tearoutHours: 1.5,
  },
  {
    label: '55 sq ft L-kitchen, undermount + cooktop, ogee',
    finishedSqFt: 55,
    perimeterLf: 32,
    layoutId: 'l_shape',
    materialId: 'quartz',
    sinkId: 'undermount',
    sinkCount: 1,
    cooktopCount: 1,
    faucetHoles: 3,
    waterfallEnds: 0,
    edgeId: 'ogee',
    backsplashLf: 18,
    backsplashHeightIn: 4,
    seams: 2,
    templateHours: 2,
    tearoutHours: 2.5,
  },
  {
    label: '70 sq ft U + island, farmhouse, two waterfalls, mitered',
    finishedSqFt: 70,
    perimeterLf: 44,
    layoutId: 'with_island',
    materialId: 'quartz',
    sinkId: 'farmhouse',
    sinkCount: 1,
    cooktopCount: 1,
    faucetHoles: 3,
    waterfallEnds: 2,
    edgeId: 'mitered',
    backsplashLf: 22,
    backsplashHeightIn: 4,
    seams: 3,
    templateHours: 2.5,
    tearoutHours: 3.5,
  },
  {
    label: '28 sq ft island with two waterfalls (the slab trap)',
    finishedSqFt: 28,
    perimeterLf: 18,
    layoutId: 'with_island',
    materialId: 'quartz',
    sinkId: 'none',
    sinkCount: 0,
    cooktopCount: 0,
    faucetHoles: 0,
    waterfallEnds: 2,
    edgeId: 'mitered',
    backsplashLf: 0,
    backsplashHeightIn: 4,
    seams: 0,
    templateHours: 1.5,
    tearoutHours: 1,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export function suggestedWastePct(layoutId) {
  const preset = LAYOUT_PRESETS.find((item) => item.id === layoutId);
  if (!preset) throw new Error('Unknown layout');
  return preset.wastePct;
}

export function suggestedEdgeHours(edgeId) {
  const preset = EDGE_PRESETS.find((item) => item.id === edgeId);
  if (!preset) throw new Error('Unknown edge profile');
  return preset.hoursPerLf;
}

export function suggestedSinkHours(sinkId) {
  const preset = SINK_PRESETS.find((item) => item.id === sinkId);
  if (!preset) throw new Error('Unknown sink cutout');
  return preset.hours;
}

export function suggestedSlab(materialId) {
  const preset = MATERIAL_PRESETS.find((item) => item.id === materialId);
  if (!preset) throw new Error('Unknown material');
  return { slabSqFt: preset.slabSqFt, slabCost: preset.defaultSlabCost };
}

export function waterfallSqFt(ends, heightIn = WATERFALL_HEIGHT_IN, depthIn = WATERFALL_DEPTH_IN) {
  return number(ends, 'Waterfall ends') * number(heightIn, 'Waterfall height') * number(depthIn, 'Waterfall depth') / 144;
}

export function backsplashSqFt(linealFeet, heightIn) {
  return number(linealFeet, 'Backsplash lineal feet') * number(heightIn, 'Backsplash height') / 12;
}

export function slabCount(requiredSqFt, slabSqFt) {
  const required = number(requiredSqFt, 'Required square feet');
  const slab = number(slabSqFt, 'Slab square feet', { allowZero: false });
  if (required === 0) return 0;
  return Math.ceil(required / slab);
}

/**
 * Price a stone countertop job from finished square footage, layout waste,
 * cutouts, edges, waterfalls, backsplash, and the shop's own costs.
 *
 * @param {object} input
 * @param {number} input.finishedSqFt
 * @param {number} input.perimeterLf
 * @param {number} input.wastePct
 * @param {number} input.slabSqFt
 * @param {number} input.slabCost
 * @param {number} input.sinkCount
 * @param {number} input.hoursPerSink
 * @param {number} input.cooktopCount
 * @param {number} input.hoursPerCooktop
 * @param {number} input.faucetHoles
 * @param {number} input.hoursPerFaucet
 * @param {number} input.waterfallEnds
 * @param {number} input.hoursPerWaterfall
 * @param {number} input.edgeHoursPerLf
 * @param {number} input.backsplashLf
 * @param {number} input.backsplashHeightIn
 * @param {number} input.hoursPerBacksplashLf
 * @param {number} input.seams
 * @param {number} input.hoursPerSeam
 * @param {number} input.fieldHoursPer100
 * @param {number} input.installHoursPer100
 * @param {number} input.templateHours
 * @param {number} input.tearoutHours
 * @param {number} input.suppliesPerSqFt
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.travelAndEquipment
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} [input.proposedPrice]
 */
export function calculateBid(input) {
  const finishedSqFt = number(input.finishedSqFt ?? 0, 'Finished square feet');
  const waterfallEnds = number(input.waterfallEnds ?? 0, 'Waterfall ends');
  if (finishedSqFt + waterfallEnds === 0) {
    throw new Error('Add finished square footage or at least one waterfall end');
  }

  const perimeterLf = number(input.perimeterLf ?? 0, 'Finished perimeter');
  const wastePct = number(input.wastePct ?? 0, 'Layout waste');
  const slabSqFt = number(input.slabSqFt ?? SLAB_SQ_FT_DEFAULT, 'Slab square feet', { allowZero: false });
  const slabCost = number(input.slabCost ?? 0, 'Slab cost');
  const sinkCount = number(input.sinkCount ?? 0, 'Sink cutouts');
  const hoursPerSink = number(input.hoursPerSink ?? 0, 'Hours per sink');
  const cooktopCount = number(input.cooktopCount ?? 0, 'Cooktop cutouts');
  const hoursPerCooktop = number(input.hoursPerCooktop ?? 0, 'Hours per cooktop');
  const faucetHoles = number(input.faucetHoles ?? 0, 'Faucet holes');
  const hoursPerFaucet = number(input.hoursPerFaucet ?? 0, 'Hours per faucet hole');
  const hoursPerWaterfall = number(input.hoursPerWaterfall ?? 0, 'Hours per waterfall');
  const edgeHoursPerLf = number(input.edgeHoursPerLf ?? 0, 'Edge hours per lineal foot');
  const backsplashLf = number(input.backsplashLf ?? 0, 'Backsplash lineal feet');
  const backsplashHeightIn = number(input.backsplashHeightIn ?? 0, 'Backsplash height');
  const hoursPerBacksplashLf = number(input.hoursPerBacksplashLf ?? 0, 'Hours per backsplash foot');
  const seams = number(input.seams ?? 0, 'Seams');
  const hoursPerSeam = number(input.hoursPerSeam ?? 0, 'Hours per seam');
  const fieldHoursPer100 = number(input.fieldHoursPer100 ?? 0, 'Field hours per 100 sq ft');
  const installHoursPer100 = number(input.installHoursPer100 ?? 0, 'Install hours per 100 sq ft');
  const templateHours = number(input.templateHours ?? 0, 'Template hours');
  const tearoutHours = number(input.tearoutHours ?? 0, 'Tear-out hours');
  const suppliesPerSqFt = number(input.suppliesPerSqFt ?? 0, 'Supplies per sq ft');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const waterfallArea = waterfallSqFt(waterfallEnds);
  const splashArea = backsplashSqFt(backsplashLf, backsplashHeightIn);
  const netStoneSqFt = finishedSqFt + waterfallArea + splashArea;
  const requiredSqFt = netStoneSqFt * (1 + wastePct / 100);
  const slabs = slabCount(requiredSqFt, slabSqFt);

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  // Field hours cover cutting and polishing the finished top only. Cutouts,
  // edges, waterfalls, seams, template, tear-out, and install stay their
  // own hours so a cheap per-square-foot quote cannot hide which part of
  // a high number is a polished hole or a second slab.
  const fieldHours = (finishedSqFt / 100) * fieldHoursPer100;
  const sinkHours = sinkCount * hoursPerSink;
  const cooktopHours = cooktopCount * hoursPerCooktop;
  const faucetHours = faucetHoles * hoursPerFaucet;
  const edgeHours = perimeterLf * edgeHoursPerLf;
  const waterfallHours = waterfallEnds * hoursPerWaterfall;
  const backsplashHours = backsplashLf * hoursPerBacksplashLf;
  const seamHours = seams * hoursPerSeam;
  const installHours = (finishedSqFt / 100) * installHoursPer100 + waterfallEnds * 0.75;
  const totalHours = fieldHours + sinkHours + cooktopHours + faucetHours + edgeHours
    + waterfallHours + backsplashHours + seamHours + templateHours + tearoutHours + installHours;
  const laborCost = totalHours * loadedWage;

  const slabTotal = slabs * slabCost;
  const supplies = netStoneSqFt * suppliesPerSqFt;
  const materialCost = slabTotal + supplies;
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
  const cutoutHours = sinkHours + cooktopHours + faucetHours;

  return {
    finishedSqFt,
    perimeterLf,
    wastePct,
    slabSqFt,
    waterfallEnds,
    waterfallArea,
    splashArea,
    netStoneSqFt,
    requiredSqFt,
    slabs,
    loadedWage,
    fieldHours,
    sinkHours,
    cooktopHours,
    faucetHours,
    cutoutHours,
    edgeHours,
    waterfallHours,
    backsplashHours,
    seamHours,
    templateHours,
    tearoutHours,
    installHours,
    totalHours,
    laborCost,
    slabTotal,
    supplies,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: finishedSqFt === 0 ? null : price / finishedSqFt,
    costPerSqFt: finishedSqFt === 0 ? null : totalCost / finishedSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      field: hourShare(fieldHours),
      cutouts: hourShare(cutoutHours),
      edges: hourShare(edgeHours + backsplashHours),
      waterfalls: hourShare(waterfallHours),
      seams: hourShare(seamHours),
      site: hourShare(templateHours + tearoutHours + installHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: finishedSqFt === 0 ? null : proposedPrice / finishedSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the fabricator can paste into a
 * proposal. Costs, wages, and slab invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perSqFt = result.pricePerSqFt === null
    ? 'n/a (waterfall-only takeoff)'
    : `${money(result.pricePerSqFt)} / finished sq ft`;
  return [
    'QUARTZ / GRANITE COUNTERTOP BID',
    '',
    `Proposed fabrication and install price: ${money(result.price)}`,
    `Scope: ${result.finishedSqFt.toLocaleString('en-US')} finished sq ft, ${result.slabs} slab${result.slabs === 1 ? '' : 's'}, ${result.waterfallEnds} waterfall end${result.waterfallEnds === 1 ? '' : 's'}`,
    `Price per finished square foot: ${perSqFt}`,
    `Shop and install labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Finished tops: ${result.finishedSqFt.toLocaleString('en-US')} sq ft`,
    `- Layout waste in the takeoff: ${result.wastePct}% (required stone ${result.requiredSqFt.toFixed(1)} sq ft)`,
    `- Slabs in the takeoff: ${result.slabs}`,
    `- Waterfall ends: ${result.waterfallEnds} (about ${result.waterfallArea.toFixed(1)} sq ft of extra stone)`,
    `- Backsplash: ${result.splashArea.toFixed(1)} sq ft`,
    `- Cutout labor: ${result.cutoutHours.toFixed(1)} h (sinks, cooktop, faucet holes)`,
    `- Seams: ${result.seamHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm measurements, slab lot, sink and cooktop cutouts, edge profile, seams, template, tear-out, and all pricing before sending. It is not a stone specification, a color match, or a guarantee of seams or lead time.',
  ].join('\n');
}
