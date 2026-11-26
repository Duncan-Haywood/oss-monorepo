// Small builders so fixtures stay readable. Defaults: confirmed, internal, sourced from a document.
import { type FactValue, OpportunityRequirements, type RequirementSection } from "@shared/content";
import type { FactCategory } from "@shared/enums";
import type { EvalFact } from "./types";

export function fact(
  id: string,
  category: FactCategory,
  statement: string,
  sourceQuote: string,
  opts: Partial<Omit<EvalFact, "id" | "category" | "statement" | "sourceQuote">> & {
    value?: FactValue | null;
  } = {},
): EvalFact {
  return {
    id,
    category,
    statement,
    sourceQuote,
    value: opts.value ?? null,
    status: opts.status ?? "confirmed",
    sensitivity: opts.sensitivity ?? "internal",
    asOf: opts.asOf ?? null,
    sourceType: opts.sourceType ?? "document",
    projectId: opts.projectId ?? null,
  };
}

type SectionInput = Pick<RequirementSection, "key" | "title" | "prompt"> &
  Partial<Omit<RequirementSection, "key" | "title" | "prompt">>;

export function requirements(
  sections: SectionInput[],
  extra: { eligibilityCriteria?: string[] } = {},
): OpportunityRequirements {
  return OpportunityRequirements.parse({
    sections,
    eligibilityCriteria: extra.eligibilityCriteria ?? [],
    complete: true,
  });
}
