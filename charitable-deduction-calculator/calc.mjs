// Core arithmetic for comparing two 2026 charitable-giving deduction paths
// under the One Big Beautiful Bill Act (OBBBA): the new above-the-line
// deduction for non-itemizers, and itemizing cash gifts on Schedule A after
// OBBBA's new permanent 0.5%-of-AGI floor. No network calls: this applies
// published federal figures to the numbers the user supplies. It is not a
// full tax return -- see README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch against Instead's "Charitable deductions
// return for non-itemizers in 2026", TheStreet's "Vanguard flags the $1,000
// charitable write-off for 2026", Tax Foundation's "Changes to Charitable
// Giving Under the One Big Beautiful Bill Act", Taft Law's "Charitable
// Giving After the OBBBA: The 2026 Outlook", a cross-check search
// confirming the exact IRC 170(p) filing-status breakdown, and a further
// cross-check confirming OBBBA made the existing 60%-of-AGI cash-giving
// ceiling permanent, cross-checked against each other:
//
//   - New IRC Section 170(p), effective tax years beginning after
//     2025, lets a taxpayer who does NOT itemize claim an "above-the-line"
//     deduction (reduces AGI directly, available even while taking the
//     standard deduction) for CASH gifts to qualifying public charities --
//     $1,000 for single, head-of-household, and married-filing-separately
//     filers, $2,000 for married filing jointly (not doubled per person;
//     MFJ is simply the one status that gets the higher figure). Fixed
//     dollar amounts, not indexed for inflation as of this writing.
//   - The non-itemizer deduction is CASH ONLY to public charities --
//     donor-advised fund contributions do not qualify, it cannot be
//     carried forward to a future year, and it is NOT subject to the new
//     0.5%-of-AGI floor described below (that floor applies only to
//     itemized charitable deductions on Schedule A).
//   - For itemizers, OBBBA adds a NEW, PERMANENT floor starting with tax
//     years beginning after December 31, 2025: aggregate charitable
//     contributions are deductible only to the extent they exceed 0.5% of
//     the taxpayer's AGI. The first slice of giving up to that floor
//     produces no itemized tax benefit at all -- it is simply washed out,
//     not carried forward or refunded some other way.
//   - Separately, OBBBA made PERMANENT the existing 60%-of-AGI ceiling on
//     deductible cash gifts to public charities (a TCJA-era increase from
//     the historical 50% that had been scheduled to revert at the end of
//     2025). This module applies that ceiling BEFORE the new floor: the
//     traditional AGI ceiling first limits what could ever be deductible,
//     then the new floor is subtracted from that capped figure -- both are
//     percentages of the same AGI, applied to the same aggregate cash
//     giving, and this ordering is this module's own explicit modeling
//     choice, not a distinction the statute itself makes explicit.
//   - This module does NOT model the separate, much larger change OBBBA
//     makes for taxpayers in the top (37%) tax bracket -- a new limitation
//     that reduces the tax VALUE of all itemized deductions combined
//     (mortgage interest, SALT, charitable, etc.) to 35 cents per dollar
//     instead of 37, computed against total itemized deductions or excess
//     taxable income over the top-bracket threshold, whichever is less.
//     That computation needs a taxpayer's COMPLETE itemized-deduction
//     total, not just charitable giving, and is out of scope for a
//     calculator scoped to charitable giving alone -- flagged, not
//     computed.
//   - Contributions of appreciated capital-gain property (stock held over a
//     year, real estate) remain separately limited to 30% of AGI and are
//     not modeled here -- this module assumes cash gifts only, consistent
//     with what qualifies for the non-itemizer path in the first place.
//
// This module does not verify a filer's AGI, cash giving, or filing
// status -- the user supplies each figure, and the page points at a
// qualified tax professional as the source to verify against before filing.

export const NON_ITEMIZER_CAP = { single: 1_000, hoh: 1_000, mfs: 1_000, mfj: 2_000 };

export const ITEMIZED_FLOOR_RATE = 0.005; // 0.5% of AGI
export const ITEMIZED_CEILING_RATE = 0.60; // 60% of AGI, permanent under OBBBA

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Compares the non-itemizer above-the-line charitable deduction against
 * itemizing the same cash giving on Schedule A after OBBBA's new 0.5%-of-AGI
 * floor (and the permanent 60%-of-AGI ceiling).
 */
export function charitableDeductionOutcome({
  filingStatus = "single",
  agi = 0,
  cashGiving = 0,
} = {}) {
  const agiValue = Math.max(0, num(agi));
  const giving = Math.max(0, num(cashGiving));

  const nonItemizerCap = NON_ITEMIZER_CAP[filingStatus] ?? NON_ITEMIZER_CAP.single;
  const nonItemizerDeduction = Math.min(giving, nonItemizerCap);
  const nonItemizerExcess = Math.max(0, giving - nonItemizerCap);

  const ceiling = agiValue * ITEMIZED_CEILING_RATE;
  const cappedByCeiling = Math.min(giving, ceiling);
  const floor = agiValue * ITEMIZED_FLOOR_RATE;
  const itemizedDeduction = Math.max(0, cappedByCeiling - floor);
  const washedOutByFloor = Math.min(cappedByCeiling, floor);
  const disallowedByCeiling = Math.max(0, giving - ceiling);

  const betterPath = itemizedDeduction > nonItemizerDeduction
    ? "itemized"
    : nonItemizerDeduction > itemizedDeduction
      ? "non-itemizer"
      : "tie";
  const difference = Math.abs(itemizedDeduction - nonItemizerDeduction);

  const findings = [];

  if (giving <= 0) {
    findings.push({
      severity: "info",
      title: "Enter your cash giving to compare the two paths",
      detail: "With no giving entered, both paths produce no deduction.",
    });
  }

  if (nonItemizerExcess > 0) {
    findings.push({
      severity: "medium",
      title: `${money(nonItemizerExcess)} of your giving is above the non-itemizer cap`,
      detail: `The non-itemizer deduction is capped at ${money(nonItemizerCap)} regardless of how much more you give -- the excess produces no additional benefit on this path, though it may still count toward the itemized path below.`,
    });
  }

  if (washedOutByFloor > 0) {
    findings.push({
      severity: "high",
      title: `${money(washedOutByFloor)} of your itemized giving is washed out by the new 0.5% floor`,
      detail: `OBBBA's new floor disallows the first ${money(floor)} of aggregate charitable giving (0.5% of your ${money(agiValue)} AGI) if you itemize -- that slice produces no itemized tax benefit at all, and is not carried forward.`,
    });
  }

  if (disallowedByCeiling > 0) {
    findings.push({
      severity: "medium",
      title: `${money(disallowedByCeiling)} exceeds the 60%-of-AGI ceiling on cash gifts`,
      detail: `Deductible cash gifts to public charities are capped at 60% of AGI (${money(ceiling)} here), a permanent limit under OBBBA. Some tax software lets you carry the excess forward up to five years -- this calculator does not model that carryforward.`,
    });
  }

  findings.push({
    severity: betterPath === "tie" ? "info" : "medium",
    title: betterPath === "tie"
      ? "Both paths produce the same deduction here"
      : `The ${betterPath === "itemized" ? "itemized" : "non-itemizer"} path deducts ${money(difference)} more`,
    detail: betterPath === "non-itemizer"
      ? `Non-itemizer: ${money(nonItemizerDeduction)}. Itemized (after the new 0.5% floor): ${money(itemizedDeduction)}. At this AGI and giving level, the 0.5% floor is eating more of your itemized deduction than the non-itemizer cap is costing you.`
      : betterPath === "itemized"
        ? `Itemized (after the new 0.5% floor): ${money(itemizedDeduction)}. Non-itemizer: ${money(nonItemizerDeduction)}. This compares the CHARITABLE component only -- whether itemizing is worth it overall depends on your other itemized deductions too, which this calculator does not know.`
        : `Both paths deduct ${money(nonItemizerDeduction)}.`,
  });

  findings.push({
    severity: "info",
    title: "Cash gifts to public charities only",
    detail: "Both paths as modeled here assume cash gifts to qualifying public charities. Donor-advised fund contributions do not qualify for the non-itemizer deduction at all, and appreciated property (stock, real estate) is separately limited to 30% of AGI -- neither is modeled here.",
  });

  return {
    filingStatus,
    agi: agiValue,
    giving,
    nonItemizerCap,
    nonItemizerDeduction,
    nonItemizerExcess,
    ceiling,
    floor,
    cappedByCeiling,
    washedOutByFloor,
    disallowedByCeiling,
    itemizedDeduction,
    betterPath,
    difference,
    findings,
  };
}
