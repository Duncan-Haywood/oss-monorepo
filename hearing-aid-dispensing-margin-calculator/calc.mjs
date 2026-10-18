// Hearing aid dispensing margin: what each kind of device sale earns once device and accessory cost, trial-period returns,
// follow-up visits, commission, plan and card fees and the clinician's time are counted, which sale types use a clinician
// hour best, the patient price that reaches a target margin, and how many sales a month cover fixed costs.
// Arithmetic on the numbers the user types; every value is an input.

export const ROWS = 5;
export const ROW_FIELDS = ["name", "patient", "plan", "device", "extras", "mins", "perMonth"];

export const GLOBAL_DEFAULTS = {
  cardPct: "2.6", cardFixed: "0.10", planFee: "3", returnRate: "12", returnLoss: "20", returnMins: "45",
  followups: "4", followMins: "25", commission: "8", wage: "55", burden: "15", fixedMonth: "16000", target: "47",
};
const ROW_DEFAULTS = [
  ["Premium pair, private pay", "5400", "0", "1900", "120", "75", "6"],
  ["Mid-tier pair, private pay", "3600", "0", "1150", "90", "70", "10"],
  ["Basic pair, discount bundle", "1998", "0", "620", "60", "60", "8"],
  ["Mid-tier pair, plan benefit", "1900", "1500", "1150", "90", "70", "6"],
  ["Single mid-tier device", "1800", "0", "575", "50", "55", "5"],
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
    cardPct: [0, 10, "Card fee (%)"], cardFixed: [0, 2, "Card fee per sale ($)"], planFee: [0, 30, "Plan or benefit-manager fee (%)"],
    returnRate: [0, 60, "Trial-period return rate (%)"], returnLoss: [0, 100, "Device cost lost on a return (%)"], returnMins: [0, 480, "Minutes wasted per return"],
    followups: [0, 30, "Included follow-up visits per sale"], followMins: [0, 240, "Minutes per follow-up visit"],
    commission: [0, 50, "Commission (% of collected)"], wage: [0, 250, "Clinician wage ($/hour)"], burden: [0, 60, "Payroll taxes and extras (%)"],
    fixedMonth: [0, 1e7, "Fixed costs ($/month)"], target: [0, 90, "Target margin (%)"],
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
    const r = { name: name || `Sale type ${i}` };
    const rspec = {
      patient: [0, 50000, "patient pays ($)"], plan: [0, 50000, "plan pays ($)"], device: [0, 20000, "device wholesale cost ($)"],
      extras: [0, 5000, "domes, molds, batteries and accessories cost ($)"], mins: [1, 900, "fitting minutes"], perMonth: [0, 100000, "sales per month"],
    };
    for (const [f, [lo, hi, label]] of Object.entries(rspec)) {
      const n = num(input[`${f}${i}`]);
      if (n === null || Number.isNaN(n) || n < lo || n > hi) { warnings.push(`${r.name}: ${label} must be a number from ${lo} to ${hi}.`); r[f] = NaN; } else r[f] = n;
    }
    if (!Number.isNaN(r.patient) && !Number.isNaN(r.plan) && r.patient + r.plan <= 0) warnings.push(`${r.name}: patient pays and plan pays are both zero, so there is no sale to measure.`);
    v.rows.push(r);
  }
  if (!v.rows.length) warnings.push("Enter at least one sale type.");
  return v;
}

// Per-sale economics for one sale type under the given globals. `over` can override any global, plus deviceMult, planMult, patientMult.
export function saleEconomics(v, r, over = {}) {
  const g = { ...v, ...over };
  const labRate = g.wage * (1 + g.burden / 100);
  const patient = r.patient * (over.patientMult ?? 1);
  const plan = r.plan * (over.planMult ?? 1);
  const collected = patient + plan;
  const device = r.device * (over.deviceMult ?? 1);
  const goods = device + r.extras;
  const returnCost = (g.returnRate / 100) * ((g.returnLoss / 100) * device + (g.returnMins / 60) * labRate);
  const card = patient > 0 ? patient * (g.cardPct / 100) + g.cardFixed : 0;
  const planFee = plan * (g.planFee / 100);
  const commission = collected * (g.commission / 100);
  const clinicMins = r.mins + g.followups * g.followMins;
  const labor = (clinicMins / 60) * labRate;
  const beforeLabor = collected - goods - returnCost - card - planFee - commission;
  const contribution = beforeLabor - labor;
  return { collected, patient, plan, goods, returnCost, card, planFee, commission, clinicMins, labor, beforeLabor, contribution, margin: collected > 0 ? contribution / collected : 0, perClinicianHour: (beforeLabor * 60) / clinicMins };
}

// Total collected at which contribution reaches the target share, then the patient's share of it given what the plan pays.
// Null when the card fee, commission and target leave no room.
export function patientPriceForTarget(v, r) {
  const labRate = v.wage * (1 + v.burden / 100);
  const room = 1 - v.target / 100 - v.cardPct / 100 - v.commission / 100;
  if (room <= 0) return null;
  const clinicMins = r.mins + v.followups * v.followMins;
  const K = r.device + r.extras + (v.returnRate / 100) * ((v.returnLoss / 100) * r.device + (v.returnMins / 60) * labRate) + (clinicMins / 60) * labRate + v.cardFixed;
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
    ["Device wholesale cost up 8%", { deviceMult: 1.08 }],
    ["Plan and benefit payments cut 10%", { planMult: 0.9 }],
    ["Private-pay prices cut 15% (over-the-counter pressure)", { patientMult: 0.85 }],
    ["Trial-period returns up 5 points", { returnRate: v.returnRate + 5 }],
    ["Clinician wage up $5 an hour", { wage: v.wage + 5 }],
  ].map(([label, over]) => {
    const s = totals(v, over);
    return { label, profitMonth: s.profitMonth, change: s.profitMonth - t.profitMonth };
  });
  const lowMargin = rows.filter((r) => r.margin < v.target / 100);
  if (lowMargin.length) warnings.push(`${lowMargin.map((r) => r.name).join(", ")} ${lowMargin.length === 1 ? "is" : "are"} below your ${v.target}% target margin after clinician time.`);
  const losing = rows.filter((r) => r.contribution < 0);
  if (losing.length) warnings.push(`${losing.map((r) => r.name).join(", ")} lose${losing.length === 1 ? "s" : ""} money on every sale after devices, returns, fees and clinician time.`);
  if (t.profitMonth < 0) warnings.push("At these volumes the practice loses money each month before owner pay: contribution does not cover fixed costs.");
  warnings.push("Labor here is only the fitting and follow-up time you enter for each sale. Idle hours, diagnostic evaluations billed separately and marketing belong in fixed costs. Prices, plan payments, return rates and volumes are your numbers, not benchmarks.");
  const best = [...rows].sort((a, b) => b.perClinicianHour - a.perClinicianHour);
  return {
    ok: true, warnings, v, rows, totals: t, breakEvenSales, avgContribution, scenarios, planShare,
    planAvg: wavg(planRows, "contribution"), cashAvg: wavg(cashRows, "contribution"),
    bestPerHour: best[0], worstPerHour: best[best.length - 1],
  };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["Sale type", "Patient pays", "Plan pays", "Devices and accessories", "Return allowance", "Card fee", "Plan fee", "Commission", "Clinician time", "Earns", "Margin %", "Per clinician hour", "Patient price for target"];
  const rows = a.rows.map((r) => [r.name, r.patient, r.plan, r.goods, r.returnCost, r.card, r.planFee, r.commission, r.labor, r.contribution, r.margin * 100, r.perClinicianHour, r.targetPrice ? r.targetPrice.patient : ""].map((x) => (typeof x === "number" ? x.toFixed(2) : x)));
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
