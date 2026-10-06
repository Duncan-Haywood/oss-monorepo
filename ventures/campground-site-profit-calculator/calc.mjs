// Campground / RV park site profit maths. Pure functions, no DOM, no network.
// Every figure is the owner's own input; nothing here is a market rate.

export const SAMPLE = {
  sites: "40", openMonths: "6", occupancy: "55", nightly: "48", avgStay: "2.5", stayFee: "6",
  varNight: "4", turnMin: "15", wage: "16", platformPct: "8", fixedYear: "120000", target: "40000",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;
const DAYS = 30.4;

export function parse(raw) {
  const errors = [];
  const sites = num(raw.sites), openMonths = num(raw.openMonths), occupancy = num(raw.occupancy);
  const nightly = num(raw.nightly), fixedYear = num(raw.fixedYear);
  if (!(sites >= 1 && Number.isInteger(sites))) errors.push("Enter the number of sites (a whole number, 1 or more).");
  if (!(openMonths > 0 && openMonths <= 12)) errors.push("Enter months open per year (more than 0, at most 12).");
  if (!(occupancy > 0 && occupancy <= 100)) errors.push("Enter average occupancy while open as a percent (more than 0, at most 100).");
  if (!(nightly >= 0)) errors.push("Enter the nightly rate per site (0 or more).");
  if (!(fixedYear >= 0)) errors.push("Enter yearly fixed costs: mortgage or lease, insurance, property tax, repairs, insurance (0 or more).");
  const avgStay = opt(raw.avgStay, 2), stayFee = opt(raw.stayFee, 0), varNight = opt(raw.varNight, 0);
  const turnMin = opt(raw.turnMin, 0), wage = opt(raw.wage, 0), platformPct = opt(raw.platformPct, 0), target = opt(raw.target, 0);
  if (!(avgStay >= 1)) errors.push("Average stay must be 1 night or more.");
  for (const [n, v] of [["Fee per stay", stayFee], ["Cost per occupied night", varNight], ["Turnover minutes per stay", turnMin], ["Labour wage", wage], ["Profit target", target]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(platformPct >= 0 && platformPct < 50)) errors.push("Booking commission must be from 0 to under 50 percent.");
  return { errors, sites, openMonths, occupancy, nightly, fixedYear, avgStay, stayFee, varNight, turnMin, wage, platformPct, target };
}

// One occupied site-night earns the nightly rate plus its share of the per-stay fee, less commission,
// and costs utilities and supplies plus its share of the turnover labour.
function unit(p) {
  const k = 1 - p.platformPct / 100;
  const labour = (p.turnMin / 60) * p.wage / p.avgStay;
  return { k, labour, feeShare: p.stayFee / p.avgStay, income: (p.nightly + p.stayFee / p.avgStay) * k, variable: p.varNight + labour };
}
const profitAt = (p, u, nights) => nights * (u.income - u.variable) - p.fixedYear;

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const u = unit(p);
  const available = p.sites * p.openMonths * DAYS;
  const nights = available * p.occupancy / 100;
  const stays = nights / p.avgStay;
  const revenue = nights * u.income, variable = nights * p.varNight, labour = nights * u.labour;
  const profit = revenue - variable - labour - p.fixedYear;
  const margin = u.income - u.variable;
  const breakEvenNights = margin > 0 ? p.fixedYear / margin : null;
  const breakEvenOcc = breakEvenNights === null ? null : (breakEvenNights / available) * 100;
  const rateFor = (extra) => ((p.fixedYear + extra) / nights + u.variable) / u.k - u.feeShare;
  const breakEvenRate = rateFor(0), targetRate = rateFor(p.target);
  const sweep = [...new Set([30, 40, 50, 60, 70, 80, 90, p.occupancy])].sort((a, b) => a - b).map((occ) => {
    const n = available * occ / 100;
    return { occ, nights: Math.round(n), revenue: round2(n * u.income), profit: round2(profitAt(p, u, n)) };
  });
  const findings = [];
  if (profit < 0) findings.push({ severity: "high", title: `The campground loses about ${dollars(-profit)} a year at ${p.occupancy}% full while open. The nightly rate needs to be ${dollars(breakEvenRate)} to break even.` });
  else if (profit < p.target) findings.push({ severity: "medium", title: `The campground makes about ${dollars(profit)} a year, short of your ${dollars(p.target)} target. The nightly rate needs to be ${dollars(targetRate)} at this occupancy to reach it.` });
  if (breakEvenOcc === null) findings.push({ severity: "high", title: `Each occupied night costs more than it brings in (${dollars(margin)}), so more bookings lose more. Rate or costs have to change before occupancy helps.` });
  else if (breakEvenOcc > 100) findings.push({ severity: "high", title: `Break-even needs ${Math.round(breakEvenNights)} occupied nights but only ${Math.round(available)} exist in a season. Even full, the campground loses money at this rate.` });
  else if (p.occupancy - breakEvenOcc < 10) findings.push({ severity: "medium", title: `Break-even is ${breakEvenOcc.toFixed(0)}% full and you run ${p.occupancy}%. One rainy month can turn it into a loss.` });
  findings.push({ severity: "info", title: `Each extra occupied night adds about ${dollars(margin)}; each night a site sits empty costs you that, because fixed costs run regardless.` });
  findings.push({ severity: "info", title: `Fixed costs are spread over ${p.openMonths} open month(s): about ${dollars(p.fixedYear / p.openMonths)} a month while open.` });
  if (p.platformPct >= 5 && nights > 0) findings.push({ severity: "info", title: `${p.platformPct}% booking commission costs about ${dollars(nights * (p.nightly + u.feeShare) * p.platformPct / 100)} a year. Direct bookings through your own page or phone keep it.` });
  return { errors: [], input: p, available, nights, stays, revenue: round2(revenue), variable: round2(variable), labour: round2(labour), profit: round2(profit), perSite: round2(profit / p.sites), margin: round2(margin), breakEvenNights, breakEvenOcc, breakEvenRate: round2(breakEvenRate), targetRate: round2(targetRate), findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Campground: ${p.sites} sites, ${p.openMonths} months open, ${p.occupancy}% full (${Math.round(r.nights)} occupied nights), ${dollars(p.nightly)} a night`,
    `Yearly: revenue ${dollars(r.revenue)}; utilities and supplies ${dollars(r.variable)}; turnover labour ${dollars(r.labour)}; fixed ${dollars(p.fixedYear)}`,
    `Profit ${dollars(r.profit)} a year (${dollars(r.perSite)} a site)`,
    `Break-even: ${r.breakEvenOcc === null ? "not reachable at this rate" : `${r.breakEvenOcc.toFixed(0)}% full`}, or a nightly rate of ${dollars(r.breakEvenRate)} at this occupancy; rate for your target ${dollars(r.targetRate)}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["occupancy_pct,occupied_nights,yearly_revenue,yearly_profit", ...r.sweep.map((x) => `${x.occ},${x.nights},${x.revenue.toFixed(2)},${x.profit.toFixed(2)}`)].join("\n");
}
