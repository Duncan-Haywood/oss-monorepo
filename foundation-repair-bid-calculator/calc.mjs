// Pure bid arithmetic for foundation repair: helical piers, hydraulic
// push piers, and bowed-wall stabilization. No network, no state: every
// pier, depth, strap, and wage is an input, so the result stays a
// transparent calculation the contractor can check against their own
// invoices rather than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "price per pier" quote treats an 8-pier brochure house with exterior
// access and 12 ft of easy soil as the same job as a 6-pier house with
// interior brackets, an engineering stamp, four carbon-fiber straps
// on a bowed wall, and a plumbing reroute under the slab. Homeowners
// (and a lot of estimator sheets) count the same kind of number.
// Access, depth past the included footage, engineering, and wall
// straps do not scale with that count. Matching a cheaper per-pier
// quote written for the brochure job is how a sold interior-access
// house becomes a week-long loss after the first cramped bracket.
//
// Distinct from basement waterproofing (French drain, sump, discharge
// — water, not structure), concrete slabs (new pours), retaining walls
// (height and geogrid on a wall you are building), and crawl
// encapsulation. This prices holding a settled or bowed foundation up
// and still: piers, extra shaft, interior access, engineering, and
// wall straps.

export const METHOD_PRESETS = Object.freeze([
  {
    id: 'helical',
    label: 'Helical piers (exterior or interior brackets)',
    hoursPerPier: 2.4,
    pierCostEach: 420,
    hoursPerDepthFt: 0.08,
    depthIncludedFt: 10,
  },
  {
    id: 'push',
    label: 'Hydraulic push / resistance piers',
    hoursPerPier: 1.8,
    pierCostEach: 380,
    hoursPerDepthFt: 0.06,
    depthIncludedFt: 10,
  },
  {
    id: 'wall_stabilize',
    label: 'Bowed-wall stabilization (straps / I-beams, no piers)',
    hoursPerPier: 0,
    pierCostEach: 0,
    hoursPerDepthFt: 0,
    depthIncludedFt: 0,
  },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '8 exterior helical piers, 12 ft, easy access (the brochure job)',
    methodId: 'helical',
    pierCount: 8,
    averageDepthFt: 12,
    interiorAccess: false,
    poorAccess: false,
    engineeringStamp: false,
    carbonFiberStraps: 0,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: false,
  },
  {
    label: '6 interior helical piers, 14 ft, engineering, 4 straps, plumbing',
    methodId: 'helical',
    pierCount: 6,
    averageDepthFt: 14,
    interiorAccess: true,
    poorAccess: false,
    engineeringStamp: true,
    carbonFiberStraps: 4,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: true,
  },
  {
    label: '10 push piers, 16 ft, poor lot access, no engineering',
    methodId: 'push',
    pierCount: 10,
    averageDepthFt: 16,
    interiorAccess: false,
    poorAccess: true,
    engineeringStamp: false,
    carbonFiberStraps: 0,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: false,
  },
  {
    label: 'Bowed wall: 8 carbon-fiber straps, no piers',
    methodId: 'wall_stabilize',
    pierCount: 0,
    averageDepthFt: 0,
    interiorAccess: true,
    poorAccess: false,
    engineeringStamp: true,
    carbonFiberStraps: 8,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: false,
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

export function suggestedMethod(methodId) {
  const preset = METHOD_PRESETS.find((item) => item.id === methodId);
  if (!preset) throw new Error('Unknown foundation-repair method');
  return {
    hoursPerPier: preset.hoursPerPier,
    pierCostEach: preset.pierCostEach,
    hoursPerDepthFt: preset.hoursPerDepthFt,
    depthIncludedFt: preset.depthIncludedFt,
  };
}

export function extraDepthFt(averageDepthFt, depthIncludedFt) {
  return Math.max(0, number(averageDepthFt, 'Average depth') - number(depthIncludedFt, 'Included depth'));
}

/**
 * Price a foundation-repair job from pier count, installed depth,
 * interior vs exterior access, engineering, wall straps, and the
 * contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const pierCount = number(input.pierCount ?? 0, 'Pier count');
  const averageDepthFt = number(input.averageDepthFt ?? 0, 'Average depth');
  const carbonFiberStraps = number(input.carbonFiberStraps ?? 0, 'Carbon-fiber straps');
  const steelIBeams = number(input.steelIBeams ?? 0, 'Steel I-beams');
  const gradeBeamLf = number(input.gradeBeamLf ?? 0, 'Grade-beam lineal feet');
  const slabJackingSqFt = number(input.slabJackingSqFt ?? 0, 'Slab-jacking area');
  if (pierCount + carbonFiberStraps + steelIBeams + gradeBeamLf + slabJackingSqFt === 0) {
    throw new Error('Add piers, wall straps, I-beams, grade beam, or slab jacking to price');
  }

  const interiorAccess = flag(input.interiorAccess);
  const poorAccess = flag(input.poorAccess);
  const engineeringStamp = flag(input.engineeringStamp);
  const plumbingReroute = flag(input.plumbingReroute);

  const hoursPerPier = number(input.hoursPerPier ?? 0, 'Hours per pier');
  const hoursPerDepthFt = number(input.hoursPerDepthFt ?? 0, 'Hours per installed foot');
  const hoursInteriorPerPier = number(input.hoursInteriorPerPier ?? 0, 'Hours per interior pier');
  const hoursPoorAccess = number(input.hoursPoorAccess ?? 0, 'Hours for poor lot access');
  const hoursPerStrap = number(input.hoursPerStrap ?? 0, 'Hours per carbon-fiber strap');
  const hoursPerIBeam = number(input.hoursPerIBeam ?? 0, 'Hours per steel I-beam');
  const hoursPerGradeBeamLf = number(input.hoursPerGradeBeamLf ?? 0, 'Hours per grade-beam foot');
  const hoursPer100Slab = number(input.hoursPer100Slab ?? 0, 'Hours per 100 sq ft of slab jacking');
  const hoursEngineering = number(input.hoursEngineering ?? 0, 'Hours to coordinate engineering');
  const hoursPlumbingReroute = number(input.hoursPlumbingReroute ?? 0, 'Hours to reroute plumbing');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const pierCostEach = number(input.pierCostEach ?? 0, 'Pier and bracket each');
  const depthIncludedFt = number(input.depthIncludedFt ?? 0, 'Included depth');
  const extraDepthCostPerFt = number(input.extraDepthCostPerFt ?? 0, 'Extra shaft per foot');
  const interiorBracketCost = number(input.interiorBracketCost ?? 0, 'Interior bracket adder');
  const strapCostEach = number(input.strapCostEach ?? 0, 'Carbon-fiber strap each');
  const iBeamCostEach = number(input.iBeamCostEach ?? 0, 'Steel I-beam each');
  const gradeBeamCostPerLf = number(input.gradeBeamCostPerLf ?? 0, 'Grade beam per foot');
  const slabJackCostPerSqFt = number(input.slabJackCostPerSqFt ?? 0, 'Slab jacking per sq ft');
  const engineeringFee = number(input.engineeringFee ?? 0, 'Engineering stamp fee');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');
  const plumbingAllowance = number(input.plumbingAllowance ?? 0, 'Plumbing reroute allowance');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const extraFtEach = extraDepthFt(averageDepthFt, depthIncludedFt);
  const extraDepthLf = pierCount * extraFtEach;

  // Piers, extra shaft, interior brackets, straps, and engineering stay
  // their own hours so a cheap per-pier quote cannot hide which part of
  // a high number is the first cramped interior bracket.
  const pierHours = pierCount * hoursPerPier;
  const depthHours = pierCount * averageDepthFt * hoursPerDepthFt;
  const interiorHours = interiorAccess ? pierCount * hoursInteriorPerPier : 0;
  const accessHours = poorAccess ? hoursPoorAccess : 0;
  const strapHours = carbonFiberStraps * hoursPerStrap;
  const iBeamHours = steelIBeams * hoursPerIBeam;
  const wallHours = strapHours + iBeamHours;
  const gradeBeamHours = gradeBeamLf * hoursPerGradeBeamLf;
  const slabHours = (slabJackingSqFt / 100) * hoursPer100Slab;
  const engineeringHours = engineeringStamp ? hoursEngineering : 0;
  const plumbingHours = plumbingReroute ? hoursPlumbingReroute : 0;
  const softHours = engineeringHours + plumbingHours;
  const totalHours = pierHours + depthHours + interiorHours + accessHours
    + wallHours + gradeBeamHours + slabHours + softHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const pierMaterial = pierCount * pierCostEach;
  const extraDepthMaterial = extraDepthLf * extraDepthCostPerFt;
  const interiorMaterial = interiorAccess ? pierCount * interiorBracketCost : 0;
  const strapMaterial = carbonFiberStraps * strapCostEach;
  const iBeamMaterial = steelIBeams * iBeamCostEach;
  const gradeBeamMaterial = gradeBeamLf * gradeBeamCostPerLf;
  const slabMaterial = slabJackingSqFt * slabJackCostPerSqFt;
  const engineeringMaterial = engineeringStamp ? engineeringFee : 0;
  const permitMaterial = permitFee;
  const plumbingMaterial = plumbingReroute ? plumbingAllowance : 0;
  const materialCost = pierMaterial + extraDepthMaterial + interiorMaterial
    + strapMaterial + iBeamMaterial + gradeBeamMaterial + slabMaterial
    + engineeringMaterial + permitMaterial + plumbingMaterial;
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
    pierCount,
    averageDepthFt,
    extraFtEach,
    extraDepthLf,
    carbonFiberStraps,
    steelIBeams,
    gradeBeamLf,
    slabJackingSqFt,
    interiorAccess,
    poorAccess,
    engineeringStamp,
    plumbingReroute,
    loadedWage,
    pierHours,
    depthHours,
    interiorHours,
    accessHours,
    strapHours,
    iBeamHours,
    wallHours,
    gradeBeamHours,
    slabHours,
    engineeringHours,
    plumbingHours,
    softHours,
    siteHours,
    totalHours,
    laborCost,
    pierMaterial,
    extraDepthMaterial,
    interiorMaterial,
    strapMaterial,
    iBeamMaterial,
    gradeBeamMaterial,
    slabMaterial,
    engineeringMaterial,
    permitMaterial,
    plumbingMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerPier: pierCount === 0 ? null : price / pierCount,
    costPerPier: pierCount === 0 ? null : totalCost / pierCount,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      piers: hourShare(pierHours + depthHours),
      access: hourShare(interiorHours + accessHours),
      walls: hourShare(wallHours),
      structure: hourShare(gradeBeamHours + slabHours),
      soft: hourShare(softHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perPier: pierCount === 0 ? null : proposedPrice / pierCount,
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
export function formatBidSummary(result, methodLabel = 'Foundation repair') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perPier = result.pricePerPier === null
    ? 'n/a (wall-only takeoff)'
    : `${money(result.pricePerPier)} / pier`;
  const access = result.interiorAccess ? 'interior brackets' : 'exterior access';
  const lot = result.poorAccess ? 'poor lot access' : 'standard lot access';
  const stamp = result.engineeringStamp ? 'engineering stamp included' : 'no engineering stamp this bid';
  const plumbing = result.plumbingReroute ? 'plumbing reroute included' : 'no plumbing reroute';
  return [
    'FOUNDATION REPAIR BID',
    '',
    `Proposed foundation-repair price: ${money(result.price)}`,
    `Scope: ${methodLabel}; ${result.pierCount} pier${result.pierCount === 1 ? '' : 's'} at ${result.averageDepthFt} ft average, ${access}, ${lot}`,
    `Price per pier: ${perPier}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Piers: ${result.pierCount} at ${result.averageDepthFt} ft average (${result.extraDepthLf} lf of extra shaft past included footage)`,
    `- Access: ${access}; ${lot}`,
    `- Wall stabilization: ${result.carbonFiberStraps} carbon-fiber strap${result.carbonFiberStraps === 1 ? '' : 's'}, ${result.steelIBeams} steel I-beam${result.steelIBeams === 1 ? '' : 's'}`,
    `- Grade beam: ${result.gradeBeamLf} lf; slab jacking: ${result.slabJackingSqFt.toLocaleString('en-US')} sq ft`,
    `- ${stamp}; ${plumbing}`,
    `- Access and wall labor: ${result.interiorHours.toFixed(1)} h interior + ${result.wallHours.toFixed(1)} h straps/beams`,
    '',
    'This is a draft for review. Confirm soil, pier depth, bracket type, access, engineering requirements, permits, and all pricing before sending. It is not a structural-engineering specification, a settlement warranty, or a guarantee of soil performance.',
  ].join('\n');
}
