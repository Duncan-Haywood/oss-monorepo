// EV charging site ROI calculator. Pure functions, no DOM, no network.
// Projects a charging site's cash flows over a horizon (ramp-up in utilization, price and energy
// escalation, demand charges, network and payment fees, host revenue share), then reports payback,
// NPV, IRR, the utilization and price that break even, and how sensitive NPV is to each.

export const DEFAULTS = {
  ports: 4,
  kwPerPort: 150,
  hardwarePerPort: 75000,
  installPerPort: 35000,
  makeReady: 100000,
  incentives: 0,
  price: 0.48,
  sessionsPerPortPerDay: 8,
  kwhPerSession: 35,
  energyCost: 0.13,
  demandCharge: 15,
  simultaneity: 60,
  sitePowerCap: 0,
  networkFeePerPortMonth: 30,
  maintenancePct: 5,
  processingPct: 3,
  processingFixed: 0.3,
  hostSharePct: 0,
  otherFixedPerYear: 6000,
  rampStartPct: 60,
  rampYears: 3,
  priceEscPct: 2,
  energyEscPct: 3,
  years: 10,
  discountPct: 8,
};

// Placeholder presets, not any utility's tariff, vendor's quote or market's price.
export const PRESETS = {
  dcfc: { ...DEFAULTS },
  level2: {
    ...DEFAULTS, ports: 6, kwPerPort: 7.2, hardwarePerPort: 1800, installPerPort: 2500, makeReady: 6000, price: 0.3,
    sessionsPerPortPerDay: 2.5, kwhPerSession: 14, energyCost: 0.13, demandCharge: 0, simultaneity: 70, networkFeePerPortMonth: 15,
    maintenancePct: 4, otherFixedPerYear: 600,
  },
};

export const num = (v, fallback = 0) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

export function clean(raw = {}) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = Math.max(0, num(raw[k], 0));
  out.ports = Math.floor(out.ports);
  out.years = Math.min(30, Math.max(1, Math.round(out.years || 1)));
  out.rampYears = Math.max(1, Math.round(out.rampYears || 1));
  out.simultaneity = Math.min(100, out.simultaneity);
  out.rampStartPct = Math.min(100, out.rampStartPct);
  return out;
}

export const capex = (i) => i.ports * (i.hardwarePerPort + i.installPerPort) + i.makeReady - i.incentives;

// Share of mature utilization reached in year y (1-based): linear from rampStartPct to 100%.
export function rampFactor(i, y) {
  if (y >= i.rampYears || i.rampYears <= 1) return 1;
  const s = i.rampStartPct / 100;
  return s + (1 - s) * ((y - 1) / (i.rampYears - 1));
}

export function peakKw(i) {
  const raw = i.ports * i.kwPerPort * (i.simultaneity / 100);
  return i.sitePowerCap > 0 ? Math.min(i.sitePowerCap, raw) : raw;
}

// One year's operating lines at a given ramp factor and escalation index.
export function year(i, y, over = {}) {
  const sessionsPerDay = (over.sessionsPerPortPerDay ?? i.sessionsPerPortPerDay) * rampFactor(i, y);
  const price = (over.price ?? i.price) * (1 + i.priceEscPct / 100) ** (y - 1);
  const energyRate = i.energyCost * (1 + i.energyEscPct / 100) ** (y - 1);
  const demand = (over.demandCharge ?? i.demandCharge) * (1 + i.energyEscPct / 100) ** (y - 1);
  const sessions = i.ports * sessionsPerDay * 365;
  const kwh = sessions * i.kwhPerSession;
  const revenue = kwh * price;
  const energy = kwh * energyRate;
  const demandCost = demand * peakKw(i) * 12;
  const processing = revenue * (i.processingPct / 100) + sessions * i.processingFixed;
  const host = revenue * (i.hostSharePct / 100);
  const network = i.networkFeePerPortMonth * i.ports * 12;
  const maintenance = i.ports * i.hardwarePerPort * (i.maintenancePct / 100);
  const fixed = i.otherFixedPerYear;
  const costs = energy + demandCost + processing + host + network + maintenance + fixed;
  return { y, sessions, kwh, price, revenue, energy, demandCost, processing, host, network, maintenance, fixed, costs, net: revenue - costs };
}

export function project(i, over = {}) {
  const rows = [];
  for (let y = 1; y <= i.years; y++) rows.push(year(i, y, over));
  return rows;
}

export function npvOf(i, over = {}) {
  const r = i.discountPct / 100;
  let v = -capex(i);
  project(i, over).forEach((row, k) => { v += row.net / (1 + r) ** (k + 1); });
  return v;
}

export function irrOf(i, over = {}) {
  const flows = [-capex(i), ...project(i, over).map((r) => r.net)];
  const f = (r) => flows.reduce((s, c, t) => s + c / (1 + r) ** t, 0);
  let lo = -0.9, hi = 5;
  if (f(lo) * f(hi) > 0) return null;
  for (let n = 0; n < 200; n++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// Years until cumulative undiscounted cash turns positive, interpolated within the year; null if never inside the horizon.
export function paybackYears(i, over = {}) {
  let cum = -capex(i);
  if (cum >= 0) return 0;
  for (const row of project(i, over)) {
    if (cum + row.net >= 0) return row.y - 1 + (-cum) / row.net;
    cum += row.net;
  }
  return null;
}

// Smallest value of `key` in [lo, hi] with NPV >= 0, or null when even `hi` loses money. NPV rises with both knobs used here.
function breakeven(i, key, lo, hi) {
  if (npvOf(i, { [key]: hi }) < 0) return null;
  if (npvOf(i, { [key]: lo }) >= 0) return lo;
  for (let n = 0; n < 100; n++) {
    const mid = (lo + hi) / 2;
    if (npvOf(i, { [key]: mid }) >= 0) hi = mid; else lo = mid;
  }
  return hi;
}

export function analyze(raw = {}) {
  const i = clean(raw);
  const warnings = [];
  if (i.ports < 1) warnings.push("Enter at least one port.");
  if (i.kwPerPort <= 0) warnings.push("Enter the power per port in kW.");
  if (i.price <= 0) warnings.push("Enter the price you charge drivers per kWh.");
  if (i.sessionsPerPortPerDay <= 0) warnings.push("Enter the sessions per port per day you expect once the site is mature.");
  if (i.kwhPerSession <= 0) warnings.push("Enter the kWh delivered per session.");
  if (capex(i) <= 0) warnings.push("Total upfront cost is zero or negative after incentives; enter hardware, install and make-ready costs.");
  if (warnings.length) return { ok: false, warnings };

  const hours = (i.sessionsPerPortPerDay * i.kwhPerSession) / (i.kwPerPort * 0.6);
  if (hours > 18) warnings.push(`At ${i.sessionsPerPortPerDay} sessions of ${i.kwhPerSession} kWh a day each port would be charging about ${hours.toFixed(0)} hours a day (assuming vehicles average 60% of the port's rated power). That is not credible; lower the sessions or the kWh.`);
  if (i.price <= i.energyCost * (1 + i.processingPct / 100)) warnings.push("The price per kWh is at or below your energy cost plus card fees, so every extra session loses money.");
  const rows = project(i);
  const mature = year({ ...i, rampStartPct: 100 }, 1);
  const cap = capex(i);
  const npv = npvOf(i);
  const demandShare = mature.revenue > 0 ? mature.demandCost / mature.revenue : 0;
  const demandFloor = mature.demandCost + mature.fixed + mature.network + mature.maintenance;

  const sessionsBE = breakeven(i, "sessionsPerPortPerDay", 0, 60);
  const priceBE = breakeven(i, "price", 0, 5);
  const sessionGrid = [0.5, 0.75, 1, 1.25, 1.5].map((m) => m * i.sessionsPerPortPerDay);
  const priceGrid = [-0.1, -0.05, 0, 0.05, 0.1].map((d) => Math.max(0.01, i.price + d));
  const grid = sessionGrid.map((s) => priceGrid.map((p) => npvOf(i, { sessionsPerPortPerDay: s, price: p })));
  const demandRows = [0, 0.5, 1, 1.5].map((m) => ({ mult: m, rate: i.demandCharge * m, npv: npvOf(i, { demandCharge: i.demandCharge * m }) }));

  return {
    ok: true, warnings, inputs: i, rows, mature, capex: cap, npv, irr: irrOf(i), payback: paybackYears(i),
    sessionsBreakEven: sessionsBE, priceBreakEven: priceBE, sessionGrid, priceGrid, grid, demandRows,
    margins: {
      revenuePerKwh: mature.kwh ? mature.revenue / mature.kwh : 0,
      costPerKwh: mature.kwh ? mature.costs / mature.kwh : 0,
      netPerKwh: mature.kwh ? mature.net / mature.kwh : 0,
      demandShare, peakKw: peakKw(i), demandFloor,
    },
    chargingHours: hours,
  };
}

export function toCsv(a) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Year", "Sessions", "kWh", "Revenue", "Energy", "Demand charges", "Processing", "Host share", "Network", "Maintenance", "Other fixed", "Net cash"].map(q).join(",")];
  for (const r of a.rows) lines.push([r.y, Math.round(r.sessions), Math.round(r.kwh), ...[r.revenue, r.energy, r.demandCost, r.processing, r.host, r.network, r.maintenance, r.fixed, r.net].map((v) => v.toFixed(2))].join(","));
  lines.push("", `${q("Upfront cost after incentives")},${a.capex.toFixed(2)}`, `${q("NPV")},${a.npv.toFixed(2)}`);
  return lines.join("\n");
}
