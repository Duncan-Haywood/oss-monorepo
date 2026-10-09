// Independent pharmacy prescription margin: what each kind of fill earns once drug cost, vials and supplies, PBM claim fees,
// DIR and post-sale fees, copay card fees, rejected-claim rework, delivery and the pharmacy staff's time are counted, which
// prescription types use a staff hour best, the copay that reaches a target margin, and how many prescriptions a month cover
// fixed costs. Arithmetic on the numbers the user types; every value is an input.

export const ROWS = 5;
export const ROW_FIELDS = ["name", "patient", "plan", "acq", "supply", "dir", "mins", "perMonth"];

export const GLOBAL_DEFAULTS = {
  cardPct: "2.6", cardFixed: "0.10", planFee: "0.5", rework: "4", reworkMins: "20", delivery: "0.6", wage: "38", burden: "12",
  fixedMonth: "22000", target: "12",
};
const ROW_DEFAULTS = [
  ["Generic, commercial plan", "8", "14", "9", "1.2", "0.9", "4", "4200"],
  ["Brand, commercial plan", "35", "410", "428", "1.2", "6", "5", "480"],
  ["Generic, low-reimbursement PBM", "5", "6", "7", "1.2", "1.1", "4", "2100"],
  ["Cash generic, discount card", "18", "0", "6", "1.2", "0", "4", "540"],
  ["Specialty, limited network", "0", "1850", "1790", "3", "22", "20", "36"],
];
export const SHARED_DEFAULTS = { ...GLOBAL_DEFAULTS };
ROW_DEFAULTS.forEach((r, i) => ROW_FIELDS.forEach((f, j) => { SHARED_DEFAULTS[`${f}${i + 1}`] = r[j]; }));
export const EXAMPLE_SHARED = { ...SHARED_DEFAULTS };

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
export const pct = (n) => (n * 100).toFixed(1) + "%";

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

export function parseInputs(input, warnings) {
  const spec = {
    cardPct: [0, 10, "Copay card fee (%)"], cardFixed: [0, 2, "Card fee per Rx ($)"], planFee: [0, 30, "PBM claim fee (%)"],
    rework: [0, 50, "Reject and rework rate (%)"], reworkMins: [0, 240, "Minutes per rework"], delivery: [0, 200, "Delivery and compliance cost per Rx ($)"],
    wage: [0, 150, "Pharmacist and tech blended wage ($/hour)"], burden: [0, 60, "Payroll taxes and extras (%)"], fixedMonth: [0, 1e7, "Fixed costs ($/month)"],
    target: [0, 90, "Target margin (%)"],
  };
  const v = {};
  for (const [k, [lo, hi, label]] of Object.entries(spec)) {
    const n = num(input[k]);
    if (n === null || Number.isNaN(n) || n < lo || n > hi) { warnings.push(`${label} must be a number from ${lo} to ${hi}.`); v[k] = NaN; } else v[k] = n;
  }
  v.rows = [];
  for (let i = 1; i <= ROWS; i++) {
    const name = String(input[`name${i}`] ?? "").trim();
    const patient = num(input[`patient${i}`]);
    const plan = num(input[`plan${i}`]);
    if (!name && (patient === null || patient === 0) && (plan === null || plan === 0)) continue; // empty row
    const r = { name: name || `Prescription type ${i}` };
    const rspec = {
      patient: [0, 20000, "patient copay ($)"], plan: [0, 20000, "PBM pays ($)"], acq: [0, 5000, "drug acquisition cost ($)"],
      supply: [0, 5000, "vial, label and supplies cost ($)"], dir: [0, 5000, "DIR and post-sale fees ($)"], mins: [1, 600, "pharmacy staff minutes"], perMonth: [0, 100000, "prescriptions per month"],
    };
    for (const [f, [lo, hi, label]] of Object.entries(rspec)) {
      const n = num(input[`${f}${i}`]);
      if (n === null || Number.isNaN(n) || n < lo || n > hi) { warnings.push(`${r.name}: ${label} must be a number from ${lo} to ${hi}.`); r[f] = NaN; } else r[f] = n;
    }
    if (!Number.isNaN(r.patient) && !Number.isNaN(r.plan) && r.patient + r.plan <= 0) warnings.push(`${r.name}: copay and PBM pays are both zero, so there is no fill to measure.`);
    v.rows.push(r);
  }
  if (!v.rows.length) warnings.push("Enter at least one prescription type.");
  return v;
}

// Per-sale economics for one prescription type under the given globals. `over` can override any global, plus acqMult, pbmMult.
export function saleEconomics(v, r, over = {}) {
  const g = { ...v, ...over };
  const labRate = g.wage * (1 + g.burden / 100);
  const patient = r.patient;
  const plan = r.plan * (over.pbmMult ?? 1);
  const collected = patient + plan;
  const acq = r.acq * (over.acqMult ?? 1);
  const goods = acq + r.supply + r.dir;
  const reworkCost = (g.rework / 100) * (r.supply + (g.reworkMins / 60) * labRate);
  const card = patient > 0 ? patient * (g.cardPct / 100) + g.cardFixed : 0;
  const planFee = plan * (g.planFee / 100);
  const labor = (r.mins / 60) * labRate;
  const beforeLabor = collected - goods - reworkCost - card - planFee - g.delivery;
  const contribution = beforeLabor - labor;
  return { collected, patient, plan, goods, reworkCost, card, planFee, delivery: g.delivery, labor, beforeLabor, contribution, margin: collected > 0 ? contribution / collected : 0, perStaffHour: (beforeLabor * 60) / r.mins };
}

// Total collected at which contribution reaches the target share, then the copay that makes up the difference given what the PBM pays.
// Null when the card fee and target leave no room.
export function patientPriceForTarget(v, r) {
  const labRate = v.wage * (1 + v.burden / 100);
  const room = 1 - v.target / 100 - v.cardPct / 100;
  if (room <= 0) return null;
  const K = r.acq + r.supply + r.dir + (v.rework / 100) * (r.supply + (v.reworkMins / 60) * labRate) + (r.mins / 60) * labRate + v.delivery + v.cardFixed;
  const collected = (K + (v.planFee / 100 - v.cardPct / 100) * r.plan) / room;
  return { collected, patient: Math.max(0, collected - r.plan) };
}

function totals(v, over = {}) {
  let revenue = 0, contribution = 0, sales = 0;
  for (const r of v.rows) {
    const e = saleEconomics(v, r, over);
    revenue += e.collected * r.perMonth;
    contribution += e.contribution * r.perMonth;
    sales += r.perMonth;
  }
  return { revenue, contribution, sales, profitMonth: contribution - v.fixedMonth };
}

export function analyze(input) {
  const warnings = [];
  const v = parseInputs(input, warnings);
  if (warnings.length) return { ok: false, warnings };
  const rows = v.rows.map((r) => {
    const e = saleEconomics(v, r);
    return { ...r, ...e, targetPrice: patientPriceForTarget(v, r), monthly: e.contribution * r.perMonth };
  });
  const t = totals(v);
  const avgContribution = t.sales > 0 ? t.contribution / t.sales : 0;
  const breakEvenSales = t.contribution > 0 && t.sales > 0 ? Math.ceil(v.fixedMonth / avgContribution) : null;
  const planRows = rows.filter((r) => r.plan > 0), cashRows = rows.filter((r) => r.plan === 0 && r.perMonth > 0);
  const wavg = (rs, key) => { const n = rs.reduce((a, r) => a + r.perMonth, 0); return n > 0 ? rs.reduce((a, r) => a + r[key] * r.perMonth, 0) / n : null; };
  const planShare = t.sales > 0 ? planRows.reduce((a, r) => a + r.perMonth, 0) / t.sales : 0;
  const scenarios = [
    ["Drug acquisition cost up 10%", { acqMult: 1.1 }],
    ["PBM reimbursements cut 10%", { pbmMult: 0.9 }],
    ["Rework rate up 3 points", { rework: v.rework + 3 }],
    ["Staff wage up $2 an hour", { wage: v.wage + 2 }],
  ].map(([label, over]) => {
    const s = totals(v, over);
    return { label, profitMonth: s.profitMonth, change: s.profitMonth - t.profitMonth };
  });
  const lowMargin = rows.filter((r) => r.margin < v.target / 100);
  if (lowMargin.length) warnings.push(`${lowMargin.map((r) => r.name).join(", ")} ${lowMargin.length === 1 ? "is" : "are"} below your ${v.target}% target margin after labor.`);
  const losing = rows.filter((r) => r.contribution < 0);
  if (losing.length) warnings.push(`${losing.map((r) => r.name).join(", ")} lose${losing.length === 1 ? "s" : ""} money on every fill after drug cost, fees and staff time.`);
  if (t.profitMonth < 0) warnings.push("At these volumes the practice loses money each month before owner pay: contribution does not cover fixed costs.");
  warnings.push("Labor here is only the staff time you enter for each prescription. Idle hours and the pharmacist-in-charge's base salary belong in fixed costs. Prices, PBM payments and volumes are your numbers, not benchmarks.");
  const best = [...rows].sort((a, b) => b.perStaffHour - a.perStaffHour);
  return {
    ok: true, warnings, v, rows, totals: t, breakEvenSales, avgContribution, scenarios, planShare,
    planAvg: wavg(planRows, "contribution"), cashAvg: wavg(cashRows, "contribution"),
    bestPerHour: best[0], worstPerHour: best[best.length - 1],
  };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["Prescription type", "Copay", "PBM pays", "Goods", "Rework allowance", "Card fee", "Plan fee", "Staff time", "Earns", "Margin %", "Per staff hour", "Copay for target"];
  const rows = a.rows.map((r) => [r.name, r.patient, r.plan, r.goods, r.reworkCost, r.card, r.planFee, r.labor, r.contribution, r.margin * 100, r.perStaffHour, r.targetPrice ? r.targetPrice.patient : ""].map((x) => (typeof x === "number" ? x.toFixed(2) : x)));
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
