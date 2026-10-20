// Wage garnishment limit calculator: the federal arithmetic of the Consumer
// Credit Protection Act, Title III (15 U.S.C. 1671-1677) on the numbers a
// worker types in from a pay stub. Pure functions, whole cents, no I/O.
//
// The model, per pay period:
//   * disposable earnings = gross pay minus amounts required BY LAW to be
//     withheld (income taxes, Social Security and Medicare, state
//     unemployment or disability insurance, mandatory government pension).
//     Health insurance, voluntary retirement and union dues are not subtracted.
//   * ordinary debt (credit card, medical, judgment): at most the LESSER of
//     25% of disposable earnings, or disposable earnings above 30 times the
//     federal minimum wage per week (1673(a)).
//   * defaulted federal student loan (administrative garnishment, 31 CFR
//     285.11 and 34 CFR 34.4): the lesser of 15% of disposable earnings or
//     disposable earnings above 30 times the minimum wage per week.
//   * child support or alimony: 50% of disposable earnings when supporting
//     another spouse or child, 60% when not; 5 points more when the arrears
//     are over 12 weeks old (1673(b)).
//   * all garnishments together may not exceed the support percentage, and
//     student loan plus ordinary debt together may not exceed 25%.
//
// Federal law is a floor. Many states protect more, and a few forbid
// garnishing wages for ordinary debt; a state limit can be typed in. Federal
// tax levies, bankruptcy plans and government benefit offsets follow other
// rules and are not modelled. It cannot see the court order or the payroll
// worksheet, so every result is a question, never a finding of an error.

export const CITATIONS = {
  disposable: "15 U.S.C. 1672(b): disposable earnings are earnings left after deductions required by law",
  ordinary: "15 U.S.C. 1673(a): the lesser of 25% of disposable earnings or the excess over 30 times the federal minimum wage per week",
  student: "31 CFR 285.11(i) and 34 CFR 34.4: administrative garnishment for a defaulted federal student loan is capped at 15% of disposable pay",
  support: "15 U.S.C. 1673(b): 50% or 60% of disposable earnings for support, 5 points more for arrears over 12 weeks",
  combined: "15 U.S.C. 1673 and 29 CFR 870.10: the caps apply to all garnishments together, with support taking priority",
  firing: "15 U.S.C. 1674: an employer may not fire a worker over garnishment for one debt",
};

// Weeks of the federal floor that apply to each pay period (29 CFR 870.10).
export const PERIODS = {
  weekly: { label: "Weekly", weeks: 1, perYear: 52 },
  biweekly: { label: "Every two weeks", weeks: 2, perYear: 26 },
  semimonthly: { label: "Twice a month", weeks: 65 / 30, perYear: 24 },
  monthly: { label: "Monthly", weeks: 130 / 30, perYear: 12 },
};

export const FEDERAL_MIN_WAGE = 7.25;

export const ORDER_TYPES = {
  none: "(none)",
  ordinary: "Ordinary debt or civil judgment",
  student: "Defaulted federal student loan",
  support: "Child support or alimony",
};

const cents = (n) => Math.round(Number(n) * 100);
const fromCents = (c) => c / 100;

export function money(n) {
  return (Math.round(Number(n) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// One decimal point, commas as thousands separators, optional $ and
// parentheses for negatives. "1.234,50" is not guessed at.
export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const field = (v, label, { required = false, min = 0 } = {}) => {
  if (v === undefined || v === null || String(v).trim() === "") {
    return required ? { error: `${label} is required.` } : { value: null };
  }
  const n = parseMoney(v);
  if (n === null) return { error: `${label} is not a number I can read. Use digits like 1,250.50.` };
  if (n < min) return { error: `${label} cannot be below ${min}.` };
  return { value: n };
};

export function normalizeInput(raw = {}) {
  const period = PERIODS[raw.period] ? raw.period : null;
  if (!period) return { error: "Choose how often you are paid." };
  const errors = [];
  const take = (v, label, opts) => { const r = field(v, label, opts); if (r.error) errors.push(r.error); return r.value ?? null; };
  const gross = take(raw.gross, "Gross pay for the period", { required: true });
  const fedTax = take(raw.fedTax, "Federal income tax withheld");
  const stateTax = take(raw.stateTax, "State and local income tax withheld");
  const fica = take(raw.fica, "Social Security and Medicare withheld");
  const otherRequired = take(raw.otherRequired, "Other deductions required by law");
  const voluntary = take(raw.voluntary, "Voluntary deductions");
  const minWage = take(raw.minWage, "Federal minimum wage") ?? FEDERAL_MIN_WAGE;
  const stateLimitPct = take(raw.stateLimitPct, "State limit percent");
  const stated = take(raw.statedWithheld, "Amount withheld on the stub");
  if (stateLimitPct !== null && stateLimitPct > 100) errors.push("State limit percent cannot be above 100.");
  const orders = [];
  for (const o of raw.orders || []) {
    if (!o || !ORDER_TYPES[o.type] || o.type === "none") continue;
    const demand = field(o.demand, "Amount the order asks per period");
    if (demand.error) errors.push(demand.error);
    orders.push({ type: o.type, demand: demand.value ?? null });
  }
  if (errors.length) return { error: errors[0] };
  const required = (fedTax || 0) + (stateTax || 0) + (fica || 0) + (otherRequired || 0);
  if (required > gross) return { error: "Deductions required by law are larger than gross pay. Check the stub." };
  return {
    input: {
      period, gross, fedTax: fedTax || 0, stateTax: stateTax || 0, fica: fica || 0, otherRequired: otherRequired || 0,
      voluntary: voluntary || 0, minWage, stateLimitPct, stated,
      supportsOther: raw.supportsOther !== false && raw.supportsOther !== "no",
      arrears12: raw.arrears12 === true || raw.arrears12 === "yes",
      orders,
    },
  };
}

// Federal floor in dollars for the period: 30 x minimum wage x weeks.
export function protectedFloor(period, minWage = FEDERAL_MIN_WAGE) {
  return fromCents(Math.round(30 * PERIODS[period].weeks * cents(minWage)));
}

export function supportPercent(supportsOther, arrears12) {
  return (supportsOther ? 50 : 60) + (arrears12 ? 5 : 0);
}

export function analyze(raw) {
  const n = normalizeInput(raw);
  if (n.error) return { error: n.error };
  const i = n.input;
  const grossC = cents(i.gross);
  const requiredC = cents(i.fedTax + i.stateTax + i.fica + i.otherRequired);
  const dispC = grossC - requiredC;
  const floorC = Math.round(30 * PERIODS[i.period].weeks * cents(i.minWage));
  const pct = (p) => Math.floor((dispC * p) / 100);
  const over = Math.max(0, dispC - floorC);
  const stateCapC = i.stateLimitPct === null ? Infinity : pct(i.stateLimitPct);

  const ordinaryCap = Math.min(pct(25), over);
  const studentCap = Math.min(pct(15), over);
  const supportPct = supportPercent(i.supportsOther, i.arrears12);
  const supportCap = pct(supportPct);

  const byType = (t) => i.orders.filter((o) => o.type === t);
  const has = { support: byType("support").length > 0, student: byType("student").length > 0, ordinary: byType("ordinary").length > 0 };
  const results = [];
  let remainingAll = has.support ? supportCap : Infinity;
  let nonSupportUsed = 0;
  const order = ["support", "student", "ordinary"];
  for (const t of order) {
    for (const o of byType(t)) {
      const demandC = o.demand === null ? Infinity : cents(o.demand);
      let cap, reason;
      if (t === "support") {
        cap = Math.min(supportCap, remainingAll);
        reason = `${supportPct}% of disposable earnings (${i.supportsOther ? "supporting another spouse or child" : "not supporting another"}${i.arrears12 ? ", arrears over 12 weeks" : ""})`;
      } else if (t === "student") {
        cap = Math.min(studentCap, remainingAll, Math.max(0, pct(25) - nonSupportUsed));
        reason = studentCap === over && over < pct(15) ? "everything above the federal floor" : "15% of disposable earnings";
      } else {
        cap = Math.min(ordinaryCap - nonSupportUsed, remainingAll);
        reason = ordinaryCap === over && over < pct(25) ? "everything above the federal floor" : "25% of disposable earnings";
      }
      let limitedByState = false;
      if (t !== "support" && stateCapC < cap) { cap = Math.max(0, stateCapC - nonSupportUsed); limitedByState = true; }
      cap = Math.max(0, cap);
      const takeC = Math.min(cap, demandC);
      results.push({ type: t, demand: o.demand, cap: fromCents(cap), take: fromCents(takeC), reason, limitedByState });
      if (t === "support") remainingAll -= takeC; else { nonSupportUsed += takeC; remainingAll -= takeC; }
    }
  }
  const totalTakeC = results.reduce((s, r) => s + cents(r.take), 0);
  const voluntaryC = cents(i.voluntary);
  const netC = grossC - requiredC - voluntaryC - totalTakeC;
  const summary = {
    gross: i.gross,
    required: fromCents(requiredC),
    disposable: fromCents(dispC),
    floor: fromCents(floorC),
    ordinaryCap: fromCents(ordinaryCap),
    studentCap: fromCents(studentCap),
    supportPct,
    supportCap: fromCents(supportCap),
    totalTake: fromCents(totalTakeC),
    net: fromCents(netC),
    perYear: PERIODS[i.period].perYear,
    yearlyTake: fromCents(totalTakeC) * PERIODS[i.period].perYear,
    stated: i.stated,
    shielded: fromCents(dispC - totalTakeC),
    belowFloor: dispC <= floorC,
  };

  const findings = [];
  if (i.orders.length === 0) {
    findings.push({ severity: "info", title: "No garnishment entered", detail: "Add the order type to see the most that can be taken. The figures below are what each type could take from these numbers.", cite: CITATIONS.disposable });
  }
  if (summary.belowFloor && (has.ordinary || has.student)) {
    findings.push({ severity: "info", title: "Disposable earnings are at or below the federal floor", detail: `Disposable earnings of $${money(summary.disposable)} do not exceed $${money(summary.floor)} (30 times the minimum wage for this pay period), so federal law allows nothing to be taken for an ordinary debt or a federal student loan from this paycheck.`, cite: CITATIONS.ordinary });
  }
  if (i.stated !== null) {
    const statedC = cents(i.stated);
    if (statedC > totalTakeC) {
      const extra = fromCents(statedC - totalTakeC);
      findings.push({
        severity: "high",
        title: "The amount withheld is more than these numbers allow",
        detail: `The stub shows $${money(i.stated)} withheld; the most these numbers allow is $${money(summary.totalTake)}, a difference of $${money(extra)} a pay period, about $${money(extra * summary.perYear)} over a year if it repeats. This is a question for payroll: the difference can come from a different disposable-earnings figure (for example, a deduction it did not count as required), a second order, or a state rule.`,
        cite: CITATIONS.combined,
        amount: extra * summary.perYear,
      });
    } else if (statedC < totalTakeC && totalTakeC > 0) {
      findings.push({ severity: "info", title: "The amount withheld is below the federal maximum", detail: `The stub shows $${money(i.stated)} withheld against a federal maximum of $${money(summary.totalTake)}. That is normal when the order asks for less or the withholding is still catching up.`, cite: CITATIONS.combined });
    } else if (statedC === totalTakeC && totalTakeC > 0) {
      findings.push({ severity: "info", title: "The amount withheld matches these numbers", detail: "It matches the most that these inputs allow. That does not confirm the order, the state rule or the payroll worksheet.", cite: CITATIONS.combined });
    }
  }
  for (const r of results) {
    if (r.demand !== null && cents(r.demand) > cents(r.cap)) {
      findings.push({
        severity: "medium",
        title: `The ${ORDER_TYPES[r.type].toLowerCase()} asks for more than the limit`,
        detail: `The order asks for $${money(r.demand)} a pay period; at most $${money(r.cap)} can be taken (${r.reason}). Employers apply the limit; the balance is not lost, it stays owed and can be collected in other ways.`,
        cite: CITATIONS[r.type === "support" ? "support" : r.type === "student" ? "student" : "ordinary"],
        amount: fromCents(cents(r.demand) - cents(r.cap)) * summary.perYear,
      });
    }
    if (r.limitedByState) {
      findings.push({ severity: "info", title: "Your state limit is lower than the federal one", detail: "You entered a state limit below the federal cap. The lower limit applies to this order type when state law sets one. Confirm the exact rule for your state and order.", cite: CITATIONS.combined });
    }
  }
  if (i.voluntary > 0) {
    findings.push({ severity: "info", title: "Voluntary deductions do not reduce disposable earnings", detail: `You entered $${money(i.voluntary)} of voluntary deductions such as health insurance or a 401(k) contribution. Federal law does not subtract these, so the cap does not shrink; they come out of what is left after the garnishment.`, cite: CITATIONS.disposable });
  }
  if (has.ordinary && has.student) {
    findings.push({ severity: "info", title: "Student loan and ordinary debt share one 25% cap", detail: "When both are collected from the same paycheck, together they cannot exceed 25% of disposable earnings.", cite: CITATIONS.combined });
  }
  const order2 = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order2[a.severity] - order2[b.severity]);
  summary.questioned = findings.reduce((s, f) => s + (f.amount || 0), 0);
  const perType = {
    ordinary: fromCents(ordinaryCap),
    student: fromCents(studentCap),
    support: fromCents(supportCap),
  };
  return { input: i, summary, results, findings, perType };
}

// What does extra pay (overtime, a raise) actually leave after taxes and the
// garnishment? extraGross is in dollars for the same pay period; taxPercent
// is the withholding rate on that extra pay (default 25).
export function whatIf(raw, extraGross, taxPercent = 25) {
  const base = analyze(raw);
  if (base.error) return base;
  const extra = parseMoney(extraGross);
  if (extra === null || extra === 0) return { error: "Enter the extra pay for one pay period, like 300." };
  const t = taxPercent === "" || taxPercent === null || taxPercent === undefined ? 25 : parseMoney(taxPercent);
  if (t === null || t < 0 || t > 100) return { error: "Tax rate must be between 0 and 100." };
  const extraTax = Math.round(extra * t) / 100;
  const next = analyze({
    ...raw,
    gross: String(base.input.gross + extra),
    fedTax: String(base.input.fedTax + extraTax),
  });
  if (next.error) return next;
  const takeMore = next.summary.totalTake - base.summary.totalTake;
  const keepMore = next.summary.net - base.summary.net;
  return {
    extra, taxPercent: t, extraTax,
    takeBefore: base.summary.totalTake, takeAfter: next.summary.totalTake, takeMore,
    netBefore: base.summary.net, netAfter: next.summary.net, keepMore,
    keepShare: extra ? keepMore / extra : 0,
  };
}

export function requestLetter(a, who = {}) {
  const s = a.summary;
  const lines = [];
  lines.push(who.date || "");
  lines.push("");
  lines.push("To: Payroll / the party directing the garnishment");
  lines.push(who.name ? `From: ${who.name}` : "From: [your name]");
  if (who.case) lines.push(`Case or reference number: ${who.case}`);
  lines.push("");
  lines.push("Subject: Request for the garnishment calculation");
  lines.push("");
  lines.push("I am asking for the worksheet behind the amount withheld from my pay so that I can understand it. Please send:");
  lines.push("1. The disposable earnings figure used, and which deductions were counted as required by law.");
  lines.push("2. The percentage or formula applied, and the federal or state provision it relies on.");
  lines.push("3. The pay-period floor used (30 times the minimum wage per week) and the minimum wage rate used.");
  lines.push("4. Whether any other order is also being withheld from my pay, and in what order.");
  lines.push("");
  lines.push(`For comparison, using my pay stub and the federal Consumer Credit Protection Act formula, I get disposable earnings of $${money(s.disposable)} for the period and a federal maximum of $${money(s.totalTake)}${s.stated !== null ? `, against $${money(s.stated)} withheld` : ""}. My figures may differ from yours for reasons I cannot see, and I am asking, not alleging a mistake.`);
  lines.push("");
  lines.push("Please tell me if any state limit applies, and how to correct anything that needs correcting.");
  lines.push("");
  lines.push("Thank you.");
  return lines.join("\n").trim();
}

export function reportCsv(a) {
  const s = a.summary;
  const rows = [
    ["Item", "Amount"],
    ["Gross pay", s.gross],
    ["Deductions required by law", s.required],
    ["Disposable earnings", s.disposable],
    ["Federal floor (30 x minimum wage)", s.floor],
    ["Most that can be taken now", s.totalTake],
    ["Protected from garnishment", s.shielded],
    ["Estimated take-home after garnishment", s.net],
  ];
  for (const r of a.results) rows.push([`Cap: ${ORDER_TYPES[r.type]}`, r.cap]);
  rows.push([], ["Finding", "Detail"]);
  for (const f of a.findings) rows.push([f.title, f.detail]);
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(q).join(",")).join("\n");
}

export function sampleInput() {
  return {
    period: "biweekly",
    gross: "2000",
    fedTax: "210",
    stateTax: "80",
    fica: "153",
    otherRequired: "",
    voluntary: "85",
    minWage: "7.25",
    stateLimitPct: "",
    supportsOther: true,
    arrears12: false,
    statedWithheld: "480",
    orders: [{ type: "ordinary", demand: "600" }],
  };
}
