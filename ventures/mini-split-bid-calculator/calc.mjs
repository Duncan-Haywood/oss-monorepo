// Pure bid arithmetic for a ductless mini-split / heat-pump install.
// No network, no state: every head, foot of line-set, wage, and adder is an
// input, so the result stays a transparent calculation the installer can
// check against their own invoices rather than a claim about what any
// system "should" cost.
//
// The method is the one the trade actually loses money on: a flat per-head
// or per-ton quote treats a first-floor 12k wall-mount with 15 ft of
// line-set and a gravity drain as the same job as a second-story cassette
// with 50 ft of line-set, a condensate pump, and a new 240 V circuit. The
// second one can eat the entire margin of a "$2,800 a head" price.
// Equipment still scales with heads. Line-set extras, height, head type,
// and electrical work do not, and they have to be priced as their own
// hours and material.

// Starting indoor-head labor multipliers. These are ballpark figures to
// start from, NOT an industry standard: real multipliers depend on the
// crew, the wall construction, and how much of the head is actually
// reachable without extra set-up.
export const HEAD_TYPE_PRESETS = Object.freeze([
  { id: 'wall', label: 'High-wall mount (standard)', factor: 1.0 },
  { id: 'floor', label: 'Floor console', factor: 1.1 },
  { id: 'cassette', label: 'Ceiling cassette', factor: 1.35 },
  { id: 'ducted', label: 'Concealed / short-run ducted', factor: 1.5 },
  { id: 'mixed', label: 'Mixed head types (use the harder one)', factor: 1.25 },
]);

// Height multiplies indoor and line-set labor only. The outdoor unit stays
// at grade; a second-story head does not make the pad pour cheaper.
export const STORY_PRESETS = Object.freeze([
  { id: 'first', label: 'First floor / slab, easy access', factor: 1.0 },
  { id: 'second', label: 'Second story', factor: 1.2 },
  { id: 'third', label: 'Third story or higher', factor: 1.45 },
  { id: 'ladder', label: 'Tall first-floor wall, ladder work', factor: 1.15 },
]);

// Electrical extras that a per-head quote almost always forgets. Hours and
// material are starting points; the installer replaces them with their own
// last-job numbers.
export const ELECTRICAL_PRESETS = Object.freeze([
  { id: 'existing', label: 'Existing 240 V disconnect in place', hours: 0, material: 0 },
  { id: 'circuit-20', label: 'New 20–30 A circuit + disconnect + whip', hours: 3.5, material: 280 },
  { id: 'circuit-40', label: 'New 40–50 A circuit + disconnect + whip', hours: 4.5, material: 380 },
  { id: 'subpanel', label: 'New subpanel / feeder for the outdoor', hours: 6, material: 520 },
  { id: 'relocate', label: 'Relocate disconnect or long outdoor whip', hours: 2.5, material: 160 },
]);

export const CONDENSATE_PRESETS = Object.freeze([
  { id: 'gravity', label: 'Gravity drain (short, pitched)', hours: 0, material: 0 },
  { id: 'pump', label: 'Condensate pump (no gravity path)', hours: 1.5, material: 180 },
  { id: 'long-drain', label: 'Long gravity drain or condensate line chase', hours: 2, material: 90 },
]);

export const SYSTEM_PRESETS = Object.freeze([
  {
    label: 'Single-zone 12k wall, first floor',
    headCount: 1,
    btuPerHead: 12000,
    outdoorUnitCost: 1400,
    indoorHeadCostEach: 550,
    branchBoxCost: 0,
    lineSetFeet: 15,
  },
  {
    label: 'Single-zone 18k wall, second story',
    headCount: 1,
    btuPerHead: 18000,
    outdoorUnitCost: 1700,
    indoorHeadCostEach: 620,
    branchBoxCost: 0,
    lineSetFeet: 35,
  },
  {
    label: 'Dual-zone 18k + 12k, first floor',
    headCount: 2,
    btuPerHead: 15000,
    outdoorUnitCost: 2200,
    indoorHeadCostEach: 580,
    branchBoxCost: 350,
    lineSetFeet: 40,
  },
  {
    label: 'Triple-zone, mixed heights',
    headCount: 3,
    btuPerHead: 12000,
    outdoorUnitCost: 2800,
    indoorHeadCostEach: 560,
    branchBoxCost: 420,
    lineSetFeet: 70,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price a mini-split install from heads, line-set extras, head type, story,
 * electrical extras, and the installer's own cost structure.
 *
 * @param {object} input
 * @param {number} input.headCount
 * @param {number} input.btuPerHead          Nominal capacity per indoor head.
 * @param {number} input.outdoorUnitCost
 * @param {number} input.indoorHeadCostEach
 * @param {number} input.branchBoxCost       Multi-zone branch box / headers.
 * @param {number} input.lineSetFeet         Total line-set length, all runs.
 * @param {number} input.includedFeetPerHead Feet the equipment quote includes.
 * @param {number} input.lineSetMaterialPerExtraFoot
 * @param {number} input.hoursPerExtraTenFeet
 * @param {number} input.headTypeFactor      Multiplier on indoor-head labor.
 * @param {number} input.storyFactor         Multiplier on indoor + line-set labor.
 * @param {number} input.indoorHoursPerHead  Mount, flare, drain on an easy wall.
 * @param {number} input.outdoorHours        Pad, mount, whip — not height-scaled.
 * @param {number} input.commissionHoursPerHead  Vacuum, charge, commission.
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.electricalHours
 * @param {number} input.electricalMaterial
 * @param {number} input.condensateHours
 * @param {number} input.condensateMaterial
 * @param {number} input.permitFee
 * @param {number} input.travelAndLift
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const headCount = number(input.headCount ?? 0, 'Head count', { allowZero: false });
  const btuPerHead = number(input.btuPerHead ?? 0, 'BTU per head', { allowZero: false });
  const outdoorUnitCost = number(input.outdoorUnitCost ?? 0, 'Outdoor unit cost');
  const indoorHeadCostEach = number(input.indoorHeadCostEach ?? 0, 'Indoor head cost');
  const branchBoxCost = number(input.branchBoxCost ?? 0, 'Branch box cost');
  const lineSetFeet = number(input.lineSetFeet ?? 0, 'Line-set feet');
  const includedFeetPerHead = number(input.includedFeetPerHead ?? 0, 'Included feet per head');
  const lineSetMaterialPerExtraFoot = number(input.lineSetMaterialPerExtraFoot ?? 0, 'Line-set material per extra foot');
  const hoursPerExtraTenFeet = number(input.hoursPerExtraTenFeet ?? 0, 'Hours per extra 10 feet');
  const headTypeFactor = number(input.headTypeFactor ?? 0, 'Head-type factor', { allowZero: false });
  const storyFactor = number(input.storyFactor ?? 0, 'Story factor', { allowZero: false });
  const indoorHoursPerHead = number(input.indoorHoursPerHead ?? 0, 'Indoor hours per head', { allowZero: false });
  const outdoorHours = number(input.outdoorHours ?? 0, 'Outdoor hours');
  const commissionHoursPerHead = number(input.commissionHoursPerHead ?? 0, 'Commission hours per head');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const electricalHours = number(input.electricalHours ?? 0, 'Electrical extra hours');
  const electricalMaterial = number(input.electricalMaterial ?? 0, 'Electrical extra material');
  const condensateHours = number(input.condensateHours ?? 0, 'Condensate hours');
  const condensateMaterial = number(input.condensateMaterial ?? 0, 'Condensate material');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');
  const travelAndLift = number(input.travelAndLift ?? 0, 'Travel and lift');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const totalBtu = headCount * btuPerHead;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  // Indoor labor scales with heads, then with head type, then with height.
  // Outdoor labor stays at grade. Line-set extras are the feet beyond what
  // the equipment quote already includes, and those hours climb with the
  // story because a 50 ft run to a second-floor head is not a 50 ft run
  // across a slab.
  const indoorHours = headCount * indoorHoursPerHead * headTypeFactor * storyFactor;
  const includedFeet = includedFeetPerHead * headCount;
  const extraLineSetFeet = Math.max(0, lineSetFeet - includedFeet);
  const lineSetHours = (extraLineSetFeet / 10) * hoursPerExtraTenFeet * storyFactor;
  const lineSetMaterial = extraLineSetFeet * lineSetMaterialPerExtraFoot;
  const commissionHours = headCount * commissionHoursPerHead;
  const totalHours = indoorHours + outdoorHours + lineSetHours + electricalHours + condensateHours + commissionHours;
  const laborCost = totalHours * loadedWage;

  const indoorEquipment = headCount * indoorHeadCostEach;
  const equipmentCost = outdoorUnitCost + indoorEquipment + branchBoxCost;
  const extraMaterial = electricalMaterial + condensateMaterial + lineSetMaterial;
  const softCost = permitFee + travelAndLift;

  const directCost = laborCost + equipmentCost + extraMaterial + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);

  return {
    headCount,
    btuPerHead,
    totalBtu,
    loadedWage,
    headTypeFactor,
    storyFactor,
    indoorHours,
    outdoorHours,
    extraLineSetFeet,
    lineSetHours,
    lineSetMaterial,
    electricalHours,
    condensateHours,
    commissionHours,
    totalHours,
    laborCost,
    outdoorUnitCost,
    indoorEquipment,
    branchBoxCost,
    equipmentCost,
    electricalMaterial,
    condensateMaterial,
    extraMaterial,
    permitFee,
    travelAndLift,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerHead: price / headCount,
    costPerHead: totalCost / headCount,
    pricePerKbtu: totalBtu === 0 ? null : price / (totalBtu / 1000),
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    breakEvenPerHead: totalCost / headCount,
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
      perHead: proposedPrice / headCount,
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
  const kbtu = (result.totalBtu / 1000).toFixed(1);
  return [
    'MINI-SPLIT / DUCTLESS INSTALL BID',
    '',
    `Proposed install price: ${money(result.price)}`,
    `System: ${result.headCount} indoor head${result.headCount === 1 ? '' : 's'}, ${kbtu} kBTU total`,
    `Price per head: ${money(result.pricePerHead)}`,
    `Install labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Indoor type factor ${result.headTypeFactor.toFixed(2)}, story factor ${result.storyFactor.toFixed(2)}`,
    `- Extra line-set: ${result.extraLineSetFeet.toFixed(1)} ft beyond included length`,
    `- Electrical extra: ${result.electricalHours.toFixed(1)} h`,
    result.condensateHours > 0 || result.condensateMaterial > 0
      ? `- Condensate: ${result.condensateHours.toFixed(1)} h`
      : null,
    '',
    'This is a draft for review. Confirm equipment selection, line-set path, electrical and condensate scope, permits, refrigerant handling, and all pricing before sending.',
  ].filter((line) => line !== null).join('\n');
}
