// Pure bid arithmetic shared by every trade. No network, no state. The one
// idea: price = full cost / (1 - margin). A "25% markup" on cost is a 20%
// margin on price, and a contractor who adds 25% when they meant a 25% margin
// is short on every job. Trades differ in their inputs, not in this maths.

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function pct(value, name, { max = 95 } = {}) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be zero or more`);
  if (n > max) throw new Error(`${name} must be at most ${max}`);
  return n;
}
function amount(value, name) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be zero or more`);
  return n;
}

// "16 @ 28 framing crew" -> { hours: 16, rate: 28, label: "framing crew" }
export function parseLabor(text) {
  const lines = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)?\s*[@x×]\s*\$?(\d+(?:\.\d+)?)\s*(?:\/\s*h(?:r|our)?)?\s*(.*)$/i);
    if (!m) throw new Error(`Labor line "${line}" should look like "16 @ 28 crew" (hours @ hourly wage)`);
    lines.push({ hours: Number(m[1]), rate: Number(m[2]), label: m[3].trim() });
  }
  return lines;
}

// "420 lumber" or "$85.50 hinges" -> { cost, label }
export function parseCosts(text, what = "Cost") {
  const lines = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\$?(\d[\d,]*(?:\.\d+)?)\s*(.*)$/);
    if (!m) throw new Error(`${what} line "${line}" should start with a dollar amount, e.g. "420 lumber"`);
    lines.push({ cost: Number(m[1].replace(/,/g, "")), label: m[2].trim() });
  }
  return lines;
}

/**
 * Price a job.
 * @param {object} i
 * @param {{hours:number,rate:number}[]} i.labor  hourly wage lines (before burden)
 * @param {number} i.burdenPct       payroll taxes, workers' comp, benefits as % of wages
 * @param {{cost:number}[]} i.materials
 * @param {number} i.wastePct        extra material bought beyond what the job uses
 * @param {number} i.subs            subcontractor cost
 * @param {number} i.equipment       rentals, fuel, dump fees, permits and other direct cost
 * @param {number} i.travelMiles
 * @param {number} i.mileRate        cost per mile
 * @param {number} i.contingencyPct  % of direct cost held for surprises
 * @param {number} i.overheadPct     % of direct cost that pays for the business itself
 * @param {number} i.marginPct       target profit as % of the price (not of cost)
 * @param {number} [i.rivalPrice]    a competing bid, to see the margin it leaves
 * @param {number} [i.depositPct]
 */
export function priceJob(i) {
  const labor = (i.labor || []).map((l) => ({ hours: amount(l.hours, "Labor hours"), rate: amount(l.rate, "Hourly wage") }));
  const burdenPct = pct(i.burdenPct, "Payroll burden", { max: 200 });
  const wastePct = pct(i.wastePct, "Material waste", { max: 100 });
  const contingencyPct = pct(i.contingencyPct, "Contingency", { max: 100 });
  const overheadPct = pct(i.overheadPct, "Overhead", { max: 200 });
  const marginPct = pct(i.marginPct, "Target margin", { max: 90 });
  const depositPct = pct(i.depositPct ?? 0, "Deposit", { max: 100 });

  const hours = labor.reduce((s, l) => s + l.hours, 0);
  const wages = labor.reduce((s, l) => s + l.hours * l.rate, 0);
  const laborCost = wages * (1 + burdenPct / 100);
  const materialsUsed = (i.materials || []).reduce((s, m) => s + amount(m.cost, "Material cost"), 0);
  const materialCost = materialsUsed * (1 + wastePct / 100);
  const subs = amount(i.subs, "Subcontractors");
  const equipment = amount(i.equipment, "Equipment and fees");
  const travel = amount(i.travelMiles, "Travel miles") * amount(i.mileRate, "Cost per mile");

  const direct = laborCost + materialCost + subs + equipment + travel;
  const contingency = direct * (contingencyPct / 100);
  const overhead = direct * (overheadPct / 100);
  const fullCost = direct + contingency + overhead;
  const price = fullCost / (1 - marginPct / 100);
  const profit = price - fullCost;

  // The common mistake: typing the margin as a markup.
  const naivePrice = fullCost * (1 + marginPct / 100);
  const naiveMargin = naivePrice > 0 ? ((naivePrice - fullCost) / naivePrice) * 100 : 0;

  // Labor is the line that overruns. How far can it run over before the
  // contingency and then the profit are spent?
  const overrunBeforeProfitLoss = laborCost > 0 ? ((contingency + profit) / laborCost) * 100 : null;
  const overrunBeforeContingencyGone = laborCost > 0 ? (contingency / laborCost) * 100 : null;

  const out = {
    hours: round2(hours), wages: round2(wages), laborCost: round2(laborCost), materialCost: round2(materialCost),
    subs: round2(subs), equipment: round2(equipment), travel: round2(travel), direct: round2(direct),
    contingency: round2(contingency), overhead: round2(overhead), fullCost: round2(fullCost),
    price: round2(price), profit: round2(profit), marginPct: round2(marginPct),
    markupPct: round2((marginPct / (100 - marginPct)) * 100),
    // Below this you lose money on the job after overhead; below `cashFloor` you
    // do not even cover what you spend out of pocket.
    walkAway: round2(fullCost), cashFloor: round2(direct),
    profitPerLaborHour: hours > 0 ? round2(profit / hours) : null,
    revenuePerLaborHour: hours > 0 ? round2(price / hours) : null,
    naive: { price: round2(naivePrice), actualMarginPct: round2(naiveMargin), shortBy: round2(price - naivePrice) },
    overrunBeforeProfitLossPct: overrunBeforeProfitLoss === null ? null : round2(overrunBeforeProfitLoss),
    overrunBeforeContingencyGonePct: overrunBeforeContingencyGone === null ? null : round2(overrunBeforeContingencyGone),
    deposit: round2(price * (depositPct / 100)),
    depositCoversMaterialsPct: price > 0 ? round2(((materialCost + subs) / price) * 100) : 0,
  };

  const rival = i.rivalPrice === undefined || i.rivalPrice === "" || i.rivalPrice === null ? null : amount(i.rivalPrice, "Rival price");
  if (rival !== null && rival > 0) {
    const profitAtRival = rival - fullCost;
    out.rival = {
      price: round2(rival), profit: round2(profitAtRival),
      marginPct: round2((profitAtRival / rival) * 100),
      gapPct: round2(((price - rival) / rival) * 100),
      verdict: rival < direct ? "below-cash" : rival < fullCost ? "below-walk-away" : rival < price ? "thin" : "above-target",
    };
  }
  return out;
}

// Overhead as a % of direct cost, from last year's numbers.
export function overheadPctFrom(annualOverhead, annualDirectCost) {
  const o = amount(annualOverhead, "Annual overhead");
  const d = amount(annualDirectCost, "Annual direct cost");
  if (d <= 0) throw new Error("Annual direct cost must be above zero");
  return round2((o / d) * 100);
}

// Margin <-> markup, the conversion every quote gets wrong at least once.
export const marginToMarkup = (m) => round2((m / (100 - m)) * 100);
export const markupToMargin = (k) => round2((k / (100 + k)) * 100);

// What each +/- change in price does to the job and to the win chance you
// might face. No win-rate model here: see bid-win-rate-optimizer for that.
export function priceLadder(result, steps = [-10, -5, 0, 5, 10]) {
  return steps.map((s) => {
    const p = result.price * (1 + s / 100);
    return { change: s, price: round2(p), profit: round2(p - result.fullCost), marginPct: p > 0 ? round2(((p - result.fullCost) / p) * 100) : 0 };
  });
}
