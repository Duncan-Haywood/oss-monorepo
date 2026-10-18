// Worker classification checker: pure functions, no dependencies, no network.
//
// Each question is a fact about the working relationship. `pointsTo` is the
// answer that points toward EMPLOYEE status; `w` is how much it matters
// (1-3); `tests` names which legal tests the fact feeds. "unsure" is never
// read as a favourable answer: for the ABC test the hiring entity carries the
// burden, so an unsure prong is "cannot show", not "passed".

export const QUESTIONS = [
  { id: "sets_how", text: "Do you tell them how to do the work (methods, tools, order of steps), not just what result you want?", pointsTo: "yes", w: 3, tests: ["irs", "dol", "abc_a"], group: "Control" },
  { id: "sets_hours", text: "Do you set their working hours or require them to be available at set times?", pointsTo: "yes", w: 2, tests: ["irs", "dol", "abc_a"], group: "Control" },
  { id: "trains", text: "Do you train them in how your business wants things done?", pointsTo: "yes", w: 2, tests: ["irs", "abc_a"], group: "Control" },
  { id: "supervises", text: "Do you supervise, evaluate or discipline them the way you would staff?", pointsTo: "yes", w: 2, tests: ["irs", "dol", "abc_a"], group: "Control" },
  { id: "can_subcontract", text: "Can they send a substitute or hire their own helpers without your approval?", pointsTo: "no", w: 1, tests: ["irs", "abc_a", "abc_c"], group: "Control" },
  { id: "own_tools", text: "Do they supply their own tools, equipment, software and workspace?", pointsTo: "no", w: 2, tests: ["irs", "dol", "abc_c"], group: "Money" },
  { id: "own_expenses", text: "Do they bear their own business expenses without reimbursement?", pointsTo: "no", w: 2, tests: ["irs", "dol"], group: "Money" },
  { id: "profit_loss", text: "Can they make more or lose money through their own choices (pricing, hiring, efficiency), beyond working more hours?", pointsTo: "no", w: 3, tests: ["irs", "dol", "abc_c"], group: "Money" },
  { id: "paid_time", text: "Are they paid by the hour, day or week rather than per project or deliverable?", pointsTo: "yes", w: 2, tests: ["irs", "dol"], group: "Money" },
  { id: "benefits", text: "Do you give them benefits (insurance, paid leave, retirement match, bonuses tied to tenure)?", pointsTo: "yes", w: 2, tests: ["irs"], group: "Relationship" },
  { id: "indefinite", text: "Is the work open-ended, with no end date or defined project?", pointsTo: "yes", w: 2, tests: ["irs", "dol"], group: "Relationship" },
  { id: "exclusive", text: "Are they effectively working only for you, or barred from working for others?", pointsTo: "yes", w: 2, tests: ["irs", "dol", "abc_c"], group: "Relationship" },
  { id: "other_clients", text: "Do they actively market to and serve other clients?", pointsTo: "no", w: 3, tests: ["irs", "dol", "abc_c"], group: "Relationship" },
  { id: "core_work", text: "Is this work part of your usual line of business (a stylist at a salon, a driver at a delivery company)?", pointsTo: "yes", w: 3, tests: ["irs", "dol", "abc_b"], group: "Relationship" },
  { id: "business_entity", text: "Do they have their own business identity (own entity or licence, own insurance, own invoices, own website or advertising)?", pointsTo: "no", w: 2, tests: ["irs", "abc_c"], group: "Relationship" },
  { id: "skill_initiative", text: "Do they use specialised skill and business initiative that go beyond doing tasks you assign?", pointsTo: "no", w: 2, tests: ["dol", "abc_c"], group: "Relationship" },
];

export const TESTS = {
  irs: { name: "IRS common-law test", scope: "federal employment tax", note: "Weighs behavioural control, financial control and the type of relationship. No single factor decides it." },
  dol: { name: "DOL economic reality test", scope: "federal wage and hour (FLSA)", note: "Asks whether the worker is economically dependent on you or in business for themselves. Six factors, totality of circumstances." },
  abc: { name: "ABC test", scope: "wage, unemployment and payroll law in states such as CA, MA, NJ and IL", note: "The worker is a contractor only if ALL three prongs are shown by the hiring entity: (A) free from control, (B) work outside your usual course of business, (C) independently established in that trade." },
};

const ANSWERS = new Set(["yes", "no", "unsure"]);

function leaning(q, answer) {
  if (!ANSWERS.has(answer) || answer === "unsure") return null;
  return answer === q.pointsTo ? "employee" : "contractor";
}

/** Weighted share (0-1) of answered facts pointing to employee, plus coverage. */
export function scoreTest(testKey, answers) {
  const qs = QUESTIONS.filter((q) => q.tests.includes(testKey));
  let emp = 0, total = 0, answered = 0, unsure = 0;
  const drivers = [];
  for (const q of qs) {
    const l = leaning(q, answers[q.id]);
    if (l === null) { unsure += 1; continue; }
    answered += 1;
    total += q.w;
    if (l === "employee") { emp += q.w; drivers.push(q.id); }
  }
  return { share: total ? emp / total : null, answered, unsure, count: qs.length, drivers };
}

function verdictFor(share, answered, count) {
  if (share === null || answered < Math.ceil(count / 2)) return "insufficient";
  if (share >= 0.6) return "employee";
  if (share <= 0.35) return "contractor";
  return "mixed";
}

/** The ABC test: each prong is shown only if every fact feeding it is answered in the contractor direction. */
export function abcProngs(answers) {
  const out = {};
  for (const [key, label] of [["abc_a", "A: free from your control and direction"], ["abc_b", "B: work is outside your usual course of business"], ["abc_c", "C: independently established in the trade"]]) {
    const qs = QUESTIONS.filter((q) => q.tests.includes(key));
    const blockers = qs.filter((q) => leaning(q, answers[q.id]) === "employee").map((q) => q.id);
    const unknown = qs.filter((q) => leaning(q, answers[q.id]) === null).map((q) => q.id);
    // Prong C is a cluster, not a checklist: one weak fact does not sink it,
    // so it fails when employee-pointing weight is at least half.
    let shown;
    if (key === "abc_c") {
      const s = scoreTest(key, answers);
      shown = s.share !== null && s.share < 0.5 && unknown.length === 0;
    } else {
      shown = blockers.length === 0 && unknown.length === 0;
    }
    out[key] = { label, shown, blockers, unknown };
  }
  return out;
}

export function evaluate(answers) {
  const results = {};
  for (const k of ["irs", "dol"]) {
    const s = scoreTest(k, answers);
    results[k] = { ...TESTS[k], key: k, share: s.share, answered: s.answered, count: s.count, drivers: s.drivers, verdict: verdictFor(s.share, s.answered, s.count) };
  }
  const prongs = abcProngs(answers);
  const shownAll = Object.values(prongs).every((p) => p.shown);
  const anyFail = Object.values(prongs).some((p) => p.blockers.length > 0);
  const answeredAny = QUESTIONS.some((q) => leaning(q, answers[q.id]) !== null);
  results.abc = {
    ...TESTS.abc, key: "abc", prongs,
    verdict: !answeredAny ? "insufficient" : shownAll ? "contractor" : anyFail ? "employee" : "mixed",
  };
  const verdicts = Object.values(results).map((r) => r.verdict);
  const overall = verdicts.includes("employee") ? "high" : verdicts.includes("mixed") || verdicts.includes("insufficient") ? "medium" : "low";
  return { results, risk: overall };
}

/** The strongest employee-pointing facts, for the "what to change" list. */
export function topFlags(answers, limit = 5) {
  return QUESTIONS
    .filter((q) => leaning(q, answers[q.id]) === "employee")
    .sort((a, b) => b.w - a.w)
    .slice(0, limit);
}

// Section 3509 reduced rates apply when the misclassification was not
// intentional disregard. Filed 1099s: 1.5% of wages for income tax withholding
// and 20% of the employee share of FICA. No 1099s filed: 3% and 40%.
export const RATES = {
  employerFica: 0.0765,
  employeeFica: 0.0765,
  s3509: { filed: { incomeTax: 0.015, employeeFicaShare: 0.2 }, unfiled: { incomeTax: 0.03, employeeFicaShare: 0.4 } },
  futa: 0.006,
  futaBase: 7000,
};

/**
 * Illustrative back-tax and overtime exposure for one worker and a number of
 * look-alike workers. Ceilings and floors are ranges, not predictions: state
 * unemployment tax, state wage law, penalties, interest and the Social Security
 * wage base are not modelled.
 */
export function exposure({ annualPay, hoursPerWeek = 40, years = 1, workers = 1, filed1099 = true, paidFlatNoOvertime = true, willful = false }) {
  const pay = Number(annualPay), hrs = Number(hoursPerWeek), yrs = Number(years), n = Number(workers);
  if (![pay, hrs, yrs, n].every(Number.isFinite) || pay < 0 || hrs <= 0 || hrs > 100 || yrs < 0 || n < 1) {
    return { error: "Enter a non-negative pay, 1-100 hours a week, years of 0 or more and at least one worker." };
  }
  const r = RATES.s3509[filed1099 ? "filed" : "unfiled"];
  const taxRate = RATES.employerFica + r.incomeTax + r.employeeFicaShare * RATES.employeeFica;
  const payrollTax = pay * taxRate * yrs * n;
  const futa = Math.min(pay, RATES.futaBase) * RATES.futa * yrs * n;
  // Full-rate alternative when s3509 relief is denied (intentional disregard):
  // employer and employee FICA both, before any income tax withholding liability.
  const fullFica = pay * (RATES.employerFica + RATES.employeeFica) * yrs * n;

  const regularRate = pay / (hrs * 52);
  const otHours = Math.max(0, hrs - 40);
  const flsaYears = Math.min(yrs, willful ? 3 : 2);
  const owedOvertime = paidFlatNoOvertime ? otHours * 0.5 * regularRate * 52 * flsaYears * n : 0;
  const liquidated = owedOvertime; // FLSA liquidated damages: an equal amount, unless good faith is shown
  const low = payrollTax + futa + owedOvertime;
  const high = fullFica + futa + owedOvertime + liquidated;
  return {
    taxRate, payrollTax, futa, fullFica, regularRate, otHours, flsaYears,
    owedOvertime, liquidated, low: Math.min(low, high), high: Math.max(low, high),
  };
}

export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const percent = (x) => (x * 100).toFixed(1) + "%";
