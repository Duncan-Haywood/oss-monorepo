// Pet waste removal route maths. Pure functions, no DOM, no network.
// Every figure is the route owner's own input; nothing here is a market rate.

export const SAMPLE = {
  clients: "40", price: "15", onsite: "8", drive: "12", costPerMile: "0.67", supplies: "0.8",
  disposal: "40", fixedMonth: "300", badDebt: "3", targetHourly: "30", targetMonthly: "3000",
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
// Weekly service: 52 visits a year over 12 months. Stated on the page.
export const VISITS_PER_MONTH = 52 / 12;
// Miles between yards are worked out from drive minutes at this average speed. Stated on the page.
export const MPH = 25;

export function parse(raw) {
  const errors = [];
  const clients = num(raw.clients), price = num(raw.price), onsite = num(raw.onsite);
  if (!(clients >= 1 && Number.isInteger(clients))) errors.push("Enter the number of weekly clients (a whole number, 1 or more).");
  if (!(price > 0)) errors.push("Enter your average price per visit (more than 0).");
  if (!(onsite > 0)) errors.push("Enter minutes on site per yard (more than 0).");
  const drive = opt(raw.drive, 0), costPerMile = opt(raw.costPerMile, 0), supplies = opt(raw.supplies, 0);
  const disposal = opt(raw.disposal, 0), fixedMonth = opt(raw.fixedMonth, 0), badDebt = opt(raw.badDebt, 0);
  const targetHourly = opt(raw.targetHourly, 0), targetMonthly = opt(raw.targetMonthly, 0);
  for (const [n, v] of [["Drive minutes", drive], ["Cost per mile", costPerMile], ["Supplies per visit", supplies], ["Disposal per month", disposal], ["Fixed costs", fixedMonth], ["Hourly target", targetHourly], ["Monthly target", targetMonthly]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(badDebt >= 0 && badDebt < 50)) errors.push("Late and unpaid invoices must be from 0 to under 50 percent.");
  return { errors, clients, price, onsite, drive, costPerMile, supplies, disposal, fixedMonth, badDebt, targetHourly, targetMonthly };
}

// One visit: income after unpaid share, less supplies and the fuel and wear of the drive to the next yard.
function visitEconomics(p, drive = p.drive) {
  const k = 1 - p.badDebt / 100;
  const miles = drive * MPH / 60;
  const cost = p.supplies + miles * p.costPerMile;
  return { k, miles, cost, minutes: p.onsite + drive, margin: p.price * k - cost };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const v = visitEconomics(p);
  const visits = p.clients * VISITS_PER_MONTH;
  const monthlyFixed = p.fixedMonth + p.disposal;
  const hours = visits * v.minutes / 60;
  const revenue = visits * p.price * v.k;
  const profit = visits * v.margin - monthlyFixed;
  const hourly = profit / hours;
  const clientMargin = VISITS_PER_MONTH * v.margin;
  const breakEvenClients = clientMargin > 0 ? monthlyFixed / clientMargin : null;
  const clientsForTarget = clientMargin > 0 && p.targetMonthly > 0 ? (monthlyFixed + p.targetMonthly) / clientMargin : null;
  const priceFor = (perHour) => ((perHour * hours + monthlyFixed) / visits + v.cost) / v.k;
  const priceForTarget = p.targetHourly > 0 ? priceFor(p.targetHourly) : null;
  const sweep = [...new Set([3, 5, 8, 10, 15, 20, 30, p.drive])].sort((a, b) => a - b).map((d) => {
    const e = visitEconomics(p, d);
    const h = visits * e.minutes / 60;
    const pr = visits * e.margin - monthlyFixed;
    return { drive: d, hours: round2(h), profit: round2(pr), hourly: round2(pr / h) };
  });
  const findings = [];
  if (profit < 0) findings.push({ severity: "high", title: `The route loses about ${dollars(-profit)} a month at ${p.clients} clients. Each client leaves ${dollars(clientMargin)} a month after supplies and driving, which does not cover ${dollars(monthlyFixed)} of fixed costs and disposal.` });
  if (v.margin <= 0) findings.push({ severity: "high", title: `Each visit costs more than it brings in (${dollars(v.margin)}). Adding clients loses more. Raise the price or cut the drive between yards.` });
  else if (p.targetHourly > 0 && hourly < p.targetHourly) findings.push({ severity: "medium", title: `The route pays you about ${dollars(hourly)} an hour of work including driving, short of your ${dollars(p.targetHourly)} target. Price per visit would need to be ${dollars(priceForTarget)} at this route.` });
  if (breakEvenClients !== null && p.clients - breakEvenClients < 5 && profit >= 0) findings.push({ severity: "medium", title: `Break-even is ${breakEvenClients.toFixed(1)} clients and you have ${p.clients}. Losing a few cancellations in a month turns it into a loss.` });
  if (v.margin > 0 && p.drive > 0) {
    const driveShare = (p.drive / v.minutes) * 100;
    if (driveShare >= 40) findings.push({ severity: "medium", title: `${driveShare.toFixed(0)}% of each visit is driving. Clients clustered in the same neighbourhoods raise your hourly pay more than a price rise of the same size.` });
  }
  findings.push({ severity: "info", title: `Each client adds about ${dollars(clientMargin)} a month and about ${(VISITS_PER_MONTH * v.minutes / 60).toFixed(1)} hours of work.` });
  if (clientsForTarget !== null) findings.push({ severity: "info", title: `To reach ${dollars(p.targetMonthly)} a month at this price and route you need about ${Math.ceil(clientsForTarget)} clients and ${(clientsForTarget * VISITS_PER_MONTH * v.minutes / 60).toFixed(0)} hours of work a month.` });
  return { errors: [], input: p, visits, hours, revenue: round2(revenue), profit: round2(profit), hourly: round2(hourly), perVisit: round2(v.margin), clientMargin: round2(clientMargin), breakEvenClients, clientsForTarget, priceForTarget: priceForTarget === null ? null : round2(priceForTarget), findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Pet waste route: ${p.clients} weekly clients at ${dollars(p.price)} a visit, ${p.onsite} min on site plus ${p.drive} min driving`,
    `Monthly: ${r.visits.toFixed(0)} visits, ${r.hours.toFixed(1)} hours of work, revenue ${dollars(r.revenue)}, profit ${dollars(r.profit)}`,
    `Pay for your time: ${dollars(r.hourly)} an hour including driving`,
    `Break-even: ${r.breakEvenClients === null ? "not reachable at this price" : `${r.breakEvenClients.toFixed(1)} clients`}${r.priceForTarget === null ? "" : `; price for ${dollars(p.targetHourly)} an hour: ${dollars(r.priceForTarget)} a visit`}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["drive_minutes,hours_per_month,monthly_profit,hourly_pay", ...r.sweep.map((x) => `${x.drive},${x.hours.toFixed(2)},${x.profit.toFixed(2)},${x.hourly.toFixed(2)}`)].join("\n");
}
