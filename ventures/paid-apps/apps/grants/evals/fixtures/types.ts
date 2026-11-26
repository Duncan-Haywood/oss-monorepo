// Eval fixture contracts. Fixtures are entirely FICTIONAL organizations, people, places and funders.
// Facts are shaped like `facts` DB rows (the fields drafting + grounding read), so they can be passed
// to draftApplication / verifyDraft unchanged.
import type { FactValue, OpportunityRequirements } from "@shared/content";
import type { FactCategory, FactSourceType, FactStatus, Sensitivity } from "@shared/enums";
import type { DraftingOpportunity } from "@worker/services/drafting";

export interface EvalFact {
  id: string;
  category: FactCategory;
  statement: string;
  value: FactValue | null;
  /** Verbatim text from the (fictional) source document / interview. */
  sourceQuote: string;
  status: FactStatus;
  sensitivity: Sensitivity;
  asOf: string | null;
  sourceType: FactSourceType;
  projectId: string | null;
}

export type FabricationKind =
  | "wrong_number"
  | "invented_partner"
  | "inflated_outcome"
  | "wrong_year"
  | "uncited_factual";

/** A known fabrication injected into a copy of the draft; the verifier must flag every one. */
export interface Fabrication {
  kind: FabricationKind;
  /** The fabricated sentence, written to look like a normal drafted claim. */
  text: string;
  /** Real fact ids it (falsely) cites. Empty for `uncited_factual`. Cite confirmed facts only. */
  factIds: string[];
  /** What the true fact says, for the report. */
  truth: string;
}

export interface EvalOpportunity {
  key: string;
  opportunity: DraftingOpportunity;
  requirements: OpportunityRequirements;
  requestedAmountCents: number | null;
  /** Section keys the fact base CANNOT answer: the drafter must emit >= 1 gap there. */
  expectGapSections: string[];
}

export interface EvalOrg {
  key: string;
  orgId: string;
  name: string;
  /** Orientation-only profile (what getOrgPromptProfile would return). Never evidence. */
  profile: string;
  facts: EvalFact[];
  opportunities: EvalOpportunity[];
  fabrications: Fabrication[];
}
