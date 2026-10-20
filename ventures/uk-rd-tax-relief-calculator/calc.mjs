// UK R&D tax relief (merged scheme from 1 April 2024): the R&D expenditure
// credit (RDEC), enhanced support for R&D-intensive loss-making companies
// (ERIS), what the claim is worth in cash or tax, and what an adviser's fee
// would take. Browser-only. Not tax advice.

// Rates as understood for accounting periods from 1 April 2024. Verify on GOV.UK.
export const RATES = {
  rdec: 0.20,
  notionalTax: 0.19,
  mainRate: 0.25,
  smallRate: 0.19,
  smallLimit: 50000,
  mainLimit: 250000,
  erisExtra: 0.86,
  erisCredit: 0.145,
  intensity: 0.30,
  outsourceFactor: 0.65,
  capBase: 20000,
  capMultiple: 3,
};

export const SAMPLE = {
  staff: "180000", epw: "30000", subcontract: "20000", consumables: "6000",
  software: "12000", cloud: "9000", profit: "-150000", totalSpend: "420000",
  payeNic: "64000", feePct: "18",
};

const FIELDS = ["staff", "epw", "subcontract", "consumables", "software", "cloud", "totalSpend", "payeNic", "feePct"];
const round2 = (n) => Math.round(n * 100) / 100;
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");

// Corporation tax rate on profit (with marginal relief between the limits).
export function effectiveRate(profit) {
  if (profit <= RATES.smallLimit) return RATES.smallRate;
  if (profit >= RATES.mainLimit) return RATES.mainRate;
  const tax = RATES.mainRate * profit - (3 / 200) * (RATES.mainLimit - profit);
  return tax / profit;
}

export function compute(raw) {
  const errors = [];
  const num = (k, label) => {
    const s = String(raw[k] ?? "").trim();
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n) || n < 0) { errors.push(`${label} must be a number of 0 or more.`); return 0; }
    return n;
  };
  const labels = { staff: "Staff costs", epw: "Externally provided workers", subcontract: "Subcontractor costs", consumables: "Consumables", software: "Software", cloud: "Data and cloud", totalSpend: "Total company expenditure", payeNic: "PAYE and NIC", feePct: "Adviser fee" };
  const v = {};
  for (const k of FIELDS) v[k] = num(k, labels[k]);
  const ps = String(raw.profit ?? "").trim();
  v.profit = ps === "" ? 0 : Number(ps);
  if (!Number.isFinite(v.profit)) errors.push("Profit or loss must be a number (negative for a loss).");
  if (v.feePct > 100) errors.push("Adviser fee must be a percentage up to 100.");
  if (errors.length) return { errors };

  const f = RATES.outsourceFactor;
  const lines = [
    { key: "staff", label: "Staff (salary, employer NIC, pension)", spent: v.staff, qualifying: v.staff },
    { key: "epw", label: "Externally provided workers", spent: v.epw, qualifying: v.epw * f },
    { key: "subcontract", label: "Subcontractors", spent: v.subcontract, qualifying: v.subcontract * f },
    { key: "consumables", label: "Consumables (power, water, materials)", spent: v.consumables, qualifying: v.consumables },
    { key: "software", label: "Software", spent: v.software, qualifying: v.software },
    { key: "cloud", label: "Data and cloud", spent: v.cloud, qualifying: v.cloud },
  ];
  const qualifying = round2(lines.reduce((s, l) => s + l.qualifying, 0));
  const loss = v.profit < 0;
  const cap = RATES.capBase + RATES.capMultiple * v.payeNic;
  const intensity = v.totalSpend > 0 ? qualifying / v.totalSpend : 0;
  const intensive = intensity >= RATES.intensity;

  // Merged scheme RDEC.
  const gross = qualifying * RATES.rdec;
  let rdec;
  if (loss) {
    const net = gross * (1 - RATES.notionalTax);
    const paid = Math.min(net, cap);
    rdec = { kind: "cash", gross, net, benefit: round2(paid), capped: net > cap, carried: round2(net - paid), rate: RATES.notionalTax };
  } else {
    const rate = effectiveRate(Math.max(v.profit, 0) + gross);
    rdec = { kind: "tax", gross, net: gross * (1 - rate), benefit: round2(gross * (1 - rate)), capped: false, carried: 0, rate };
  }

  // ERIS: R&D-intensive loss makers only.
  let eris = null;
  if (loss && intensive) {
    const extra = qualifying * RATES.erisExtra;
    const surrenderable = Math.min(-v.profit + extra, qualifying * (1 + RATES.erisExtra));
    const credit = surrenderable * RATES.erisCredit;
    const paid = Math.min(credit, cap);
    eris = { extra, surrenderable, credit, benefit: round2(paid), capped: credit > cap };
  }

  const best = eris && eris.benefit > rdec.benefit ? "eris" : "rdec";
  const bestBenefit = best === "eris" ? eris.benefit : rdec.benefit;
  const fee = round2(bestBenefit * v.feePct / 100);

  const findings = [];
  if (qualifying === 0) findings.push({ severity: "high", title: "Nothing qualifies yet: enter the staff, subcontractor, software and cloud costs spent on the R&D project." });
  if (v.epw + v.subcontract > 0) findings.push({ severity: "info", title: `Only ${Math.round(f * 100)}% of payments to subcontractors and externally provided workers counts. Payments to connected parties follow different rules and are not modelled.` });
  if (loss && !intensive && v.totalSpend > 0) findings.push({ severity: "medium", title: `Your qualifying R&D is ${(intensity * 100).toFixed(1)}% of total spend; ERIS needs ${Math.round(RATES.intensity * 100)}% or more. Without it, a loss-maker gets the merged-scheme credit at about ${(RATES.rdec * (1 - RATES.notionalTax) * 100).toFixed(1)}p per £1.` });
  if (loss && !intensive && v.totalSpend === 0) findings.push({ severity: "info", title: "Enter total company expenditure to test whether you pass the 30% R&D-intensity condition for ERIS." });
  if (eris && best === "eris") findings.push({ severity: "high", title: `ERIS beats the merged scheme here by ${money0(eris.benefit - rdec.benefit)} because you are loss-making and R&D-intensive.` });
  if (rdec.capped || (eris && eris.capped)) findings.push({ severity: "high", title: `The payable credit is capped at £20,000 plus 300% of PAYE and NIC, ${money0(cap)} for you. Anything above carries forward instead of being paid.` });
  if (loss && v.payeNic === 0) findings.push({ severity: "medium", title: "With no PAYE and NIC the payable credit is capped at £20,000. Enter your PAYE and NIC if you pay staff." });
  if (!loss) findings.push({ severity: "info", title: `Profitable companies get the credit as a reduction in corporation tax at about ${(rdec.rate * 100).toFixed(1)}% notional tax, so the net benefit is ${(RATES.rdec * (1 - rdec.rate) * 100).toFixed(1)}p per £1 of qualifying cost.` });
  if (v.feePct > 0 && bestBenefit > 0) findings.push({ severity: "info", title: `An adviser fee of ${v.feePct}% on ${money0(bestBenefit)} is ${money0(fee)}. Ask whether the fee is on the claim or on what HMRC actually pays, and who handles an HMRC enquiry.` });
  findings.push({ severity: "info", title: "Since August 2023 you must send HMRC an Additional Information Form before the CT600 and, if you have not claimed in the last three years, a claim notification within six months of the period end." });

  const obligations = [
    { title: "Check the project qualifies", why: "R&D must seek an advance in science or technology by resolving scientific or technological uncertainty. Routine development, new features that use known methods and market research do not qualify." },
    { title: "Report before you file", why: "Submit the Additional Information Form to HMRC first, then claim in the CT600 company tax return. A first-time claimant also files a claim notification form." },
    { title: "Apportion staff time", why: "Only the time spent directly on qualifying work counts. Keep timesheets or a sound estimate by person and project." },
    { title: "Check the rates", why: "Rates here follow the April 2024 merged scheme and were entered from memory. Confirm on GOV.UK before you file." },
  ];

  return { errors: [], lines, qualifying, loss, cap, intensity, intensive, rdec, eris, best, bestBenefit, fee, findings, obligations, profit: v.profit, feePct: v.feePct };
}

export function summaryText(r) {
  return [
    "UK R&D tax relief (merged scheme, periods from April 2024)",
    `Qualifying R&D spend: ${money0(r.qualifying)}  R&D intensity: ${(r.intensity * 100).toFixed(1)}%`,
    `Merged-scheme credit: gross ${money0(r.rdec.gross)}, worth ${money0(r.rdec.benefit)} as ${r.rdec.kind === "cash" ? "cash" : "tax saved"}`,
    r.eris ? `ERIS (R&D-intensive loss-maker): worth ${money0(r.eris.benefit)} in cash` : "ERIS: not available",
    `Best route: ${r.best === "eris" ? "ERIS" : "merged scheme"}  Value: ${money0(r.bestBenefit)}`,
    `Adviser fee at ${r.feePct}%: ${money0(r.fee)}`,
    "Not tax advice. Verify rates on GOV.UK.",
  ].join("\n");
}
