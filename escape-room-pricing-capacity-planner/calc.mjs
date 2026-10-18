// Escape room pricing and capacity planner: pure functions, no dependencies, nothing leaves the browser.
// Slots come from opening hours, game length and reset time. Bookings come from the occupancy you observe at your
// current price, moved by a price sensitivity you choose (a stated assumption, not a measurement). Staff are paid for
// every open hour, so cost is mostly fixed and the useful questions are the break-even occupancy and the price that
// earns the most contribution without emptying the slots.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  rooms: 3, gameMinutes: 60, resetMinutes: 20, openHoursPerDay: 9, openDaysPerWeek: 6, peakSlotSharePct: 35,
  pricePerPlayer: 32, peakPremiumPct: 20, groupSize: 5, minPlayersCharged: 4,
  peakOccupancyPct: 60, offPeakOccupancyPct: 18, elasticity: 0.9,
  hostHourly: 18, roomsPerHost: 2, rentMonthly: 6500, utilitiesMonthly: 600, insuranceMonthly: 350,
  marketingMonthly: 900, softwareOtherMonthly: 4000,
  cardFeePct: 3, bookingPlatformPct: 2, perGameSupplies: 3,
  eventsPerMonth: 2, eventFee: 650, buildCostPerRoom: 28000,
};

const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);
const clampPct = (p) => Math.min(100, Math.max(0, safe(p)));
const WEEKS_PER_MONTH = 52 / 12;

// Whole games that fit in one room-day. Each game occupies game + reset minutes except the last, which needs no reset.
export function slotsPerRoomDay(o) {
  const day = safe(o.openHoursPerDay) * 60;
  const game = Math.max(1, safe(o.gameMinutes));
  const reset = safe(o.resetMinutes);
  if (day < game) return 0;
  return Math.floor((day - game) / (game + reset)) + 1;
}

export function hostsOnShift(o) {
  return safe(o.rooms) > 0 ? Math.ceil(safe(o.rooms) / Math.max(1, safe(o.roomsPerHost))) : 0;
}

export function chargedPlayers(o) {
  return Math.max(safe(o.groupSize), safe(o.minPlayersCharged));
}

// Occupancy (0..1) at a price. Demand is linear around the price where the occupancy was observed: each 1% above that price
// removes `elasticity` % of the bookings seen there. A linear curve has a finite best price, which a constant-elasticity
// curve does not (below 1 it says "raise the price forever"), so the optimizer cannot run off the end of the range.
export function occupancyAt(occRefPct, refPrice, price, elasticity) {
  const ref = clampPct(occRefPct) / 100;
  if (ref === 0) return 0;
  const r = Math.max(1e-6, safe(refPrice));
  const rel = Math.max(0, safe(price)) / r - 1;
  return Math.min(0.98, Math.max(0, ref * (1 - safe(elasticity) * rel)));
}

// Monthly picture at an off-peak per-player price (default: the typed price). The peak price is the off-peak price plus the premium.
// Occupancies typed in are the ones seen at the typed prices, so moving a price moves bookings along the elasticity curve.
export function model(o, price = o.pricePerPlayer, scale = 1) {
  const spd = slotsPerRoomDay(o);
  const slotsWeek = safe(o.rooms) * spd * safe(o.openDaysPerWeek);
  const peakShare = clampPct(o.peakSlotSharePct) / 100;
  const prem = 1 + safe(o.peakPremiumPct) / 100;
  const refOff = safe(o.pricePerPlayer);
  const refPeak = refOff * prem;
  const offPrice = safe(price);
  const peakPrice = offPrice * prem;
  const peakOcc = Math.min(0.98, occupancyAt(o.peakOccupancyPct, refPeak, peakPrice, o.elasticity) * scale);
  const offOcc = Math.min(0.98, occupancyAt(o.offPeakOccupancyPct, refOff, offPrice, o.elasticity) * scale);
  const peakBookings = slotsWeek * peakShare * peakOcc * WEEKS_PER_MONTH;
  const offBookings = slotsWeek * (1 - peakShare) * offOcc * WEEKS_PER_MONTH;
  const players = chargedPlayers(o);
  const gameRevenue = peakBookings * players * peakPrice + offBookings * players * offPrice;
  const eventRevenue = safe(o.eventsPerMonth) * safe(o.eventFee);
  const revenue = gameRevenue + eventRevenue;
  const bookings = peakBookings + offBookings;
  const feeRate = (clampPct(o.cardFeePct) + clampPct(o.bookingPlatformPct)) / 100;
  const variable = revenue * feeRate + bookings * safe(o.perGameSupplies);
  const contribution = revenue - variable;
  const hostCost = hostsOnShift(o) * safe(o.hostHourly) * safe(o.openHoursPerDay) * safe(o.openDaysPerWeek) * WEEKS_PER_MONTH;
  const overhead = safe(o.rentMonthly) + safe(o.utilitiesMonthly) + safe(o.insuranceMonthly) + safe(o.marketingMonthly) + safe(o.softwareOtherMonthly);
  const fixed = hostCost + overhead;
  return {
    price: offPrice, peakPrice, slotsPerRoomDay: spd, slotsWeek, slotsMonth: slotsWeek * WEEKS_PER_MONTH,
    peakOcc, offOcc, bookings,
    blendedOcc: slotsWeek > 0 ? bookings / (slotsWeek * WEEKS_PER_MONTH) : 0,
    gameRevenue, eventRevenue, revenue, variable, contribution, hostCost, overhead, fixed,
    profit: contribution - fixed,
    revenuePerBooking: bookings > 0 ? gameRevenue / bookings : 0,
  };
}

// Occupancy multiple at which profit is zero (profit is linear in occupancy until the 98% cap). Returns the blended occupancy that results.
export function breakEven(o) {
  const base = model(o);
  const feeRate = (clampPct(o.cardFeePct) + clampPct(o.bookingPlatformPct)) / 100;
  const eventNet = base.eventRevenue * (1 - feeRate);
  const perUnit = base.contribution - eventNet;
  if (!(perUnit > 0) || base.slotsWeek === 0) return { possible: false, scale: null, blendedOcc: null, bookingsPerWeek: null, reachable: false };
  const scale = (base.fixed - eventNet) / perUnit;
  const at = model(o, o.pricePerPlayer, Math.max(0, scale));
  return {
    possible: true, scale, blendedOcc: Math.max(0, scale) * base.blendedOcc,
    bookingsPerWeek: at.bookings / WEEKS_PER_MONTH, reachable: at.peakOcc < 0.98 && at.offOcc < 0.98 && scale * base.blendedOcc <= 0.98,
    nowBookingsPerWeek: base.bookings / WEEKS_PER_MONTH,
  };
}

// Search a price range for the off-peak price with the highest monthly profit under the elasticity curve.
export function optimizePrice(o, lo = Math.max(1, Math.floor(safe(o.pricePerPlayer) * 0.5)), hi = Math.max(lo + 1, Math.ceil(safe(o.pricePerPlayer) * 2)), step = 1) {
  let best = null;
  const rows = [];
  for (let p = lo; p <= hi + 1e-9; p += step) {
    const m = model(o, p);
    rows.push({ price: p, profit: m.profit, blendedOcc: m.blendedOcc, revenue: m.revenue });
    if (!best || m.profit > best.profit) best = { price: p, profit: m.profit, blendedOcc: m.blendedOcc, revenue: m.revenue };
  }
  const now = model(o);
  return { best, now: { price: safe(o.pricePerPlayer), profit: now.profit, blendedOcc: now.blendedOcc }, gain: best.profit - now.profit, rows };
}

export function priceSensitivity(o, deltas = [-6, -3, 0, 3, 6, 9]) {
  return deltas.map((d) => {
    const p = Math.max(1, safe(o.pricePerPlayer) + d);
    const m = model(o, p);
    return { price: p, peakPrice: m.peakPrice, blendedOcc: m.blendedOcc, revenue: m.revenue, profit: m.profit };
  });
}

// Profit by price x occupancy: occupancy scale applied to both segments at the typed price (what a bad or good month looks like).
export function occupancyGrid(o, scales = [0.6, 0.8, 1, 1.2], deltas = [-4, 0, 4]) {
  return deltas.map((d) => ({
    price: Math.max(1, safe(o.pricePerPlayer) + d),
    cells: scales.map((s) => ({ scale: s, profit: model(o, Math.max(1, safe(o.pricePerPlayer) + d), s).profit })),
  }));
}

// Shorter reset or game length buys slots. Occupancy percentages are held, so this shows the capacity ceiling, not a forecast.
export function resetSensitivity(o, resets = [30, 20, 15, 10]) {
  return resets.map((r) => {
    const oo = { ...o, resetMinutes: r };
    const m = model(oo);
    return { reset: r, slotsPerRoomDay: m.slotsPerRoomDay, bookings: m.bookings, profit: m.profit };
  });
}

export function groupMinimumSensitivity(o, mins = [2, 3, 4, 5, 6]) {
  return mins.map((k) => {
    const m = model({ ...o, minPlayersCharged: k });
    return { minPlayers: k, revenuePerBooking: m.revenuePerBooking, profit: m.profit };
  });
}

// Months to recover the build cost out of monthly profit; null if the room never pays back.
export function payback(o) {
  const m = model(o);
  const capex = safe(o.rooms) * safe(o.buildCostPerRoom);
  return { capex, months: m.profit > 0 ? capex / m.profit : null, monthlyProfit: m.profit };
}

export function perPlayerEconomics(o) {
  const m = model(o);
  const players = m.bookings * chargedPlayers(o);
  return { players, revenuePerPlayer: players > 0 ? m.gameRevenue / players : null, costPerPlayer: players > 0 ? (m.variable + m.fixed) / players : null };
}
