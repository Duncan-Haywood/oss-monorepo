export type ArrMilestone = "100k" | "1m";

export type IdeaCategory =
  | "ai-agent"
  | "devtools"
  | "vertical-saas"
  | "api-infrastructure"
  | "content-automation"
  | "data-product";

export type RiskLevel = "low" | "medium" | "high";

/**
 * How much legal and financial exposure the business carries once it is
 * running normally — not how likely it is to fail commercially.
 *
 * contained  Advisory or infrastructure product. A defect costs a refund and
 *            a reputation hit, not a claim. No regulated data, no money
 *            movement, no decisions made about people.
 * moderate   Customer trusts output for a decision with real cost, or the
 *            product processes customer business data. Survivable with an
 *            LLC, tech E&O cover, and a liability cap in the terms.
 * elevated   Regulated regime applies directly, or a defect plausibly harms a
 *            third party. Needs counsel before launch, not after.
 */
export type LiabilityTier = "contained" | "moderate" | "elevated";

/**
 * The liability screen. Applied before commercial scoring: an idea that is
 * attractive on economics and elevated on liability is not automatically
 * rejected, but it does not get funded on the strength of its economics
 * alone.
 */
export interface RiskProfile {
  liabilityTier: LiabilityTier;
  /** Regimes that actually attach to this business, not a list of every law. */
  regulatoryExposure: string[];
  /** What customer data is touched — and what is deliberately never touched. */
  dataSensitivity: string;
  /** Entity, insurance, and contract posture, with the real upfront cost. */
  entityAndInsurance: string;
  /** Structural choices that keep exposure contained by design. */
  mitigations: string[];
  /** Things this business will not do, even when they would make money. */
  ethicalGuardrails: string[];
}

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
  riskProfile: RiskProfile;
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

export interface PortfolioSummary {
  totalIdeas: number;
  strong100k: number;
  strong1m: number;
  top100k: BusinessIdea[];
  top1m: BusinessIdea[];
  categoryBreakdown: Record<IdeaCategory, number>;
}
