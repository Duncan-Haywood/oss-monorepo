// Pure bid arithmetic for concrete *lifting* (mudjacking / polyjacking),
// not a new slab pour and not a basement waterproofing job. No network,
// no state: every area, void depth, method, access path, wage, and extra
// is an input, so the result stays a transparent calculation the crew
// can check against their own invoices rather than a claim about what
// any sunken slab "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$4.50 / sq ft" or "$75 / hole" special treats an 80-square-foot
// sidewalk with a one-inch void and the truck parked at the curb as
// the same job as a 400-square-foot driveway with a four-inch void,
// polyurethane, a backyard hose run, extra holes, and joint sealing.
// Homeowners (and a lot of estimator sheets) count "square feet of
// slab." Void volume, the foam or slurry that fills it, backyard
// access, extra holes, and occupied-building containment do not live
// in that number. Matching a cheaper special written for the sidewalk
// is how a sold poly backyard hang becomes a two-day loss after the
// first extra hole.
//
// Distinct from a concrete *pour* (driveway / patio cubic yards) and
// from basement waterproofing (French drain, pit, discharge). This
// prices the lift: method, void volume, access, extra holes, and the
// extras that are not in the coupon.

export const METHOD_PRESETS = Object.freeze([
  { id: 'mud', label: 'Mudjacking / slabjacking (cement slurry)' },
  { id: 'poly', label: 'Polyurethane / polyjacking (foam)' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'drive', label: 'Driveway / street-side, truck at the slab' },
  { id: 'yard', label: 'Backyard / hose and pump distance' },
  { id: 'interior', label: 'Interior / occupied building' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Sidewalk 80 sf, 1-inch void, mud, street-side (the $4.50/sf special)',
    method: 'mud',
    access: 'drive',
    slabSqFt: 80,
    voidInches: 1,
    extraHoles: 0,
    addSeal: false,
  },
  {
    label: 'Driveway 280 sf, 2-inch void, mud, street-side, joint seal',
    method: 'mud',
    access: 'drive',
    slabSqFt: 280,
    voidInches: 2,
    extraHoles: 0,
    addSeal: true,
  },
  {
    label: 'Driveway 400 sf, 4-inch void, poly, backyard, 6 extra holes, joint seal',
    method: 'poly',
    access: 'yard',
    slabSqFt: 400,
    voidInches: 4,
    extraHoles: 6,
    addSeal: true,
  },
  {
    label: 'Interior warehouse 200 sf, 2-inch void, poly, occupied, 4 extra holes, seal',
    method: 'poly',
    access: 'interior',
    slabSqFt: 200,
    voidInches: 2,
    extraHoles: 4,
    addSeal: true,
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
 * Starting pump hours-per-cubic-foot and material-per-cubic-foot from
 * the lift method. These are ballpark crew figures, not a catalog.
 * Picking a method never overwrites a cost the shop has already typed.
 */
export function suggestedMethodKit(method) {
  const id = String(method);
  if (id === 'mud') {
    return { hoursLift: 1.2, hoursPerCf: 0.18, materialPerCf: 7.5 };
  }
  if (id === 'poly') {
    return { hoursLift: 0.8, hoursPerCf: 0.09, materialPerCf: 48 };
  }
  throw new Error('Unknown lift method');
}

/**
 * Starting access hours that are not the void volume. A truck at the
 * curb is not a hose through a side gate, and is not an occupied floor.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'drive') return { hoursAccess: 0 };
  if (id === 'yard') return { hoursAccess: 1.6 };
  if (id === 'interior') return { hoursAccess: 2.8 };
  throw new Error('Unknown access path');
}

/**
 * Void volume in cubic feet: the number a per-square-foot special
 * cannot see. A 400 sf driveway with a 4-inch void is 133 cf of fill,
 * not "400 square feet of slab."
 */
export function voidCubicFeet(slabSqFt, voidInches) {
  return number(slabSqFt, 'Slab square feet') * number(voidInches, 'Void depth') / 12;
}

/**
 * Price a concrete-lifting job from the method, the void volume, the
 * extras past a sidewalk special, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const slabSqFt = number(input.slabSqFt ?? 0, 'Slab square feet');
  const voidInches = number(input.voidInches ?? 0, 'Void depth');
  const extraHoles = number(input.extraHoles ?? 0, 'Extra holes');

  const method = String(input.method ?? 'mud');
  if (!METHOD_PRESETS.some((item) => item.id === method)) {
    throw new Error('Unknown lift method');
  }
  const access = String(input.access ?? 'drive');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) {
    throw new Error('Unknown access path');
  }

  const addSeal = flag(input.addSeal);
  const billInterior = access === 'interior';

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursLift = number(input.hoursLift ?? 0, 'Hours to set up the lift');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Backyard / interior hours');
  const hoursPerCf = number(input.hoursPerCf ?? 0, 'Hours per cubic foot');
  const hoursPerExtraHole = number(input.hoursPerExtraHole ?? 0, 'Hours per extra hole');
  const hoursSeal = number(input.hoursSeal ?? 0, 'Hours to seal joints');
  const hoursInterior = number(input.hoursInterior ?? 0, 'Hours for interior containment');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const materialPerCf = number(input.materialPerCf ?? 0, 'Material per cubic foot');
  const extraHoleCost = number(input.extraHoleCost ?? 0, 'Cost per extra hole');
  const sealCost = number(input.sealCost ?? 0, 'Joint seal / crack fill');
  const interiorKit = number(input.interiorKit ?? 0, 'Interior containment kit');
  const mobilizationFee = number(input.mobilizationFee ?? 0, 'Mobilization');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const volumeCf = voidCubicFeet(slabSqFt, voidInches);

  const tripHours = hoursTrip;
  const liftHours = hoursLift;
  const accessHours = hoursAccess;
  const pumpHours = volumeCf * hoursPerCf;
  const extraHoleHours = extraHoles * hoursPerExtraHole;
  const packageHours = (addSeal ? hoursSeal : 0)
    + (billInterior ? hoursInterior : 0);
  const totalHours = tripHours + liftHours + accessHours + pumpHours
    + extraHoleHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const fillMaterial = volumeCf * materialPerCf;
  const extraHoleMaterial = extraHoles * extraHoleCost;
  const sealMaterial = addSeal ? sealCost : 0;
  const interiorMaterial = billInterior ? interiorKit : 0;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = permitFee;
  const materialCost = fillMaterial + extraHoleMaterial + sealMaterial
    + interiorMaterial + mobilizationMaterial + permitMaterial;
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
    method,
    access,
    slabSqFt,
    voidInches,
    extraHoles,
    addSeal,
    volumeCf,
    loadedWage,
    tripHours,
    liftHours,
    accessHours,
    pumpHours,
    extraHoleHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    fillMaterial,
    extraHoleMaterial,
    sealMaterial,
    interiorMaterial,
    mobilizationMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: slabSqFt === 0 ? null : price / slabSqFt,
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
      lift: hourShare(liftHours),
      access: hourShare(accessHours),
      pump: hourShare(pumpHours),
      extraHoles: hourShare(extraHoleHours),
      extras: hourShare(packageHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
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
export function formatBidSummary(result, jobLabel = 'Concrete lifting') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const method = METHOD_PRESETS.find((item) => item.id === result.method)?.label ?? result.method;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const extras = [
    `${result.volumeCf.toFixed(1)} cf of void to fill`,
    result.access === 'yard' ? 'backyard hose / pump run included' : null,
    result.access === 'interior' ? 'occupied-building containment included' : null,
    result.extraHoles ? `${result.extraHoles} extra hole${result.extraHoles === 1 ? '' : 's'} included` : 'no extra holes this bid',
    result.addSeal ? 'joint seal / crack fill included' : 'no joint seal this bid',
  ].filter(Boolean);
  return [
    'CONCRETE LIFTING BID',
    '',
    `Proposed lift price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${method}`,
    `Access: ${access}; slab: ${result.slabSqFt} sf at ${result.voidInches} in void`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerSqFt === null ? null : `Effective: ${money(result.pricePerSqFt)} / sf`,
    '',
    'SCOPE BASIS',
    `- ${method}; ${access}`,
    `- ${result.slabSqFt} sf × ${result.voidInches} in = ${result.volumeCf.toFixed(1)} cf void`,
    `- Lift setup: ${result.liftHours.toFixed(1)} h; pump: ${result.pumpHours.toFixed(1)} h; access: ${result.accessHours.toFixed(1)} h; extra holes: ${result.extraHoleHours.toFixed(1)} h; extras: ${result.packageHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the slab area, the void depth, the lift method, access, extra holes, joint seal, and all pricing before sending. It is not a structural design, a building-code determination, a permit, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
