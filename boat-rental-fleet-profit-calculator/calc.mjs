// Boat, jet-ski and paddleboard rental profit. Pure arithmetic over what an owner types in: three rental offers (hourly, half-day, full-day) with a weekly booking count, price and hours on the water,
// a weather-and-cancellation rate, fuel and wear per engine hour, dock turnaround minutes, the dock, insurance and the boat they have to carry through a short season, and the ways to put the boat to work:
// rent it yourself, list it on a rental marketplace for a commission and more bookings, or run it as a captained charter at a higher price with a paid captain. Tips and fuel surcharges are ignored.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const SERVICES = [
  { id: "hourly", label: "Hourly rental" },
  { id: "half", label: "Half-day rental" },
  { id: "full", label: "Full-day rental" },
];

const NUMERIC = [
  "hourlyQty", "hourlyPrice", "hourlyHrs", "halfQty", "halfPrice", "halfHrs", "fullQty", "fullPrice", "fullHrs",
  "cancelPct", "availHours", "ownerRate", "turnMin", "fuelPerHour", "wearPerHour", "seasonWeeks",
  "dockMonth", "insuranceMonth", "boatCost", "boatYears", "otherFixedMonth",
  "platformPct", "liftPct", "charterPremiumPct", "captainRate", "targetMarginPct",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    hourlyQty: f("hourlyQty"), hourlyPrice: f("hourlyPrice", 95), hourlyHrs: f("hourlyHrs", 1),
    halfQty: f("halfQty"), halfPrice: f("halfPrice", 295), halfHrs: f("halfHrs", 4),
    fullQty: f("fullQty"), fullPrice: f("fullPrice", 495), fullHrs: f("fullHrs", 8),
    cancelPct: f("cancelPct", 15), availHours: f("availHours", 60), ownerRate: f("ownerRate", 25), turnMin: f("turnMin", 30),
    fuelPerHour: f("fuelPerHour", 18), wearPerHour: f("wearPerHour", 7), seasonWeeks: f("seasonWeeks", 20),
    dockMonth: f("dockMonth", 350), insuranceMonth: f("insuranceMonth", 180), boatCost: f("boatCost"), boatYears: f("boatYears", 7), otherFixedMonth: f("otherFixedMonth", 60),
    platformPct: f("platformPct", 20), liftPct: f("liftPct", 30), charterPremiumPct: f("charterPremiumPct", 40), captainRate: f("captainRate", 35), targetMarginPct: f("targetMarginPct", 35),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["hourlyQty", "halfQty", "fullQty"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number of bookings per week.` };
  if (v.hourlyQty + v.halfQty + v.fullQty < 1) return { error: "Enter how many rentals you book on this boat in a typical in-season week." };
  if (v.hourlyQty + v.halfQty + v.fullQty > 500) return { error: "That is far more than one boat can book in a week: check the quantities." };
  for (const s of SERVICES) if (v[s.id + "Qty"] > 0 && v[s.id + "Hrs"] <= 0) return { error: `${s.label} needs more than 0 hours on the water.` };
  if (v.cancelPct > 90) return { error: "Weather and cancellation rate is a percent of booked rentals: keep it at or below 90." };
  if (v.platformPct >= 90) return { error: "The marketplace commission is a percent of the rental price: keep it below 90." };
  if (v.liftPct > 500) return { error: "The extra bookings a marketplace brings are a percent of your current bookings: keep it at or below 500." };
  if (v.boatYears < 0.5) return { error: "The boat must be spread over at least half a year." };
  if (v.seasonWeeks < 1 || v.seasonWeeks > 52) return { error: "Season weeks must be between 1 and 52." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the price." };
  if (v.availHours <= 0 || v.availHours > 168) return { error: "Boat hours available per week must be above 0 and at most 168." };
  return { v };
}

const matPerHour = (v) => v.fuelPerHour + v.wearPerHour;
const hrsOf = (v, s) => v[s.id + "Hrs"];
const turnCost = (v) => (v.turnMin / 60) * v.ownerRate; // the owner's own time to hand the boat over, clean and refuel it, per rental that happens

// The boat's fixed cost per in-season week. The dock, insurance and the boat itself are paid all year; the weeks that earn are few.
export function fixedCosts(v) {
  const annualFixed = (v.dockMonth + v.insuranceMonth + v.otherFixedMonth) * 12;
  const annualBoat = v.boatCost / v.boatYears;
  const annual = annualFixed + annualBoat;
  const week = annual / v.seasonWeeks;
  return { annual: round2(annual), annualBoat: round2(annualBoat), annualFixed: round2(annualFixed), total: round2(week), totalRaw: week };
}

function totals(v, scale = 1) {
  const keep = 1 - v.cancelPct / 100;
  let booked = 0, completed = 0, serviceRevenue = 0, fuelWear = 0, bookedHours = 0, completedHours = 0, cancelLoss = 0, cancelRevenue = 0;
  for (const s of SERVICES) {
    const q = v[s.id + "Qty"] * scale, price = v[s.id + "Price"], h = hrsOf(v, s);
    const mat = h * matPerHour(v);
    booked += q;
    completed += q * keep;
    serviceRevenue += q * keep * price;
    fuelWear += q * keep * mat;
    bookedHours += q * h;
    completedHours += q * keep * h;
    cancelRevenue += q * (1 - keep) * price;
    cancelLoss += q * (1 - keep) * (price - mat - turnCost(v));
  }
  return { booked, completed, serviceRevenue, fuelWear, bookedHours, completedHours, cancelLoss, cancelRevenue, turn: completed * turnCost(v) };
}

export function serviceLine(v, s) {
  const keep = 1 - v.cancelPct / 100;
  const price = v[s.id + "Price"], h = hrsOf(v, s), qty = v[s.id + "Qty"];
  const mat = h * matPerHour(v);
  const t = totals(v);
  const fixedShare = t.completed > 0 ? fixedCosts(v).totalRaw / t.completed : 0; // the week's fixed cost spread over rentals that happen
  const labor = turnCost(v);
  const cost = labor + mat + fixedShare;
  const profit = price - cost;
  return {
    id: s.id, label: s.label, qty, price, hrs: h, mat: round2(mat),
    labor: round2(labor), fixedShare: round2(fixedShare), cost: round2(cost), profit: round2(profit), marginPct: price > 0 ? round1((profit / price) * 100) : 0,
    perBoatHour: h > 0 ? round2((keep * (price - mat - labor)) / h) : 0, // expected take per booked boat hour, before fixed cost
    targetPrice: round2(cost / (1 - v.targetMarginPct / 100)),
  };
}

// The same boat worked three ways, per week. "Net" is what is left after the boat's fixed cost and before the owner draws anything for their own time on the dock.
export function boatModes(v, scale = 1) {
  const t = totals(v, scale);
  const fixed = fixedCosts(v).totalRaw;
  const directBefore = t.serviceRevenue - t.fuelWear;
  const directNet = directBefore - fixed;
  // Marketplace: the platform keeps a share of every rental, and brings extra bookings.
  const m = totals(v, scale * (1 + v.liftPct / 100));
  const marketNet = m.serviceRevenue * (1 - v.platformPct / 100) - m.fuelWear - fixed;
  // Charter: fewer, dearer outings with a paid captain for every completed boat hour.
  const captain = t.completedHours * v.captainRate;
  const charterRevenue = t.serviceRevenue * (1 + v.charterPremiumPct / 100);
  const charterNet = charterRevenue - t.fuelWear - captain - fixed;
  return {
    t, m, fixed, captain,
    direct: { net: directNet, afterPay: directNet - t.turn },
    market: { net: marketNet, afterPay: marketNet - m.turn },
    charter: { net: charterNet, afterPay: charterNet, revenue: charterRevenue }, // the captain handles the turnaround on a charter
  };
}

// Completed rentals per in-season week at which the boat covers its fixed cost, at the current mix.
export function breakEven(v) {
  const t = totals(v);
  if (t.completed <= 0) return null;
  const keep = 1 - v.cancelPct / 100;
  const avgPrice = t.serviceRevenue / t.completed, avgMat = t.fuelWear / t.completed;
  const contribution = avgPrice - avgMat - turnCost(v);
  if (contribution <= 0) return null;
  const completed = fixedCosts(v).totalRaw / contribution;
  return { completed: round1(completed), booked: round1(completed / keep), contribution: round2(contribution) };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const lines = SERVICES.map((s) => serviceLine(v, s));
  const m = boatModes(v);
  const be = breakEven(v);
  const fixed = fixedCosts(v);
  const utilizationPct = round1((m.t.bookedHours / v.availHours) * 100);
  // Lift in bookings at which listing on the marketplace pays the owner the same as renting direct, and the charter premium at which a captain pays for himself.
  const directCont = m.t.serviceRevenue - m.t.fuelWear - m.t.turn;
  const marketCont = totals(v, 1 + v.liftPct / 100);
  const marketContribPerScale = (marketCont.serviceRevenue * (1 - v.platformPct / 100) - marketCont.fuelWear - marketCont.turn) / (1 + v.liftPct / 100);
  const matchScale = marketContribPerScale > 0 ? directCont / marketContribPerScale : null;
  const season = {
    lines, fixed, booked: round1(m.t.booked), completed: round1(m.t.completed), revenue: round2(m.t.serviceRevenue), bookedHours: round1(m.t.bookedHours), utilizationPct,
    directNet: round2(m.direct.net), directAfterPay: round2(m.direct.afterPay), profitPerRental: m.t.completed > 0 ? round2(m.direct.afterPay / m.t.completed) : 0,
    profitPerBoatHour: round2(m.direct.afterPay / v.availHours),
    seasonDirect: round2(m.direct.afterPay * v.seasonWeeks),
    marketAfterPay: round2(m.market.afterPay), charterAfterPay: round2(m.charter.afterPay), charterRevenue: round2(m.charter.revenue),
    cancelCost: round2(m.t.cancelLoss), cancelRevenue: round2(m.t.cancelRevenue), cancelCostSeason: round2(m.t.cancelLoss * v.seasonWeeks),
    matchLiftPct: matchScale === null ? null : round1((matchScale - 1) * 100),
    charterCaptain: round2(m.captain),
    charterBreakEvenPremiumPct: m.t.serviceRevenue > 0 ? round1((m.captain / m.t.serviceRevenue) * 100) : null,
    breakEven: be,
  };
  const advice = [];
  advice.push(`Renting direct, per in-season week: ${season.booked} booked, ${season.completed} happen, ${usd(season.revenue)} of rental revenue, ${usd(season.directNet)} after fuel, wear and the boat's fixed cost, and ${usd(season.directAfterPay)} after paying your own ${usd(v.ownerRate)}-an-hour dock time. Over ${v.seasonWeeks} weeks that is about ${usd(season.seasonDirect)}.`);
  advice.push(`The boat carries ${usd(fixed.annual)} a year of dock, insurance, the boat itself and other fixed cost, which falls on only ${v.seasonWeeks} earning weeks: ${usd(fixed.total)} a week. That is ${usd(season.profitPerRental)} per rental that happens and ${usd(season.profitPerBoatHour)} per available boat hour after your dock time.`);
  const best = [...lines].sort((a, b) => b.perBoatHour - a.perBoatHour)[0];
  const worst = [...lines].sort((a, b) => a.perBoatHour - b.perBoatHour)[0];
  if (best.id !== worst.id) advice.push(`Per booked boat hour, before fixed cost: ${lines.map((l) => `${l.label.toLowerCase()} ${usd(l.perBoatHour)}`).join(", ")}. The ${best.label.toLowerCase()} fills the boat best and the ${worst.label.toLowerCase()} worst.`);
  for (const l of lines.filter((x) => x.qty > 0)) {
    if (l.price < l.targetPrice) advice.push(`${l.label} at ${usd(l.price)} earns ${l.marginPct}% once fuel, wear, dock time and its share of the boat's fixed cost are counted. For a ${v.targetMarginPct}% margin it would need ${usd(l.targetPrice)}.`);
  }
  if (v.cancelPct > 0) advice.push(`Weather and cancellations: ${v.cancelPct}% of ${season.booked} booked rentals empties about ${round1(season.booked - m.t.completed)} slots a week and costs ${usd(season.cancelCost)} a week in lost margin (about ${usd(season.cancelCostSeason)} a season). A rebooking credit instead of a refund, or a deposit that is kept on a no-show, is worth up to that much.`);
  if (be) advice.push(`Break-even for the boat: about ${be.completed} rentals a week that happen (${be.booked} booked at your cancellation rate), against ${season.completed} planned.${season.completed >= be.completed ? "" : " You plan fewer than that."}`);
  else advice.push("Each rental earns less than fuel, wear and your dock time, so more bookings do not cover the fixed cost. Raise a price first.");
  advice.push(`Same boat, three ways, per in-season week after the boat's fixed cost: renting direct ${usd(season.directAfterPay)} after your dock time, listing on a marketplace at ${v.platformPct}% commission with ${v.liftPct}% more bookings ${usd(season.marketAfterPay)}, running it as a captained charter at ${v.charterPremiumPct}% higher prices with a ${usd(v.captainRate)}-an-hour captain ${usd(season.charterAfterPay)}.`);
  if (season.matchLiftPct !== null) advice.push(`A marketplace listing pays the same as renting direct if it brings ${season.matchLiftPct >= 0 ? `${season.matchLiftPct}% more` : `${Math.abs(season.matchLiftPct)}% fewer`} bookings than you get now at a ${v.platformPct}% commission; you assumed ${v.liftPct}%.${season.matchLiftPct <= v.liftPct ? " At that lift the listing is the better deal." : " At that lift renting direct is the better deal."}`);
  if (season.charterBreakEvenPremiumPct !== null) advice.push(`A captain at ${usd(v.captainRate)} an hour costs ${usd(season.charterCaptain)} a week on these trips, so a charter beats self-drive rental once its prices run about ${season.charterBreakEvenPremiumPct}% above yours; you assumed ${v.charterPremiumPct}%.`);
  if (utilizationPct > 100) advice.push(`The bookings need ${season.bookedHours} boat hours against ${v.availHours} available (${utilizationPct}%). One boat cannot take that many.`);
  else advice.push(`The bookings use ${season.bookedHours} of ${v.availHours} boat hours (${utilizationPct}%). The fixed cost is paid whether the hours fill or not, so empty weekday hours are the cheapest place to find more profit.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((sc) => {
    const r = boatModes(v, sc);
    return {
      pct: Math.round(sc * 100), booked: round1(r.t.booked), hours: round1(r.t.bookedHours), utilizationPct: round1((r.t.bookedHours / v.availHours) * 100),
      direct: round2(r.direct.afterPay), market: round2(r.market.afterPay), charter: round2(r.charter.afterPay),
    };
  });
  return { error: null, input: v, season, table, advice };
}

export function sampleInput() {
  return {
    hourlyQty: "6", hourlyPrice: "95", hourlyHrs: "1", halfQty: "5", halfPrice: "295", halfHrs: "4", fullQty: "2", fullPrice: "495", fullHrs: "8",
    cancelPct: "15", availHours: "60", ownerRate: "25", turnMin: "30", fuelPerHour: "18", wearPerHour: "7", seasonWeeks: "20",
    dockMonth: "350", insuranceMonth: "180", boatCost: "21000", boatYears: "7", otherFixedMonth: "60",
    platformPct: "20", liftPct: "30", charterPremiumPct: "40", captainRate: "35", targetMarginPct: "35",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = [...NUMERIC];

export function encodeShare(input) {
  const p = new URLSearchParams();
  for (const k of SHARE_KEYS) if (input[k] !== undefined && input[k] !== "") p.set(k, String(input[k]).slice(0, 200));
  return p.toString();
}

export function decodeShare(text) {
  const p = new URLSearchParams(String(text ?? "").replace(/^#/, ""));
  const out = {};
  for (const k of SHARE_KEYS) if (p.has(k)) out[k] = p.get(k).slice(0, 200);
  return out;
}

export function toCsv(result) {
  const head = "volume_pct,booked_per_week,boat_hours,utilization_pct,rent_direct_after_pay,marketplace_listing,captained_charter";
  return [head, ...result.table.map((r) => [r.pct, r.booked, r.hours, r.utilizationPct, r.direct, r.market, r.charter].join(","))].join("\n");
}
