// Core arithmetic for the federal + state white-collar overtime-exemption
// salary threshold. No network calls: this applies published federal and
// state figures to the numbers the user supplies. It is NOT a full
// exemption determination -- see README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch against natlawreview.com's "New York
// State Minimum Wage and Exempt Salary Updates for 2026", Proskauer Rose's
// article of the same name, Symmetry's "2026 Exempt Salary Thresholds by
// State", Nextep's "2026 Salary Threshold Increases", ADP's "Minimum Salary
// Requirements for Overtime Exemption in 2026", and the DOL's May 15, 2026
// Federal Register technical amendment confirming the federal figure,
// cross-checked against each other:
//
//   - The federal Fair Labor Standards Act (FLSA) "white-collar" salary
//     threshold for the executive, administrative, and professional (EAP)
//     exemptions is $684/week ($35,568/year). The 2024 rule that would have
//     raised this to $1,128/week was vacated by a federal court in late
//     2024, and DOL's May 2026 technical amendment formally confirmed $684
//     as the operative figure -- it did not raise it.
//   - Five states set a HIGHER salary threshold that controls instead of
//     the federal figure whenever an employee works there: California
//     ($1,352/week, effective 2026-01-01), Washington ($1,541.70/week,
//     effective 2026-01-01), Maine ($871.16/week, effective 2026-01-01),
//     New York (two regional figures, effective 2026-01-01: $1,275/week in
//     NYC and Nassau/Suffolk/Westchester counties, $1,199.10/week
//     elsewhere in the state), and Alaska ($1,120/week, but not effective
//     until 2026-07-01).
//   - New York's higher figures apply ONLY to the executive and
//     administrative exemptions. New York sets no state-specific threshold
//     for the professional exemption, so the federal $684/week figure
//     governs a professional-exemption classification even in New York --
//     the detail most likely to be gotten wrong by hand, because every
//     other modeled state uses one figure for all three EAP categories.
//   - Whichever figure applies, the salary threshold is a NECESSARY
//     condition, never a sufficient one: an employee must also be paid on
//     a true salary basis (not reducible for partial-day absences or
//     variations in the quantity of work) and must actually perform
//     exempt duties under the executive, administrative, or professional
//     duties tests. This module does not model the duties test or the
//     salary-basis test at all -- see README.
//   - The federal computer-employee exemption has its own separate
//     $27.63/hour option not modeled here; a state's own computer-employee
//     rule (several states also carve this out separately) is likewise not
//     modeled. See README.
//
// This module does not verify a filer's job duties, salary basis, or
// worksite state -- the user supplies each, and the page points at a
// qualified employment attorney or HR compliance professional as the
// source to verify against.

export const FEDERAL_WEEKLY_THRESHOLD = 684;

export const STATE_THRESHOLDS = {
  CA: { name: "California", weekly: 1_352, effective: "2026-01-01", coversProfessional: true },
  WA: { name: "Washington", weekly: 1_541.70, effective: "2026-01-01", coversProfessional: true },
  ME: { name: "Maine", weekly: 871.16, effective: "2026-01-01", coversProfessional: true },
  AK: { name: "Alaska", weekly: 1_120, effective: "2026-07-01", coversProfessional: true },
  NY_DOWNSTATE: {
    name: "New York (NYC, Nassau, Suffolk, Westchester)",
    weekly: 1_275,
    effective: "2026-01-01",
    coversProfessional: false,
  },
  NY_UPSTATE: {
    name: "New York (rest of state)",
    weekly: 1_199.10,
    effective: "2026-01-01",
    coversProfessional: false,
  },
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function weeklyToAnnual(weekly) {
  return num(weekly) * 52;
}

export function annualToWeekly(annual) {
  return num(annual) / 52;
}

/**
 * Computes the applicable EAP salary threshold and whether a given weekly
 * salary meets it. Does NOT determine exemption -- only the salary-level
 * half of it. See the module docstring and README for what is out of scope.
 */
export function exemptionOutcome({
  jurisdiction = "federal-only",
  category = "executive_administrative",
  weeklySalary = 0,
} = {}) {
  const salary = Math.max(0, num(weeklySalary));
  const state = jurisdiction === "federal-only" ? null : STATE_THRESHOLDS[jurisdiction];
  const stateApplies = Boolean(state) && (category === "executive_administrative" || state.coversProfessional);
  const stateThreshold = stateApplies ? state.weekly : null;
  const applicableThreshold =
    stateThreshold != null ? Math.max(FEDERAL_WEEKLY_THRESHOLD, stateThreshold) : FEDERAL_WEEKLY_THRESHOLD;
  const usesFederalOnly = stateThreshold == null;
  const meetsThreshold = salary >= applicableThreshold;
  const shortfall = meetsThreshold ? 0 : applicableThreshold - salary;

  const findings = [];

  if (salary <= 0) {
    findings.push({
      severity: "info",
      title: "Enter a weekly salary to check it against the applicable threshold",
      detail: "With no salary figure entered, there is nothing to compare.",
    });
  }

  if (state && !stateApplies && category === "professional") {
    findings.push({
      severity: "info",
      title: `${state.name} sets no separate threshold for the professional exemption`,
      detail: `${state.name}'s higher salary figure applies only to the executive and administrative exemptions. For a professional-exemption classification, the federal ${money(FEDERAL_WEEKLY_THRESHOLD)}/week threshold governs instead.`,
    });
  }

  if (!meetsThreshold) {
    findings.push({
      severity: "high",
      title: `Salary is below the applicable ${money(applicableThreshold)}/week threshold`,
      detail: `This weekly salary is ${money(shortfall)} short of the ${money(applicableThreshold)}/week threshold${usesFederalOnly ? " (federal)" : ` (${state.name}, effective ${state.effective})`}. An employee paid below the applicable threshold cannot be classified exempt under this test, regardless of duties.`,
    });
  } else if (!usesFederalOnly) {
    findings.push({
      severity: "info",
      title: `Meets ${state.name}'s ${money(stateThreshold)}/week threshold, effective ${state.effective}`,
      detail: `This is ${money(stateThreshold - FEDERAL_WEEKLY_THRESHOLD)}/week above the federal ${money(FEDERAL_WEEKLY_THRESHOLD)} figure, which would otherwise apply on its own.`,
    });
  }

  findings.push({
    severity: "info",
    title: "The salary threshold is necessary, not sufficient",
    detail: "Meeting the applicable salary threshold does not by itself make an employee exempt. The employee must also be paid on a true salary basis and must actually perform exempt duties under the executive, administrative, or professional duties test -- neither of which this tool checks.",
  });

  return {
    jurisdiction,
    category,
    salary,
    federalThreshold: FEDERAL_WEEKLY_THRESHOLD,
    stateThreshold,
    applicableThreshold,
    usesFederalOnly,
    meetsThreshold,
    shortfall,
    stateName: state ? state.name : null,
    stateEffective: state ? state.effective : null,
    findings,
  };
}
