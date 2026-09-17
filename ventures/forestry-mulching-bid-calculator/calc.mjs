// Production-rate and job-pricing arithmetic for a forestry mulching or land
// clearing job.
//
// Everything here is deterministic. There is no model, no lookup service, no
// market rate table and no network call: the output is a price an operator
// puts in front of a landowner and then has to clear the ground for, so every
// figure has to be re-derivable on paper from numbers they typed.
//
// The modelling choice the whole tool rests on, stated up front:
//
//   **Price per acre is an output, not an input.** The trade quotes in
//   dollars per acre and then reasons in dollars per acre, but the machine
//   is paid for by the hour. What converts one to the other is the
//   *production rate* -- acres per machine-hour -- and that rate is not a
//   property of the job's acreage. It is a property of what is standing on
//   it. So this computes hours first, from head width, advance speed and
//   pass count, and reports the per-acre figure last, as the quotient it
//   actually is.
//
// The advance-speed and pass-count presets below are starting points a
// specific operator is expected to overwrite with their own numbers, and the
// page keeps them visible and editable for exactly that reason. They are not
// survey data and this file does not pretend they are: see DENSITY_CLASSES.

/** Square feet in an acre. Exact, by definition (66 ft x 660 ft). */
export const SQ_FT_PER_ACRE = 43560;

/**
 * Starting points for the four density descriptions a mulching customer
 * actually gives over the phone, in the trade's own words.
 *
 * `advanceFtPerMin` is how fast the machine moves *forward while cutting*, not
 * its travel speed. `passes` is how many times the same ground is worked: on
 * light material the mat falls small enough on the first pass, and on heavy
 * material the standing stems come down first and the mat is then reworked to
 * get the particle size down to something a customer calls finished.
 *
 * **These are defaults to argue with, not a rate card.** Real production
 * varies with the head, the carrier's horsepower, hydraulic flow, the species
 * mix, moisture and the operator, and it varies by more than the difference
 * between two of these rows. An operator who has timed themselves on one job
 * should type that rate in instead -- `acresPerHourFrom` below is exposed so
 * the page can show them what their own timing implies, and
 * `advanceSpeedForAcresPerHour` inverts it so they can enter the rate directly.
 */
export const DENSITY_CLASSES = {
  'light-brush': {
    label: 'Light brush, grass and saplings under 2 in',
    advanceFtPerMin: 90,
    passes: 1,
    note: 'Fence lines, old pasture growing back in, a trail corridor kept up.',
  },
  'medium-brush': {
    label: 'Medium brush, stems 2-4 in with the odd 6 in',
    advanceFtPerMin: 42,
    passes: 1,
    note: 'The most commonly quoted job: a lot that has been idle five to ten years.',
  },
  'heavy-brush': {
    label: 'Heavy brush and small trees, stems 4-8 in',
    advanceFtPerMin: 40,
    passes: 2,
    note: 'Standing stems come down on the first pass and the mat is reworked on the second.',
  },
  'heavy-timber': {
    label: 'Heavy understory, stems 8-12 in',
    advanceFtPerMin: 30,
    passes: 3,
    note: 'Slow going, hard on teeth, and the class most often quoted at a medium-brush price.',
  },
};

/**
 * Money, with the sign outside the symbol.
 *
 * `-$9.24`, never `$-9.24`; and a value that rounds to zero prints `$0.00`
 * rather than `-$0.00`, which is a break-even line claiming to be down money.
 * See platform/ci/check_money_sign.py for why this is spelled out in every
 * venture rather than shared.
 */
export function money(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  const body = Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${safe < 0 ? '-' : ''}$${body}`;
}

function requireFinite(value, label, { min, max, integer = false } = {}) {
  // `Number(null)` and `Number('')` are both 0, and 0 clears most of the
  // floors below. A blank operator wage, fuel price or tooth cost would then
  // price the machine at nothing an hour and report a healthy margin on it,
  // which is the quietest way this worksheet could be wrong. Absent is
  // refused before it can become zero.
  if (value === null || value === undefined || value === '') {
    throw new RangeError(`${label} must be a number`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RangeError(`${label} must be a number`);
  if (integer && !Number.isInteger(n)) throw new RangeError(`${label} must be a whole number`);
  if (min !== undefined && n < min) throw new RangeError(`${label} must be at least ${min}`);
  if (max !== undefined && n > max) throw new RangeError(`${label} must be at most ${max}`);
  return n;
}

/**
 * Acres cut per hour on the clock, from the geometry of the cut.
 *
 *   swath (ft) x advance (ft/min) x 60 min  =  square feet cut per hour
 *
 * divided by passes over the same ground, and by the acre, and multiplied by
 * the share of the hour the machine is actually cutting rather than
 * repositioning, refuelling, checking teeth or walking a boundary.
 *
 * `terrainFactorPct` divides the advance speed: 100 is the flat, open, dry
 * ground the speed was quoted on, and anything below it is slope, rock,
 * standing water, stumps to steer around or a boundary too tight to run long
 * lines in.
 */
export function acresPerHourFrom({
  headWidthFt,
  advanceFtPerMin,
  passes,
  cuttingEfficiencyPct,
  terrainFactorPct,
}) {
  const width = requireFinite(headWidthFt, 'Mulching head width', { min: 1, max: 20 });
  const advance = requireFinite(advanceFtPerMin, 'Advance speed', { min: 1, max: 400 });
  const pass = requireFinite(passes, 'Passes over the ground', { min: 1, max: 6 });
  const efficiency = requireFinite(cuttingEfficiencyPct, 'Share of the hour cutting', { min: 5, max: 100 });
  const terrain = requireFinite(terrainFactorPct, 'Terrain factor', { min: 10, max: 100 });

  const effectiveAdvance = advance * (terrain / 100);
  const sqFtPerHour = width * effectiveAdvance * 60 * (efficiency / 100);
  return sqFtPerHour / SQ_FT_PER_ACRE / pass;
}

/**
 * The inverse: the advance speed implied by a production rate an operator has
 * actually timed on a job of their own.
 *
 * This is the honest direction of travel for anybody who has a stopwatch and a
 * finished lot, and it is why the presets above are not load-bearing. Given
 * "three quarters of an acre in four hours" they get the speed that produces
 * it, on their own head width, and can see whether the number is plausible.
 */
export function advanceSpeedForAcresPerHour({
  headWidthFt,
  acresPerHour,
  passes,
  cuttingEfficiencyPct,
  terrainFactorPct,
}) {
  const width = requireFinite(headWidthFt, 'Mulching head width', { min: 1, max: 20 });
  const rate = requireFinite(acresPerHour, 'Production rate', { min: 0.001, max: 20 });
  const pass = requireFinite(passes, 'Passes over the ground', { min: 1, max: 6 });
  const efficiency = requireFinite(cuttingEfficiencyPct, 'Share of the hour cutting', { min: 5, max: 100 });
  const terrain = requireFinite(terrainFactorPct, 'Terrain factor', { min: 10, max: 100 });

  const sqFtPerHour = rate * SQ_FT_PER_ACRE * pass;
  return sqFtPerHour / (width * 60 * (efficiency / 100) * (terrain / 100));
}

/**
 * What one hour of this machine costs before any profit is added.
 *
 * Five lines, and the two that go missing from a hand-written quote are the
 * last two.
 *
 * **Teeth.** Carbide tools are a consumable, not a repair. A full set on a
 * drum head is a four-figure item and it is consumed over hundreds of hours,
 * faster in sand and rock. Spread over the hours it lasts it is a real and
 * sizeable cost per hour; left out of the quote it is an invoice that arrives
 * later with no job attached to it.
 *
 * **Ownership.** The payment and the insurance are owed every month whether
 * the machine turns or not, so the burden *per hour* is set by how many hours
 * a month it actually bills. That is the number an operator is most likely to
 * flatter themselves about, and it moves the per-hour cost more than fuel
 * does: the same payment over 40 billable hours costs four times what it does
 * over 160.
 */
export function machineCostPerHour(input) {
  const {
    operatorWagePerHour,
    fuelGallonsPerHour,
    fuelPricePerGallon,
    toothSetCost,
    toothSetLifeHours,
    maintenancePerHour,
    machinePaymentMonthly,
    insuranceAnnual,
    billableHoursPerMonth,
  } = input;

  const wage = requireFinite(operatorWagePerHour, 'Operator cost', { min: 0, max: 500 });
  const gph = requireFinite(fuelGallonsPerHour, 'Fuel burn', { min: 0, max: 60 });
  const fuelPrice = requireFinite(fuelPricePerGallon, 'Fuel price', { min: 0, max: 30 });
  const teethCost = requireFinite(toothSetCost, 'Cost of a set of teeth', { min: 0, max: 20000 });
  const teethLife = requireFinite(toothSetLifeHours, 'Hours a set of teeth lasts', { min: 1, max: 5000 });
  const maintenance = requireFinite(maintenancePerHour, 'Service and repair reserve', { min: 0, max: 500 });
  const payment = requireFinite(machinePaymentMonthly, 'Machine payment', { min: 0, max: 100000 });
  const insurance = requireFinite(insuranceAnnual, 'Insurance', { min: 0, max: 200000 });
  const billableHours = requireFinite(billableHoursPerMonth, 'Billable hours a month', { min: 1, max: 730 });

  const fuel = gph * fuelPrice;
  const teeth = teethCost / teethLife;
  const ownership = (payment + insurance / 12) / billableHours;

  return {
    operator: wage,
    fuel,
    teeth,
    maintenance,
    ownership,
    total: wage + fuel + teeth + maintenance + ownership,
  };
}

/**
 * The whole job: hours, days, cost, and the price that clears a margin.
 *
 * Margin is taken on the *price*, not as a markup on cost:
 * `price = cost / (1 - margin)`. A 40% margin means $40 of every $100
 * invoiced, which is what an operator means by it, and it is not the same as
 * adding 40% to cost.
 *
 * Mobilization is kept out of the hourly cost and added as its own line,
 * because it does not scale with acreage and that is the entire reason small
 * jobs lose money. One `mobilizationTrips` is one round trip with the machine
 * on the trailer -- out and back.
 */
export function priceJob(input) {
  const {
    acres,
    headWidthFt,
    advanceFtPerMin,
    passes,
    cuttingEfficiencyPct,
    terrainFactorPct,
    workHoursPerDay,
    mobilizationTrips,
    mobilizationHoursEach,
    mobilizationMilesEach,
    truckCostPerMile,
    otherCosts,
    targetMarginPct,
  } = input;

  const area = requireFinite(acres, 'Acres to clear', { min: 0.05, max: 5000 });
  const hoursPerDay = requireFinite(workHoursPerDay, 'Machine hours a day', { min: 1, max: 24 });
  const trips = requireFinite(mobilizationTrips, 'Mobilization trips', { min: 0, max: 40, integer: true });
  const mobHours = requireFinite(mobilizationHoursEach, 'Hours per mobilization', { min: 0, max: 48 });
  const mobMiles = requireFinite(mobilizationMilesEach, 'Miles per mobilization', { min: 0, max: 3000 });
  const perMile = requireFinite(truckCostPerMile, 'Truck and trailer cost', { min: 0, max: 30 });
  const other = requireFinite(otherCosts, 'Other job costs', { min: 0, max: 1000000 });
  const margin = requireFinite(targetMarginPct, 'Target margin', { min: 0, max: 95 });

  const rate = machineCostPerHour(input);
  const acresPerHour = acresPerHourFrom({
    headWidthFt,
    advanceFtPerMin,
    passes,
    cuttingEfficiencyPct,
    terrainFactorPct,
  });

  const machineHours = area / acresPerHour;
  const daysOnSite = machineHours / hoursPerDay;

  // Mobilization labour is the operator's time, not the machine's: the mulcher
  // is on a trailer and burning nothing. Charging the full machine rate for a
  // float trip is a common and expensive overcorrection in the other
  // direction.
  const mobilizationLabor = trips * mobHours * rate.operator;
  const mobilizationTravel = trips * mobMiles * perMile;
  const mobilizationCost = mobilizationLabor + mobilizationTravel;

  const machineCost = machineHours * rate.total;
  const totalCost = machineCost + mobilizationCost + other;
  const price = totalCost / (1 - margin / 100);

  return {
    acres: area,
    acresPerHour,
    machineHours,
    daysOnSite,
    ratePerHour: rate,
    machineCost,
    mobilizationLabor,
    mobilizationTravel,
    mobilizationCost,
    otherCosts: other,
    totalCost,
    price,
    profit: price - totalCost,
    pricePerAcre: price / area,
    breakEvenPerAcre: totalCost / area,
    pricePerMachineHour: price / machineHours,
    pricePerDay: price / Math.max(daysOnSite, Number.EPSILON),
    mobilizationShareOfPrice: price === 0 ? 0 : mobilizationCost / price,
  };
}

/**
 * The comparison this tool exists to put in front of an operator.
 *
 * A flat dollars-per-acre number is the thing the trade quotes and the thing
 * a customer shops, and it is the same number on every lot. This re-prices
 * the *same acreage* at each density class and reports what that one flat
 * quote earns or loses on each -- which is the question "what do you charge
 * per acre?" cannot be answered honestly without.
 *
 * `quotedPerAcre` is the number the operator is thinking of saying out loud.
 */
export function compareDensities(input, quotedPerAcre) {
  const quoted = requireFinite(quotedPerAcre, 'Quoted price per acre', { min: 0, max: 1000000 });
  const rows = [];
  for (const [id, density] of Object.entries(DENSITY_CLASSES)) {
    const result = priceJob({
      ...input,
      advanceFtPerMin: density.advanceFtPerMin,
      passes: density.passes,
    });
    const revenue = quoted * result.acres;
    rows.push({
      id,
      label: density.label,
      advanceFtPerMin: density.advanceFtPerMin,
      passes: density.passes,
      acresPerHour: result.acresPerHour,
      machineHours: result.machineHours,
      totalCost: result.totalCost,
      breakEvenPerAcre: result.breakEvenPerAcre,
      revenue,
      profit: revenue - result.totalCost,
      marginPct: revenue === 0 ? 0 : ((revenue - result.totalCost) / revenue) * 100,
    });
  }
  return rows;
}

/**
 * Advisory findings. None of these is an error -- every one describes an
 * operational or commercial fact the arithmetic alone would let an operator
 * quote straight past.
 */
export function reviewJob(input, result) {
  const notes = [];

  if (result.mobilizationShareOfPrice >= 0.25) {
    notes.push({
      severity: 'pricing',
      title: 'Mobilization is most of this job',
      detail:
        `Getting there and back costs ${money(result.mobilizationCost)}, which is ` +
        `${(result.mobilizationShareOfPrice * 100).toFixed(0)}% of the ${money(result.price)} price. ` +
        'A per-acre number cannot carry that, because the trailer trip is the same length whether the ' +
        'lot is half an acre or five. Quote this one as a day rate or a minimum charge, or the next ' +
        'small job at the same per-acre figure is the one that loses money.',
    });
  }

  if (result.ratePerHour.teeth <= 0) {
    notes.push({
      severity: 'cost',
      title: 'No allowance for tooth wear',
      detail:
        'Carbide teeth are a consumable, not a repair: a set is consumed over hundreds of hours and ' +
        'faster in sand, rock or dirty stumps. At zero here the quote is carrying none of it, so the ' +
        'set you replace next season comes out of a job that has already been invoiced.',
    });
  } else if (input.toothSetLifeHours >= 600) {
    notes.push({
      severity: 'cost',
      title: 'That tooth life is optimistic for abrasive ground',
      detail:
        `A set lasting ${input.toothSetLifeHours} hours puts tooth wear at ` +
        `${money(result.ratePerHour.teeth)} an hour. That is achievable in clean standing timber and ` +
        'it is not what sandy or rocky sites return. If this site has rock or you cut near grade, ' +
        'halve the life and see what it does to the price before you send it.',
    });
  }

  const ownershipShare = result.ratePerHour.total === 0
    ? 0
    : result.ratePerHour.ownership / result.ratePerHour.total;
  if (ownershipShare >= 0.3) {
    notes.push({
      severity: 'utilisation',
      title: 'The payment, not the work, is setting your hourly cost',
      detail:
        `At ${input.billableHoursPerMonth} billable hours a month the machine carries ` +
        `${money(result.ratePerHour.ownership)} an hour of payment and insurance — ` +
        `${(ownershipShare * 100).toFixed(0)}% of the ${money(result.ratePerHour.total)} it costs to ` +
        'run. That is a utilisation problem wearing a pricing problem\'s clothes: the same payment ' +
        'over twice the hours halves this line. Check the hours figure against last season before ' +
        'you raise the price to cover it.',
    });
  }

  if (result.daysOnSite > 1 && input.mobilizationTrips <= 1) {
    notes.push({
      severity: 'operational',
      title: 'A multi-day job with one trailer trip budgeted',
      detail:
        `This is ${result.daysOnSite.toFixed(1)} days of machine time and one mobilization. That is ` +
        'right only if the machine stays on site overnight — which is a conversation to have with the ' +
        'landowner and with your insurer, not an assumption. If you float it home each evening, put ' +
        'the real number of trips in.',
    });
  }

  if (Number(input.largestStemInches) > Number(input.headRatedStemInches)) {
    notes.push({
      severity: 'scope',
      title: 'Stems larger than the head is rated for',
      detail:
        `You listed stems up to ${input.largestStemInches} in on a head rated to ` +
        `${input.headRatedStemInches} in. Those are a felling job before they are a mulching job, and ` +
        'the time to take them down is not in the production rate above. Price them separately or ' +
        'exclude them in writing — forcing oversized material through the head is how a day is lost ' +
        'to teeth, a belt, or the drum itself.',
    });
  }

  if (Number(input.targetMarginPct) === 0) {
    notes.push({
      severity: 'pricing',
      title: 'This is the walk-away number, not a bid',
      detail:
        `At 0% margin the ${money(result.price)} is exactly what the job costs you to do. It pays the ` +
        'operator, the fuel, the teeth, the reserve and the payment, and it pays nothing for the risk ' +
        'of the estimate being wrong. Use it as the floor you will not go under, not as the number ' +
        'you send.',
    });
  }

  return notes;
}
