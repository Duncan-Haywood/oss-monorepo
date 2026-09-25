// Core logic for the federal Corporate Transparency Act (CTA) beneficial
// ownership information (BOI) reporting exemption determination. No network
// calls: this applies FinCEN's own published August 2026 final rule to the
// facts the user supplies. It is NOT a full compliance determination -- see
// README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch against FinCEN.gov's own "Beneficial
// Ownership Information Reporting" page, FinCEN's August 11, 2026 news
// release "FinCEN Permanently Ends Beneficial Ownership Reporting
// Requirements for Millions of Small Business Owners", the Federal Register
// notice "Beneficial Ownership Information Reporting Requirement Revision"
// (2026-08-14, RIN 1506-AB67), and law-firm summaries from Holland & Knight
// and Mayer Brown, cross-checked against each other:
//
//   - On August 11, 2026, FinCEN issued a final rule (effective 2026-08-14)
//     that PERMANENTLY removes the BOI reporting requirement for every
//     entity formed in the United States and every U.S. person -- this
//     supersedes the March 2025 interim final rule, which had made the same
//     change on an interim basis.
//   - The only entities still required to report are "foreign reporting
//     companies": entities formed under the law of a foreign country that
//     have registered to do business in a U.S. state or Tribal jurisdiction
//     by filing with a secretary of state or similar office.
//   - Even a foreign reporting company that must file reports ONLY its own
//     identifying information plus the beneficial ownership information of
//     any beneficial owner (and, for a foreign reporting company formed on
//     or after 2024-01-01, any company applicant) who is NOT a U.S. person.
//     It does not report U.S.-person beneficial owners or company
//     applicants at all, even though it must still file.
//   - Deadlines for a foreign reporting company: one registered before
//     2025-03-26 had an initial report due 2025-04-25. One that registers
//     on or after 2025-03-26 must file within 30 calendar days of the
//     earlier of (a) actual notice that its registration is effective, or
//     (b) public notice of that registration by the secretary of state or
//     equivalent office. Both deadlines are almost certainly already past
//     for a company that registered a meaningful time ago -- the point of
//     showing the date is to flag whether a report is now overdue, not to
//     suggest there is comfortable runway left.
//
// This module does not verify a filer's formation jurisdiction, U.S.-person
// status of any owner, or registration date -- the user supplies each, and
// the page points at FinCEN's own BOI guidance and a qualified attorney as
// the source to verify against before relying on this for an actual filing
// decision.

export const RULE_EFFECTIVE_DATE = "2026-08-14";
export const IFR_CUTOFF_DATE = "2025-03-26";
export const IFR_DEADLINE = "2025-04-25";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00Z`);
  const b = new Date(`${isoB}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Determines whether an entity is still required to file (or has anything
 * left to report) under the CTA's BOI rule as permanently narrowed by
 * FinCEN's 2026-08-14 final rule.
 */
export function boiExemptionOutcome({
  formedInUS = true,
  registeredInUS = false,
  registrationNoticeDate = "",
  allOwnersUSPersons = true,
} = {}) {
  const findings = [];
  const isForeignReportingCompany = !formedInUS && registeredInUS;

  if (formedInUS) {
    findings.push({
      severity: "info",
      title: "Formed in the United States: permanently exempt",
      detail: `FinCEN's August 11, 2026 final rule (effective ${RULE_EFFECTIVE_DATE}) permanently removed the BOI reporting requirement for every entity formed in the United States, regardless of size, industry, or prior filing history. There is nothing to file and no report to update.`,
    });
    return {
      isForeignReportingCompany: false,
      mustFile: false,
      mustReportAnyOwner: false,
      deadline: null,
      isOverdue: false,
      findings,
    };
  }

  if (!registeredInUS) {
    findings.push({
      severity: "info",
      title: "Foreign-formed but not registered to do business in the U.S.: not a reporting company",
      detail: "A foreign entity is only a “foreign reporting company” under the current rule if it has registered to do business in a U.S. state or Tribal jurisdiction by filing with a secretary of state or similar office. An entity that has not made that filing has no BOI reporting obligation to reassess.",
    });
    return {
      isForeignReportingCompany: false,
      mustFile: false,
      mustReportAnyOwner: false,
      deadline: null,
      isOverdue: false,
      findings,
    };
  }

  // Foreign-formed AND registered to do business in the U.S.: still a
  // "foreign reporting company" and must file, though only for non-U.S.
  // persons.
  findings.push({
    severity: "high",
    title: "Foreign reporting company: still required to file",
    detail: "FinCEN's 2026-08-14 final rule kept the BOI reporting requirement in place for foreign reporting companies -- entities formed under a foreign country's law that have registered to do business in a U.S. state or Tribal jurisdiction. This exemption checker cannot resolve that requirement away.",
  });

  let deadline = null;
  let isOverdue = false;
  if (registrationNoticeDate) {
    if (daysBetween(registrationNoticeDate, IFR_CUTOFF_DATE) >= 0) {
      // Registered before the 2025-03-26 interim-final-rule cutoff.
      deadline = IFR_DEADLINE;
    } else {
      deadline = addDays(registrationNoticeDate, 30);
    }
    isOverdue = daysBetween(deadline, RULE_EFFECTIVE_DATE) >= 0;
    findings.push({
      severity: isOverdue ? "high" : "medium",
      title: isOverdue ? `Initial report deadline (${deadline}) has already passed` : `Initial report due ${deadline}`,
      detail: daysBetween(registrationNoticeDate, IFR_CUTOFF_DATE) >= 0
        ? `Registration became effective before ${IFR_CUTOFF_DATE}, so the interim final rule's fixed deadline of ${IFR_DEADLINE} applies.`
        : `Registration became effective on or after ${IFR_CUTOFF_DATE}, so the deadline is 30 calendar days after the earlier of actual notice or public notice of registration -- entered here as ${registrationNoticeDate}, giving ${deadline}.`,
    });
  } else {
    findings.push({
      severity: "info",
      title: "Enter the registration notice date to compute the filing deadline",
      detail: "The deadline depends on whether registration became effective before or on/after 2025-03-26 and, for the latter, the exact notice date.",
    });
  }

  if (allOwnersUSPersons) {
    findings.push({
      severity: "medium",
      title: "All beneficial owners are U.S. persons: file, but report none of them",
      detail: "A foreign reporting company files only the identifying information of any beneficial owner (or, for a company formed on or after 2024-01-01, company applicant) who is NOT a U.S. person. With every owner a U.S. person, the company still files its own company-level information but reports zero individual beneficial owners.",
    });
  } else {
    findings.push({
      severity: "high",
      title: "Report only the non-U.S.-person beneficial owners",
      detail: "Report identifying information for each beneficial owner (and, for a company formed on or after 2024-01-01, company applicant) who is not a U.S. person. Do not report a beneficial owner or company applicant who is a U.S. person, even though the company itself must still file.",
    });
  }

  findings.push({
    severity: "info",
    title: "This is a rule-application aid, not a filing service or legal opinion",
    detail: "This tool applies FinCEN's own published rule text to the facts you enter. It does not verify your entity's actual formation jurisdiction, registration status, or any owner's citizenship or residency, and it does not prepare or submit a BOI report. Confirm against FinCEN.gov's own guidance or a qualified attorney before filing or deciding not to.",
  });

  return {
    isForeignReportingCompany,
    mustFile: true,
    mustReportAnyOwner: !allOwnersUSPersons,
    deadline,
    isOverdue,
    findings,
  };
}
