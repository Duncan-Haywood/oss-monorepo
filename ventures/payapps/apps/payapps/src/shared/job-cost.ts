// Job costing (pure): what a job has cost against its budget, and the work-in-progress figures a
// surety, a bank or the company's CPA asks for (percent complete by cost, earned revenue, over or
// under billing, projected gross profit). Runs in the Worker and the browser.
//
// Method: cost-to-cost percentage of completion. For each schedule-of-values line the estimate at
// completion is the line's budget, or the cost already spent on it when that is higher (a line can
// cost more than planned but cannot be less than what it has cost). When the project manager has
// typed a cost to complete for the line (a revised estimate, dated the day it was typed), the
// estimate is instead the cost on the line through that day plus the cost to complete, again never
// less than the cost to date: costs dated after the estimate use it up. Costs not put on a line are
// added to the job's estimate as they are, since nothing budgets them. Percent complete = cost to
// date / estimate at completion; earned revenue = contract to date x that percent; billed to date
// (column G of the latest sent pay application, gross of retainage) minus earned revenue is over
// billing (positive) or under billing (negative).
//
// Committed costs: a purchase order or a lower-tier subcontract on a line is money the job is bound to
// spend. Its open amount (committed minus the costs entered against it, never below 0) is cost still
// to come, so a line's estimate is never less than its cost to date plus its open commitments. A
// commitment on no line adds its open amount to the job's estimate, as a cost on no line does.
// Commitments dated after the as-of date are left out, like costs.
//
// Nothing is guessed: the estimate, and every figure that depends on it, is null until every line
// with a scheduled value has a budget (`missingBudgetLineIds` says which). The numbers are a
// working schedule for the contractor and their accountant, not financial statements: a projected
// loss is flagged, not booked.

export const COST_CATEGORIES = ["labor", "material", "equipment", "subcontract", "other"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  labor: "Labor",
  material: "Material",
  equipment: "Equipment",
  subcontract: "Subcontract",
  other: "Other",
};

/** Enough cost lines for a long job kept by weekly payroll and invoice totals. */
export const MAX_COST_ENTRIES_PER_JOB = 5_000;

/** Purchase orders and subcontracts kept per job. */
export const MAX_COMMITMENTS_PER_JOB = 1_000;

export const COMMITMENT_KINDS = ["purchase_order", "subcontract"] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

export const COMMITMENT_KIND_LABELS: Record<CommitmentKind, string> = {
  purchase_order: "Purchase order",
  subcontract: "Subcontract",
};

/** Costs added in one request (a pasted list). */
export const MAX_COST_ENTRIES_PER_REQUEST = 1_000;

export interface JobCostLineInput {
  sovLineId: string;
  itemNumber: string;
  description: string;
  /** Column C as of the report date (original plus approved change orders). */
  scheduledValueCents: number;
  /** Column G of the latest sent application (0 before the first). */
  billedToDateCents: number;
  /** The contractor's cost budget for the line; null when not set. */
  budgetCents: number | null;
  /**
   * The project manager's revised estimate of the cost still to come on the line, as of
   * `costToCompleteOn`; null when none is typed (the budget is the estimate).
   */
  costToCompleteCents?: number | null;
  /** YYYY-MM-DD the cost to complete was typed; costs dated after it use it up. */
  costToCompleteOn?: string | null;
}

export interface CostEntryInput {
  /** The schedule-of-values line the cost is for; null for a job cost not on a line. */
  sovLineId: string | null;
  /** YYYY-MM-DD. */
  incurredOn: string;
  /** Negative for a credit (a returned material, a back-charge recovered). */
  amountCents: number;
  category: CostCategory;
  /** The purchase order or subcontract this cost is billed against; null or left out for none. */
  commitmentId?: string | null;
}

/** A purchase order or lower-tier subcontract: cost the job is bound to spend. */
export interface CommitmentInput {
  id: string;
  /** The line it is for; null for one on no line. */
  sovLineId: string | null;
  /** YYYY-MM-DD it was issued or signed. */
  committedOn: string;
  /** The amount committed, change orders to it included; never negative. */
  amountCents: number;
}

export interface JobCostInput {
  lines: readonly JobCostLineInput[];
  entries: readonly CostEntryInput[];
  /** Purchase orders and subcontracts; left out for none. */
  commitments?: readonly CommitmentInput[];
  /**
   * Costs incurred on or before this date count as "to date"; later ones are listed apart, so the
   * cost is compared with billing at the same date. Null counts every cost.
   */
  asOf: string | null;
}

export interface JobCostLine {
  sovLineId: string;
  itemNumber: string;
  description: string;
  scheduledValueCents: number;
  billedToDateCents: number;
  budgetCents: number | null;
  costToDateCents: number;
  /** Costs dated after `asOf` (not in the figures). */
  costAfterCents: number;
  /** Typed cost to complete (null when none) and the day it was typed. */
  costToCompleteCents: number | null;
  costToCompleteOn: string | null;
  /** Commitments on the line dated on or before the as-of date. */
  committedCents: number;
  /** What is still to be invoiced on them: sum of max(0, committed - costs against it). */
  openCommittedCents: number;
  /**
   * max(budget, cost to date), or with a typed cost to complete max(cost through its date + cost to
   * complete, cost to date); cost to date when the line has no scheduled value and no estimate.
   */
  estimateAtCompletionCents: number | null;
  /** Where the estimate comes from; null when there is none. */
  estimateBasis: EstimateBasis | null;
  /** Estimate at completion - cost to date: what the line is still expected to cost. */
  remainingCostCents: number | null;
  /** Estimate at completion - budget: positive when the job now expects to spend more than the bid. */
  estimateVsBudgetCents: number | null;
  /** budget - cost to date (negative is over budget); null without a budget. */
  budgetRemainingCents: number | null;
  overBudget: boolean;
  /** Cost to date / budget, basis points; null without a budget above zero. */
  costPctOfBudgetBps: number | null;
  /** Billed to date / scheduled value, basis points; null when C is 0. */
  billedPctBps: number | null;
}

/**
 * budget: the bid budget (or the cost to date, when that is higher); cost_to_complete: the project
 * manager's revised estimate; cost: a line with no scheduled value and no estimate, at its cost;
 * committed: cost to date plus open commitments, which passed the budget or the cost to complete.
 */
export type EstimateBasis = "budget" | "cost_to_complete" | "cost" | "committed";

export interface JobCostTotals {
  contractCents: number;
  /** Sum of the budgets that are set. */
  budgetCents: number;
  costToDateCents: number;
  costAfterCents: number;
  /** Costs on no line, to date. */
  unassignedCostToDateCents: number;
  billedToDateCents: number;
  estimateAtCompletionCents: number | null;
  /** Estimate at completion - cost to date. */
  costToCompleteCents: number | null;
  percentCompleteBps: number | null;
  earnedRevenueCents: number | null;
  /** Billed - earned: positive is over billed (billings in excess), negative under billed. */
  overUnderBilledCents: number | null;
  /** Earned - cost to date. */
  grossProfitToDateCents: number | null;
  /** Contract - estimate at completion. */
  projectedGrossProfitCents: number | null;
  /** Projected gross profit / contract, basis points; null when the contract is 0. */
  projectedMarginBps: number | null;
  /** Sum of the lines' estimate - budget (lines with a budget); null until the estimate is complete. */
  estimateVsBudgetCents: number | null;
  /** Lines whose estimate is a typed cost to complete. */
  costToCompleteLines: number;
  /** Commitments dated on or before the as-of date, on a line or not. */
  committedCents: number;
  /** Their open amount: committed and not yet invoiced against. */
  openCommittedCents: number;
}

/** One commitment's figures as of the report date. */
export interface CommitmentStatus {
  id: string;
  /** Costs entered against it, to date (credits net). */
  invoicedCents: number;
  /** max(0, amount - invoiced); 0 when dated after the as-of date. */
  openCents: number;
  /** Invoiced past the committed amount. */
  overInvoicedCents: number;
  /** Dated after the as-of date, so not in the figures. */
  afterAsOf: boolean;
}

export type JobCostIssueCode =
  | "missing_budgets"
  | "over_budget_line"
  | "estimate_over_budget_line"
  | "cost_to_complete_used_up"
  | "committed_over_estimate_line"
  | "commitment_over_invoiced"
  | "unassigned_costs"
  | "projected_loss"
  | "costs_after_as_of"
  | "no_costs";

export interface JobCostIssue {
  code: JobCostIssueCode;
  sovLineId?: string;
  message: string;
}

export interface JobCostReport {
  asOf: string | null;
  lines: JobCostLine[];
  totals: JobCostTotals;
  /** Cost to date by category (every category listed, 0 when none). */
  byCategory: Record<CostCategory, number>;
  /** Lines with a scheduled value and no budget: the estimate waits for these. */
  missingBudgetLineIds: string[];
  /** Every commitment passed in, in the same order. */
  commitments: CommitmentStatus[];
  issues: JobCostIssue[];
}

const BPS = 10_000;

/** round(a * b / c), half away from zero, exact for any cents figure (BigInt). c must not be 0. */
export function mulDivRound(a: number, b: number, c: number): number {
  const n = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return Number(neg ? -q : q);
}

const ratioBps = (num: number, den: number): number | null =>
  den === 0 ? null : mulDivRound(num, BPS, den);

const money = (cents: number) => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
};

export function computeJobCost(input: JobCostInput): JobCostReport {
  const ctcOn = new Map<string, string>();
  for (const l of input.lines) {
    if (l.costToCompleteCents != null && l.costToCompleteOn)
      ctcOn.set(l.sovLineId, l.costToCompleteOn);
  }
  // Cost on a line dated on or before the day its cost to complete was typed (any as-of date).
  const throughEstimate = new Map<string, number>();
  const toDate = new Map<string, number>();
  const after = new Map<string, number>();
  const known = new Set(input.lines.map((l) => l.sovLineId));
  const byCategory = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<
    CostCategory,
    number
  >;
  let unassignedToDate = 0;
  let unassignedAfter = 0;
  const commitments = input.commitments ?? [];
  const commitmentIds = new Set(commitments.map((c) => c.id));
  // Costs to date entered against each commitment.
  const invoiced = new Map<string, number>();
  for (const e of input.entries) {
    const later = input.asOf !== null && e.incurredOn > input.asOf;
    if (!later && e.commitmentId && commitmentIds.has(e.commitmentId)) {
      invoiced.set(e.commitmentId, (invoiced.get(e.commitmentId) ?? 0) + e.amountCents);
    }
  }
  const openByLine = new Map<string, number>();
  const committedByLine = new Map<string, number>();
  let unassignedOpen = 0;
  let committedTotal = 0;
  let openTotal = 0;
  const commitmentStatus: CommitmentStatus[] = commitments.map((c) => {
    const inv = invoiced.get(c.id) ?? 0;
    const afterAsOf = input.asOf !== null && c.committedOn > input.asOf;
    const open = afterAsOf ? 0 : Math.max(0, c.amountCents - inv);
    if (!afterAsOf) {
      const lineId = c.sovLineId !== null && known.has(c.sovLineId) ? c.sovLineId : null;
      committedTotal += c.amountCents;
      openTotal += open;
      if (lineId === null) unassignedOpen += open;
      else {
        openByLine.set(lineId, (openByLine.get(lineId) ?? 0) + open);
        committedByLine.set(lineId, (committedByLine.get(lineId) ?? 0) + c.amountCents);
      }
    }
    return {
      id: c.id,
      invoicedCents: inv,
      openCents: open,
      overInvoicedCents: Math.max(0, inv - c.amountCents),
      afterAsOf,
    };
  });
  for (const e of input.entries) {
    const later = input.asOf !== null && e.incurredOn > input.asOf;
    // A cost on a line that no longer exists counts as a job cost not on a line.
    const lineId = e.sovLineId !== null && known.has(e.sovLineId) ? e.sovLineId : null;
    const estimatedOn = lineId === null ? undefined : ctcOn.get(lineId);
    if (lineId !== null && estimatedOn !== undefined && e.incurredOn <= estimatedOn) {
      throughEstimate.set(lineId, (throughEstimate.get(lineId) ?? 0) + e.amountCents);
    }
    if (later) {
      if (lineId === null) unassignedAfter += e.amountCents;
      else after.set(lineId, (after.get(lineId) ?? 0) + e.amountCents);
      continue;
    }
    byCategory[e.category] += e.amountCents;
    if (lineId === null) unassignedToDate += e.amountCents;
    else toDate.set(lineId, (toDate.get(lineId) ?? 0) + e.amountCents);
  }

  const issues: JobCostIssue[] = [];
  const missing: string[] = [];
  const lines: JobCostLine[] = input.lines.map((l) => {
    const cost = toDate.get(l.sovLineId) ?? 0;
    const hasBudget = l.budgetCents !== null;
    const ctc = l.costToCompleteCents ?? null;
    const ctcDate = ctc === null ? null : (l.costToCompleteOn ?? null);
    const hasCtc = ctc !== null && ctcDate !== null;
    if (!hasBudget && !hasCtc && l.scheduledValueCents !== 0) missing.push(l.sovLineId);
    let eac: number | null;
    let basis: EstimateBasis | null;
    if (hasCtc) {
      const forecast = (throughEstimate.get(l.sovLineId) ?? 0) + (ctc as number);
      eac = Math.max(forecast, cost);
      basis = "cost_to_complete";
      if (cost > forecast) {
        issues.push({
          code: "cost_to_complete_used_up",
          sovLineId: l.sovLineId,
          message: `${l.itemNumber} ${l.description}: cost to date ${money(cost)} has passed the estimate of ${money(forecast)} made on ${ctcDate}, so the estimate is the cost to date until a new cost to complete is typed.`,
        });
      }
    } else if (hasBudget) {
      eac = Math.max(l.budgetCents as number, cost);
      basis = "budget";
    } else if (l.scheduledValueCents === 0) {
      eac = cost;
      basis = "cost";
    } else {
      eac = null;
      basis = null;
    }
    const open = openByLine.get(l.sovLineId) ?? 0;
    // Open commitments are cost still to come: the estimate is never less than cost + open.
    if (eac !== null && open > 0 && cost + open > eac) {
      if (basis !== "cost") {
        issues.push({
          code: "committed_over_estimate_line",
          sovLineId: l.sovLineId,
          message: `${l.itemNumber} ${l.description}: cost to date ${money(cost)} plus ${money(open)} still to be invoiced on its purchase orders and subcontracts is ${money(cost + open)}, more than the ${basis === "cost_to_complete" ? "revised estimate" : "budget"} of ${money(eac)}; the estimate uses the committed figure.`,
        });
      }
      eac = cost + open;
      basis = "committed";
    }
    const overBudget = hasBudget && cost > (l.budgetCents as number);
    const vsBudget = hasBudget && eac !== null ? eac - (l.budgetCents as number) : null;
    if (basis === "cost_to_complete" && !overBudget && vsBudget !== null && vsBudget > 0) {
      issues.push({
        code: "estimate_over_budget_line",
        sovLineId: l.sovLineId,
        message: `${l.itemNumber} ${l.description}: the revised estimate of ${money(eac as number)} is over the budget of ${money(l.budgetCents as number)} by ${money(vsBudget)}.`,
      });
    }
    if (overBudget) {
      issues.push({
        code: "over_budget_line",
        sovLineId: l.sovLineId,
        message: `${l.itemNumber} ${l.description}: cost to date ${money(cost)} is over its budget of ${money(l.budgetCents as number)} by ${money(cost - (l.budgetCents as number))}.`,
      });
    }
    return {
      sovLineId: l.sovLineId,
      itemNumber: l.itemNumber,
      description: l.description,
      scheduledValueCents: l.scheduledValueCents,
      billedToDateCents: l.billedToDateCents,
      budgetCents: l.budgetCents,
      costToDateCents: cost,
      costAfterCents: after.get(l.sovLineId) ?? 0,
      costToCompleteCents: hasCtc ? ctc : null,
      costToCompleteOn: hasCtc ? ctcDate : null,
      committedCents: committedByLine.get(l.sovLineId) ?? 0,
      openCommittedCents: open,
      estimateAtCompletionCents: eac,
      estimateBasis: basis,
      remainingCostCents: eac === null ? null : eac - cost,
      estimateVsBudgetCents: vsBudget,
      budgetRemainingCents: hasBudget ? (l.budgetCents as number) - cost : null,
      overBudget,
      costPctOfBudgetBps:
        hasBudget && (l.budgetCents as number) > 0 ? ratioBps(cost, l.budgetCents as number) : null,
      billedPctBps: ratioBps(l.billedToDateCents, l.scheduledValueCents),
    };
  });

  const sum = (f: (l: JobCostLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  const contract = sum((l) => l.scheduledValueCents);
  const billed = sum((l) => l.billedToDateCents);
  const costToDate = sum((l) => l.costToDateCents) + unassignedToDate;
  const costAfter = sum((l) => l.costAfterCents) + unassignedAfter;

  let eac: number | null = null;
  if (missing.length === 0) {
    // Costs on no line are spent money with no budget: they add to the estimate as they are.
    eac =
      sum((l) => l.estimateAtCompletionCents ?? 0) + Math.max(0, unassignedToDate) + unassignedOpen;
  }
  const pct =
    eac === null || eac <= 0 ? null : Math.min(BPS, Math.max(0, ratioBps(costToDate, eac) ?? 0));
  // Earned revenue uses the exact cost ratio, not the rounded percent.
  const earned =
    eac === null || eac <= 0
      ? null
      : mulDivRound(contract, Math.min(Math.max(costToDate, 0), eac), eac);
  const projected = eac === null ? null : contract - eac;

  if (missing.length > 0) {
    issues.unshift({
      code: "missing_budgets",
      message: `${missing.length} line${missing.length === 1 ? " has" : "s have"} no cost budget, so percent complete, earned revenue and over/under billing are not worked out yet. Enter a budget on every line with a scheduled value (0 is allowed).`,
    });
  }
  if (unassignedToDate !== 0) {
    issues.push({
      code: "unassigned_costs",
      message: `${money(unassignedToDate)} of cost is on no schedule-of-values line. It counts in the job's cost and is added to the estimate at completion as it is, since no budget covers it.`,
    });
  }
  if (projected !== null && projected < 0) {
    issues.push({
      code: "projected_loss",
      message: `The job is projected to lose ${money(-projected)}: the estimate at completion is more than the contract. Accounting practice generally records the whole projected loss when it becomes known; ask your accountant how to report it.`,
    });
  }
  if (costAfter !== 0 && input.asOf !== null) {
    issues.push({
      code: "costs_after_as_of",
      message: `${money(costAfter)} of cost is dated after ${input.asOf} and is left out, so cost is compared with billing at the same date.`,
    });
  }
  commitments.forEach((c, i) => {
    const st = commitmentStatus[i];
    if (st && st.overInvoicedCents > 0 && !st.afterAsOf) {
      issues.push({
        code: "commitment_over_invoiced",
        sovLineId: c.sovLineId ?? undefined,
        message: `${money(st.invoicedCents)} has been entered against a commitment of ${money(c.amountCents)}, ${money(st.overInvoicedCents)} over. Record the change order to it, or check the costs put against it.`,
      });
    }
  });
  if (input.entries.length === 0) {
    issues.push({ code: "no_costs", message: "No costs entered for this job yet." });
  }

  return {
    asOf: input.asOf,
    lines,
    totals: {
      contractCents: contract,
      budgetCents: lines.reduce((s, l) => s + (l.budgetCents ?? 0), 0),
      costToDateCents: costToDate,
      costAfterCents: costAfter,
      unassignedCostToDateCents: unassignedToDate,
      billedToDateCents: billed,
      estimateAtCompletionCents: eac,
      costToCompleteCents: eac === null ? null : eac - costToDate,
      percentCompleteBps: pct,
      earnedRevenueCents: earned,
      overUnderBilledCents: earned === null ? null : billed - earned,
      grossProfitToDateCents: earned === null ? null : earned - costToDate,
      projectedGrossProfitCents: projected,
      projectedMarginBps: projected === null ? null : ratioBps(projected, contract),
      estimateVsBudgetCents: eac === null ? null : sum((l) => l.estimateVsBudgetCents ?? 0),
      costToCompleteLines: lines.filter((l) => l.estimateBasis === "cost_to_complete").length,
      committedCents: committedTotal,
      openCommittedCents: openTotal,
    },
    byCategory,
    missingBudgetLineIds: missing,
    commitments: commitmentStatus,
    issues,
  };
}

/**
 * Reads pasted cost lines (from payroll, a supplier statement or an accounting export): one per
 * row, tab- or comma-separated, columns date, amount, then optional category, line item number and
 * description. A header row is skipped. Dates are YYYY-MM-DD or M/D/YYYY. Rows that do not read are
 * returned with a reason, never guessed.
 */
export interface ParsedCostRow {
  incurredOn: string;
  amountCents: number;
  category: CostCategory;
  itemNumber: string | null;
  description: string | null;
}

export interface CostPasteResult {
  rows: ParsedCostRow[];
  errors: { row: number; message: string }[];
}

function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCostDate(s: string): string | null {
  const t = s.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [y, m, d] = [Number(us[3]), Number(us[1]), Number(us[2])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseAmount(s: string): number | null {
  let t = s.trim().replace(/[$,\s]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    neg = !neg;
    t = t.slice(1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return neg && cents !== 0 ? -cents : cents;
}

function parseCategory(s: string): CostCategory | null {
  const t = s.trim().toLowerCase();
  if (t === "") return "other";
  for (const c of COST_CATEGORIES)
    if (t === c || t === COST_CATEGORY_LABELS[c].toLowerCase()) return c;
  if (/^(labou?r|payroll|wages?)$/.test(t)) return "labor";
  if (/^(materials?|supplies|supply)$/.test(t)) return "material";
  if (/^(equip|equipment|rental|rentals)$/.test(t)) return "equipment";
  if (/^(sub|subs|subcontractor|subcontractors|subcontracts?)$/.test(t)) return "subcontract";
  return null;
}

export function parseCostPaste(text: string): CostPasteResult {
  const rows: ParsedCostRow[] = [];
  const errors: { row: number; message: string }[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (raw.trim() === "") return;
    const cells = splitRow(raw);
    const [dateCell = "", amountCell = "", catCell = "", itemCell = "", ...rest] = cells;
    const incurredOn = parseCostDate(dateCell);
    if (!incurredOn) {
      // A first row whose first cell is not a date is a header.
      if (rows.length === 0 && errors.length === 0 && /[a-z]/i.test(dateCell)) return;
      errors.push({
        row: i + 1,
        message: `"${dateCell}" is not a date (use YYYY-MM-DD or M/D/YYYY)`,
      });
      return;
    }
    const amountCents = parseAmount(amountCell);
    if (amountCents === null) {
      errors.push({ row: i + 1, message: `"${amountCell}" is not an amount` });
      return;
    }
    const category = parseCategory(catCell);
    if (!category) {
      errors.push({
        row: i + 1,
        message: `"${catCell}" is not a category (labor, material, equipment, subcontract or other)`,
      });
      return;
    }
    const description = rest.join(", ").trim();
    rows.push({
      incurredOn,
      amountCents,
      category,
      itemNumber: itemCell.trim() === "" ? null : itemCell.trim(),
      description: description === "" ? null : description.slice(0, 300),
    });
  });
  return { rows, errors };
}
