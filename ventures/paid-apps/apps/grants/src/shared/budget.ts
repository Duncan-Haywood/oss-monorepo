// Application budgets: line items, SF-424A-style category summary, match / cost-share summary and
// warnings. Pure and shared, so the editor's live totals and the server's stored totals are the
// same computation. Money is integer US cents; totals are always computed here, never trusted from
// a client or a model.
import { z } from "zod";

/** SF-424A Section B object class categories (a–h direct, j indirect). */
export const BUDGET_CATEGORIES = [
  "personnel",
  "fringe",
  "travel",
  "equipment",
  "supplies",
  "contractual",
  "construction",
  "other",
  "indirect",
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const BUDGET_CATEGORY_LABEL: Record<BudgetCategory, string> = {
  personnel: "Personnel",
  fringe: "Fringe benefits",
  travel: "Travel",
  equipment: "Equipment",
  supplies: "Supplies",
  contractual: "Contractual",
  construction: "Construction",
  other: "Other",
  indirect: "Indirect charges",
};

/** request = asked of this funder (SF-424A "Federal"); match = cost share; other = other funds. */
export const FUNDING_SOURCES = ["request", "match", "other"] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];

export const FUNDING_SOURCE_LABEL: Record<FundingSource, string> = {
  request: "Request",
  match: "Match",
  other: "Other funds",
};

/** The note a proposal puts on a line whose amount no fact supports (amount left at 0). */
export const NEEDS_INPUT_NOTE = "needs your input";

/** Pseudo-citation prefix: a claim citing `budget:<lineId>` is checked against that saved line. */
export const BUDGET_REF_PREFIX = "budget:";
/** Pseudo-citation for the budget's computed totals (request, match, other, total project cost). */
export const BUDGET_TOTALS_REF = "budget:totals";
export const budgetRef = (lineId: string) => `${BUDGET_REF_PREFIX}${lineId}`;
export const isBudgetRef = (id: string) => id.startsWith(BUDGET_REF_PREFIX);

export const MAX_BUDGET_LINES = 200;
/** $1 billion: a typo guard, not a policy. */
export const MAX_LINE_CENTS = 100_000_000_000;

export const BudgetLine = z.object({
  id: z.string().min(1).max(64),
  category: z.enum(BUDGET_CATEGORIES),
  description: z.string().max(500),
  /** Units, FTE, trips... Up to 2 decimals (0.5 FTE). */
  quantity: z.number().min(0).max(1_000_000),
  unitCostCents: z.number().int().min(0).max(MAX_LINE_CENTS),
  /** Always round(quantity × unitCostCents), recomputed by computeLine. */
  totalCents: z.number().int().min(0),
  /** "fact": the amount was taken from (and deterministically matched to) the cited facts. */
  source: z.enum(["user", "fact"]),
  factIds: z.array(z.string().min(1).max(100)).max(20),
  fundingSource: z.enum(FUNDING_SOURCES),
  /** Free text; NEEDS_INPUT_NOTE marks a placeholder. */
  note: z.string().max(500).default(""),
});
export type BudgetLine = z.infer<typeof BudgetLine>;

/** What a client may send for a line: no totals (computed), id optional (assigned). */
export const BudgetLineInput = BudgetLine.omit({ totalCents: true, id: true }).extend({
  id: z.string().min(1).max(64).optional(),
  source: z.enum(["user", "fact"]).default("user"),
  factIds: z.array(z.string().min(1).max(100)).max(20).default([]),
});
export type BudgetLineInput = z.input<typeof BudgetLineInput>;

export interface CategoryRow {
  category: BudgetCategory;
  requestCents: number;
  matchCents: number;
  otherCents: number;
  totalCents: number;
}

export interface FundingColumns {
  requestCents: number;
  matchCents: number;
  otherCents: number;
  totalCents: number;
}

/** SF-424A Section B: rows a–h, i (total direct), j (indirect), k (totals), by funding column. */
export interface CategorySummary {
  rows: CategoryRow[];
  totalDirect: FundingColumns;
  indirect: FundingColumns;
  total: FundingColumns;
}

export interface MatchSummary {
  requestCents: number;
  matchCents: number;
  otherCents: number;
  totalProjectCents: number;
  /** match / total project cost, in percent (1 decimal); null when the total is 0. */
  matchPercentOfTotal: number | null;
  /** null = the opportunity does not say. */
  costSharingRequired: boolean | null;
  /** Required match from the RFP, entered by the applicant (null = not entered). */
  requiredMatchCents: number | null;
  /** How far the match falls short of requiredMatchCents (0 when met or unknown). */
  shortfallCents: number;
}

export interface BudgetTotals {
  categories: CategorySummary;
  match: MatchSummary;
  lineCount: number;
  needsInputCount: number;
}

export type BudgetWarningCode =
  | "over_ceiling"
  | "cost_share_missing"
  | "cost_share_short"
  | "cost_share_amount_unknown"
  | "needs_input"
  | "request_mismatch";

export interface BudgetWarning {
  code: BudgetWarningCode;
  severity: "blocker" | "warning" | "info";
  message: string;
}

export interface BudgetRules {
  awardCeilingCents?: number | null;
  costSharingRequired?: boolean | null;
  requiredMatchCents?: number | null;
  /** applications.requestedAmountCents (what the narrative's ask:requested_amount says). */
  requestedAmountCents?: number | null;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
export const formatBudgetCents = money;

/** total = round(quantity × unit cost); quantity kept to 2 decimals. */
export function lineTotalCents(quantity: number, unitCostCents: number): number {
  const q = Math.round(quantity * 100) / 100;
  return Math.round(q * unitCostCents);
}

export const lineNeedsInput = (l: Pick<BudgetLine, "totalCents">) => l.totalCents === 0;

/** Normalizes one line: rounds quantity, recomputes the total, sets or clears the placeholder note. */
export function computeLine(
  l: Omit<BudgetLine, "totalCents"> & { totalCents?: number },
): BudgetLine {
  const quantity = Math.round(l.quantity * 100) / 100;
  const totalCents = lineTotalCents(quantity, l.unitCostCents);
  const trimmed = l.note.trim();
  const note =
    totalCents === 0
      ? trimmed || NEEDS_INPUT_NOTE
      : trimmed.toLowerCase() === NEEDS_INPUT_NOTE
        ? ""
        : trimmed;
  return { ...l, quantity, totalCents, note, description: l.description.trim() };
}

const emptyColumns = (): FundingColumns => ({
  requestCents: 0,
  matchCents: 0,
  otherCents: 0,
  totalCents: 0,
});

function add(cols: FundingColumns, source: FundingSource, cents: number) {
  if (source === "request") cols.requestCents += cents;
  else if (source === "match") cols.matchCents += cents;
  else cols.otherCents += cents;
  cols.totalCents += cents;
}

export function computeTotals(lines: readonly BudgetLine[], rules: BudgetRules = {}): BudgetTotals {
  const byCat = new Map<BudgetCategory, FundingColumns>(
    BUDGET_CATEGORIES.map((c) => [c, emptyColumns()]),
  );
  const totalDirect = emptyColumns();
  const indirect = emptyColumns();
  for (const raw of lines) {
    const l = computeLine(raw);
    const cols = byCat.get(l.category) as FundingColumns;
    add(cols, l.fundingSource, l.totalCents);
    add(l.category === "indirect" ? indirect : totalDirect, l.fundingSource, l.totalCents);
  }
  const total: FundingColumns = {
    requestCents: totalDirect.requestCents + indirect.requestCents,
    matchCents: totalDirect.matchCents + indirect.matchCents,
    otherCents: totalDirect.otherCents + indirect.otherCents,
    totalCents: totalDirect.totalCents + indirect.totalCents,
  };
  const required =
    typeof rules.requiredMatchCents === "number" && rules.requiredMatchCents > 0
      ? rules.requiredMatchCents
      : null;
  return {
    categories: {
      rows: BUDGET_CATEGORIES.map((category) => ({
        category,
        ...(byCat.get(category) as FundingColumns),
      })),
      totalDirect,
      indirect,
      total,
    },
    match: {
      requestCents: total.requestCents,
      matchCents: total.matchCents,
      otherCents: total.otherCents,
      totalProjectCents: total.totalCents,
      matchPercentOfTotal:
        total.totalCents > 0 ? Math.round((total.matchCents / total.totalCents) * 1000) / 10 : null,
      costSharingRequired: rules.costSharingRequired ?? null,
      requiredMatchCents: required,
      shortfallCents: required ? Math.max(0, required - total.matchCents) : 0,
    },
    lineCount: lines.length,
    needsInputCount: lines.filter((l) => lineNeedsInput(computeLine(l))).length,
  };
}

/** Ceiling, cost-share, placeholder and ask-consistency checks. Flags; never blocks a save. */
export function budgetWarnings(totals: BudgetTotals, rules: BudgetRules = {}): BudgetWarning[] {
  const out: BudgetWarning[] = [];
  const { requestCents, matchCents, requiredMatchCents, shortfallCents } = totals.match;
  const ceiling = rules.awardCeilingCents;
  if (typeof ceiling === "number" && ceiling > 0 && requestCents > ceiling) {
    out.push({
      code: "over_ceiling",
      severity: "blocker",
      message: `The request (${money(requestCents)}) is over this funder's award ceiling of ${money(ceiling)}. Reduce the requested lines by at least ${money(requestCents - ceiling)} or move costs to match.`,
    });
  }
  if (rules.costSharingRequired === true) {
    if (matchCents === 0) {
      out.push({
        code: "cost_share_missing",
        severity: "blocker",
        message:
          "This funder requires cost sharing, but no budget line is funded by match. Add the match (cost share) your organization will contribute.",
      });
    } else if (requiredMatchCents && shortfallCents > 0) {
      out.push({
        code: "cost_share_short",
        severity: "blocker",
        message: `The match (${money(matchCents)}) is below the required cost share of ${money(requiredMatchCents)}. Add at least ${money(shortfallCents)} in match.`,
      });
    }
    if (!requiredMatchCents) {
      out.push({
        code: "cost_share_amount_unknown",
        severity: "info",
        message:
          "This funder requires cost sharing. Enter the required match amount from the funder's instructions so it can be checked.",
      });
    }
  }
  if (totals.needsInputCount > 0) {
    const n = totals.needsInputCount;
    out.push({
      code: "needs_input",
      severity: "warning",
      message: `${n} budget ${n === 1 ? "line needs" : "lines need"} your input: no fact on file gives ${n === 1 ? "its amount" : "their amounts"}.`,
    });
  }
  const ask = rules.requestedAmountCents;
  if (typeof ask === "number" && ask > 0 && requestCents > 0 && ask !== requestCents) {
    out.push({
      code: "request_mismatch",
      severity: "warning",
      message: `The budget requests ${money(requestCents)}, but the application's requested amount is ${money(ask)}. Make them match before submitting.`,
    });
  }
  return out;
}

/** The saved budget plus everything the editor shows (GET/PUT /applications/:id/budget). */
export interface BudgetDto {
  applicationId: string;
  /** false until the first save or proposal. */
  exists: boolean;
  lines: BudgetLine[];
  notes: string;
  requiredMatchCents: number | null;
  totals: BudgetTotals;
  warnings: BudgetWarning[];
  rules: {
    awardCeilingCents: number | null;
    costSharingRequired: boolean | null;
    requestedAmountCents: number | null;
    /** The application's project budgetNeededCents (orientation; not a line). */
    projectNeedCents: number | null;
  };
  updatedBy: string | null;
  updatedAt: string | null;
}

/** The fields grounding needs to check a `budget:<lineId>` citation. */
export type BudgetLineRef = Pick<
  BudgetLine,
  "id" | "category" | "description" | "quantity" | "unitCostCents" | "totalCents" | "fundingSource"
>;

/** The saved budget as drafting and grounding see it (loaded by the pipeline from the DB). */
export interface BudgetGroundingInput {
  lines: BudgetLineRef[];
  totals: Pick<MatchSummary, "requestCents" | "matchCents" | "otherCents" | "totalProjectCents">;
}

/** One budget table row as drafting's prompt and grounding's synthetic fact describe it. */
export function describeBudgetLine(l: BudgetLineRef): string {
  const what = l.description.trim() || "Unnamed line";
  const qty = Math.round(l.quantity * 100) / 100;
  return `${BUDGET_CATEGORY_LABEL[l.category]}: ${what}. ${qty} × ${money(l.unitCostCents)} = ${money(l.totalCents)}, funded by ${FUNDING_SOURCE_LABEL[l.fundingSource].toLowerCase()}.`;
}

export function describeBudgetTotals(t: BudgetGroundingInput["totals"]): string {
  return `Total project cost ${money(t.totalProjectCents)}: ${money(t.requestCents)} requested from the funder, ${money(t.matchCents)} in match (cost share), ${money(t.otherCents)} from other funds.`;
}
