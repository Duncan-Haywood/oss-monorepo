// Short-term-rental arbitrage maths: lease a unit, furnish it, sublet it by the night. Pure functions, no DOM, no network.
// Every figure is the operator's own input; nothing here is a market rate or a forecast.

export const SAMPLE = {
  rent: "2200", utilities: "250", otherMonthly: "150", deposit: "2200", furnish: "9000", setup: "800", resalePct: "30",
  adr: "165", occ: "68", avgStay: "3.2", cleaningFee: "95", turnCost: "70", varNight: "4", platformPct: "15.5",
  leaseMonths: "12", rampMonths: "2", rampPct: "50",
};

export const DAYS_PER_MONTH = 365 / 12;

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const round2 = (n) => Math.round(n * 100) / 100;

export function parse(raw) {
  const errors = [];
  const rent = num(raw.rent), adr = num(raw.adr), occ = num(raw.occ);
  if (!(rent > 0)) errors.push("Enter the monthly rent you pay the landlord (more than 0).");
  if (!(adr > 0)) errors.push("Enter your average nightly rate (more than 0).");
  if (!(occ >= 0 && occ <= 100)) errors.push("Enter occupancy as a percent of nights booked (0 to 100).");
  const utilities = opt(raw.utilities, 0), otherMonthly = opt(raw.otherMonthly, 0), deposit = opt(raw.deposit, 0);
  const furnish = opt(raw.furnish, 0), setup = opt(raw.setup, 0), resalePct = opt(raw.resalePct, 0);
  const avgStay = opt(raw.avgStay, 3), cleaningFee = opt(raw.cleaningFee, 0), turnCost = opt(raw.turnCost, 0);
  const varNight = opt(raw.varNight, 0), platformPct = opt(raw.platformPct, 0);
  const leaseMonths = opt(raw.leaseMonths, 12), rampMonths = opt(raw.rampMonths, 0), rampPct = opt(raw.rampPct, 100);
  for (const [n, v] of [["Utilities and internet", utilities], ["Other monthly costs", otherMonthly], ["Security deposit", deposit], ["Furnishing cost", furnish], ["Other setup cost", setup], ["Cleaning fee charged", cleaningFee], ["Cost per turnover", turnCost], ["Supplies per night", varNight]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(resalePct >= 0 && resalePct <= 100)) errors.push("Furniture resale value is a percent of its cost, 0 to 100.");
  if (!(avgStay >= 1)) errors.push("Average stay must be 1 night or more.");
  if (!(platformPct >= 0 && platformPct < 50)) errors.push("Booking commission must be from 0 to under 50 percent.");
  if (!(leaseMonths >= 1 && leaseMonths <= 120 && Number.isInteger(leaseMonths))) errors.push("Months left on the lease must be a whole number from 1 to 120.");
  if (!(rampMonths >= 0 && rampMonths <= leaseMonths && Number.isInteger(rampMonths))) errors.push("Ramp-up months must be a whole number from 0 up to the months left on the lease.");
  if (!(rampPct >= 0 && rampPct <= 100)) errors.push("Occupancy during ramp-up is a percent of your steady figure, 0 to 100.");
  return { errors, rent, adr, occ, utilities, otherMonthly, deposit, furnish, setup, resalePct, avgStay, cleaningFee, turnCost, varNight, platformPct, leaseMonths, rampMonths, rampPct };
}

// Each month's occupancy as a share of the steady figure: ramp months first, then steady.
export function monthFactors(p) {
  return Array.from({ length: p.leaseMonths }, (_, i) => (i < p.rampMonths ? p.rampPct / 100 : 1));
}

// One month at a given occupancy (percent) and nightly rate.
function month(p, { occ = p.occ, adr = p.adr, rent = p.rent } = {}) {
  const k = 1 - p.platformPct / 100;
  const nights = DAYS_PER_MONTH * occ / 100;
  const stays = nights / p.avgStay;
  const lodging = nights * adr, cleaning = stays * p.cleaningFee;
  const guest = lodging + cleaning;
  const commission = guest * (1 - k);
  const variable = stays * p.turnCost + nights * p.varNight;
  const fixed = rent + p.utilities + p.otherMonthly;
  return { nights, stays, lodging, cleaning, guest, commission, variable, fixed, profit: guest - commission - variable - fixed };
}

// What each occupied night leaves after commission, turnover and supplies (linear in occupancy).
function perNight(p, adr = p.adr) {
  const k = 1 - p.platformPct / 100;
  return (adr + p.cleaningFee / p.avgStay) * k - p.turnCost / p.avgStay - p.varNight;
}

// Total cash over the lease: monthly profit with ramp, minus furnishing and setup, plus resale. Deposit returned, so left out.
function leaseTotal(p, opts = {}) {
  const f = monthFactors(p);
  const occ = opts.occ ?? p.occ;
  let total = 0;
  for (const share of f) total += month(p, { ...opts, occ: occ * share }).profit;
  return total - p.furnish - p.setup + p.furnish * p.resalePct / 100;
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const steady = month(p);
  const factors = monthFactors(p);
  const startup = p.furnish + p.setup;
  const cashAtRisk = startup + p.deposit;
  const resale = p.furnish * p.resalePct / 100;
  const c = perNight(p);
  const fixed = steady.fixed;
  const N = DAYS_PER_MONTH;
  const beNights = c > 0 ? fixed / c : null;
  const breakEvenOcc = beNights === null ? null : (beNights / N) * 100;
  const beReachable = breakEvenOcc !== null && breakEvenOcc <= 100;
  const S = factors.reduce((a, b) => a + b, 0);
  // Steady occupancy at which the whole lease nets zero. Profit is linear in occupancy, so this is closed form.
  const leaseNeed = fixed * p.leaseMonths + startup - resale;
  const leaseOcc = c > 0 && S > 0 ? (leaseNeed / (c * N * S)) * 100 : null;
  const leaseOccReachable = leaseOcc !== null && leaseOcc <= 100;
  // Nightly rate at which the lease nets zero and at which a steady month breaks even, at the entered occupancy.
  const rateFor = (need, shares) => {
    const q = (p.occ / 100) * N * shares;
    if (!(q > 0)) return null;
    return (need / q + p.turnCost / p.avgStay + p.varNight) / (1 - p.platformPct / 100) - p.cleaningFee / p.avgStay;
  };
  const leaseRate = rateFor(leaseNeed, S);
  const monthRate = rateFor(fixed, 1);

  // Payback: first month the running total of profit covers furnishing and setup (resale not counted until the end).
  let run = -startup, paybackMonth = null;
  const path = [];
  for (let i = 0; i < p.leaseMonths; i++) {
    run += month(p, { occ: p.occ * factors[i] }).profit;
    path.push(round2(run));
    if (paybackMonth === null && run >= 0) paybackMonth = i + 1;
  }
  const netLease = leaseTotal(p);
  const annualSteady = steady.profit * 12;
  const cashOnCash = cashAtRisk > 0 ? annualSteady / cashAtRisk : null;
  const worstMonth = Math.min(...path.map((v, i) => v - (i ? path[i - 1] : -startup)));
  const trough = Math.min(-startup, ...path);

  const sweep = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2].map((scale) => {
    const occ = Math.min(100, p.occ * scale);
    const m = month(p, { occ });
    return { scale, occ, monthly: round2(m.profit), lease: round2(leaseTotal(p, { occ })) };
  });
  const rentSweep = [0, 5, 10, 15, 20].map((pct) => {
    const rent = p.rent * (1 + pct / 100);
    const m = month(p, { rent });
    return { pct, rent: round2(rent), monthly: round2(m.profit), lease: round2(leaseTotal(p, { rent })) };
  });

  const findings = [];
  if (steady.profit < 0) findings.push({ severity: "high", title: `At steady occupancy the unit loses about ${whole(-steady.profit)} a month (${whole(-annualSteady)} a year) before any ramp-up.${monthRate !== null && monthRate > p.adr ? ` The nightly rate would need to be about ${whole(monthRate)} to break even at ${p.occ}% occupancy.` : ""}` });
  if (c <= 0) findings.push({ severity: "high", title: "Each occupied night costs more in commission, turnovers and supplies than it brings in, so more bookings lose more. Check the nightly rate against turnover cost and commission." });
  else if (!beReachable) findings.push({ severity: "high", title: `Break-even needs ${breakEvenOcc.toFixed(0)}% occupancy, which cannot happen. The rent, the rate or the costs have to change, not the bookings.` });
  if (netLease < 0 && steady.profit >= 0) findings.push({ severity: "high", title: `Monthly profit is positive, but over the ${p.leaseMonths} months left it does not earn back the ${whole(startup)} spent on furnishing and setup (net ${whole(netLease)} after resale).${leaseOcc !== null && leaseOccReachable ? ` It needs about ${leaseOcc.toFixed(0)}% steady occupancy.` : ""}` });
  else if (netLease < 0) findings.push({ severity: "high", title: `Over the ${p.leaseMonths} months left the lease nets ${whole(netLease)} including the ${whole(startup)} of furnishing and setup.` });
  if (paybackMonth !== null && paybackMonth > Math.ceil(p.leaseMonths * 0.5)) findings.push({ severity: "medium", title: `Furnishing and setup are not earned back until month ${paybackMonth} of ${p.leaseMonths}. Anything that delays bookings or ends the lease early leaves you short.` });
  if (c > 0 && fixed / Math.max(steady.guest, 1e-9) > 0.5) findings.push({ severity: "medium", title: `Rent, utilities and other fixed costs take ${((fixed / steady.guest) * 100).toFixed(0)}% of guest revenue. A slow month still owes all of it.` });
  if (p.occ > 80) findings.push({ severity: "medium", title: `${p.occ}% occupancy is an optimistic planning figure for a unit that has not yet been listed. Check it against booked nights at comparable listings.` });
  if (p.occ > 0 && breakEvenOcc !== null && beReachable && p.occ < breakEvenOcc * 1.15) findings.push({ severity: "medium", title: `Your occupancy is within 15% of break-even (${breakEvenOcc.toFixed(0)}%). A few empty weeks turn the month negative.` });
  if (p.deposit > 0) findings.push({ severity: "info", title: `The ${whole(p.deposit)} deposit is cash at risk but is not counted as a cost, because it comes back at the end of the lease if nothing is deducted. Total cash tied up: ${whole(cashAtRisk)}.` });
  findings.push({ severity: "info", title: `Check that your lease and local rules allow short-term subletting before you spend anything. Many leases forbid it, and many cities require a permit or a registration number. This tool does not know either.` });
  if (p.platformPct >= 5) findings.push({ severity: "info", title: `${p.platformPct}% commission takes about ${whole(steady.commission)} a month. Every booking taken directly keeps that share.` });
  if (!findings.some((f) => f.severity !== "info")) findings.push({ severity: "info", title: `At these figures the unit covers its costs and earns back its startup spend with about ${whole(netLease)} left over across the lease.` });

  return {
    errors: [], input: p, steady, startup, cashAtRisk, resale, perNight: c, breakEvenOcc, beReachable, leaseOcc, leaseOccReachable, leaseRate, monthRate,
    paybackMonth, netLease, annualSteady, cashOnCash, trough, worstMonth, path,
    totals: { guest: round2(steady.guest), commission: round2(steady.commission), variable: round2(steady.variable), fixed: round2(fixed), profit: round2(steady.profit), nights: round2(steady.nights), stays: round2(steady.stays) },
    findings, sweep, rentSweep,
  };
}

export function summaryText(r) {
  const p = r.input, t = r.totals;
  const mo = (n) => (n === null ? "not within the lease" : `month ${n}`);
  return [
    `Rental arbitrage: rent ${whole(p.rent)} a month + ${whole(p.utilities)} utilities + ${whole(p.otherMonthly)} other; ${p.leaseMonths} months left on the lease`,
    `Steady month at ${p.occ}% occupancy and ${dollars(p.adr)} a night: ${t.nights.toFixed(1)} nights, ${t.stays.toFixed(1)} stays`,
    `Guest revenue ${whole(t.guest)}; commission ${whole(t.commission)}; turnovers and supplies ${whole(t.variable)}; fixed ${whole(t.fixed)}`,
    `Profit per steady month ${whole(t.profit)} (${whole(r.annualSteady)} a year)`,
    `Startup spend ${whole(r.startup)} (furnishing ${whole(p.furnish)} + setup ${whole(p.setup)}); deposit ${whole(p.deposit)} returned; cash tied up ${whole(r.cashAtRisk)}`,
    `Furnishing and setup earned back by: ${mo(r.paybackMonth)}. Net over the lease after resale: ${whole(r.netLease)}`,
    `Break-even occupancy ${r.breakEvenOcc === null ? "not reachable at this rate" : `${r.breakEvenOcc.toFixed(0)}%${r.beReachable ? "" : " (above 100%, so not reachable)"}`}; occupancy needed to net zero over the lease: ${r.leaseOcc === null ? "n/a" : `${r.leaseOcc.toFixed(0)}%`}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["occupancy_vs_plan_pct,occupancy_pct,profit_per_month,net_over_lease",
    ...r.sweep.map((x) => `${Math.round(x.scale * 100)},${x.occ.toFixed(1)},${x.monthly.toFixed(2)},${x.lease.toFixed(2)}`)].join("\n");
}
