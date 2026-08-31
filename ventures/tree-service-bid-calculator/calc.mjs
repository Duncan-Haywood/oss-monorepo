// Pure bid arithmetic for a residential / light-commercial tree-service stop.
// No network, no state: every wage, hour factor, and fee is an input, so the
// result stays a transparent calculation the owner can check against their
// own payroll and dump tickets rather than a claim about what any tree
// "should" cost.
//
// The method is the one that actually drives the job, not a day-rate guess
// and not a flat "per inch" rule. Wood volume (and the climbing / rigging
// complexity that rides with it) scales with the square of diameter at
// breast height. Access and targets change the hours more than species does.
// Stump grinding, haul, and the drive out there are the three lines that
// get forgotten and eat the margin on an otherwise fine-looking bid.

export const REFERENCE_DBH_INCHES = 12;
export const REFERENCE_HEIGHT_FEET = 50;
export const MIN_HEIGHT_FACTOR = 0.55;
export const MAX_HEIGHT_FACTOR = 1.8;

export const SPECIES_PRESETS = Object.freeze([
  { id: 'softwood', label: 'Softwood (pine, spruce, fir, cedar)', factor: 0.85 },
  { id: 'mixed', label: 'Mixed / unknown', factor: 1.0 },
  { id: 'hardwood', label: 'Hardwood (oak, maple, hickory, beech)', factor: 1.25 },
  { id: 'palm', label: 'Palm', factor: 0.7 },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'street', label: 'Street / driveway — chipper at the tree', multiplier: 1.0 },
  { id: 'side', label: 'Side yard — chipper reaches', multiplier: 1.15 },
  { id: 'backyard', label: 'Backyard — carry brush to the chipper', multiplier: 1.4 },
  { id: 'tight', label: 'Tight backyard / over a structure', multiplier: 1.75 },
  { id: 'crane', label: 'Crane required', multiplier: 2.1 },
]);

export const HAUL_PRESETS = Object.freeze([
  { id: 'leave', label: 'Leave wood on site', hourShare: 0, dump: false },
  { id: 'chip_site', label: 'Chip on site, leave chips', hourShare: 0.12, dump: false },
  { id: 'chip_haul', label: 'Chip and haul', hourShare: 0.35, dump: true },
  { id: 'log_haul', label: 'Haul logs / dump', hourShare: 0.45, dump: true },
]);

export const HAZARD_PREMIUMS = Object.freeze({
  nearStructure: 0.25,
  nearPower: 0.4,
  deadHazard: 0.2,
});

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function lookup(presets, id, name) {
  const match = presets.find(preset => preset.id === id);
  if (!match) throw new Error(`${name} is not a recognised option`);
  return match;
}

export function heightFactor(heightFeet) {
  const height = number(heightFeet ?? REFERENCE_HEIGHT_FEET, 'Height', { allowZero: false });
  const raw = height / REFERENCE_HEIGHT_FEET;
  return Math.min(MAX_HEIGHT_FACTOR, Math.max(MIN_HEIGHT_FACTOR, raw));
}

export function stumpGrindHours(stumpDiameterInches) {
  const diameter = number(stumpDiameterInches ?? 0, 'Stump diameter');
  if (diameter === 0) return 0;
  // Setup plus a grind that grows with stump *area*, not just diameter — the
  // same (diameter / reference)^2 shape used for removal hours above, because
  // a grinder wheel has to sweep the whole cross-section, not just cross it
  // once. A stump twice the diameter is four times the face to clear, not
  // twice, which a linear "per inch" grind estimate (as this used to be)
  // understates on exactly the large stumps that eat a Saturday. A 12" stump
  // is about 0.6 h; a 36" stump (3x the diameter, 9x the face) is about 3.8 h
  // — in the range a two-person grind crew actually spends, including
  // repositioning, on a stump that size.
  return 0.2 + (diameter / REFERENCE_DBH_INCHES) ** 2 * 0.4;
}

/**
 * Price a tree-service stop from the trees on it and the crew's cost structure.
 *
 * @param {object} input
 * @param {Array<object>} input.trees
 *   One row per tree. Splitting the stop this way is the whole point: a 24"
 *   backyard oak next to the house is a different job from a 12" pine on the
 *   street, and a blended "two trees, $X" quote cannot see that.
 * @param {number} input.crewHourlyRate   What the whole crew is paid per hour.
 * @param {number} input.burdenRate       Payroll burden as a % on top of wage.
 * @param {number} input.equipmentHourly  Chipper, truck, and fuel per on-site hour.
 * @param {number} input.craneDayRate     Charged once if any tree needs a crane.
 * @param {number} input.dumpFeePerTree   Landfill / dump ticket on hauled trees.
 * @param {number} input.otherJobCost     Anything else billed to this stop.
 * @param {number} input.overheadRate     Business overhead as a % on direct cost.
 * @param {number} input.targetMargin     Net profit as a % of the final price.
 * @param {number} input.minimumJob       Mobilization / stop-charge floor.
 * @param {number} input.travelMinutes    Round-trip drive for the whole crew.
 * @param {number|null} input.proposedPrice Optional price already on the table.
 */
export function calculateBid(input) {
  const treesInput = Array.isArray(input.trees) ? input.trees : [];
  if (treesInput.length === 0) throw new Error('Add at least one tree to price');

  const crewHourlyRate = number(input.crewHourlyRate ?? 0, 'Crew hourly rate');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const equipmentHourly = number(input.equipmentHourly ?? 0, 'Equipment hourly');
  const craneDayRate = number(input.craneDayRate ?? 0, 'Crane day rate');
  const dumpFeePerTree = number(input.dumpFeePerTree ?? 0, 'Dump fee per tree');
  const otherJobCost = number(input.otherJobCost ?? 0, 'Other job cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  const minimumJob = number(input.minimumJob ?? 0, 'Minimum job');
  const travelMinutes = number(input.travelMinutes ?? 0, 'Travel minutes');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedCrewRate = crewHourlyRate * (1 + burdenRate / 100);
  const travelHours = travelMinutes / 60;

  const trees = treesInput.map((tree, index) => {
    const label = tree.name?.trim() || `Tree ${index + 1}`;
    const dbhInches = number(tree.dbhInches ?? 0, `${label}: DBH`, { allowZero: false });
    const heightFeet = number(tree.heightFeet ?? REFERENCE_HEIGHT_FEET, `${label}: height`, { allowZero: false });
    const species = lookup(SPECIES_PRESETS, tree.species || 'mixed', `${label}: species`);
    const access = lookup(ACCESS_PRESETS, tree.access || 'street', `${label}: access`);
    const haul = lookup(HAUL_PRESETS, tree.haul || 'leave', `${label}: haul`);
    const grindStump = Boolean(tree.grindStump);
    const nearStructure = Boolean(tree.nearStructure);
    const nearPower = Boolean(tree.nearPower);
    const deadHazard = Boolean(tree.deadHazard);

    const hazardPremium =
      (nearStructure ? HAZARD_PREMIUMS.nearStructure : 0)
      + (nearPower ? HAZARD_PREMIUMS.nearPower : 0)
      + (deadHazard ? HAZARD_PREMIUMS.deadHazard : 0);

    // (DBH / 12)^2 is the volume stand-in. A 24" tree is four times the wood
    // of a 12" tree of the same height, not twice — which is why a linear
    // "per inch" quote underprices the big one and overprices the small one.
    const sizeFactor = (dbhInches / REFERENCE_DBH_INCHES) ** 2;
    const baseRemovalHours = sizeFactor * species.factor * heightFactor(heightFeet);
    const removalHours = baseRemovalHours * access.multiplier * (1 + hazardPremium);
    const grindHours = grindStump ? stumpGrindHours(tree.stumpDiameterInches ?? dbhInches) : 0;
    const haulHours = baseRemovalHours * haul.hourShare;
    const onSiteHours = removalHours + grindHours + haulHours;
    const dumpFee = haul.dump ? dumpFeePerTree : 0;

    return {
      name: label,
      dbhInches,
      heightFeet,
      species: species.id,
      speciesLabel: species.label,
      access: access.id,
      accessLabel: access.label,
      haul: haul.id,
      haulLabel: haul.label,
      grindStump,
      nearStructure,
      nearPower,
      deadHazard,
      hazardPremium,
      sizeFactor,
      baseRemovalHours,
      removalHours,
      grindHours,
      haulHours,
      onSiteHours,
      dumpFee,
      needsCrane: access.id === 'crane',
    };
  });

  const onSiteHours = trees.reduce((sum, tree) => sum + tree.onSiteHours, 0);
  const dumpFees = trees.reduce((sum, tree) => sum + tree.dumpFee, 0);
  const needsCrane = trees.some(tree => tree.needsCrane);
  const craneCost = needsCrane ? craneDayRate : 0;
  const laborHours = onSiteHours + travelHours;
  const laborCost = laborHours * loadedCrewRate;
  const equipmentCost = onSiteHours * equipmentHourly + craneCost + dumpFees + otherJobCost;
  const directCost = laborCost + equipmentCost;
  const overhead = directCost * overheadRate / 100;
  const jobCost = directCost + overhead;
  const marginPrice = jobCost / (1 - targetMargin / 100);
  const recommendedPrice = Math.max(marginPrice, minimumJob);
  const minimumApplied = recommendedPrice > marginPrice + 1e-9;
  const profit = recommendedPrice - jobCost;
  const totalDbh = trees.reduce((sum, tree) => sum + tree.dbhInches, 0);

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    trees: trees.map(tree => ({
      ...tree,
      hoursShare: onSiteHours === 0 ? 0 : tree.onSiteHours / onSiteHours * 100,
      // Allocate the recommended price by on-site hours so a two-tree quote
      // still shows which tree is carrying the job. Travel, overhead, and
      // the minimum are shared, so this is a split of the bid, not a
      // standalone price for that tree alone.
      allocatedPrice: onSiteHours === 0
        ? recommendedPrice / trees.length
        : recommendedPrice * (tree.onSiteHours / onSiteHours),
    })),
    loadedCrewRate,
    onSiteHours,
    travelHours,
    laborHours,
    laborCost,
    equipmentCost,
    dumpFees,
    craneCost,
    otherJobCost,
    overhead,
    directCost,
    jobCost,
    marginPrice,
    recommendedPrice,
    minimumApplied,
    minimumJob,
    profit,
    totalDbh,
    pricePerInch: totalDbh === 0 ? null : recommendedPrice / totalDbh,
    effectiveHourlyRate: laborHours === 0 ? null : recommendedPrice / laborHours,
    breakEvenPrice: jobCost,
    quoteFloor: Math.max(jobCost, minimumJob),
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - jobCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - jobCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      belowBreakEven: proposedPrice < jobCost,
      belowMinimum: proposedPrice < minimumJob,
    },
  };
}
