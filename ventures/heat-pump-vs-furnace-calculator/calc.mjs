// Heat pump vs gas furnace for a homeowner replacing a furnace (and optionally
// an air conditioner): compares year-by-year running cost and up-front cost of
// "new gas furnace + new AC" against "one heat pump", and reports payback,
// lifetime saving, NPV, IRR, the running-cost break-even COP and how the answer
// moves under other prices and efficiencies. Deterministic and local. Pre-tax;
// incentives are a dollar amount the user enters.

export const KWH_PER_THERM = 29.3071;
export const YEARS_MAX = 30;

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const blank = (v) => String(v ?? "").trim() === "";
const opt = (v, dflt = 0) => (blank(v) ? dflt : parseNum(v));

export function irr(flows) {
  const npv = (rate) => flows.reduce((a, f, t) => a + f / Math.pow(1 + rate, t), 0);
  let lo = -0.9, hi = 1;
  if (!(npv(lo) > 0 && npv(hi) < 0)) return null;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// Heat the house needs, in kWh, from the gas the furnace burns now.
export const heatDeliveredKwh = (therms, afue) => therms * KWH_PER_THERM * afue;

// p: { therms, afue, gasPrice, gasFixedYear, cop, elecPrice, coolKwh, coolSave,
//      baselineCapex, hpCapex, incentives, extraWork, omBase, omHp,
//      gasEsc, elecEsc, years, discount } with percents as 0..1.
export function simulate(p) {
  const delivered = heatDeliveredKwh(p.therms, p.afue);
  const upfront = p.hpCapex + p.extraWork - p.incentives - p.baselineCapex; // extra cash the heat pump needs
  const flows = [-upfront];
  const rows = [];
  let cum = -upfront, payback = cum >= 0 ? 0 : null;
  for (let y = 1; y <= p.years; y++) {
    const ge = Math.pow(1 + p.gasEsc, y - 1), ee = Math.pow(1 + p.elecEsc, y - 1);
    const gas = p.therms * p.gasPrice * ge + p.gasFixedYear * ge + p.coolKwh * p.elecPrice * ee + p.omBase;
    const hp = (delivered / p.cop) * p.elecPrice * ee + p.coolKwh * (1 - p.coolSave) * p.elecPrice * ee + p.omHp;
    const net = gas - hp;
    const prev = cum;
    cum += net;
    if (payback === null && cum >= 0) payback = y - 1 + (net > 0 ? -prev / net : 0);
    flows.push(net);
    rows.push({ year: y, gas, hp, net, cumulative: cum });
  }
  const npv = flows.reduce((a, f, t) => a + f / Math.pow(1 + p.discount, t), 0);
  return { rows, flows, payback, npv, irr: irr(flows), gain: cum, upfront, year1: rows[0].net, gas1: rows[0].gas, hp1: rows[0].hp };
}

// Year-1 heating-only cost per million BTU delivered, and the seasonal COP at
// which the heat pump's heating cost equals the furnace's (gas fixed fee counted).
export function heatingCosts(p) {
  const delivered = heatDeliveredKwh(p.therms, p.afue);
  const mmbtu = delivered * 3412.14 / 1e6;
  const gasHeat = p.therms * p.gasPrice + p.gasFixedYear;
  return {
    mmbtu,
    gasPerMmbtu: mmbtu > 0 ? gasHeat / mmbtu : 0,
    hpPerMmbtu: mmbtu > 0 ? (delivered / p.cop * p.elecPrice) / mmbtu : 0,
    breakevenCop: gasHeat > 0 ? (delivered * p.elecPrice) / gasHeat : null,
  };
}

function parseInput(raw) {
  const o = {};
  const req = (key, name, max) => {
    const v = parseNum(raw[key]);
    return v > 0 && v <= max ? { v } : { error: `Enter ${name}, above zero and up to ${max}.` };
  };
  for (const [key, name, max] of [["therms", "the therms of gas you burn for heating in a year", 5000], ["gasPrice", "your gas price per therm", 10], ["elecPrice", "your electricity price per kWh", 2], ["cop", "the heat pump's average seasonal COP", 6], ["hpCapex", "the heat pump quote", 200000]]) {
    const r = req(key, name, max);
    if (r.error) return r;
    o[key] = r.v;
  }
  const num = (key, name, dflt, max = Infinity) => {
    const v = opt(raw[key], dflt);
    if (!(v >= 0 && v <= max)) return { error: `${name} must be a number between 0 and ${max === Infinity ? "any amount" : max}, or blank.` };
    return { v };
  };
  for (const [key, name, dflt, max] of [["afue", "Furnace efficiency (AFUE), percent", 95, 100], ["gasFixedMonth", "Monthly gas connection fee you would stop paying", 0], ["furnaceCost", "New gas furnace installed cost", 0], ["acCost", "New air conditioner installed cost", 0], ["incentives", "Heat pump incentives and rebates", 0], ["extraWork", "Extra work the heat pump needs (panel, ducts, backup heat)", 0], ["coolKwh", "Yearly cooling electricity with a new AC, kWh", 0], ["coolSave", "Cooling electricity a heat pump saves versus that AC, percent", 10, 60], ["omBase", "Yearly maintenance, gas system", 0], ["omHp", "Yearly maintenance, heat pump", 0], ["gasEsc", "Yearly gas price increase, percent", 3, 20], ["elecEsc", "Yearly electricity price increase, percent", 3, 20], ["years", "Years to compare", 15, YEARS_MAX], ["discount", "Discount rate, percent", 4, 30]]) {
    const r = num(key, name, dflt, max);
    if (r.error) return r;
    o[key] = r.v;
  }
  if (o.afue < 50) return { error: "Furnace efficiency (AFUE) should be between 50 and 100 percent." };
  if (o.years < 1) return { error: "Years to compare must be at least 1." };
  if (o.furnaceCost + o.acCost <= 0) return { error: "Enter what a new gas furnace (and air conditioner, if you would replace it) would cost. That is what the heat pump is compared with." };
  return { p: { therms: o.therms, afue: o.afue / 100, gasPrice: o.gasPrice, gasFixedYear: o.gasFixedMonth * 12, cop: o.cop, elecPrice: o.elecPrice, coolKwh: o.coolKwh, coolSave: o.coolSave / 100, baselineCapex: o.furnaceCost + o.acCost, hpCapex: o.hpCapex, incentives: o.incentives, extraWork: o.extraWork, omBase: o.omBase, omHp: o.omHp, gasEsc: o.gasEsc / 100, elecEsc: o.elecEsc / 100, years: Math.round(o.years), discount: o.discount / 100 } };
}

export function analyze(raw) {
  const r = parseInput(raw);
  if (r.error) return r;
  const p = r.p;
  const base = simulate(p);
  const costs = heatingCosts(p);
  const scenarios = [
    ["Your assumptions", p],
    ["Cold-climate performance: COP 2.0", { ...p, cop: 2.0 }],
    ["Heat pump 20% more efficient than assumed", { ...p, cop: p.cop * 1.2 }],
    ["Electricity 25% more expensive", { ...p, elecPrice: p.elecPrice * 1.25 }],
    ["Gas 25% more expensive", { ...p, gasPrice: p.gasPrice * 1.25 }],
    ["Gas 25% cheaper", { ...p, gasPrice: p.gasPrice * 0.75 }],
    ["No incentives", { ...p, incentives: 0 }],
  ].map(([label, q]) => ({ label, ...simulate(q) }));
  const findings = [];
  const yearsTxt = (v) => (v === null ? "not reached" : v.toFixed(1) + " years");
  findings.push({ severity: "info", title: base.payback === null ? `The heat pump does not pay back within ${p.years} years` : base.payback === 0 ? "The heat pump costs no more up front than the gas system" : `Payback against a new furnace and AC in about ${base.payback.toFixed(1)} years`, detail: `The heat pump needs $${money(Math.max(base.upfront, 0))} more cash up front than the gas system${base.upfront < 0 ? " (it costs less)" : ""}. Year-1 running cost is $${money(base.hp1)} against $${money(base.gas1)}, a difference of $${money(base.year1)}. Over ${p.years} years the cumulative difference is $${money(base.gain)} (before tax).` });
  findings.push({ severity: "info", title: `Heat costs $${costs.gasPerMmbtu.toFixed(1)} vs $${costs.hpPerMmbtu.toFixed(1)} per million BTU delivered`, detail: `Gas at $${p.gasPrice.toFixed(2)}/therm and ${Math.round(p.afue * 100)}% AFUE against electricity at $${p.elecPrice.toFixed(3)}/kWh and COP ${p.cop}. The heat pump's running cost matches gas at a seasonal COP of ${costs.breakevenCop === null ? "n/a" : costs.breakevenCop.toFixed(2)}; above that it is cheaper to run.` });
  if (costs.breakevenCop !== null && p.cop < costs.breakevenCop) findings.push({ severity: "medium", title: "On these prices the heat pump costs more to run than gas", detail: `Its COP of ${p.cop} is below the break-even ${costs.breakevenCop.toFixed(2)}. It can still make sense with a big cooling saving, incentives or a low quote, but the heating bill will not fall.` });
  if (p.cop > 3.5) findings.push({ severity: "medium", title: `COP ${p.cop} is optimistic for a whole heating season`, detail: "Rated efficiencies are measured in mild conditions. Seasonal averages are lower where winters are cold, and backup heat lowers them further. Use the COP 2.0 row for a cautious case." });
  if (p.coolKwh === 0) findings.push({ severity: "info", title: "No cooling electricity entered", detail: "If you would buy a new air conditioner anyway, enter its cost and yearly kWh: the heat pump replaces both, which is where most of the up-front gap closes." });
  if (p.gasFixedYear === 0) findings.push({ severity: "info", title: "Gas connection fee assumed to continue", detail: "If the heat pump lets you cap the gas line (no gas stove, water heater or dryer left), the monthly connection fee is a saving. Enter it to include it." });
  return { p, base, costs, scenarios, findings };
}

export function sampleInput() {
  return { therms: "700", afue: "95", gasPrice: "1.6", gasFixedMonth: "0", elecPrice: "0.15", cop: "2.8", furnaceCost: "6500", acCost: "6500", hpCapex: "16000", incentives: "2000", extraWork: "0", coolKwh: "2000", coolSave: "10", omBase: "150", omHp: "150", gasEsc: "3", elecEsc: "3", years: "15", discount: "4" };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const rows = [["Year", "Gas system running cost", "Heat pump running cost", "Yearly difference", "Cumulative including up-front difference"]];
  for (const r of a.base.rows) rows.push([r.year, round2(r.gas), round2(r.hp), round2(r.net), round2(r.cumulative)]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
