// Retreat, workshop and group-trip profit: what to charge, how many people you need, and what a thin turnout costs.
// A yoga teacher, coach or trip organizer books a venue and instructors months ahead, sells seats in an early-bird tier and
// a regular tier, and is left with whatever turnout and card fees allow. Many venues also bill a guaranteed minimum number of
// people even if fewer come. This puts the whole thing on one page: profit at the turnout you expect, the break-even number of
// paying guests, the price that hits a profit target, and how profit moves with fill and price.
// Arithmetic on the numbers the user types. Costs and turnout are inputs, not predictions.

export const DEFAULTS = {
  capacity: "20", nights: "4", comps: "2", expected: "14",
  early: "1900", earlySeats: "6", price: "2400", processing: "3",
  venue: "9000", instructors: "6000", marketing: "2500", insurance: "600", travel: "1200", misc: "800",
  perNight: "135", guarantee: "16", target: "5000",
};
export const EXAMPLE = { ...DEFAULTS };
export const KEYS = Object.keys(DEFAULTS);
export const FILLS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
export const PRICE_STEPS = [-0.2, -0.1, 0, 0.1, 0.2];

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const pct = (n, d = 0) => (n * 100).toFixed(d) + "%";

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

const SPEC = {
  capacity: [1, 500, "Capacity (beds or seats)"], nights: [1, 60, "Nights"], comps: [0, 100, "Free staff or teacher spots"],
  expected: [0, 500, "Paying guests you expect"], early: [0, 1e6, "Early-bird price ($)"], earlySeats: [0, 500, "Early-bird seats"],
  price: [0, 1e6, "Regular price ($)"], processing: [0, 15, "Card and platform fees (%)"], venue: [0, 1e7, "Venue or space ($)"],
  instructors: [0, 1e7, "Instructors and speakers ($)"], marketing: [0, 1e7, "Marketing ($)"], insurance: [0, 1e6, "Insurance ($)"],
  travel: [0, 1e7, "Your travel and site visit ($)"], misc: [0, 1e7, "Everything else, fixed ($)"],
  perNight: [0, 1e5, "Lodging and meals per person per night ($)"], guarantee: [0, 500, "Venue guaranteed minimum people"],
  target: [-1e7, 1e8, "Profit you want ($)"],
};

export function parseInputs(input, warnings) {
  const v = {};
  for (const [k, [lo, hi, label]] of Object.entries(SPEC)) {
    const n = num(input[k]);
    if (n === null || Number.isNaN(n) || n < lo || n > hi) { warnings.push(`${label} must be a number from ${lo} to ${hi}.`); v[k] = NaN; } else v[k] = n;
  }
  return v;
}

export const fixedCost = (v) => v.venue + v.instructors + v.marketing + v.insurance + v.travel + v.misc;
export const perPerson = (v) => v.nights * v.perNight;
export const seatsForSale = (v) => Math.max(0, v.capacity - v.comps);

// Ticket revenue for `n` paying guests at regular price `p`: the first earlySeats go at the early-bird price.
export function ticketRevenue(v, n, p = v.price) {
  const early = Math.min(n, v.earlySeats);
  return early * v.early + Math.max(0, n - early) * p;
}

// Profit for n paying guests. The venue bills the larger of actual people (guests + free spots) and the guaranteed minimum.
export function profit(v, n, p = v.price) {
  const gross = ticketRevenue(v, n, p);
  const fees = gross * (v.processing / 100);
  const billed = Math.max(n + v.comps, v.guarantee);
  const variable = billed * perPerson(v);
  return { gross, fees, variable, fixed: fixedCost(v), billed, empty: Math.max(0, billed - (n + v.comps)), profit: gross - fees - variable - fixedCost(v) };
}

export function breakEvenGuests(v, p = v.price) {
  for (let n = 0; n <= seatsForSale(v); n++) if (profit(v, n, p).profit >= 0) return n;
  return null;
}

// Regular price that yields `goal` profit with n guests (early-bird seats stay at their price). Null if the goal needs a negative price.
export function priceForProfit(v, n, goal) {
  const f = 1 - v.processing / 100;
  const late = Math.max(0, n - Math.min(n, v.earlySeats));
  const fixedPart = Math.min(n, v.earlySeats) * v.early * f;
  const costs = profit(v, n).variable + fixedCost(v);
  if (late === 0) return fixedPart - costs >= goal ? 0 : null;
  const p = (goal + costs - fixedPart) / (late * f);
  return p < 0 ? 0 : p;
}

export function analyze(input) {
  const warnings = [];
  const v = parseInputs(input, warnings);
  if (Object.values(v).some(Number.isNaN)) return { ok: false, warnings };
  if (v.expected > seatsForSale(v)) warnings.push(`You expect ${v.expected} paying guests but only ${seatsForSale(v)} seats are for sale after ${v.comps} free spots. Results use ${seatsForSale(v)}.`);
  const n = Math.min(v.expected, seatsForSale(v));
  const base = profit(v, n);
  const perHead = base.billed > 0 ? perPerson(v) : 0;
  const be = breakEvenGuests(v);
  const fills = FILLS.map((f) => {
    const guests = Math.min(seatsForSale(v), Math.round(seatsForSale(v) * f));
    return { fill: f, guests, ...profit(v, guests) };
  });
  const prices = PRICE_STEPS.map((s) => {
    const p = Math.round(v.price * (1 + s));
    return { step: s, price: p, ...profit(v, n, p) };
  });
  const goalPrice = priceForProfit(v, n, v.target);
  const margin = base.gross > 0 ? base.profit / base.gross : null;
  const guaranteeCost = base.empty * perHead;
  const noEarly = profit({ ...v, earlySeats: 0 }, n);
  return { ok: true, warnings, v, n, base, be, fills, prices, goalPrice, margin, guaranteeCost, perHead, earlyCost: noEarly.profit - base.profit, fixed: fixedCost(v) };
}

export function toCsv(r) {
  const lines = ["guests,gross_ticket_revenue,card_fees,lodging_and_meals,fixed_costs,profit"];
  for (const f of r.fills) lines.push([f.guests, f.gross, f.fees, f.variable, f.fixed, f.profit].map((x) => Math.round(x)).join(","));
  return lines.join("\n") + "\n";
}
