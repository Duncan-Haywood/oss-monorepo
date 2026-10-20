// Deterministic bid pricing for an independent licensed land surveyor (a
// one-to-three-person survey crew, not a large multi-office firm) quoting a
// boundary, topographic, or ALTA/NSPS retracement survey job.
//
// The trade's own shorthand for pricing this work is a flat rate per acre.
// That number is what a client asks for and it is *wrong* for the two things
// that actually drive the hours on a survey job: how many corners have to be
// found versus set from scratch (a corner with no recoverable monument can
// run 2-3x the field time of one that is simply relocated), and how much
// deed/plat/easement research the chain of title needs before anyone drives
// to the site. A ten-acre parcel with six easy corners and a clean title
// chain and a two-acre infill lot with three lost corners and a tangled
// 1950s deed can cost the same to survey -- acreage alone does not see that,
// and quoting off acreage alone gets one of them wrong.
//
//   calculateSurveyBid(inputs)        -- full cost breakdown and the final price.
//   naivePerAcreQuote(inputs)  -- what a flat per-acre rate would have quoted
//                                 the same job, for comparison.
//   pricingGap(inputs)         -- the dollar and percent difference between
//                                 the two, and which direction it runs.
//
// This is a pricing worksheet only. It does not perform a legal boundary
// determination, does not check state minimum technical standards, and does
// not replace the licensed surveyor's own professional judgment about scope,
// liability, or errors and omissions coverage.

export const TERRAIN_MULTIPLIER = { open: 1, moderate: 1.4, heavy: 2.2 };
export const TERRAIN_LABELS = {
  open: 'Open / cleared, easy access',
  moderate: 'Mixed brush, some slope or fencing',
  heavy: 'Heavy woods, steep, or wetland access',
};

// Base field minutes per corner before the terrain multiplier is applied.
// Locating an existing, recoverable monument is materially faster than
// setting a new one -- deed research plus running a traverse to a position
// with no physical marker to confirm against.
const FIELD_MINUTES_PER_CORNER_LOCATE = 25;
const FIELD_MINUTES_PER_CORNER_SET = 55;

export const DEFAULTS = {
  surveyType: 'boundary',
  parcelAcres: 5,
  cornersToLocate: 3,
  cornersToSet: 1,
  terrain: 'moderate',
  recordResearchHours: 3,
  crewSize: 2,
  crewHourlyRatePerPerson: 45,
  officeHourlyRate: 85,
  draftingHourlyRate: 55,
  draftingBaseHours: 2,
  draftingMinutesPerCorner: 20,
  travelMilesRoundTrip: 40,
  averageSpeedMph: 40,
  minimumTravelHours: 0.5,
  mileageRatePerMile: 0.67,
  rushJob: false,
  rushSurchargePercent: 0.25,
  targetMarginPercent: 0.35,
  minimumJobFee: 850,
  naivePerAcreRate: 120,
};

function number(value, label, { min = 0, max = null, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== null && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  if (integer && !Number.isInteger(parsed)) throw new Error(`${label} must be a whole number.`);
  return parsed;
}

function terrainMultiplier(terrain) {
  const key = terrain ?? DEFAULTS.terrain;
  const multiplier = TERRAIN_MULTIPLIER[key];
  if (multiplier === undefined) {
    throw new Error(`Terrain must be one of ${Object.keys(TERRAIN_MULTIPLIER).join(', ')}.`);
  }
  return multiplier;
}

/**
 * Full cost breakdown and final price for one survey job.
 *
 * Field time is corner-driven, not acreage-driven: it is the terrain
 * multiplier times (corners to locate * their base minutes + corners to set
 * * their own, higher, base minutes). Office research, drafting, travel
 * labor, and mileage are added on top, an optional rush surcharge is applied
 * to the subtotal, and the result is priced at a target margin taken on
 * price (cost / (1 - margin)), the same convention
 * `drone-mapping-job-calculator` uses, rather than as a markup on cost --
 * then floored at the minimum job fee.
 */
export function calculateSurveyBid(inputs = {}) {
  const cornersToLocate = number(inputs.cornersToLocate ?? DEFAULTS.cornersToLocate, 'Corners to locate', { integer: true });
  const cornersToSet = number(inputs.cornersToSet ?? DEFAULTS.cornersToSet, 'Corners to set', { integer: true });
  const multiplier = terrainMultiplier(inputs.terrain ?? DEFAULTS.terrain);
  const recordResearchHours = number(inputs.recordResearchHours ?? DEFAULTS.recordResearchHours, 'Record research hours');
  const crewSize = number(inputs.crewSize ?? DEFAULTS.crewSize, 'Crew size', { min: 1, integer: true });
  const crewHourlyRatePerPerson = number(inputs.crewHourlyRatePerPerson ?? DEFAULTS.crewHourlyRatePerPerson, 'Crew hourly rate');
  const officeHourlyRate = number(inputs.officeHourlyRate ?? DEFAULTS.officeHourlyRate, 'Office hourly rate');
  const draftingHourlyRate = number(inputs.draftingHourlyRate ?? DEFAULTS.draftingHourlyRate, 'Drafting hourly rate');
  const draftingBaseHours = number(inputs.draftingBaseHours ?? DEFAULTS.draftingBaseHours, 'Drafting base hours');
  const draftingMinutesPerCorner = number(inputs.draftingMinutesPerCorner ?? DEFAULTS.draftingMinutesPerCorner, 'Drafting minutes per corner');
  const travelMilesRoundTrip = number(inputs.travelMilesRoundTrip ?? DEFAULTS.travelMilesRoundTrip, 'Travel miles');
  const averageSpeedMph = number(inputs.averageSpeedMph ?? DEFAULTS.averageSpeedMph, 'Average travel speed', { min: 1 });
  const minimumTravelHours = number(inputs.minimumTravelHours ?? DEFAULTS.minimumTravelHours, 'Minimum travel hours');
  const mileageRatePerMile = number(inputs.mileageRatePerMile ?? DEFAULTS.mileageRatePerMile, 'Mileage rate');
  const rushJob = Boolean(inputs.rushJob ?? DEFAULTS.rushJob);
  const rushSurchargePercent = number(inputs.rushSurchargePercent ?? DEFAULTS.rushSurchargePercent, 'Rush surcharge percent');
  const targetMarginPercent = number(inputs.targetMarginPercent ?? DEFAULTS.targetMarginPercent, 'Target margin percent', { max: 0.9999 });
  const minimumJobFee = number(inputs.minimumJobFee ?? DEFAULTS.minimumJobFee, 'Minimum job fee');

  const fieldMinutes = multiplier * (cornersToLocate * FIELD_MINUTES_PER_CORNER_LOCATE + cornersToSet * FIELD_MINUTES_PER_CORNER_SET);
  const fieldHours = fieldMinutes / 60;
  const crewFieldCost = fieldHours * crewSize * crewHourlyRatePerPerson;

  const officeCost = recordResearchHours * officeHourlyRate;

  const draftingHours = draftingBaseHours + (draftingMinutesPerCorner * (cornersToLocate + cornersToSet)) / 60;
  const draftingCost = draftingHours * draftingHourlyRate;

  const travelHours = Math.max(minimumTravelHours, travelMilesRoundTrip / averageSpeedMph);
  const travelLaborCost = travelHours * crewSize * crewHourlyRatePerPerson;
  const mileageCost = travelMilesRoundTrip * mileageRatePerMile;

  const subtotal = crewFieldCost + officeCost + draftingCost + travelLaborCost + mileageCost;
  const rushSurcharge = rushJob ? subtotal * rushSurchargePercent : 0;
  const totalCost = subtotal + rushSurcharge;

  const priceAtMargin = totalCost / (1 - targetMarginPercent);
  const minimumApplied = priceAtMargin < minimumJobFee;
  const finalPrice = Math.max(priceAtMargin, minimumJobFee);

  return {
    fieldHours,
    crewFieldCost,
    officeCost,
    draftingHours,
    draftingCost,
    travelHours,
    travelLaborCost,
    mileageCost,
    subtotal,
    rushSurcharge,
    totalCost,
    priceAtMargin,
    minimumApplied,
    finalPrice,
  };
}

/** What a flat per-acre rate would have quoted the same job. */
export function naivePerAcreQuote(inputs = {}) {
  const parcelAcres = number(inputs.parcelAcres ?? DEFAULTS.parcelAcres, 'Parcel acres', { min: 0.01 });
  const naivePerAcreRate = number(inputs.naivePerAcreRate ?? DEFAULTS.naivePerAcreRate, 'Naive per-acre rate');
  return parcelAcres * naivePerAcreRate;
}

/**
 * The gap between the corner-and-research-driven quote above and a flat
 * per-acre quote for the same job: which one the naive method would have
 * left on the table (or overcharged), in dollars and as a percent of the
 * naive figure.
 */
export function pricingGap(inputs = {}) {
  const { finalPrice } = calculateSurveyBid(inputs);
  const naiveQuote = naivePerAcreQuote(inputs);
  const dollarGap = finalPrice - naiveQuote;
  const percentGap = naiveQuote === 0 ? null : dollarGap / naiveQuote;
  return { finalPrice, naiveQuote, dollarGap, percentGap, underpriced: dollarGap > 0 };
}
