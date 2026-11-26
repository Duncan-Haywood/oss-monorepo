// Input/output contracts of the drafting service (pipeline codes against these).
import type { BudgetGroundingInput } from "@shared/budget";
import type { ApplicationContent, DraftSection, OpportunityRequirements } from "@shared/content";
import type { facts, opportunities } from "../../db/schema";

type FactRow = typeof facts.$inferSelect;
type OpportunityRow = typeof opportunities.$inferSelect;

/** A fact row as returned by knowledge's getFactsForDrafting (full rows are fine). */
export type DraftingFact = Pick<FactRow, "id" | "category" | "statement" | "status"> &
  Partial<Omit<FactRow, "id" | "category" | "statement" | "status">>;

/** The opportunity fields the drafter reads (a full row is fine). */
export type DraftingOpportunity = Pick<
  OpportunityRow,
  | "title"
  | "funderName"
  | "summary"
  | "description"
  | "eligibilityText"
  | "awardFloorCents"
  | "awardCeilingCents"
  | "closeDate"
> &
  Partial<OpportunityRow>;

export interface DraftInput {
  orgId: string;
  applicationId: string;
  opportunity: DraftingOpportunity;
  requirements: OpportunityRequirements;
  facts: DraftingFact[];
  projectId?: string | null;
  requestedAmountCents?: number | null;
  /** The saved budget table: budget sections state its lines citing `budget:<lineId>`. */
  budget?: BudgetGroundingInput | null;
  /** "Changes requested" comments / reviewer feedback to address in this draft. */
  reviewerNotes?: string;
  /** The previous version's content, when re-drafting. */
  previous?: ApplicationContent;
}

export interface DraftResult {
  content: ApplicationContent;
  executiveSummary: string;
  keyPoints: string[];
  model: string;
  promptVersion: string;
}

export interface RedraftInput extends DraftInput {
  sectionKey: string;
  instructions?: string;
}

export type { DraftSection };
