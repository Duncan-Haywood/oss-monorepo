// Horse boarding stall profit maths. Pure functions, no DOM, no network.
// Every figure is the barn owner's own input; nothing here is a market rate.

export const SAMPLE = {
  stalls: "20", occupancy: "85", boardPrice: "550", extras: "40", feed: "160", bedding: "55",
  careMin: "20", wage: "15", fixedMonth: "3000", badDebt: "3", target: "2000",
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
  const stalls = num(raw.stalls), occupancy = num(raw.occupancy), boardPrice = num(raw.boardPrice);
  const feed = num(raw.feed), fixedMonth = num(raw.fixedMonth);
  if (!(stalls >= 1 && Number.isInteger(stalls))) errors.push("Enter the number of stalls (a whole number, 1 or more).");
  if (!(occupancy > 0 && occupancy <= 100)) errors.push("Enter average occupancy as a percent (more than 0, at most 100).");
  if (!(boardPrice >= 0)) errors.push("Enter the board price per horse per month (0 or more).");
  if (!(feed >= 0)) errors.push("Enter feed and hay cost per horse per month (0 or more).");
  if (!(fixedMonth >= 0)) errors.push("Enter monthly fixed costs: mortgage or lease, insurance, utilities, repairs (0 or more).");
  const extras = opt(raw.extras, 0), bedding = opt(raw.bedding, 0), careMin = opt(raw.careMin, 0);
  const wage = opt(raw.wage, 0), badDebt = opt(raw.badDebt, 0), target = opt(raw.target, 0);
  for (const [n, v] of [["Extras per horse", extras], ["Bedding per horse", bedding], ["Care minutes per horse per day", careMin], ["Labour wage", wage], ["Profit target", target]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(badDebt >= 0 && badDebt < 50)) errors.push("Late and unpaid board must be from 0 to under 50 percent.");
  return { errors, stalls, occupancy, boardPrice, feed, fixedMonth, extras, bedding, careMin, wage, badDebt, target };
}

// One horse in a stall earns (board + extras) less unpaid share, and costs feed, bedding and the owner's labour.
function unit(p) {
  const k = 1 - p.badDebt / 100;
  const labour = (p.careMin * DAYS / 60) * p.wage;
  return { k, labour, income: (p.boardPrice + p.extras) * k, variable: p.feed + p.bedding + labour };
}
const profitAt = (p, u, horses, price = p.boardPrice) => horses * ((price + p.extras) * u.k - u.variable) - p.fixedMonth;

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const u = unit(p);
  const horses = p.stalls * p.occupancy / 100;
  const revenue = horses * u.income, variable = horses * (p.feed + p.bedding), labour = horses * u.labour;
  const profit = revenue - variable - labour - p.fixedMonth;
  const margin = u.income - u.variable;
  const breakEvenHorses = margin > 0 ? p.fixedMonth / margin : null;
  const breakEvenOcc = breakEvenHorses === null ? null : (breakEvenHorses / p.stalls) * 100;
  const priceFor = (extra) => ((p.fixedMonth + extra) / horses + u.variable) / u.k - p.extras;
  const breakEvenPrice = priceFor(0), targetPrice = priceFor(p.target);
  const labourHours = horses * p.careMin * DAYS / 60;
  const sweep = [...new Set([50, 60, 70, 80, 90, 100, p.occupancy])].sort((a, b) => a - b).map((occ) => {
    const h = p.stalls * occ / 100;
    return { occ, horses: h, revenue: round2(h * u.income), profit: round2(profitAt(p, u, h)) };
  });
  const findings = [];
  if (profit < 0) findings.push({ severity: "high", title: `The barn loses about ${dollars(-profit)} a month at ${p.occupancy}% full once your own care time is paid at ${dollars(p.wage)} an hour. Board needs to be ${dollars(breakEvenPrice)} a horse to break even.` });
  else if (profit < p.target) findings.push({ severity: "medium", title: `The barn makes about ${dollars(profit)} a month, short of your ${dollars(p.target)} target. Board needs to be ${dollars(targetPrice)} a horse at this occupancy to reach it.` });
  if (breakEvenOcc === null) findings.push({ severity: "high", title: `Each horse costs more to keep than it brings in (${dollars(margin)} a month), so filling more stalls loses more. Price or feed cost has to change before occupancy helps.` });
  else if (breakEvenOcc > 100) findings.push({ severity: "high", title: `Break-even needs ${breakEvenHorses.toFixed(1)} horses but you have ${p.stalls} stalls. Even full, the barn loses money at this price.` });
  else if (p.occupancy - breakEvenOcc < 10) findings.push({ severity: "medium", title: `Break-even is ${breakEvenOcc.toFixed(0)}% full and you run ${p.occupancy}%. A couple of empty stalls turns it into a loss.` });
  if (profit >= 0 && p.wage > 0 && p.careMin > 0) {
    const unpaid = profit + labour;
    findings.push({ severity: "info", title: `If you do the care yourself, the barn pays you about ${dollars(unpaid / labourHours)} an hour for ${labourHours.toFixed(0)} hours a month, profit and labour together.` });
  }
  findings.push({ severity: "info", title: `Each extra boarded horse adds about ${dollars(margin)} a month; each empty stall costs you that, because fixed costs run regardless.` });
  if (p.badDebt >= 5) findings.push({ severity: "info", title: `${p.badDebt}% unpaid board costs about ${dollars(horses * (p.boardPrice + p.extras) * p.badDebt / 100)} a month. Autopay and a written late-fee and notice policy protect it.` });
  return { errors: [], input: p, horses, revenue: round2(revenue), variable: round2(variable), labour: round2(labour), labourHours, profit: round2(profit), perStall: round2(profit / p.stalls), margin: round2(margin), breakEvenHorses, breakEvenOcc, breakEvenPrice: round2(breakEvenPrice), targetPrice: round2(targetPrice), findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Horse boarding: ${p.stalls} stalls, ${p.occupancy}% full (${r.horses.toFixed(1)} horses), board ${dollars(p.boardPrice)} a horse`,
    `Monthly: revenue ${dollars(r.revenue)}; feed and bedding ${dollars(r.variable)}; your care time ${dollars(r.labour)}; fixed ${dollars(p.fixedMonth)}`,
    `Profit ${dollars(r.profit)} a month (${dollars(r.perStall)} a stall)`,
    `Break-even: ${r.breakEvenOcc === null ? "not reachable at this price" : `${r.breakEvenOcc.toFixed(0)}% full`}, or board of ${dollars(r.breakEvenPrice)} at this occupancy; board for your target ${dollars(r.targetPrice)}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["occupancy_pct,horses,monthly_revenue,monthly_profit", ...r.sweep.map((x) => `${x.occ},${x.horses.toFixed(1)},${x.revenue.toFixed(2)},${x.profit.toFixed(2)}`)].join("\n");
}
