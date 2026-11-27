// Retainage release planner: turns "release 50% of the retainage", "release $12,000" or "release
// everything on the finished lines" into the per-line "retainage released this period" amounts the
// continuation sheet takes. Pure, integer cents, no I/O.
//
// What can be released on a line is the retainage held on it before this application's own
// release: column I plus whatever this application already releases on that line (the plan
// replaces that amount rather than adding to it). The target total is computed once (a percentage
// of the held total, or the dollar amount asked for) and split across the lines in proportion to
// what each holds, by largest remainder, so the line amounts always add up to the target to the
// cent and no line is ever released past what it holds.

import { applyBps, BPS_DENOMINATOR, type ContinuationLine } from "./payapp-math";

/** Which lines the release applies to. */
export type ReleaseScope =
  /** Every line holding retainage. */
  | { kind: "all" }
  /** Lines whose work completed to date (D + E) reaches the scheduled value. */
  | { kind: "complete" }
  /** The listed schedule-of-values lines. */
  | { kind: "selected"; sovLineIds: readonly string[] };

/** How much to release, across the lines in scope. */
export type ReleaseAmount =
  /** A share of the retainage held on those lines (10 000 = all of it). */
  | { kind: "percent"; bps: number }
  /** A dollar amount, split in proportion to what each line holds. */
  | { kind: "amount"; cents: number };

export interface ReleasePlanLine {
  sovLineId: string;
  itemNumber: string;
  description: string;
  /** Retainage held before this application's release. */
  heldCents: number;
  /** What this application released on the line before the plan (the plan replaces it). */
  currentReleaseCents: number;
  /** Retainage released this period under the plan. */
  releaseCents: number;
  /** Retainage still held after the plan. */
  heldAfterCents: number;
}

export type ReleasePlanIssue =
  | "nothing_in_scope"
  | "nothing_held"
  | "amount_exceeds_held"
  | "unknown_line"
  | "invalid_amount";

export interface ReleasePlan {
  /** The lines in scope that hold retainage, in continuation-sheet order. */
  lines: ReleasePlanLine[];
  heldCents: number;
  releaseCents: number;
  /** Change in this period's release across the lines in scope (positive raises line 8). */
  changeCents: number;
  /** Empty when the plan can be applied. */
  issues: { code: ReleasePlanIssue; message: string }[];
}

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Retainage held on a line before this application's own release (never negative). */
export function heldBeforeRelease(line: ContinuationLine): number {
  return Math.max(line.retainageCents + line.retainageReleasedThisPeriodCents, 0);
}

/** Work completed to date (D + E) reaches the scheduled value. */
export function lineIsComplete(line: ContinuationLine): boolean {
  return (
    line.scheduledValueCents > 0 &&
    line.fromPreviousCents + line.thisPeriodCents >= line.scheduledValueCents
  );
}

/**
 * Splits `total` across `weights` in proportion, rounding by largest remainder (ties go to the
 * earlier line). Assumes 0 <= total <= Σ weights and every weight >= 0, so no share exceeds its
 * weight. BigInt keeps total × weight exact for any contract size.
 */
export function allocateProRata(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const T = BigInt(total);
  const S = BigInt(sum);
  const shares = weights.map((w) => {
    const num = T * BigInt(w);
    return { base: num / S, rem: num % S };
  });
  let left = total - shares.reduce((s, x) => s + Number(x.base), 0);
  const order = shares
    .map((x, i) => ({ i, rem: x.rem }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  const out = shares.map((x) => Number(x.base));
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left -= 1;
  }
  return out;
}

export function planRetainageRelease(
  lines: readonly ContinuationLine[],
  scope: ReleaseScope,
  amount: ReleaseAmount,
): ReleasePlan {
  const issues: ReleasePlan["issues"] = [];
  if (scope.kind === "selected") {
    const known = new Set(lines.map((l) => l.sovLineId));
    if (scope.sovLineIds.some((id) => !known.has(id))) {
      issues.push({
        code: "unknown_line",
        message: "A selected line is not on this application's continuation sheet.",
      });
    }
  }
  const wanted = scope.kind === "selected" ? new Set(scope.sovLineIds) : null;
  const inScope = lines.filter((l) =>
    scope.kind === "all"
      ? true
      : scope.kind === "complete"
        ? lineIsComplete(l)
        : wanted?.has(l.sovLineId) === true,
  );
  const holding = inScope.filter((l) => heldBeforeRelease(l) > 0);
  const heldCents = holding.reduce((s, l) => s + heldBeforeRelease(l), 0);

  if (inScope.length === 0) {
    issues.push({
      code: "nothing_in_scope",
      message:
        scope.kind === "complete"
          ? "No line is complete yet (work to date below the scheduled value)."
          : "No lines selected.",
    });
  } else if (heldCents === 0) {
    issues.push({ code: "nothing_held", message: "The lines chosen hold no retainage." });
  }

  let target = 0;
  if (amount.kind === "percent") {
    if (!Number.isInteger(amount.bps) || amount.bps <= 0 || amount.bps > BPS_DENOMINATOR) {
      issues.push({ code: "invalid_amount", message: "Enter a percentage above 0 and up to 100." });
    } else {
      target = applyBps(heldCents, amount.bps);
    }
  } else if (!Number.isSafeInteger(amount.cents) || amount.cents <= 0) {
    issues.push({ code: "invalid_amount", message: "Enter an amount above $0." });
  } else if (amount.cents > heldCents) {
    issues.push({
      code: "amount_exceeds_held",
      message: `${usd(amount.cents)} is more than the ${usd(heldCents)} of retainage held on the lines chosen.`,
    });
  } else {
    target = amount.cents;
  }
  if (issues.length) target = 0;

  const shares = allocateProRata(target, holding.map(heldBeforeRelease));
  const planLines = holding.map((l, i) => {
    const held = heldBeforeRelease(l);
    const release = shares[i] ?? 0;
    return {
      sovLineId: l.sovLineId,
      itemNumber: l.itemNumber,
      description: l.description,
      heldCents: held,
      currentReleaseCents: l.retainageReleasedThisPeriodCents,
      releaseCents: release,
      heldAfterCents: held - release,
    };
  });
  const releaseCents = planLines.reduce((s, l) => s + l.releaseCents, 0);
  // Lines in scope that hold nothing keep their entry; only the holding lines change.
  const changeCents = planLines.reduce((s, l) => s + l.releaseCents - l.currentReleaseCents, 0);
  return { lines: planLines, heldCents, releaseCents, changeCents, issues };
}
