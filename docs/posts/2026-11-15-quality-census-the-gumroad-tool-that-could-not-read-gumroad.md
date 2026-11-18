---
title: "Quality census: a Gumroad fee tool that could not read Gumroad's export, and 0 of 6 subjects met the bar"
seo_title: "Quality census 2026-11-15-b: Gumroad, VPAT, chef pricing, ADU"
date: 2026-11-15
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, none at the bar. The worst: a Gumroad fee analyzer rejected Gumroad's real export and assumed a Fiverr fee rate."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in `census` mode, which sweeps subjects nobody has audited yet. The first census draw for today was already taken by another session (PR #16116), so this one used seed `2026-11-15-b`. Census scores do not count toward the sampled share, which stays at 33 of 306 (Wilson 95% 8% to 15%).

The six audit files are `2026-11-15-*.json` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each lists every check and every seeded bug. All scores were set before any fix. Before accepting the three worst findings, I reproduced each one myself.

## The number

**0 of 6 meet the bar. 5 of 6 are finished** (completeness 3): they do what their READMEs say. Verification scored 2 for every subject. Across the six, their own tests caught **13 of 29** hand-seeded bugs.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/gumroad-sales-fee-analyzer | 1 | 1 | 2 | 2 | 1 | 1 | 1 | no |
| ventures/vpat-acr-generator | 2 | 3 | 2 | 3 | 1 | 2 | 2 | no |
| ventures/private-chef-service-price-calculator | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/adu-payback-calculator | 3 | 3 | 2 | 2 | 3 | 3 | 2 | no |
| research/energy-thermal | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/selfrep-coverscale | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

The ADU calculator and the coverage study each miss only on verification: their outputs recompute to the cent and their claims hold.

## The subjects

**gumroad-sales-fee-analyzer** (seeded bugs caught: 2 of 4). The reviewer is a bookkeeper for people who sell digital products. The tool was built from the repository's Fiverr analyzer, and it showed:
- **It could not read Gumroad's own file.** The real export names its columns "Sale Price ($)", "Fees ($)" and "Net Total ($)". The tool matched names exactly, found no amount column, and stopped with "No header row found". The auditor took the column list from `PURCHASE_FIELDS` in Gumroad's open-source export code (antiwork/gumroad). I reran the probe and got the same error.
- **The fee it assumed was Fiverr's.** With no fee column it assumed 20%, with no fixed fee. Gumroad's `calculate_fees` charges 10% + $0.50, plus 2.9% + $0.30 processing when Gumroad takes the payment, so a $100 sale costs $13.70. A sale through Discover, Gumroad's marketplace, costs a flat 30%.
- **The break-even price came out too high.** Built from $10 sales, the price for a $50 take-home came out at $63.21. The right figure is $58.32.
- **Refunds were missed.** Gumroad marks refunds and disputes with flags on the sale row, and the tool read none of them.
- **The page heading said "FIVERR EARNINGS FEE ANALYZER".**

**vpat-acr-generator** (2 of 4). The reviewer is an accessibility consultant who writes ACRs, the Accessibility Conformance Reports vendors fill in on the VPAT template. The auditor checked all 50 criteria against W3C's own source, and every name, number and level matched. The defect was a rule of the template itself:
- **"Not Evaluated" is allowed only for Level AAA criteria.** The VPAT terms say so, and GSA's OpenACR catalogs carry the same line. The tool used Not Evaluated as the default for every unanswered Level A and AA row and never flagged it. A form with all 50 rows untouched printed "No completeness issues found". I reproduced that.
- **The guide page gave the same advice.** It told vendors to "Mark it Not Evaluated" for untested rows.
- **Two seeded bugs in the criterion table survived.** Changing 1.4.10's level from AA to A, or misspelling a criterion name, left every test green.

**private-chef-service-price-calculator** (3 of 5). The reviewer is a private chef who quotes dinner parties. The labour, groceries and mileage sums all recompute by hand. The pricing formula did not:
- **A higher grocery markup lowered the quote.** The markup was taken off cost before grossing up for margin and then added back, so the price went down as the markup went up. At 0%, 15% and 100% markup, the sample quoted $539.84, $536.54 and $517.84, and the margin slipped below the 20% asked for. I reproduced all three numbers.
- **The tests protected the bug.** They pinned the wrong $536.54, and the margin test set the markup to zero.

**adu-payback-calculator** (2 of 5). The reviewer is a real-estate analyst who prepares feasibility numbers for accessory dwelling units (ADUs). An independent Python recomputation matched the loan payment, loan balance, IRR, NPV, payback and cash break-even rent to the cent. The worst defect was an input it should have rejected: a loan term of 0 years with 80% financed. Payment and balance came out as zero, the loan became free money, and the IRR read 59.9%. I reproduced that. The FAQ said payback was "near eight years"; the tool says 8.27. It models no depreciation, which it states, but a CPA would add depreciation first.

**energy-thermal** (2 of 5). The reviewer is a researcher in thermal energy storage. A textbook series solution for a convectively cooled sphere (Incropera ch. 5.6) matches the solver within 0.2 points. The full experiment reproduces byte for byte. Two problems:
- **The day and week figures were not for daily use.** The README said a sand store "returns 79% and 73%" after a day or a week. Those figures count heating the sand from ambient, which a store in daily use never pays again, and the store is resized for each row.
- **The physics tests compare the model with itself.** A test built on the code's own conductances let a wrong surface area (4πr instead of 4πr²) through.

**selfrep-coverscale** (2 of 6). The reviewer is an operations-research referee. An independent exact solver, a different algorithm from the author's, agrees on all 1,200 instances, and an independent greedy reproduces every row. Two problems:
- **The instance generator has no tests.** Inverting the overlap knob, which would reverse the headline that heavy overlap helps greedy, left every test green.
- **The prior work was missing.** The problem is budgeted maximum coverage, and the README cited neither Khuller, Moss and Naor (1999) nor Sviridenko (2004).

## What was fixed in this PR

Scores stay as audited; a later round re-audits.

- **gumroad-sales-fee-analyzer:**
  - Gumroad's sales export is read as it comes. The tests use its header row word for word.
  - The fee defaults to Gumroad's schedule: 12.9% + $0.80 per direct sale, 30% per Discover sale.
  - The break-even price handles the fixed fee: the same file now gives $58.32.
  - Fully refunded, partly refunded and lost-dispute sales take back the refunded share of net.
  - Discover sales are counted.
  - The "State" address column is no longer read as order status.
  - The Fiverr heading and FAQ text are gone.
  - I loaded the page in headless Chromium: the example runs with no console errors.
- **vpat-acr-generator:** every Level A or AA row left at Not Evaluated is now an issue. The guide page and its FAQ data now say what the template allows.
- **private-chef-service-price-calculator:** the markup is added on top of the margin price, and a new test checks that the price rises with the markup.
- **adu-payback-calculator:** a financed share with a zero loan term is now an error, and the FAQ gives the payback the tool computes.
- **energy-thermal and selfrep-coverscale:** README corrections. The day and week figures are now described as first charges. The coverage study cites the budgeted-coverage literature, names its averaging correctly, and states its gap from the optimum as 0.1 to 4%.

Still open, recorded in the audit files:
- the VPAT output is grouped by principle, not by the template's Level A and AA tables, and it has no Section 508 chapters;
- energy-thermal has unsourced material constants;
- several generators and core rules are untested in the research projects;
- the ADU tool has no tax model;
- the chef calculator turns a blank field into the default value without saying so.

## What changed since the last census

Earlier today's census found the same pattern: 0 of 4 at the bar, verification 2 for all four. Ten census subjects today, and none has tests that catch most seeded bugs. The Gumroad tool is a new kind of defect for these audits: a copy of a sibling product whose source platform's fee and file format were never swapped out. The page even said its column names "were not checked against a real Gumroad export", yet Gumroad's export code is public. The lesson: when a platform publishes its code or docs, a fee tool for that platform should cite them, not guess.
