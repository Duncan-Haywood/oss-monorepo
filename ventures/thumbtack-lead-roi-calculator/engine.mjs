// Thumbtack Lead ROI: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  leadsPerMonth: 30,
  leadPrice: 50,
  refundPct: 10,
  minutesPerLead: 20,
  hourlyValue: 40,
  closeRatePct: 20,
  jobValue: 1200,
  jobCostPct: 60,
  repeatMultiplier: 1,
};

export const INPUT_NOTES = [
  { what: "Leads per month", detail: "Paid leads you actually responded to, not the ones you ignored. Count them from your own lead history." },
  { what: "Average price per lead", detail: "Total lead charges divided by leads. Prices vary by category, job size and city, so use your own average, not a headline number." },
  { what: "Credits for bad leads", detail: "Share of lead spend refunded or credited back. Zero if you never claim; check what you really got back last month." },
  { what: "Close rate", detail: "Jobs won divided by paid leads, not by replies. Use several months of your own history; a dozen leads is noise." },
  { what: "Average job value", detail: "What the customer pays for a job you win. Use the median of jobs you really close, not your best one." },
  { what: "Job cost share", detail: "Materials, subcontractors and direct labour as a percent of job value. The rest is what a hire earns you before your own time." },
  { what: "Repeat multiplier", detail: "1 counts only the first job. 1.5 means the average new customer later brings half again as much work." },
];

const num = (v, name, { min = 0 } = {}) => {
  const n = v === "" || v == null ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number of ${min} or more.`);
  return n;
};
const r2 = (x) => Math.round(x * 100) / 100;

export function money(v) {
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}$${s}`;
}
export const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

function core(o) {
  const leads = num(o.leadsPerMonth, "Leads per month");
  const price = num(o.leadPrice, "Average price per lead");
  const refund = num(o.refundPct, "Credits for bad leads") / 100;
  const minutes = num(o.minutesPerLead, "Minutes per lead");
  const hourly = num(o.hourlyValue, "Hourly value of your time");
  const close = num(o.closeRatePct, "Close rate") / 100;
  const value = num(o.jobValue, "Average job value");
  const costShare = num(o.jobCostPct, "Job cost share") / 100;
  const mult = num(o.repeatMultiplier, "Repeat multiplier");
  if (close > 1) throw new Error("Close rate cannot be over 100%.");
  if (refund > 1) throw new Error("Credits for bad leads cannot be over 100%.");
  if (costShare >= 1) throw new Error("Job cost share must be under 100%.");
  const leadCost = price * (1 - refund);
  const timeCost = (minutes / 60) * hourly;
  const costPerLead = leadCost + timeCost;
  const profitPerHire = value * (1 - costShare) * mult;
  const hires = leads * close;
  const spend = leads * leadCost;
  const timeSpend = leads * timeCost;
  const income = hires * profitPerHire;
  const net = income - spend - timeSpend;
  return {
    leads, price, refund, minutes, hourly, close, value, costShare, mult,
    leadCost, timeCost, costPerLead, profitPerHire, hires, spend, timeSpend, income, net,
    costPerHire: close > 0 ? costPerLead / close : null,
    leadCostPerHire: close > 0 ? leadCost / close : null,
    breakEvenCloseRate: profitPerHire > 0 ? costPerLead / profitPerHire : null,
    breakEvenCloseRateLeadsOnly: profitPerHire > 0 ? leadCost / profitPerHire : null,
    // Most you can pay per lead (before credits) at this close rate before a lead loses money.
    maxLeadPrice: refund < 1 ? Math.max(0, (close * profitPerHire - timeCost) / (1 - refund)) : null,
    roi: spend + timeSpend > 0 ? net / (spend + timeSpend) : null,
  };
}

export function computeRoi(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const r = core(o);
  const scenarios = [0.5, 1, 1.5, 2].map((k) => {
    const x = core({ ...o, closeRatePct: Math.min(100, r.close * 100 * k) });
    return { factor: k, closeRatePct: r.close * 100 * k, hires: x.hires, net: x.net, current: k === 1 };
  });
  const priceScenarios = [...new Set([20, 35, 50, 75, 100, r.price])].sort((a, b) => a - b).map((p) => {
    const x = core({ ...o, leadPrice: p });
    return { price: p, leadCost: x.leadCost, breakEvenCloseRate: x.breakEvenCloseRate, net: x.net, current: p === r.price };
  });
  return { ...r, scenarios, priceScenarios };
}

export function summarize(r) {
  const verdict = r.net >= 0 ? "ok" : "warn";
  const parts = [
    `${r.leads} leads a month cost ${money(r.spend)} in lead charges and ${money(r.timeSpend)} of your time (${money(r.costPerLead)} each).`,
    `At a ${pct(r.close * 100)} close rate that is ${r2(r.hires)} jobs a month, ${r.costPerHire == null ? "with no jobs to price" : `${money(r.costPerHire)} per job won`}.`,
    `Each job earns ${money(r.profitPerHire)} after job costs, so the month nets ${money(r.net)}${r.roi == null ? "" : ` (${pct(r.roi * 100)} return on what you spend)`}.`,
  ];
  if (r.breakEvenCloseRate != null) parts.push(`You break even at a ${pct(r.breakEvenCloseRate * 100)} close rate; lead charges alone break even at ${pct(r.breakEvenCloseRateLeadsOnly * 100)}.`);
  if (r.maxLeadPrice != null) parts.push(`At your close rate a lead stops paying above about ${money(Math.floor(r.maxLeadPrice))}.`);
  return { status: verdict, text: parts.join(" ") };
}
