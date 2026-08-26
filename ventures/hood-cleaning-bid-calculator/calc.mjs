// Pure bid arithmetic for a commercial kitchen exhaust (hood) cleaning job.
// No network, no state: every minute, wage, and multiplier is an input, so
// the result stays a transparent calculation the contractor can check against
// their own time cards rather than a claim about what any restaurant "should"
// cost.
//
// The method is the one the trade actually loses money by skipping: price the
// system — canopy, filters, duct, and fan — not the hood count. A 10-foot
// canopy with eight feet of horizontal duct is a different job from the same
// canopy with thirty feet of vertical duct and a rooftop fan, and a flat
// "per hood" number cannot see the difference.

// Starting production minutes. These are ballpark figures to start from, NOT
// an industry standard, an NFPA requirement, or a guarantee. Real minutes
// depend on grease load, access, crew, and whether the duct has clean-outs.
export const COMPONENT_PRESETS = Object.freeze([
  { label: 'Canopy hood (listed sq ft)', kind: 'hood', unit: 'sq ft', minutesPerUnit: 4 },
  { label: 'Hood filters (each)', kind: 'hood', unit: 'each', minutesPerUnit: 4 },
  { label: 'Horizontal duct (linear ft)', kind: 'duct', unit: 'lin ft', minutesPerUnit: 8 },
  { label: 'Vertical duct (linear ft)', kind: 'duct', unit: 'lin ft', minutesPerUnit: 15 },
  { label: 'Rooftop exhaust fan (each)', kind: 'fan', unit: 'each', minutesPerUnit: 60 },
  { label: 'Wall exhaust fan (each)', kind: 'fan', unit: 'each', minutesPerUnit: 35 },
  { label: 'Makeup-air unit (each)', kind: 'fan', unit: 'each', minutesPerUnit: 40 },
  { label: 'Clean-out door work (each)', kind: 'duct', unit: 'each', minutesPerUnit: 15 },
]);

// Grease-load multipliers on production minutes. Labels mention common
// cooking styles only as a starting point — the contractor still times the
// job. Suggested cleans/year follow the cadence operators often use; they
// are not a code determination.
export const GREASE_LOADS = Object.freeze([
  { id: 'light', label: 'Light (bakery, pizza, church kitchen)', multiplier: 1.0, suggestedCleansPerYear: 1 },
  { id: 'moderate', label: 'Moderate (casual dining)', multiplier: 1.25, suggestedCleansPerYear: 2 },
  { id: 'heavy', label: 'Heavy (steakhouse, charbroiler)', multiplier: 1.6, suggestedCleansPerYear: 4 },
  { id: 'extra_heavy', label: 'Extra heavy (24h, wok, solid fuel)', multiplier: 2.1, suggestedCleansPerYear: 12 },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'kitchen_floor', label: 'Kitchen floor / easy', multiplier: 1.0 },
  { id: 'above_ceiling', label: 'Above ceiling / interior chase', multiplier: 1.2 },
  { id: 'rooftop_easy', label: 'Rooftop — easy access', multiplier: 1.35 },
  { id: 'rooftop_hard', label: 'Rooftop — ladder, hatch, or confined', multiplier: 1.7 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function kindOf(label) {
  const preset = COMPONENT_PRESETS.find(item => item.label === label);
  return preset?.kind || 'other';
}

/**
 * Price one kitchen-exhaust cleaning (and the contract it repeats as) from
 * the system components and the contractor's cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, quantity: number, minutesPerUnit: number, accessMultiplier: number}>} input.components
 * @param {number} input.greaseMultiplier
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate          Payroll burden as a % on wage.
 * @param {number} input.crewSize            Techs on site; used for wall-clock only.
 * @param {number} input.travelHours         Round-trip drive time, hours.
 * @param {number} input.travelTechs         Techs paid for the drive.
 * @param {number} input.afterHoursPremium   Extra % on on-site labor only.
 * @param {number} input.consumablesPerJob
 * @param {number} input.consumablesPerHoodSqFt
 * @param {number} input.disposalFee
 * @param {number} input.otherJobCost
 * @param {number} input.overheadRate        % markup on direct cost.
 * @param {number} input.targetMargin        Net profit as a % of price.
 * @param {number} input.cleansPerYear
 * @param {number|null} input.proposedPrice  Optional price already on the table.
 */
export function calculateBid(input) {
  const rows = Array.isArray(input.components) ? input.components : [];
  if (rows.length === 0) throw new Error('Add at least one system component to price');

  const greaseMultiplier = number(input.greaseMultiplier ?? 1, 'Grease-load multiplier', { allowZero: false });
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const crewSize = number(input.crewSize ?? 1, 'Crew size', { min: 1, allowZero: false });
  const travelHours = number(input.travelHours ?? 0, 'Travel hours');
  const travelTechs = number(input.travelTechs ?? 0, 'Travel techs');
  const afterHoursPremium = number(input.afterHoursPremium ?? 0, 'After-hours premium');
  const consumablesPerJob = number(input.consumablesPerJob ?? 0, 'Consumables per job');
  const consumablesPerHoodSqFt = number(input.consumablesPerHoodSqFt ?? 0, 'Consumables per hood sq ft');
  const disposalFee = number(input.disposalFee ?? 0, 'Disposal fee');
  const otherJobCost = number(input.otherJobCost ?? 0, 'Other job cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const cleansPerYear = number(input.cleansPerYear ?? 0, 'Cleans per year');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const components = rows.map((row, index) => {
    const label = row.name?.trim() || `Component ${index + 1}`;
    const quantity = number(row.quantity ?? 0, `${label}: quantity`);
    const minutesPerUnit = number(row.minutesPerUnit ?? 0, `${label}: minutes per unit`, { allowZero: false });
    const accessMultiplier = number(row.accessMultiplier ?? 1, `${label}: access multiplier`, { allowZero: false });
    const kind = row.kind || kindOf(label);
    const baseMinutes = quantity * minutesPerUnit;
    const adjustedMinutes = baseMinutes * accessMultiplier * greaseMultiplier;
    const hours = adjustedMinutes / 60;
    return {
      name: label,
      kind,
      quantity,
      minutesPerUnit,
      accessMultiplier,
      baseMinutes,
      adjustedMinutes,
      hours,
      laborCost: hours * loadedWage,
    };
  });

  const productionHours = components.reduce((sum, row) => sum + row.hours, 0);
  const travelLaborHours = travelHours * travelTechs;
  const laborHours = productionHours + travelLaborHours;
  const onSiteLaborCost = productionHours * loadedWage;
  const travelLaborCost = travelLaborHours * loadedWage;
  const afterHoursLaborCost = onSiteLaborCost * (afterHoursPremium / 100);
  const laborCost = onSiteLaborCost + travelLaborCost + afterHoursLaborCost;

  const hoodSqFt = components
    .filter(row => row.kind === 'hood' && /sq ft/i.test(row.name))
    .reduce((sum, row) => sum + row.quantity, 0);
  const hoodCount = components
    .filter(row => row.kind === 'hood' && /canopy/i.test(row.name) && row.quantity > 0)
    .length;
  const consumables = consumablesPerJob + consumablesPerHoodSqFt * hoodSqFt;

  const directCost = laborCost + consumables + disposalFee + otherJobCost;
  const overhead = directCost * overheadRate / 100;
  const jobCost = directCost + overhead;
  const jobPrice = jobCost / (1 - targetMargin / 100);
  const jobProfit = jobPrice - jobCost;

  const hoursByKind = { hood: 0, duct: 0, fan: 0, other: 0 };
  for (const row of components) {
    hoursByKind[row.kind] = (hoursByKind[row.kind] || 0) + row.hours;
  }
  const kindShare = Object.fromEntries(
    Object.entries(hoursByKind).map(([kind, hours]) => [
      kind,
      productionHours === 0 ? 0 : hours / productionHours * 100,
    ]),
  );

  // Same cost stack, but only canopy + filter hours — the "per hood" bid
  // that ignores duct and fan. This is the number contractors send when they
  // underprice a vertical run.
  const hoodOnlyHours = hoursByKind.hood;
  const hoodOnlyLabor = hoodOnlyHours * loadedWage * (1 + afterHoursPremium / 100);
  const hoodOnlyDirect = hoodOnlyLabor + consumables + disposalFee + otherJobCost;
  const hoodOnlyCost = hoodOnlyDirect * (1 + overheadRate / 100);
  const hoodOnlyPrice = hoodOnlyCost / (1 - targetMargin / 100);

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    components: components.map(row => ({
      ...row,
      hoursShare: productionHours === 0 ? 0 : row.hours / productionHours * 100,
    })),
    loadedWage,
    crewSize,
    productionHours,
    travelLaborHours,
    laborHours,
    wallClockHours: crewSize === 0 ? null : productionHours / crewSize,
    onSiteLaborCost,
    travelLaborCost,
    afterHoursLaborCost,
    laborCost,
    hoodSqFt,
    hoodCount,
    consumables,
    disposalFee,
    otherJobCost,
    overhead,
    jobCost,
    jobPrice,
    jobProfit,
    annualPrice: jobPrice * cleansPerYear,
    monthlyEquivalent: jobPrice * cleansPerYear / 12,
    cleansPerYear,
    hoursByKind,
    kindShare,
    // What a contractor sanity-checks before sending the number.
    pricePerHood: hoodCount === 0 ? null : jobPrice / hoodCount,
    effectiveHourlyRate: laborHours === 0 ? null : jobPrice / laborHours,
    breakEvenPrice: jobCost,
    hoodOnlyPrice,
    // How much the duct and fan add over a hood-only bid.
    systemPremium: jobPrice - hoodOnlyPrice,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - jobCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - jobCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      belowBreakEven: proposedPrice < jobCost,
    },
  };
}
