// UK Enterprise Investment Scheme (EIS) and Seed EIS (SEIS) tax relief for an
// individual investor: income tax relief (capped at the tax you owe), CGT
// deferral (EIS) or reinvestment relief (SEIS), loss relief if the company
// fails, and the exit price you need to break even. Browser-only. Not tax advice.

// Rates and limits as understood for 2025/26. Verify on GOV.UK.
export const RATES = {
  eis: { relief: 0.30, limit: 1000000, kicLimit: 2000000 },
  seis: { relief: 0.50, limit: 200000, cgtExempt: 0.50 },
};

export const SAMPLE = {
  scheme: "seis", kic: "no", invest: "50000", liability: "30000",
  gain: "40000", cgtRate: "24", proceeds: "0", marginal: "45",
};

const round2 = (n) => Math.round(n * 100) / 100;
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");

export function compute(raw) {
  const errors = [];
  const num = (k, label, max) => {
    const s = String(raw[k] ?? "").trim();
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n) || n < 0) { errors.push(`${label} must be a number of 0 or more.`); return 0; }
    if (max !== undefined && n > max) { errors.push(`${label} must be ${max} or less.`); return 0; }
    return n;
  };
  const scheme = raw.scheme === "seis" ? "seis" : "eis";
  const kic = raw.kic === "yes";
  const v = {
    invest: num("invest", "Amount invested"),
    liability: num("liability", "Income tax you owe for the year"),
    gain: num("gain", "Capital gain"),
    cgtRate: num("cgtRate", "CGT rate", 100),
    proceeds: num("proceeds", "Sale proceeds", 1e12),
    marginal: num("marginal", "Marginal income tax rate", 100),
  };
  if (errors.length) return { errors };

  const r = RATES[scheme];
  const limit = scheme === "eis" && kic ? r.kicLimit : r.limit;
  const eligible = Math.min(v.invest, limit);
  const gross = round2(eligible * r.relief);
  const relief = round2(Math.min(gross, v.liability));
  const unused = round2(gross - relief);
  const netCost = round2(v.invest - relief);

  // CGT: EIS defers the gain (no saving unless it is never crystallised);
  // SEIS exempts half of the gain reinvested, a real saving.
  const cgtRate = v.cgtRate / 100;
  let cgt;
  if (scheme === "eis") {
    const deferredGain = Math.min(v.gain, v.invest);
    cgt = { kind: "deferred", gain: deferredGain, value: round2(deferredGain * cgtRate), saved: 0 };
  } else {
    const reinvested = Math.min(v.gain, eligible);
    const exempt = reinvested * r.cgtExempt;
    cgt = { kind: "exempt", gain: exempt, value: round2(exempt * cgtRate), saved: round2(exempt * cgtRate) };
  }

  // Loss relief: the loss net of income tax relief is set against income.
  const lossBase = Math.max(v.invest - relief - v.proceeds, 0);
  const lossRelief = round2(lossBase * (v.marginal / 100));
  const outOfPocket = round2(Math.max(netCost - cgt.saved - v.proceeds - lossRelief, 0));
  const worstCaseCash = round2(Math.max(netCost - cgt.saved - lossRelief, 0));
  const worstCasePct = v.invest > 0 ? worstCaseCash / v.invest : 0;
  const m = v.marginal / 100;
  const breakEven = m < 1 ? round2(Math.max(netCost - cgt.saved / (1 - m), 0)) : 0;
  // Total-loss version of the same result, independent of the proceeds entered.
  const totalLossLossRelief = round2(Math.max(v.invest - relief, 0) * m);
  const totalLossNet = round2(Math.max(v.invest - relief - cgt.saved - totalLossLossRelief, 0));

  const findings = [];
  if (v.invest === 0) findings.push({ severity: "high", title: "Enter the amount you plan to invest." });
  if (v.invest > limit) findings.push({ severity: "high", title: `Relief is capped at ${money0(limit)} of investment a year${scheme === "eis" && !kic ? "; the limit doubles to £2,000,000 only for the part above £1,000,000 that goes into knowledge-intensive companies" : ""}. The extra ${money0(v.invest - limit)} gets no income tax relief.` });
  if (unused > 0) findings.push({ severity: "high", title: `You would lose ${money0(unused)} of relief: it cannot exceed the income tax you owe. You can ask to carry the investment back to the previous tax year, or invest less.` });
  if (scheme === "eis" && v.gain > 0) findings.push({ severity: "info", title: `EIS deferral postpones tax on ${money0(cgt.gain)} of gain (about ${money0(cgt.value)} at ${v.cgtRate}%). It comes back when the shares are sold or stop qualifying; it is a delay, not a saving.` });
  if (scheme === "seis" && cgt.saved > 0) findings.push({ severity: "medium", title: `SEIS reinvestment relief exempts half of ${money0(Math.min(v.gain, eligible))} of gain, saving ${money0(cgt.saved)} of CGT.` });
  findings.push({ severity: "medium", title: `If the company fails and the shares are worth nothing, loss relief at ${v.marginal}% leaves you about ${money0(totalLossNet)} out of pocket on ${money0(v.invest)} invested (${v.invest > 0 ? (totalLossNet / v.invest * 100).toFixed(0) : 0}%).` });
  findings.push({ severity: "info", title: "Hold the shares at least three years or the income tax relief is withdrawn. Gains on qualifying shares sold after three years are free of CGT." });
  findings.push({ severity: "info", title: "Most early-stage companies fail. The relief reduces the downside; it does not remove it, and it does not make a poor investment a good one." });

  const obligations = [
    { title: "Check the company qualifies", why: "Ask the company for its advance assurance letter from HMRC. Age, size, trade, employee and funding limits decide whether the shares count." },
    { title: "Check you qualify", why: "You must not be connected to the company: a stake of 30% or more, or being a paid director or employee beyond the permitted cases, usually rules you out." },
    { title: "Claim with the compliance certificate", why: "After the company trades, it sends you an EIS3 or SEIS3 certificate. Claim through your Self Assessment return or by asking HMRC to change your tax code." },
    { title: "Check the rates", why: "Limits and rates here were entered from memory for 2025/26. Confirm on GOV.UK before you invest." },
  ];

  return { errors: [], scheme, kic, limit, eligible, gross, relief, unused, netCost, cgt, lossBase, lossRelief, outOfPocket, worstCaseCash, worstCasePct, breakEven, totalLossNet, findings, obligations, invest: v.invest, proceeds: v.proceeds, marginal: v.marginal };
}

export function summaryText(r) {
  return [
    `UK ${r.scheme.toUpperCase()} tax relief (individual investor)`,
    `Invested: ${money0(r.invest)}  Eligible for relief: ${money0(r.eligible)}`,
    `Income tax relief: ${money0(r.relief)}${r.unused ? ` (${money0(r.unused)} lost to your tax bill)` : ""}`,
    `Cost after income tax relief: ${money0(r.netCost)}`,
    `${r.cgt.kind === "deferred" ? "CGT deferred" : "CGT saved"}: ${money0(r.cgt.value)}`,
    `Out of pocket in a total loss, after loss relief: ${money0(r.totalLossNet)}`,
    `Sale price that gets you back to even: ${money0(r.breakEven)}`,
    "Not tax advice. Verify rates on GOV.UK.",
  ].join("\n");
}
