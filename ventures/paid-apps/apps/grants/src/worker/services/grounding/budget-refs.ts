// `budget:<lineId>` / `budget:totals` pseudo-citations: synthetic, applicant-set facts built from the
// SAVED budget (like ask:requested_amount), so the deterministic number check compares a claim's
// amounts with the line's quantity, unit cost and total. A citation to a line that is not in the
// saved budget, or to a placeholder line with no amount yet, is a blocker (see verify.ts).
import {
  BUDGET_REF_PREFIX,
  BUDGET_TOTALS_REF,
  type BudgetGroundingInput,
  budgetRef,
  describeBudgetLine,
  describeBudgetTotals,
} from "@shared/budget";
import type { FactRow } from "./checks";

const synthetic = (id: string, statement: string, dollars: number): FactRow => ({
  id,
  statement,
  sourceQuote: `Saved application budget. ${statement}`,
  value: { number: dollars, unit: "USD", year: null, text: null },
  status: "confirmed", // applicant-set in the budget editor: never counts as unconfirmed
  sensitivity: "internal",
  asOf: null,
  category: "financial",
});

export type BudgetRefLookup =
  | { kind: "ok"; fact: FactRow }
  | { kind: "missing" }
  | { kind: "placeholder"; description: string };

/** Resolves a `budget:` citation against the saved budget (null budget = nothing saved). */
export function resolveBudgetRef(
  id: string,
  budget: BudgetGroundingInput | null | undefined,
): BudgetRefLookup {
  if (!budget) return { kind: "missing" };
  if (id === BUDGET_TOTALS_REF) {
    if (budget.totals.totalProjectCents <= 0) return { kind: "placeholder", description: "totals" };
    return {
      kind: "ok",
      fact: synthetic(
        id,
        describeBudgetTotals(budget.totals),
        budget.totals.totalProjectCents / 100,
      ),
    };
  }
  const lineId = id.slice(BUDGET_REF_PREFIX.length);
  const line = budget.lines.find((l) => l.id === lineId);
  if (!line) return { kind: "missing" };
  if (line.totalCents <= 0) return { kind: "placeholder", description: line.description };
  return {
    kind: "ok",
    fact: synthetic(budgetRef(line.id), describeBudgetLine(line), line.totalCents / 100),
  };
}
