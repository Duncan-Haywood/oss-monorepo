// Mid-term rental (30+ day furnished stays) against a plain long-term lease and a nightly short-term rental, for one
// property. Everything is monthly dollars unless a name says otherwise. Pure functions, no I/O.

export const DAYS_PER_MONTH = 365 / 12;

export const DEFAULTS = {
  // costs the owner carries whichever way the unit is rented
  fixedMonthly: 1500, // mortgage interest/principal, property tax, insurance, HOA
  furnishingCost: 12000, // one-time: furniture, linens, kitchen, TVs (mid-term and short-term only)
  furnishingYears: 7,
  // long-term lease, unfurnished
  ltrRent: 1800,
  ltrVacancyPct: 5,
  ltrMgmtPct: 0,
  ltrMaintMonthly: 90,
  // mid-term, furnished, 30+ days
  mtrRate: 3200, // monthly rent for a furnished stay
  mtrStayMonths: 3,
  mtrGapDays: 10, // empty days between two stays: cleaning, re-listing, a nurse's contract ending early
  mtrUtilities: 300, // owner pays utilities and internet whether or not it is occupied
  mtrSupplies: 60,
  mtrTurnCost: 180, // deep clean and restock between stays
  mtrFeePct: 3, // platform host fee (percent of rent); 0 for a flat-fee listing site
  mtrFeeFixedMonthly: 0, // flat monthly or annual-divided listing membership
  mtrMgmtPct: 0,
  mtrInsuranceExtra: 40, // furnished rental policy over a landlord policy
  mtrMaintMonthly: 120,
  // short-term, nightly
  strAdr: 165,
  strOccPct: 62,
  strStayNights: 3.2,
  strCleanFeeCharged: 110,
  strCleanCost: 95,
  strFeePct: 3, // host-only fee; some channels charge 15% or more
  strMgmtPct: 0,
  strUtilities: 370,
  strSupplies: 180,
  strInsuranceExtra: 60,
  strMaintMonthly: 150,
  // optional guest-side check
  guestStipend: 0, // monthly housing budget the guest has (travel-contract stipend, insurance allowance); 0 = not checked
};

function num(v, d) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

export function normalise(input = {}) {
  const out = {};
  for (const [k, d] of Object.entries(DEFAULTS)) out[k] = num(input[k], d);
  out.mtrStayMonths = Math.max(0.5, out.mtrStayMonths);
  out.mtrGapDays = Math.max(0, out.mtrGapDays);
  out.strOccPct = Math.min(100, Math.max(0, out.strOccPct));
  out.strStayNights = Math.max(1, out.strStayNights);
  out.furnishingYears = Math.max(1, out.furnishingYears);
  return out;
}

const r2 = (x) => Math.round(x * 100) / 100;

export function longTerm(i) {
  const gross = i.ltrRent * (1 - i.ltrVacancyPct / 100);
  const mgmt = gross * (i.ltrMgmtPct / 100);
  const costs = mgmt + i.ltrMaintMonthly;
  const net = gross - costs;
  return { key: "ltr", name: "Long-term lease", revenue: r2(gross), operating: r2(costs), furnishing: 0, beforeFixed: r2(net), cash: r2(net - i.fixedMonthly), occupancyPct: 100 - i.ltrVacancyPct };
}

export function midTerm(i) {
  const stayDays = i.mtrStayMonths * DAYS_PER_MONTH;
  const cycle = stayDays + i.mtrGapDays;
  const occ = stayDays / cycle;
  const revenue = i.mtrRate * (i.mtrStayMonths / cycle) * DAYS_PER_MONTH; // rent for the stay, spread over the whole cycle
  const turnsPerMonth = DAYS_PER_MONTH / cycle;
  const fee = revenue * (i.mtrFeePct / 100) + i.mtrFeeFixedMonthly;
  const mgmt = revenue * (i.mtrMgmtPct / 100);
  const turn = turnsPerMonth * i.mtrTurnCost;
  const operating = fee + mgmt + turn + i.mtrUtilities + i.mtrSupplies + i.mtrInsuranceExtra + i.mtrMaintMonthly;
  const furnishing = i.furnishingCost / (i.furnishingYears * 12);
  const beforeFixed = revenue - operating - furnishing;
  return { key: "mtr", name: "Mid-term rental", revenue: r2(revenue), operating: r2(operating), furnishing: r2(furnishing), beforeFixed: r2(beforeFixed), cash: r2(beforeFixed - i.fixedMonthly), occupancyPct: r2(occ * 100), turnsPerMonth: r2(turnsPerMonth), detail: { fee: r2(fee), mgmt: r2(mgmt), turn: r2(turn) } };
}

export function shortTerm(i) {
  const nights = DAYS_PER_MONTH * (i.strOccPct / 100);
  const stays = nights / i.strStayNights;
  const revenue = nights * i.strAdr + stays * i.strCleanFeeCharged;
  const fee = revenue * (i.strFeePct / 100);
  const mgmt = revenue * (i.strMgmtPct / 100);
  const clean = stays * i.strCleanCost;
  const operating = fee + mgmt + clean + i.strUtilities + i.strSupplies + i.strInsuranceExtra + i.strMaintMonthly;
  const furnishing = i.furnishingCost / (i.furnishingYears * 12);
  const beforeFixed = revenue - operating - furnishing;
  return { key: "str", name: "Short-term rental", revenue: r2(revenue), operating: r2(operating), furnishing: r2(furnishing), beforeFixed: r2(beforeFixed), cash: r2(beforeFixed - i.fixedMonthly), occupancyPct: i.strOccPct, turnsPerMonth: r2(stays), detail: { fee: r2(fee), mgmt: r2(mgmt), turn: r2(clean) } };
}

// The net of a strategy is linear in the variable being solved for, so two evaluations give the exact crossing.
function solveLinear(f, target, x0, x1) {
  const y0 = f(x0), y1 = f(x1);
  if (y1 === y0) return null;
  const x = x0 + ((target - y0) * (x1 - x0)) / (y1 - y0);
  return Number.isFinite(x) ? x : null;
}

// Largest empty gap (days between stays) at which the mid-term still nets as much as the lease. Not linear in the gap,
// so search; null means it already loses at zero gap, Infinity-like (cap) means the gap never matters enough.
export function breakEvenGapDays(i, target) {
  const net = (g) => midTerm({ ...i, mtrGapDays: g }).beforeFixed;
  if (net(0) < target) return null;
  const cap = 365;
  if (net(cap) >= target) return cap;
  let lo = 0, hi = cap;
  for (let n = 0; n < 60; n++) {
    const mid = (lo + hi) / 2;
    if (net(mid) >= target) lo = mid; else hi = mid;
  }
  return Math.floor(lo * 10) / 10;
}

export function compare(raw) {
  const i = normalise(raw);
  const ltr = longTerm(i), mtr = midTerm(i), str = shortTerm(i);
  const strategies = [ltr, mtr, str];
  const best = strategies.reduce((a, b) => (b.cash > a.cash ? b : a));
  const target = ltr.beforeFixed;
  const advantage = r2(mtr.beforeFixed - ltr.beforeFixed);
  // before the furnishing charge, since that is the money the extra income has to earn back
  const mtrNetBeforeFurnishing = mtr.beforeFixed + mtr.furnishing;
  const extraPerMonth = mtrNetBeforeFurnishing - ltr.beforeFixed;
  const payback = i.furnishingCost > 0 && extraPerMonth > 0 ? r2(i.furnishingCost / extraPerMonth) : null;
  const rateToMatch = solveLinear((r) => midTerm({ ...i, mtrRate: r }).beforeFixed, target, 0, 10000);
  const gap = breakEvenGapDays(i, target);
  const occToMatchMtr = solveLinear((o) => shortTerm({ ...i, strOccPct: o }).beforeFixed, mtr.beforeFixed, 0, 100);
  const adrToMatchMtr = solveLinear((a) => shortTerm({ ...i, strAdr: a }).beforeFixed, mtr.beforeFixed, 0, 1000);
  const findings = [];
  if (advantage <= 0) findings.push({ level: "high", text: `At these numbers the mid-term rental nets ${money(-advantage)} a month less than the plain lease before the mortgage. It needs a monthly rate of about ${money(rateToMatch)} (you have ${money(i.mtrRate)}) or less empty time between stays to match it.` });
  else findings.push({ level: "info", text: `The mid-term rental nets ${money(advantage)} a month more than the lease after furnishing wear, utilities and turnovers.` });
  if (payback !== null) findings.push({ level: payback > i.furnishingYears * 12 ? "high" : "info", text: `The extra income pays back the ${money(i.furnishingCost)} furnishing outlay in about ${Math.round(payback)} months${payback > i.furnishingYears * 12 ? ", longer than the furniture is expected to last" : ""}.` });
  else if (i.furnishingCost > 0) findings.push({ level: "high", text: `The mid-term income does not beat the lease before furnishing costs, so the ${money(i.furnishingCost)} of furniture never pays back.` });
  if (gap !== null && gap < 365) findings.push({ level: gap < i.mtrGapDays + 7 ? "medium" : "info", text: `It keeps pace with the lease while the unit sits empty no more than about ${gap} days between stays (you assumed ${i.mtrGapDays}). One slipped booking is the usual way this goes wrong.` });
  if (gap === null) findings.push({ level: "high", text: "Even with no empty days between stays the mid-term rental does not match the lease at these numbers." });
  if (i.strOccPct > 0 && occToMatchMtr !== null) findings.push({ level: "info", text: `Nightly renting has to fill about ${r2(occToMatchMtr)}% of nights (you assumed ${i.strOccPct}%) or average about ${money(adrToMatchMtr)} a night to match the mid-term rental, and brings ${r2(str.turnsPerMonth)} cleanings a month against ${r2(mtr.turnsPerMonth)}.` });
  if (i.mtrStayMonths < 1.5) findings.push({ level: "medium", text: "Stays under about six weeks turn over often enough that cleaning and empty days start to look like a short-term rental without the nightly rate." });
  if (i.guestStipend > 0) {
    const ratio = i.mtrRate / i.guestStipend;
    findings.push(ratio <= 1 ? { level: "info", text: `Your monthly rate is ${Math.round(ratio * 100)}% of the guest's ${money(i.guestStipend)} housing budget, so it fits.` } : { level: "high", text: `Your monthly rate is ${money(i.mtrRate - i.guestStipend)} over the guest's ${money(i.guestStipend)} housing budget. A guest on a fixed stipend will pick a cheaper place or ask for a discount; ${money(i.guestStipend)} is the price at which you net ${money(midTerm({ ...i, mtrRate: i.guestStipend }).beforeFixed - target)} ${midTerm({ ...i, mtrRate: i.guestStipend }).beforeFixed - target >= 0 ? "more" : "less"} a month than the lease.` });
  }
  findings.push({ level: "info", text: "Short stays of 30 days or more are often treated differently from nightly rentals for lodging tax, zoning, tenancy rights and the lease form. Check your city and state; this page does not." });
  return { inputs: i, strategies, best: best.key, advantage, payback, rateToMatch: rateToMatch === null ? null : r2(rateToMatch), gapToMatch: gap, occToMatchMtr: occToMatchMtr === null ? null : r2(occToMatchMtr), adrToMatchMtr: adrToMatchMtr === null ? null : r2(adrToMatchMtr), findings };
}

// Mid-term monthly cash result (before the mortgage) across empty-gap days and stay lengths.
export function gapGrid(raw, gaps = [0, 5, 10, 20, 30], stays = [1, 2, 3, 6]) {
  const i = normalise(raw);
  const lease = longTerm(i).beforeFixed;
  return { gaps, stays, lease: r2(lease), cells: stays.map((s) => gaps.map((g) => r2(midTerm({ ...i, mtrStayMonths: s, mtrGapDays: g }).beforeFixed - lease))) };
}

// Monthly rate against empty days: what rate holds the mid-term level with the lease at each gap.
export function rateLadder(raw, gaps = [0, 5, 10, 20, 30]) {
  const i = normalise(raw);
  const lease = longTerm(i).beforeFixed;
  return gaps.map((g) => ({ gap: g, rate: r2(solveLinear((r) => midTerm({ ...i, mtrGapDays: g, mtrRate: r }).beforeFixed, lease, 0, 10000)) }));
}

export function money(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  const s = Math.abs(Math.round(n)).toLocaleString("en-US");
  return `${n < 0 ? "-" : ""}$${s}`;
}

export function summaryText(result) {
  const lines = ["Mid-term rental comparison (monthly, before the mortgage in the first column, after it in the second)", ""];
  for (const s of result.strategies) lines.push(`${s.name}: revenue ${money(s.revenue)}, operating ${money(s.operating)}, furnishing wear ${money(s.furnishing)}, net ${money(s.beforeFixed)}, after fixed costs ${money(s.cash)}`);
  lines.push("", ...result.findings.map((f) => `- ${f.text}`), "", "Planning estimate from the numbers entered. Not tax, legal or financial advice.");
  return lines.join("\n");
}

export function comparisonCsv(result) {
  const rows = [["strategy", "revenue_per_month", "operating_per_month", "furnishing_wear_per_month", "net_before_fixed", "net_after_fixed", "occupancy_pct"]];
  for (const s of result.strategies) rows.push([s.name, s.revenue, s.operating, s.furnishing, s.beforeFixed, s.cash, s.occupancyPct]);
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";
}
