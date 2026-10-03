// Upwork Connects ROI: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  proposalsPerMonth: 40,
  connectsPerProposal: 12,
  connectPrice: 0.15,
  minutesPerProposal: 15,
  hourlyValue: 50,
  winRatePct: 5,
  contractValue: 1500,
  feePct: 10,
  repeatMultiplier: 1,
};

export const INPUT_NOTES = [
  { what: "Connects per proposal", detail: "The average you actually spend, including any boost. Job posts show their own cost; it varies by job." },
  { what: "Price per Connect", detail: "Editable. Check your own Connects purchase screen; the price and bundle terms are Upwork's and can change." },
  { what: "Win rate", detail: "Hires divided by proposals sent, not by replies. Count a few months of your own history; a handful of proposals is noise." },
  { what: "Contract value", detail: "What the client pays you over the contract before the platform fee. Use the median of what you really win, not your best job." },
  { what: "Service fee", detail: "Share of contract value the platform keeps. Editable because it depends on your plan and contract terms." },
  { what: "Repeat multiplier", detail: "1 counts only the first contract. 1.5 means the average new client later brings half again as much work." },
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
  const proposals = num(o.proposalsPerMonth, "Proposals per month");
  const connects = num(o.connectsPerProposal, "Connects per proposal");
  const price = num(o.connectPrice, "Price per Connect");
  const minutes = num(o.minutesPerProposal, "Minutes per proposal");
  const hourly = num(o.hourlyValue, "Hourly value of your time");
  const win = num(o.winRatePct, "Win rate") / 100;
  const value = num(o.contractValue, "Contract value");
  const fee = num(o.feePct, "Service fee") / 100;
  const mult = num(o.repeatMultiplier, "Repeat multiplier");
  if (win > 1) throw new Error("Win rate cannot be over 100%.");
  if (fee >= 1) throw new Error("Service fee must be under 100%.");
  const connectCost = Math.round(connects * price * 1e6) / 1e6;
  const timeCost = (minutes / 60) * hourly;
  const costPerProposal = connectCost + timeCost;
  const netPerHire = value * (1 - fee) * mult;
  const hires = proposals * win;
  const spend = proposals * connectCost;
  const timeSpend = proposals * timeCost;
  const income = hires * netPerHire;
  const net = income - spend - timeSpend;
  return {
    proposals, connects, price, minutes, hourly, win, value, fee, mult,
    connectCost, timeCost, costPerProposal, netPerHire, hires, spend, timeSpend, income, net,
    costPerHire: win > 0 ? costPerProposal / win : null,
    connectCostPerHire: win > 0 ? connectCost / win : null,
    breakEvenWinRate: netPerHire > 0 ? costPerProposal / netPerHire : null,
    breakEvenWinRateConnectsOnly: netPerHire > 0 ? connectCost / netPerHire : null,
    // Most you can spend per proposal in Connects before the proposal loses money at this win rate.
    maxConnects: price > 0 ? Math.max(0, (win * netPerHire - timeCost) / price) : null,
    roi: spend + timeSpend > 0 ? net / (spend + timeSpend) : null,
  };
}

export function computeRoi(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const r = core(o);
  const scenarios = [0.5, 1, 1.5, 2].map((k) => {
    const x = core({ ...o, winRatePct: Math.min(100, r.win * 100 * k) });
    return { factor: k, winRatePct: r.win * 100 * k, hires: x.hires, net: x.net, current: k === 1 };
  });
  const connectScenarios = [...new Set([4, 8, 12, 16, 20, r.connects])].sort((a, b) => a - b).map((c) => {
    const x = core({ ...o, connectsPerProposal: c });
    return { connects: c, connectCost: x.connectCost, breakEvenWinRate: x.breakEvenWinRate, net: x.net, current: c === r.connects };
  });
  return { ...r, scenarios, connectScenarios };
}

export function summarize(r) {
  const verdict = r.net >= 0 ? "ok" : "warn";
  const parts = [
    `${r.proposals} proposals a month cost ${money(r.spend)} in Connects and ${money(r.timeSpend)} of your time (${money(r.costPerProposal)} each).`,
    `At a ${pct(r.win * 100)} win rate that is ${r2(r.hires)} hires a month, ${r.costPerHire == null ? "with no hires to price" : `${money(r.costPerHire)} per hire`}.`,
    `Each hire nets ${money(r.netPerHire)} after the fee, so the month nets ${money(r.net)}${r.roi == null ? "" : ` (${pct(r.roi * 100)} return on what you spend)`}.`,
  ];
  if (r.breakEvenWinRate != null) parts.push(`You break even at a ${pct(r.breakEvenWinRate * 100)} win rate; Connects alone break even at ${pct(r.breakEvenWinRateConnectsOnly * 100)}.`);
  if (r.maxConnects != null) parts.push(`At your win rate a proposal stops paying above about ${Math.floor(r.maxConnects)} Connects.`);
  return { status: verdict, text: parts.join(" ") };
}
