// Route economics for an independent medical courier.
//
// WHAT CHANGED, AND WHY
//
// The first version answered "does this route make money?" and stopped. That
// is the wrong half of the courier's actual problem. A route offer arrives
// with a price already on it, and the decision is not only whether to accept
// it -- it is what to counter with, and how much room the route has before it
// stops working. Two things were missing:
//
//   * DEADHEAD. The drive from home to the first stop and back from the last
//     one is unpaid, burns the same fuel, and occupies the same hours, and the
//     calculator had nowhere to put it. A courier entering only the miles
//     between stops was pricing a route that does not exist. It is entered
//     separately rather than folded into "total miles" because the two behave
//     differently in a negotiation: billable miles are a rate conversation,
//     deadhead is a routing one, and a route whose deadhead is the problem is
//     fixed by a different stop order, not a higher price.
//   * THE RATE TO QUOTE. Overhead here is a percentage of revenue, so the
//     revenue that breaks even is not "cost" -- raising the price raises the
//     overhead it has to carry. That fixed point is exactly the arithmetic a
//     courier gets wrong in their head, and it is what turns this from a
//     scenario checker into something you can quote from. Reported per route
//     and per stop, because per stop is the unit these contracts are written
//     in.
//
// Also reports the cost per mile at which the route reaches zero. A courier
// signing a twelve-month contract is taking a position on fuel and
// maintenance, and the useful form of that is not today's number but how far
// it can move first.
//
// Every new field defaults to the neutral value, so the worked example on
// `is-this-medical-courier-route-worth-it.html` still holds.

export function calculateRoute(input) {
  const n = (value) => Math.max(0, Number(value) || 0);
  const stops = n(input.stops);
  const miles = n(input.miles);
  const routeHours = n(input.routeHours);
  const waitMinutes = n(input.waitMinutes);
  const graceMinutes = n(input.graceMinutes);
  const deadheadMiles = n(input.deadheadMiles);
  const deadheadMinutes = n(input.deadheadMinutes);
  const revenue = n(input.revenue);
  const overheadRate = n(input.overheadRate);
  const targetMarginRate = n(input.targetMarginRate);
  const loadedLaborRate = n(input.loadedLaborRate);
  const vehicleCostPerMile = n(input.vehicleCostPerMile);

  const billableWaitMinutes = Math.max(0, waitMinutes - graceMinutes);
  const hours = routeHours + (billableWaitMinutes + deadheadMinutes) / 60;
  const totalMiles = miles + deadheadMiles;

  const labor = hours * loadedLaborRate;
  const vehicle = totalMiles * vehicleCostPerMile;
  const consumables = stops * n(input.consumablePerStop);
  const overhead = (revenue * overheadRate) / 100;
  const directCost = labor + vehicle + consumables + overhead;
  const margin = revenue - directCost;

  // What deadhead alone costs, so a courier can see whether the route or the
  // trip to it is what fails. Not a separate cost line -- these dollars are
  // already inside `labor` and `vehicle` -- so it is never added to
  // `directCost`.
  const deadheadCost = deadheadMiles * vehicleCostPerMile + (deadheadMinutes / 60) * loadedLaborRate;

  // Costs that do not move when the price does. Overhead is excluded because
  // it is a share of revenue, which is the unknown being solved for.
  const revenueIndependentCost = labor + vehicle + consumables;

  // revenue - cost - revenue*(o/100) = revenue*(t/100), solved for revenue.
  // At o + t >= 100 the route would have to charge overhead and margin on more
  // than the whole price: no revenue satisfies it, and null says so rather
  // than returning a negative figure that reads like a discount.
  const revenueFor = (marginRateTarget) => {
    const share = 1 - (overheadRate + marginRateTarget) / 100;
    return share > 0 ? revenueIndependentCost / share : null;
  };
  const perStop = (total) => (total !== null && stops ? total / stops : null);

  const breakEvenRevenue = revenueFor(0);
  const targetRevenue = revenueFor(targetMarginRate);

  // The vehicle cost per mile that takes this route to zero. Null with no
  // miles; zero when the route loses money even if driving were free, which is
  // a different problem and should not read as "any cost per mile works".
  const breakEvenCostPerMile = totalMiles
    ? Math.max(0, (revenue * (1 - overheadRate / 100) - labor - consumables) / totalMiles)
    : null;

  return {
    stops, miles, routeHours, waitMinutes, revenue, labor, vehicle, consumables,
    overhead, directCost, margin, marginRate: revenue ? (margin / revenue) * 100 : 0,
    marginPerHour: hours ? margin / hours : 0, effectiveRevenuePerHour: hours ? revenue / hours : 0,
    costPerStop: stops ? directCost / stops : 0, billableWaitMinutes, hours,
    deadheadMiles, deadheadMinutes, deadheadCost, totalMiles, targetMarginRate,
    breakEvenRevenue, breakEvenPerStop: perStop(breakEvenRevenue),
    targetRevenue, targetPerStop: perStop(targetRevenue),
    breakEvenCostPerMile,
  };
}

const dollars = (value) => (value === null ? 'not reachable at this overhead' : `$${value.toFixed(2)}`);

export function summary(result, mode = 'scheduled') {
  const verdict = result.margin < 0
    ? 'This scenario shows a negative contribution margin before taxes and owner draw.'
    : 'This scenario shows a positive contribution margin before taxes and owner draw.';
  const lines = [
    `Medical courier route margin (${mode})`,
    `Revenue: $${result.revenue.toFixed(2)}`,
    `Direct cost: $${result.directCost.toFixed(2)}`,
    `Contribution margin: $${result.margin.toFixed(2)} (${result.marginRate.toFixed(1)}%)`,
    `Margin per vehicle-hour: $${result.marginPerHour.toFixed(2)}`,
    `Stops: ${result.stops} | Miles: ${result.totalMiles} | Paid wait: ${result.billableWaitMinutes} min`,
  ];
  // Only worth carrying into a quote when there is a per-stop figure to quote.
  if (result.breakEvenPerStop !== null) {
    lines.push(`Break-even: ${dollars(result.breakEvenRevenue)} for the route (${dollars(result.breakEvenPerStop)}/stop)`);
  }
  if (result.targetPerStop !== null) {
    lines.push(`For ${result.targetMarginRate}% margin: ${dollars(result.targetRevenue)} for the route (${dollars(result.targetPerStop)}/stop)`);
  }
  if (result.deadheadCost > 0) {
    lines.push(`Deadhead included: ${result.deadheadMiles} mi / ${result.deadheadMinutes} min, costing ${dollars(result.deadheadCost)}`);
  }
  lines.push(verdict, 'Estimate only. Verify against your contract and completed route.');
  return lines.join('\n');
}
