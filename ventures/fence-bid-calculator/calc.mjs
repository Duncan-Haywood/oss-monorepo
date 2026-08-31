// Pure bid arithmetic for a residential / light-commercial fence install.
// No network, no state: every rate and cost is an input, so the result stays
// a transparent calculation the contractor can check against their own
// material invoices and crew times rather than a claim about what any yard
// "should" cost.
//
// The method is the one the trade actually loses money ignoring: a fence is
// not linear feet × a published installed price. Posts, terminals, gates,
// tear-out, and digging conditions are most of the job. Two 140-foot runs
// — one flat chain-link with no gates, one 6-foot privacy with a walk gate,
// a drive gate, two corners, and 40 feet of tear-out — are not the same
// bid, and a flat per-foot number cannot see the difference.

export const WALK_GATE_WIDTH_FT = 4;
export const DRIVE_GATE_WIDTH_FT = 12;

// Digging and slope multiply labor hours, not material. Concrete and panels
// cost the same in rock; the extra is the crew time to set the posts.
export const DIG_PRESETS = Object.freeze([
  { id: 'normal', label: 'Normal soil', laborMultiplier: 1 },
  { id: 'clay', label: 'Heavy clay', laborMultiplier: 1.3 },
  { id: 'rocky', label: 'Rocky / hard dig', laborMultiplier: 1.8 },
]);

export const SLOPE_PRESETS = Object.freeze([
  { id: 'flat', label: 'Flat / racked panels', laborMultiplier: 1 },
  { id: 'mild', label: 'Mild slope (stepped)', laborMultiplier: 1.15 },
  { id: 'steep', label: 'Steep / stepped + extra posts', laborMultiplier: 1.4 },
]);

// Common starting material and production figures for a crew that already
// owns the tools. These are ballpark figures to start from, NOT a price
// book, an industry standard, or a guarantee. Real numbers depend on
// supplier, species, height, local wage, and how the crew actually works.
export const MATERIAL_PRESETS = Object.freeze([
  {
    id: 'wood-privacy-6',
    label: 'Wood privacy, 6 ft',
    heightFt: 6,
    postSpacingFt: 8,
    materialPerLf: 14,
    linePostCost: 22,
    terminalPostCost: 36,
    walkGateCost: 220,
    driveGateCost: 520,
    concretePerPost: 10,
    hoursPerLf: 0.14,
    hoursPerPost: 0.5,
    hoursPerWalkGate: 1.75,
    hoursPerDriveGate: 3.5,
    hoursPerTearOutLf: 0.18,
  },
  {
    id: 'wood-picket-4',
    label: 'Wood picket, 4 ft',
    heightFt: 4,
    postSpacingFt: 8,
    materialPerLf: 9,
    linePostCost: 16,
    terminalPostCost: 26,
    walkGateCost: 160,
    driveGateCost: 380,
    concretePerPost: 8,
    hoursPerLf: 0.11,
    hoursPerPost: 0.4,
    hoursPerWalkGate: 1.4,
    hoursPerDriveGate: 2.8,
    hoursPerTearOutLf: 0.14,
  },
  {
    id: 'chain-link-4',
    label: 'Chain-link, 4 ft',
    heightFt: 4,
    postSpacingFt: 10,
    materialPerLf: 7,
    linePostCost: 18,
    terminalPostCost: 42,
    walkGateCost: 140,
    driveGateCost: 320,
    concretePerPost: 12,
    hoursPerLf: 0.08,
    hoursPerPost: 0.45,
    hoursPerWalkGate: 1.1,
    hoursPerDriveGate: 2.2,
    hoursPerTearOutLf: 0.12,
  },
  {
    id: 'chain-link-6',
    label: 'Chain-link, 6 ft',
    heightFt: 6,
    postSpacingFt: 10,
    materialPerLf: 10,
    linePostCost: 24,
    terminalPostCost: 55,
    walkGateCost: 180,
    driveGateCost: 420,
    concretePerPost: 14,
    hoursPerLf: 0.1,
    hoursPerPost: 0.55,
    hoursPerWalkGate: 1.3,
    hoursPerDriveGate: 2.6,
    hoursPerTearOutLf: 0.14,
  },
  {
    id: 'vinyl-privacy-6',
    label: 'Vinyl privacy, 6 ft',
    heightFt: 6,
    postSpacingFt: 6,
    materialPerLf: 28,
    linePostCost: 42,
    terminalPostCost: 68,
    walkGateCost: 380,
    driveGateCost: 820,
    concretePerPost: 12,
    hoursPerLf: 0.1,
    hoursPerPost: 0.45,
    hoursPerWalkGate: 1.6,
    hoursPerDriveGate: 3.2,
    hoursPerTearOutLf: 0.16,
  },
  {
    id: 'aluminum-ornamental-4',
    label: 'Aluminum ornamental, 4 ft',
    heightFt: 4,
    postSpacingFt: 6,
    materialPerLf: 32,
    linePostCost: 48,
    terminalPostCost: 72,
    walkGateCost: 420,
    driveGateCost: 900,
    concretePerPost: 10,
    hoursPerLf: 0.09,
    hoursPerPost: 0.4,
    hoursPerWalkGate: 1.5,
    hoursPerDriveGate: 3,
    hoursPerTearOutLf: 0.12,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function integer(value, name, { min = 0 } = {}) {
  const result = number(value, name, { min });
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number`);
  return result;
}

/**
 * Count posts the way a layout actually consumes them.
 *
 * A run of L feet on spacing S needs a post at each end plus one every S
 * feet: ceil(L / S) + 1. Each corner adds a terminal that is not already on
 * that straight spacing. Ends and corners are terminals (heavier post,
 * more concrete); remaining posts are line posts.
 */
export function countPosts(linearFeet, postSpacingFt, corners = 0) {
  const length = number(linearFeet, 'Linear feet');
  const spacing = number(postSpacingFt, 'Post spacing', { allowZero: false });
  const extraCorners = integer(corners, 'Corners');
  if (length === 0) {
    return { linePosts: 0, terminalPosts: 0, totalPosts: 0 };
  }
  const alongRun = Math.ceil(length / spacing) + 1;
  const totalPosts = alongRun + extraCorners;
  const terminalPosts = Math.min(totalPosts, 2 + extraCorners);
  return {
    linePosts: totalPosts - terminalPosts,
    terminalPosts,
    totalPosts,
  };
}

/**
 * Upgrade line posts to terminals for gates that hang in the run, and add
 * extra terminals when the run does not have enough line posts left to
 * convert (a short run that is almost all gate).
 */
export function applyGatePosts(postCounts, walkGates, driveGates) {
  const walk = integer(walkGates, 'Walk gates');
  const drive = integer(driveGates, 'Drive gates');
  const needed = (walk + drive) * 2;
  const upgraded = Math.min(postCounts.linePosts, needed);
  const extra = needed - upgraded;
  return {
    linePosts: postCounts.linePosts - upgraded,
    terminalPosts: postCounts.terminalPosts + upgraded + extra,
    totalPosts: postCounts.totalPosts + extra,
    gatePosts: needed,
  };
}

function findPreset(id) {
  return MATERIAL_PRESETS.find(preset => preset.id === id) ?? null;
}

function laborMultiplier(presets, id, name) {
  if (id === undefined || id === null || id === '') return 1;
  const preset = presets.find(item => item.id === id);
  if (!preset) throw new Error(`${name} must be one of ${presets.map(item => item.id).join(', ')}`);
  return preset.laborMultiplier;
}

/**
 * Price a fence install from its runs and cost structure.
 *
 * @param {object} input
 * @param {Array<object>} input.runs
 *   One row per distinct run (front vs back, wood vs chain-link).
 *   Each run: {name?, linearFeet, postSpacingFt, corners, walkGates,
 *   driveGates, materialPerLf, linePostCost, terminalPostCost,
 *   walkGateCost, driveGateCost, concretePerPost, hoursPerLf,
 *   hoursPerPost, hoursPerWalkGate, hoursPerDriveGate} and optional
 *   walkGateWidthFt / driveGateWidthFt.
 * @param {number} input.tearOutFeet        Existing fence to pull.
 * @param {number} input.hoursPerTearOutLf  Crew hours per tear-out foot.
 * @param {number} input.tearOutPerFoot     Disposal / haul cost per foot.
 * @param {string} input.dig                normal | clay | rocky
 * @param {string} input.slope              flat | mild | steep
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate         Payroll burden as a % on wage.
 * @param {number} input.otherCost          Permits, dump, travel, extras.
 * @param {number} input.overheadRate       Overhead as a % on direct cost.
 * @param {number} input.targetMargin       Net profit as a % of price.
 * @param {number|null} input.proposedPrice Optional price already quoted.
 */
export function calculateBid(input) {
  const runsInput = Array.isArray(input.runs) ? input.runs : [];
  if (runsInput.length === 0) throw new Error('Add at least one fence run to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const tearOutFeet = number(input.tearOutFeet ?? 0, 'Tear-out feet');
  const hoursPerTearOutLf = number(input.hoursPerTearOutLf ?? 0, 'Tear-out hours per foot');
  const tearOutPerFoot = number(input.tearOutPerFoot ?? 0, 'Tear-out cost per foot');
  const otherCost = number(input.otherCost ?? 0, 'Other job cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const digMultiplier = laborMultiplier(DIG_PRESETS, input.dig ?? 'normal', 'Dig condition');
  const slopeMultiplier = laborMultiplier(SLOPE_PRESETS, input.slope ?? 'flat', 'Slope');
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const runs = runsInput.map((run, index) => {
    const label = run.name?.trim() || `Run ${index + 1}`;
    const linearFeet = number(run.linearFeet ?? 0, `${label}: linear feet`);
    const postSpacingFt = number(run.postSpacingFt ?? 0, `${label}: post spacing`, { allowZero: false });
    const corners = integer(run.corners ?? 0, `${label}: corners`);
    const walkGates = integer(run.walkGates ?? 0, `${label}: walk gates`);
    const driveGates = integer(run.driveGates ?? 0, `${label}: drive gates`);
    const walkWidth = number(run.walkGateWidthFt ?? WALK_GATE_WIDTH_FT, `${label}: walk gate width`, { allowZero: false });
    const driveWidth = number(run.driveGateWidthFt ?? DRIVE_GATE_WIDTH_FT, `${label}: drive gate width`, { allowZero: false });

    const materialPerLf = number(run.materialPerLf ?? 0, `${label}: material per foot`);
    const linePostCost = number(run.linePostCost ?? 0, `${label}: line post cost`);
    const terminalPostCost = number(run.terminalPostCost ?? 0, `${label}: terminal post cost`);
    const walkGateCost = number(run.walkGateCost ?? 0, `${label}: walk gate cost`);
    const driveGateCost = number(run.driveGateCost ?? 0, `${label}: drive gate cost`);
    const concretePerPost = number(run.concretePerPost ?? 0, `${label}: concrete per post`);
    const hoursPerLf = number(run.hoursPerLf ?? 0, `${label}: hours per foot`);
    const hoursPerPost = number(run.hoursPerPost ?? 0, `${label}: hours per post`);
    const hoursPerWalkGate = number(run.hoursPerWalkGate ?? 0, `${label}: hours per walk gate`);
    const hoursPerDriveGate = number(run.hoursPerDriveGate ?? 0, `${label}: hours per drive gate`);

    const gateWidth = walkGates * walkWidth + driveGates * driveWidth;
    if (gateWidth > linearFeet + 1e-9) {
      throw new Error(`${label}: gates are wider than the run`);
    }

    const posts = applyGatePosts(countPosts(linearFeet, postSpacingFt, corners), walkGates, driveGates);
    const infillFeet = Math.max(0, linearFeet - gateWidth);

    const infillCost = infillFeet * materialPerLf;
    const postMaterial = posts.linePosts * linePostCost + posts.terminalPosts * terminalPostCost;
    const gateMaterial = walkGates * walkGateCost + driveGates * driveGateCost;
    const concreteCost = posts.totalPosts * concretePerPost;
    const materialCost = infillCost + postMaterial + gateMaterial + concreteCost;

    const rawHours =
      infillFeet * hoursPerLf +
      posts.totalPosts * hoursPerPost +
      walkGates * hoursPerWalkGate +
      driveGates * hoursPerDriveGate;
    const laborHours = rawHours * digMultiplier * slopeMultiplier;
    const laborCost = laborHours * loadedWage;

    return {
      name: label,
      linearFeet,
      infillFeet,
      corners,
      walkGates,
      driveGates,
      ...posts,
      infillCost,
      postMaterial,
      gateMaterial,
      concreteCost,
      materialCost,
      laborHours,
      laborCost,
    };
  });

  const totalLinearFeet = runs.reduce((sum, run) => sum + run.linearFeet, 0);
  const totalInfillFeet = runs.reduce((sum, run) => sum + run.infillFeet, 0);
  const totalPosts = runs.reduce((sum, run) => sum + run.totalPosts, 0);
  const totalTerminals = runs.reduce((sum, run) => sum + run.terminalPosts, 0);
  const totalGates = runs.reduce((sum, run) => sum + run.walkGates + run.driveGates, 0);
  const runMaterial = runs.reduce((sum, run) => sum + run.materialCost, 0);
  const runLaborHours = runs.reduce((sum, run) => sum + run.laborHours, 0);

  const tearOutHours = tearOutFeet * hoursPerTearOutLf * digMultiplier * slopeMultiplier;
  const tearOutCost = tearOutFeet * tearOutPerFoot;
  const laborHours = runLaborHours + tearOutHours;
  const laborCost = laborHours * loadedWage;
  const materialCost = runMaterial + tearOutCost;

  const directCost = laborCost + materialCost + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const postsAndGatesShare = materialCost === 0
    ? 0
    : (runs.reduce((sum, run) => sum + run.postMaterial + run.gateMaterial + run.concreteCost, 0) + tearOutCost) / materialCost * 100;

  return {
    runs: runs.map(run => ({
      ...run,
      hoursShare: laborHours === 0 ? 0 : run.laborHours / laborHours * 100,
      materialShare: materialCost === 0 ? 0 : run.materialCost / materialCost * 100,
    })),
    totalLinearFeet,
    totalInfillFeet,
    totalPosts,
    totalTerminals,
    totalGates,
    tearOutFeet,
    tearOutHours,
    tearOutCost,
    loadedWage,
    digMultiplier,
    slopeMultiplier,
    laborHours,
    laborCost,
    materialCost,
    otherCost,
    overhead,
    totalCost,
    price,
    profit,
    // The two sanity numbers a contractor checks before sending a bid:
    // installed dollars per fence foot, and what the job bills per labor hour.
    pricePerLf: totalLinearFeet === 0 ? null : price / totalLinearFeet,
    effectiveHourlyRate: laborHours === 0 ? null : price / laborHours,
    breakEvenPrice: totalCost,
    postsAndGatesShare,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      perLf: totalLinearFeet === 0 ? null : proposedPrice / totalLinearFeet,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

export function presetById(id) {
  return findPreset(id);
}
