// Pure bid arithmetic for mold remediation jobs. No network, no state:
// every affected square, containment zone, demo square, equipment day,
// and wage is an input, so the result stays a transparent calculation
// the remediator can check against their own HEPA invoices rather than
// a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$999 mold special" or a "$3 per square foot" internet quote treats
// an 80-square-foot closet with one containment and one equipment day
// as the same job as an 800-square-foot finished basement with two
// zones, four dry-out days, 240 square feet of demo, a dumpster, HVAC
// cleaning, and a third-party clearance. Homeowners (and a lot of
// lead-gen pages) count the same kind of number. Extra containment,
// demo, equipment days, and clearance do not scale with "a mold job
// is a mold job." Matching a cheaper closet special is how a sold
// basement job becomes a loss after the first extra zone.
//
// Distinct from basement waterproofing (wells, pit, and discharge),
// radon mitigation (suction, membrane, and circuit), pest control
// (bait stations and route stops), drywall (hang-and-finish of new
// board), and HVAC maintenance contracts. This prices a mold
// remediation: the containment, the demo, the dry-out, and the
// clearance.

export const JOB_TYPE_PRESETS = Object.freeze([
  { id: 'closet', label: 'Closet / bath — small contained area' },
  { id: 'bedroom', label: 'Single bedroom' },
  { id: 'basement', label: 'Finished basement' },
  { id: 'sewage', label: 'Category-3 / sewage-backed area' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '80 sq ft closet, 1 zone, 1 equipment day (the $999 special)',
    jobType: 'closet',
    affectedSqFt: 80,
    containmentZones: 1,
    demoSqFt: 0,
    hepaDays: 1,
    dehumidifierDays: 1,
    clearanceTest: false,
    hvacClean: false,
    dumpster: false,
    occupied: false,
  },
  {
    label: '200 sq ft bedroom, 1 zone, 2 dry-out days, 40 sq ft demo',
    jobType: 'bedroom',
    affectedSqFt: 200,
    containmentZones: 1,
    demoSqFt: 40,
    hepaDays: 2,
    dehumidifierDays: 2,
    clearanceTest: false,
    hvacClean: false,
    dumpster: false,
    occupied: false,
  },
  {
    label: '800 sq ft finished basement, 2 zones, 4 dry-out days, 240 sq ft demo, clearance, HVAC, dumpster, occupied',
    jobType: 'basement',
    affectedSqFt: 800,
    containmentZones: 2,
    demoSqFt: 240,
    hepaDays: 4,
    dehumidifierDays: 4,
    clearanceTest: true,
    hvacClean: true,
    dumpster: true,
    occupied: true,
  },
  {
    label: '400 sq ft sewage-backed room, 2 zones, 200 sq ft demo, clearance, HVAC, dumpster, occupied',
    jobType: 'sewage',
    affectedSqFt: 400,
    containmentZones: 2,
    demoSqFt: 200,
    hepaDays: 3,
    dehumidifierDays: 3,
    clearanceTest: true,
    hvacClean: true,
    dumpster: true,
    occupied: true,
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
 * Starting base hours. A sewage protocol does not change the extra-
 * zone or demo line; only the base-setup block moves. Picking a
 * preset never overwrites a cost the remediator has already typed.
 */
export function suggestedJobHours(jobType) {
  const id = String(jobType);
  if (id === 'closet') return { hoursBaseSetup: 4 };
  if (id === 'bedroom') return { hoursBaseSetup: 4.5 };
  if (id === 'basement') return { hoursBaseSetup: 5.5 };
  if (id === 'sewage') return { hoursBaseSetup: 6.5 };
  throw new Error('Unknown job type');
}

/**
 * Price a mold remediation job from affected area, containment,
 * demo, equipment days, clearance, HVAC, dumpster, occupancy, and
 * the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const affectedSqFt = number(input.affectedSqFt ?? 0, 'Affected square feet', { allowZero: false });
  const containmentZones = number(input.containmentZones ?? 0, 'Containment zones', { allowZero: false });
  const includedAffectedSqFt = number(input.includedAffectedSqFt ?? 0, 'Included affected square feet', { allowZero: false });
  const includedContainmentZones = number(input.includedContainmentZones ?? 0, 'Included containment zones', { allowZero: false });
  const demoSqFt = number(input.demoSqFt ?? 0, 'Demo square feet');
  const hepaDays = number(input.hepaDays ?? 0, 'HEPA days');
  const dehumidifierDays = number(input.dehumidifierDays ?? 0, 'Dehumidifier days');

  const jobType = String(input.jobType ?? 'closet');
  if (!JOB_TYPE_PRESETS.some((item) => item.id === jobType)) {
    throw new Error('Unknown job type');
  }

  const clearanceTest = flag(input.clearanceTest);
  const hvacClean = flag(input.hvacClean);
  const dumpster = flag(input.dumpster);
  const occupied = flag(input.occupied);

  const hoursBaseSetup = number(input.hoursBaseSetup ?? 0, 'Hours for a base setup');
  const hoursPerExtra100SqFt = number(input.hoursPerExtra100SqFt ?? 0, 'Hours per extra 100 square feet');
  const hoursPerExtraZone = number(input.hoursPerExtraZone ?? 0, 'Hours per extra containment zone');
  const hoursPer100DemoSqFt = number(input.hoursPer100DemoSqFt ?? 0, 'Hours per 100 demo square feet');
  const hoursPerDryoutDay = number(input.hoursPerDryoutDay ?? 0, 'Hours per dry-out day');
  const hoursClearance = number(input.hoursClearance ?? 0, 'Hours for a clearance test');
  const hoursHvac = number(input.hoursHvac ?? 0, 'Hours for HVAC cleaning');
  const hoursDumpster = number(input.hoursDumpster ?? 0, 'Hours for a dumpster');
  const hoursOccupied = number(input.hoursOccupied ?? 0, 'Hours for an occupied home');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const hepaDaily = number(input.hepaDaily ?? 0, 'HEPA daily');
  const dehumidifierDaily = number(input.dehumidifierDaily ?? 0, 'Dehumidifier daily');
  const containmentKit = number(input.containmentKit ?? 0, 'Containment kit');
  const extraZoneKit = number(input.extraZoneKit ?? 0, 'Extra zone kit');
  const demoDisposalPerSqFt = number(input.demoDisposalPerSqFt ?? 0, 'Demo disposal per square foot');
  const antimicrobialPerSqFt = number(input.antimicrobialPerSqFt ?? 0, 'Antimicrobial per square foot');
  const encapsulantPerSqFt = number(input.encapsulantPerSqFt ?? 0, 'Encapsulant per square foot');
  const clearanceFee = number(input.clearanceFee ?? 0, 'Clearance fee');
  const hvacCleanCost = number(input.hvacCleanCost ?? 0, 'HVAC cleaning cost');
  const dumpsterFee = number(input.dumpsterFee ?? 0, 'Dumpster fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const extraSqFt = Math.max(0, affectedSqFt - includedAffectedSqFt);
  const extraZones = Math.max(0, containmentZones - includedContainmentZones);
  const dryoutDays = Math.max(hepaDays, dehumidifierDays);

  const setupHours = hoursBaseSetup;
  const areaHours = (extraSqFt / 100) * hoursPerExtra100SqFt;
  const zoneHours = extraZones * hoursPerExtraZone;
  const demoHours = (demoSqFt / 100) * hoursPer100DemoSqFt;
  const dryoutHours = dryoutDays * hoursPerDryoutDay;
  const clearanceHours = clearanceTest ? hoursClearance : 0;
  const hvacHours = hvacClean ? hoursHvac : 0;
  const dumpsterHours = dumpster ? hoursDumpster : 0;
  const occupiedHours = occupied ? hoursOccupied : 0;

  const containmentHours = areaHours + zoneHours;
  const serviceHours = demoHours + dryoutHours + clearanceHours + hvacHours + dumpsterHours + occupiedHours;
  const totalHours = setupHours + containmentHours + serviceHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const hepaMaterial = hepaDays * hepaDaily;
  const dehumidifierMaterial = dehumidifierDays * dehumidifierDaily;
  const zoneMaterial = containmentKit + extraZones * extraZoneKit;
  const demoMaterial = demoSqFt * demoDisposalPerSqFt;
  const antimicrobialMaterial = affectedSqFt * antimicrobialPerSqFt;
  const encapsulantMaterial = affectedSqFt * encapsulantPerSqFt;
  const clearanceMaterial = clearanceTest ? clearanceFee : 0;
  const hvacMaterial = hvacClean ? hvacCleanCost : 0;
  const dumpsterMaterial = dumpster ? dumpsterFee : 0;
  const materialCost = hepaMaterial + dehumidifierMaterial + zoneMaterial
    + demoMaterial + antimicrobialMaterial + encapsulantMaterial
    + clearanceMaterial + hvacMaterial + dumpsterMaterial;
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
    jobType,
    affectedSqFt,
    containmentZones,
    includedAffectedSqFt,
    includedContainmentZones,
    extraSqFt,
    extraZones,
    demoSqFt,
    hepaDays,
    dehumidifierDays,
    dryoutDays,
    clearanceTest,
    hvacClean,
    dumpster,
    occupied,
    loadedWage,
    setupHours,
    areaHours,
    zoneHours,
    demoHours,
    dryoutHours,
    clearanceHours,
    hvacHours,
    dumpsterHours,
    occupiedHours,
    containmentHours,
    serviceHours,
    siteHours,
    totalHours,
    laborCost,
    hepaMaterial,
    dehumidifierMaterial,
    zoneMaterial,
    demoMaterial,
    antimicrobialMaterial,
    encapsulantMaterial,
    clearanceMaterial,
    hvacMaterial,
    dumpsterMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: affectedSqFt === 0 ? null : price / affectedSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      setup: hourShare(setupHours),
      containment: hourShare(containmentHours),
      extras: hourShare(serviceHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: affectedSqFt === 0 ? null : proposedPrice / affectedSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the remediator can paste into a
 * proposal. Costs, wages, and kit invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Mold remediation') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perSqFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft of affected area`;
  const jobType = JOB_TYPE_PRESETS.find((item) => item.id === result.jobType)?.label ?? result.jobType;
  const demo = result.demoSqFt === 0
    ? 'no demolition this bid'
    : `${result.demoSqFt} sq ft demolition included`;
  const clearance = result.clearanceTest ? 'third-party clearance included' : 'no clearance this bid';
  const hvac = result.hvacClean ? 'HVAC / duct cleaning included' : 'no HVAC cleaning this bid';
  const dumpster = result.dumpster ? 'dumpster / disposal included' : 'no dumpster this bid';
  const occupied = result.occupied ? 'occupied-home access included' : 'vacant / unoccupied access';
  return [
    'MOLD REMEDIATION BID',
    '',
    `Proposed remediation price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.affectedSqFt} sq ft affected; ${result.containmentZones} containment zone${result.containmentZones === 1 ? '' : 's'}`,
    `Price per square foot of affected area: ${perSqFt}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Job type: ${jobType}`,
    `- HEPA days: ${result.hepaDays}; dehumidifier days: ${result.dehumidifierDays}`,
    `- ${demo}; ${clearance}; ${hvac}; ${dumpster}; ${occupied}`,
    `- Containment labor: ${result.containmentHours.toFixed(1)} h; extras: ${result.serviceHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm affected area, containment zones, demolition, equipment days, clearance testing, HVAC cleaning, disposal, occupancy, and all pricing before sending. It is not a mold inspection, a health determination, a clearance certificate, or a guarantee that any building will test below a spore or moisture threshold.',
  ].join('\n');
}
