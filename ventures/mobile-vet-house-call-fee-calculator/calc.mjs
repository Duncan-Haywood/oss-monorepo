// Mobile / house-call veterinary visit: what one visit really costs (drive both ways, mileage at loaded
// vehicle cost, on-site time, supplies, assistant time, forgone clinic-slot value, no-shows), the fee that
// reaches a target margin, the surcharge each travel zone needs, and profit for a day of N visits.
// Pure functions, no I/O. All money in the currency the user types.

export const ZONES = Object.freeze([1, 2, 3, 4]);

export const DEFAULTS = Object.freeze({
  // Travel
  driveMinutes: 25,        // average one-way drive minutes per leg
  driveMiles: 14,          // miles for that same leg
  costPerMile: 0.95,       // loaded vehicle cost: fuel, tires, maintenance, depreciation, insurance
  // Time on site
  setupMinutes: 10,        // parking, greeting, history, handing the pet over
  visitMinutes: 40,        // exam and treatment for the first pet
  extraPetMinutes: 20,     // added minutes for each additional pet
  chartingMinutes: 10,     // records and invoicing after the visit
  pets: 1,                 // pets seen on this visit
  // Fees and supplies
  visitFee: 120,           // house-call / trip fee charged for the visit itself
  servicesPerPet: 180,     // exam, vaccines or treatments billed for the first pet, excluding the visit fee
  multiPetDiscountPct: 10, // discount on services for each additional pet
  suppliesPerPet: 22,      // drugs, consumables and disposables per pet (cost)
  // People and opportunity
  dvmRate: 70,             // what your own hour costs the business
  assistantRate: 22,       // loaded cost per hour of an assistant or technician
  assistantSharePct: 50,   // share of visits an assistant attends
  opportunityPerHour: 20,  // extra margin per hour a clinic slot would earn beyond your pay
  // No-shows
  noShowPct: 6,            // share of booked visits that cancel late or are not home
  noShowFee: 50,           // fee charged on those visits
  // Policy
  targetMarginPct: 35,
  // Travel zones by one-way distance
  zone1MaxMiles: 10, zone2MaxMiles: 20, zone3MaxMiles: 35, farZoneMiles: 45,
  surcharge2: 20, surcharge3: 45, surcharge4: 80,
  // Day plan
  visitsPerDay: 5,
});

// Illustrative starting points only; they overwrite the visit-shaped fields, never the travel or policy fields.
export const PRESETS = Object.freeze({
  wellness: { label: "Wellness or sick visit", setupMinutes: 10, visitMinutes: 40, chartingMinutes: 10, suppliesPerPet: 22, servicesPerPet: 180, visitFee: 120 },
  euthanasia: { label: "In-home euthanasia", setupMinutes: 20, visitMinutes: 60, chartingMinutes: 15, suppliesPerPet: 55, servicesPerPet: 220, visitFee: 150 },
  recheck: { label: "Short recheck or injection", setupMinutes: 5, visitMinutes: 20, chartingMinutes: 5, suppliesPerPet: 10, servicesPerPet: 60, visitFee: 90 },
});

const n = (v, d) => (v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);
const r2 = (x) => Math.round(x * 100) / 100;

export function clean(input = {}) {
  const o = {};
  for (const k of Object.keys(DEFAULTS)) o[k] = n(input[k], DEFAULTS[k]);
  const bad = [];
  for (const k of Object.keys(o)) if (o[k] < 0) bad.push(`${k} cannot be negative.`);
  if (o.targetMarginPct >= 100) bad.push("Target margin must be below 100.");
  if (o.noShowPct >= 100) bad.push("No-show rate must be below 100.");
  if (o.assistantSharePct > 100) bad.push("Assistant share cannot exceed 100.");
  if (o.driveMiles <= 0) bad.push("Miles per drive leg must be above zero.");
  if (!Number.isInteger(o.pets) || o.pets < 1) bad.push("Pets per visit must be a whole number, at least 1.");
  if (!Number.isInteger(o.visitsPerDay) || o.visitsPerDay < 1) bad.push("Visits per day must be a whole number, at least 1.");
  if (!(o.zone1MaxMiles < o.zone2MaxMiles && o.zone2MaxMiles < o.zone3MaxMiles && o.zone3MaxMiles < o.farZoneMiles)) bad.push("Zone distances must increase: zone 1 < zone 2 < zone 3 < far zone.");
  return { o, error: bad.length ? bad.join(" ") : null };
}

export function zoneOf(o, miles) {
  return miles <= o.zone1MaxMiles ? 1 : miles <= o.zone2MaxMiles ? 2 : miles <= o.zone3MaxMiles ? 3 : 4;
}
export const surchargeFor = (o, zone) => [0, o.surcharge2, o.surcharge3, o.surcharge4][zone - 1];

const crewRate = (o) => o.dvmRate + (o.assistantRate * o.assistantSharePct) / 100;
export const onSiteMinutes = (o, pets) => o.setupMinutes + o.visitMinutes + (pets - 1) * o.extraPetMinutes + o.chartingMinutes;
export const servicesRevenue = (o, pets) => o.servicesPerPet * (1 + (pets - 1) * (1 - o.multiPetDiscountPct / 100));

// One completed visit at `miles` one-way, including the no-show drag spread over completed visits.
export function visitCase(o, miles, pets = o.pets, zone = zoneOf(o, miles)) {
  const driveMin = (o.driveMinutes * miles) / o.driveMiles;
  const driveH = (2 * driveMin) / 60;
  const siteH = onSiteMinutes(o, pets) / 60;
  const hours = driveH + siteH;
  const rate = crewRate(o);
  const parts = {
    vehicle: 2 * miles * o.costPerMile,
    labor: rate * hours,
    opportunity: o.opportunityPerHour * hours,
    supplies: o.suppliesPerPet * pets,
  };
  const baseCost = parts.vehicle + parts.labor + parts.opportunity + parts.supplies;
  // A no-show still costs the drive both ways (vehicle, crew and slot value) and earns only the no-show fee.
  const noShowCost = parts.vehicle + (rate + o.opportunityPerHour) * driveH;
  const p = o.noShowPct / 100;
  const noShowDrag = (p / (1 - p)) * (noShowCost - o.noShowFee);
  const cost = baseCost + noShowDrag;
  const services = servicesRevenue(o, pets);
  const surcharge = surchargeFor(o, zone);
  const charged = o.visitFee + surcharge;
  const revenue = charged + services;
  const profit = revenue - cost;
  const requiredTotal = cost / (1 - o.targetMarginPct / 100);
  return {
    zone, miles, driveMin: r2(driveMin), hours: r2(hours), parts, noShowCost: r2(noShowCost), noShowDrag: r2(noShowDrag),
    baseCost: r2(baseCost), cost: r2(cost), services: r2(services), surcharge, charged: r2(charged), revenue: r2(revenue),
    profit: r2(profit), margin: revenue > 0 ? profit / revenue : 0,
    requiredTotal: r2(requiredTotal), requiredVisitFee: r2(requiredTotal - services),
  };
}

// Profit for a day of N booked visits on a chained route (home -> 1 -> ... -> N -> home), N + 1 legs of average drive time.
export function dayPlan(o, visits = o.visitsPerDay) {
  const p = o.noShowPct / 100;
  const completed = visits * (1 - p), noShows = visits * p;
  const legs = visits + 1;
  const driveH = (legs * o.driveMinutes) / 60;
  const siteH = (completed * onSiteMinutes(o, o.pets)) / 60;
  const hours = driveH + siteH;
  const miles = legs * o.driveMiles;
  const zone = zoneOf(o, o.driveMiles);
  const perVisitRevenue = o.visitFee + surchargeFor(o, zone) + servicesRevenue(o, o.pets);
  const revenue = completed * perVisitRevenue + noShows * o.noShowFee;
  const cost = miles * o.costPerMile + (crewRate(o) + o.opportunityPerHour) * hours + completed * o.suppliesPerPet * o.pets;
  const profit = revenue - cost;
  return {
    visits, legs, completed: r2(completed), noShows: r2(noShows), hours: r2(hours), driveHours: r2(driveH), miles: r2(miles),
    revenue: r2(revenue), cost: r2(cost), profit: r2(profit), margin: revenue > 0 ? profit / revenue : 0,
    profitPerHour: hours > 0 ? r2(profit / hours) : 0,
  };
}

export function estimate(input) {
  const { o, error } = clean(input);
  if (error) return { error };
  const here = visitCase(o, o.driveMiles);
  const zoneMiles = [o.zone1MaxMiles, o.zone2MaxMiles, o.zone3MaxMiles, o.farZoneMiles];
  const zones = ZONES.map((z, i) => {
    const c = visitCase(o, zoneMiles[i], o.pets, z);
    return { ...c, label: i === 0 ? `0-${zoneMiles[0]} mi` : i === 3 ? `${o.zone3MaxMiles}+ mi (priced at ${o.farZoneMiles})` : `${zoneMiles[i - 1]}-${zoneMiles[i]} mi` };
  });
  // Surcharge each zone needs, measured against zone 1, so the visit fee itself stays one number.
  for (const z of zones) z.surchargeNeeded = r2((z.cost - zones[0].cost) / (1 - o.targetMarginPct / 100));
  const days = [];
  for (let k = 1; k <= 8; k++) days.push(dayPlan(o, k));
  const day = dayPlan(o);
  const findings = [];
  if (here.profit < 0) {
    findings.push({ severity: "high", title: `This visit loses ${r2(-here.profit)} at the fee you charge`,
      detail: `Loaded cost is ${here.cost} against ${here.revenue} billed. The visit fee needed for a ${o.targetMarginPct}% margin is ${here.requiredVisitFee}, versus the ${here.charged} you charge (fee plus zone surcharge).` });
  } else if (here.margin < o.targetMarginPct / 100) {
    findings.push({ severity: "medium", title: `Margin is ${(here.margin * 100).toFixed(1)}%, below your ${o.targetMarginPct}% target`,
      detail: `Raising the visit fee (including any zone surcharge) from ${here.charged} to ${here.requiredVisitFee} reaches the target on this visit.` });
  } else {
    findings.push({ severity: "info", title: "This visit clears your target margin", detail: `Billed ${here.revenue} against ${here.cost} loaded cost.` });
  }
  const under = zones.filter((z) => z.profit < 0);
  if (under.length) {
    findings.push({ severity: "high", title: `Zone ${under.map((z) => z.zone).join(", ")} visits lose money at the current surcharges`,
      detail: under.map((z) => `zone ${z.zone}: surcharge ${z.surcharge} charged, ${z.surchargeNeeded} needed over zone 1 for target margin`).join("; ") + "." });
  }
  if (here.noShowDrag > 0) {
    findings.push({ severity: "info", title: `No-shows add ${here.noShowDrag} to the cost of each completed visit`,
      detail: `At ${o.noShowPct}% no-shows, each wasted trip costs about ${here.noShowCost} against a ${o.noShowFee} no-show fee. A late-cancel fee that covers the trip removes this.` });
  }
  const driveShare = day.hours > 0 ? day.driveHours / day.hours : 0;
  findings.push({ severity: "info", title: `Driving is ${(driveShare * 100).toFixed(0)}% of a ${day.visits}-visit day`,
    detail: `${day.driveHours} of ${day.hours} working hours are on the road, which no client is billed for directly. Tighter clusters of visits raise profit per hour faster than fee changes do.` });
  return { o, here, zones, day, days, findings };
}

export const money = (x) => (x < 0 ? "-" : "") + "$" + Math.abs(Math.round(x * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + "%";
