// Illustrative estimate of the federal research credit (IRC Section 41) for a
// small company, with the qualified-small-business payroll-tax offset
// (Section 41(h)). No network calls. NOT tax advice: whether an activity is
// "qualified research" is a facts-and-documentation question a preparer must
// answer, and every figure here is a stated assumption, not a verified number.
//
// Model (deliberately simplified, and labelled as such on the page):
//   QREs = wages x share of time spent on qualified research
//        + supplies used in that research
//        + 65% of amounts paid to US contractors for it
//   Regular credit = 20% x (QREs - base amount)
//     base amount = max(fixed-base % x average gross receipts of the prior
//     four years, 50% of current QREs)
//   Alternative simplified credit (ASC) = 14% x (QREs - 50% x average QREs of
//     the prior three years); 6% of QREs when any of those three years had none
//   Credit used = the larger of the two. Section 280C then costs
//     credit x tax rate (either a reduced credit or a reduced deduction).
//   Payroll offset (qualified small business: gross receipts under $5 million
//     this year and first receipts within the last five years) = up to
//     $250,000 against the employer Social Security tax plus up to $250,000
//     against the employer Medicare tax, never more than the payroll tax paid.

export const ASSUMPTIONS = {
  regularRate: 0.2,
  ascRate: 0.14,
  ascNoHistoryRate: 0.06,
  baseMinShare: 0.5,
  ascBaseShare: 0.5,
  startupFixedBase: 0.03,
  contractShare: 0.65,
  corporateRate: 0.21,
  passThroughRate: 0.37,
  offsetSocialSecurityCap: 250_000,
  offsetMedicareCap: 250_000,
  smallBusinessReceiptsCap: 5_000_000,
  smallBusinessYears: 5,
  socialSecurityRate: 0.062,
  medicareRate: 0.0145,
  socialSecurityWageBase: 184_500,
  heavyTimeShare: 0.9,
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Math.round(Number(n) || 0);
  const text = `$${Math.abs(value).toLocaleString("en-US")}`;
  return value < 0 ? `-${text}` : text;
}

/**
 * Parse pasted staff lines: `name, annual wages, % of time on qualified research`.
 * Comma, tab or semicolon separated; an optional header line and $ or % signs are
 * tolerated. Lines that cannot be read are returned in `errors`, never dropped.
 */
export function parseEmployees(text) {
  const rows = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    // Tabs and semicolons split cleanly; with commas, wages may themselves
    // contain thousands separators, so read the last two fields from the end.
    let name, wageCell, pctCell;
    if (/[\t;]/.test(line)) {
      const cells = line.split(/[\t;]/).map((c) => c.trim());
      pctCell = cells[cells.length - 1];
      wageCell = cells[cells.length - 2];
      name = cells.slice(0, -2).join(" ").trim();
      if (cells.length < 3) { wageCell = undefined; }
    } else {
      const m = line.match(/^(.*?),\s*(\$?\s*[\d,]*\.?\d+|[^,]*?)\s*,\s*([^,]*)$/);
      if (m) [, name, wageCell, pctCell] = m;
    }
    if (wageCell === undefined || pctCell === undefined) {
      if (i === 0 && !/\d/.test(line)) return; // header row
      errors.push({ line: i + 1, text: line, reason: "needs name, wages and % of time" });
      return;
    }
    const wages = Number(wageCell.replace(/[$,\s]/g, ""));
    let pct = Number(pctCell.replace(/[%\s]/g, ""));
    if (wageCell === "" || pctCell === "" || !Number.isFinite(wages) || !Number.isFinite(pct)) {
      if (i === 0 && !/\d/.test(wageCell + pctCell)) return; // header row
      errors.push({ line: i + 1, text: line, reason: "wages or % is not a number" });
      return;
    }
    if (pct > 0 && pct <= 1 && !pctCell.includes("%") && pctCell.includes(".")) pct *= 100;
    if (pct < 0 || pct > 100 || wages < 0) {
      errors.push({ line: i + 1, text: line, reason: "wages must be 0 or more and % between 0 and 100" });
      return;
    }
    rows.push({ name: name || `Person ${rows.length + 1}`, wages, share: pct / 100 });
  });
  return { rows, errors };
}

function qresFor(input) {
  const staff = parseEmployees(input.employeesText);
  const wageQre = staff.rows.reduce((s, r) => s + r.wages * r.share, 0);
  const supplies = Math.max(0, num(input.supplies));
  const contractPaid = Math.max(0, num(input.contractors));
  const contractQre = contractPaid * ASSUMPTIONS.contractShare;
  return { staff, wageQre, supplies, contractPaid, contractQre, total: wageQre + supplies + contractQre };
}

/** Regular credit with the fixed-base-percentage method. */
export function regularCredit({ qres, avgGrossReceipts, fixedBasePct }) {
  const a = ASSUMPTIONS;
  const fixed = fixedBasePct === undefined || fixedBasePct === null || fixedBasePct === "" ? a.startupFixedBase : num(fixedBasePct);
  const receiptsBase = Math.max(0, fixed) * Math.max(0, num(avgGrossReceipts));
  const floor = a.baseMinShare * qres;
  const base = Math.max(receiptsBase, floor);
  return { credit: a.regularRate * Math.max(0, qres - base), base, floorApplied: floor >= receiptsBase };
}

/** Alternative simplified credit. `prior` holds the QREs of the three prior years. */
export function simplifiedCredit({ qres, prior }) {
  const a = ASSUMPTIONS;
  const years = [0, 1, 2].map((i) => Math.max(0, num((prior ?? [])[i])));
  if (years.some((y) => y === 0)) {
    return { credit: a.ascNoHistoryRate * qres, base: 0, noHistory: true };
  }
  const base = a.ascBaseShare * (years[0] + years[1] + years[2]) / 3;
  return { credit: a.ascRate * Math.max(0, qres - base), base, noHistory: false };
}

/** Qualified-small-business payroll-tax offset, capped by the payroll tax actually paid. */
export function payrollOffset({ credit, grossReceipts, yearsSinceFirstReceipts, staffWages, otherPayroll }) {
  const a = ASSUMPTIONS;
  const receipts = num(grossReceipts);
  const age = num(yearsSinceFirstReceipts);
  const eligible = receipts < a.smallBusinessReceiptsCap && age < a.smallBusinessYears;
  const socialSecurityBase = (staffWages ?? []).reduce((s, w) => s + Math.min(Math.max(0, w), a.socialSecurityWageBase), 0)
    + Math.max(0, num(otherPayroll));
  const medicareBase = (staffWages ?? []).reduce((s, w) => s + Math.max(0, w), 0) + Math.max(0, num(otherPayroll));
  const ssCapacity = a.socialSecurityRate * socialSecurityBase;
  const medicareCapacity = a.medicareRate * medicareBase;
  if (!eligible) return { eligible, socialSecurity: 0, medicare: 0, total: 0, ssCapacity, medicareCapacity, carryforward: credit };
  const socialSecurity = Math.min(credit, a.offsetSocialSecurityCap, ssCapacity);
  const medicare = Math.min(credit - socialSecurity, a.offsetMedicareCap, medicareCapacity);
  const total = socialSecurity + medicare;
  return { eligible, socialSecurity, medicare, total, ssCapacity, medicareCapacity, carryforward: credit - total };
}

export function rdCreditEstimate(input = {}) {
  const a = ASSUMPTIONS;
  const q = qresFor(input);
  const qres = q.total;
  const regular = regularCredit({ qres, avgGrossReceipts: input.avgGrossReceipts, fixedBasePct: input.fixedBasePct });
  const simplified = simplifiedCredit({ qres, prior: input.priorQres });
  const method = simplified.credit > regular.credit ? "simplified" : "regular";
  const gross = Math.max(regular.credit, simplified.credit);
  const taxRate = input.taxRate === undefined || input.taxRate === "" || input.taxRate === null
    ? (input.entity === "pass-through" ? a.passThroughRate : a.corporateRate)
    : Math.min(Math.max(num(input.taxRate), 0), 0.6);
  const reducedCredit = gross * (1 - taxRate);
  const staffWages = q.staff.rows.map((r) => r.wages);
  const offset = payrollOffset({
    credit: gross,
    grossReceipts: input.grossReceipts,
    yearsSinceFirstReceipts: input.yearsSinceFirstReceipts,
    staffWages,
    otherPayroll: input.otherPayroll,
  });
  const marginalPer10k = (() => {
    if (qres <= 0) return 0;
    const bumped = { ...input, contractors: Math.max(0, num(input.contractors)) + 10_000 / a.contractShare };
    const b = qresFor(bumped).total;
    const r2 = regularCredit({ qres: b, avgGrossReceipts: input.avgGrossReceipts, fixedBasePct: input.fixedBasePct }).credit;
    const s2 = simplifiedCredit({ qres: b, prior: input.priorQres }).credit;
    return Math.max(r2, s2) - gross;
  })();

  const findings = [];
  const heavy = q.staff.rows.filter((r) => r.share >= a.heavyTimeShare && r.wages > 0);
  if (heavy.length) {
    findings.push({
      severity: "medium",
      title: `${heavy.length} ${heavy.length === 1 ? "person is" : "people are"} claimed at ${Math.round(a.heavyTimeShare * 100)}%+ of their time`,
      detail: "Very high time shares draw questions in an exam. Only wages for qualified services count, and each share needs a record made at the time (timesheets, tickets, commits, sprint boards), not a guess at filing.",
    });
  }
  if (q.staff.errors.length) {
    findings.push({
      severity: "high",
      title: `${q.staff.errors.length} staff ${q.staff.errors.length === 1 ? "line was" : "lines were"} not read`,
      detail: `These lines are NOT in the estimate: ${q.staff.errors.map((e) => `line ${e.line} (${e.reason})`).join("; ")}.`,
    });
  }
  if (qres <= 0) {
    findings.push({ severity: "info", title: "No qualified spending entered", detail: "Add staff lines, supplies or contractor costs to see a credit." });
  }
  if (simplified.noHistory) {
    findings.push({
      severity: "info",
      title: "Simplified credit uses the 6% no-history rate",
      detail: "One of the three prior years had no qualified spending, so the simplified method is 6% of this year's QREs. From the fourth year with QREs the 14% formula applies and the credit usually rises.",
    });
  }
  if (offset.eligible) {
    findings.push({
      severity: "info",
      title: "May qualify for the payroll-tax offset",
      detail: `Under $5 million of receipts and first receipts within five years. Up to ${money(a.offsetSocialSecurityCap)} offsets employer Social Security tax and up to ${money(a.offsetMedicareCap)} more offsets employer Medicare tax. It is elected on the return and takes effect against payroll tax after that return is filed.`,
    });
    if (offset.carryforward > 1) {
      findings.push({
        severity: "medium",
        title: `${money(offset.carryforward)} of the credit exceeds the payroll offset`,
        detail: "That part is not lost: an unused credit carries forward against later income tax or later payroll-tax offsets, subject to the same caps. Your payroll tax paid is the limit here, so add other payroll if you left staff out.",
      });
    }
  } else if (gross > 0) {
    findings.push({
      severity: "info",
      title: "Payroll offset not available on these inputs",
      detail: "The offset needs under $5 million of gross receipts this year and first gross receipts within the last five years. Without it the credit is used against income tax, and a company with no income tax carries it forward.",
    });
  }
  if (q.contractPaid > 0) {
    findings.push({
      severity: "info",
      title: "Contractor cost counted at 65%",
      detail: "Only amounts for research performed in the US, where you keep the risk and rights in the results, count, and only at 65%. Confirm each contract before you rely on this line.",
    });
  }
  findings.push({
    severity: "info",
    title: "Software work is tested more closely",
    detail: "Software built mainly for your own internal use must also clear a high-threshold-of-innovation test. Software sold or licensed to customers is treated as ordinary product development.",
  });

  return {
    qres,
    wageQre: q.wageQre,
    supplies: q.supplies,
    contractQre: q.contractQre,
    contractPaid: q.contractPaid,
    staff: q.staff,
    regular,
    simplified,
    method,
    grossCredit: gross,
    taxRate,
    reducedCredit,
    section280cCost: gross - reducedCredit,
    offset,
    marginalPer10k,
    findings,
  };
}
