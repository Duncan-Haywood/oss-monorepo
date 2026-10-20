// Core arithmetic for the federal estate, gift, and generation-skipping
// transfer (GST) tax basic exclusion amount as permanently set by the One
// Big Beautiful Bill Act (OBBBA) for 2026. No network calls: this applies
// published federal figures to the numbers the user supplies. It is not a
// substitute for filing Form 706 or Form 709 -- see README "What this does
// not cover".
//
// Verified 2026-09-25 via WebSearch against the IRS's own newsroom release
// "IRS releases tax inflation adjustments for tax year 2026, including
// amendments from the One, Big, Beautiful Bill" (irs.gov), Morgan Lewis's
// "IRS Announces Increased Gift and Estate Tax Exemption Amounts for 2026",
// Spencer Fane's "Updated Inflation Adjustments for Gift Tax Annual
// Exclusion, Unified Credit Amount, and GST Tax Exemption for 2026",
// Bowditch & Dewey's "Big Increase in 2026 Federal Estate Exemption", and
// Haynes Boone's "Federal Estate, Gift and GST Tax Highlights from the One
// Big Beautiful Bill Act", cross-checked against each other:
//
//   - OBBBA permanently set the unified federal estate/gift basic exclusion
//     amount (IRC Section 2010(c)) at $15,000,000 per person effective
//     January 1, 2026 -- with NO sunset, replacing the scheduled reversion
//     to roughly $7,000,000 that would otherwise have taken effect. Indexed
//     for inflation starting in 2027 (2025 base year); this module uses the
//     as-enacted 2026 figure and does not project future inflation
//     adjustments.
//   - A surviving spouse can elect PORTABILITY of a deceased spouse's
//     unused exclusion (DSUE) by timely filing Form 706 for the deceased
//     spouse's estate, even if no tax was owed. OBBBA did not change this
//     mechanic. A married person's total available exclusion is therefore
//     their own $15,000,000 PLUS any DSUE actually elected and received --
//     never automatically doubled just for being married.
//   - The GST exemption (IRC Section 2631) was raised to the identical
//     $15,000,000 figure, but -- unlike the estate/gift exclusion -- the
//     GST exemption has NEVER been portable between spouses. This module
//     flags that distinction explicitly rather than assuming one portable
//     pool covers all three transfer taxes.
//   - Lifetime taxable gifts (gifts in excess of the annual exclusion,
//     reported on Form 709) REDUCE the exclusion available at death --
//     estate and gift tax share one unified lifetime/death exclusion
//     bucket, not two separate ones.
//   - The federal estate tax rate above the exclusion is a FLAT 40%
//     (not a bracketed schedule with a lower marginal rate at the margin).
//   - The 2026 annual gift-tax exclusion (IRC Section 2503(b)) is $19,000
//     per recipient, unchanged from 2025.
//
// This module does NOT model state estate or inheritance taxes, which
// follow separate, much lower state-level thresholds (Massachusetts,
// Oregon, Washington, and others) and depend on the decedent's state of
// domicile -- explicitly out of scope, flagged rather than computed. It
// also does not model the marital deduction (an unlimited deduction for
// property passing outright to a surviving spouse, which can defer estate
// tax entirely until the second death), charitable deduction, or valuation
// discounts -- see README.

export const BASIC_EXCLUSION_2026 = 15_000_000; // per person, OBBBA, permanent
export const ANNUAL_GIFT_EXCLUSION_2026 = 19_000; // per recipient, unchanged from 2025
export const ESTATE_TAX_RATE = 0.40; // flat federal rate above the exclusion

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
 * Projects federal estate tax exposure under the 2026 OBBBA basic exclusion
 * amount, given a gross estate, prior taxable lifetime gifts, and any DSUE
 * already elected from a deceased spouse.
 */
export function estateTaxOutcome({
  grossEstate = 0,
  priorTaxableGifts = 0,
  dsue = 0,
  filingStatus = "single",
} = {}) {
  const estate = Math.max(0, num(grossEstate));
  const priorGifts = Math.max(0, num(priorTaxableGifts));
  const dsueAmount = filingStatus === "married" ? Math.max(0, num(dsue)) : 0;

  const ownExclusion = BASIC_EXCLUSION_2026;
  const totalExclusion = ownExclusion + dsueAmount;
  const exclusionUsedByGifts = Math.min(priorGifts, totalExclusion);
  const remainingExclusion = Math.max(0, totalExclusion - priorGifts);
  const giftsExceedingExclusion = Math.max(0, priorGifts - totalExclusion);

  const taxableEstate = Math.max(0, estate - remainingExclusion);
  const estateTax = taxableEstate * ESTATE_TAX_RATE;
  const shielded = Math.min(estate, remainingExclusion);

  const findings = [];

  if (estate <= 0) {
    findings.push({
      severity: "info",
      title: "Enter your gross estate to project exposure",
      detail: "With no gross estate entered, there is nothing to compare against the exclusion.",
    });
  }

  if (filingStatus === "married" && dsueAmount === 0) {
    findings.push({
      severity: "info",
      title: "No deceased spousal unused exclusion (DSUE) entered",
      detail: "A married person's own exclusion is $15,000,000. A surviving spouse can add a deceased spouse's unused exclusion on top of that by timely filing Form 706 for the deceased spouse's estate and electing portability -- even if no tax was owed then. If that election was made, enter the DSUE amount above.",
    });
  }

  if (giftsExceedingExclusion > 0) {
    findings.push({
      severity: "high",
      title: `${money(giftsExceedingExclusion)} of prior taxable gifts already exceeds your total exclusion`,
      detail: `Estate and gift tax share one unified exclusion. Your ${money(priorGifts)} in prior taxable lifetime gifts already uses up your entire ${money(totalExclusion)} exclusion, so none of it remains to shield your estate at death -- the excess was subject to gift tax when it was given.`,
    });
  } else if (exclusionUsedByGifts > 0) {
    findings.push({
      severity: "medium",
      title: `${money(exclusionUsedByGifts)} of your exclusion is already used by prior taxable gifts`,
      detail: `Lifetime taxable gifts reduce the exclusion available at death dollar for dollar. Of your ${money(totalExclusion)} total exclusion, ${money(remainingExclusion)} remains to shield your estate.`,
    });
  }

  if (taxableEstate > 0) {
    findings.push({
      severity: "high",
      title: `Estimated federal estate tax: ${money(estateTax)}`,
      detail: `${money(taxableEstate)} of your estate exceeds your remaining ${money(remainingExclusion)} exclusion, taxed at the flat 40% federal rate. This does not include any state estate or inheritance tax, which follows separate, much lower thresholds in some states.`,
    });
  } else {
    findings.push({
      severity: "info",
      title: "No federal estate tax projected",
      detail: `Your ${money(estate)} gross estate is fully shielded by your ${money(remainingExclusion)} remaining exclusion. This does not include any state estate or inheritance tax, which follows separate, often much lower thresholds.`,
    });
  }

  findings.push({
    severity: "info",
    title: "The GST exemption is not portable between spouses",
    detail: "The generation-skipping transfer (GST) exemption was also raised to $15,000,000, but -- unlike the estate/gift exclusion -- it has never been portable between spouses. A deceased spouse's unused GST exemption cannot be added to a survivor's own GST exemption the way DSUE works for estate and gift tax.",
  });

  findings.push({
    severity: "info",
    title: "State estate and inheritance tax not included",
    detail: "This calculator projects federal tax only. Several states impose their own estate or inheritance tax with thresholds far below $15,000,000 (for example, Massachusetts and Oregon start near $1,000,000-$2,000,000), depending on the decedent's state of domicile -- not modeled here.",
  });

  return {
    filingStatus,
    grossEstate: estate,
    priorTaxableGifts: priorGifts,
    dsue: dsueAmount,
    ownExclusion,
    totalExclusion,
    exclusionUsedByGifts,
    remainingExclusion,
    giftsExceedingExclusion,
    taxableEstate,
    estateTax,
    shielded,
    findings,
  };
}
