// Tax-loss harvesting: nets realized gains and losses the way the federal
// capital-loss rules do (short against short, long against long, then the
// two nets against each other, then up to $3,000 against ordinary income,
// the rest carried forward), and prices what harvesting candidate losses saves
// this year. Deterministic and local. Losses on positions flagged as wash
// sales are disallowed for the year and left out.

export const ORDINARY_CAP = { single: 3000, mfs: 1500 };
export const MAX_POSITIONS = 6;

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const blank = (v) => String(v ?? "").trim() === "";
const opt = (v, d = 0) => (blank(v) ? d : parseNum(v));

// Net short-term (st) and long-term (lt) figures, gains positive, losses
// negative. Returns what is taxable by character, the ordinary deduction used
// and the carryforward left, all as positive amounts.
export function netLosses(st, lt, cap) {
  let stTax = 0, ltTax = 0, ded = 0, carryST = 0, carryLT = 0;
  if (st >= 0 && lt >= 0) {
    stTax = st; ltTax = lt;
  } else if (st < 0 && lt >= 0) {
    const n = lt + st;
    if (n >= 0) ltTax = n; else { ded = Math.min(-n, cap); carryST = -n - ded; }
  } else if (st >= 0 && lt < 0) {
    const n = st + lt;
    if (n >= 0) stTax = n; else { ded = Math.min(-n, cap); carryLT = -n - ded; }
  } else {
    const total = -(st + lt);
    ded = Math.min(total, cap);
    const usedST = Math.min(-st, ded);
    carryST = -st - usedST;
    carryLT = -lt - (ded - usedST);
  }
  return { stTax, ltTax, ded, carryST, carryLT };
}

function price(net, r) {
  const tax = net.stTax * r.st + net.ltTax * r.lt;
  const saved = net.ded * r.ord;
  return { ...net, tax: round2(tax), deductionValue: round2(saved), cost: round2(tax - saved) };
}

export function analyze(input) {
  const cap = ORDINARY_CAP[input.filing === "mfs" ? "mfs" : "single"];
  const num = (k, d = 0) => opt(input[k], d);
  const stGain = num("stGain"), ltGain = num("ltGain");
  const stCarry = num("stCarry"), ltCarry = num("ltCarry");
  const ordRate = num("ordRate", 24), ltRate = num("ltRate", 15);
  const stateRate = num("stateRate"), niitRate = num("niitRate");
  const vals = { stGain, ltGain, stCarry, ltCarry, ordRate, ltRate, stateRate, niitRate };
  for (const [k, v] of Object.entries(vals)) if (!Number.isFinite(v)) return { error: `Check the number in "${k}".` };
  if (stCarry < 0 || ltCarry < 0) return { error: "Enter carried-forward losses as positive numbers." };
  for (const k of ["ordRate", "ltRate", "stateRate", "niitRate"]) if (vals[k] < 0 || vals[k] > 60) return { error: `Rates must be between 0 and 60 percent (${k}).` };

  const positions = [];
  for (const p of input.positions || []) {
    if (blank(p.loss)) continue;
    const loss = parseNum(p.loss);
    if (!Number.isFinite(loss) || loss <= 0) return { error: "Enter each position's unrealized loss as a positive number." };
    positions.push({ name: blank(p.name) ? `Position ${positions.length + 1}` : String(p.name).trim(), loss, term: p.term === "long" ? "long" : "short", wash: p.wash === "yes" });
  }
  if (!positions.length) return { error: "Add at least one position with an unrealized loss." };

  const rates = { st: (ordRate + stateRate + niitRate) / 100, lt: (ltRate + stateRate + niitRate) / 100, ord: (ordRate + stateRate) / 100 };
  const eligible = positions.filter((p) => !p.wash);
  const disallowed = positions.filter((p) => p.wash);
  const hST = eligible.filter((p) => p.term === "short").reduce((s, p) => s + p.loss, 0);
  const hLT = eligible.filter((p) => p.term === "long").reduce((s, p) => s + p.loss, 0);

  const before = price(netLosses(stGain - stCarry, ltGain - ltCarry, cap), rates);
  const after = price(netLosses(stGain - stCarry - hST, ltGain - ltCarry - hLT, cap), rates);
  const savings = round2(before.cost - after.cost);
  const harvested = hST + hLT;
  const basisDeferred = round2(harvested * rates.lt);

  const netGains = Math.max(0, stGain - stCarry) + Math.max(0, ltGain - ltCarry);
  const totalEligible = harvested;
  const target = Math.max(0, (stGain - stCarry) + (ltGain - ltCarry)) + cap;
  const gap = Math.max(0, round2(target - totalEligible));

  const findings = [];
  findings.push({ severity: "info", title: `Harvesting saves about $${money(savings)} this year`, detail: `Estimated tax with no harvest is $${money(before.cost)}; with the eligible losses it is $${money(after.cost)}. The estimate uses the flat rates you entered.` });
  if (after.carryST + after.carryLT > 0) findings.push({ severity: "info", title: `$${money(after.carryST + after.carryLT)} of loss carries forward`, detail: `After netting against gains and the $${money(cap)} ordinary-income limit, this much loss rolls to next year (short-term $${money(after.carryST)}, long-term $${money(after.carryLT)}). It is not lost, but its value depends on future gains.` });
  if (disallowed.length) findings.push({ severity: "medium", title: `${disallowed.length} position${disallowed.length > 1 ? "s" : ""} left out for wash-sale risk`, detail: `${disallowed.map((p) => p.name).join(", ")}: buying the same or a substantially identical security within 30 days before or after the sale disallows the loss for now. The disallowed amount is added to the replacement shares' basis instead.` });
  if (harvested > 0) findings.push({ severity: "info", title: "Harvesting defers tax, it does not erase it", detail: `Selling at a loss lowers your basis in whatever you rebuy. If you later sell at a gain, about $${money(basisDeferred)} of tax at your long-term rate comes back, unless you hold to a step-up in basis, donate the shares, or the later gain lands in a lower bracket.` });
  if (gap > 0) findings.push({ severity: "info", title: `About $${money(gap)} more in losses would use the whole benefit`, detail: `Realized gains after carryforwards plus the $${money(cap)} ordinary-income limit is $${money(target)}; your eligible losses total $${money(totalEligible)}.` });
  if (netGains === 0 && harvested > 0 && before.ded >= cap) findings.push({ severity: "medium", title: "You already deduct the maximum ordinary loss", detail: "With no net gains and the ordinary limit already used, extra harvested losses only add to the carryforward this year." });

  return { cap, rates, positions, eligible, disallowed, before, after, savings, harvested, basisDeferred, gap, findings, input: vals };
}

export function sampleInput() {
  return {
    filing: "single", stGain: "6000", ltGain: "18000", stCarry: "0", ltCarry: "2000",
    ordRate: "32", ltRate: "15", stateRate: "5", niitRate: "0",
    positions: [
      { name: "Growth ETF lot A", loss: "7500", term: "long", wash: "no" },
      { name: "Single stock B", loss: "4200", term: "short", wash: "no" },
      { name: "Tech fund C", loss: "3000", term: "long", wash: "yes" },
    ],
  };
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
export function reportCsv(a) {
  const rows = [["Section", "Item", "Value"]];
  rows.push(["Estimate", "Tax cost without harvest", a.before.cost], ["Estimate", "Tax cost with harvest", a.after.cost], ["Estimate", "Estimated savings this year", a.savings]);
  rows.push(["Estimate", "Ordinary deduction used", a.after.ded], ["Estimate", "Short-term carryforward", round2(a.after.carryST)], ["Estimate", "Long-term carryforward", round2(a.after.carryLT)]);
  for (const p of a.positions) rows.push(["Position", p.name, `${p.loss} ${p.term}-term${p.wash ? " (wash-sale risk, excluded)" : ""}`]);
  rows.push(["Note", "Illustrative estimate, not tax advice", ""]);
  return rows.map((r) => r.map(q).join(",")).join("\n");
}
