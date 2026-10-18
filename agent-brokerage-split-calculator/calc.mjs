// Real estate brokerage comparison: turns each brokerage's split, cap, fees and
// royalty into the agent's net income at a given number of closed deals, then
// finds the deal count where one plan overtakes another. Deterministic, local,
// pre-tax. All deals are assumed to be the same size.

export const MAX_PLANS = 3;
export const SENS_DEALS = [4, 8, 12, 20, 30, 45, 60];

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const blank = (v) => String(v ?? "").trim() === "";
const opt = (v, dflt = 0) => (blank(v) ? dflt : parseNum(v));

// One year at `deals` closings. p: { split, cap, postCapSplit, txnFee, postCapTxnFee,
// royaltyPct, royaltyCap, monthlyFee, annualFee, referralPct } (percents as 0..1).
// `gci` is the gross commission on one deal. The split cap is measured in dollars the
// brokerage keeps of the split, so the deal that crosses it is split in two.
export function planYear(p, gci, deals) {
  let companyPaid = 0, capHitDeal = null, agentSplit = 0, txnFees = 0;
  const whole = Math.floor(deals);
  const count = Math.ceil(deals);
  for (let d = 1; d <= count; d++) {
    const w = d <= whole ? 1 : deals - whole;
    const afterReferral = gci * w * (1 - p.referralPct);
    const wanted = afterReferral * (1 - p.split);
    const room = p.cap > 0 ? Math.max(0, p.cap - companyPaid) : Infinity;
    const company = Math.min(wanted, room);
    // Below the cap the plan's split applies; the part of a deal past the cap pays the
    // brokerage only (1 - postCapSplit) of what is left, so the deal that crosses it is split in two.
    const overflow = company < wanted && wanted > 0 ? afterReferral * (1 - company / wanted) * (1 - p.postCapSplit) : 0;
    txnFees += (capHitDeal !== null ? p.postCapTxnFee : p.txnFee) * w;
    companyPaid += company;
    if (p.cap > 0 && capHitDeal === null && companyPaid >= p.cap - 1e-9) capHitDeal = d;
    agentSplit += afterReferral - company - overflow;
  }
  const totalGci = gci * deals;
  const royaltyOwed = p.royaltyPct > 0 ? Math.min(p.royaltyPct * totalGci, p.royaltyCap > 0 ? p.royaltyCap : Infinity) : 0;
  const fixed = p.monthlyFee * 12 + p.annualFee;
  const net = agentSplit - txnFees - royaltyOwed - fixed;
  return {
    deals, totalGci, net, keptPct: totalGci > 0 ? net / totalGci : 0,
    brokerageCost: totalGci - net, capHitDeal, capReached: capHitDeal !== null,
    txnFees, royaltyOwed, fixed, companyPaid,
  };
}

// Deals a year from which plan `a` nets at least as much as `b` at every higher count up to `limit`.
// 0 means `a` is never behind; null means it is still behind at the limit.
export function crossover(a, b, gci, limit = 300) {
  for (let d = limit; d >= 1; d--) {
    if (planYear(a, gci, d).net < planYear(b, gci, d).net) return d === limit ? null : d + 1;
  }
  return 0;
}

// The split a plan would need, at your volume, to net as much as `target`. Bisection over
// the split (net rises with the agent's share). Returns 1 when even 100% is not enough.
export function splitToMatch(p, gci, deals, target) {
  const netAt = (split) => planYear({ ...p, split }, gci, deals).net;
  if (netAt(p.split) >= target) return p.split;
  if (netAt(1) < target) return 1;
  let lo = p.split, hi = 1;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (netAt(mid) < target) lo = mid; else hi = mid; }
  return hi;
}

const FIELDS = [
  ["split", "agent split percent", null, 100],
  ["cap", "yearly split cap in dollars", 0],
  ["postCapSplit", "post-cap agent percent", 100, 100],
  ["txnFee", "fee per transaction", 0],
  ["postCapTxnFee", "post-cap fee per transaction", null],
  ["royaltyPct", "royalty percent of commission", 0, 100],
  ["royaltyCap", "yearly royalty cap in dollars", 0],
  ["monthlyFee", "monthly fee", 0],
  ["annualFee", "yearly fee", 0],
  ["referralPct", "referral fee percent", 0, 100],
];

function parsePlan(raw, i) {
  const label = String(raw.name ?? "").trim() || `Brokerage ${i + 1}`;
  const f = {};
  for (const [key, name, dflt, max = Infinity] of FIELDS) {
    if (blank(raw[key])) {
      if (dflt === null && key === "split") return { error: `${label}: enter the agent split percent (what you keep, for example 70).` };
      f[key] = dflt;
      continue;
    }
    const v = parseNum(raw[key]);
    if (!(v >= 0 && v <= max)) return { error: `${label}: ${name} must be a number between 0 and ${max === Infinity ? "any amount" : max}, or blank.` };
    f[key] = v;
  }
  if (f.split < 1) return { error: `${label}: agent split must be a percent between 1 and 100 (70 means you keep 70%).` };
  const txnFee = f.txnFee;
  return { plan: {
    label, split: f.split / 100, cap: f.cap, postCapSplit: f.postCapSplit / 100,
    txnFee, postCapTxnFee: f.postCapTxnFee === null ? txnFee : f.postCapTxnFee,
    royaltyPct: f.royaltyPct / 100, royaltyCap: f.royaltyCap, monthlyFee: f.monthlyFee,
    annualFee: f.annualFee, referralPct: f.referralPct / 100,
  } };
}

export function analyze(input) {
  const price = parseNum(input.price), rate = parseNum(input.commissionPct), deals = parseNum(input.deals);
  if (!(price > 0)) return { error: "Enter the average sale price above zero." };
  if (!(rate > 0 && rate <= 15)) return { error: "Enter the total commission percent your side earns, between 0 and 15 (for example 2.5)." };
  if (!(deals > 0 && deals <= 500)) return { error: "Enter the deals you expect to close in a year, above 0 and at most 500." };
  const list = (input.plans ?? []).filter((p) => !blank(p.split) || !blank(p.name));
  if (list.length < 1) return { error: "Enter at least one brokerage with an agent split." };
  if (list.length > MAX_PLANS) return { error: `Compare at most ${MAX_PLANS} brokerages.` };
  const plans = [];
  for (let i = 0; i < list.length; i++) {
    const r = parsePlan(list[i], i);
    if (r.error) return r;
    plans.push(r.plan);
  }
  const gci = price * (rate / 100);
  const results = plans.map((p) => {
    const y = planYear(p, gci, deals);
    const table = SENS_DEALS.map((d) => ({ deals: d, net: planYear(p, gci, d).net }));
    return { plan: p, ...y, table };
  });
  const ranked = [...results].sort((a, b) => b.net - a.net);
  const best = ranked[0];
  const findings = [];
  if (results.length > 1) {
    const gap = best.net - ranked[1].net;
    findings.push({ severity: "info", title: `${best.plan.label} nets the most: about $${money(best.net)} at ${deals} deals`, detail: `That is $${money(gap)} more than ${ranked[1].plan.label} over the year, before tax, on $${money(gci * deals)} of commission.` });
    for (const r of results) {
      if (r === best) continue;
      const cross = crossover(best.plan, r.plan, gci);
      if (cross > 1) findings.push({ severity: "medium", title: `${best.plan.label} overtakes ${r.plan.label} at ${cross} deals a year`, detail: `Below ${cross} closings ${r.plan.label} pays more; from ${cross} up ${best.plan.label} does. If your year could land on either side of that number, price the risk of the smaller year.` });
      const needed = splitToMatch(r.plan, gci, deals, best.net);
      if (needed < 1) findings.push({ severity: "info", title: `To match ${best.plan.label}, ${r.plan.label} would need a ${(needed * 100).toFixed(1)}% split`, detail: `You have ${(r.plan.split * 100).toFixed(1)}% now. That is the split to ask for when you negotiate at ${deals} deals a year, all else equal.` });
      else findings.push({ severity: "info", title: `${r.plan.label} cannot match ${best.plan.label} on split alone`, detail: "Even a 100% split does not close the gap once its fees and caps are counted." });
    }
  }
  for (const r of results) {
    if (r.plan.cap > 0 && r.capReached) findings.push({ severity: "info", title: `${r.plan.label}: cap reached on deal ${r.capHitDeal}`, detail: `After deal ${r.capHitDeal} you keep ${(r.plan.postCapSplit * 100).toFixed(0)}% of each commission, less $${money(r.plan.postCapTxnFee)} a transaction.` });
    if (r.plan.cap > 0 && !r.capReached) findings.push({ severity: "medium", title: `${r.plan.label}: you would not reach the cap at ${deals} deals`, detail: `You would pay the brokerage about $${money(r.companyPaid)} of its $${money(r.plan.cap)} cap, so a capped plan is costing you its full split.` });
    if (r.keptPct < 0.5) findings.push({ severity: "medium", title: `${r.plan.label} leaves you ${(r.keptPct * 100).toFixed(0)}% of your commission`, detail: "Under half of what you earn reaches you before tax after splits and fees." });
  }
  return { results, best, findings, gci, deals };
}

export function sampleInput() {
  return {
    price: "450000", commissionPct: "2.5", deals: "14",
    plans: [
      { name: "Traditional 70/30", split: "70", cap: "", txnFee: "395", monthlyFee: "200", referralPct: "0" },
      { name: "Capped 80/20", split: "80", cap: "16000", postCapSplit: "100", txnFee: "250", postCapTxnFee: "75", royaltyPct: "", monthlyFee: "0", annualFee: "600" },
      { name: "Flat-fee cloud", split: "100", txnFee: "500", postCapTxnFee: "500", monthlyFee: "85", annualFee: "0" },
    ],
  };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const rows = [["Brokerage", "Deals", "Commission earned", "Net to agent", "Kept percent", "Cost of brokerage", "Cap reached on deal"]];
  for (const r of a.results) rows.push([r.plan.label, r.deals, round2(r.totalGci), round2(r.net), round2(r.keptPct * 100), round2(r.brokerageCost), r.capHitDeal ?? ""]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
