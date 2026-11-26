// Pay-application math: the "application and certificate for payment" summary and the continuation
// sheet (the standard fields used on AIA G702/G703-style forms; this is not an AIA document).
//
// Pure functions, no I/O. All money is integer US cents; percentages are basis points (1000 = 10%).
// Every pay application of a project is computed in sequence because each one depends on the
// previous one ("work completed from previous application", "less previous certificates").
//
// Continuation sheet columns (per schedule-of-values line):
//   A item no. · B description · C scheduled value (original + approved change orders)
//   D work completed from previous application (previous D + E)
//   E work completed this period · F materials presently stored (not in D or E)
//   G total completed and stored to date (D + E + F) · G/C % · H balance to finish (C − G)
//   I retainage held to date
// Summary lines:
//   1 original contract sum · 2 net change by change orders · 3 contract sum to date (1 + 2)
//   4 total completed and stored to date (ΣG) · 5 retainage (5a on completed work, 5b on stored
//   material) · 6 total earned less retainage (4 − 5) · 7 less previous certificates for payment
//   (line 6 of the previous application) · 8 current payment due (6 − 7)
//   9 balance to finish, including retainage (3 − 6)

export const BPS_DENOMINATOR = 10_000;

/** amount × bps / 10 000, rounded half away from zero to whole cents. */
export function applyBps(amountCents: number, bps: number): number {
  const raw = (amountCents * bps) / BPS_DENOMINATOR;
  const rounded = Math.round(Math.abs(raw));
  return raw < 0 ? -rounded : rounded;
}

export interface SovLineInput {
  id: string;
  itemNumber: string;
  description: string;
  /** Scheduled value in the original contract (0 for lines added by a change order). */
  originalCents: number;
  sortOrder: number;
  /**
   * Mid-job start: work completed on this line (columns D + E, excluding stored materials) on the
   * last pay application made before the job moved here. 0 or absent for a job billed from #1.
   */
  openingCompletedCents?: number;
  /**
   * Mid-job start: retainage on this line already released (paid out) on or before that last
   * application, a line finished and its retainage let go, say. It counts as released before the
   * first application here, so column I and line 5 start from what is actually still held.
   */
  openingReleasedCents?: number;
  /**
   * The line's own retainage rate, held on both its completed work and its stored materials in
   * every application, whatever the application's rates (a bond or insurance line billed with no
   * retainage, say). null or absent: the line follows the application's rates.
   */
  retainagePctBps?: number | null;
}

/** A line held at its own retainage rate, for the "except" note beside lines 5a and 5b. */
export interface LineRate {
  sovLineId: string;
  itemNumber: string;
  retainagePctBps: number;
}

export interface ChangeOrderInput {
  id: string;
  number: string;
  status: "pending" | "approved" | "rejected";
  /** ISO date (YYYY-MM-DD) of approval; counts in every pay app whose periodTo is on/after it. */
  approvedOn: string | null;
  items: { sovLineId: string; amountCents: number }[];
}

export interface PeriodLineInput {
  workThisPeriodCents: number;
  /** Balance of materials presently stored and not yet installed (not cumulative across periods). */
  storedMaterialsCents: number;
  /** Retainage on this line released (paid out) in this period. */
  retainageReleasedCents: number;
}

export interface PeriodInput {
  id: string;
  number: number;
  periodTo: string;
  retainagePctBps: number;
  storedRetainagePctBps: number;
  /** Keyed by SOV line id; missing lines mean no activity this period. */
  lines: Record<string, PeriodLineInput>;
}

/**
 * A job that was already being billed elsewhere when it moved here. The last application made
 * elsewhere is the "opening application": its work to date carries into column D of the first
 * application here, and its line 6 (total earned less retainage) is the first one's line 7.
 */
export interface OpeningInput {
  /** Number of the last application made elsewhere; the first one here is this + 1. */
  appNumber: number;
  /** Its period end (ISO date): change orders approved on/before it count as previous. */
  periodTo: string;
  /** Its line 6, total earned less retainage, which is the first application's line 7. */
  previousCertificatesCents: number;
  /** Its line 5a, retainage on completed work, when known: checked against the recomputed figure. */
  retainageHeldCents: number | null;
}

export interface ProjectInput {
  originalContractSumCents: number;
  opening?: OpeningInput | null;
}

export interface ContinuationLine {
  sovLineId: string;
  itemNumber: string;
  description: string;
  scheduledValueCents: number;
  fromPreviousCents: number;
  thisPeriodCents: number;
  storedMaterialsCents: number;
  completedAndStoredCents: number;
  /** G / C in basis points (null when C is 0). */
  percentCompleteBps: number | null;
  balanceToFinishCents: number;
  retainageCents: number;
  /** Retainage released on this line in this period (included in retainageCents being lower). */
  retainageReleasedThisPeriodCents: number;
  /** The line's own retainage rate; null when it follows the application's rates. */
  retainageRateBps: number | null;
}

export interface ChangeOrderSummary {
  previousAdditionsCents: number;
  previousDeductionsCents: number;
  thisPeriodAdditionsCents: number;
  thisPeriodDeductionsCents: number;
  netChangeCents: number;
}

export interface ApplicationSummary {
  originalContractSumCents: number;
  netChangeByChangeOrdersCents: number;
  contractSumToDateCents: number;
  totalCompletedAndStoredCents: number;
  retainageOnCompletedWorkCents: number;
  retainageOnStoredMaterialsCents: number;
  totalRetainageCents: number;
  totalEarnedLessRetainageCents: number;
  lessPreviousCertificatesCents: number;
  currentPaymentDueCents: number;
  balanceToFinishIncludingRetainageCents: number;
  retainagePctBps: number;
  storedRetainagePctBps: number;
  /** Lines on this application held at their own rate instead of the two above. */
  lineRates: LineRate[];
  changeOrders: ChangeOrderSummary;
}

export interface Totals {
  scheduledValueCents: number;
  fromPreviousCents: number;
  thisPeriodCents: number;
  storedMaterialsCents: number;
  completedAndStoredCents: number;
  balanceToFinishCents: number;
  retainageCents: number;
}

export type WarningCode =
  | "overbilled_line"
  | "billed_on_unapproved_change_order"
  | "negative_to_date"
  | "negative_stored"
  | "retainage_release_exceeds_held"
  | "unknown_line"
  | "sov_does_not_match_contract"
  | "opening_retainage_differs";

/** Warnings that must be fixed before a pay application can be submitted. */
export const BLOCKING_WARNINGS: ReadonlySet<WarningCode> = new Set<WarningCode>([
  "negative_to_date",
  "negative_stored",
  "retainage_release_exceeds_held",
  "sov_does_not_match_contract",
]);

export interface Warning {
  code: WarningCode;
  sovLineId?: string;
  message: string;
}

export interface ComputedApplication {
  periodId: string;
  number: number;
  lines: ContinuationLine[];
  totals: Totals;
  summary: ApplicationSummary;
  warnings: Warning[];
}

const isApprovedBy = (co: ChangeOrderInput, date: string | null): boolean =>
  co.status === "approved" && co.approvedOn !== null && (date === null || co.approvedOn <= date);

/** Scheduled value adjustment per SOV line from change orders approved on/before `date`. */
export function changeOrderAdjustments(
  changeOrders: readonly ChangeOrderInput[],
  date: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const co of changeOrders) {
    if (!isApprovedBy(co, date)) continue;
    for (const item of co.items) {
      out.set(item.sovLineId, (out.get(item.sovLineId) ?? 0) + item.amountCents);
    }
  }
  return out;
}

/** Additions/deductions split by whether the change order counted in the previous application. */
export function summarizeChangeOrders(
  changeOrders: readonly ChangeOrderInput[],
  periodTo: string,
  previousPeriodTo: string | null,
): ChangeOrderSummary {
  const s: ChangeOrderSummary = {
    previousAdditionsCents: 0,
    previousDeductionsCents: 0,
    thisPeriodAdditionsCents: 0,
    thisPeriodDeductionsCents: 0,
    netChangeCents: 0,
  };
  for (const co of changeOrders) {
    if (!isApprovedBy(co, periodTo)) continue;
    const amount = co.items.reduce((sum, i) => sum + i.amountCents, 0);
    const previous = previousPeriodTo !== null && isApprovedBy(co, previousPeriodTo);
    if (amount >= 0) {
      if (previous) s.previousAdditionsCents += amount;
      else s.thisPeriodAdditionsCents += amount;
    } else if (previous) s.previousDeductionsCents += -amount;
    else s.thisPeriodDeductionsCents += -amount;
    s.netChangeCents += amount;
  }
  return s;
}

const fmtUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Computes every pay application of a project, in order. `periods` must be sorted by `number`.
 * The result at index i is the application for periods[i].
 */
export function computeApplications(
  project: ProjectInput,
  sovLines: readonly SovLineInput[],
  changeOrders: readonly ChangeOrderInput[],
  periods: readonly PeriodInput[],
): ComputedApplication[] {
  const lines = [...sovLines].sort((a, b) => a.sortOrder - b.sortOrder);
  const known = new Set(lines.map((l) => l.id));
  // Running per-line state across periods.
  const completedToDate = new Map<string, number>(); // Σ work (D + E), excluding stored materials
  const releasedToDate = new Map<string, number>();
  const opening = project.opening ?? null;
  for (const line of lines) {
    if (line.openingCompletedCents) completedToDate.set(line.id, line.openingCompletedCents);
    if (line.openingReleasedCents) releasedToDate.set(line.id, line.openingReleasedCents);
  }
  let previousEarnedLessRetainage = opening?.previousCertificatesCents ?? 0;
  let previousPeriodTo: string | null = opening?.periodTo ?? null;
  const results: ComputedApplication[] = [];
  const sovTotal = sovOriginalTotal(lines);

  for (const period of periods) {
    const warnings: Warning[] = [];
    if (sovTotal !== project.originalContractSumCents) {
      warnings.push({
        code: "sov_does_not_match_contract",
        message: `Schedule of values totals ${fmtUsd(sovTotal)} but the original contract sum is ${fmtUsd(project.originalContractSumCents)}.`,
      });
    }
    for (const id of Object.keys(period.lines)) {
      if (!known.has(id)) {
        warnings.push({
          code: "unknown_line",
          sovLineId: id,
          message: "Entry for a schedule-of-values line that no longer exists was ignored.",
        });
      }
    }
    if (opening && results.length === 0 && opening.retainageHeldCents !== null) {
      const warning = openingRetainageWarning(lines, opening, period);
      if (warning) warnings.push(warning);
    }
    const adjustments = changeOrderAdjustments(changeOrders, period.periodTo);
    const out: ContinuationLine[] = [];
    let retainageOnWork = 0;
    let retainageOnStored = 0;

    for (const line of lines) {
      const entry = period.lines[line.id];
      const scheduled = line.originalCents + (adjustments.get(line.id) ?? 0);
      const fromPrevious = completedToDate.get(line.id) ?? 0;
      const thisPeriod = entry?.workThisPeriodCents ?? 0;
      const stored = entry?.storedMaterialsCents ?? 0;
      const releasedNow = entry?.retainageReleasedCents ?? 0;
      const workToDate = fromPrevious + thisPeriod;
      const completedAndStored = workToDate + stored;
      // A line with no value and no activity (e.g. one added by a change order not yet approved for
      // this period) is not shown.
      if (scheduled === 0 && workToDate === 0 && stored === 0 && fromPrevious === 0) {
        continue;
      }

      const ownRate = line.retainagePctBps ?? null;
      const grossWork = applyBps(workToDate, ownRate ?? period.retainagePctBps);
      const grossStored = applyBps(stored, ownRate ?? period.storedRetainagePctBps);
      const releasedBefore = releasedToDate.get(line.id) ?? 0;
      const releasedTotal = releasedBefore + releasedNow;
      const held = grossWork + grossStored - releasedTotal;
      if (held < 0) {
        warnings.push({
          code: "retainage_release_exceeds_held",
          sovLineId: line.id,
          message: `Item ${line.itemNumber}: retainage released (${fmtUsd(releasedTotal)}) exceeds retainage held (${fmtUsd(grossWork + grossStored)}).`,
        });
      }
      if (completedAndStored > scheduled) {
        warnings.push(overbilledWarning(line, completedAndStored, scheduled, changeOrders, period));
      }
      if (workToDate < 0) {
        warnings.push({
          code: "negative_to_date",
          sovLineId: line.id,
          message: `Item ${line.itemNumber}: work completed to date is negative.`,
        });
      }
      if (stored < 0) {
        warnings.push({
          code: "negative_stored",
          sovLineId: line.id,
          message: `Item ${line.itemNumber}: stored materials cannot be negative.`,
        });
      }
      // Releases reduce retainage on completed work first, then on stored material.
      const releaseFromWork = Math.min(releasedTotal, Math.max(grossWork, 0));
      retainageOnWork += grossWork - releaseFromWork;
      retainageOnStored += grossStored - (releasedTotal - releaseFromWork);

      out.push({
        sovLineId: line.id,
        itemNumber: line.itemNumber,
        description: line.description,
        scheduledValueCents: scheduled,
        fromPreviousCents: fromPrevious,
        thisPeriodCents: thisPeriod,
        storedMaterialsCents: stored,
        completedAndStoredCents: completedAndStored,
        percentCompleteBps:
          scheduled === 0 ? null : Math.round((completedAndStored * BPS_DENOMINATOR) / scheduled),
        balanceToFinishCents: scheduled - completedAndStored,
        retainageCents: held,
        retainageReleasedThisPeriodCents: releasedNow,
        retainageRateBps: ownRate,
      });
    }

    const totals: Totals = {
      scheduledValueCents: 0,
      fromPreviousCents: 0,
      thisPeriodCents: 0,
      storedMaterialsCents: 0,
      completedAndStoredCents: 0,
      balanceToFinishCents: 0,
      retainageCents: 0,
    };
    for (const l of out) {
      totals.scheduledValueCents += l.scheduledValueCents;
      totals.fromPreviousCents += l.fromPreviousCents;
      totals.thisPeriodCents += l.thisPeriodCents;
      totals.storedMaterialsCents += l.storedMaterialsCents;
      totals.completedAndStoredCents += l.completedAndStoredCents;
      totals.balanceToFinishCents += l.balanceToFinishCents;
      totals.retainageCents += l.retainageCents;
    }

    const coSummary = summarizeChangeOrders(changeOrders, period.periodTo, previousPeriodTo);
    const contractSumToDate = project.originalContractSumCents + coSummary.netChangeCents;
    const totalRetainage = retainageOnWork + retainageOnStored;
    const earnedLessRetainage = totals.completedAndStoredCents - totalRetainage;
    const summary: ApplicationSummary = {
      originalContractSumCents: project.originalContractSumCents,
      netChangeByChangeOrdersCents: coSummary.netChangeCents,
      contractSumToDateCents: contractSumToDate,
      totalCompletedAndStoredCents: totals.completedAndStoredCents,
      retainageOnCompletedWorkCents: retainageOnWork,
      retainageOnStoredMaterialsCents: retainageOnStored,
      totalRetainageCents: totalRetainage,
      totalEarnedLessRetainageCents: earnedLessRetainage,
      lessPreviousCertificatesCents: previousEarnedLessRetainage,
      currentPaymentDueCents: earnedLessRetainage - previousEarnedLessRetainage,
      balanceToFinishIncludingRetainageCents: contractSumToDate - earnedLessRetainage,
      retainagePctBps: period.retainagePctBps,
      storedRetainagePctBps: period.storedRetainagePctBps,
      lineRates: out
        .filter((l) => l.retainageRateBps !== null)
        .map((l) => ({
          sovLineId: l.sovLineId,
          itemNumber: l.itemNumber,
          retainagePctBps: l.retainageRateBps ?? 0,
        })),
      changeOrders: coSummary,
    };

    results.push({
      periodId: period.id,
      number: period.number,
      lines: out,
      totals,
      summary,
      warnings,
    });

    // Carry state forward: stored materials are a balance, not cumulative, so only work carries.
    for (const line of lines) {
      const entry = period.lines[line.id];
      if (!entry) continue;
      completedToDate.set(line.id, (completedToDate.get(line.id) ?? 0) + entry.workThisPeriodCents);
      releasedToDate.set(
        line.id,
        (releasedToDate.get(line.id) ?? 0) + entry.retainageReleasedCents,
      );
    }
    previousEarnedLessRetainage = earnedLessRetainage;
    previousPeriodTo = period.periodTo;
  }
  return results;
}

/** A change order adding to one line that this application does not count. */
export interface UncountedChange {
  changeOrderId: string;
  number: string;
  status: "pending" | "approved" | "rejected";
  approvedOn: string | null;
  /** What it adds to this line (positive; deductions never explain billing over the value). */
  amountCents: number;
}

/**
 * Change orders that would add to `sovLineId` but do not count in an application ending
 * `periodTo`: pending, rejected, or approved after the period end. Sorted by change order number.
 */
export function uncountedChangesOnLine(
  changeOrders: readonly ChangeOrderInput[],
  sovLineId: string,
  periodTo: string,
): UncountedChange[] {
  const out: UncountedChange[] = [];
  for (const co of changeOrders) {
    if (isApprovedBy(co, periodTo)) continue;
    const amount = co.items
      .filter((i) => i.sovLineId === sovLineId)
      .reduce((s, i) => s + i.amountCents, 0);
    if (amount <= 0) continue;
    out.push({
      changeOrderId: co.id,
      number: co.number,
      status: co.status,
      approvedOn: co.approvedOn,
      amountCents: amount,
    });
  }
  return out.sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
}

const listText = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * A line billed above its scheduled value. When the excess rests on a change order this
 * application cannot count yet (pending, or approved after the period end), say which one and
 * what to do: GCs do not certify work on a change order before it is approved, and a line billed
 * over its approved value is the most common reason an application comes back. Rejected change
 * orders on the line are named on the plain warning.
 */
function overbilledWarning(
  line: SovLineInput,
  completedAndStored: number,
  scheduled: number,
  changeOrders: readonly ChangeOrderInput[],
  period: PeriodInput,
): Warning {
  const over = completedAndStored - scheduled;
  const uncounted = uncountedChangesOnLine(changeOrders, line.id, period.periodTo);
  const waiting = uncounted.filter((c) => c.status !== "rejected");
  const rejected = uncounted.filter((c) => c.status === "rejected");
  const rejectedText =
    rejected.length === 0
      ? ""
      : ` ${rejected.length === 1 ? "Change order" : "Change orders"} ${listText(rejected.map((c) => c.number))} for this line ${rejected.length === 1 ? "was" : "were"} rejected and ${rejected.length === 1 ? "adds" : "add"} nothing.`;
  if (waiting.length === 0) {
    return {
      code: "overbilled_line",
      sovLineId: line.id,
      message: `Item ${line.itemNumber}: completed and stored (${fmtUsd(completedAndStored)}) exceeds the scheduled value (${fmtUsd(scheduled)}).${rejectedText}`,
    };
  }
  const pending = waiting.filter((c) => c.status === "pending");
  const late = waiting.filter((c) => c.status === "approved");
  const parts: string[] = [];
  if (pending.length > 0) {
    parts.push(
      `${pending.length === 1 ? "change order" : "change orders"} ${listText(
        pending.map((c) => `${c.number} (${fmtUsd(c.amountCents)})`),
      )} ${pending.length === 1 ? "is" : "are"} still pending`,
    );
  }
  if (late.length > 0) {
    parts.push(
      `${late.length === 1 ? "change order" : "change orders"} ${listText(
        late.map((c) => `${c.number} (${fmtUsd(c.amountCents)}, approved ${c.approvedOn})`),
      )} ${late.length === 1 ? "was" : "were"} approved after this period ends (${period.periodTo})`,
    );
  }
  const waitingTotal = waiting.reduce((s, c) => s + c.amountCents, 0);
  const advice =
    late.length > 0 && pending.length === 0
      ? ` It counts from the first application ending on or after its approval date: bill the ${fmtUsd(over)} then, or correct the approval date if the GC signed it earlier.`
      : ` GCs do not certify work on a change order before it is approved: hold the ${fmtUsd(over)} until it is signed, or mark it approved with the date the GC signed.`;
  const stillOver =
    over > waitingTotal
      ? ` Even with ${waiting.length === 1 ? "it" : "them"} counted, the line is ${fmtUsd(over - waitingTotal)} over.`
      : "";
  return {
    code: "billed_on_unapproved_change_order",
    sovLineId: line.id,
    message: `Item ${line.itemNumber}: completed and stored (${fmtUsd(completedAndStored)}) is ${fmtUsd(over)} over the approved scheduled value (${fmtUsd(scheduled)}), and ${listText(parts)}.${advice}${stillOver}${rejectedText}`,
  };
}

/**
 * The first application here recomputes retainage on all work to date at its own rate, less what
 * was released per line before the move. When that differs from the retainage the last application
 * elsewhere held (a different rate before, or a release not entered), say so: the gap shows up in
 * this application's payment due.
 */
function openingRetainageWarning(
  lines: readonly SovLineInput[],
  opening: OpeningInput,
  period: PeriodInput,
): Warning | null {
  const gross = lines.reduce(
    (s, l) =>
      s + applyBps(l.openingCompletedCents ?? 0, l.retainagePctBps ?? period.retainagePctBps),
    0,
  );
  const releasedBefore = lines.reduce((s, l) => s + (l.openingReleasedCents ?? 0), 0);
  const recomputed = gross - releasedBefore;
  const held = opening.retainageHeldCents ?? recomputed;
  if (recomputed === held) return null;
  const pct = (period.retainagePctBps / 100).toFixed(2).replace(/\.?0+$/, "");
  const own = lines.some((l) => (l.retainagePctBps ?? null) !== null && l.openingCompletedCents);
  const basis = own ? `${pct}% (and each line's own rate)` : `${pct}%`;
  const less = releasedBefore ? `, less ${fmtUsd(releasedBefore)} released before the move,` : "";
  const advice =
    recomputed > held
      ? ` If retainage of ${fmtUsd(recomputed - held)} was released before the move, enter it on the lines it was released from in the opening balance ("Retainage released before the move"); if the rate changed, set this application's rate to the one now in force.`
      : releasedBefore
        ? " Check the retainage released before the move on each line; if the rate is now higher, check it with the GC."
        : " If the rate is now higher, check it with the GC; otherwise set this application's rate to the one in force.";
  return {
    code: "opening_retainage_differs",
    message: `Application #${opening.appNumber} (the last one before this job moved here) held ${fmtUsd(held)} of retainage, but ${basis} of the work carried over${less} is ${fmtUsd(recomputed)}.${advice}`,
  };
}

/** Original contract sum = Σ original scheduled values (the SOV must reconcile to the contract). */
export function sovOriginalTotal(lines: readonly SovLineInput[]): number {
  return lines.reduce((s, l) => s + l.originalCents, 0);
}

const pctText = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/**
 * The note beside lines 5a and 5b when some lines are held at their own rate, grouped by rate:
 * "items 1, 2 at 0%; item 7 at 5%". Empty when every line follows the application's rates.
 */
export function lineRatesNote(lineRates: readonly LineRate[]): string {
  const byRate = new Map<number, string[]>();
  for (const l of lineRates) {
    byRate.set(l.retainagePctBps, [...(byRate.get(l.retainagePctBps) ?? []), l.itemNumber]);
  }
  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([rate, items]) =>
        `${items.length === 1 ? "item" : "items"} ${items.join(", ")} at ${pctText(rate)}`,
    )
    .join("; ");
}
