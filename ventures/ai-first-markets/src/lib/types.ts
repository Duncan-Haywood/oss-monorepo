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
  /** Share of the composite score, in percent. Weights sum to 100. */
  weight: number;
  rationale: string;
}

/**
 * What could go wrong legally, and what stops it. `level` is the residual
 * exposure once the listed controls are actually in place — not the raw
 * exposure of the category.
 */
export interface LiabilityProfile {
  level: RiskLevel;
  /** Concrete ways this business could create legal or financial exposure. */
  exposures: string[];
  /** Design and operating choices that keep the exposure contained. */
  controls: string[];
  /** Things this business will not do, at any price. */
  redLines: string[];
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
  liability: LiabilityProfile;
  plans: MilestonePlan[];
  competitors: string[];
  moat: string;
  firstExperiment: string;
  rank100k: number;
  rank1m: number;
}

/**
 * An idea that was researched and deliberately not carried forward. Kept so
 * the same ground is not re-covered next cycle, and so the reasons stay
 * falsifiable — a screened-out idea can be revived when its reason expires.
 */
export interface ScreenedIdea {
  name: string;
  category: IdeaCategory;
  thesis: string;
  reason: string;
  /** What would have to change for this to be worth re-opening. */
  revisitIf: string;
  screen: "crowded" | "liability" | "capital" | "platform-risk" | "economics";
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
