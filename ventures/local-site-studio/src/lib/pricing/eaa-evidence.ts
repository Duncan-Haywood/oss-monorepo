/**
 * EAA evidence product line — catalog, buyer qualification, and the
 * claims this surface is allowed to make.
 *
 * Graduated from portfolio/pipeline/candidates/eaa-remediation-pipeline.md
 * as a product line of this venture (same buyer, existing lead/dashboard
 * surfaces), not as a new ventures/ directory. Checkout is not live:
 * Stripe Price objects have not been bootstrapped, and this module must
 * not invent Price IDs. Inquiry is mailto-only until they are.
 *
 * Two hard rules, copied from the candidate and enforced in tests:
 *   1. Sell a dated evidence record, never a compliance certificate.
 *   2. Do not sell EAA-deadline urgency to a microenterprise the law
 *      exempts (EAA Art. 4(5) / BFSG §3 / Rec. 2003/361/EC).
 */

export const EAA_EVIDENCE_PATH = "/accessibility-evidence";
export const EAA_EVIDENCE_DOCS_PATH = "/docs/eaa-evidence";

export const EAA_EVIDENCE_JOB = {
  id: "eaa-evidence-job" as const,
  name: "Accessibility evidence job",
  /** Indicative fixed-price range from the scored candidate. EUR is the market. */
  minPriceEur: 900,
  maxPriceEur: 1800,
  currency: "EUR" as const,
  tagline: "A dated record of what was tested, changed, and left open",
  /** False until an operator creates matching Stripe Price objects. */
  checkoutLive: false,
} as const;

export const EAA_EVIDENCE_RETEST = {
  id: "eaa-evidence-retest" as const,
  name: "Monitored re-test",
  minPriceEur: 49,
  maxPriceEur: 99,
  currency: "EUR" as const,
  interval: "month" as const,
  checkoutLive: false,
} as const;

/**
 * Error rates printed in the customer-facing record. These are the figures
 * portfolio/pipeline/probes/eaa-wcag-triage cites — precision from
 * a11y-own-sites (measured 2026-08-21), recall from a11y-axe-recall
 * (measured 2026-08-22) — measured on this portfolio's own pages, not on
 * a customer's shop. `eaa-evidence.test.ts` and the probe's own
 * `test_accuracy_citations.py` both pin these numbers so a later edit
 * cannot quietly raise them; if the probe's figures move, this citation
 * must move with them.
 */
export const EAA_EVIDENCE_ACCURACY = {
  precisionMin: 0.821,
  precisionMax: 0.881,
  recall: 0.976,
  measuredOn: "this portfolio's own built pages, not a customer's shop",
  measuredDate: "2026-08-22",
  corpusPages: 118,
  /** Verbatim conflict disclosure from the probe's customer record. */
  operatorConflict:
    "this audit is the qualification step for a paid remediation job, so over-reporting is the error that would pay us",
} as const;

export const MICROENTERPRISE_EMPLOYEE_MAX = 9;
export const MICROENTERPRISE_TURNOVER_EUR_MAX = 2_000_000;

export type BuyerObligation = "obligated" | "exempt-microenterprise" | "unknown";

export type BuyerSizeInput = {
  /** Headcount if the buyer stated one. Null / omitted means unknown. */
  employees: number | null;
  /**
   * Annual turnover in EUR if stated. Null means unknown. The exemption
   * needs both headcount < 10 and turnover (or balance sheet) ≤ €2M;
   * missing either half leaves obligation unknown rather than assumed.
   */
  turnoverEur: number | null;
};

/**
 * Recommendation 2003/361/EC microenterprise: fewer than 10 employees AND
 * turnover or balance sheet ≤ €2M. EAA Art. 4(5) and Germany's BFSG §3
 * exempt those service providers from the accessibility obligation this
 * product cites. Selling deadline-urgency to that segment is the
 * ethical-robustness failure the pipeline exists to refuse.
 *
 * This function never guesses. Unknown stays unknown. Non-finite inputs
 * (e.g. Infinity) are rejected rather than silently treated as "large".
 */
export function qualifyEaaBuyer(input: BuyerSizeInput): BuyerObligation {
  const employees = input.employees;
  const turnover = input.turnoverEur;

  if (employees != null && (!Number.isFinite(employees) || employees < 0)) {
    throw new Error("employees must be null or a non-negative finite number");
  }
  if (turnover != null && (!Number.isFinite(turnover) || turnover < 0)) {
    throw new Error("turnoverEur must be null or a non-negative finite number");
  }

  const employeesKnownSmall =
    employees != null && employees <= MICROENTERPRISE_EMPLOYEE_MAX;
  const employeesKnownLarge =
    employees != null && employees > MICROENTERPRISE_EMPLOYEE_MAX;
  const turnoverKnownSmall =
    turnover != null && turnover <= MICROENTERPRISE_TURNOVER_EUR_MAX;
  const turnoverKnownLarge =
    turnover != null && turnover > MICROENTERPRISE_TURNOVER_EUR_MAX;

  if (employeesKnownLarge || turnoverKnownLarge) {
    return "obligated";
  }
  if (employeesKnownSmall && turnoverKnownSmall) {
    return "exempt-microenterprise";
  }
  return "unknown";
}

export function eaaJobPriceRangeLabel(): string {
  return `€${EAA_EVIDENCE_JOB.minPriceEur}–€${EAA_EVIDENCE_JOB.maxPriceEur}`;
}

export function eaaRetestPriceRangeLabel(): string {
  return `€${EAA_EVIDENCE_RETEST.minPriceEur}–€${EAA_EVIDENCE_RETEST.maxPriceEur}/mo`;
}

export function eaaPrecisionLabel(): string {
  return `${EAA_EVIDENCE_ACCURACY.precisionMin}–${EAA_EVIDENCE_ACCURACY.precisionMax}`;
}

export function eaaRecallLabel(): string {
  return String(EAA_EVIDENCE_ACCURACY.recall);
}

const FORBIDDEN_CLAIMS = [
  "you are compliant",
  "you are now compliant",
  "eaa compliant",
  "wcag certified",
  "guarantees compliance",
  "makes you compliant",
] as const;

export function assertsNoComplianceWarranty(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_CLAIMS.every((claim) => !lower.includes(claim));
}

export type EaaInquiryDraft = {
  shopUrl: string;
  employees: number | null;
  turnoverEur: number | null;
  contactEmail: string;
  notes: string;
};

export type EaaInquiryMailto =
  | { ok: true; href: string; obligation: "obligated" }
  | { ok: false; reason: "exempt-microenterprise" | "unknown" | "invalid"; obligation: BuyerObligation };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Build a mailto for a qualified inquiry. Refuses to produce a sendable
 * message for an exempt or unknown buyer so the marketing form cannot
 * "just email anyway" around the gate, and refuses a malformed contact
 * email rather than trusting browser-only validation.
 */
export function buildEaaInquiryMailto(
  supportEmail: string,
  draft: EaaInquiryDraft,
): EaaInquiryMailto {
  const obligation = qualifyEaaBuyer({
    employees: draft.employees,
    turnoverEur: draft.turnoverEur,
  });
  if (obligation !== "obligated") {
    return { ok: false, reason: obligation, obligation };
  }
  const shopUrl = draft.shopUrl.trim();
  const contactEmail = draft.contactEmail.trim();
  if (!shopUrl || !EMAIL_PATTERN.test(contactEmail)) {
    return { ok: false, reason: "invalid", obligation };
  }

  const subject = `EAA evidence inquiry — ${shopUrl}`;
  const body = [
    "Product: accessibility evidence job (record, not a compliance certificate).",
    `Shop URL: ${shopUrl}`,
    `Contact: ${contactEmail}`,
    `Employees: ${draft.employees ?? "(unknown)"}`,
    `Turnover EUR: ${draft.turnoverEur ?? "(unknown)"}`,
    `Qualification: obligated (≥10 employees or >€2M turnover).`,
    `Indicative price: ${eaaJobPriceRangeLabel()} job, ${eaaRetestPriceRangeLabel()} re-test.`,
    `Checkout: not live — no Stripe Price IDs have been created.`,
    draft.notes.trim() ? `Notes: ${draft.notes.trim()}` : "Notes: (none)",
  ].join("\n");

  const href = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { ok: true, href, obligation };
}
