// Payment processor effective rate. Pure arithmetic over what the user types in: a processor charges a percentage plus a fixed fee per
// transaction (often different in person and online), a monthly fee, a fee per dispute, and may or may not hand back its fee when you refund.
// The headline "2.9% + 30c" is rarely the number that matters: on small tickets the fixed fee dominates, and dispute and monthly fees
// are invisible until the statement arrives. This turns each quote into a monthly and yearly cost and an effective rate on sales.

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// One processor per line: name, in-person %, in-person fixed $, online %, online fixed $, monthly $, dispute fee $, refunds (keeps|returns)
export function parseProcessors(text) {
  const processors = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const [name, inPct, inFix, onPct, onFix, monthly, dispute, refundsRaw] = p;
    const need = `Processor line ${i + 1}: need "name, in-person %, in-person fixed $, online %, online fixed $, monthly $, dispute fee $, keeps|returns".`;
    if (!name || p.length < 5) return errors.push(need);
    const opt = (v) => (v === undefined || v === "" ? 0 : num(v));
    const rec = { name, inPct: num(inPct), inFix: num(inFix), onPct: num(onPct), onFix: num(onFix), monthly: opt(monthly), dispute: opt(dispute) };
    const refunds = (refundsRaw || "keeps").toLowerCase();
    if (!Object.values(rec).slice(1).every(Number.isFinite)) return errors.push(`Processor line ${i + 1}: use plain numbers.`);
    if (Object.values(rec).slice(1).some((v) => v < 0)) return errors.push(`Processor line ${i + 1}: fees cannot be negative.`);
    if (rec.inPct > 30 || rec.onPct > 30) return errors.push(`Processor line ${i + 1}: a percentage above 30 looks like a typo.`);
    if (!["keeps", "returns"].includes(refunds)) return errors.push(`Processor line ${i + 1}: refunds must be keeps or returns.`);
    processors.push({ ...rec, keepsRefundFee: refunds === "keeps" });
  });
  return { processors, errors };
}

export function costOf(p, { volume, ticket, onlineShare, refundRate, disputes }) {
  const txns = volume / ticket;
  const inVol = volume * (1 - onlineShare), onVol = volume * onlineShare;
  const inTx = txns * (1 - onlineShare), onTx = txns * onlineShare;
  const percentFees = inVol * p.inPct / 100 + onVol * p.onPct / 100;
  const fixedFees = inTx * p.inFix + onTx * p.onFix;
  let processing = percentFees + fixedFees;
  const refundedBack = p.keepsRefundFee ? 0 : processing * refundRate;
  processing -= refundedBack;
  const disputeFees = disputes * p.dispute;
  const total = processing + p.monthly + disputeFees;
  return {
    percentFees: round2(percentFees), fixedFees: round2(fixedFees), refundedBack: round2(refundedBack), disputeFees: round2(disputeFees),
    monthlyFee: round2(p.monthly), total: round2(total), yearly: round2(total * 12), effective: round3(total / volume * 100),
    keptPerTicket: round2(total / txns),
  };
}

export const SENS_TICKETS = [5, 15, 40, 100, 300, 1000];

export function plan(input) {
  const { processors, errors } = parseProcessors(input.processors);
  if (errors.length) return { error: errors[0], errors };
  if (!processors.length) return { error: "Add at least one processor: name, in-person %, in-person fixed $, online %, online fixed $, monthly $, dispute fee $, keeps|returns." };
  const volume = num(input.volume), ticket = num(input.ticket);
  const onlineShare = (input.onlinePct === undefined || input.onlinePct === "" ? 0 : num(input.onlinePct)) / 100;
  const refundRate = (input.refundPct === undefined || input.refundPct === "" ? 0 : num(input.refundPct)) / 100;
  const disputes = input.disputes === undefined || input.disputes === "" ? 0 : num(input.disputes);
  if (!(volume > 0)) return { error: "Enter monthly card sales above zero." };
  if (!(ticket > 0)) return { error: "Enter an average sale above zero." };
  if (!(onlineShare >= 0 && onlineShare <= 1)) return { error: "Online share must be between 0 and 100." };
  if (!(refundRate >= 0 && refundRate <= 1)) return { error: "Refund rate must be between 0 and 100." };
  if (!(disputes >= 0)) return { error: "Disputes per month must be zero or more." };
  const scenario = { volume, ticket, onlineShare, refundRate, disputes };
  const rows = processors.map((p) => ({ ...p, ...costOf(p, scenario) }));
  const ranked = [...rows].sort((a, b) => a.total - b.total);
  const best = ranked[0], worst = ranked[ranked.length - 1];
  const fmt = (x) => x.toFixed(2);
  const advice = [`Cheapest at $${volume.toLocaleString("en-US")} a month on $${ticket} sales: ${best.name}, $${fmt(best.total)} a month, ${best.effective}% of sales, $${fmt(best.keptPerTicket)} per sale.`];
  if (ranked.length > 1) advice.push(`${worst.name} costs $${fmt(worst.total - best.total)} a month more than ${best.name}, about $${fmt((worst.total - best.total) * 12)} a year.`);
  for (const r of rows) {
    if (r.fixedFees > r.percentFees * 0.4 && r.fixedFees > 0) advice.push(`${r.name}: per-transaction fees are $${fmt(r.fixedFees)} against $${fmt(r.percentFees)} of percentage fees; small sales are what make this expensive.`);
    if (r.monthlyFee + r.disputeFees > r.total * 0.25) advice.push(`${r.name}: $${fmt(r.monthlyFee + r.disputeFees)} of the bill is monthly and dispute fees, not the headline rate.`);
    if (r.keepsRefundFee && refundRate > 0) advice.push(`${r.name} keeps its fee on refunds; at ${(refundRate * 100).toFixed(1)}% refunds that is about $${fmt((r.percentFees + r.fixedFees) * refundRate)} a month you do not get back.`);
  }
  const sensitivity = SENS_TICKETS.map((t) => ({ ticket: t, rates: rows.map((p) => ({ name: p.name, effective: costOf(p, { ...scenario, ticket: t }).effective })) }));
  advice.push("Quotes often leave out chargeback-protection add-ons, PCI non-compliance fees, instant-payout fees, currency conversion, international and amex surcharges, and early termination fees. Add recurring ones to the monthly fee.");
  return { rows, best, advice, sensitivity, volume, ticket };
}

export function sampleInput() {
  return {
    volume: 18000, ticket: 28, onlinePct: 35, refundPct: 3, disputes: 1,
    processors: [
      "Flat Rate Pay, 2.6, 0.10, 2.9, 0.30, 0, 15, keeps",
      "Interchange Plus Co, 1.8, 0.15, 2.4, 0.25, 25, 15, returns",
      "Subscription Terminal, 0.4, 0.08, 2.5, 0.30, 99, 0, returns",
    ].join("\n"),
  };
}

export function toCsv(r) {
  const head = "processor,percentage_fees,per_transaction_fees,monthly_fee,dispute_fees,total_per_month,effective_rate_pct,per_year";
  const lines = r.rows.map((x) => [x.name, x.percentFees.toFixed(2), x.fixedFees.toFixed(2), x.monthlyFee.toFixed(2), x.disputeFees.toFixed(2), x.total.toFixed(2), x.effective, x.yearly.toFixed(2)].map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(","));
  return [head, ...lines].join("\n") + "\n";
}
