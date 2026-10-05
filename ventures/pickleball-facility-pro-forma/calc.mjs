// Indoor pickleball (or padel) facility pro-forma. Pure functions, no DOM, no
// imports. Arithmetic on figures the user types: courts, hours, rates,
// utilization, memberships, other revenue, costs, debt service and ramp-up. It
// ships no market data (rates, rents, wages, occupancy) as fact.

export const WEEKS_PER_MONTH = 52 / 12;
export const DAYPARTS = ["peak", "offPeak", "weekend"];
export const CURVE_MONTHS = 24;
const SEARCH_MONTHS = 120;

// key: [default, min, max, label]. The defaults describe a blank-ish sheet, not
// a typical facility: only structural settings carry a non-zero default.
export const FIELD_SPECS = Object.freeze({
  courts: [0, 0, 200, "Courts"],
  buildOutCost: [0, 0, 1e9, "Build-out / lease-up cost"],
  loanProceeds: [0, 0, 1e9, "Part of the build-out financed by debt"],
  peakHours: [0, 0, 168, "Peak hours open per week"],
  offPeakHours: [0, 0, 168, "Off-peak hours open per week"],
  weekendHours: [0, 0, 168, "Weekend hours open per week"],
  peakRate: [0, 0, 1e5, "Peak rate per court-hour"],
  offPeakRate: [0, 0, 1e5, "Off-peak rate per court-hour"],
  weekendRate: [0, 0, 1e5, "Weekend rate per court-hour"],
  peakUtil: [0, 0, 100, "Peak utilization %"],
  offPeakUtil: [0, 0, 100, "Off-peak utilization %"],
  weekendUtil: [0, 0, 100, "Weekend utilization %"],
  members: [0, 0, 1e6, "Members"],
  memberFee: [0, 0, 1e5, "Member monthly fee"],
  memberHours: [0, 0, 744, "Court-hours per member per month"],
  leagueRevenue: [0, 0, 1e8, "League revenue per month"],
  lessonRevenue: [0, 0, 1e8, "Lesson revenue per month"],
  eventRevenue: [0, 0, 1e8, "Event revenue per month"],
  proShopSales: [0, 0, 1e8, "Pro-shop / F&B sales per month"],
  proShopMarginPct: [0, 0, 100, "Pro-shop / F&B margin %"],
  staffMonthly: [0, 0, 1e8, "Staff per month"],
  rentMonthly: [0, 0, 1e8, "Rent per month"],
  utilitiesMonthly: [0, 0, 1e8, "Utilities per month"],
  insuranceMonthly: [0, 0, 1e8, "Insurance per month"],
  otherMonthly: [0, 0, 1e8, "Other fixed costs per month"],
  feePct: [3, 0, 100, "Software and processing fee %"],
  debtServiceMonthly: [0, 0, 1e8, "Debt service per month"],
  rampMonths: [6, 0, 60, "Ramp-up months"],
  rampStartPct: [30, 0, 100, "Revenue in month 1 as % of steady state"],
});

export const DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(FIELD_SPECS).map(([k, s]) => [k, s[0]])));

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Turns raw form values into numbers, or says which field is wrong.
export function normalize(opts = {}) {
  const values = {}, errors = [], warnings = [];
  for (const [key, [def, min, max, label]] of Object.entries(FIELD_SPECS)) {
    const n = num(opts[key], def);
    if (!Number.isFinite(n)) { errors.push(`${label} is not a number.`); values[key] = def; continue; }
    if (n < min || n > max) { errors.push(`${label} must be between ${min} and ${max}.`); values[key] = def; continue; }
    values[key] = n;
  }
  if (values.courts !== Math.floor(values.courts)) {
    values.courts = Math.floor(values.courts);
    warnings.push("Courts was rounded down to a whole number.");
  }
  if (values.rampMonths !== Math.floor(values.rampMonths)) values.rampMonths = Math.floor(values.rampMonths);
  if (values.members !== Math.floor(values.members)) values.members = Math.floor(values.members);
  return { values, errors, warnings };
}

const cap = (v, d) => v.courts * v[d + "Hours"] * WEEKS_PER_MONTH;

// One steady-state month. `v` must already be normalized.
export function steadyState(v) {
  const warnings = [];
  const capacity = {}, booked = {};
  let capTotal = 0, bookedTotal = 0;
  for (const d of DAYPARTS) {
    capacity[d] = cap(v, d);
    booked[d] = capacity[d] * (v[d + "Util"] / 100);
    capTotal += capacity[d];
    bookedTotal += booked[d];
  }
  if (v.courts === 0) warnings.push("No courts: there is no court time to sell, so court and membership revenue are zero.");
  else if (capTotal === 0) warnings.push("No hours open: there is no court time to sell.");

  const members = v.courts > 0 ? v.members : 0;
  const memberDemand = members * v.memberHours;
  let memberCourtHours = memberDemand;
  let capped = false;
  if (memberDemand > capTotal + 1e-9) {
    memberCourtHours = capTotal;
    capped = true;
    warnings.push(`Members want ${round1(memberDemand)} court-hours a month but the courts only offer ${round1(capTotal)}. Member play is capped at capacity, nothing is left to sell by the hour, and dues are still counted, so expect members to leave or complain.`);
  }
  let occupied, payToPlay = { peak: 0, offPeak: 0, weekend: 0 };
  if (memberCourtHours >= bookedTotal - 1e-9) {
    occupied = memberCourtHours;
    if (memberCourtHours > bookedTotal + 1e-9 && !capped) {
      warnings.push(`Member play (${round1(memberCourtHours)} court-hours) is more than the booked hours your utilization implies (${round1(bookedTotal)}), so utilization is treated as higher and no hourly play is left to sell.`);
    }
  } else {
    occupied = bookedTotal;
    for (const d of DAYPARTS) payToPlay[d] = booked[d] * (1 - memberCourtHours / bookedTotal);
  }

  const courtRevenue = DAYPARTS.reduce((s, d) => s + payToPlay[d] * v[d + "Rate"], 0);
  const membershipRevenue = members * v.memberFee;
  const programRevenue = v.leagueRevenue + v.lessonRevenue + v.eventRevenue;
  const proShopProfit = (v.proShopSales * v.proShopMarginPct) / 100;
  const feeBase = courtRevenue + membershipRevenue + programRevenue;
  const processing = (feeBase * v.feePct) / 100;
  const revenue = feeBase + proShopProfit;
  const fixedCosts = v.staffMonthly + v.rentMonthly + v.utilitiesMonthly + v.insuranceMonthly + v.otherMonthly;
  const opex = fixedCosts + processing;
  const noi = revenue - opex;
  const cash = noi - v.debtServiceMonthly;
  const courtAndDues = courtRevenue + membershipRevenue;
  return {
    capacity, booked, capTotal, bookedTotal, members, memberCourtHours, memberCapped: capped,
    payToPlayHours: payToPlay, occupiedHours: occupied,
    utilization: capTotal > 0 ? occupied / capTotal : 0,
    courtRevenue, membershipRevenue, programRevenue, proShopProfit, feeBase, processing, revenue,
    fixedCosts, opex, noi, debt: v.debtServiceMonthly, cash,
    revPerAvailableCourtHour: capTotal > 0 ? courtAndDues / capTotal : null,
    revPerBookedCourtHour: occupied > 0 ? courtAndDues / occupied : null,
    warnings,
  };
}

const round1 = (x) => Math.round(x * 10) / 10;

// Fraction of steady-state revenue earned in month m (1-based).
export function rampFactor(m, rampMonths, rampStartPct) {
  if (rampMonths <= 0) return 1;
  const start = rampStartPct / 100;
  return Math.min(1, start + (1 - start) * (m / rampMonths));
}

// Month 0 is the cash put in; months 1.. follow the ramp. Fixed costs and debt
// service run from month 1, revenue and the percentage fee ramp up.
export function cashCurve(v, ss, months = SEARCH_MONTHS) {
  const ownCash = Math.max(0, v.buildOutCost - v.loanProceeds);
  const rows = [{ month: 0, revenue: 0, opex: 0, noi: 0, debt: 0, cash: -ownCash, cumulative: -ownCash }];
  let cum = -ownCash;
  for (let m = 1; m <= months; m++) {
    const f = rampFactor(m, v.rampMonths, v.rampStartPct);
    const revenue = ss.revenue * f;
    const opex = ss.fixedCosts + ss.processing * f;
    const noi = revenue - opex;
    const cash = noi - v.debtServiceMonthly;
    cum += cash;
    rows.push({ month: m, factor: f, revenue, opex, noi, debt: v.debtServiceMonthly, cash, cumulative: cum });
  }
  return rows;
}

// Smallest uniform scale on the utilization shape at which monthly cash after
// debt service is zero. Returns the resulting overall utilization (0-1), or
// null when even full courts cannot cover the costs.
export function breakEvenUtilization(v) {
  const shape = DAYPARTS.map((d) => v[d + "Util"]);
  const flat = shape.every((u) => u === 0);
  const base = flat ? [1, 1, 1] : shape;
  const kMax = 100 / Math.max(...base);
  const at = (k) => {
    const o = { ...v };
    DAYPARTS.forEach((d, i) => { o[d + "Util"] = Math.min(100, base[i] * k); });
    return steadyState(o);
  };
  if (at(kMax).cash < 0) return null;
  const lo0 = at(0);
  if (lo0.cash >= 0) return lo0.utilization;
  let lo = 0, hi = kMax;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).cash >= 0) hi = mid; else lo = mid;
  }
  return at(hi).utilization;
}

// Smallest whole number of members at which monthly cash after debt service
// is zero, other inputs fixed. Null if no member count up to capacity gets there.
export function breakEvenMembers(v) {
  const capTotal = DAYPARTS.reduce((s, d) => s + cap(v, d), 0);
  if (v.courts === 0) return null;
  const limit = v.memberHours > 0 ? Math.min(100000, Math.ceil(capTotal / v.memberHours)) : 5000;
  for (let n = 0; n <= limit; n++) {
    if (steadyState({ ...v, members: n }).cash >= 0) return n;
  }
  return null;
}

const tweak = (v, patch) => ({ ...v, ...patch });
const clampPct = (x) => Math.max(0, Math.min(100, x));

export function utilizationRateGrid(v, utilDeltas = [-20, -10, 0, 10, 20], rateDeltas = [-20, -10, 0, 10, 20]) {
  return utilDeltas.map((du) => ({
    utilDelta: du,
    cells: rateDeltas.map((dr) => {
      const o = tweak(v, {
        peakUtil: clampPct(v.peakUtil + du), offPeakUtil: clampPct(v.offPeakUtil + du), weekendUtil: clampPct(v.weekendUtil + du),
        peakRate: v.peakRate * (1 + dr / 100),
      });
      const s = steadyState(o);
      return { rateDelta: dr, peakRate: o.peakRate, cash: s.cash, noi: s.noi };
    }),
  }));
}

export function membershipGrid(v, feeDeltas = [-20, -10, 0, 10, 20], countFactors = [0.5, 0.75, 1, 1.25, 1.5]) {
  return feeDeltas.map((df) => ({
    feeDelta: df,
    memberFee: v.memberFee * (1 + df / 100),
    cells: countFactors.map((cf) => {
      const members = Math.round(v.members * cf);
      const s = steadyState(tweak(v, { memberFee: v.memberFee * (1 + df / 100), members }));
      return { countFactor: cf, members, cash: s.cash, noi: s.noi };
    }),
  }));
}

// What raises profit most: move each input +/-10% on its own and see annual NOI.
const LEVERS = [
  ["peakRate", "Peak hourly rate"], ["offPeakRate", "Off-peak hourly rate"], ["weekendRate", "Weekend hourly rate"],
  ["peakUtil", "Peak utilization"], ["offPeakUtil", "Off-peak utilization"], ["weekendUtil", "Weekend utilization"],
  ["memberFee", "Member monthly fee"], ["members", "Member count"], ["memberHours", "Court-hours per member"],
  ["leagueRevenue", "League revenue"], ["lessonRevenue", "Lesson revenue"], ["eventRevenue", "Event revenue"],
  ["proShopSales", "Pro-shop / F&B sales"], ["proShopMarginPct", "Pro-shop / F&B margin"],
  ["staffMonthly", "Staff cost"], ["rentMonthly", "Rent"], ["utilitiesMonthly", "Utilities"],
  ["insuranceMonthly", "Insurance"], ["otherMonthly", "Other fixed costs"], ["feePct", "Software and processing fee"],
  ["hours", "Hours open (all dayparts)"],
];
const LIMIT = { peakUtil: 100, offPeakUtil: 100, weekendUtil: 100, proShopMarginPct: 100, feePct: 100 };

function scaled(v, key, f) {
  if (key === "hours") return tweak(v, { peakHours: v.peakHours * f, offPeakHours: v.offPeakHours * f, weekendHours: v.weekendHours * f });
  const x = v[key] * f;
  return tweak(v, { [key]: LIMIT[key] ? Math.min(LIMIT[key], x) : x });
}

export function rankLevers(v, step = 10) {
  const base = steadyState(v).noi * 12;
  const f = step / 100;
  const rows = [];
  for (const [key, label] of LEVERS) {
    if (key === "hours" ? v.peakHours + v.offPeakHours + v.weekendHours === 0 : v[key] === 0) continue;
    const up = steadyState(scaled(v, key, 1 + f)).noi * 12 - base;
    const down = steadyState(scaled(v, key, 1 - f)).noi * 12 - base;
    const swing = Math.abs(up - down);
    rows.push({
      key, label, up, down, swing,
      elasticity: Math.abs(base) > 1e-6 ? (up - down) / 2 / base / f : null,
    });
  }
  rows.sort((a, b) => b.swing - a.swing || a.label.localeCompare(b.label));
  return rows;
}

export function analyze(opts = {}) {
  const { values: v, errors, warnings } = normalize(opts);
  if (errors.length) return { error: errors[0], errors };
  const ss = steadyState(v);
  const curveAll = cashCurve(v, ss);
  const curve = curveAll.slice(0, CURVE_MONTHS + 1);
  let monthsToCashBreakeven = null;
  for (const row of curveAll.slice(1)) { if (row.cumulative >= 0) { monthsToCashBreakeven = row.month; break; } }
  const peakCashDrawdown = Math.max(0, -Math.min(...curve.map((r) => r.cumulative)));
  const annualNoi = ss.noi * 12;
  const buildOutPaybackYears = v.buildOutCost > 0 && annualNoi > 0 ? v.buildOutCost / annualNoi : null;
  const result = {
    options: v,
    steady: ss,
    ownCash: Math.max(0, v.buildOutCost - v.loanProceeds),
    annual: { revenue: ss.revenue * 12, opex: ss.opex * 12, noi: annualNoi, debt: ss.debt * 12, cash: ss.cash * 12 },
    revPerAvailableCourtHour: ss.revPerAvailableCourtHour,
    revPerBookedCourtHour: ss.revPerBookedCourtHour,
    breakEvenUtilization: breakEvenUtilization(v),
    breakEvenMembers: breakEvenMembers(v),
    curve,
    monthsToCashBreakeven,
    peakCashDrawdown,
    buildOutPaybackYears,
    utilRate: utilizationRateGrid(v),
    membership: membershipGrid(v),
    levers: rankLevers(v),
    warnings: [...warnings, ...ss.warnings],
  };
  if (v.loanProceeds > v.buildOutCost) result.warnings.push("Debt-financed amount is more than the build-out cost, so your own cash in is treated as zero.");
  if (ss.cash < 0 && v.courts > 0) result.warnings.push("At these inputs the facility loses money every month after debt service, even at steady state.");
  result.verdict = verdict(result);
  return result;
}

function verdict(r) {
  const o = r.options;
  if (o.courts === 0) return "Enter a court count and hours to see a P&L.";
  const m = money(r.steady.noi), c = money(r.steady.cash);
  const bits = [`At steady state the inputs give ${m} a month of operating income and ${c} after debt service.`];
  if (r.monthsToCashBreakeven === null) bits.push(`Cumulative cash does not turn positive within ${SEARCH_MONTHS} months on these figures.`);
  else bits.push(`Cumulative cash turns positive in month ${r.monthsToCashBreakeven}, after a peak drawdown of ${money(r.peakCashDrawdown)} in the first ${CURVE_MONTHS} months.`);
  bits.push("This is arithmetic on your figures, not a forecast.");
  return bits.join(" ");
}

export function sampleInputs() {
  return {
    courts: 8, buildOutCost: 750000, loanProceeds: 450000,
    peakHours: 25, offPeakHours: 60, weekendHours: 24,
    peakRate: 48, offPeakRate: 28, weekendRate: 42,
    peakUtil: 70, offPeakUtil: 22, weekendUtil: 60,
    members: 80, memberFee: 79, memberHours: 5,
    leagueRevenue: 3000, lessonRevenue: 2500, eventRevenue: 1500,
    proShopSales: 5000, proShopMarginPct: 30,
    staffMonthly: 15000, rentMonthly: 18000, utilitiesMonthly: 4000, insuranceMonthly: 1500, otherMonthly: 1500,
    feePct: 3, debtServiceMonthly: 6500, rampMonths: 9, rampStartPct: 30,
  };
}

const f2 = (x) => (x === null || x === undefined ? "" : (Math.round(x * 100) / 100).toFixed(2));

export function reportCsv(r) {
  const s = r.steady;
  const out = [["Line", "Per month at steady state"]];
  out.push(["Pay-to-play court revenue", f2(s.courtRevenue)]);
  out.push(["Membership dues", f2(s.membershipRevenue)]);
  out.push(["League, lesson and event revenue", f2(s.programRevenue)]);
  out.push(["Pro-shop / F&B gross profit", f2(s.proShopProfit)]);
  out.push(["Total revenue", f2(s.revenue)]);
  out.push(["Fixed operating costs", f2(s.fixedCosts)]);
  out.push(["Software and processing fees", f2(s.processing)]);
  out.push(["Net operating income", f2(s.noi)]);
  out.push(["Debt service", f2(s.debt)]);
  out.push(["Cash after debt service", f2(s.cash)]);
  out.push([]);
  out.push(["Revenue per available court-hour", f2(r.revPerAvailableCourtHour)]);
  out.push(["Break-even utilization", r.breakEvenUtilization === null ? "" : (r.breakEvenUtilization * 100).toFixed(1) + "%"]);
  out.push(["Break-even members", r.breakEvenMembers === null ? "" : r.breakEvenMembers]);
  out.push(["Months to cash break-even", r.monthsToCashBreakeven === null ? "" : r.monthsToCashBreakeven]);
  out.push(["Peak cash drawdown", f2(r.peakCashDrawdown)]);
  out.push([]);
  out.push(["Month", "Revenue", "Operating costs", "Debt service", "Cash", "Cumulative cash"]);
  for (const c of r.curve) out.push([c.month, f2(c.revenue), f2(c.opex), f2(c.debt), f2(c.cash), f2(c.cumulative)]);
  const q = (c) => { const t = String(c); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v === null || v === undefined ? "n/a" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (v, d = 1) => (v === null || v === undefined ? "n/a" : (v * 100).toFixed(d) + "%");
export const yrs = (v) => (v === null || v === undefined ? "never" : v.toFixed(1) + " years");
export const months = (v) => (v === null || v === undefined ? "not within 10 years" : "month " + v);
