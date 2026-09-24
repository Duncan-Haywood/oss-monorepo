// Deterministic bid pricing for an independent auto window tinting installer
// (a one-to-two-person shop or mobile installer, not a dealership-scale tint
// department) quoting a vehicle film job.
//
// The trade's own shorthand for pricing this work is a flat rate by vehicle
// size class -- "$180 sedan / $220 SUV / $250 truck" -- posted on a price
// list or quoted from memory. That number is what a customer expects to hear
// and it is *wrong* for the three things that actually drive the job's real
// cost: how many windows are actually being tinted (a "front two only"
// privacy job is a fraction of a full seven-window kit), which film tier the
// customer picked (ceramic film can run 3x the material cost of dyed film
// per square foot), and whether existing tint has to be stripped first
// (removal is slow, separate work from install -- especially on a rear
// windshield, where the defroster grid means the old film has to come off
// with a heat gun and patience instead of a fast peel, easily adding 30+
// minutes on its own). A "front two only" dyed-film job and a full
// ceramic kit with old-tint removal on every pane can both roll up to a shop
// calling it "one sedan" -- and a flat per-vehicle price cannot see the
// difference between them.
//
//   calculateTintBid(inputs)  -- full cost breakdown and the final price.
//   naiveFlatQuote(inputs)    -- what a flat per-vehicle price would have
//                                 quoted the same job, for comparison.
//   pricingGap(inputs)        -- the dollar and percent difference between
//                                 the two, and which direction it runs.
//
// This is a pricing worksheet only. It does not check your state's window
// tint darkness (VLT%) law, medical-exemption rules, or any other
// film-legality requirement, and it does not replace the installer's own
// judgment about scope or warranty terms.

// Base square footage and install minutes per window pane. Install minutes
// are per-pane labor time, not derived from square footage -- a small,
// tightly curved rear quarter window takes noticeably longer per square inch
// to lay down bubble-free than a large, flat front door window, and a rear
// windshield is usually cut and applied in two or three overlapping pieces
// to follow its compound curve. These are ballpark shop figures, not a
// production standard.
export const WINDOW_PRESETS = Object.freeze({
  frontDoor: { label: 'Front door window', sqFt: 4.0, installMinutes: 12 },
  rearDoor: { label: 'Rear door window', sqFt: 3.5, installMinutes: 12 },
  quarter: { label: 'Rear quarter window', sqFt: 1.4, installMinutes: 16 },
  rearWindshield: { label: 'Rear windshield', sqFt: 9.5, installMinutes: 40 },
});

// Minutes to strip existing film from one pane before the new film goes on,
// only charged when the job includes old-tint removal. The rear windshield
// is far slower than a flat door glass because of the defroster grid: heat,
// patience, and care not to lift a heating element, rather than a fast peel.
export const REMOVAL_MINUTES_PER_PANE = Object.freeze({
  frontDoor: 8,
  rearDoor: 8,
  quarter: 10,
  rearWindshield: 30,
});

// Film cost per square foot by tier, roll cost divided out. Ceramic runs
// several times dyed film's cost -- the material line, not the labor line,
// is where film tier mostly shows up in the final price.
export const FILM_TIERS = Object.freeze({
  dyed: { label: 'Dyed', costPerSqFt: 1.75 },
  carbon: { label: 'Carbon', costPerSqFt: 3.25 },
  ceramic: { label: 'Ceramic / nano-ceramic', costPerSqFt: 5.5 },
});

export const DEFAULTS = Object.freeze({
  frontDoorWindows: 2,
  rearDoorWindows: 2,
  quarterWindows: 2,
  rearWindshield: 1,
  filmTier: 'ceramic',
  removeOldTint: false,
  installerRate: 28,
  wasteFactorPercent: 15,
  boothOverhead: 12,
  mobileFee: 0,
  targetMarginPercent: 35,
  minimumJobFee: 120,
  naiveFlatRate: 200,
});

const PANE_TYPES = Object.freeze(['frontDoor', 'rearDoor', 'quarter', 'rearWindshield']);

function number(value, label, { min = 0, max = null, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== null && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  if (integer && !Number.isInteger(parsed)) throw new Error(`${label} must be a whole number.`);
  return parsed;
}

/**
 * Full cost breakdown and final price for one vehicle tint job.
 *
 * Film material cost is driven by total glass square footage (with a
 * cutting-waste factor) times the chosen film tier's cost per square foot.
 * Labor is driven by install minutes per pane, plus removal minutes per pane
 * when old tint has to come off first -- both counted directly, not derived
 * from square footage, because pane count and curvature (not area) are what
 * actually move install time. The result is priced at a target margin taken
 * on price (cost / (1 - margin)), the same convention
 * `land-survey-bid-calculator` uses, then floored at the minimum job fee.
 */
export function calculateTintBid(inputs = {}) {
  const counts = {
    frontDoor: number(inputs.frontDoorWindows ?? DEFAULTS.frontDoorWindows, 'Front door windows', { max: 2, integer: true }),
    rearDoor: number(inputs.rearDoorWindows ?? DEFAULTS.rearDoorWindows, 'Rear door windows', { max: 2, integer: true }),
    quarter: number(inputs.quarterWindows ?? DEFAULTS.quarterWindows, 'Rear quarter windows', { max: 4, integer: true }),
    rearWindshield: number(inputs.rearWindshield ?? DEFAULTS.rearWindshield, 'Rear windshield', { max: 1, integer: true }),
  };

  const filmTier = inputs.filmTier || DEFAULTS.filmTier;
  if (!(filmTier in FILM_TIERS)) {
    throw new Error(`Film tier must be one of ${Object.keys(FILM_TIERS).join(', ')}.`);
  }
  const removeOldTint = Boolean(inputs.removeOldTint ?? DEFAULTS.removeOldTint);

  const installerRate = number(inputs.installerRate ?? DEFAULTS.installerRate, 'Installer rate');
  const wasteFactorPercent = number(inputs.wasteFactorPercent ?? DEFAULTS.wasteFactorPercent, 'Waste factor percent');
  const boothOverhead = number(inputs.boothOverhead ?? DEFAULTS.boothOverhead, 'Booth / shop overhead');
  const mobileFee = number(inputs.mobileFee ?? DEFAULTS.mobileFee, 'Mobile / trip fee');
  const targetMarginPercent = number(inputs.targetMarginPercent ?? DEFAULTS.targetMarginPercent, 'Target margin percent', { max: 99.99 });
  const minimumJobFee = number(inputs.minimumJobFee ?? DEFAULTS.minimumJobFee, 'Minimum job fee');

  const totalPanes = PANE_TYPES.reduce((sum, type) => sum + counts[type], 0);
  if (totalPanes === 0) throw new Error('Select at least one window to tint.');

  const rawSqFt = PANE_TYPES.reduce((sum, type) => sum + counts[type] * WINDOW_PRESETS[type].sqFt, 0);
  const totalSqFt = rawSqFt * (1 + wasteFactorPercent / 100);
  const filmCost = totalSqFt * FILM_TIERS[filmTier].costPerSqFt;

  const installMinutes = PANE_TYPES.reduce((sum, type) => sum + counts[type] * WINDOW_PRESETS[type].installMinutes, 0);
  const removalMinutes = removeOldTint
    ? PANE_TYPES.reduce((sum, type) => sum + counts[type] * REMOVAL_MINUTES_PER_PANE[type], 0)
    : 0;
  const totalMinutes = installMinutes + removalMinutes;
  const laborHours = totalMinutes / 60;
  const laborCost = laborHours * installerRate;

  const directCost = filmCost + laborCost + boothOverhead + mobileFee;
  const priceAtMargin = directCost / (1 - targetMarginPercent / 100);
  const minimumApplied = priceAtMargin < minimumJobFee;
  const finalPrice = Math.max(priceAtMargin, minimumJobFee);

  return {
    counts,
    totalPanes,
    filmTier,
    removeOldTint,
    rawSqFt,
    totalSqFt,
    filmCost,
    installMinutes,
    removalMinutes,
    totalMinutes,
    laborHours,
    laborCost,
    boothOverhead,
    mobileFee,
    directCost,
    targetMarginPercent,
    priceAtMargin,
    minimumJobFee,
    minimumApplied,
    finalPrice,
  };
}

/** What a flat per-vehicle price would have quoted the same job. */
export function naiveFlatQuote(inputs = {}) {
  return number(inputs.naiveFlatRate ?? DEFAULTS.naiveFlatRate, 'Naive flat per-vehicle rate');
}

/**
 * The gap between the pane-and-film-driven quote above and a flat
 * per-vehicle quote for the same job: which one the naive method would have
 * left on the table (or overcharged), in dollars and as a percent of the
 * naive figure.
 */
export function pricingGap(inputs = {}) {
  const { finalPrice } = calculateTintBid(inputs);
  const naiveQuote = naiveFlatQuote(inputs);
  const dollarGap = finalPrice - naiveQuote;
  const percentGap = naiveQuote === 0 ? null : dollarGap / naiveQuote;
  return { finalPrice, naiveQuote, dollarGap, percentGap, underpriced: dollarGap > 0 };
}
