// Small online business valuation: SDE and ARR multiples with named adjustments.
// The base multiples are broad rules of thumb for small online business sales
// (SaaS, e-commerce, content, agency). They are not market data or an appraisal.

export const TYPES = {
  saas: { label: "SaaS / subscription software", sde: 3.3, arr: 2.4, spread: 0.22 },
  ecommerce: { label: "E-commerce / DTC store", sde: 2.6, arr: null, spread: 0.22 },
  content: { label: "Content site / affiliate / newsletter", sde: 3.0, arr: null, spread: 0.25 },
  agency: { label: "Agency / productised service", sde: 2.0, arr: null, spread: 0.25 },
};

const MIN_MULTIPLE = 0.8;

const bands = (x, table) => table.find(([max]) => x < max)[1];

// Each factor returns { label, delta, note } for the SDE multiple.
export function factors({ type, growth, monthlyChurn, topShare, ownerHours, ageMonths }) {
  const out = [];
  out.push({
    key: "growth",
    label: "Revenue growth, year on year",
    delta: bands(growth, [[-10, -0.6], [5, -0.2], [25, 0], [50, 0.3], [Infinity, 0.6]]),
    note: `${growth}% growth`,
  });
  if (type === "saas") {
    out.push({
      key: "churn",
      label: "Monthly customer churn",
      delta: bands(monthlyChurn, [[1.5, 0.3], [3, 0], [5, -0.3], [Infinity, -0.6]]),
      note: `${monthlyChurn}% a month`,
    });
  }
  out.push({
    key: "concentration",
    label: type === "saas" ? "Largest customer's share of revenue" : "Largest customer or traffic-channel share",
    delta: bands(topShare, [[15, 0.1], [30, 0], [50, -0.4], [Infinity, -0.7]]),
    note: `${topShare}% from one source`,
  });
  out.push({
    key: "owner",
    label: "Owner hours per week",
    delta: bands(ownerHours, [[10, 0.3], [20, 0.1], [40, -0.2], [Infinity, -0.5]]),
    note: `${ownerHours} hours a week`,
  });
  out.push({
    key: "age",
    label: "Business age",
    delta: bands(ageMonths, [[12, -0.5], [24, -0.2], [36, 0], [Infinity, 0.2]]),
    note: `${ageMonths} months`,
  });
  return out;
}

function multipleFor(base, fs, scale = 1) {
  const adj = fs.reduce((s, f) => s + f.delta, 0);
  return Math.max(MIN_MULTIPLE, base + adj * scale);
}

const isNum = (x) => typeof x === "number" && Number.isFinite(x);

export function value(input = {}) {
  const { type = "saas", revenue, sde, growth = 0, monthlyChurn = 2, topShare = 10, ownerHours = 20, ageMonths = 24, mrr, sellingFeePct = 10 } = input;
  const t = TYPES[type];
  if (!t) return { error: "Choose a business type." };
  if (!isNum(revenue) || revenue < 0) return { error: "Enter trailing-12-month revenue (0 or more)." };
  if (!isNum(sde)) return { error: "Enter annual profit before the owner's pay (SDE)." };
  if (sde > revenue) return { error: "Profit cannot be larger than revenue. Check both figures cover the same 12 months." };
  for (const [k, v] of [["growth", growth], ["monthly churn", monthlyChurn], ["top share", topShare], ["owner hours", ownerHours], ["age", ageMonths], ["selling fee", sellingFeePct]]) {
    if (!isNum(v)) return { error: `Enter a number for ${k}.` };
  }
  if (topShare < 0 || topShare > 100) return { error: "Largest source share must be between 0 and 100." };
  if (sellingFeePct < 0 || sellingFeePct > 50) return { error: "Selling fee must be between 0 and 50 percent." };
  if (ownerHours < 0 || ownerHours > 100) return { error: "Owner hours per week must be between 0 and 100." };

  const fs = factors({ type, growth, monthlyChurn, topShare, ownerHours, ageMonths });
  const sdeMult = multipleFor(t.sde, fs);
  const findings = [];

  let arr = null;
  if (t.arr && isNum(mrr) && mrr > 0) arr = mrr * 12;
  const arrMult = arr ? multipleFor(t.arr, fs, 0.9) : null;

  const sdeValue = sde > 0 ? sde * sdeMult : null;
  const arrValue = arr ? arr * arrMult : null;
  const methods = [];
  if (sdeValue !== null) methods.push(["SDE multiple", sdeValue]);
  if (arrValue !== null) methods.push(["ARR multiple", arrValue]);
  if (!methods.length) {
    return { error: "There is no earnings or recurring revenue to price. A business with zero or negative profit is usually valued on assets, audience or code, which this tool does not model." };
  }
  const mid = methods.reduce((s, m) => s + m[1], 0) / methods.length;
  const low = mid * (1 - t.spread);
  const high = mid * (1 + t.spread);
  const fee = Math.max(0, Math.min(50, sellingFeePct)) / 100;

  const levers = fs
    .filter((f) => f.delta < 0)
    .map((f) => {
      const uplift = -f.delta * (sdeValue !== null ? sde : (arr || 0) * 0.9 / 1);
      return { key: f.key, label: f.label, note: f.note, multipleGain: -f.delta, valueGain: Math.round(uplift) };
    })
    .sort((a, b) => b.valueGain - a.valueGain);

  if (sdeValue !== null && arrValue !== null && Math.abs(sdeValue - arrValue) / Math.max(sdeValue, arrValue) > 0.4) {
    findings.push({ severity: "medium", title: "The two methods disagree", detail: `The SDE method gives ${money(sdeValue)} and the ARR method gives ${money(arrValue)}. Buyers of profitable businesses lean on SDE; buyers of growth lean on ARR. Expect the offer to land nearer whichever your buyer cares about.` });
  }
  if (topShare >= 30) findings.push({ severity: "high", title: "Concentration will be discounted", detail: `${topShare}% of revenue from one source is the first thing a buyer's diligence tests. Show contract terms or a history of that source to protect the multiple.` });
  if (ownerHours > 40) findings.push({ severity: "medium", title: "Owner dependence lowers the price", detail: `At ${ownerHours} hours a week, a buyer prices in hiring your replacement. Documenting processes and handing off tasks before listing raises the multiple.` });
  if (ageMonths < 12) findings.push({ severity: "medium", title: "Under a year of history", detail: "Buyers rarely pay full multiples on less than 12 months of trading. Consider waiting or expect an earn-out." });
  if (type === "saas" && monthlyChurn > 5) findings.push({ severity: "high", title: "Churn is above what buyers accept", detail: `${monthlyChurn}% monthly churn loses about ${Math.round((1 - Math.pow(1 - monthlyChurn / 100, 12)) * 100)}% of customers a year. Expect a heavy discount or a deal structured on future retention.` });
  if (growth < -10) findings.push({ severity: "high", title: "Shrinking revenue", detail: "A declining business is priced on what it will earn next, not what it earned last year." });
  findings.push({ severity: "info", title: "This is a starting range, not an appraisal", detail: "Actual sales depend on the buyer, the marketplace, deal structure and diligence. Ask a business broker or accountant before you set an asking price." });

  return {
    type, typeLabel: t.label, revenue, sde, arr, mrr: mrr || null, sdeMult, arrMult, sdeValue, arrValue,
    low, mid, high, factors: fs, levers, findings,
    netMid: mid * (1 - fee), sellingFeePct: fee * 100,
    revenueMult: revenue > 0 ? mid / revenue : null,
    buyerPaybackYears: sde > 0 ? mid / sde : null,
    buyerAnnualReturn: sde > 0 ? sde / mid : null,
    askingHint: high * 1.1,
  };
}

export function sampleText() {
  return { type: "saas", revenue: 240000, sde: 96000, mrr: 20000, growth: 32, monthlyChurn: 2.5, topShare: 12, ownerHours: 25, ageMonths: 40, sellingFeePct: 10 };
}

export const money = (x) => (Number.isFinite(x) ? "$" + Math.round(x).toLocaleString("en-US") : "n/a");
export const multiple = (x) => (Number.isFinite(x) ? x.toFixed(2) + "x" : "n/a");
export const pct = (x, d = 1) => (Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "n/a");

export function reportCsv(r) {
  const rows = [
    ["metric", "value"],
    ["business_type", r.typeLabel], ["revenue_ttm", r.revenue], ["sde_ttm", r.sde], ["arr", r.arr ?? ""],
    ["sde_multiple", r.sdeMult], ["arr_multiple", r.arrMult ?? ""],
    ["value_low", Math.round(r.low)], ["value_mid", Math.round(r.mid)], ["value_high", Math.round(r.high)],
    ["net_to_seller_mid", Math.round(r.netMid)], ["selling_fee_pct", r.sellingFeePct],
    ...r.factors.map((f) => [`factor_${f.key}`, f.delta]),
  ];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
