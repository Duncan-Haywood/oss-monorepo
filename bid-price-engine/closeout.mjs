// Close out a finished job against its bid, and learn from the jobs you have
// closed. Pure arithmetic: the page keeps the history on the visitor's own
// device. The point is the number a bid cannot show: what the job really left.

import { round2 } from "./calc.mjs";

function amount(value, name) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be zero or more`);
  return n;
}

/**
 * Compare what a job cost with what the bid assumed.
 * @param {object} bid     the result of priceJob() plus { burdenPct, overheadPct }
 * @param {object} actual  { hours, materials, subs, equipment, travel, revenue }
 *   hours are paid labor hours at the bid's blended wage; revenue defaults to the bid price.
 */
export function closeoutJob(bid, actual) {
  if (!bid || !(bid.hours > 0)) throw new Error("A closeout needs a bid with labor hours to compare against");
  const hours = amount(actual.hours, "Actual labor hours");
  const materials = amount(actual.materials, "Actual materials");
  const subs = amount(actual.subs, "Actual subcontractors");
  const equipment = amount(actual.equipment, "Actual equipment and fees");
  const travel = actual.travel === undefined || actual.travel === "" ? bid.travel : amount(actual.travel, "Actual travel");
  const revenue = actual.revenue === undefined || actual.revenue === "" ? bid.price : amount(actual.revenue, "Revenue collected");
  if (!(revenue > 0)) throw new Error("Revenue collected must be above zero");

  const wage = bid.wages / bid.hours;
  const labor = hours * wage * (1 + bid.burdenPct / 100);
  const direct = labor + materials + subs + equipment + travel;
  const overhead = direct * (bid.overheadPct / 100);
  const fullCost = direct + overhead;
  const profit = revenue - fullCost;
  const pctOver = (a, b) => (b > 0 ? round2((a / b - 1) * 100) : null);

  return {
    labor: round2(labor), direct: round2(direct), overhead: round2(overhead), fullCost: round2(fullCost),
    revenue: round2(revenue), profit: round2(profit), marginPct: round2((profit / revenue) * 100),
    targetMarginPct: bid.marginPct, marginGapPts: round2((profit / revenue) * 100 - bid.marginPct),
    profitVsBid: round2(profit - bid.profit),
    laborHoursOverPct: pctOver(hours, bid.hours),
    materialsOverPct: pctOver(materials, bid.materialCost),
    directOverPct: pctOver(direct, bid.direct),
    profitPerLaborHour: hours > 0 ? round2(profit / hours) : null,
    // The bid's cash-in-hand view: did the job at least cover what left your account?
    coveredCash: revenue >= direct,
  };
}

/**
 * What a run of closed jobs says about your estimating.
 * Weighted by dollars, so one small job does not move it.
 * @param {object[]} jobs each { bidDirect, bidContingencyPct, bidLaborHours, actualHours, marginPct, targetMarginPct, profit, revenue }
 */
export function trackRecord(jobs, { minJobs = 3 } = {}) {
  const list = (jobs || []).filter((j) => j && j.bidDirect > 0 && j.revenue > 0);
  const n = list.length;
  if (n === 0) return { jobs: 0, ready: false };
  const sum = (f) => list.reduce((s, j) => s + f(j), 0);
  const bidDirect = sum((j) => j.bidDirect);
  const actualDirect = sum((j) => j.actualDirect);
  const bidHours = sum((j) => j.bidLaborHours);
  const actualHours = sum((j) => j.actualHours);
  const revenue = sum((j) => j.revenue);
  const profit = sum((j) => j.profit);
  const directOverPct = round2((actualDirect / bidDirect - 1) * 100);
  const laborOverPct = bidHours > 0 ? round2((actualHours / bidHours - 1) * 100) : null;
  const realizedMarginPct = round2((profit / revenue) * 100);
  const targetMarginPct = round2(sum((j) => j.targetMarginPct * j.revenue) / revenue);
  const underTarget = list.filter((j) => j.marginPct < j.targetMarginPct).length;
  const losers = list.filter((j) => j.profit < 0).length;
  // Contingency that would have covered the typical overrun, rounded up to a half point.
  const suggestedContingencyPct = directOverPct > 0 ? Math.ceil(directOverPct * 2) / 2 : 0;
  const currentContingencyPct = round2(sum((j) => j.bidContingencyPct * j.bidDirect) / bidDirect);
  return {
    jobs: n, ready: n >= minJobs, directOverPct, laborOverPct, realizedMarginPct, targetMarginPct,
    marginGapPts: round2(realizedMarginPct - targetMarginPct), underTarget, losers,
    currentContingencyPct, suggestedContingencyPct,
    contingencyShortfallPts: round2(Math.max(0, suggestedContingencyPct - currentContingencyPct)),
  };
}
