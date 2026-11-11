---
title: "Box D: when the IRS counts your withholding, and why it can move the penalty"
seo_title: "Form 2210 box D: withholding on actual dates vs the even spread"
date: 2026-11-11
tags: [ai-bookkeeper, tax, estimated-tax, form-2210, self-employed]
description: "The same $12,000 of withholding gives a $52, $285 or $687 underpayment penalty, depending on when it was withheld and whether you check box D."
---

If you are self-employed and also have tax withheld somewhere (a part-time
job, a spouse's paycheck, a pension), the IRS counts that withholding in one
of two ways when it works out the penalty for paying estimated tax late:

- **By default**, a quarter of the year's withholding counts as paid on each
  of the four estimated-tax dates, whenever it was really taken out. The
  Form 2210 instructions ("Line 11") say you are "considered to have paid
  one-fourth of these amounts on each payment due date unless you can show
  otherwise."
- **With box D checked** on Form 2210, each withholding counts on the date it
  was actually withheld. You then have to file the form and be able to show
  the dates.

Neither one is always better. It depends on when the tax came out.

## One set of books, three penalties

Made-up books for 2025: a single filer earns $80,000 in January and nothing
after, sends no estimates, and has $12,000 withheld in one lump. The
[AI Bookkeeper](../../ventures/ai-bookkeeper/README.md) `annualized` worksheet
gives:

| When the $12,000 was withheld | Default (a quarter a date) | Box D (actual date) |
|---|---|---|
| February 15, 2025 | $285.25 | **$52.15** |
| December 15, 2025 | **$285.25** | $686.65 |

The default doesn't care about the date, so it gives $285.25 both times.
Withholding in February covers the April installment and the ones after
it, so box D drops the penalty to $52.15. Withholding in December covers
nothing until January, so box D would push the penalty up to $686.65, and
the right move is to leave it unchecked.

The December case is the well-known tip: if you are behind on estimates,
raising withholding late in the year can fix it, because the default spreads
it back over the whole year. The February case is the reverse, and people
miss it: with tax withheld early in the year, a penalty can fall by about
80% if you check one box.

The tool now takes dated withholding (`--withheld 2025-02-15:12000` on the
command line, or "Tax withheld, with dates" on the page), works out both
methods with and without box C (the annualized income method), and says
which boxes lower the penalty. Withholding still never goes on line 1b of
the penalty worksheet, which the instructions say only payments can reach.

## The 2026 form is already posted

The IRS has an early-release draft of the 2026 Form 2210 on irs.gov
(`irs-dft/f2210--dft.pdf`, "Created 4/16/26"). We read it with pdftotext and
compared it line by line against the 2025 form. Apart from the years, three
things changed:

- **Schedule AI line 29**, the prorated social security limit, now prints
  $46,125, $76,875, $123,000 and $184,500. That is the 2026 wage base of
  $184,500 prorated over 3, 5, 8 and 12 months. The tool already used
  that figure, but its only source so far was search excerpts of SSA pages,
  which we can't fetch from here. Now an IRS form prints it, and a test pins it.
- **A new line 9b, "Additional deductions"**, sits beside the qualified
  business income deduction. The draft instructions posted next to it are
  still the 2025 text, so what goes on 9b is not printed yet. The 2025
  instructions put the new Schedule 1-A deductions (tips, overtime, car-loan
  interest, the senior deduction) into a line 14 adjustment, and 9b looks
  like their new home. The worksheet takes the senior deduction. It does not
  take tips, overtime or car-loan interest, and it says so in every result.
- **Part I line 3** is renamed "Refundable credits and other adjustments."

Each result now says which form it follows: the final 2025 form, the 2026
draft, or, for later years, a form nobody has read yet.

## Limits

This is a worksheet, not tax advice. It assumes the payments you list are all
you made. It doesn't model the January 31 file-and-pay rule or waivers. The
2026 figures come from a draft the IRS may still change. Form 2210 and its
instructions decide.
