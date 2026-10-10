// Earned-value forecast for a fixed-price project: will it finish inside the price?
// Pure arithmetic over the numbers the user enters; nothing here is advice.

export const money = (n) =>
  (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;
const round2 = (n) => Math.round(n * 100) / 100;

// price: contract value. budget: planned cost to deliver (BAC). percentComplete / plannedPercent: 0-100.
// actualCost: cost spent so far (AC).
export function forecast({ price, budget, percentComplete, actualCost, plannedPercent = null }) {
  const nums = { price, budget, percentComplete, actualCost };
  for (const [k, v] of Object.entries(nums)) {
    if (!Number.isFinite(v)) return { error: `Enter a number for ${k}.` };
  }
  if (price <= 0 || budget <= 0) return { error: "Price and cost budget must be above zero." };
  if (percentComplete < 0 || percentComplete > 100) return { error: "Percent complete must be between 0 and 100." };
  if (actualCost < 0) return { error: "Actual cost cannot be negative." };
  if (plannedPercent !== null && (!Number.isFinite(plannedPercent) || plannedPercent < 0 || plannedPercent > 100)) {
    return { error: "Planned percent must be between 0 and 100." };
  }
  const pc = percentComplete / 100;
  const ev = budget * pc;
  const pv = plannedPercent === null ? null : budget * (plannedPercent / 100);
  const cpi = actualCost > 0 ? ev / actualCost : null;
  const spi = pv && pv > 0 ? ev / pv : null;
  const warnings = [];
  if (pc === 0 && actualCost > 0) warnings.push("Money is spent but nothing is earned yet, so no cost-based forecast is possible.");
  if (pc === 0 && actualCost === 0) return { error: "Nothing has started: enter percent complete or actual cost." };
  if (pc === 1) warnings.push("At 100% complete the final cost is the actual cost.");

  // Three standard estimates at completion (EAC).
  let eacCpi = cpi ? budget / cpi : null; // today's cost efficiency continues
  const eacBudgetRate = actualCost + (budget - ev); // the overrun so far is a one-off
  const eacCpiSpi = cpi && spi ? actualCost + (budget - ev) / (cpi * spi) : null; // cost and schedule both drag
  if (pc === 1) eacCpi = actualCost;

  const scenarios = [
    { id: "one-off", label: "Overrun so far is a one-off", eac: eacBudgetRate },
    eacCpi !== null && { id: "trend", label: "Cost efficiency so far continues", eac: eacCpi },
    eacCpiSpi !== null && { id: "trend-schedule", label: "Cost and schedule both keep slipping", eac: eacCpiSpi },
  ].filter(Boolean).map((s) => ({
    ...s,
    etc: s.eac - actualCost,
    margin: price - s.eac,
    marginPct: (price - s.eac) / price,
    overBudget: s.eac - budget,
    shortfallVsPrice: Math.max(0, s.eac - price),
  }));

  const planMargin = price - budget;
  const likely = scenarios.find((s) => s.id === "trend") || scenarios[0];
  const tcpi = budget - actualCost > 0 ? (budget - ev) / (budget - actualCost) : null; // efficiency needed to finish on budget
  const tcpiPrice = price - actualCost > 0 ? (budget - ev) / (price - actualCost) : null; // ...to finish at the price
  const priceReachedAt = cpi ? Math.min(1, price * cpi / budget) : null; // % complete at which spend equals price if CPI holds

  const status = !cpi ? "unknown" : likely.margin < 0 ? "losing" : likely.margin < planMargin * 0.5 ? "thin" : "ok";
  const advice = [];
  if (cpi !== null) {
    advice.push(`${pct(pc, 0)} complete with ${money(actualCost)} spent: you have earned ${money(ev)} of budget, so cost performance (CPI) is ${round2(cpi)}.`);
    advice.push(
      `If that efficiency continues, the job finishes at about ${money(likely.eac)} against a ${money(price)} price: a ${money(likely.margin)} margin (${pct(likely.marginPct)}) versus ${money(planMargin)} planned.`,
    );
    if (likely.margin < 0 && priceReachedAt !== null && priceReachedAt < 1) {
      advice.push(`At this rate spend reaches the contract price at about ${pct(priceReachedAt, 0)} complete. Everything after that is unpaid work.`);
    }
    if (likely.eac > budget) {
      advice.push(`To hold the planned margin you would need ${money(likely.eac - budget)} more revenue (a change order, a scope cut, or a rate change), or to bring cost efficiency up to ${tcpi ? round2(tcpi) : "n/a"}.`);
    }
  }
  if (tcpi !== null && cpi !== null && tcpi > 1.1 && cpi < 1) {
    advice.push(`Finishing on budget needs ${round2(tcpi)} of earned value per dollar from here, against ${round2(cpi)} so far. Plans that assume the rest goes better than the past usually do not.`);
  }
  return {
    inputs: { price, budget, percentComplete, plannedPercent, actualCost },
    ev, pv, cpi, spi, tcpi, tcpiPrice, planMargin, priceReachedAt, scenarios, likely, status, advice, warnings,
  };
}

// Status history: header period,percent_complete,actual_cost[,planned_percent]
export function parseSnapshots(text) {
  const rows = String(text).replace(/^﻿/, "").split(/\r?\n/).map((l) => l.split(/[,\t]/).map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (rows.length < 3) return { error: "Need a header and at least two status rows." };
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const [period, pc, ac, pp] = rows[i];
    const num = (s) => (s === undefined || s === "" ? null : Number(String(s).replace(/[$,%\s]/g, "")));
    const p = num(pc), a = num(ac);
    if (!Number.isFinite(p) || !Number.isFinite(a)) return { error: `Row ${i + 1}: percent complete and actual cost must be numbers.` };
    out.push({ period: period || `Period ${i}`, percentComplete: p, actualCost: a, plannedPercent: num(pp) });
  }
  return { snapshots: out };
}

export function trend(snapshots, { price, budget }) {
  const rows = snapshots.map((s) => {
    const f = forecast({ price, budget, percentComplete: s.percentComplete, actualCost: s.actualCost, plannedPercent: s.plannedPercent });
    return f.error ? { period: s.period, error: f.error } : { period: s.period, percentComplete: s.percentComplete, actualCost: s.actualCost, cpi: f.cpi, spi: f.spi, eac: f.likely.eac, margin: f.likely.margin };
  });
  const ok = rows.filter((r) => !r.error && r.cpi !== null);
  const notes = [];
  if (ok.length >= 2) {
    const first = ok[0], last = ok[ok.length - 1];
    const d = last.cpi - first.cpi;
    notes.push(Math.abs(d) < 0.03
      ? `CPI is steady near ${round2(last.cpi)}.`
      : `CPI moved from ${round2(first.cpi)} to ${round2(last.cpi)}: cost efficiency is ${d < 0 ? "deteriorating" : "improving"}.`);
    const firstLoss = ok.find((r) => r.margin < 0);
    if (firstLoss) notes.push(`The forecast first showed a loss at "${firstLoss.period}", ${firstLoss.percentComplete}% complete.`);
    // Incremental efficiency over the latest interval is the early-warning number.
    const dEv = (last.percentComplete - ok[ok.length - 2].percentComplete) / 100 * budget;
    const dAc = last.actualCost - ok[ok.length - 2].actualCost;
    if (dAc > 0) notes.push(`Latest interval alone: ${money(dEv)} of budget earned for ${money(dAc)} spent (CPI ${round2(dEv / dAc)}).`);
  }
  return { rows, notes };
}

export function sampleSnapshots() {
  return "period,percent_complete,actual_cost,planned_percent\nWeek 2,10,9000,12\nWeek 4,22,23500,25\nWeek 6,33,38000,38\nWeek 8,45,55500,50";
}
export function toCsv(f) {
  const head = "scenario,estimate_at_completion,cost_to_complete,margin,margin_pct";
  return [head, ...f.scenarios.map((s) => [s.label.replace(/,/g, ""), Math.round(s.eac), Math.round(s.etc), Math.round(s.margin), (s.marginPct * 100).toFixed(1)].join(","))].join("\n");
}
