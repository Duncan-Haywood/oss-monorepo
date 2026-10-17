// Waterfront rental season planner: pure functions, no dependencies, nothing leaves the browser.
// Two fleets (paddle craft and motorboats) share one season. Each open day brings a number of rentals people would book
// if there were boats for all of them (the demand you type in, for a weekday and a weekend day). What is actually sold is
// the smaller of that demand and what the fleet can turn over. Staff and the dock are paid whether or not the weather
// cooperates, so the useful questions are how many days of weather you can lose, where the fleet is the limit, and what
// one more boat is worth.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  seasonDays: 110, openHours: 9, weatherLossPct: 18, weekendSharePct: 30,
  // paddle craft: kayaks, paddleboards
  paddleUnits: 24, paddleRentalHours: 2, paddleTurnoverMin: 15, paddlePrice: 38,
  paddleWeekdayDemand: 22, paddleWeekendDemand: 52, paddleCostPerRental: 1.5, paddleUnitCost: 700,
  // motorboats: pontoon, jon boats
  boatUnits: 3, boatRentalHours: 4, boatTurnoverMin: 30, boatPrice: 260,
  boatWeekdayDemand: 2, boatWeekendDemand: 9, boatFuelPerHour: 9, boatCostPerRental: 8, boatUnitCost: 24000,
  priceSensitivity: 0.8,
  staffHourly: 19, staffWeekday: 2, staffWeekend: 4, feePct: 3.2,
  dockLeaseSeason: 9000, insuranceSeason: 4200, marketingSeason: 1500, permitsOtherSeason: 2800,
  fleetLifeSeasons: 6, resalePct: 30,
};

const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);
const pct = (p) => Math.min(100, safe(p)) / 100;

// Whole rentals one unit can turn over in a day: each rental ties the unit up for its length plus the turnaround.
export function rentalsPerUnitDay(hours, turnoverMin, openHours) {
  const cycle = safe(hours) * 60 + safe(turnoverMin);
  const day = safe(openHours) * 60;
  if (safe(hours) <= 0 || cycle <= 0 || day < safe(hours) * 60) return 0;
  return Math.max(0, Math.floor((day - safe(hours) * 60) / cycle) + 1);
}

// Demand is linear around the price it was typed at: each 1% above it removes `priceSensitivity` % of the bookings,
// so a best price exists. The sensitivity is the user's assumption, not a measurement.
export function demandAt(ref, refPrice, price, sens) {
  const r = Math.max(1e-6, safe(refPrice));
  const rel = Math.max(0, safe(price)) / r - 1;
  return Math.max(0, safe(ref) * (1 - safe(sens) * rel));
}

const openDays = (o, lossPct = o.weatherLossPct) => safe(o.seasonDays) * (1 - pct(lossPct));
const weekendDays = (o, lossPct) => openDays(o, lossPct) * pct(o.weekendSharePct);
const weekdayDays = (o, lossPct) => openDays(o, lossPct) * (1 - pct(o.weekendSharePct));

function fleet(o, kind, priceMult, lossPct, unitsOverride) {
  const p = kind === "paddle";
  const units = unitsOverride ?? safe(p ? o.paddleUnits : o.boatUnits);
  const hours = safe(p ? o.paddleRentalHours : o.boatRentalHours);
  const refPrice = safe(p ? o.paddlePrice : o.boatPrice);
  const price = refPrice * priceMult;
  const cap = units * rentalsPerUnitDay(hours, p ? o.paddleTurnoverMin : o.boatTurnoverMin, o.openHours);
  const dWd = demandAt(p ? o.paddleWeekdayDemand : o.boatWeekdayDemand, refPrice, price, o.priceSensitivity);
  const dWe = demandAt(p ? o.paddleWeekendDemand : o.boatWeekendDemand, refPrice, price, o.priceSensitivity);
  const soldWd = Math.min(dWd, cap), soldWe = Math.min(dWe, cap);
  const nWd = weekdayDays(o, lossPct), nWe = weekendDays(o, lossPct);
  const rentals = soldWd * nWd + soldWe * nWe;
  const demanded = dWd * nWd + dWe * nWe;
  const revenue = rentals * price;
  const perRentalCost = p ? safe(o.paddleCostPerRental) : safe(o.boatCostPerRental) + safe(o.boatFuelPerHour) * hours;
  const variable = revenue * (safe(o.feePct) / 100) + rentals * perRentalCost;
  const unitDays = units * (nWd + nWe);
  return {
    units, hours, price, capPerDay: cap, rentals, demanded, turnedAway: Math.max(0, demanded - rentals),
    lostRevenue: Math.max(0, demanded - rentals) * price, revenue, variable, contribution: revenue - variable,
    utilization: cap > 0 ? (soldWd * nWd + soldWe * nWe) / (cap * (nWd + nWe) || 1) : 0,
    weekendFull: cap > 0 && dWe >= cap, weekdayFull: cap > 0 && dWd >= cap,
    rentalsPerUnitSeason: units > 0 ? rentals / units : 0, unitDays,
    unitCost: p ? safe(o.paddleUnitCost) : safe(o.boatUnitCost),
  };
}

function staffCost(o, lossPct) {
  const hrs = safe(o.openHours) * safe(o.staffHourly);
  return hrs * (weekdayDays(o, lossPct) * safe(o.staffWeekday) + weekendDays(o, lossPct) * safe(o.staffWeekend));
}
const fixedCost = (o) => safe(o.dockLeaseSeason) + safe(o.insuranceSeason) + safe(o.marketingSeason) + safe(o.permitsOtherSeason);

export function wearPerSeason(o, units = null) {
  const life = Math.max(1, safe(o.fleetLifeSeasons));
  const keep = 1 - pct(o.resalePct);
  const paddleCap = (units ? units.paddle : safe(o.paddleUnits)) * safe(o.paddleUnitCost);
  const boatCap = (units ? units.boat : safe(o.boatUnits)) * safe(o.boatUnitCost);
  return ((paddleCap + boatCap) * keep) / life;
}

// The whole season at a price multiplier (1 = the prices typed in) and a share of days lost to weather.
export function season(o, priceMult = 1, lossPct = o.weatherLossPct, units = null) {
  const paddle = fleet(o, "paddle", priceMult, lossPct, units?.paddle);
  const boat = fleet(o, "boat", priceMult, lossPct, units?.boat);
  const revenue = paddle.revenue + boat.revenue;
  const contribution = paddle.contribution + boat.contribution;
  const staff = staffCost(o, lossPct);
  const fixed = fixedCost(o);
  const cashProfit = contribution - staff - fixed;
  const wear = wearPerSeason(o, units);
  return {
    paddle, boat, revenue, contribution, staff, fixed, cashProfit, wear, profit: cashProfit - wear,
    openDays: openDays(o, lossPct), turnedAway: paddle.turnedAway + boat.turnedAway, lostRevenue: paddle.lostRevenue + boat.lostRevenue,
  };
}

// Share of the season's days that can be lost to weather before the season stops covering its costs (staff only paid on open days).
export function breakEvenWeatherLoss(o, afterWear = false) {
  const val = (loss) => (afterWear ? season(o, 1, loss).profit : season(o, 1, loss).cashProfit);
  if (val(0) <= 0) return { possible: false, lossPct: null };
  if (val(100) > 0) return { possible: true, lossPct: 100 };
  let lo = 0, hi = 100;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (val(mid) > 0) lo = mid; else hi = mid; }
  return { possible: true, lossPct: lo };
}

export function weatherSensitivity(o, losses = [0, 10, 20, 30, 40, 50]) {
  return losses.map((l) => { const s = season(o, 1, l); return { lossPct: l, openDays: s.openDays, revenue: s.revenue, cashProfit: s.cashProfit, profit: s.profit }; });
}

// Search a price multiplier that moves both fleets' prices together under the demand assumption.
export function optimizePrice(o, lo = 0.7, hi = 1.6, step = 0.05) {
  let best = null;
  const rows = [];
  for (let m = lo; m <= hi + 1e-9; m += step) {
    const s = season(o, m);
    const row = { mult: Math.round(m * 100) / 100, paddlePrice: s.paddle.price, boatPrice: s.boat.price, profit: s.profit, revenue: s.revenue, turnedAway: s.turnedAway };
    rows.push(row);
    if (!best || row.profit > best.profit) best = row;
  }
  const now = season(o);
  return { best, now: { profit: now.profit, revenue: now.revenue }, gain: best.profit - now.profit, rows };
}

export function priceSteps(o, mults = [0.85, 0.92, 1, 1.08, 1.15, 1.25]) {
  return mults.map((m) => { const s = season(o, m); return { mult: m, paddlePrice: s.paddle.price, boatPrice: s.boat.price, rentals: s.paddle.rentals + s.boat.rentals, revenue: s.revenue, profit: s.profit }; });
}

// What one more unit of a fleet earns. Extra rentals come only from demand the current fleet turns away, so a fleet that
// is never full gains nothing; payback is the unit's purchase price less resale value over that season gain.
export function extraUnit(o, kind) {
  const base = season(o);
  const units = { paddle: safe(o.paddleUnits), boat: safe(o.boatUnits) };
  units[kind] += 1;
  const next = season(o, 1, o.weatherLossPct, units);
  const cost = kind === "paddle" ? safe(o.paddleUnitCost) : safe(o.boatUnitCost);
  const gainCash = next.cashProfit - base.cashProfit;
  const wearPerUnit = (cost * (1 - pct(o.resalePct))) / Math.max(1, safe(o.fleetLifeSeasons));
  return { kind, gainCash, gainAfterWear: gainCash - wearPerUnit, cost, paybackSeasons: gainCash > 0 ? cost / gainCash : null, worthIt: gainCash - wearPerUnit > 0 };
}

// Fleet size table: profit after wear for each fleet size around the typed one.
export function fleetSizes(o, kind, deltas = [-4, -2, 0, 2, 4, 8]) {
  const cur = kind === "paddle" ? safe(o.paddleUnits) : safe(o.boatUnits);
  return deltas.map((d) => {
    const n = Math.max(0, cur + d);
    const units = { paddle: safe(o.paddleUnits), boat: safe(o.boatUnits) };
    units[kind] = n;
    const s = season(o, 1, o.weatherLossPct, units);
    return { units: n, rentals: s.paddle.rentals + s.boat.rentals, turnedAway: s.turnedAway, profit: s.profit };
  });
}
