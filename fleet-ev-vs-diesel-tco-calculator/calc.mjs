// Small-fleet EV vs gas/diesel total cost of ownership. Pure functions, no dependencies,
// nothing leaves the browser. Every default is a placeholder, not a market figure: check each
// against your own quotes, utility tariff and incentive paperwork.

export const DEFAULTS = {
  vehicles: 5,
  milesPerYear: 20000,
  years: 8,
  icePrice: 46000,
  iceMpg: 17,
  fuelPrice: 3.8,
  iceMaintPerMile: 0.11,
  iceResidualPct: 20,
  evPrice: 58000,
  incentivePerVehicle: 0,
  evKwhPerMile: 0.55,
  depotRate: 0.16,
  publicSharePct: 10,
  publicRate: 0.45,
  evMaintPerMile: 0.06,
  evResidualPct: 15,
  insuranceDeltaPerVehicle: 500,
  chargers: 3,
  chargerCost: 5000,
  chargerIncentive: 0,
  chargerMaintPerYear: 250,
  peakKw: 22,
  demandRate: 12,
  fuelEscPct: 3,
  elecEscPct: 2.5,
  costEscPct: 2.5,
  discountPct: 8,
  peakDayMiles: 110,
  evRange: 150,
  rangeLossPct: 25,
  chargerKw: 11.5,
  overnightHours: 9,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const fin = (x) => (Number.isFinite(x) ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function money2(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
}

// Year-by-year cash flows. Year 0 is purchase and charger install; years 1..N are running
// costs, with the resale value of the vehicles received in the last year.
export function tco(raw) {
  const o = { ...DEFAULTS, ...raw };
  const years = Math.max(1, Math.min(20, Math.round(nz(o.years)) || 1));
  const veh = nz(o.vehicles);
  const miles = veh * nz(o.milesPerYear);
  const r = fin(o.discountPct) / 100;
  const df = (t) => 1 / Math.pow(1 + r, t);
  const fe = fin(o.fuelEscPct) / 100;
  const ee = fin(o.elecEscPct) / 100;
  const ce = fin(o.costEscPct) / 100;
  const pub = Math.min(1, nz(o.publicSharePct) / 100);
  const blended = (1 - pub) * nz(o.depotRate) + pub * nz(o.publicRate);

  const iceUp = veh * nz(o.icePrice);
  const evUp = Math.max(0, veh * (nz(o.evPrice) - nz(o.incentivePerVehicle)) + nz(o.chargers) * nz(o.chargerCost) - nz(o.chargerIncentive));
  const iceRes = veh * nz(o.icePrice) * Math.min(100, nz(o.iceResidualPct)) / 100;
  const evRes = veh * nz(o.evPrice) * Math.min(100, nz(o.evResidualPct)) / 100;

  const rows = [];
  for (let t = 1; t <= years; t++) {
    const fuel = nz(o.iceMpg) > 0 ? (miles / o.iceMpg) * nz(o.fuelPrice) * Math.pow(1 + fe, t - 1) : 0;
    const iceMaint = miles * nz(o.iceMaintPerMile) * Math.pow(1 + ce, t - 1);
    const energy = miles * nz(o.evKwhPerMile) * blended * Math.pow(1 + ee, t - 1);
    const demand = nz(o.peakKw) * nz(o.demandRate) * 12 * Math.pow(1 + ee, t - 1);
    const evMaint = miles * nz(o.evMaintPerMile) * Math.pow(1 + ce, t - 1) + nz(o.chargers) * nz(o.chargerMaintPerYear) * Math.pow(1 + ce, t - 1);
    const ins = veh * fin(o.insuranceDeltaPerVehicle) * Math.pow(1 + ce, t - 1);
    const last = t === years;
    rows.push({
      year: t,
      iceOperating: fuel + iceMaint,
      iceFuel: fuel,
      iceMaint,
      evOperating: energy + demand + evMaint + ins,
      evEnergy: energy,
      evDemand: demand,
      evMaint,
      evInsurance: ins,
      iceResidual: last ? iceRes : 0,
      evResidual: last ? evRes : 0,
    });
  }
  let iceCum = iceUp, evCum = evUp, payback = evCum <= iceCum ? 0 : null;
  let iceNpv = iceUp, evNpv = evUp, iceNom = iceUp, evNom = evUp;
  for (const row of rows) {
    iceCum += row.iceOperating;
    evCum += row.evOperating;
    row.iceCum = iceCum;
    row.evCum = evCum;
    if (payback === null && evCum <= iceCum) payback = row.year;
    iceNom += row.iceOperating - row.iceResidual;
    evNom += row.evOperating - row.evResidual;
    iceNpv += (row.iceOperating - row.iceResidual) * df(row.year);
    evNpv += (row.evOperating - row.evResidual) * df(row.year);
  }
  const lifeMiles = miles * years;
  return {
    years, vehicles: veh, miles, blendedRate: blended,
    iceUp, evUp, iceRes, evRes, rows, payback,
    iceNpv, evNpv, iceNom, evNom,
    savingsNpv: iceNpv - evNpv,
    savingsNom: iceNom - evNom,
    iceCostPerMile: lifeMiles > 0 ? iceNom / lifeMiles : 0,
    evCostPerMile: lifeMiles > 0 ? evNom / lifeMiles : 0,
    firstYearOperatingSaving: rows.length ? rows[0].iceOperating - rows[0].evOperating : 0,
    upfrontPremium: evUp - iceUp,
  };
}

// Every cost is affine in each of fuel price, depot electricity rate and annual miles, so the
// break-even of each is exact from two evaluations rather than a search.
function solveAffine(o, key, f) {
  const a = f({ ...o, [key]: 0 });
  const b = f({ ...o, [key]: 1 });
  const slope = b - a;
  if (!(Math.abs(slope) > 1e-12)) return null;
  const x = -a / slope;
  return Number.isFinite(x) && x >= 0 ? x : null;
}
const diff = (o) => tco(o).savingsNpv;

// Fuel price at which the EV and the gas/diesel vehicle cost the same in present value.
export function breakevenFuel(o) {
  return solveAffine({ ...DEFAULTS, ...o }, "fuelPrice", diff);
}
// Depot electricity rate at which they tie.
export function breakevenElectricity(o) {
  return solveAffine({ ...DEFAULTS, ...o }, "depotRate", diff);
}
// Miles per vehicle per year at which they tie (below this, the EV's higher price is not earned back).
export function breakevenMiles(o) {
  return solveAffine({ ...DEFAULTS, ...o }, "milesPerYear", diff);
}

// Savings (present value) over a grid of fuel price and electricity rate multipliers.
export function sensitivity(raw, fuelMults = [0.7, 0.85, 1, 1.15, 1.3, 1.5], elecMults = [0.8, 1, 1.25, 1.5]) {
  const o = { ...DEFAULTS, ...raw };
  return elecMults.map((em) => ({
    elecRate: nz(o.depotRate) * em,
    cells: fuelMults.map((fm) => ({
      fuelPrice: nz(o.fuelPrice) * fm,
      savings: diff({ ...o, fuelPrice: nz(o.fuelPrice) * fm, depotRate: nz(o.depotRate) * em, publicRate: nz(o.publicRate) * em }),
    })),
  }));
}

// Can the EV do the hardest day, and can the depot charge them overnight?
export function feasibility(raw) {
  const o = { ...DEFAULTS, ...raw };
  const usable = nz(o.evRange) * (1 - Math.min(90, nz(o.rangeLossPct)) / 100);
  const day = nz(o.peakDayMiles);
  const kwhPerVehicle = day * nz(o.evKwhPerMile);
  const needKwh = kwhPerVehicle * nz(o.vehicles);
  const supplyKwh = nz(o.chargers) * nz(o.chargerKw) * nz(o.overnightHours);
  return {
    usableRange: usable,
    rangeOk: day <= usable,
    rangeMargin: usable - day,
    needKwh, supplyKwh,
    chargingOk: needKwh <= supplyKwh,
    chargersNeeded: nz(o.chargerKw) * nz(o.overnightHours) > 0 ? Math.ceil(needKwh / (nz(o.chargerKw) * nz(o.overnightHours))) : null,
  };
}
