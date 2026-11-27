// Budget by cost type (pure): a schedule-of-values line's budget split into labor, material,
// equipment, subcontract and other, compared with the costs entered on the line in each type. A won
// estimate starts every line split the way it was bid (the bid item's cost by category, with the
// material sales tax on material), so "Ductwork is on budget" becomes "Ductwork's labor is $1,900
// over and its material $600 under". Runs in the Worker and the browser.
//
// The split sits below the line budget (src/shared/job-cost.ts), it does not replace it: the line's
// budget still drives the estimate at completion and the WIP figures. Saving a split sets the line
// budget to the split's sum; changing the line budget alone afterwards leaves the difference shown as
// "not split", never spread over the types by a guessed ratio. A type with no budget on a split line
// is a $0 budget (the bid had none of it), so a cost in it reads as over.
//
// Costs dated after the report's as-of date are left out, as the line figures leave them out.

import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory, mulDivRound } from "./job-cost";

export type CostTypeSplit = Partial<Record<CostCategory, number>>;

export interface CostTypeLineInput {
  sovLineId: string;
  itemNumber: string;
  description: string;
  /** The line's budget (job_cost_budgets); null when none is set. */
  budgetCents: number | null;
  /** The line's budget by type; null or empty when it is not split. */
  split: CostTypeSplit | null;
}

export interface CostTypeEntryInput {
  sovLineId: string | null;
  incurredOn: string;
  amountCents: number;
  category: CostCategory;
}

export interface CostTypeInput {
  lines: readonly CostTypeLineInput[];
  entries: readonly CostTypeEntryInput[];
  /** As in computeJobCost: costs dated after it are not counted; null counts every cost. */
  asOf: string | null;
}

export interface CostTypeRow {
  category: CostCategory;
  budgetCents: number;
  costToDateCents: number;
  /** budget - cost to date; negative is over. */
  remainingCents: number;
  overBudget: boolean;
  /** Cost to date / budget, basis points; null when the budget is 0. */
  costPctOfBudgetBps: number | null;
}

export interface CostTypeLine {
  sovLineId: string;
  itemNumber: string;
  description: string;
  /** False: the line's budget is not split; `rows` then lists only the costs by type. */
  split: boolean;
  /** Every type with a budget above 0 or a cost, in COST_CATEGORIES order. */
  rows: CostTypeRow[];
  /** Sum of the split. */
  splitCents: number;
  /** Line budget - split sum, when both exist and differ (the line budget was changed alone). */
  unsplitCents: number | null;
}

export interface CostTypeReport {
  lines: CostTypeLine[];
  /** Over the split lines only, by type: what was bid against what those lines have cost. */
  totals: CostTypeRow[];
  splitLineCount: number;
  issues: { sovLineId: string; category: CostCategory; message: string }[];
}

const BPS = 10_000;

const money = (cents: number) => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
};

function row(category: CostCategory, budgetCents: number, costToDateCents: number): CostTypeRow {
  return {
    category,
    budgetCents,
    costToDateCents,
    remainingCents: budgetCents - costToDateCents,
    overBudget: costToDateCents > budgetCents,
    costPctOfBudgetBps: budgetCents === 0 ? null : mulDivRound(costToDateCents, BPS, budgetCents),
  };
}

/** Whether a split has any type set (an all-empty split is no split). */
export const isSplit = (s: CostTypeSplit | null | undefined): s is CostTypeSplit =>
  !!s && COST_CATEGORIES.some((c) => s[c] !== undefined);

export const splitSum = (s: CostTypeSplit | null | undefined): number =>
  s ? COST_CATEGORIES.reduce((sum, c) => sum + (s[c] ?? 0), 0) : 0;

export function computeCostTypes(input: CostTypeInput): CostTypeReport {
  const known = new Set(input.lines.map((l) => l.sovLineId));
  const cost = new Map<string, Record<CostCategory, number>>();
  for (const e of input.entries) {
    if (e.sovLineId === null || !known.has(e.sovLineId)) continue;
    if (input.asOf !== null && e.incurredOn > input.asOf) continue;
    let byType = cost.get(e.sovLineId);
    if (!byType) {
      byType = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<
        CostCategory,
        number
      >;
      cost.set(e.sovLineId, byType);
    }
    byType[e.category] += e.amountCents;
  }
  const totalBudget = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<
    CostCategory,
    number
  >;
  const totalCost = { ...totalBudget };
  const issues: CostTypeReport["issues"] = [];
  let splitLineCount = 0;
  const lines = input.lines.map((l): CostTypeLine => {
    const split = isSplit(l.split) ? l.split : null;
    const spent = cost.get(l.sovLineId);
    const rows: CostTypeRow[] = [];
    for (const c of COST_CATEGORIES) {
      const budget = split ? (split[c] ?? 0) : 0;
      const c2d = spent?.[c] ?? 0;
      if (budget === 0 && c2d === 0) continue;
      const r = row(c, budget, c2d);
      rows.push(r);
      if (split) {
        totalBudget[c] += budget;
        totalCost[c] += c2d;
        if (r.overBudget) {
          issues.push({
            sovLineId: l.sovLineId,
            category: c,
            message:
              budget === 0
                ? `Line ${l.itemNumber} (${l.description}): ${money(c2d)} of ${COST_CATEGORY_LABELS[c].toLowerCase()} cost, and the line's budget has none.`
                : `Line ${l.itemNumber} (${l.description}): ${COST_CATEGORY_LABELS[c].toLowerCase()} is ${money(c2d - budget)} over its ${money(budget)} budget.`,
          });
        }
      }
    }
    const sum = splitSum(split);
    if (split) splitLineCount += 1;
    return {
      sovLineId: l.sovLineId,
      itemNumber: l.itemNumber,
      description: l.description,
      split: split !== null,
      rows: split ? rows : rows.map((r) => ({ ...r, overBudget: false })),
      splitCents: sum,
      unsplitCents:
        split && l.budgetCents !== null && l.budgetCents !== sum ? l.budgetCents - sum : null,
    };
  });
  const totals = COST_CATEGORIES.filter((c) => totalBudget[c] !== 0 || totalCost[c] !== 0).map(
    (c) => row(c, totalBudget[c], totalCost[c]),
  );
  return { lines, totals, splitLineCount, issues };
}
