// Core arithmetic for the gambling loss deduction limitation under the One
// Big Beautiful Bill Act (OBBBA, signed July 4, 2025). No network calls: this
// applies a published statutory formula to the numbers the user supplies. It
// is not a full tax return -- see README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch against Porte Brown's "Gambling Loss
// Deductions Narrow Under the OBBBA Starting in 2026", Barnes Dennig's
// "Major Changes to Gambling Loss Deductions Under the OBBBA", Beancount's
// "26 USC 165(d): OBBBA 90% Gambling Loss Cap Creates Phantom Income",
// National Tax Tools' "Gambling Loss Deduction Guide 2026 (and 2025)", the
// NATP's "Will the OBBBA gambling deduction change be reversed?", and
// Monaco CPA's "90% Gambling Loss Cap 2026: Phantom Income Explained",
// cross-checked against each other and against the "lesser of 90% of
// winnings or actual losses" phrasing repeated verbatim across independent
// sources:
//
//   - OBBBA amended IRC Section 165(d) so that, for tax years beginning
//     after December 31, 2025 (2026 returns onward), the deduction for
//     wagering losses is capped at 90% of wagering GAINS (winnings) -- on
//     top of, not instead of, the pre-existing rule that losses are only
//     deductible up to the amount of winnings at all. The allowable
//     deduction is the LESSER of (a) actual, substantiated gambling
//     losses, and (b) 90% of gambling winnings.
//   - This is PERMANENT law with no scheduled sunset (unlike several other
//     OBBBA individual provisions in this portfolio, e.g. the SALT cap
//     increase or the tips/overtime deductions, which expire after 2028 or
//     2029). Several repeal bills (including one nicknamed the "FAIR BET
//     Act") have been introduced in Congress but none had passed as of
//     this session -- flagged as a watch item, not modeled as law.
//   - The consequence nicknamed "phantom income": once losses are at least
//     90% of winnings (i.e. the gambler broke even or lost overall), the
//     deduction is capped at exactly 90% of winnings, leaving 10% of
//     winnings taxable no matter how much was actually lost. The
//     disallowed 10% is simply gone -- it does NOT carry forward to a
//     future year and cannot offset anything else.
//   - Only a taxpayer who itemizes (Schedule A, Line 16) can claim any
//     gambling-loss deduction at all -- this pre-existing rule is
//     unchanged by OBBBA. A non-itemizer's full winnings are taxable with
//     zero loss offset, exactly as before.
//   - The TCJA rule folding a PROFESSIONAL gambler's trade-or-business
//     wagering expenses into the same Section 165(d) loss limitation was
//     scheduled to expire after 2025; OBBBA made that fold permanent, so
//     the 90% cap reaches a professional's wagering-related business
//     expenses too, not only a casual gambler's losses.
//   - This module does not verify a filer's winnings, losses, expenses, or
//     itemizing decision -- the user supplies each figure, and the page
//     points at a qualified tax professional as the source to verify
//     against before filing.

export const LOSS_CAP_RATE = 0.90;

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
 * Computes the allowable gambling-loss deduction under OBBBA's Section
 * 165(d) 90%-of-winnings cap, and the resulting taxable "phantom income"
 * for a break-even or net-losing gambler.
 */
export function gamblingLossOutcome({
  winnings = 0,
  losses = 0,
  isProfessional = false,
  itemizes = true,
  taxYear = 2026,
} = {}) {
  const winningsValue = Math.max(0, num(winnings));
  const lossesValue = Math.max(0, num(losses));
  const capApplies = taxYear >= 2026;

  const ninetyPercentCap = winningsValue * LOSS_CAP_RATE;
  const preObbbaDeduction = Math.min(lossesValue, winningsValue);
  const deduction = !itemizes
    ? 0
    : capApplies
      ? Math.min(lossesValue, ninetyPercentCap)
      : preObbbaDeduction;

  const taxableGamblingIncome = Math.max(0, winningsValue - deduction);
  const disallowedByCap = capApplies && itemizes
    ? Math.max(0, preObbbaDeduction - deduction)
    : 0;
  const phantomIncome = capApplies && itemizes ? disallowedByCap : 0;
  const atCap = capApplies && itemizes && winningsValue > 0 && deduction >= ninetyPercentCap - 0.005 && lossesValue >= ninetyPercentCap;

  const findings = [];

  if (winningsValue <= 0) {
    findings.push({
      severity: "info",
      title: "Enter your winnings to see the deduction and taxable amount",
      detail: "With no winnings entered, there is no gambling income to offset and no cap to apply.",
    });
  }

  if (!itemizes) {
    findings.push({
      severity: "high",
      title: "Not itemizing means no gambling-loss deduction at all",
      detail: `Gambling losses are only deductible on Schedule A, Line 16, if you itemize. Taking the standard deduction means your full ${money(winningsValue)} of winnings is taxable, with none of your ${money(lossesValue)} of losses offsetting it -- this rule predates OBBBA and is unaffected by it.`,
    });
  } else if (capApplies && atCap) {
    findings.push({
      severity: "high",
      title: `${money(phantomIncome)} of "phantom income" -- taxed even though you broke even or lost money`,
      detail: `Your losses (${money(lossesValue)}) are at least 90% of your winnings (${money(winningsValue)}), so the deduction is capped at exactly ${money(ninetyPercentCap)} -- 90% of winnings -- regardless of how much more you actually lost. The remaining ${money(phantomIncome)} of winnings is taxable with no offsetting loss, and it does not carry forward to next year.`,
    });
  } else if (capApplies && disallowedByCap > 0) {
    findings.push({
      severity: "medium",
      title: "The 90% cap reduced your deduction slightly",
      detail: `Before OBBBA's cap, your deduction would have been ${money(preObbbaDeduction)} (limited only to winnings). The new 90%-of-winnings cap reduces it to ${money(deduction)}, ${money(disallowedByCap)} less.`,
    });
  } else if (capApplies && itemizes && winningsValue > 0) {
    findings.push({
      severity: "info",
      title: "The 90% cap does not bite for these numbers",
      detail: `Your losses (${money(lossesValue)}) are comfortably below 90% of your winnings (${money(ninetyPercentCap)}), so your deduction is your full ${money(deduction)} of losses -- the new cap has no effect here.`,
    });
  }

  if (!capApplies) {
    findings.push({
      severity: "info",
      title: `Tax year ${taxYear} predates the 90% cap`,
      detail: "OBBBA's Section 165(d) 90%-of-winnings cap applies to tax years beginning after December 31, 2025 (2026 returns onward). For this year, the pre-existing rule applies: losses are deductible in full, up to the amount of winnings.",
    });
  }

  if (isProfessional) {
    findings.push({
      severity: "info",
      title: "Professional gamblers: the cap reaches your business expenses too",
      detail: "OBBBA permanently folded a professional gambler's trade-or-business wagering expenses into this same Section 165(d) limitation (a TCJA rule that was set to expire after 2025). Group your wagering losses and directly related business expenses together before comparing against the 90% cap -- this calculator treats the \"losses\" figure you enter as that combined total.",
    });
  }

  findings.push({
    severity: "info",
    title: "The disallowed 10% never carries forward",
    detail: "Unlike a capital loss carryover, the portion of losses disallowed by this cap is simply gone for good -- it cannot reduce a future year's taxable gambling income or anything else.",
  });

  return {
    taxYear,
    capApplies,
    itemizes,
    isProfessional,
    winnings: winningsValue,
    losses: lossesValue,
    ninetyPercentCap,
    preObbbaDeduction,
    deduction,
    taxableGamblingIncome,
    disallowedByCap,
    phantomIncome,
    atCap,
    findings,
  };
}
