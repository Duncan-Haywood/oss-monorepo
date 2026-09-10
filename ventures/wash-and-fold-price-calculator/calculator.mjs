/**
 * Wash-dry-fold (WDF) economics for a laundromat or laundry pickup-and-delivery
 * operator, as one deterministic function with no dependencies.
 *
 * The question this answers is the one that decides whether a per-pound laundry
 * service makes money: what does one order actually cost to process once labour
 * minutes, machine cycles, supplies, the delivery stops and an overhead share
 * are all counted, and what price per pound clears that cost.
 *
 * Two things a flat "$1.75 a pound" number hides, and both are modelled here:
 *
 *   1. Machine cost is *stepwise*, not per-pound. A 22 lb order on 20 lb
 *      washers runs two washers, and the second one costs a full cycle whether
 *      it is full or 10% full. Averaging a cycle across a pound smooths away
 *      exactly the loss that shows up on small orders.
 *   2. Some cost is per *order*, not per pound — intake, tagging, staging and
 *      checkout, plus the drive to and from the customer's door on a delivery
 *      route. A 10 lb order and a 30 lb order carry the same amount of it, so
 *      the cost per pound of a small order is far above the average.
 *
 * Nothing here asserts a price the operator should charge, what a local water,
 * sewer or gas tariff is, or what any wage or employment rule requires. Every
 * rate is a number the operator types in from their own bills and payroll.
 */

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function round(n, places = 2) {
  const factor = 10 ** places;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function num(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Cost of one order of a given weight, under one set of rates.
 *
 * Exported because the minimum-charge finding needs to cost a *different*
 * order size than the average one — the smallest order the operator accepts —
 * and re-deriving that arithmetic separately is how the two numbers drift.
 *
 * @param {number} pounds
 * @param {object} rates
 * @returns {{labor:number, machine:number, supplies:number, delivery:number, overhead:number, total:number, washLoads:number, dryLoads:number}}
 */
export function costOfOrder(pounds, rates) {
  const lbs = num(pounds, 0);
  const laborPerMinute = (rates.wagePerHour * (1 + rates.payrollLoadPct / 100)) / 60;

  const labor = round(
    (rates.laborMinutesPerPound * lbs + rates.fixedMinutesPerOrder) * laborPerMinute,
    2,
  );

  const washLoads = lbs > 0 ? Math.ceil(lbs / rates.poundsPerWasherLoad) : 0;
  const dryLoads = lbs > 0 ? Math.ceil(lbs / rates.poundsPerDryerLoad) : 0;
  const machine = round(washLoads * rates.washCostPerLoad + dryLoads * rates.dryCostPerLoad, 2);

  const supplies = round(rates.suppliesCostPerPound * lbs, 2);

  const delivery = round(
    rates.deliveryStopsPerOrder *
      (rates.driveMinutesPerStop * laborPerMinute + rates.milesPerStop * rates.vehicleCostPerMile),
    2,
  );

  const overhead = round(rates.overheadPerPound * lbs, 2);

  return {
    labor,
    machine,
    supplies,
    delivery,
    overhead,
    total: round(labor + machine + supplies + delivery + overhead, 2),
    washLoads,
    dryLoads,
  };
}

/**
 * @param {object} input every rate the operator reads off their own bills
 * @returns {object} per-order and per-pound cost, break-even and target prices,
 *   the volume needed for a monthly profit goal, and findings to act on
 */
export function computeWashAndFold(input = {}) {
  const rates = {
    laborMinutesPerPound: num(input.laborMinutesPerPound, 0),
    fixedMinutesPerOrder: num(input.fixedMinutesPerOrder, 0),
    wagePerHour: num(input.wagePerHour, 0),
    payrollLoadPct: num(input.payrollLoadPct, 0),
    poundsPerWasherLoad: positive(input.poundsPerWasherLoad, 20),
    washCostPerLoad: num(input.washCostPerLoad, 0),
    poundsPerDryerLoad: positive(input.poundsPerDryerLoad, 20),
    dryCostPerLoad: num(input.dryCostPerLoad, 0),
    suppliesCostPerPound: num(input.suppliesCostPerPound, 0),
    deliveryStopsPerOrder: num(input.deliveryStopsPerOrder, 0),
    driveMinutesPerStop: num(input.driveMinutesPerStop, 0),
    milesPerStop: num(input.milesPerStop, 0),
    vehicleCostPerMile: num(input.vehicleCostPerMile, 0),
    overheadPerPound: 0,
  };

  const monthlyOverhead = num(input.monthlyOverhead, 0);
  const monthlyPounds = num(input.monthlyPounds, 0);
  rates.overheadPerPound = monthlyPounds > 0 ? monthlyOverhead / monthlyPounds : 0;

  const avgOrderPounds = positive(input.avgOrderPounds, 0);
  const minimumOrderPounds = positive(input.minimumOrderPounds, 0);
  const pricePerPound = num(input.pricePerPound, 0);
  const minimumCharge = num(input.minimumCharge, 0);
  const targetMarginPct = Math.min(num(input.targetMarginPct, 0), 95);
  const monthlyProfitGoal = num(input.monthlyProfitGoal, 0);

  const order = costOfOrder(avgOrderPounds, rates);
  const costPerPound = avgOrderPounds > 0 ? round(order.total / avgOrderPounds, 4) : 0;

  const perPound = {
    labor: avgOrderPounds > 0 ? round(order.labor / avgOrderPounds, 4) : 0,
    machine: avgOrderPounds > 0 ? round(order.machine / avgOrderPounds, 4) : 0,
    supplies: avgOrderPounds > 0 ? round(order.supplies / avgOrderPounds, 4) : 0,
    delivery: avgOrderPounds > 0 ? round(order.delivery / avgOrderPounds, 4) : 0,
    overhead: avgOrderPounds > 0 ? round(order.overhead / avgOrderPounds, 4) : 0,
  };

  const listPrice = round(pricePerPound * avgOrderPounds, 2);
  const minimumApplied = minimumCharge > listPrice && avgOrderPounds > 0;
  const revenuePerOrder = avgOrderPounds > 0 ? Math.max(listPrice, minimumCharge) : 0;
  const profitPerOrder = round(revenuePerOrder - order.total, 2);
  const marginPct = revenuePerOrder > 0 ? round((profitPerOrder / revenuePerOrder) * 100, 1) : 0;
  const profitPerPound = avgOrderPounds > 0 ? round(profitPerOrder / avgOrderPounds, 4) : 0;

  const breakEvenPricePerPound = costPerPound;
  const targetPricePerPound =
    targetMarginPct > 0 ? round(costPerPound / (1 - targetMarginPct / 100), 4) : null;

  const monthlyProfitAtVolume =
    monthlyPounds > 0 && avgOrderPounds > 0 ? round(profitPerPound * monthlyPounds, 2) : null;
  const poundsForGoal =
    monthlyProfitGoal > 0 && profitPerPound > 0
      ? Math.ceil(monthlyProfitGoal / profitPerPound)
      : null;
  const ordersForGoal =
    poundsForGoal !== null && avgOrderPounds > 0 ? Math.ceil(poundsForGoal / avgOrderPounds) : null;

  const findings = [];

  if (avgOrderPounds <= 0 || rates.wagePerHour <= 0) {
    findings.push({
      id: "missing-basics",
      severity: SEVERITY.INFO,
      title: "Enter an average order weight and a wage",
      detail:
        "Cost per pound is labour minutes plus machine cycles plus supplies, divided by the pounds in a typical order — so the average order weight and the loaded wage are what the whole calculation rests on.",
    });
  }

  if (avgOrderPounds > 0 && pricePerPound > 0 && pricePerPound < costPerPound) {
    findings.push({
      id: "below-break-even",
      severity: SEVERITY.HIGH,
      title: `Your price is ${money(costPerPound - pricePerPound)} a pound below cost`,
      detail: `At ${money(pricePerPound)} a pound against a cost of ${money(costPerPound)}, a typical ${avgOrderPounds} lb order loses ${money(Math.abs(profitPerOrder))}. Break-even on these numbers is ${money(breakEvenPricePerPound)} a pound.`,
    });
  }

  if (minimumOrderPounds > 0 && pricePerPound > 0) {
    const smallest = costOfOrder(minimumOrderPounds, rates);
    const smallestRevenue = Math.max(round(pricePerPound * minimumOrderPounds, 2), minimumCharge);
    if (smallestRevenue < smallest.total) {
      findings.push({
        id: "minimum-below-cost",
        severity: SEVERITY.HIGH,
        title: `A ${minimumOrderPounds} lb order at your minimum loses ${money(smallest.total - smallestRevenue)}`,
        detail: `The smallest order you accept brings in ${money(smallestRevenue)} and costs ${money(smallest.total)} to process — the per-order costs (intake, tagging${rates.deliveryStopsPerOrder > 0 ? ", the drive to the door" : ""}, and a full wash and dry cycle) do not shrink with the weight. A minimum charge of ${money(smallest.total)} or more covers it.`,
      });
    }
  }

  if (avgOrderPounds > 0 && order.delivery > 0 && order.delivery > order.labor + order.machine) {
    findings.push({
      id: "delivery-dominates",
      severity: SEVERITY.MEDIUM,
      title: "Delivery costs more than washing this order",
      detail: `${money(order.delivery)} of driving against ${money(order.labor + order.machine)} of labour and machine time. Delivery cost is per stop, so it falls per pound as the order gets bigger — a route minimum, a bag minimum, or a delivery fee on small orders is what usually closes this gap.`,
    });
  }

  if (
    avgOrderPounds > 0 &&
    pricePerPound >= costPerPound &&
    targetPricePerPound !== null &&
    pricePerPound < targetPricePerPound
  ) {
    findings.push({
      id: "below-target-margin",
      severity: SEVERITY.MEDIUM,
      title: `Above cost, but short of your ${targetMarginPct}% margin target`,
      detail: `This order earns ${marginPct}%. ${money(targetPricePerPound)} a pound would hit ${targetMarginPct}% on the same costs.`,
    });
  }

  if (monthlyOverhead <= 0 || monthlyPounds <= 0) {
    findings.push({
      id: "no-overhead-allocated",
      severity: SEVERITY.MEDIUM,
      title: "No overhead share is in this number",
      detail:
        "With monthly overhead or monthly volume left blank, the cost below is the touch cost of the order only — rent, insurance, the base utility bill and the card processor are not in it. Enter both to see what an order has to carry.",
    });
  }

  if (avgOrderPounds > 0) {
    const washSpill = order.washLoads * rates.poundsPerWasherLoad - avgOrderPounds;
    if (order.washLoads > 1 && washSpill >= rates.poundsPerWasherLoad / 2) {
      findings.push({
        id: "partial-machine-load",
        severity: SEVERITY.LOW,
        title: `A typical order runs ${order.washLoads} washers, the last one mostly empty`,
        detail: `${avgOrderPounds} lb across ${rates.poundsPerWasherLoad} lb washers leaves about ${round(washSpill, 1)} lb of unused capacity, and a partly full cycle costs the same as a full one. Sorting to fill a machine, or a bag size that lands near a machine's capacity, is worth more per order than a supplies change.`,
      });
    }
  }

  findings.push({
    id: "rates-are-yours",
    severity: SEVERITY.INFO,
    title: "These are your rates, not a benchmark",
    detail:
      "Water, sewer, gas and electricity tariffs, wage rules and machine efficiency vary by city and by machine, so read the cycle costs off your own utility bills and your own equipment's specifications rather than a published average. This tool does the arithmetic on the numbers you enter; it does not price your market and it is not tax, financial, or employment advice.",
  });

  return {
    order,
    costPerPound,
    perPound,
    revenuePerOrder,
    minimumApplied,
    profitPerOrder,
    marginPct,
    profitPerPound,
    breakEvenPricePerPound,
    targetPricePerPound,
    monthlyProfitAtVolume,
    poundsForGoal,
    ordersForGoal,
    findings,
  };
}

// Findings quote figures in the text of the sentence, so the formatting lives
// here rather than in the page: a headline number and the sentence explaining
// it should never round differently.
function money(n) {
  const value = Number.isFinite(n) ? n : 0;
  const format = (v) => `$${v.toFixed(2)}`;
  const text = format(Math.abs(value));
  // Sign outside the symbol ("-$9.24", never "$-9.24"), and never on a value
  // that rounds to zero — `platform/ci/check_money_sign.py` guards both.
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}
