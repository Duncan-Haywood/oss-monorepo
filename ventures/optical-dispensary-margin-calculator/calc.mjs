// Optical dispensary margin: what each kind of eyeglass sale earns once frame, lenses, remakes, plan fees, card fees and the
// optician's time are counted, which sale types use an optician hour best, the patient price that reaches a target margin,
// and how many sales a month cover fixed costs. Arithmetic on the numbers the user types; every value is an input.

export const ROWS = 5;
export const ROW_FIELDS = ["name", "patient", "plan", "frame", "lens", "coat", "mins", "perMonth"];

export const GLOBAL_DEFAULTS = {
  cardPct: "2.6", cardFixed: "0.10", planFee: "3", remake: "6", remakeMins: "20", adjust: "4", wage: "22", burden: "12",
  fixedMonth: "14000", target: "55",
};
const ROW_DEFAULTS = [
  ["Cash single vision", "189", "0", "38", "14", "9", "25", "20"],
  ["Plan sale, standard lenses", "95", "120", "48", "22", "11", "30", "70"],
  ["Progressive, plan plus upgrades", "310", "140", "64", "96", "22", "40", "40"],
  ["Designer frame, cash", "420", "0", "135", "40", "22", "35", "15"],
  ["Low-reimbursement plan, basic", "0", "70", "22", "12", "0", "25", "25"],
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
    cardPct: [0, 10, "Card fee (%)"], cardFixed: [0, 2, "Card fee per sale ($)"], planFee: [0, 30, "Plan claim fee (%)"],
    remake: [0, 50, "Remake and warranty rate (%)"], remakeMins: [0, 240, "Minutes per remake"], adjust: [0, 200, "Free adjustments and repairs per sale ($)"],
    wage: [0, 150, "Optician wage ($/hour)"], burden: [0, 60, "Payroll taxes and extras (%)"], fixedMonth: [0, 1e7, "Fixed costs ($/month)"],
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
    const r = { name: name || `Sale type ${i}` };
    const rspec = {
      patient: [0, 20000, "patient pays ($)"], plan: [0, 20000, "plan pays ($)"], frame: [0, 5000, "frame cost ($)"],
      lens: [0, 5000, "lens lab cost ($)"], coat: [0, 2000, "coatings and extras cost ($)"], mins: [1, 600, "optician minutes"], perMonth: [0, 100000, "sales per month"],
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

// Per-sale economics for one sale type under the given globals. `over` can override any global, plus frameMult, planMult.
export function saleEconomics(v, r, over = {}) {
  const g = { ...v, ...over };
  const labRate = g.wage * (1 + g.burden / 100);
  const patient = r.patient;
  const plan = r.plan * (over.planMult ?? 1);
  const collected = patient + plan;
  const frame = r.frame * (over.frameMult ?? 1);
  const goods = frame + r.lens + r.coat;
  const remakeCost = (g.remake / 100) * (r.lens + r.coat + (g.remakeMins / 60) * labRate);
  const card = patient > 0 ? patient * (g.cardPct / 100) + g.cardFixed : 0;
  const planFee = plan * (g.planFee / 100);
  const labor = (r.mins / 60) * labRate;
  const beforeLabor = collected - goods - remakeCost - card - planFee - g.adjust;
  const contribution = beforeLabor - labor;
  return { collected, patient, plan, goods, remakeCost, card, planFee, adjust: g.adjust, labor, beforeLabor, contribution, margin: collected > 0 ? contribution / collected : 0, perOpticianHour: (beforeLabor * 60) / r.mins };
}

// Total collected at which contribution reaches the target share, then the patient's share of it given what the plan pays.
// Null when the card fee and target leave no room.
export function patientPriceForTarget(v, r) {
  const labRate = v.wage * (1 + v.burden / 100);
  const room = 1 - v.target / 100 - v.cardPct / 100;
  if (room <= 0) return null;
  const K = r.frame + r.lens + r.coat + (v.remake / 100) * (r.lens + r.coat + (v.remakeMins / 60) * labRate) + (r.mins / 60) * labRate + v.adjust + v.cardFixed;
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
    ["Frame wholesale cost up 10%", { frameMult: 1.1 }],
    ["Plan reimbursements cut 10%", { planMult: 0.9 }],
    ["Remake rate up 3 points", { remake: v.remake + 3 }],
    ["Optician wage up $2 an hour", { wage: v.wage + 2 }],
  ].map(([label, over]) => {
    const s = totals(v, over);
    return { label, profitMonth: s.profitMonth, change: s.profitMonth - t.profitMonth };
  });
  const lowMargin = rows.filter((r) => r.margin < v.target / 100);
  if (lowMargin.length) warnings.push(`${lowMargin.map((r) => r.name).join(", ")} ${lowMargin.length === 1 ? "is" : "are"} below your ${v.target}% target margin after labor.`);
  const losing = rows.filter((r) => r.contribution < 0);
  if (losing.length) warnings.push(`${losing.map((r) => r.name).join(", ")} lose${losing.length === 1 ? "s" : ""} money on every sale after goods, fees and optician time.`);
  if (t.profitMonth < 0) warnings.push("At these volumes the practice loses money each month before owner pay: contribution does not cover fixed costs.");
  warnings.push("Labor here is only the optician time you enter for each sale. Idle hours, exams and the doctor's time belong in fixed costs. Prices, plan payments and volumes are your numbers, not benchmarks.");
  const best = [...rows].sort((a, b) => b.perOpticianHour - a.perOpticianHour);
  return {
    ok: true, warnings, v, rows, totals: t, breakEvenSales, avgContribution, scenarios, planShare,
    planAvg: wavg(planRows, "contribution"), cashAvg: wavg(cashRows, "contribution"),
    bestPerHour: best[0], worstPerHour: best[best.length - 1],
  };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["Sale type", "Patient pays", "Plan pays", "Goods", "Remake allowance", "Card fee", "Plan fee", "Optician time", "Earns", "Margin %", "Per optician hour", "Patient price for target"];
  const rows = a.rows.map((r) => [r.name, r.patient, r.plan, r.goods, r.remakeCost, r.card, r.planFee, r.labor, r.contribution, r.margin * 100, r.perOpticianHour, r.targetPrice ? r.targetPrice.patient : ""].map((x) => (typeof x === "number" ? x.toFixed(2) : x)));
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
