import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, slotsPerRoomDay, hostsOnShift, chargedPlayers, occupancyAt, model, breakEven, optimizePrice, priceSensitivity, occupancyGrid, resetSensitivity, groupMinimumSensitivity, payback, perPlayerEconomics } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("num parses money and rejects junk", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num(undefined)));
});

test("slots per room-day: the last game needs no reset", () => {
  // 9h = 540 min; 60 + 20 reset: games start at 0,80,...,480 -> 7 games (last ends 540).
  assert.equal(slotsPerRoomDay(DEFAULTS), 7);
  assert.equal(slotsPerRoomDay({ ...DEFAULTS, openHoursPerDay: 1, gameMinutes: 60, resetMinutes: 20 }), 1);
  assert.equal(slotsPerRoomDay({ ...DEFAULTS, openHoursPerDay: 0.5 }), 0);
});

test("hosts on shift: one per roomsPerHost, rounded up", () => {
  assert.equal(hostsOnShift(DEFAULTS), 2);
  assert.equal(hostsOnShift({ ...DEFAULTS, rooms: 4 }), 2);
  assert.equal(hostsOnShift({ ...DEFAULTS, rooms: 0 }), 0);
});

test("a minimum charge lifts small groups to the minimum", () => {
  assert.equal(chargedPlayers({ groupSize: 2, minPlayersCharged: 4 }), 4);
  assert.equal(chargedPlayers({ groupSize: 6, minPlayersCharged: 4 }), 6);
});

test("occupancy is the typed value at the reference price and falls as price rises", () => {
  close(occupancyAt(40, 30, 30, 0.9), 0.4);
  assert.ok(occupancyAt(40, 30, 33, 0.9) < 0.4);
  assert.ok(occupancyAt(40, 30, 27, 0.9) > 0.4);
  assert.equal(occupancyAt(40, 30, 200, 0.9), 0);
  assert.equal(occupancyAt(0, 30, 10, 0.9), 0);
  assert.ok(occupancyAt(90, 30, 5, 2) <= 0.98);
});

test("model at the typed price reproduces the typed occupancies and a hand-computed month", () => {
  const o = { ...DEFAULTS, eventsPerMonth: 0 };
  const m = model(o);
  close(m.peakOcc, 0.6);
  close(m.offOcc, 0.18);
  const w = 52 / 12;
  const slotsWeek = 3 * 7 * 6;
  const peakB = slotsWeek * 0.35 * 0.6 * w;
  const offB = slotsWeek * 0.65 * 0.18 * w;
  close(m.bookings, peakB + offB);
  close(m.gameRevenue, peakB * 5 * 38.4 + offB * 5 * 32);
  close(m.variable, m.revenue * 0.05 + m.bookings * 3);
  close(m.hostCost, 2 * 18 * 9 * 6 * w);
  close(m.profit, m.revenue - m.variable - m.fixed);
});

test("private events add revenue but no slot bookings", () => {
  const a = model({ ...DEFAULTS, eventsPerMonth: 0 });
  const b = model({ ...DEFAULTS, eventsPerMonth: 4, eventFee: 500 });
  close(b.revenue - a.revenue, 2000);
  close(b.bookings, a.bookings);
});

test("break-even: profit is zero at the occupancy scale it reports", () => {
  const be = breakEven(DEFAULTS);
  assert.ok(be.possible);
  close(model(DEFAULTS, DEFAULTS.pricePerPlayer, be.scale).profit, 0, 1e-4);
  assert.ok(be.blendedOcc < model(DEFAULTS).blendedOcc);
});

test("break-even is impossible with no rooms or no price", () => {
  assert.equal(breakEven({ ...DEFAULTS, rooms: 0 }).possible, false);
  assert.equal(breakEven({ ...DEFAULTS, pricePerPlayer: 0 }).possible, false);
});

test("break-even above the capacity cap is flagged unreachable", () => {
  const be = breakEven({ ...DEFAULTS, rentMonthly: 90000 });
  assert.equal(be.reachable, false);
});

test("the optimizer finds the best price on its grid and never does worse than today's", () => {
  const r = optimizePrice(DEFAULTS);
  assert.ok(r.best.profit >= r.now.profit - 1e-9);
  for (const row of r.rows) assert.ok(row.profit <= r.best.profit + 1e-9);
  assert.ok(r.best.price > r.rows[0].price && r.best.price < r.rows[r.rows.length - 1].price, "interior optimum");
  close(r.gain, r.best.profit - r.now.profit);
});

test("a more price-sensitive room has a lower best price", () => {
  const lo = optimizePrice({ ...DEFAULTS, elasticity: 0.6 }).best.price;
  const hi = optimizePrice({ ...DEFAULTS, elasticity: 1.6 }).best.price;
  assert.ok(hi < lo);
});

test("price sensitivity includes today's price with today's profit", () => {
  const rows = priceSensitivity(DEFAULTS);
  const now = rows.find((r) => r.price === DEFAULTS.pricePerPlayer);
  close(now.profit, model(DEFAULTS).profit);
});

test("occupancy grid: the 1.0 column at today's price is today's profit", () => {
  const g = occupancyGrid(DEFAULTS);
  const mid = g.find((r) => r.price === DEFAULTS.pricePerPlayer);
  close(mid.cells.find((c) => c.scale === 1).profit, model(DEFAULTS).profit);
  assert.ok(mid.cells[0].profit < mid.cells[3].profit);
});

test("a shorter reset never loses slots", () => {
  const rows = resetSensitivity(DEFAULTS);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].slotsPerRoomDay >= rows[i - 1].slotsPerRoomDay);
});

test("a higher group minimum raises revenue per booking only for small groups", () => {
  const rows = groupMinimumSensitivity({ ...DEFAULTS, groupSize: 4 });
  assert.equal(rows[0].revenuePerBooking, rows[2].revenuePerBooking);
  assert.ok(rows[4].revenuePerBooking > rows[2].revenuePerBooking);
});

test("payback is build cost over monthly profit, null when the rooms lose money", () => {
  const p = payback(DEFAULTS);
  close(p.capex, 84000);
  close(p.months, 84000 / model(DEFAULTS).profit);
  assert.equal(payback({ ...DEFAULTS, rentMonthly: 90000 }).months, null);
});

test("per-player economics divide the month by players served", () => {
  const e = perPlayerEconomics(DEFAULTS);
  const m = model(DEFAULTS);
  close(e.players, m.bookings * 5);
  close(e.revenuePerPlayer, m.gameRevenue / e.players);
});

test("hostile inputs do not throw or produce NaN", () => {
  const bad = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, NaN]));
  const m = model(bad);
  for (const v of Object.values(m)) assert.ok(Number.isFinite(v), String(v));
  assert.doesNotThrow(() => optimizePrice(bad));
  assert.doesNotThrow(() => breakEven(bad));
});
