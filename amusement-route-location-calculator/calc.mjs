// Amusement route location check. A coin-op route (arcade cabinets, pool tables,
// claw machines, kiddie rides) earns money one location at a time, and the owner
// of the location takes a commission. For each location this takes out commission,
// prizes, card fees, repairs, licences, machine wear and driving, then divides what
// is left by the hours the stop takes, and reports:
//   - profit per route hour (before paying yourself)
//   - the weekly take per machine needed to earn your target hourly
//   - the highest commission you can pay and still earn it
// All linear in the weekly take and the commission, so both thresholds are exact:
//   G = take*machines*52/12                         (monthly gross)
//   profit = G*(1 - com - cogs - card) - fixed       (fixed does not depend on G)
//   card = cardShare*cardFee

export const MAX_LOCATIONS = 12;

export function validateInput(i) {
  const e = [];
  const nonneg = (v) => Number.isFinite(v) && v >= 0;
  if (!nonneg(i.targetHourly) || i.targetHourly > 500) e.push("Target hourly must be between $0 and $500.");
  if (!nonneg(i.costPerMile) || i.costPerMile > 5) e.push("Cost per mile must be between $0 and $5.");
  if (!nonneg(i.prizePct) || i.prizePct > 90) e.push("Prize and product cost must be between 0% and 90% of takings.");
  if (!nonneg(i.cardSharePct) || i.cardSharePct > 100) e.push("Card share of takings must be between 0% and 100%.");
  if (!nonneg(i.cardFeePct) || i.cardFeePct > 15) e.push("Card fee must be between 0% and 15%.");
  if (!nonneg(i.repairPerMachine) || i.repairPerMachine > 2000) e.push("Repairs per machine per month must be zero or more.");
  if (!nonneg(i.licensePerMachineYear) || i.licensePerMachineYear > 20000) e.push("Licence per machine per year must be zero or more.");
  if (!nonneg(i.machinePrice) || i.machinePrice > 100000) e.push("Machine price must be zero or more.");
  if (!(Number.isFinite(i.lifeYears) && i.lifeYears >= 1 && i.lifeYears <= 30)) e.push("Machine life must be between 1 and 30 years.");
  if (!Array.isArray(i.locations) || i.locations.length < 1) e.push("Add at least one location.");
  else if (i.locations.length > MAX_LOCATIONS) e.push(`This tool takes up to ${MAX_LOCATIONS} locations.`);
  else i.locations.forEach((l, k) => {
    const n = `Location ${k + 1}`;
    if (!(Number.isInteger(l.machines) && l.machines >= 1 && l.machines <= 100)) e.push(`${n}: machines must be a whole number from 1 to 100.`);
    if (!(Number.isFinite(l.weeklyTake) && l.weeklyTake > 0 && l.weeklyTake <= 20000)) e.push(`${n}: enter a weekly take per machine above zero.`);
    if (!(nonneg(l.commissionPct) && l.commissionPct <= 90)) e.push(`${n}: commission must be between 0% and 90%.`);
    if (!(Number.isFinite(l.visitsPerMonth) && l.visitsPerMonth > 0 && l.visitsPerMonth <= 62)) e.push(`${n}: visits per month must be above zero.`);
    if (!(nonneg(l.miles) && l.miles <= 2000)) e.push(`${n}: round-trip miles must be zero or more.`);
    if (!(Number.isFinite(l.minutes) && l.minutes >= 5 && l.minutes <= 600)) e.push(`${n}: minutes per visit (driving and on site) must be between 5 and 600.`);
  });
  return e;
}

function economics(i, l) {
  const cardRate = (i.cardSharePct / 100) * (i.cardFeePct / 100);
  const com = l.commissionPct / 100, cogs = i.prizePct / 100;
  const gross = (l.weeklyTake * l.machines * 52) / 12;
  const hours = (l.visitsPerMonth * l.minutes) / 60;
  const fixed = (i.repairPerMachine + i.licensePerMachineYear / 12 + (i.machinePrice / (i.lifeYears * 12))) * l.machines + l.visitsPerMonth * l.miles * i.costPerMile;
  const keep = 1 - com - cogs - cardRate;
  const profit = gross * keep - fixed;
  const need = (fixed + i.targetHourly * hours) / keep; // monthly gross that earns the target
  const maxCom = 1 - cogs - cardRate - (fixed + i.targetHourly * hours) / gross;
  return {
    gross, hours, commission: gross * com, prizes: gross * cogs, cardFees: gross * cardRate,
    repairs: i.repairPerMachine * l.machines, licence: (i.licensePerMachineYear / 12) * l.machines,
    wear: (i.machinePrice / (i.lifeYears * 12)) * l.machines, driving: l.visitsPerMonth * l.miles * i.costPerMile,
    profit, perHour: profit / hours, meets: profit / hours >= i.targetHourly - 1e-9,
    breakEvenTake: keep > 0 ? (need * 12) / (52 * l.machines) : null,
    maxCommissionPct: Math.max(-100, maxCom * 100),
  };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const i = input;
  const rows = i.locations.map((l, k) => ({ index: k + 1, name: l.name || `Location ${k + 1}`, machines: l.machines, weeklyTake: l.weeklyTake, commissionPct: l.commissionPct, ...economics(i, l) }));
  const totalProfit = rows.reduce((a, r) => a + r.profit, 0);
  const totalHours = rows.reduce((a, r) => a + r.hours, 0);
  const totalGross = rows.reduce((a, r) => a + r.gross, 0);
  const worst = rows.reduce((a, r) => (r.perHour < a.perHour ? r : a), rows[0]);
  const best = rows.reduce((a, r) => (r.perHour > a.perHour ? r : a), rows[0]);
  const losing = rows.filter((r) => r.profit < 0);
  return { ok: true, input: i, rows, totals: { gross: totalGross, profit: totalProfit, hours: totalHours, perHour: totalProfit / totalHours, machines: rows.reduce((a, r) => a + r.machines, 0) }, worstIndex: worst.index, bestIndex: best.index, losingCount: losing.length, notes: buildNotes(i, rows, worst, best, losing, totalProfit / totalHours) };
}

function buildNotes(i, rows, worst, best, losing, routePerHour) {
  const n = [];
  const below = rows.filter((r) => !r.meets);
  if (below.length === 0) n.push("Every location clears your target hourly.");
  else n.push(`${below.length} of ${rows.length} locations earn less than your target of ${money(i.targetHourly)} an hour. Furthest below: ${worst.name} at ${money(worst.perHour)} an hour.`);
  for (const r of below) {
    if (r.maxCommissionPct >= 0) n.push(`${r.name}: asking for a commission of ${r.maxCommissionPct.toFixed(1)}% or less (now ${r.commissionPct}%) would reach your target.`);
    else n.push(`${r.name}: no commission reaches your target at this take, even at 0%. It needs ${cents(r.breakEvenTake)} a week per machine at the current commission, or fewer visits and miles.`);
  }
  if (losing.length) n.push(`${losing.length} location${losing.length > 1 ? "s lose" : " loses"} money before paying you anything: ${losing.map((r) => r.name).join(", ")}.`);
  if (rows.length > 1 && best.perHour > 0 && worst.perHour < i.targetHourly) n.push(`Your best location earns ${money(best.perHour)} an hour and your worst ${money(worst.perHour)}; the route averages ${money(routePerHour)}.`);
  return n;
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);

export function sampleInput() {
  return {
    targetHourly: 35, costPerMile: 0.6, prizePct: 8, cardSharePct: 40, cardFeePct: 3.5, repairPerMachine: 18, licensePerMachineYear: 120, machinePrice: 3500, lifeYears: 7,
    locations: [
      { name: "Corner bar (pool tables)", machines: 2, weeklyTake: 140, commissionPct: 50, visitsPerMonth: 4, miles: 18, minutes: 45 },
      { name: "Bowling alley (arcade)", machines: 6, weeklyTake: 85, commissionPct: 40, visitsPerMonth: 4, miles: 32, minutes: 75 },
      { name: "Laundromat (claw machine)", machines: 1, weeklyTake: 210, commissionPct: 45, visitsPerMonth: 4, miles: 12, minutes: 30 },
      { name: "Truck stop (three games)", machines: 3, weeklyTake: 60, commissionPct: 55, visitsPerMonth: 2, miles: 70, minutes: 90 },
      { name: "Pizza parlour (kiddie rides)", machines: 2, weeklyTake: 40, commissionPct: 50, visitsPerMonth: 2, miles: 10, minutes: 25 },
    ],
  };
}

export function resultText(r) {
  const lines = [`Amusement route check: target ${money(r.input.targetHourly)}/hr, ${r.totals.machines} machines, ${r.rows.length} locations`];
  for (const x of r.rows) lines.push(`${x.name}: ${money(x.profit)} a month, ${money(x.perHour)}/hr (${x.meets ? "meets" : "below"} target), break-even take ${x.breakEvenTake == null ? "n/a" : cents(x.breakEvenTake)} per machine a week, highest commission ${x.maxCommissionPct.toFixed(1)}%`);
  lines.push(`Route: ${money(r.totals.profit)} a month before your own pay, ${r.totals.hours.toFixed(1)} h/month, ${money(r.totals.perHour)}/hr`);
  lines.push("Arithmetic on the numbers entered, not tax, financial or business advice.");
  return lines.join("\n");
}

export function resultCsv(r) {
  const head = "location,machines,weekly_take_per_machine,commission_pct,monthly_gross,commission,prizes,card_fees,repairs,licence,machine_wear,driving,profit,hours,profit_per_hour,break_even_weekly_take,max_commission_pct";
  const f = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const rows = r.rows.map((x) => [x.name, x.machines, x.weeklyTake, x.commissionPct, x.gross, x.commission, x.prizes, x.cardFees, x.repairs, x.licence, x.wear, x.driving, x.profit, x.hours, x.perHour, x.breakEvenTake, x.maxCommissionPct]);
  return [head, ...rows.map((x) => x.map(f).join(","))].join("\n");
}

export function serializeState(input) { return JSON.stringify({ app: "amusement-route-location-calculator", version: 1, input }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== "amusement-route-location-calculator" || !d.input) return { error: "That file is not a saved amusement route scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input };
}
