// Collision repair shop DRP planner: pure functions, no dependencies, nothing leaves the browser.
// An insurer's direct repair program (DRP) sends volume in exchange for a lower labor rate, a parts
// discount and a paint-materials cap, plus paperwork cost per repair order. Whether it pays depends on
// the margin lost on every DRP job, the margin earned on the extra jobs, and the whole-technician steps
// the extra hours force. This file does that arithmetic and nothing else.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  retailRos: 40, repricedRos: 20, newDrpRos: 30,
  bodyHrs: 14, refinishHrs: 9, partsCost: 1500, otherCostPerRo: 120,
  bodyRate: 68, refinishRate: 68, materialsRate: 44, materialsCostPct: 55, partsMarkupPct: 30,
  drpBodyRate: 54, drpRefinishRate: 54, drpMaterialsRate: 36, drpPartsDiscountPct: 12,
  drpAdminPerRo: 45, drpFeePct: 0,
  techPayPerHr: 27, payrollBurdenPct: 16, flagHrsPerTech: 150, techFixedMonthly: 900,
  fixedMonthly: 36000, ownerPayMonthly: 8000,
};

const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);
const pct = (x) => Math.min(100, safe(x)) / 100;

// One repair order of each kind, in dollars. Parts sell at cost plus markup; a DRP takes its discount off
// that selling price. Tech pay is flat-rate per flagged hour and carries payroll burden.
export function roEconomics(o, kind) {
  const drp = kind === "drp";
  const bodyHrs = safe(o.bodyHrs);
  const refHrs = safe(o.refinishHrs);
  const labor = bodyHrs * safe(drp ? o.drpBodyRate : o.bodyRate) + refHrs * safe(drp ? o.drpRefinishRate : o.refinishRate);
  const materials = refHrs * safe(drp ? o.drpMaterialsRate : o.materialsRate);
  const partsList = safe(o.partsCost) * (1 + pct(o.partsMarkupPct));
  const parts = drp ? partsList * (1 - pct(o.drpPartsDiscountPct)) : partsList;
  const revenue = labor + materials + parts;
  const techPay = (bodyHrs + refHrs) * safe(o.techPayPerHr) * (1 + pct(o.payrollBurdenPct));
  // Materials cost is a share of the *retail* materials charge: the shop buys the same paint either way.
  const materialsCost = refHrs * safe(o.materialsRate) * pct(o.materialsCostPct);
  const cost = techPay + materialsCost + safe(o.partsCost) + safe(o.otherCostPerRo)
    + (drp ? safe(o.drpAdminPerRo) + revenue * pct(o.drpFeePct) : 0);
  const hours = bodyHrs + refHrs;
  return {
    revenue, labor, materials, parts, techPay, materialsCost, cost,
    contribution: revenue - cost, hours,
    contributionPerHour: hours > 0 ? (revenue - cost) / hours : 0,
    effectiveLaborRate: hours > 0 ? labor / hours : 0,
  };
}

// The whole month, with or without the program. Jobs from the insurer you already repair for
// (`repricedRos`) are paid at retail without the program and at DRP terms with it; `newDrpRos` is the
// extra volume the program promises and only exists with it. Technicians come in whole steps: each one
// carries a fixed monthly cost on top of flat-rate pay, and hours past a technician's capacity need
// another one.
export function model(o, program = true) {
  const retailRos = Math.floor(safe(o.retailRos));
  const repriced = Math.floor(safe(o.repricedRos));
  const fresh = program ? Math.floor(safe(o.newDrpRos)) : 0;
  const drpRos = program ? repriced + fresh : 0;
  const retailTotal = retailRos + (program ? 0 : repriced);
  const r = roEconomics(o, "retail");
  const d = roEconomics(o, "drp");
  const hours = retailTotal * r.hours + drpRos * d.hours;
  const cap = Math.max(1, safe(o.flagHrsPerTech));
  const techs = hours > 0 ? Math.ceil(hours / cap) : 0;
  const revenue = retailTotal * r.revenue + drpRos * d.revenue;
  const variable = retailTotal * r.cost + drpRos * d.cost;
  const techFixed = techs * safe(o.techFixedMonthly);
  const fixed = safe(o.fixedMonthly) + safe(o.ownerPayMonthly);
  const cost = variable + techFixed + fixed;
  const profit = revenue - cost;
  return {
    program, retailRos: retailTotal, drpRos, ros: retailTotal + drpRos, hours, techs, revenue, variable,
    techFixed, fixed, cost, profit,
    margin: revenue > 0 ? profit / revenue : 0,
    drpShare: retailTotal + drpRos > 0 ? drpRos / (retailTotal + drpRos) : 0,
    retail: r, drp: d,
  };
}

// Value of the program: the month with it against the month without it.
export function drpValue(o) {
  const withDrp = model(o, true);
  const without = model(o, false);
  return { withDrp, without, gain: withDrp.profit - without.profit };
}

// Smallest promised new volume from which the program stays at least as good as none (checked to
// `limit`), so a lucky technician step does not read as the break-even.
export function breakEvenNewRos(o, limit = 400) {
  const base = model(o, false).profit;
  let lastLoss = -1;
  for (let n = 0; n <= limit; n++) if (model({ ...o, newDrpRos: n }, true).profit < base - 1e-9) lastLoss = n;
  if (lastLoss >= limit) return { possible: false, ros: null };
  const ros = lastLoss + 1;
  const cur = Math.floor(safe(o.newDrpRos));
  return { possible: true, ros, current: cur, gap: ros - cur };
}

// Gain from the program at a ladder of promised volumes, so the technician steps show.
export function volumeTable(o) {
  const base = model(o, false).profit;
  const cur = Math.floor(safe(o.newDrpRos));
  const set = new Set([0, 5, 10, 20, 30, 40, 60, 80, cur].filter((n) => n >= 0));
  return [...set].sort((a, b) => a - b).map((n) => {
    const m = model({ ...o, newDrpRos: n }, true);
    return { newDrpRos: n, techs: m.techs, revenue: m.revenue, profit: m.profit, gain: m.profit - base };
  });
}

// The lowest DRP labor rate (body and refinish moved together, $1 steps) at which the program still
// earns at least `minGain` over none. Null when even a rate above retail does not.
export function lowestDrpRate(o, minGain = 0) {
  const base = model(o, false).profit;
  const hi = Math.max(safe(o.bodyRate), safe(o.refinishRate));
  for (let rate = 0; rate <= hi + 40; rate++) {
    const m = model({ ...o, drpBodyRate: rate, drpRefinishRate: rate }, true);
    if (m.profit - base >= minGain) return { rate, profit: m.profit, gain: m.profit - base };
  }
  return null;
}

// What one DRP job gives up against the same job at retail, and what an hour earns each way.
export function termsCost(o) {
  const r = roEconomics(o, "retail");
  const d = roEconomics(o, "drp");
  return {
    perRo: r.contribution - d.contribution,
    laborGiveUp: r.labor - d.labor,
    materialsGiveUp: r.materials - d.materials,
    partsGiveUp: r.parts - d.parts,
    admin: d.cost - r.cost,
    retailPerHour: r.contributionPerHour,
    drpPerHour: d.contributionPerHour,
  };
}
