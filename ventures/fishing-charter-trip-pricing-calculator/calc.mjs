// Fishing charter trip pricing maths. Pure functions, no DOM, no network.
// Every figure is the captain's own input; nothing here is a market rate.

export const SAMPLE = {
  hours: "6", gph: "14", fuelPrice: "4.25", deckhand: "150", bait: "60",
  fixedYear: "21000", booked: "90", cancelPct: "20", feePct: "3", target: "40000",
  anglers: "4", currentPrice: "800", fuelSurchargeFrom: "",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;

export function parse(raw) {
  const errors = [];
  const hours = num(raw.hours), gph = num(raw.gph), fuelPrice = num(raw.fuelPrice);
  const booked = num(raw.booked), fixedYear = num(raw.fixedYear), target = num(raw.target);
  if (!(hours > 0)) errors.push("Enter the trip length in hours (more than 0).");
  if (!(gph >= 0)) errors.push("Enter fuel burn in gallons per hour (0 or more).");
  if (!(fuelPrice >= 0)) errors.push("Enter the fuel price per gallon (0 or more).");
  if (!(fixedYear >= 0)) errors.push("Enter yearly fixed costs: slip, insurance, maintenance, boat payment (0 or more).");
  if (!(booked > 0)) errors.push("Enter how many trips you expect to book in a season (more than 0).");
  if (!(target >= 0)) errors.push("Enter the yearly profit you want to take home (0 or more).");
  const deckhand = opt(raw.deckhand, 0), bait = opt(raw.bait, 0), cancelPct = opt(raw.cancelPct, 0);
  const feePct = opt(raw.feePct, 0), anglers = opt(raw.anglers, NaN), currentPrice = opt(raw.currentPrice, NaN);
  for (const [n, v] of [["Deckhand pay", deckhand], ["Bait and supplies", bait]]) if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(cancelPct >= 0 && cancelPct < 100)) errors.push("Weather cancellations must be from 0 to under 100 percent.");
  if (!(feePct >= 0 && feePct < 50)) errors.push("Card fee must be from 0 to under 50 percent.");
  if (anglers !== anglers ? false : !(anglers >= 1)) errors.push("Anglers per trip must be 1 or more.");
  if (currentPrice !== currentPrice ? false : !(currentPrice >= 0)) errors.push("Current price must be 0 or more.");
  return { errors, hours, gph, fuelPrice, deckhand, bait, fixedYear, booked, cancelPct, feePct, target, anglers, currentPrice };
}

function priceFor(p, completed, profit) {
  const variable = p.hours * p.gph * p.fuelPrice + p.deckhand + p.bait;
  const netNeeded = (p.fixedYear + profit) / completed + variable;
  return { variable, net: netNeeded, price: netNeeded / (1 - p.feePct / 100) };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const completed = p.booked * (1 - p.cancelPct / 100);
  if (!(completed > 0)) return { errors: ["No completed trips left after cancellations."] };
  const fuel = p.hours * p.gph * p.fuelPrice;
  const need = priceFor(p, completed, p.target);
  const breakEven = priceFor(p, completed, 0);
  const fixedPerTrip = p.fixedYear / completed;
  const hasAnglers = p.anglers >= 1, hasCurrent = p.currentPrice >= 0;
  const perAngler = hasAnglers ? need.price / p.anglers : null;
  let current = null;
  if (hasCurrent) {
    const net = p.currentPrice * (1 - p.feePct / 100);
    const contribution = net - need.variable;
    const profitYear = contribution * completed - p.fixedYear;
    const tripsForTarget = contribution > 0 ? (p.fixedYear + p.target) / contribution : null;
    current = { price: p.currentPrice, contribution, profitYear, tripsForTarget, gap: p.currentPrice - need.price };
  }
  const fuelSwing = p.hours * p.gph / (1 - p.feePct / 100);
  const findings = [];
  if (current && current.profitYear < 0)
    findings.push({ severity: "high", title: `At ${dollars(p.currentPrice)} a trip you lose ${dollars(-current.profitYear)} over ${completed.toFixed(0)} completed trips. Break-even is ${dollars(breakEven.price)}.` });
  else if (current && current.gap < 0)
    findings.push({ severity: "medium", title: `${dollars(p.currentPrice)} a trip clears costs but earns ${dollars(current.profitYear)} against your ${dollars(p.target)} target. Price for the target is ${dollars(need.price)}.` });
  if (current && current.tripsForTarget && current.tripsForTarget > p.booked)
    findings.push({ severity: "medium", title: `At the current price you would need about ${Math.ceil(current.tripsForTarget)} completed trips to hit your target, more than the ${p.booked} you expect to book.` });
  if (p.cancelPct >= 15) {
    const noWx = priceFor(p, p.booked, p.target).price;
    findings.push({ severity: "medium", title: `Weather cancellations of ${p.cancelPct}% add ${dollars(need.price - noWx)} to every trip you do run, because fixed costs spread over fewer trips. A deposit or a reschedule policy protects that.` });
  }
  findings.push({ severity: "info", title: `Each $1.00 per gallon move in fuel changes the cost of a trip by about ${dollars(fuelSwing)} at your fee rate. A fuel surcharge clause covers it.` });
  findings.push({ severity: "info", title: `Price for your target: ${dollars(need.price)} a trip${hasAnglers ? ` (${dollars(perAngler)} per angler for ${p.anglers})` : ""}. Costs per completed trip: ${dollars(need.variable)} variable plus ${dollars(fixedPerTrip)} fixed.` });
  const sweep = [0.5, 0.75, 1, 1.25, 1.5].map((f) => {
    const booked = Math.round(p.booked * f);
    const done = booked * (1 - p.cancelPct / 100);
    const r = priceFor(p, done, p.target);
    return { booked, completed: done, price: round2(r.price), perAngler: hasAnglers ? r.price / p.anglers : null };
  });
  return { errors: [], input: p, completed, fuel, variable: need.variable, fixedPerTrip, price: round2(need.price), breakEven: round2(breakEven.price), perAngler, current, fuelSwing, findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Charter pricing: ${p.hours} h trip, ${p.booked} trips booked, ${p.cancelPct}% lost to weather (${r.completed.toFixed(0)} completed)`,
    `Variable cost per trip: ${dollars(r.variable)} (fuel ${dollars(r.fuel)}, deckhand ${dollars(p.deckhand)}, bait and supplies ${dollars(p.bait)}); fixed per completed trip ${dollars(r.fixedPerTrip)}`,
    `Break-even price: ${dollars(r.breakEven)}; price for ${dollars(p.target)} a year: ${dollars(r.price)}${r.perAngler ? ` (${dollars(r.perAngler)} per angler)` : ""}`,
    ...(r.current ? [`At ${dollars(r.current.price)} a trip: ${dollars(r.current.profitYear)} a year`] : []),
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["trips_booked,trips_completed,price_per_trip,price_per_angler", ...r.sweep.map((x) => `${x.booked},${x.completed.toFixed(1)},${x.price.toFixed(2)},${x.perAngler == null ? "" : x.perAngler.toFixed(2)}`)].join("\n");
}
