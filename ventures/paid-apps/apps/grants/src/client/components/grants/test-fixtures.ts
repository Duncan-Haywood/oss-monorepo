// Test data builders for the grants UI tests (not a test file itself).
import type { MatchDto } from "@shared/api/types";
import type { OpportunityWithMatch } from "./queries";

export const NOW = new Date("2026-11-19T12:00:00");
export const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

export function makeMatch(over: Partial<MatchDto> = {}): MatchDto {
  return {
    id: "mat_1",
    orgId: "org_1",
    opportunityId: "opp_1",
    projectId: null,
    eligibility: "eligible",
    fitScore: 82,
    likelihood: 0.35,
    suggestedAskCents: 15_000_000,
    expectedValueCents: 5_250_000,
    effortHours: 12,
    reasons: [
      { text: "Trades training for Navajo Nation youth", polarity: "positive", factIds: ["fct_1"] },
    ],
    status: "new",
    dismissReason: null,
    dismissNote: null,
    model: "claude-opus-5-5",
    scoredAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

export function makeOpportunity(over: Partial<OpportunityWithMatch> = {}): OpportunityWithMatch {
  return {
    id: "opp_1",
    source: "grants_gov",
    sourceId: "DOL-ETA-27-001",
    sourceUrl: "https://www.grants.gov/search-results-detail/1",
    privateToOrgId: null,
    funderId: null,
    funderName: "U.S. Department of Labor",
    title: "YouthBuild Construction Training",
    opportunityNumber: "DOL-ETA-27-001",
    summary: "Funds pre-apprenticeship construction training.",
    description: "",
    eligibilityText: "Nonprofits and tribal organizations.",
    applicantTypes: [],
    categories: [],
    keywords: [],
    geographicScope: null,
    awardFloorCents: 5_000_000,
    awardCeilingCents: 25_000_000,
    totalFundingCents: null,
    expectedAwards: null,
    costSharingRequired: false,
    openDate: null,
    closeDate: inDays(30),
    estimatedPostDate: null,
    estimatedCloseDate: null,
    status: "posted",
    requirements: null,
    submissionMethod: "grants_gov",
    submissionEmail: null,
    submissionEmailVerified: false,
    submissionUrl: null,
    rawR2Key: null,
    sourceSafetyFlags: null,
    contentHash: null,
    fetchedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    match: makeMatch(),
    ...over,
  };
}
