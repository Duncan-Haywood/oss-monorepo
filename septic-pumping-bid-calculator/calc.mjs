// Pure bid arithmetic for septic tank pumping and related service
// stops. No network, no state: every gallon, hose foot, lid, and
// wage is an input, so the result stays a transparent calculation the
// pumper can check against their own dump tickets rather than a claim
// about what any tank "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$325 pump special" treats a 1,000-gallon tank with an exposed lid
// and the truck at the riser as the same job as a 1,500-gallon two-tank
// system with a buried lid, a 150-foot hose, a pump chamber, baffles,
// and an after-hours call. Homeowners (and a lot of route sheets) count
// the same kind of number. Gallons over the included pump, buried lids,
// hose beyond the included run, extra tanks, baffles, risers, and
// emergency dispatch do not scale with "a pump is a pump." Matching a
// cheaper per-gallon quote written for the brochure driveway stop is
// how a sold buried two-tank job becomes a loss after the first dig.
//
// Distinct from basement waterproofing (wells, pit, and discharge),
// water-heater replacement (vent, gas upsize, and attic), foundation
// repair (access, extra shaft, and straps), and junk-removal / dumpster
// (haul volume and landfill tickets). This prices a septic service
// stop: the pump, the access, the extra gallons, and the dump fee.

export const ACCESS_PRESETS = Object.freeze([
  { id: 'exposed', label: 'Exposed lid, truck at tank' },
  { id: 'buried', label: 'Buried lid, locate and dig' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '1,000-gal exposed lid, 40 ft hose, pump only (the brochure special)',
    tankGallons: 1000,
    extraTankGallons: 0,
    extraTankCount: 0,
    hoseFeet: 40,
    access: 'exposed',
    replaceBaffles: false,
    riserCount: 0,
    inspectionReport: false,
    afterHours: false,
  },
  {
    label: '1,250-gal buried lid, 80 ft hose, one riser',
    tankGallons: 1250,
    extraTankGallons: 0,
    extraTankCount: 0,
    hoseFeet: 80,
    access: 'buried',
    replaceBaffles: false,
    riserCount: 1,
    inspectionReport: false,
    afterHours: false,
  },
  {
    label: 'Two-tank + pump chamber, buried lids, 150 ft hose, baffles, inspection',
    tankGallons: 1250,
    extraTankGallons: 750,
    extraTankCount: 2,
    hoseFeet: 150,
    access: 'buried',
    replaceBaffles: true,
    riserCount: 2,
    inspectionReport: true,
    afterHours: false,
  },
  {
    label: 'After-hours emergency, 1,500-gal buried, 120 ft hose, extra tank',
    tankGallons: 1500,
    extraTankGallons: 500,
    extraTankCount: 1,
    hoseFeet: 120,
    access: 'buried',
    replaceBaffles: false,
    riserCount: 0,
    inspectionReport: false,
    afterHours: true,
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
 * Starting dump-ticket figures. A larger primary tank does not change
 * the trip fee; only the per-gallon line moves. Picking a preset never
 * overwrites a cost the pumper has already typed.
 */
export function suggestedDisposal(tankGallons) {
  const gallons = number(tankGallons, 'Tank gallons', { allowZero: false });
  if (gallons >= 1500) return { dumpTripFee: 110, disposalPerGallon: 0.1 };
  if (gallons >= 1250) return { dumpTripFee: 95, disposalPerGallon: 0.09 };
  return { dumpTripFee: 80, disposalPerGallon: 0.08 };
}

/**
 * Starting access hours. Buried lids are billed as their own locate-
 * and-dig block; an exposed lid drops that block to zero.
 */
export function suggestedAccessHours(access) {
  const id = String(access);
  if (id === 'exposed') return { hoursBuriedLid: 0 };
  if (id === 'buried') return { hoursBuriedLid: 1.25 };
  throw new Error('Unknown access');
}

/**
 * Price a septic pump (and optional risers, baffles, inspection, or
 * after-hours dispatch) from gallons, hose, access, and the
 * contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const tankGallons = number(input.tankGallons ?? 0, 'Tank gallons', { allowZero: false });
  const extraTankGallons = number(input.extraTankGallons ?? 0, 'Extra tank gallons');
  const extraTankCount = number(input.extraTankCount ?? 0, 'Extra tank count');
  const hoseFeet = number(input.hoseFeet ?? 0, 'Hose feet');
  const includedGallons = number(input.includedGallons ?? 0, 'Included gallons', { allowZero: false });
  const includedHoseFeet = number(input.includedHoseFeet ?? 0, 'Included hose feet');
  const riserCount = number(input.riserCount ?? 0, 'Riser count');

  const access = String(input.access ?? 'exposed');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) {
    throw new Error('Unknown access');
  }

  const buriedLid = access === 'buried';
  const replaceBaffles = flag(input.replaceBaffles);
  const inspectionReport = flag(input.inspectionReport);
  const afterHours = flag(input.afterHours);

  const hoursBasePump = number(input.hoursBasePump ?? 0, 'Hours for a base pump');
  const hoursPerExtra100Gal = number(input.hoursPerExtra100Gal ?? 0, 'Hours per extra 100 gallons');
  const hoursBuriedLid = number(input.hoursBuriedLid ?? 0, 'Hours to locate and dig a buried lid');
  const hoursPerHoseFoot = number(input.hoursPerHoseFoot ?? 0, 'Hours per extra hose foot');
  const hoursPerExtraTank = number(input.hoursPerExtraTank ?? 0, 'Hours per extra tank');
  const hoursBaffles = number(input.hoursBaffles ?? 0, 'Hours to replace baffles');
  const hoursPerRiser = number(input.hoursPerRiser ?? 0, 'Hours per riser');
  const hoursInspection = number(input.hoursInspection ?? 0, 'Hours for an inspection report');
  const hoursAfterHours = number(input.hoursAfterHours ?? 0, 'Hours for after-hours dispatch');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const dumpTripFee = number(input.dumpTripFee ?? 0, 'Dump trip fee');
  const disposalPerGallon = number(input.disposalPerGallon ?? 0, 'Disposal per gallon');
  const baffleKitCost = number(input.baffleKitCost ?? 0, 'Baffle kit');
  const riserCostEach = number(input.riserCostEach ?? 0, 'Riser cost each');
  const afterHoursFee = number(input.afterHoursFee ?? 0, 'After-hours fee');
  const permitFee = number(input.permitFee ?? 0, 'Permit / report fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const totalGallons = tankGallons + extraTankGallons;
  const extraGallons = Math.max(0, totalGallons - includedGallons);
  const extraHoseFeet = Math.max(0, hoseFeet - includedHoseFeet);

  const pumpHours = hoursBasePump;
  const gallonHours = (extraGallons / 100) * hoursPerExtra100Gal;
  const lidHours = buriedLid ? hoursBuriedLid : 0;
  const hoseHours = extraHoseFeet * hoursPerHoseFoot;
  const extraTankHours = extraTankCount * hoursPerExtraTank;
  const baffleHours = replaceBaffles ? hoursBaffles : 0;
  const riserHours = riserCount * hoursPerRiser;
  const inspectionHours = inspectionReport ? hoursInspection : 0;
  const emergencyHours = afterHours ? hoursAfterHours : 0;

  const accessHours = lidHours + hoseHours + extraTankHours;
  const serviceHours = baffleHours + riserHours + inspectionHours + emergencyHours;
  const totalHours = pumpHours + gallonHours + accessHours + serviceHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const disposalMaterial = dumpTripFee + totalGallons * disposalPerGallon;
  const baffleMaterial = replaceBaffles ? baffleKitCost : 0;
  const riserMaterial = riserCount * riserCostEach;
  const emergencyMaterial = afterHours ? afterHoursFee : 0;
  const permitMaterial = inspectionReport ? permitFee : 0;
  const materialCost = disposalMaterial + baffleMaterial + riserMaterial
    + emergencyMaterial + permitMaterial;
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
    tankGallons,
    extraTankGallons,
    extraTankCount,
    hoseFeet,
    includedGallons,
    includedHoseFeet,
    extraGallons,
    extraHoseFeet,
    totalGallons,
    access,
    buriedLid,
    replaceBaffles,
    riserCount,
    inspectionReport,
    afterHours,
    loadedWage,
    pumpHours,
    gallonHours,
    lidHours,
    hoseHours,
    extraTankHours,
    baffleHours,
    riserHours,
    inspectionHours,
    emergencyHours,
    accessHours,
    serviceHours,
    siteHours,
    totalHours,
    laborCost,
    disposalMaterial,
    baffleMaterial,
    riserMaterial,
    emergencyMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerGallon: totalGallons === 0 ? null : price / totalGallons,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      pump: hourShare(pumpHours + gallonHours),
      access: hourShare(accessHours),
      extras: hourShare(serviceHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perGallon: totalGallons === 0 ? null : proposedPrice / totalGallons,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the pumper can paste into a
 * proposal. Costs, wages, and dump tickets are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Septic pumping / service stop') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perGallon = result.pricePerGallon === null
    ? 'n/a'
    : `${money(result.pricePerGallon)} / gallon pumped`;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const baffles = result.replaceBaffles ? 'baffle replacement included' : 'baffles not in this bid';
  const risers = result.riserCount === 0
    ? 'no risers this bid'
    : `${result.riserCount} riser${result.riserCount === 1 ? '' : 's'} included`;
  const inspect = result.inspectionReport ? 'written inspection included' : 'no written inspection this bid';
  const emergency = result.afterHours ? 'after-hours / emergency dispatch included' : 'scheduled daytime stop';
  const extraTanks = result.extraTankCount === 0
    ? 'single tank'
    : `${result.extraTankCount} extra tank${result.extraTankCount === 1 ? '' : 's'} / chamber`;
  return [
    'SEPTIC PUMPING / SERVICE BID',
    '',
    `Proposed pump / service price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.totalGallons} gallons; ${access}`,
    `Price per gallon pumped: ${perGallon}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Primary tank ${result.tankGallons} gal; extra volume ${result.extraTankGallons} gal (${extraTanks})`,
    `- Hose: ${result.hoseFeet} ft (${result.extraHoseFeet} ft beyond included); ${access}`,
    `- ${baffles}; ${risers}; ${inspect}; ${emergency}`,
    `- Access labor: ${result.accessHours.toFixed(1)} h; extras: ${result.serviceHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm tank size, access, hose run, extra tanks, baffles, risers, inspection, after-hours dispatch, disposal, and all pricing before sending. It is not a septic design, a code determination, a permit, or an environmental report.',
  ].join('\n');
}
