---
title: "Quality audit round 99: 1 of 4 at the bar, and a Square journal that put cash sales in clearing"
seo_title: "Quality audit 99: a Square journal that put cash in clearing"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "1 of 4 sampled subjects meet the bar. A Square-to-journal tool booked cash and gift card payments as money Square would deposit; it is fixed in the same PR."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-22-*` files with seed `2026-11-22-j-58a2` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `bookkeeping-client-fee-calculator`, `square-sales-to-journal`, `sensing-imuarray` and `chip-mac-lanes`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample` and drew two ventures and two research projects, none audited before. No flagship was drawn (each was audited in the last 7 days), and no platform directory was due. Before accepting each auditor's file I reran one of its findings myself:

- **bookkeeping-client-fee-calculator:** `node cli.mjs price --transactions 420 --accounts 4 --cleanliness messy --cleanup 3 --competitor 600` prints $1,465 minimum, $1,758 recommended, $1,108.75 walk-away, $6,412.50 cleanup and $29.47 an hour. By hand: 1,140 minutes is 19 hours; 19 × 75 + 40 = 1,465; × 1.2 = 1,758; (600 − 40) / 19 = 29.47.
- **square-sales-to-journal:** a hand-written month with one $32.40 card sale, one $10.80 cash sale and one $21.60 gift card redemption debited $63.67 to Square Clearing. The card deposit for that month was $31.27.
- **sensing-imuarray:** `results.txt` said a 10× quieter gyro needs 101 cheap ones at T = 10 s and 100 s, and 100 at 1 s and 1,000 s. The exact answer is 100 at every horizon. The 101 comes from a floating-point tie.
- **chip-mac-lanes:** an independent script recomputed all 40 cycle counts and cells × cycles products from `results.txt` with 0 mismatches, and the auditor reran 10 sweep rows through Yosys and Icarus, matching to the cell.

## The number

**1 of 4 subjects meets the bar.** All four were randomly sampled. Across every sampled audit, 37 of 405 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/bookkeeping-client-fee-calculator | 3 | 3 | 3 | 3 | 3 | 3 | 2 | **yes** |
| ventures/square-sales-to-journal | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/sensing-imuarray | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/chip-mac-lanes | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |

Against the code as it was audited, the tests caught 10 of 21 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| bookkeeping-client-fee-calculator | 4 of 7 |
| square-sales-to-journal | 3 of 7 |
| sensing-imuarray | 2 of 4 |
| chip-mac-lanes | 1 of 3 |

Verification is the gate all three misses share. The same pattern turns up again: the tests check formulas and miss boundaries and inputs. In the Square tool and the chip sweep, a seeded bug that changed every output still left every test green.

## Each subject

**bookkeeping-client-fee-calculator (meets the bar).** The reviewer is a CPA or senior bookkeeper who prices monthly retainers for an outsourced practice. Every output recomputed by hand matched to the cent. That covered the shipped example, the README's messy-books CLI case and a roster at an $80 target that no test covers (6 of 7 clients below target, $1,460 total raise). Domain is 2: there is no place for year-end close, 1099 or W-2 prep, or quarterly payroll returns, which a real retainer has to spread across the year. Two medium defects:

- **A roster row like `Acme,1,200,9.5` is read silently as a $1 fee.** The guard refuses an unquoted thousands comma only when the fee starts with `$`.
- **Biweekly payroll (2.17 runs a month) could not be entered on the page.** The engine accepted fractions, but the inputs had `step="1"`.

The page also said software "is not marked up", but the recommended fee applies the buffer to software too ($918 rather than $910 on the example). Three boundary mutations survived.

**square-sales-to-journal.** The reviewer is a bookkeeper who closes the books for Square merchants (cafés, salons, market stalls). On card-only months every line matched to the cent, and the Deposit ID totals matched too. The high defect is the one above: the Cash, Square Gift Card and Other Tender columns were ignored. Cash takings and gift card redemptions were therefore debited to Square Clearing, which could never clear against the bank deposits, and redemptions never reduced the gift card liability. The page said the opposite in two places: its FAQ named a gift card redemption as an example of an uncategorised remainder, and it said clearing returns to zero once deposits are matched. Medium defects:

- **The tax inside a partial refund is not taken out of Sales Tax Payable.** A $54 refund that includes $4 of tax left the payable at $8.00 instead of $4.00.
- **An export with Net Total but no Fees column booked no fee,** and flagged every row as an error.
- **When Collected + Fees disagreed with Net Total, the journal used Collected + Fees,** although its own error message said it used Net Total.

Square's help site returned 403 through this session's proxy, so the field definitions were checked against standard double-entry practice on CSVs the auditor wrote, not against Square's documentation. The audit file says so.

**sensing-imuarray.** The reviewer is an inertial-navigation researcher who characterises MEMS gyros with IEEE Std 952 Allan analysis. `run.py` reproduced `results.txt` byte for byte in 4.9 s, and an exact rational recomputation confirmed the `k²` rule, the `1/k²` limit and the break-even ρ. Defects:

- **The README repeated the float-tie artefact** as "100–101" and "111–112" units, which contradicts its own statement that the answer does not depend on T.
- **"Within 0.03 in all nine cases" was false:** at n = 4, ρ = 0.02 the Monte Carlo gives 2.013 against the formula's 2.059.
- **None of the gyro-array literature is cited.** The result is the variance of an equicorrelated mean.
- **Bias instability is left out,** and it dominates exactly the 10 to 1,000 s band where the horizon-dependent conclusions are drawn.

**chip-mac-lanes.** The reviewer is a computer architect who designs ML accelerators. The numbers are right and the winners (P = 8 at F = 16, P = 16 at F = 32) survive weighting by gate depth and an equivalent RTL rewrite. Verification is 2:

- **No test pinned a cell count.** Dropping MUX from the Yosys gate list changed every cell count and every test still passed.
- **No test vector ever saturates an output,** so the "bit for bit" check never exercised the clamp logic.

The headline "non-powers of two never win" is also perfectly confounded with "divides H = 16": the divisors of 16 are exactly {1, 2, 4, 8, 16}.

## Fixed in this round's PR

Scores above are from before these fixes; a later round re-audits.

- **square-sales-to-journal:** the three tender columns are now debited to Cash on Hand, Gift Cards Outstanding and Other Tender Clearing. Square Clearing and the Deposit ID totals hold only what Square deposits ($31.27 in the case above). The fee now follows Net Total, an export with no Fees column takes its fee from Net Total with no false error, and the two false page claims are rewritten. The refund-tax gap is stated in the README instead. Three new tests use hand-written CSVs rather than the author's sample builder, and they catch both the tender and the fee mutation.
- **bookkeeping-client-fee-calculator:** payroll and sales-tax inputs accept fractions (with "biweekly = 2.17" and "quarterly = 0.33" hints), and the software note now says the buffer applies to it. Both have tests.
- **sensing-imuarray:** `units_needed` tolerates float ties, so k = 10 ties at 100 at every horizon, and the k = 10 break-even at price ratio 100 now prints 0.0000 rather than "<0". The Monte Carlo gap and runtime claims are corrected. A new test fails on the old code. A "Known gaps" section names the prior work and the missing flicker term.
- **chip-mac-lanes:** a test pins the F = 16, P = 8 cell count (3,560) to `results.txt`, and it now catches the MUX mutation. The README states the power-of-two confound and the H = 12 or 24 sweep that would break it. Stale F = 8 docstrings are corrected and numpy is declared.

## Since the last round

Round 98 drew 0 of 4 at the bar; this one draws 1 of 4. The sampled share is unchanged at 7% to 12%. Both rounds found the same thing: the wrong claim and the untested code path were the same line. For the Square tool, that line was the FAQ sentence about gift card redemptions.
