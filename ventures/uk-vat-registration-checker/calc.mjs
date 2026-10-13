// UK VAT: do I have to register, by when, and is the Flat Rate Scheme worth it?
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Rules written from memory without network access (registration threshold 90,000
// since 1 April 2024; deregistration 88,000; Flat Rate Scheme entry at 150,000 expected
// taxable turnover). The page tells the reader to confirm on GOV.UK. Not tax advice.

export const VAT_YEAR = "2026/27";
export const R = {
  registerThreshold: 90000,
  deregisterThreshold: 88000,
  frsEntry: 150000,
  frsLeave: 230000,
  standardRate: 0.2,
  frsFirstYearDiscount: 0.01,
  limitedCostRate: 0.165,
  limitedCostPct: 0.02,
  limitedCostFloor: 1000,
};

// Flat Rate Scheme percentages by trade sector (VAT-inclusive turnover), per GOV.UK table.
export const FRS_SECTORS = [
  { id: "consulting", label: "Management consultancy", rate: 0.14 },
  { id: "accounting", label: "Accountancy or book-keeping", rate: 0.145 },
  { id: "law", label: "Legal or notarial services", rate: 0.145 },
  { id: "computer", label: "Computer or IT consultancy, data processing", rate: 0.145 },
  { id: "advertising", label: "Advertising", rate: 0.11 },
  { id: "architect", label: "Architect, civil and structural engineer, surveyor", rate: 0.145 },
  { id: "labour", label: "Labour-only building or construction", rate: 0.145 },
  { id: "building", label: "General building or construction with materials", rate: 0.095 },
  { id: "hairdressing", label: "Hairdressing or other beauty treatment", rate: 0.13 },
  { id: "retail", label: "Retailing (not food, tobacco, newspapers)", rate: 0.075 },
  { id: "catering", label: "Catering, including restaurants and takeaways", rate: 0.125 },
  { id: "transport", label: "Transport or storage, including couriers", rate: 0.1 },
  { id: "repairs", label: "Repairing personal or household goods", rate: 0.1 },
  { id: "other", label: "Other activities not listed elsewhere", rate: 0.12 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (y, m) => `${MONTHS[m]} ${y}`;
const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

// months: array of 12 monthly taxable turnover figures, oldest first, ending at endYear/endMonth (0-11).
export function parseMonths(text) {
  return String(text ?? "").split(/[\s,;]+/).filter(Boolean).map(Number);
}

function addMonths(y, m, n) {
  const t = y * 12 + m + n;
  return [Math.floor(t / 12), ((t % 12) + 12) % 12];
}

// Registration: tested at the end of each month on turnover of the last 12 months.
// Liable month = first month-end where the rolling 12 months exceeds the threshold.
// Must tell HMRC within 30 days of the end of that month; registered from the 1st of the
// month after next (the second month after the month it was exceeded) or earlier by agreement.
export function check(input) {
  const errors = [];
  const months = Array.isArray(input.months) ? input.months.map(num) : parseMonths(input.months);
  const endYear = num(input.endYear);
  const endMonth = num(input.endMonth);
  const next30 = num(input.next30 ?? 0);
  if (months.length < 1 || months.length > 36) errors.push("Enter between 1 and 36 months of taxable turnover, oldest first.");
  if (months.some((x) => !Number.isFinite(x) || x < 0)) errors.push("Every monthly figure must be a number of zero or more.");
  if (!Number.isInteger(endYear) || endYear < 2020 || endYear > 2040) errors.push("Final month's year must be between 2020 and 2040.");
  if (!Number.isInteger(endMonth) || endMonth < 0 || endMonth > 11) errors.push("Final month must be January to December.");
  if (!Number.isFinite(next30) || next30 < 0) errors.push("Expected turnover in the next 30 days must be zero or more.");
  if (errors.length) return { ok: false, errors };

  const n = months.length;
  const rolling = [];
  for (let i = 0; i < n; i++) {
    const [y, m] = addMonths(endYear, endMonth, i - (n - 1));
    const from = Math.max(0, i - 11);
    const sum = months.slice(from, i + 1).reduce((a, b) => a + b, 0);
    rolling.push({ y, m, label: monthLabel(y, m), month: months[i], rolling: sum, full: i - from === 11 });
  }
  const last = rolling[n - 1];
  const breach = rolling.find((r) => r.rolling > R.registerThreshold);
  const findings = [];
  let status;
  let deadline = null;
  let effective = null;
  if (breach) {
    deadline = deadlineDate(breach.y, breach.m);
    const [ey, em] = addMonths(breach.y, breach.m, 2);
    effective = `1 ${monthLabel(ey, em)}`;
    status = "registration-due";
    findings.push({ severity: "high", title: `Rolling 12-month turnover first passed £${R.registerThreshold.toLocaleString("en-GB")} at the end of ${breach.label}`, detail: `You had ${money(breach.rolling)} in the 12 months to then. Tell HMRC within 30 days of that month-end (${deadline}). VAT registration takes effect from ${effective}, or earlier if you agree a date with HMRC. If that date has passed, register now and ask HMRC about a late-registration penalty; do not wait.` });
    if (!breach.full) findings.push({ severity: "medium", title: "Fewer than 12 months entered at that point", detail: "The figure above only counts the months you gave. If you traded earlier, add those months: the true 12-month total is higher or equal." });
  } else if (next30 > R.registerThreshold) {
    status = "forward-look";
  } else if (last.rolling > R.registerThreshold * 0.85) {
    status = "close";
  } else {
    status = "below";
  }
  if (next30 > R.registerThreshold && !breach) {
    findings.push({ severity: "high", title: "The 30-day forward test applies", detail: `You expect more than £${R.registerThreshold.toLocaleString("en-GB")} of taxable turnover in the next 30 days alone. You must register by the end of those 30 days, and the registration takes effect from the day you realised, not from a month-end.` });
  }
  if (status === "close") findings.push({ severity: "medium", title: "Within about 15% of the threshold", detail: `Rolling 12-month turnover is ${money(last.rolling)}; the threshold is £${R.registerThreshold.toLocaleString("en-GB")}. The test is run every month, not once a year, so one large invoice can trip it. Re-test at each month-end.` });
  if (status === "below") findings.push({ severity: "info", title: "Not required to register on these figures", detail: "You can still register voluntarily, which lets you reclaim VAT on costs. That helps if your customers are VAT-registered businesses and hurts if they are consumers." });
  findings.push({ severity: "info", title: "What counts as turnover", detail: "Taxable turnover means standard, reduced and zero-rated sales. Exempt sales (for example most insurance, education, and some health services) and outside-the-scope income do not count. Check the category of what you sell." });

  const headroom = R.registerThreshold - last.rolling;
  return { ok: true, status, rolling, last, breach: breach || null, deadline, effective, headroom, next30, findings, errors: [] };
}

function money(n) { return `£${Math.round(n).toLocaleString("en-GB")}`; }
function deadlineDate(y, m) {
  const d = new Date(Date.UTC(y, m + 1, 0));
  d.setUTCDate(d.getUTCDate() + 30);
  return `${d.getUTCDate()} ${monthLabel(d.getUTCFullYear(), d.getUTCMonth())}`;
}

// Flat Rate Scheme vs standard accounting for a year.
// turnover: yearly VAT-exclusive taxable sales. costs: yearly VAT-exclusive purchases
// of standard-rated goods and services you could reclaim under standard accounting.
// goodsCost: of those, the part that is goods (limited cost trader test).
export function frsCompare(input) {
  const errors = [];
  const turnover = num(input.turnover);
  const costs = num(input.costs);
  const goodsCost = num(input.goodsCost ?? 0);
  const sector = FRS_SECTORS.find((s) => s.id === input.sector);
  const firstYear = input.firstYear === "yes" || input.firstYear === true;
  if (!Number.isFinite(turnover) || turnover < 0) errors.push("Yearly turnover must be zero or more.");
  if (!Number.isFinite(costs) || costs < 0) errors.push("Yearly VAT-able costs must be zero or more.");
  if (!Number.isFinite(goodsCost) || goodsCost < 0) errors.push("Goods cost must be zero or more.");
  if (Number.isFinite(costs) && Number.isFinite(goodsCost) && goodsCost > costs) errors.push("Goods cost cannot exceed total costs.");
  if (!sector) errors.push("Choose a trade sector.");
  if (errors.length) return { ok: false, errors };

  const grossTurnover = turnover * (1 + R.standardRate);
  const outputVat = turnover * R.standardRate;
  const inputVat = costs * R.standardRate;
  const standardPay = outputVat - inputVat;
  const limitedCost = goodsCost < Math.max(R.limitedCostFloor, grossTurnover * R.limitedCostPct);
  let rate = limitedCost ? R.limitedCostRate : sector.rate;
  if (firstYear) rate = Math.max(0, rate - R.frsFirstYearDiscount);
  const frsPay = grossTurnover * rate;
  const diff = standardPay - frsPay;
  const findings = [];
  if (turnover > R.frsEntry) findings.push({ severity: "high", title: "Above the Flat Rate Scheme entry limit", detail: `The scheme is open if you expect taxable turnover of £${R.frsEntry.toLocaleString("en-GB")} or less in the next 12 months. Above it, standard accounting applies.` });
  if (limitedCost) findings.push({ severity: "medium", title: "Limited cost trader rate applies", detail: `Spending on goods is under 2% of VAT-inclusive turnover (or under £${R.limitedCostFloor.toLocaleString("en-GB")} a year), so the flat rate is ${(R.limitedCostRate * 100).toFixed(1)}% regardless of your sector. Service businesses with few materials usually fall here, which removes most of the scheme's benefit.` });
  findings.push({ severity: "info", title: diff > 0 ? "Flat Rate Scheme pays less VAT" : "Standard accounting pays less VAT", detail: diff > 0 ? `You would pay about ${money(diff)} less VAT a year, and you cannot reclaim VAT on purchases except single capital assets over £2,000 including VAT.` : `Standard accounting leaves you about ${money(-diff)} better off a year because you reclaim VAT on your costs.` });
  return { ok: true, turnover, grossTurnover, outputVat, inputVat, standardPay, rate, limitedCost, frsPay, diff, findings, errors: [] };
}

export function summaryText(input, r, f) {
  const lines = [`UK VAT registration check (${VAT_YEAR} rules)`];
  lines.push(`Status: ${r.status}`);
  lines.push(`Rolling 12-month taxable turnover at ${r.last.label}: ${money(r.last.rolling)} (threshold £${R.registerThreshold.toLocaleString("en-GB")})`);
  if (r.breach) lines.push(`Threshold first passed at end of ${r.breach.label}; tell HMRC by ${r.deadline}; registered from ${r.effective}`);
  else lines.push(`Headroom: ${money(r.headroom)}`);
  if (f && f.ok) lines.push(`Flat Rate Scheme at ${(f.rate * 100).toFixed(1)}%: pay ${money(f.frsPay)} vs standard ${money(f.standardPay)} a year`);
  lines.push("Estimate only. Not tax advice. Confirm on GOV.UK.");
  return lines.join("\n");
}

export const SAMPLE = {
  months: "6000 6500 7000 7200 7500 7800 8000 8200 8400 8600 9000 9300",
  endYear: "2026",
  endMonth: "8",
  next30: "0",
  turnover: "84000",
  costs: "6000",
  goodsCost: "1500",
  sector: "consulting",
  firstYear: "no",
};
