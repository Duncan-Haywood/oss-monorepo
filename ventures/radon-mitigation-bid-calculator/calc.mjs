// Pure bid arithmetic for radon mitigation (sub-slab / crawl
// depressurization) installs. No network, no state: every footprint,
// suction point, membrane square, circuit, and wage is an input, so
// the result stays a transparent calculation the installer can check
// against their own fan invoices rather than a claim about what any
// house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$1,195 radon special" treats a 1,200-square-foot walk-out basement
// with one suction point, a standard fan, a sidewall discharge, and an
// existing outlet as the same job as a 2,400-square-foot slab-and-crawl
// combo with two suction points, a high-suction fan, a roof stack,
// a crawl membrane, a new 20A circuit, two firestops, a permit, and a
// post-mitigation test. Homeowners (and a lot of lead-gen pages) count
// the same kind of number. Extra suction, crawl poly, a roof
// penetration, and a new circuit do not scale with "a radon system is
// a radon system." Matching a cheaper special written for the brochure
// basement is how a sold mixed-foundation job becomes a loss after the
// first extra suction pit.
//
// Distinct from basement waterproofing (wells, pit, and discharge),
// foundation repair (access, extra shaft, and straps), and attic
// insulation (blown-in bags). This prices a radon mitigation install:
// the suction, the fan, the membrane, and the circuit.

export const FOUNDATION_PRESETS = Object.freeze([
  { id: 'basement', label: 'Basement — sub-slab depressurization' },
  { id: 'crawl', label: 'Crawl space — depressurization' },
  { id: 'slab', label: 'Slab-on-grade — tight-slab SSD' },
  { id: 'mixed', label: 'Mixed basement + crawl / walk-out' },
]);

export const FAN_PRESETS = Object.freeze([
  { id: 'standard', label: 'Standard radon fan' },
  { id: 'high-suction', label: 'High-suction / tight-slab fan' },
]);

export const DISCHARGE_PRESETS = Object.freeze([
  { id: 'sidewall', label: 'Sidewall discharge' },
  { id: 'roof', label: 'Roof penetration / above-eave stack' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '1,200 sq ft basement, 1 suction, standard fan, sidewall (the brochure special)',
    foundation: 'basement',
    footprintSqFt: 1200,
    suctionPoints: 1,
    fan: 'standard',
    discharge: 'sidewall',
    crawlMembrane: false,
    membraneSqFt: 0,
    newCircuit: false,
    postTest: false,
    permit: false,
    firestopCount: 0,
  },
  {
    label: '1,800 sq ft basement, 1 suction, roof stack, post-mitigation test',
    foundation: 'basement',
    footprintSqFt: 1800,
    suctionPoints: 1,
    fan: 'standard',
    discharge: 'roof',
    crawlMembrane: false,
    membraneSqFt: 0,
    newCircuit: false,
    postTest: true,
    permit: false,
    firestopCount: 0,
  },
  {
    label: '2,400 sq ft mixed slab + crawl, 2 suctions, high-suction fan, membrane, new circuit, test, permit',
    foundation: 'mixed',
    footprintSqFt: 2400,
    suctionPoints: 2,
    fan: 'high-suction',
    discharge: 'roof',
    crawlMembrane: true,
    membraneSqFt: 800,
    newCircuit: true,
    postTest: true,
    permit: true,
    firestopCount: 2,
  },
  {
    label: '2,000 sq ft tight slab-on-grade, 2 suctions, high-suction fan, roof, new circuit, firestops, test',
    foundation: 'slab',
    footprintSqFt: 2000,
    suctionPoints: 2,
    fan: 'high-suction',
    discharge: 'roof',
    crawlMembrane: false,
    membraneSqFt: 0,
    newCircuit: true,
    postTest: true,
    permit: false,
    firestopCount: 2,
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
 * Starting base hours. A tighter slab or a crawl does not change the
 * extra-suction line; only the base-system block moves. Picking a
 * preset never overwrites a cost the installer has already typed.
 */
export function suggestedFoundationHours(foundation) {
  const id = String(foundation);
  if (id === 'basement') return { hoursBaseSystem: 4 };
  if (id === 'crawl') return { hoursBaseSystem: 5 };
  if (id === 'slab') return { hoursBaseSystem: 5.5 };
  if (id === 'mixed') return { hoursBaseSystem: 5 };
  throw new Error('Unknown foundation');
}

/**
 * Starting fan cost and install hours. High-suction fans are billed
 * as their own kit and a short extra-labor block; a standard fan
 * drops that block to zero.
 */
export function suggestedFan(fan) {
  const id = String(fan);
  if (id === 'standard') return { fanCost: 185, hoursHighSuctionFan: 0 };
  if (id === 'high-suction') return { fanCost: 320, hoursHighSuctionFan: 0.5 };
  throw new Error('Unknown fan');
}

/**
 * Price a radon mitigation install from footprint, suction, fan,
 * discharge, membrane, circuit, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const footprintSqFt = number(input.footprintSqFt ?? 0, 'Footprint square feet', { allowZero: false });
  const suctionPoints = number(input.suctionPoints ?? 0, 'Suction points', { allowZero: false });
  const includedFootprint = number(input.includedFootprint ?? 0, 'Included footprint', { allowZero: false });
  const includedSuctionPoints = number(input.includedSuctionPoints ?? 0, 'Included suction points', { allowZero: false });
  const membraneSqFt = number(input.membraneSqFt ?? 0, 'Membrane square feet');
  const firestopCount = number(input.firestopCount ?? 0, 'Firestop count');

  const foundation = String(input.foundation ?? 'basement');
  if (!FOUNDATION_PRESETS.some((item) => item.id === foundation)) {
    throw new Error('Unknown foundation');
  }
  const fan = String(input.fan ?? 'standard');
  if (!FAN_PRESETS.some((item) => item.id === fan)) {
    throw new Error('Unknown fan');
  }
  const discharge = String(input.discharge ?? 'sidewall');
  if (!DISCHARGE_PRESETS.some((item) => item.id === discharge)) {
    throw new Error('Unknown discharge');
  }

  const crawlMembrane = flag(input.crawlMembrane);
  const newCircuit = flag(input.newCircuit);
  const postTest = flag(input.postTest);
  const permit = flag(input.permit);
  const highSuction = fan === 'high-suction';
  const roofDischarge = discharge === 'roof';

  const hoursBaseSystem = number(input.hoursBaseSystem ?? 0, 'Hours for a base system');
  const hoursPerExtra100SqFt = number(input.hoursPerExtra100SqFt ?? 0, 'Hours per extra 100 square feet');
  const hoursPerExtraSuction = number(input.hoursPerExtraSuction ?? 0, 'Hours per extra suction point');
  const hoursCrawlMembrane = number(input.hoursCrawlMembrane ?? 0, 'Hours for a crawl membrane');
  const hoursRoofDischarge = number(input.hoursRoofDischarge ?? 0, 'Hours for a roof discharge');
  const hoursHighSuctionFan = number(input.hoursHighSuctionFan ?? 0, 'Hours for a high-suction fan');
  const hoursNewCircuit = number(input.hoursNewCircuit ?? 0, 'Hours for a new circuit');
  const hoursPostTest = number(input.hoursPostTest ?? 0, 'Hours for a post-mitigation test');
  const hoursPermit = number(input.hoursPermit ?? 0, 'Hours for a permit');
  const hoursPerFirestop = number(input.hoursPerFirestop ?? 0, 'Hours per firestop');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const fanCost = number(input.fanCost ?? 0, 'Fan cost');
  const pipeAndSealCost = number(input.pipeAndSealCost ?? 0, 'Pipe and seal cost');
  const extraSuctionMaterial = number(input.extraSuctionMaterial ?? 0, 'Extra suction material');
  const membranePerSqFt = number(input.membranePerSqFt ?? 0, 'Membrane per square foot');
  const circuitCost = number(input.circuitCost ?? 0, 'Circuit cost');
  const testKitCost = number(input.testKitCost ?? 0, 'Test kit');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');
  const firestopCostEach = number(input.firestopCostEach ?? 0, 'Firestop cost each');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const extraSqFt = Math.max(0, footprintSqFt - includedFootprint);
  const extraSuctionPoints = Math.max(0, suctionPoints - includedSuctionPoints);

  const systemHours = hoursBaseSystem;
  const footprintHours = (extraSqFt / 100) * hoursPerExtra100SqFt;
  const suctionHours = extraSuctionPoints * hoursPerExtraSuction;
  const membraneHours = crawlMembrane ? hoursCrawlMembrane : 0;
  const roofHours = roofDischarge ? hoursRoofDischarge : 0;
  const fanHours = highSuction ? hoursHighSuctionFan : 0;
  const circuitHours = newCircuit ? hoursNewCircuit : 0;
  const testHours = postTest ? hoursPostTest : 0;
  const permitHours = permit ? hoursPermit : 0;
  const firestopHours = firestopCount * hoursPerFirestop;

  const accessHours = footprintHours + suctionHours + membraneHours;
  const serviceHours = roofHours + fanHours + circuitHours + testHours + permitHours + firestopHours;
  const totalHours = systemHours + accessHours + serviceHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const billedMembraneSqFt = crawlMembrane ? membraneSqFt : 0;
  const fanMaterial = fanCost;
  const pipeMaterial = pipeAndSealCost + extraSuctionPoints * extraSuctionMaterial;
  const membraneMaterial = billedMembraneSqFt * membranePerSqFt;
  const circuitMaterial = newCircuit ? circuitCost : 0;
  const testMaterial = postTest ? testKitCost : 0;
  const permitMaterial = permit ? permitFee : 0;
  const firestopMaterial = firestopCount * firestopCostEach;
  const materialCost = fanMaterial + pipeMaterial + membraneMaterial
    + circuitMaterial + testMaterial + permitMaterial + firestopMaterial;
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
    foundation,
    footprintSqFt,
    suctionPoints,
    includedFootprint,
    includedSuctionPoints,
    extraSqFt,
    extraSuctionPoints,
    fan,
    highSuction,
    discharge,
    roofDischarge,
    crawlMembrane,
    membraneSqFt: billedMembraneSqFt,
    newCircuit,
    postTest,
    permit,
    firestopCount,
    loadedWage,
    systemHours,
    footprintHours,
    suctionHours,
    membraneHours,
    roofHours,
    fanHours,
    circuitHours,
    testHours,
    permitHours,
    firestopHours,
    accessHours,
    serviceHours,
    siteHours,
    totalHours,
    laborCost,
    fanMaterial,
    pipeMaterial,
    membraneMaterial,
    circuitMaterial,
    testMaterial,
    permitMaterial,
    firestopMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: footprintSqFt === 0 ? null : price / footprintSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      system: hourShare(systemHours),
      access: hourShare(accessHours),
      extras: hourShare(serviceHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: footprintSqFt === 0 ? null : proposedPrice / footprintSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the installer can paste into a
 * proposal. Costs, wages, and kit invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Radon mitigation install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perSqFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft of footprint`;
  const foundation = FOUNDATION_PRESETS.find((item) => item.id === result.foundation)?.label ?? result.foundation;
  const fan = FAN_PRESETS.find((item) => item.id === result.fan)?.label ?? result.fan;
  const discharge = DISCHARGE_PRESETS.find((item) => item.id === result.discharge)?.label ?? result.discharge;
  const membrane = result.crawlMembrane
    ? `crawl membrane included (${result.membraneSqFt} sq ft)`
    : 'no crawl membrane this bid';
  const circuit = result.newCircuit ? 'new dedicated circuit included' : 'existing outlet';
  const test = result.postTest ? 'post-mitigation test included' : 'no post-mitigation test this bid';
  const permit = result.permit ? 'permit / notification included' : 'no permit this bid';
  const firestops = result.firestopCount === 0
    ? 'no firestops this bid'
    : `${result.firestopCount} firestop${result.firestopCount === 1 ? '' : 's'} included`;
  return [
    'RADON MITIGATION / SSD BID',
    '',
    `Proposed mitigation price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.footprintSqFt} sq ft footprint; ${result.suctionPoints} suction point${result.suctionPoints === 1 ? '' : 's'}`,
    `Price per square foot of footprint: ${perSqFt}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Foundation: ${foundation}`,
    `- Fan: ${fan}; discharge: ${discharge}`,
    `- ${membrane}; ${circuit}; ${test}; ${permit}; ${firestops}`,
    `- Access labor: ${result.accessHours.toFixed(1)} h; extras: ${result.serviceHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm foundation type, footprint, suction points, fan, discharge, crawl membrane, electrical, post-mitigation testing, permit, firestops, and all pricing before sending. It is not a radon design, a health determination, a permit, or a guarantee that any building will test below an action level.',
  ].join('\n');
}
