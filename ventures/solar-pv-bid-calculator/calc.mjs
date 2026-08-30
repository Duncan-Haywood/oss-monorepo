// Pure bid arithmetic for a rooftop (or ground-mount) solar PV install.
// No network, no state: every watt, wage, and adder is an input, so the
// result stays a transparent calculation the installer can check against
// their own invoices rather than a claim about what any system "should" cost.
//
// The method is the one the trade actually loses money on: a flat dollars-
// per-watt quote treats a 10 kW composition-roof job with a clean 200 A
// panel as the same job as a 10 kW tile-roof job that needs a 100 A → 200 A
// upgrade. The second one can eat the entire margin of a "$2.80/W" price.
// Equipment still scales with watts. Roof difficulty and electrical extras
// do not, and they have to be priced as their own hours and material.

// Starting roof-difficulty multipliers on array labor. These are ballpark
// figures to start from, NOT an industry standard or a guarantee: real
// multipliers depend on the crew, the roof, staging, and how much of the
// array is actually reachable without extra set-up.
export const ROOF_PRESETS = Object.freeze([
  { id: 'comp-easy', label: 'Composition shingle, 4/12–6/12, one array', factor: 1.0 },
  { id: 'comp-mid', label: 'Composition shingle, 7/12–9/12', factor: 1.18 },
  { id: 'comp-steep', label: 'Composition shingle, 10/12 or steeper', factor: 1.35 },
  { id: 'tile', label: 'Tile or slate (hooks and flashings)', factor: 1.45 },
  { id: 'metal', label: 'Metal standing-seam (clamps)', factor: 0.95 },
  { id: 'complex', label: 'Multiple arrays, hips, or valleys', factor: 1.25 },
  { id: 'ground', label: 'Ground mount (piers and trench)', factor: 1.4 },
]);

// Electrical extras that a per-watt quote almost always forgets. Hours and
// material are starting points; the installer replaces them with their own
// last-job numbers.
export const ELECTRICAL_PRESETS = Object.freeze([
  { id: 'none', label: 'None — 200 A service with room in the panel', hours: 0, material: 0 },
  { id: 'tap', label: 'Supply-side / load-side tap extra', hours: 4, material: 350 },
  { id: 'upgrade-200', label: 'Main-panel upgrade 100 A → 200 A', hours: 8, material: 1800 },
  { id: 'upgrade-400', label: 'Service upgrade 200 A → 400 A', hours: 16, material: 4500 },
  { id: 'subpanel', label: 'New subpanel / feeder for the inverter', hours: 4, material: 450 },
  { id: 'long-run', label: 'Long AC/DC run (50+ extra feet of conduit)', hours: 6, material: 400 },
  { id: 'trench', label: 'Trench to a detached structure or ground mount', hours: 8, material: 600 },
]);

export const SYSTEM_PRESETS = Object.freeze([
  { label: 'Residential 6.2 kW (16 × 390 W)', moduleCount: 16, wattsPerModule: 390 },
  { label: 'Residential 8.2 kW (21 × 390 W)', moduleCount: 21, wattsPerModule: 390 },
  { label: 'Residential 10.1 kW (26 × 390 W)', moduleCount: 26, wattsPerModule: 390 },
  { label: 'Residential 12.1 kW (31 × 390 W)', moduleCount: 31, wattsPerModule: 390 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price a solar PV install from system size, roof difficulty, electrical
 * extras, and the installer's own cost structure.
 *
 * @param {object} input
 * @param {number} input.moduleCount
 * @param {number} input.wattsPerModule
 * @param {number} input.moduleCostEach
 * @param {number} input.inverterCost
 * @param {number} input.rackingPerModule
 * @param {number} input.bosPerWatt        Wire, conduit, disconnects, monitoring.
 * @param {number} input.roofFactor        Multiplier on array labor hours.
 * @param {number} input.laborHoursPerKw   Crew hours per DC kW on an easy roof.
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate        Payroll burden as a % on top of wage.
 * @param {number} input.electricalHours
 * @param {number} input.electricalMaterial
 * @param {number} input.batteryHours
 * @param {number} input.batteryMaterial
 * @param {number} input.permitAndInterconnection
 * @param {number} input.designEngineering
 * @param {number} input.travelDumpsterLift
 * @param {number} input.overheadRate      Business overhead as a % on direct cost.
 * @param {number} input.targetMargin      Net profit as a % of the final price.
 * @param {number|null} input.proposedPrice Optional price already on the table.
 */
export function calculateBid(input) {
  const moduleCount = number(input.moduleCount ?? 0, 'Module count', { allowZero: false });
  const wattsPerModule = number(input.wattsPerModule ?? 0, 'Watts per module', { allowZero: false });
  const moduleCostEach = number(input.moduleCostEach ?? 0, 'Module cost');
  const inverterCost = number(input.inverterCost ?? 0, 'Inverter cost');
  const rackingPerModule = number(input.rackingPerModule ?? 0, 'Racking per module');
  const bosPerWatt = number(input.bosPerWatt ?? 0, 'BOS per watt');
  const roofFactor = number(input.roofFactor ?? 0, 'Roof factor', { allowZero: false });
  const laborHoursPerKw = number(input.laborHoursPerKw ?? 0, 'Labor hours per kW', { allowZero: false });
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const electricalHours = number(input.electricalHours ?? 0, 'Electrical extra hours');
  const electricalMaterial = number(input.electricalMaterial ?? 0, 'Electrical extra material');
  const batteryHours = number(input.batteryHours ?? 0, 'Battery hours');
  const batteryMaterial = number(input.batteryMaterial ?? 0, 'Battery material');
  const permitAndInterconnection = number(input.permitAndInterconnection ?? 0, 'Permit and interconnection');
  const designEngineering = number(input.designEngineering ?? 0, 'Design and engineering');
  const travelDumpsterLift = number(input.travelDumpsterLift ?? 0, 'Travel, dumpster, and lift');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const dcWatts = moduleCount * wattsPerModule;
  const dcKw = dcWatts / 1000;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  // Array labor scales with kW and then with the roof. Electrical and battery
  // extras are added after, because a panel upgrade does not get cheaper on a
  // smaller array and does not get more expensive on a larger one.
  const arrayHours = dcKw * laborHoursPerKw * roofFactor;
  const totalHours = arrayHours + electricalHours + batteryHours;
  const laborCost = totalHours * loadedWage;

  const moduleCost = moduleCount * moduleCostEach;
  const rackingCost = moduleCount * rackingPerModule;
  const bosCost = dcWatts * bosPerWatt;
  const equipmentCost = moduleCost + inverterCost + rackingCost + bosCost;
  const extraMaterial = electricalMaterial + batteryMaterial;
  const softCost = permitAndInterconnection + designEngineering + travelDumpsterLift;

  // Overhead is a markup on the direct cost of this job — office, vehicles,
  // and sales recovery. It is deliberately not applied to itself or to profit.
  const directCost = laborCost + equipmentCost + extraMaterial + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;

  // Margin is a share of price, not a markup on cost, because that is how
  // the customer's number is quoted and how the installer's P&L reads it.
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);

  return {
    moduleCount,
    wattsPerModule,
    dcWatts,
    dcKw,
    roofFactor,
    loadedWage,
    arrayHours,
    electricalHours,
    batteryHours,
    totalHours,
    laborCost,
    moduleCost,
    inverterCost,
    rackingCost,
    bosCost,
    equipmentCost,
    electricalMaterial,
    batteryMaterial,
    extraMaterial,
    permitAndInterconnection,
    designEngineering,
    travelDumpsterLift,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    // The two sanity numbers an installer checks a bid against: what it
    // works out to per watt, and what they are effectively billing per hour.
    pricePerWatt: dcWatts === 0 ? null : price / dcWatts,
    costPerWatt: dcWatts === 0 ? null : totalCost / dcWatts,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    // Price at which the job stops making money — the walk-away number when
    // a homeowner or a closer asks them to match a cheaper per-watt quote.
    breakEvenPrice: totalCost,
    breakEvenPerWatt: dcWatts === 0 ? null : totalCost / dcWatts,
    shares: {
      labor: costShare(laborCost),
      equipment: costShare(equipmentCost),
      extras: costShare(extraMaterial),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perWatt: dcWatts === 0 ? null : proposedPrice / dcWatts,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the installer can paste into a proposal.
 * Costs and wages are omitted on purpose — this is the customer-facing side.
 */
export function formatBidSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const watts = result.dcWatts.toLocaleString('en-US');
  return [
    'SOLAR PV INSTALL BID',
    '',
    `Proposed install price: ${money(result.price)}`,
    `System size: ${result.dcKw.toFixed(2)} kW DC (${result.moduleCount} modules × ${result.wattsPerModule} W)`,
    `Price per watt: ${result.pricePerWatt === null ? 'n/a' : `$${result.pricePerWatt.toFixed(2)}/W`}`,
    `Install labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Array: ${watts} W DC, roof factor ${result.roofFactor.toFixed(2)}`,
    `- Electrical extra: ${result.electricalHours.toFixed(1)} h`,
    result.batteryHours > 0 || result.batteryMaterial > 0
      ? `- Battery / backup: ${result.batteryHours.toFixed(1)} h`
      : null,
    '',
    'This is a draft for review. Confirm module layout, structural and electrical scope, permits, interconnection, incentives, taxes, and all pricing before sending.',
  ].filter((line) => line !== null).join('\n');
}
