export function calculateRoute(input) {
  const n = (value) => Math.max(0, Number(value) || 0);
  const stops = n(input.stops);
  const miles = n(input.miles);
  const routeHours = n(input.routeHours);
  const waitMinutes = n(input.waitMinutes);
  const graceMinutes = n(input.graceMinutes);
  const revenue = n(input.revenue);
  const labor = (routeHours + Math.max(0, waitMinutes - graceMinutes) / 60) * n(input.loadedLaborRate);
  const vehicle = miles * n(input.vehicleCostPerMile);
  const consumables = stops * n(input.consumablePerStop);
  const overhead = revenue * n(input.overheadRate) / 100;
  const directCost = labor + vehicle + consumables + overhead;
  const margin = revenue - directCost;
  const hours = routeHours + Math.max(0, waitMinutes - graceMinutes) / 60;
  return {
    stops, miles, routeHours, waitMinutes, revenue, labor, vehicle, consumables,
    overhead, directCost, margin, marginRate: revenue ? margin / revenue * 100 : 0,
    marginPerHour: hours ? margin / hours : 0, effectiveRevenuePerHour: hours ? revenue / hours : 0,
    costPerStop: stops ? directCost / stops : 0, billableWaitMinutes: Math.max(0, waitMinutes - graceMinutes), hours
  };
}

export function summary(result, mode = 'scheduled') {
  const verdict = result.margin < 0 ? 'LOSS: renegotiate or decline this route.' : 'Positive contribution margin before taxes and owner draw.';
  return [`Medical courier route margin (${mode})`, `Revenue: $${result.revenue.toFixed(2)}`, `Direct cost: $${result.directCost.toFixed(2)}`, `Contribution margin: $${result.margin.toFixed(2)} (${result.marginRate.toFixed(1)}%)`, `Margin per vehicle-hour: $${result.marginPerHour.toFixed(2)}`, `Stops: ${result.stops} | Miles: ${result.miles} | Paid wait: ${result.billableWaitMinutes} min`, verdict, 'Estimate only. Verify against your contract and completed route.'].join('\n');
}
