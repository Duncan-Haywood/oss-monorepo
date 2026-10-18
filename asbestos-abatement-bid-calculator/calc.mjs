// Deterministic bid pricing for a licensed asbestos abatement contractor
// quoting a removal job.
//
// The trade's own shorthand for pricing this work is a flat rate per square
// foot. That number is wrong for the thing that actually drives the cost:
// which OSHA (29 CFR 1926.1101) / EPA NESHAP containment class the work
// falls under. Class I (friable material -- pipe/duct insulation, sprayed-on
// fireproofing, surfacing material) needs full containment, a negative-air
// machine, and a decon chamber, and crews move far slower in full-face
// respirators and disposable suits doing wet removal. Class III (minor,
// incidental disturbance of non-friable material -- a glovebag job, a small
// repair) can be done in an afternoon with almost none of that. A 400 sq ft
// Class III popcorn-texture patch and a 400 sq ft Class I boiler-room
// pipe-insulation job are nowhere near the same price, and a flat $/sq ft
// rate prices them identically.
//
//   calculateAbatementBid(inputs)  -- full cost breakdown and the final price.
//   naiveFlatRateQuote(inputs)     -- what a flat $/sq ft rate would have
//                                     quoted the same job, for comparison.
//   pricingGap(inputs)             -- the dollar and percent difference
//                                     between the two, and which direction
//                                     it runs.
//
// This is a pricing worksheet only. It does not perform an asbestos
// inspection, bulk-sample identification, or air-quality analysis, does not
// verify OSHA/EPA/state regulatory compliance, and does not replace the
// contractor's own certification, competent-person determination, or
// professional judgment about scope and liability on a given job.

export const CONTAINMENT_LABELS = {
  classI: 'Class I — friable material (pipe/duct insulation, sprayed fireproofing, surfacing material)',
  classII: 'Class II — non-friable material that can release fibers when removed (floor tile, siding, roofing, transite)',
  classIII: 'Class III — minor, incidental disturbance of non-friable material (small repair, drilling, glovebag work)',
};

// Square feet one worker clears per hour under each containment class, once
// full PPE, wet methods, decon procedures, and HEPA-vacuum cleanup are
// accounted for. Class I is slowest by a wide margin because every wall and
// penetration must be sealed and the crew works a full decon cycle each
// entry/exit; Class III is fast because the disturbance and the containment
// are both minimal.
const PRODUCTION_SQFT_PER_HOUR = { classI: 18, classII: 55, classIII: 110 };

// Containment build/teardown cost per work area: negative-air machine
// rental, poly sheeting, and a three-stage decon chamber (dirty room,
// shower, clean room) for Class I; simpler poly draping and a single decon
// step for Class II; a glovebag or light poly sheeting for Class III.
const CONTAINMENT_SETUP_COST_PER_AREA = { classI: 950, classII: 380, classIII: 90 };

export const DEFAULTS = {
  containmentClass: 'classI',
  squareFootage: 400,
  containmentAreas: 1,
  crewSize: 3,
  crewHourlyRatePerWorker: 38,
  supervisorHourlyRate: 58,
  airMonitoringSamples: 6,
  airMonitoringCostPerSample: 65,
  wasteVolumeCubicYards: 3,
  disposalFeePerCubicYard: 145,
  requiresPermit: true,
  permitFee: 275,
  rushJob: false,
  rushSurchargePercent: 0.2,
  targetMarginPercent: 0.3,
  minimumJobFee: 650,
  naiveRatePerSquareFoot: 8.5,
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

function productionRate(containmentClass) {
  const key = containmentClass ?? DEFAULTS.containmentClass;
  const rate = PRODUCTION_SQFT_PER_HOUR[key];
  if (rate === undefined) {
    throw new Error(`Containment class must be one of ${Object.keys(PRODUCTION_SQFT_PER_HOUR).join(', ')}.`);
  }
  return rate;
}

function containmentSetupCostPerArea(containmentClass) {
  return CONTAINMENT_SETUP_COST_PER_AREA[containmentClass ?? DEFAULTS.containmentClass];
}

/**
 * Full cost breakdown and final price for one abatement job.
 *
 * Labor is containment-class driven, not just square-footage driven: total
 * worker-hours are square footage divided by that class's production rate,
 * billed at the crew's hourly cost. A supervisor/competent person is present
 * for the whole elapsed job (worker-hours / crew size), containment setup is
 * a fixed cost per work area, air monitoring and waste disposal scale with
 * sample count and waste volume, and an optional permit fee and rush
 * surcharge apply on top. The result is priced at a target margin taken on
 * price (cost / (1 - margin)), then floored at the minimum job fee.
 */
export function calculateAbatementBid(inputs = {}) {
  const containmentClass = inputs.containmentClass ?? DEFAULTS.containmentClass;
  const rate = productionRate(containmentClass);
  const squareFootage = number(inputs.squareFootage ?? DEFAULTS.squareFootage, 'Square footage', { min: 1 });
  const containmentAreas = number(inputs.containmentAreas ?? DEFAULTS.containmentAreas, 'Containment areas', { min: 1, integer: true });
  const crewSize = number(inputs.crewSize ?? DEFAULTS.crewSize, 'Crew size', { min: 1, integer: true });
  const crewHourlyRatePerWorker = number(inputs.crewHourlyRatePerWorker ?? DEFAULTS.crewHourlyRatePerWorker, 'Crew hourly rate');
  const supervisorHourlyRate = number(inputs.supervisorHourlyRate ?? DEFAULTS.supervisorHourlyRate, 'Supervisor hourly rate');
  const airMonitoringSamples = number(inputs.airMonitoringSamples ?? DEFAULTS.airMonitoringSamples, 'Air monitoring samples', { integer: true });
  const airMonitoringCostPerSample = number(inputs.airMonitoringCostPerSample ?? DEFAULTS.airMonitoringCostPerSample, 'Air monitoring cost per sample');
  const wasteVolumeCubicYards = number(inputs.wasteVolumeCubicYards ?? DEFAULTS.wasteVolumeCubicYards, 'Waste volume');
  const disposalFeePerCubicYard = number(inputs.disposalFeePerCubicYard ?? DEFAULTS.disposalFeePerCubicYard, 'Disposal fee per cubic yard');
  const requiresPermit = Boolean(inputs.requiresPermit ?? DEFAULTS.requiresPermit);
  const permitFee = number(inputs.permitFee ?? DEFAULTS.permitFee, 'Permit fee');
  const rushJob = Boolean(inputs.rushJob ?? DEFAULTS.rushJob);
  const rushSurchargePercent = number(inputs.rushSurchargePercent ?? DEFAULTS.rushSurchargePercent, 'Rush surcharge percent');
  const targetMarginPercent = number(inputs.targetMarginPercent ?? DEFAULTS.targetMarginPercent, 'Target margin percent', { max: 0.9999 });
  const minimumJobFee = number(inputs.minimumJobFee ?? DEFAULTS.minimumJobFee, 'Minimum job fee');

  const laborHoursTotal = squareFootage / rate;
  const crewLaborCost = laborHoursTotal * crewHourlyRatePerWorker;
  const elapsedHours = laborHoursTotal / crewSize;
  const supervisorCost = elapsedHours * supervisorHourlyRate;
  const containmentSetupCost = containmentAreas * containmentSetupCostPerArea(containmentClass);
  const airMonitoringCost = airMonitoringSamples * airMonitoringCostPerSample;
  const wasteDisposalCost = wasteVolumeCubicYards * disposalFeePerCubicYard;
  const permitCost = requiresPermit ? permitFee : 0;

  const subtotal = crewLaborCost + supervisorCost + containmentSetupCost + airMonitoringCost + wasteDisposalCost + permitCost;
  const rushSurcharge = rushJob ? subtotal * rushSurchargePercent : 0;
  const totalCost = subtotal + rushSurcharge;

  const priceAtMargin = totalCost / (1 - targetMarginPercent);
  const minimumApplied = priceAtMargin < minimumJobFee;
  const finalPrice = Math.max(priceAtMargin, minimumJobFee);

  return {
    laborHoursTotal,
    elapsedHours,
    crewLaborCost,
    supervisorCost,
    containmentSetupCost,
    airMonitoringCost,
    wasteDisposalCost,
    permitCost,
    subtotal,
    rushSurcharge,
    totalCost,
    priceAtMargin,
    minimumApplied,
    finalPrice,
  };
}

/** What a flat rate per square foot would have quoted the same job. */
export function naiveFlatRateQuote(inputs = {}) {
  const squareFootage = number(inputs.squareFootage ?? DEFAULTS.squareFootage, 'Square footage', { min: 1 });
  const naiveRatePerSquareFoot = number(inputs.naiveRatePerSquareFoot ?? DEFAULTS.naiveRatePerSquareFoot, 'Naive rate per square foot');
  return squareFootage * naiveRatePerSquareFoot;
}

/**
 * The gap between the containment-class-driven quote above and a flat
 * $/sq ft quote for the same job: which one the naive method would have
 * left on the table (or overcharged), in dollars and as a percent of the
 * naive figure.
 */
export function pricingGap(inputs = {}) {
  const { finalPrice } = calculateAbatementBid(inputs);
  const naiveQuote = naiveFlatRateQuote(inputs);
  const dollarGap = finalPrice - naiveQuote;
  const percentGap = naiveQuote === 0 ? null : dollarGap / naiveQuote;
  return { finalPrice, naiveQuote, dollarGap, percentGap, underpriced: dollarGap > 0 };
}
