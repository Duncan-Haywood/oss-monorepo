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

export interface PortfolioSummary {
  totalIdeas: number;
  strong100k: number;
  strong1m: number;
  top100k: BusinessIdea[];
  top1m: BusinessIdea[];
  categoryBreakdown: Record<IdeaCategory, number>;
}
