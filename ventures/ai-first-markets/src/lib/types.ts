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

/**
 * Liability, capital, and autonomy screen. Optional because the original
 * eight ideas predate it; every idea added from the 2026-08 screen onward
 * carries one.
 */
export interface RiskProfile {
  /** Exposure if the product is wrong, ranked for a solo operator with no legal team. */
  liability: RiskLevel;
  /** Which regimes bite, and why this idea sits outside the high-risk tiers. */
  regulatoryExposure: string;
  /** What customer data is touched, and what is deliberately not touched. */
  dataSensitivity: string;
  /** Cash needed before first revenue — excludes founder time. */
  capitalNeed: string;
  /** What agents can run unattended vs. what still needs a human decision. */
  agentOperability: string;
  /** Commitments that keep the business on the right side of the line. */
  ethicalGuardrails: string[];
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
  riskProfile?: RiskProfile;
  /** YYYY-MM of the screen that added the idea. Absent for the original set. */
  screenedAt?: string;
}

export interface ReportMeta {
  slug: string;
  title: string;
  description: string;
  type: "overview" | "comparison" | "deep-dive" | "playbook";
  arrFocus?: ArrMilestone;
}

export interface PortfolioSummary {
  totalIdeas: number;
  strong100k: number;
  strong1m: number;
  top100k: BusinessIdea[];
  top1m: BusinessIdea[];
  categoryBreakdown: Record<IdeaCategory, number>;
}
