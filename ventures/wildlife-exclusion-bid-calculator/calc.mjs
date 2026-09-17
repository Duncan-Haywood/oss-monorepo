// Pure bid arithmetic for a one-off nuisance-wildlife exclusion job. No
// network, no state: every minute, mile, foot and rate is an input, so the
// result stays a transparent calculation the operator can check against their
// own payroll and supply invoices rather than a claim about what any house
// "should" cost, what a state's wildlife code requires, or when a species may
// lawfully be excluded.
//
// Why this is not `pest-control-bid-calculator`. That tool prices a *recurring
// route account*: a stop, a drive, a frequency, repeated forever. This prices a
// *project* that happens once and then carries a warranty. The two share almost
// no arithmetic, and pricing one with the other is how a wildlife job gets
// quoted at a pest-control stop price.
//
// The costs the "$300 raccoon removal" ad cannot see, and the ones this exists
// to put back in:
//
//   - **Trap checks are the job, not an afterthought.** Traps that are set have
//     to be checked, in most states every 24 hours. A five-day removal is five
//     more round trips with a crew in the truck. That recurring return visit is
//     the single largest thing a flat removal fee omits, and it is why a job
//     quoted against a competitor's headline number loses money on day three.
//   - **Height is a labor multiplier, not a detail.** Sealing 60 feet of
//     soffit-to-roof line reachable from a step ladder is a different job from
//     the same 60 feet at a two-story eave on a steep pitch in a harness, and a
//     different job again where nothing but a lift will reach it. Per-foot
//     pricing that ignores the tier is wrong by a factor, in the same direction,
//     every time.
//   - **Exclusion, not removal, is what actually ends the problem** — and it is
//     measured in linear feet of gap, vent and roof line, with material that
//     has to survive an animal that chews.
//   - **Decontamination is priced by area and carries real disposal.** A
//     raccoon latrine or a bat roost is contaminated insulation, bagged waste,
//     PPE and a disposal ticket, none of which the removal fee contemplates.
//   - **A warranty is a promise to come back.** Exclusion work is commonly sold
//     with one to five years on it. A callback is a truck roll and a crew, and
//     an operator who reserved nothing against it pays for it out of the profit
//     on the next job.
//
// Every default below is a ballpark starting point an operator is expected to
// replace with their own book. None of them is an industry standard, a
// published tariff, or a guarantee.

/**
 * Height tiers for the exclusion work, and what each does to labor.
 *
 * The multiplier applies to exclusion and one-way-door minutes only — it is
 * about reaching the work, so it does not touch trap checks in the yard,
 * attic decontamination, or drive time. Multipliers are ballpark ratios
 * between how long the same footage takes at each tier, not a measurement.
 */
export const HEIGHT_TIERS = Object.freeze([
  { id: 'ground', label: 'Ground level, crawl space or deck', laborMultiplier: 1, needsLift: false },
  { id: 'single', label: 'Single story — step ladder', laborMultiplier: 1.3, needsLift: false },
  { id: 'two', label: 'Two story — extension ladder', laborMultiplier: 1.7, needsLift: false },
  { id: 'steep', label: 'Two story, steep pitch — roof harness', laborMultiplier: 2.1, needsLift: false },
  { id: 'lift', label: 'Three story or no ladder set — lift required', laborMultiplier: 2.4, needsLift: true },
]);

/**
 * Species presets. `trapped` records how the animal is actually removed,
 * which is the distinction that decides whether this job has trap-check
 * visits at all.
 *
 * Bats are the important row: they are not trapped anywhere in the United
 * States. They are excluded live through one-way devices, which is why a bat
 * job has zero traps, zero trap checks, and a device-removal visit instead —
 * and why quoting one off a trapping rate sheet describes a job nobody does.
 *
 * `maternitySeasonRisk` marks species whose young are flightless or immobile
 * for a period each year, during which sealing the entry traps them inside.
 * Every state wildlife agency handles this differently and some prohibit
 * exclusion outright in that window. This flag is a scheduling prompt to go
 * and check; it is not a determination that any date is or is not permitted.
 */
export const SPECIES_PRESETS = Object.freeze([
  {
    id: 'bat',
    label: 'Bats',
    trapped: false,
    maternitySeasonRisk: true,
    // Roughly late spring through late summer across most of the US. Real
    // windows are set by each state agency and vary by latitude and species.
    maternityMonths: [5, 6, 7, 8],
    exclusionLinearFeet: 90,
    deconSquareFeet: 400,
    oneWayDoors: 3,
  },
  {
    id: 'raccoon',
    label: 'Raccoons',
    trapped: true,
    maternitySeasonRisk: true,
    maternityMonths: [3, 4, 5, 6],
    exclusionLinearFeet: 45,
    deconSquareFeet: 250,
    oneWayDoors: 1,
  },
  {
    id: 'squirrel',
    label: 'Squirrels',
    trapped: true,
    maternitySeasonRisk: true,
    maternityMonths: [3, 4, 8, 9],
    exclusionLinearFeet: 60,
    deconSquareFeet: 120,
    oneWayDoors: 2,
  },
  {
    id: 'bird',
    label: 'Birds (vents, dryer lines, ledges)',
    trapped: false,
    maternitySeasonRisk: true,
    maternityMonths: [4, 5, 6, 7],
    exclusionLinearFeet: 35,
    deconSquareFeet: 60,
    oneWayDoors: 2,
  },
  {
    id: 'groundhog',
    label: 'Skunks, groundhogs, opossums (ground level)',
    trapped: true,
    maternitySeasonRisk: false,
    maternityMonths: [],
    exclusionLinearFeet: 40,
    deconSquareFeet: 0,
    oneWayDoors: 1,
  },
]);

/** The preset for a species id, or null if it is not one this tool knows. */
export function speciesById(id) {
  return SPECIES_PRESETS.find((entry) => entry.id === id) ?? null;
}

/** The tier for a height id, or null. */
export function heightTierById(id) {
  return HEIGHT_TIERS.find((entry) => entry.id === id) ?? null;
}

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Price a wildlife exclusion job from the visits it really takes, the footage
 * that has to be sealed, and the area that has to be cleaned.
 *
 * @param {object} input
 * @param {string} input.species              One of SPECIES_PRESETS' ids.
 * @param {string} input.heightTier           One of HEIGHT_TIERS' ids.
 * @param {number} input.scheduledMonth       1-12. Only used for the maternity flag.
 *
 * @param {number} input.crewSize
 * @param {number} input.trapCheckCrewSize    Who actually goes on a trap check.
 *   Usually one tech, even when the seal took two — modelling it as the full
 *   crew is the way this tool would overstate the job it is arguing about, so
 *   it is a separate input rather than an assumption.
 * @param {number} input.hourlyWage           Raw per-person wage, before burden.
 * @param {number} input.burdenRate           Payroll burden as a % on the wage:
 *   employer taxes, workers' compensation, insurance. Split from the wage
 *   rather than folded into one "burdened rate" because these are the four
 *   fields every calculator in this portfolio shares — an operator types them
 *   once and every tool here reads them — and because workers' comp for
 *   at-height and animal-handling work is high enough that guessing it from
 *   memory is the error `shop-rate-calculator` exists to correct.
 * @param {number} input.milesOneWay          Shop to site, one way.
 * @param {number} input.ratePerMile          Vehicle cost per mile.
 * @param {number} input.driveMinutesOneWay   Paid crew time per one-way leg.
 *
 * @param {boolean} input.separateInspection  A dedicated inspection trip.
 * @param {number} input.inspectionMinutes    On-site, per crew member.
 * @param {boolean} input.inspectionBillable  False means it is unpaid marketing
 *   that still costs a truck and a crew — counted as cost either way, but this
 *   is what makes the "free inspection" line visible.
 *
 * @param {number} input.trapsSet
 * @param {number} input.trapSetMinutes       On-site, to place all traps.
 * @param {number} input.trapDays             Days traps stay out.
 * @param {number} input.trapChecksPerDay     Return visits per day. Most states
 *   require every 24 hours; this is an input, not a rule this tool asserts.
 * @param {number} input.minutesPerTrapCheck  On-site, per check visit.
 * @param {number} input.consumablesPerTrap   Bait, gloves, ties.
 *
 * @param {number} input.exclusionLinearFeet
 * @param {number} input.exclusionMinutesPerFoot
 * @param {number} input.exclusionMaterialPerFoot
 * @param {number} input.oneWayDoors
 * @param {number} input.doorMinutesEach
 * @param {number} input.doorCostEach
 * @param {boolean} input.doorRemovalVisit    A trip back to pull the devices
 *   and close the last hole. Skipping it is how an exclusion stays open.
 * @param {number} input.doorRemovalMinutes
 * @param {number} input.liftRentalCost       Charged only on a tier that needs one.
 *
 * @param {number} input.deconSquareFeet
 * @param {number} input.deconMinutesPer100SqFt
 * @param {number} input.deconMaterialPer100SqFt
 * @param {number} input.insulationRemoveSqFt
 * @param {number} input.insulationRemoveCostPerSqFt
 * @param {number} input.insulationReplaceSqFt
 * @param {number} input.insulationReplaceCostPerSqFt
 * @param {number} input.disposalFee
 * @param {number} input.repairCost           Chewed soffit, torn screen, fascia.
 *
 * @param {number} input.warrantyYears
 * @param {number} input.warrantyReservePct   Reserve as a % of the warranted
 *   work — exclusion labor, exclusion material and the devices — not of the
 *   whole job. Decontamination and trapping are not what gets called back.
 * @param {number} input.overheadRate         % on direct cost.
 * @param {number} input.targetMargin         Net profit as a % of final price.
 * @param {number|null} input.proposedPrice   Optional price already on the table.
 */
export function calculateBid(input) {
  const species = speciesById(input.species);
  if (!species) throw new Error('Choose which animal this job is for');
  const tier = heightTierById(input.heightTier);
  if (!tier) throw new Error('Choose how the exclusion work is reached');

  const scheduledMonth = number(input.scheduledMonth ?? 0, 'Scheduled month', { min: 1 });
  if (scheduledMonth > 12) throw new Error('Scheduled month must be between 1 and 12');

  const crewSize = number(input.crewSize ?? 0, 'Crew size', { min: 1, allowZero: false });
  const trapCheckCrewSize = number(input.trapCheckCrewSize ?? crewSize, 'Trap check crew size', { min: 1, allowZero: false });
  const hourlyWage = number(input.hourlyWage ?? 0, 'Crew hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const laborRate = hourlyWage * (1 + burdenRate / 100);
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const ratePerMile = number(input.ratePerMile ?? 0, 'Rate per mile');
  const driveMinutesOneWay = number(input.driveMinutesOneWay ?? 0, 'Drive minutes one way');

  const separateInspection = Boolean(input.separateInspection);
  const inspectionMinutes = number(input.inspectionMinutes ?? 0, 'Inspection minutes');
  const inspectionBillable = Boolean(input.inspectionBillable);

  const trapsSet = number(input.trapsSet ?? 0, 'Traps set');
  const trapSetMinutes = number(input.trapSetMinutes ?? 0, 'Trap set minutes');
  const trapDays = number(input.trapDays ?? 0, 'Trap days');
  const trapChecksPerDay = number(input.trapChecksPerDay ?? 0, 'Trap checks per day');
  const minutesPerTrapCheck = number(input.minutesPerTrapCheck ?? 0, 'Minutes per trap check');
  const consumablesPerTrap = number(input.consumablesPerTrap ?? 0, 'Consumables per trap');

  const exclusionLinearFeet = number(input.exclusionLinearFeet ?? 0, 'Exclusion linear feet');
  const exclusionMinutesPerFoot = number(input.exclusionMinutesPerFoot ?? 0, 'Exclusion minutes per foot');
  const exclusionMaterialPerFoot = number(input.exclusionMaterialPerFoot ?? 0, 'Exclusion material per foot');
  const oneWayDoors = number(input.oneWayDoors ?? 0, 'One-way doors');
  const doorMinutesEach = number(input.doorMinutesEach ?? 0, 'Minutes per one-way door');
  const doorCostEach = number(input.doorCostEach ?? 0, 'Cost per one-way door');
  const doorRemovalVisit = Boolean(input.doorRemovalVisit);
  const doorRemovalMinutes = number(input.doorRemovalMinutes ?? 0, 'Door removal minutes');
  const liftRentalCost = number(input.liftRentalCost ?? 0, 'Lift rental cost');

  const deconSquareFeet = number(input.deconSquareFeet ?? 0, 'Decontamination square feet');
  const deconMinutesPer100SqFt = number(input.deconMinutesPer100SqFt ?? 0, 'Decontamination minutes per 100 sq ft');
  const deconMaterialPer100SqFt = number(input.deconMaterialPer100SqFt ?? 0, 'Decontamination material per 100 sq ft');
  const insulationRemoveSqFt = number(input.insulationRemoveSqFt ?? 0, 'Insulation removal square feet');
  const insulationRemoveCostPerSqFt = number(input.insulationRemoveCostPerSqFt ?? 0, 'Insulation removal cost per sq ft');
  const insulationReplaceSqFt = number(input.insulationReplaceSqFt ?? 0, 'Insulation replacement square feet');
  const insulationReplaceCostPerSqFt = number(input.insulationReplaceCostPerSqFt ?? 0, 'Insulation replacement cost per sq ft');
  const disposalFee = number(input.disposalFee ?? 0, 'Disposal fee');
  const repairCost = number(input.repairCost ?? 0, 'Repair cost');

  const warrantyYears = number(input.warrantyYears ?? 0, 'Warranty years');
  const warrantyReservePct = number(input.warrantyReservePct ?? 0, 'Warranty reserve');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead rate');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be below 100%');

  const proposedPrice = input.proposedPrice === null || input.proposedPrice === undefined || input.proposedPrice === ''
    ? null
    : number(input.proposedPrice, 'Proposed price');

  // --- visits -------------------------------------------------------------
  // Every one of these is a round trip with the crew in the truck. Counting
  // them explicitly is the whole point: the flat removal fee this tool exists
  // to argue with prices exactly one.
  const trapCheckVisits = Math.round(trapDays * trapChecksPerDay);
  const inspectionVisits = separateInspection ? 1 : 0;
  const installVisits = 1;
  const removalVisits = doorRemovalVisit ? 1 : 0;
  const totalVisits = inspectionVisits + installVisits + trapCheckVisits + removalVisits;

  // --- labor -------------------------------------------------------------
  // Everything here is expressed as crew-hours (minutes x heads / 60) rather
  // than as minutes, because the two visit kinds do not carry the same crew: a
  // seal at a two-story eave is a two-person job, and the daily trap check
  // that follows it usually is not.
  const reachMultiplier = tier.laborMultiplier;
  const inspectionOnSiteMinutes = separateInspection ? inspectionMinutes : 0;
  const exclusionMinutes = exclusionLinearFeet * exclusionMinutesPerFoot * reachMultiplier;
  const doorMinutes = oneWayDoors * doorMinutesEach * reachMultiplier;
  const doorRemovalOnSiteMinutes = doorRemovalVisit ? doorRemovalMinutes * reachMultiplier : 0;
  const trapSetOnSiteMinutes = trapsSet * trapSetMinutes;
  const trapCheckOnSiteMinutes = trapCheckVisits * minutesPerTrapCheck;
  const deconMinutes = (deconSquareFeet / 100) * deconMinutesPer100SqFt;

  const fullCrewVisits = totalVisits - trapCheckVisits;
  const fullCrewDriveMinutes = fullCrewVisits * 2 * driveMinutesOneWay;
  const trapCheckDriveMinutes = trapCheckVisits * 2 * driveMinutesOneWay;

  const hours = (minutes, heads) => (minutes / 60) * heads;

  const driveHours = hours(fullCrewDriveMinutes, crewSize) + hours(trapCheckDriveMinutes, trapCheckCrewSize);
  const inspectionHours = hours(inspectionOnSiteMinutes, crewSize);
  const exclusionHours = hours(exclusionMinutes + doorMinutes + doorRemovalOnSiteMinutes, crewSize);
  const trapHours = hours(trapSetOnSiteMinutes, crewSize) + hours(trapCheckOnSiteMinutes, trapCheckCrewSize);
  const deconHours = hours(deconMinutes, crewSize);

  const crewHours = driveHours + inspectionHours + exclusionHours + trapHours + deconHours;

  const driveLaborCost = driveHours * laborRate;
  const inspectionLaborCost = inspectionHours * laborRate;
  const exclusionLaborCost = exclusionHours * laborRate;
  const trapLaborCost = trapHours * laborRate;
  const deconLaborCost = deconHours * laborRate;
  const laborCost = driveLaborCost + inspectionLaborCost + exclusionLaborCost + trapLaborCost + deconLaborCost;

  // --- vehicle ------------------------------------------------------------
  const totalMiles = totalVisits * 2 * milesOneWay;
  const vehicleCost = totalMiles * ratePerMile;

  // --- materials ----------------------------------------------------------
  const exclusionMaterialCost = exclusionLinearFeet * exclusionMaterialPerFoot;
  const doorMaterialCost = oneWayDoors * doorCostEach;
  const trapConsumablesCost = trapsSet * consumablesPerTrap;
  const deconMaterialCost = (deconSquareFeet / 100) * deconMaterialPer100SqFt;
  const insulationCost = insulationRemoveSqFt * insulationRemoveCostPerSqFt
    + insulationReplaceSqFt * insulationReplaceCostPerSqFt;
  const liftCost = tier.needsLift ? liftRentalCost : 0;

  const materialCost = exclusionMaterialCost + doorMaterialCost + trapConsumablesCost
    + deconMaterialCost + insulationCost + disposalFee + liftCost + repairCost;

  // --- reserve, overhead, price -------------------------------------------
  // The reserve is sized against the work the warranty actually covers: the
  // seal and the devices. A callback is somebody coming back to a hole that
  // reopened, not to an attic that was cleaned.
  const warrantedWork = exclusionLaborCost + exclusionMaterialCost + doorMaterialCost;
  const warrantyReserve = warrantedWork * (warrantyReservePct / 100);

  const directCost = laborCost + vehicleCost + materialCost;
  const overhead = directCost * (overheadRate / 100);
  const breakEvenPrice = directCost + warrantyReserve + overhead;
  const price = breakEvenPrice / (1 - targetMargin / 100);
  const profit = price - breakEvenPrice;

  // --- flags --------------------------------------------------------------
  // Each is a prompt to look at something, never a determination.
  const trapsWithoutChecks = trapsSet > 0 && trapDays > 0 && trapCheckVisits === 0;
  const maternitySeasonRisk = species.maternitySeasonRisk
    && species.maternityMonths.includes(scheduledMonth);
  const warrantyWithoutReserve = warrantyYears > 0 && warrantyReservePct === 0;
  // Sealing with no way back to pull the devices leaves the exclusion open.
  const doorsWithoutRemoval = oneWayDoors > 0 && !doorRemovalVisit;
  // A species that is not trapped, quoted with traps on it.
  const trapsOnUntrappedSpecies = !species.trapped && trapsSet > 0;

  const proposed = proposedPrice === null ? null : {
    price: round(proposedPrice),
    profit: round(proposedPrice - breakEvenPrice),
    margin: proposedPrice === 0 ? 0 : round(((proposedPrice - breakEvenPrice) / proposedPrice) * 100),
    belowBreakEven: proposedPrice < breakEvenPrice,
  };

  return {
    species: species.label,
    heightTier: tier.label,
    reachMultiplier,
    // The burdened rate every labor line above was costed at. Reported because
    // an operator who typed a $25 wage should see the $38 the bid actually
    // used, rather than having to trust that the burden went in.
    laborRate: round(laborRate),

    // Echoed back out of the inputs, not recomputed. The customer proposal
    // drafts its scope lines from this result — "45 ft of exclusion", "3 years"
    // — and reading them off the result rather than off the form is what keeps
    // the printed scope and the priced job the same job.
    exclusionLinearFeet,
    oneWayDoors,
    trapsSet,
    trapDays,
    deconSquareFeet,
    insulationReplaceSqFt,
    warrantyYears,

    totalVisits,
    trapCheckVisits,
    totalMiles: round(totalMiles),
    crewHours: round(crewHours),

    driveLaborCost: round(driveLaborCost),
    inspectionLaborCost: round(inspectionLaborCost),
    exclusionLaborCost: round(exclusionLaborCost),
    trapLaborCost: round(trapLaborCost),
    deconLaborCost: round(deconLaborCost),
    laborCost: round(laborCost),
    vehicleCost: round(vehicleCost),

    exclusionMaterialCost: round(exclusionMaterialCost),
    doorMaterialCost: round(doorMaterialCost),
    trapConsumablesCost: round(trapConsumablesCost),
    deconMaterialCost: round(deconMaterialCost),
    insulationCost: round(insulationCost),
    disposalFee: round(disposalFee),
    liftCost: round(liftCost),
    repairCost: round(repairCost),
    materialCost: round(materialCost),

    warrantyReserve: round(warrantyReserve),
    directCost: round(directCost),
    overhead: round(overhead),
    breakEvenPrice: round(breakEvenPrice),
    price: round(price),
    profit: round(profit),
    pricePerCrewHour: crewHours === 0 ? null : round(price / crewHours),

    trapsWithoutChecks,
    maternitySeasonRisk,
    warrantyWithoutReserve,
    doorsWithoutRemoval,
    trapsOnUntrappedSpecies,

    proposed,
  };
}

/**
 * What the job would look like priced the way the ad the customer is holding
 * prices it: one visit, one flat fee, nothing else. Returned so the page can
 * show the gap rather than assert it.
 *
 * @param {number} flatFee    The headline removal price being compared against.
 * @param {object} result     A `calculateBid` result.
 */
export function flatFeeGap(flatFee, result) {
  const fee = number(flatFee, 'Flat fee');
  return {
    flatFee: round(fee),
    breakEvenPrice: result.breakEvenPrice,
    shortfall: round(result.breakEvenPrice - fee),
    coversBreakEven: fee >= result.breakEvenPrice,
  };
}
