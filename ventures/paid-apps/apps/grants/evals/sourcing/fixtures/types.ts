// Sourcing-eval fixture contracts. Every org, person, place, funder and program is FICTIONAL.
import type { FunderType, OpportunitySource, OpportunityStatus, OrgType } from "@shared/enums";
import type { EvalFact } from "../../fixtures";

export type SourcingOrgKey = "jfta" | "lrp";

/** Trap kinds: each must be caught (dropped, marked ineligible/unknown, or ranked out) by the pipeline. */
export const TRAP_KINDS = [
  "tribal_gov_only",
  "deadline_passed",
  "wrong_state",
  "ceiling_below_min",
  "for_profit_only",
  "near_duplicate",
  "keyword_stuffed",
  "sam_no_uei",
] as const;
export type TrapKind = (typeof TRAP_KINDS)[number];

/**
 * Expert label for one org x opportunity.
 * - relevance: 0 = not worth a look, 1 = plausible, 2 = squarely on-mission.
 * - eligible: can the org apply now on what its profile + facts show? "unknown" when a stated
 *   requirement cannot be confirmed (e.g. SAM.gov registration with no UEI on file). The pipeline
 *   must never call an "unknown" eligible.
 */
export interface GoldLabel {
  relevance: 0 | 1 | 2;
  eligible: boolean | "unknown";
  reason: string;
  trap?: TrapKind;
}

export interface SourcingProject {
  id: string;
  title: string;
  summary: string;
  budgetNeededCents: number | null;
}

export interface SourcingOrg {
  key: SourcingOrgKey;
  orgId: string;
  name: string;
  /** Fields of an org_profiles row the matcher reads (prefilter, prompt profile, embedding). */
  profile: {
    legalName: string;
    orgType: OrgType;
    city: string;
    state: string;
    country: string;
    ein: string | null;
    uei: string | null;
    websiteUrl: string | null;
    foundedYear: number | null;
    focusAreas: string[];
    serviceAreas: string[];
  };
  facts: EvalFact[];
  projects: SourcingProject[];
}

export interface SourcingOpportunity {
  key: string;
  source: OpportunitySource;
  funderName: string;
  funderType: FunderType;
  title: string;
  opportunityNumber: string | null;
  summary: string;
  description: string;
  eligibilityText: string;
  applicantTypes: string[];
  categories: string[];
  keywords: string[];
  geographicScope: string | null;
  awardFloorCents: number | null;
  awardCeilingCents: number | null;
  totalFundingCents: number | null;
  expectedAwards: number | null;
  costSharingRequired: boolean | null;
  status: OpportunityStatus;
  /** Deadline relative to the eval's `now` (negative = passed); null = rolling / forecast. */
  closeInDays: number | null;
  gold: Record<SourcingOrgKey, GoldLabel>;
}
