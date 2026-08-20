export type ArrMilestone = "100k" | "1m";

export type IdeaCategory =
  | "ai-agent"
  | "devtools"
  | "vertical-saas"
  | "api-infrastructure"
  | "content-automation"
  | "data-product";

export type RiskLevel = "low" | "medium" | "high";

export interface ScoreDimension {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  rationale: string;
}

export interface MilestonePlan {
  milestone: ArrMilestone;
  targetArr: number;
  timelineMonths: { optimistic: number; realistic: number; pessimistic: number };
  customerCount: { count: number; unit: string };
  pricing: { model: string; averageRevenue: number; currency: string };
  keyMilestones: string[];
  automationStack: string[];
  risks: string[];
  verdict: "strong" | "viable" | "stretch" | "unlikely";
}

export interface BusinessIdea {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: IdeaCategory;
  summary: string;
  problem: string;
  solution: string;
  targetCustomer: string;
  aiLeverage: string[];
  zeroEmployeeOps: string[];
  dimensions: ScoreDimension[];
  plans: MilestonePlan[];
  competitors: string[];
  moat: string;
  firstExperiment: string;
  rank100k: number;
  rank1m: number;
}

export interface ReportMeta {
  slug: string;
  title: string;
  description: string;
  type: "overview" | "comparison" | "deep-dive" | "playbook";
  arrFocus?: ArrMilestone;
}

export interface ValidationDecision {
  milestone: ArrMilestone;
  idea: BusinessIdea;
  compositeScore: number;
  maxCompositeScore: number;
  firstExperiment: string;
  // True when the milestone's rank-1 idea is also the top composite scorer, so
  // the narrative ranking and the dimension scores agree on what to test next.
  scoreAgreesWithRank: boolean;
}

export type VentureStage = "idea" | "prototype" | "revenue" | "scale";

// One of the portfolio's own ventures, scored on the same six dimensions as a
// BusinessIdea so the two can be compared directly.
export interface PortfolioVenture {
  slug: string;
  stage: VentureStage;
  // Mirrors portfolio/router/allocate.py: false when the venture's first
  // untested hypothesis needs customer contact and nothing is published.
  dispatchable: boolean;
  dimensions: ScoreDimension[];
}

// Whether the idea-scoring method reproduces the router's dispatchable/blocked
// split when applied to real ventures. `pValue` is the exact one-tailed
// rank-sum probability that dispatchable ventures would score at least this
// highly by chance alone.
export interface MethodTransferResult {
  ranking: { venture: PortfolioVenture; score: number; rank: number }[];
  dispatchableRankSum: number;
  expectedRankSumUnderChance: number;
  pValue: number;
  alpha: number;
  transfers: boolean;
  // The highest-scoring venture whose next claim needs a customer response.
  // The method's usable output once the transfer claim itself fails.
  topBlocked: PortfolioVenture;
}

export interface PortfolioSummary {
  totalIdeas: number;
  strong100k: number;
  strong1m: number;
  top100k: BusinessIdea[];
  top1m: BusinessIdea[];
  categoryBreakdown: Record<IdeaCategory, number>;
}
