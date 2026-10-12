// Property management company profit planner: pure functions, no dependencies, nothing leaves the browser.
// A management company earns a percentage of rent on occupied doors plus leasing, renewal, onboarding and
// maintenance-markup income, and pays for people in whole-person steps (one more manager at door 101), so
// profit is not a straight line in doors. The questions that matter are the break-even door count, what the
// next hire does to profit, what a fee change costs in lost owners, and whether an owner pays back its cost.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  doors: 160, avgRent: 1650, feePct: 8, minFee: 100, vacancyPct: 6,
  turnoverPct: 30, leasingFeePct: 75, renewalFee: 150, leaseCost: 120,
  maintSpendPerDoorYear: 1400, maintMarkupPct: 10, lateFeePerDoorMonth: 6, onboardingFee: 150,
  variablePerDoor: 8,
  doorsPerManager: 125, managerMonthly: 5200, doorsPerAdmin: 200, adminMonthly: 4300,
  softwareMin: 280, softwarePerDoor: 1.4, insuranceMonthly: 650, officeOtherMonthly: 1500, ownerPayMonthly: 6000,
  ownerChurnPct: 14, growthDoorsPerYear: 24, doorsPerOwner: 1.6, cacPerOwner: 450, elasticity: 1,
};

const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);
const clampPct = (p) => Math.min(100, Math.max(0, safe(p)));
const ceilDiv = (a, b) => (a > 0 && b > 0 ? Math.ceil(a / b) : 0);

export function model(o) {
  const doors = Math.floor(safe(o.doors));
  const vac = clampPct(o.vacancyPct) / 100;
  const turn = clampPct(o.turnoverPct) / 100;
  const rent = safe(o.avgRent);
  const occupied = doors * (1 - vac);
  const feePerDoor = Math.max(safe(o.minFee), (rent * safe(o.feePct)) / 100);
  const mgmtFees = occupied * feePerDoor;
  const turnovers = (doors * turn) / 12;
  const renewals = (occupied * (1 - turn)) / 12;
  const leasingFees = turnovers * (clampPct(o.leasingFeePct) / 100) * rent;
  const renewalFees = renewals * safe(o.renewalFee);
  const maintMarkup = (doors * safe(o.maintSpendPerDoorYear) / 12) * (safe(o.maintMarkupPct) / 100);
  const lateFees = occupied * safe(o.lateFeePerDoorMonth);
  const newDoorsYear = (doors * clampPct(o.ownerChurnPct)) / 100 + safe(o.growthDoorsPerYear);
  const onboarding = (newDoorsYear / 12) * safe(o.onboardingFee);
  const revenue = mgmtFees + leasingFees + renewalFees + maintMarkup + lateFees + onboarding;

  const variable = doors * safe(o.variablePerDoor) + turnovers * safe(o.leaseCost);
  const managers = ceilDiv(doors, safe(o.doorsPerManager));
  const admins = ceilDiv(doors, safe(o.doorsPerAdmin));
  const staff = managers * safe(o.managerMonthly) + admins * safe(o.adminMonthly);
  const software = doors > 0 ? Math.max(safe(o.softwareMin), doors * safe(o.softwarePerDoor)) : 0;
  const marketing = ((newDoorsYear / Math.max(0.1, safe(o.doorsPerOwner) || 1)) * safe(o.cacPerOwner)) / 12;
  const overhead = software + safe(o.insuranceMonthly) + safe(o.officeOtherMonthly) + safe(o.ownerPayMonthly);
  const cost = variable + staff + overhead + marketing;
  const profit = revenue - cost;
  return {
    doors, occupied, feePerDoor, mgmtFees, leasingFees, renewalFees, maintMarkup, lateFees, onboarding, revenue,
    variable, managers, admins, staff, software, marketing, overhead, cost, profit,
    margin: revenue > 0 ? profit / revenue : 0,
    profitPerDoor: doors > 0 ? profit / doors : 0,
    revenuePerDoor: doors > 0 ? revenue / doors : 0,
  };
}

// Smallest door count from which profit stays at or above zero (checked to `limit` doors), so a lucky
// positive month on a hiring step does not read as the break-even point.
export function breakEvenDoors(o, limit = 3000) {
  let lastLoss = 0;
  for (let d = 1; d <= limit; d++) if (model({ ...o, doors: d }).profit < 0) lastLoss = d;
  if (lastLoss >= limit) return { possible: false, doors: null };
  return { possible: true, doors: lastLoss + 1, current: Math.floor(safe(o.doors)), gap: lastLoss + 1 - Math.floor(safe(o.doors)) };
}

// Profit at a ladder of portfolio sizes, plus the two rows around the next hire so the cliff is visible.
export function scaleTable(o) {
  const perMgr = Math.max(1, Math.floor(safe(o.doorsPerManager)));
  const cur = Math.floor(safe(o.doors));
  const m = ceilDiv(cur, perMgr) || 1;
  const set = new Set([25, 50, 100, 150, 250, 400, 600, cur, m * perMgr, m * perMgr + 1].filter((d) => d > 0));
  return [...set].sort((a, b) => a - b).map((d) => {
    const r = model({ ...o, doors: d });
    return { doors: d, revenue: r.revenue, profit: r.profit, margin: r.margin, profitPerDoor: r.profitPerDoor, managers: r.managers };
  });
}

// What the next manager costs: profit at the last door the current team covers, one door later, and how
// many extra doors are needed to earn the hire back.
export function hireStep(o) {
  const perMgr = Math.max(1, Math.floor(safe(o.doorsPerManager)));
  const cur = Math.floor(safe(o.doors));
  const m = ceilDiv(cur, perMgr) || 1;
  const atCap = model({ ...o, doors: m * perMgr });
  const over = model({ ...o, doors: m * perMgr + 1 });
  let recover = null;
  for (let d = m * perMgr + 1; d <= m * perMgr + 2000; d++) if (model({ ...o, doors: d }).profit >= atCap.profit) { recover = d; break; }
  return { capDoors: m * perMgr, profitAtCap: atCap.profit, profitAfterHire: over.profit, drop: atCap.profit - over.profit, doorsToRecover: recover === null ? null : recover - m * perMgr };
}

// Doors fall by `elasticity` % for each 1% the fee percentage rises (and rise for a cut), linear and
// floored at zero; a cut adds at most 20% more doors. A stated assumption, not a measurement.
export function feeSensitivity(o) {
  const cur = safe(o.feePct);
  const base = Math.floor(safe(o.doors));
  const rows = [];
  for (let f = 4; f <= 14.0001; f += 1) {
    const change = cur > 0 ? (f - cur) / cur : 0;
    const doors = Math.max(0, Math.round(Math.min(base * 1.2, base * (1 - (safe(o.elasticity) * change)))));
    const r = model({ ...o, feePct: f, doors });
    rows.push({ feePct: f, doors, revenue: r.revenue, profit: r.profit });
  }
  return rows;
}
export function optimizeFee(o) {
  const rows = feeSensitivity(o);
  const best = rows.reduce((a, b) => (b.profit > a.profit ? b : a), rows[0]);
  const now = model(o);
  return { rows, best, now, gain: best.profit - now.profit };
}

// What one new owner is worth: monthly contribution per door after per-door costs and each door's share
// of manager and admin pay (marketing and fixed overhead excluded), times doors per owner.
export function ownerEconomics(o) {
  const m = model({ ...o, doors: Math.max(1, Math.floor(safe(o.doors))) });
  const perDoor = m.revenue / m.doors - m.variable / m.doors
    - safe(o.managerMonthly) / Math.max(1, safe(o.doorsPerManager)) - safe(o.adminMonthly) / Math.max(1, safe(o.doorsPerAdmin))
    - safe(o.softwarePerDoor);
  const owners = Math.max(0.1, safe(o.doorsPerOwner) || 1);
  const monthly = perDoor * owners;
  const upfront = Math.max(0, safe(o.cacPerOwner) - safe(o.onboardingFee) * owners);
  const churn = clampPct(o.ownerChurnPct) / 100;
  return {
    contributionPerDoor: perDoor, monthlyPerOwner: monthly, netCac: upfront,
    paybackMonths: monthly > 0 ? upfront / monthly : null,
    lifetimeValue: churn > 0 ? monthly * 12 / churn : null,
    ltvToCac: churn > 0 && safe(o.cacPerOwner) > 0 && monthly > 0 ? (monthly * 12 / churn) / safe(o.cacPerOwner) : null,
  };
}
