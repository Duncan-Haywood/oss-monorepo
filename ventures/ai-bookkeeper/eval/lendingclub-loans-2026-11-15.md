# The loan register's payment against LendingClub's own (2026-11-15)

Flagship item (4): "one named lender's own schedule against the loan register". No lender's
full month-by-month table could be found in public. What is public is a lender's own
*payment* on hundreds of thousands of real loans: LendingClub's loan book for 2007-2014
(amount funded, annual rate, term and the monthly instalment LendingClub set). This checks
`levelPayment` against it.

## Data

- `loan_data_2007_2014.csv`, 466,285 loans, 240,079,969 bytes, sha256
  `43ecf2dcf074c87215078f33019c1282d9edb0d3569ce052d5ad6a597004c545`, a copy of
  LendingClub's public loan book in a credit-risk course repository on GitHub (Git LFS):
  `curl -L -o loan_data_2007_2014.csv https://media.githubusercontent.com/media/shawn-y-sun/Credit_Risk_Model_LoanDefaults/HEAD/loan_data_2007_2014.csv`.
  Not committed. Only the columns `funded_amnt`, `term`, `int_rate`, `installment`,
  `issue_d`, `loan_status`, `total_rec_int`, `total_rec_late_fee` and `last_pymnt_d` are
  read; no borrower field is used or printed.
- `node eval/lendingclub-loans.mjs loan_data_2007_2014.csv` (about 4 s).

## Result

| issued | loans | nearest cent = LendingClub | rounded up = LendingClub |
|---|---|---|---|
| 2007 | 603 | 293 (48.6%) | 501 (83.1%) |
| 2008 | 2,393 | 1,248 (52.2%) | 2,282 (95.4%) |
| 2009 | 5,281 | 1,506 (28.5%) | 1,568 (29.7%) |
| 2010 | 12,537 | 5,611 (44.8%) | 10,098 (80.5%) |
| 2011 | 21,721 | 11,284 (51.9%) | 21,713 (100.0%) |
| 2012 | 53,367 | 26,663 (50.0%) | 53,335 (99.9%) |
| 2013 | 134,755 | 68,241 (50.6%) | 134,714 (100.0%) |
| 2014 | 235,628 | 119,374 (50.7%) | 235,563 (100.0%) |
| **all** | **466,285** | **234,220 (50.2%)** | **459,774 (98.6%)** |

For 2011-2014, 445,325 of 445,471 (99.97%). By term: 36 months 98.1%, 60 months 99.9%.
A Python check with exact decimals counted the same 459,774, so the 1e-6 float guard in
`levelPayment(..., "up")` costs nothing here.

**LendingClub rounds the instalment up to the next cent.** Rounding to the nearest cent,
which the register did, is right only when the exact payment's fraction of a cent is
under a half: half the time. Rounding up makes the last payment slightly smaller instead
of leaving a fraction of a cent of principal to sweep up.

The misses cluster in 2009-2010 (5,152 of 6,511) and are mostly more than a cent off
(2,978 of all loans are 2 cents or more off, some by tens of dollars: 15,200 at 19.91%
over 60 months listed at 336.39 where any rounding gives 401.95). Solving for the rate that
gives LendingClub's instalment puts most of them below the listed rate, so the listed
`int_rate` is likely not the rate the payment was set on (a re-priced or modified loan, or
a later data edit). Not explained further; not used.

## What changed

- `levelPayment(cents, rateBp, months, "up")` rounds up (`Math.ceil(exact - 1e-6)`).
- `loan add ... --round up` stores `rounding: "up"` on the loan; the page's loans card
  has a "Payment rounded: to the nearest cent / up to the next cent" choice. The default is
  unchanged.
- `loan check` says "The lender rounds the payment up to the next cent ... re-add the loan
  with --round up" when the lender's first payment is the rounded-up one and every payment
  but the last differs by that same amount. Before, a 1-cent payment difference was inside
  the 2-cent tolerance, so the check flagged only the balance drift it caused later on,
  with a misleading "rows agree through payment N, then differ: look for a fee" note.
- Tests: `loan-rounding.test.mjs` (4), using three December 2013 LendingClub loans.

## Not shown, kept so a later run need not redo it

**Total interest on loans paid off on schedule is not a clean check.** 19,758 Fully Paid
loans had their last payment in the month of the last scheduled instalment and no late
fee. On the lender's own instalment, the register's schedule interest matched
`total_rec_int` within 1 cent on 2,558 (13%), within $1 on 9,066 (46%); the median
difference is -$1.14 (LendingClub received less) and the 10th percentile -$5.73. The filter
cannot tell a loan paid exactly to schedule from one paid a few days early or late each
month, and LendingClub's interest depends on those dates, so this says nothing about the
register's interest arithmetic either way. A lender's full table (dates, interest,
principal, balance per row) is still the open input for `loan check`.
