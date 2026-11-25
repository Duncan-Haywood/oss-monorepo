---
title: "Quality fix: a seller note on full standby waits the whole SBA loan"
seo_title: "Seller note on full standby: SBA equity and cash flow"
date: 2026-11-25
tags: [quality-audit, small-business-acquisition-calculator, for-customers, business-acquisition, sba-loans]
description: "A full-standby seller note now stays out of year-one cash, the SBA 10% equity check uses project cost, and a DSCR floor under 1.25 is flagged."
---

Say you buy a business for $1.2 million. You put 10% down, the seller carries a
10% note at 6% over five years, and a bank lends the rest at 10.5% over ten
years. If the seller agrees to put the note on **full standby**, how much does
the business pay you in year one?

The [Small Business Acquisition Calculator](../../ventures/small-business-acquisition-calculator/)
answered $71,716 after your $90,000 salary. The right answer is $99,555. The
gap is the seller note's payment, $27,839 a year, which the tool still took out
of year-one cash after the box was ticked. The
[quality audit of 2026-11-19](../../portfolio/quality/audits/2026-11-19-small-business-acquisition-calculator.json)
flagged it, together with an equity check that tested the wrong base.

## What full standby means for an SBA loan

Under the SBA's SOP 50 10 8, and the 8.1 revision that applies to loans
numbered from 1 October 2026, a seller note counts as being on full standby
only if it gets **no principal and no interest for the whole term of the 7(a)
loan**. A note that starts paying after two years does not count. Interest can
accrue, and the note is paid off after the bank loan.

That has three effects, and the calculator now models all three:

1. **DSCR.** The note's payments are out of the debt service coverage ratio.
   The calculator already did this.
2. **Year-one cash.** The note's payments are also out of what the business
   pays you, out of the return on your cash, and out of the "if earnings fall"
   table. This was the bug.
3. **The later bill.** You still owe the note. The calculator now shows what
   paying it off costs once the bank loan is done, assuming interest builds up
   at the note rate while you wait. In the example, $120,000 left to grow at 6%
   for ten years becomes about $218,327, and paying that off over five years
   costs about $50,651 a year. That is almost twice the payment you would have
   made with no standby, and it lands in year eleven.

## The 10% is on project cost, not price

For a change of ownership the SBA asks for an equity injection of at least 10%
of **total project cost**: the price plus the closing costs and working capital
the deal needs, not the price alone. A full-standby seller note can supply up
to half of that 10%. The old check warned on "down payment under 10% of the
price". So it flagged a deal with 5% cash and a 10% standby note, which can
pass this rule, and it never applied the half-from-the-seller cap.

The calculator now works out the required equity, counts your cash and the
standby note (capped at half), and says how much is missing. For the example deal, project cost is $1,298,000,
the required equity is $129,800, and your $218,000 of cash covers it.

## Two warnings it now gives

- **A DSCR floor under 1.25.** SOP 50 10 8.1 sets 1.25 as the minimum for an
  initial acquisition or an owner buyout. If you enter a lower floor, the page
  says the deal may not qualify for SBA financing between your floor and 1.25.
- **A bank loan over $5 million**, the 7(a) program's maximum.

## What is still not modelled

- **The SBA upfront guaranty fee.** It is a percentage of the guaranteed share
  of the loan and is usually financed. If you type it into closing costs, the
  page treats it as cash you pay at closing. That overstates the cash you need
  and understates your debt service.
- **The quality-of-earnings requirement** for larger deals under 8.1.

We couldn't reach the SOP text from the session that made this fix. The rules
above follow lenders' and law firms' summaries of 50 10 8 and 8.1, and the page
tells you to confirm them with your lender. This tool does arithmetic on the
numbers you type in. It is not financial advice.

## How the fix is tested

The tests now check the standby example against hand arithmetic: $99,555 in
year one and $50,651 a year after standby. They also check the
equity rule on three structures: 5% cash with a 10% note, with and without
standby, and 3% cash with a standby note, which comes up $24,000 short. We put
each of the two old behaviours back into the code by hand: the standby payment
taken out of year-one cash, and an uncapped seller-note credit. A test failed
both times. The guaranty fee and the quality-of-earnings rule are still open,
and a later audit round will check the fixes.
