// Self-assessment scoring. Pure functions; no I/O.
//
// Level 2 score (for SPRS entry): NIST SP 800-171 DoD Assessment Methodology v1.2.1, section 2 and
// Annex A, as adopted by 32 CFR 170.24: start at 110 and subtract each NOT fully implemented
// requirement's point value (5, 3 or 1). A requirement counts only when every one of its assessment
// objectives is met; "partially implemented" scores as not implemented except for the two partial-credit
// cases the methodology names:
//   - 3.5.3 (MFA): subtract 5 if MFA is not implemented; subtract 3 if it is implemented for remote and
//     privileged users but not for all general (non-privileged network) users.
//   - 3.13.11 (FIPS cryptography): subtract 5 if no encryption is employed; subtract 3 if encryption is
//     employed but it is not FIPS-validated.
// 3.12.4 (SSP) has no point value: without a system security plan an assessment cannot be completed,
// so no score is produced. Not applicable requirements count as met. Range: 110 down to -203.
//
// POA&M rules for Conditional Level 2 (Self) status, 32 CFR 170.21(a)(2): score >= 88 (80% of 110);
// only 1-point requirements may be on the POA&M, except 3.13.11 when encryption is employed but not
// FIPS-validated (the 3-point partial case); and these may never be on a POA&M: 3.1.20, 3.1.22, 3.12.4,
// 3.10.3, 3.10.4, 3.10.5. POA&M closeout within 180 days of the conditional status date (170.21(b)).
// Level 1 allows no POA&M: every requirement must be met.
//
// See ./sources.ts for citations and the verification caveat.
import { LEVEL1_REQUIREMENTS } from "./level1";
import { LEVEL2_BY_NIST_ID, LEVEL2_REQUIREMENTS, type Level2Requirement } from "./level2";

export const IMPLEMENTATION_STATUSES = [
  "not_assessed",
  "not_implemented",
  "partially_implemented",
  "implemented",
  "not_applicable",
] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

export const PARTIAL_CREDIT_KEYS = [
  "mfa_remote_and_privileged_only",
  "encryption_not_fips",
] as const;
export type PartialCreditKey = (typeof PARTIAL_CREDIT_KEYS)[number];

export interface PartialCreditRule {
  nistId: string;
  key: PartialCreditKey;
  deduction: number;
  label: string;
}

/** The only reduced deductions DoD Assessment Methodology v1.2.1 allows. */
export const PARTIAL_CREDIT_RULES: readonly PartialCreditRule[] = [
  {
    nistId: "3.5.3",
    key: "mfa_remote_and_privileged_only",
    deduction: 3,
    label: "MFA implemented for remote and privileged users, but not for all general users",
  },
  {
    nistId: "3.13.11",
    key: "encryption_not_fips",
    deduction: 3,
    label: "Encryption employed to protect CUI, but it is not FIPS-validated",
  },
];

export const MAX_SCORE = 110;
export const CONDITIONAL_MIN_SCORE = 88;
export const POAM_CLOSEOUT_DAYS = 180;
/** 32 CFR 170.21(a)(2)(iv): never allowed on a POA&M. */
export const POAM_EXCLUDED_NIST_IDS = [
  "3.1.20",
  "3.1.22",
  "3.12.4",
  "3.10.3",
  "3.10.4",
  "3.10.5",
] as const;
export const SSP_NIST_ID = "3.12.4";

export interface ControlState {
  status: ImplementationStatus;
  partialCredit?: PartialCreditKey | null;
}

/** Whether a status counts as satisfied for scoring. */
export const isSatisfied = (s: ImplementationStatus) =>
  s === "implemented" || s === "not_applicable";

/** Points subtracted for one Level 2 requirement in the given state (0 when satisfied). */
export function deductionFor(req: Level2Requirement, state: ControlState | undefined): number {
  if (state && isSatisfied(state.status)) return 0;
  if (state?.status === "partially_implemented" && state.partialCredit) {
    const rule = PARTIAL_CREDIT_RULES.find(
      (r) => r.nistId === req.nistId && r.key === state.partialCredit,
    );
    if (rule) return Math.min(rule.deduction, req.weight);
  }
  return req.weight;
}

export interface Deduction {
  id: string;
  nistId: string;
  points: number;
  status: ImplementationStatus;
  partialCredit: PartialCreditKey | null;
}

export interface Level2Score {
  /** null when no score can be produced (no SSP). */
  score: number | null;
  /** The arithmetic result even when blocked, for planning views. Never report this to SPRS. */
  provisionalScore: number;
  maxScore: number;
  minScore: number;
  sspImplemented: boolean;
  deductions: Deduction[];
  counts: Record<ImplementationStatus, number>;
  /** Requirements nobody has assessed yet; they are scored as not implemented. */
  unassessed: number;
}

const emptyCounts = (): Record<ImplementationStatus, number> => ({
  not_assessed: 0,
  not_implemented: 0,
  partially_implemented: 0,
  implemented: 0,
  not_applicable: 0,
});

export const MIN_SCORE = MAX_SCORE - LEVEL2_REQUIREMENTS.reduce((s, r) => s + r.weight, 0);

/** `states` is keyed by CMMC id ("AC.L2-3.1.1"). Missing entries are "not_assessed". */
export function scoreLevel2(states: ReadonlyMap<string, ControlState>): Level2Score {
  const counts = emptyCounts();
  const deductions: Deduction[] = [];
  let total = 0;
  for (const req of LEVEL2_REQUIREMENTS) {
    const state = states.get(req.id);
    const status = state?.status ?? "not_assessed";
    counts[status]++;
    const points = deductionFor(req, state);
    if (!isSatisfied(status)) {
      deductions.push({
        id: req.id,
        nistId: req.nistId,
        points,
        status,
        partialCredit: state?.partialCredit ?? null,
      });
    }
    total += points;
  }
  const ssp = LEVEL2_BY_NIST_ID.get(SSP_NIST_ID);
  const sspImplemented = !!ssp && isSatisfied(states.get(ssp.id)?.status ?? "not_assessed");
  const provisionalScore = MAX_SCORE - total;
  return {
    score: sspImplemented ? provisionalScore : null,
    provisionalScore,
    maxScore: MAX_SCORE,
    minScore: MIN_SCORE,
    sspImplemented,
    deductions,
    counts,
    unassessed: counts.not_assessed,
  };
}

export interface PoamEligibility {
  eligible: boolean;
  reason: string;
}

/** May this Level 2 deficiency be carried on a POA&M under 32 CFR 170.21(a)(2)? */
export function poamEligibility(nistId: string, state: ControlState | undefined): PoamEligibility {
  const req = LEVEL2_BY_NIST_ID.get(nistId);
  if (!req) return { eligible: false, reason: "Unknown requirement" };
  if ((POAM_EXCLUDED_NIST_IDS as readonly string[]).includes(nistId)) {
    return {
      eligible: false,
      reason: "32 CFR 170.21(a)(2)(iv) excludes this requirement from POA&Ms",
    };
  }
  const points = deductionFor(req, state);
  if (points === 0) return { eligible: true, reason: "Requirement is met" };
  if (req.weight === 1) return { eligible: true, reason: "1-point requirement" };
  if (nistId === "3.13.11" && state?.partialCredit === "encryption_not_fips" && points === 3) {
    return { eligible: true, reason: "3.13.11 with encryption employed but not FIPS-validated" };
  }
  return {
    eligible: false,
    reason: `Point value ${points} is greater than 1; 32 CFR 170.21(a)(2)(iii) allows only 1-point requirements`,
  };
}

export interface ConditionalReadiness {
  /** The rule-based check passes: score >= 88 and every open deficiency may be on a POA&M. */
  meetsPoamRules: boolean;
  /** All 110 requirements met: a Final Level 2 (Self) self-assessment would need no POA&M. */
  allMet: boolean;
  score: number | null;
  blockers: { nistId: string; reason: string }[];
}

/**
 * Whether the current self-assessment data would satisfy the POA&M rules for a Conditional Level 2
 * (Self) status. This is a planning aid: the organization's affirming official makes the actual
 * self-assessment and affirmation in SPRS; this app does not determine or grant any status.
 */
export function conditionalReadiness(
  states: ReadonlyMap<string, ControlState>,
): ConditionalReadiness {
  const s = scoreLevel2(states);
  const blockers: { nistId: string; reason: string }[] = [];
  if (s.score === null)
    blockers.push({
      nistId: SSP_NIST_ID,
      reason: "No system security plan: no score can be produced",
    });
  else if (s.score < CONDITIONAL_MIN_SCORE)
    blockers.push({
      nistId: "*",
      reason: `Score ${s.score} is below ${CONDITIONAL_MIN_SCORE} (80% of 110)`,
    });
  for (const d of s.deductions) {
    if (d.points === 0) continue;
    const e = poamEligibility(d.nistId, states.get(d.id));
    if (!e.eligible) blockers.push({ nistId: d.nistId, reason: e.reason });
  }
  return {
    meetsPoamRules: blockers.length === 0,
    allMet: s.deductions.length === 0,
    score: s.score,
    blockers,
  };
}

export interface Level1Result {
  total: number;
  met: number;
  allMet: boolean;
  notMet: string[];
}

/** Level 1: pass/fail per requirement, no points, no POA&M (32 CFR 170.15, 170.21). */
export function scoreLevel1(states: ReadonlyMap<string, ControlState>): Level1Result {
  const notMet = LEVEL1_REQUIREMENTS.filter(
    (r) => !isSatisfied(states.get(r.id)?.status ?? "not_assessed"),
  ).map((r) => r.id);
  return {
    total: LEVEL1_REQUIREMENTS.length,
    met: LEVEL1_REQUIREMENTS.length - notMet.length,
    allMet: notMet.length === 0,
    notMet,
  };
}

/** Closeout deadline for a conditional status reached on `conditionalDate` (YYYY-MM-DD). */
export function poamCloseoutDeadline(conditionalDate: string): string {
  const d = new Date(`${conditionalDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + POAM_CLOSEOUT_DAYS);
  return d.toISOString().slice(0, 10);
}
