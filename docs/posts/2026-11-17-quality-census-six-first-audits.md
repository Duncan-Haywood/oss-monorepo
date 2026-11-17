---
title: "Quality census: a landlord credit that zeroed the tax bill, and 0 of 6 subjects at the bar"
seo_title: "Quality census 2026-11-17: six first audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, none at the bar and all finished. Worst: a UK tax tool gave a landlord a 2,000 credit and 0 tax where the rule gives 86."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-4dba`). Census mode sweeps subjects nobody has audited yet, so its scores stay out of the sampled share. That share is still **33 of 306** (Wilson 95% 8% to 15%).

The six audit files are the `2026-11-17-*.json` files for these subjects in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file holds every check and every seeded bug. All scores were set before any fix. For each subject I reran its headline recomputation myself before accepting the audit.

## The number

**0 of 6 meet the bar, and all six are finished** (completeness 3). Each does what its page says it does. None passes a senior practitioner on all three gates: correctness, claims and verification. Across the six, their own tests caught **13 of 35** hand-seeded bugs. Verification failed the gate (scored 1 or 2) in five of six.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/uk-self-assessment-tax-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/ice-dam-removal-bid-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/docker-base-image-pin-check | 2 | 3 | 3 | 3 | 3 | 2 | 2 | no |
| ventures/rental-dscr-calculator | 3 | 3 | 1 | 2 | 3 | 3 | 2 | no |
| ventures/custom-farm-rate-calculator | 3 | 3 | 1 | 3 | 3 | 2 | 2 | no |
| research/simdesign-pocketmesh | 3 | 3 | 1 | 2 | 3 | 2 | 2 | no |

Coverage: 365 of 2,485 subjects have now had at least one audit (14.7%).

## The subjects

**ventures/uk-self-assessment-tax-calculator (correctness 2, one high defect, fixed).** The rates, bands, the £100k allowance taper, Class 4 and payments on account all match GOV.UK pages fetched on the day. The worked example's £8,932.95 due on 31 January is right. One bug was serious. A landlord's 20% credit for mortgage interest is capped by "adjusted total income", which leaves out savings and dividends. The tool counted them anyway. Take £13,000 property profit, £10,000 interest and £20,000 dividends. The tool gave a £2,000 credit and £0 income tax. The rule gives a credit of £86 (20% of the £430 above the personal allowance) and tax of £1,706.25. That is fixed in this PR, with a test that fails on the old code. Still open: the £1,000 property allowance is taken even when it costs a larger credit. Student loan repayments count all unearned income instead of only the part above £2,000. Plan 5 is charged a year before its repayments start.

**ventures/ice-dam-removal-bid-calculator (correctness 2, one high defect, open).** The cost arithmetic recomputes to the cent (default job $332.02, break-even $4.15 a foot). Ticking "Storm / night / weekend dispatch" raises the job's cost to $425.32. The price to quote stays at $560. So does the printed proposal, which now adds a "priority call" line. A test pins this as intended: the premium is modelled as a cost to the contractor, not a charge to the customer. An owner-operator would expect the opposite. The privacy text said "nothing you type is saved anywhere", but the proposal's business details go to browser storage. That wording is fixed here, with a test. The default mileage rate is the 2024 IRS 67¢; the rate from July 2026 is 76¢.

**ventures/docker-base-image-pin-check (correctness 2, one high defect, open).** The auditor wrote its own copy of Docker's image-reference grammar, and it agreed with the tool on all 12 valid references tried. The tests caught 5 of 6 seeded bugs, the best in this batch. But a pattern from Docker's own reference, `ARG NODE_VERSION=18` then `FROM node:${NODE_VERSION}-alpine`, is dropped without a word. The CLI prints "no FROM lines found to classify", and `--fail-on-risk` exits 0. A CI gate built on it lets an unpinned base image through. `COPY --from=nginx:latest` is not checked either. Fixing this means resolving `ARG` defaults in both the Python and JavaScript copies. It is recorded in the README's new "Known gaps".

**ventures/rental-dscr-calculator (verification 1).** Every figure recomputes: payment $1,790.71 on $262,500 at 7.25% over 30 years, NOI $22,431.60, rent-over-PITIA ratio 1.266. I reran these myself. Four of five seeded bugs left all 37 tests green, among them dropping maintenance from break-even and vacancy from the hold table. "The largest loan your lender's minimum allows" has no cap at the price: rent of $6,000 a month on a $350,000 house reports $659,654.

**ventures/custom-farm-rate-calculator (verification 1).** Field capacity matches Iowa State's A3-24 worked example (45 ft × 4.5 mph × 80% ÷ 8.25 = 19.6 acres an hour). The default job prices at $19.19 an acre, and the hand recomputation agrees. Five of six seeded bugs survived; one removed labor from total cost. A blank cost field counted as zero. With ownership cost left blank, the page showed $8.45 an acre with no error. That is fixed here: a blank field is now an error, with a test that fails on the old code.

**research/simdesign-pocketmesh (verification 1).** The full 372-point mesh scan reran in 8 seconds with identical output. Its headline holds: the feasible "pockets" on the coarse mesh vanish on the finer one. Elementary beam theory puts the stress floor at a web width of 15.0 mm, so the coarse-mesh pockets at 14.4 to 14.9 mm carry 103 to 109 MPa against a 100 MPa limit. They are mesh artefacts, as the project suspected. The README does not say that a slenderness rule caps the window at 16.0 mm, so the "rising boundary" is a window closing against a ceiling. No test pins a finite-element stress against a reference value. Three of four seeded bugs survived, including a 20% change to the load.

## What the six have in common

The arithmetic is mostly right. Three of six recompute with no wrong output found. The failures are a level up: rules the author's model skipped (the landlord credit cap, how ice-dam crews bill, Docker's `ARG`) and tests that check the author's own numbers rather than an outside source. Five of six fail the verification gate. Of the 22 seeded bugs that survived, most were core changes a reviewer would call obvious: removing labor, dropping vacancy, changing the load. The fix is the same one earlier rounds proposed: each core output should be pinned by at least one test against a figure from a source the author did not write.

## Fixed in this round

Three fixes in [PR #16786](https://github.com/Duncan-Haywood/oss-monorepo/pull/16786), each with a test that fails on the old code. The scores above stay as audited, and a later re-audit will check them.

- uk-self-assessment-tax-calculator: the finance-cost credit cap excludes savings and dividends.
- custom-farm-rate-calculator: a blank field is an error, not a silent zero.
- ice-dam-removal-bid-calculator: the privacy text discloses the saved proposal details.

The larger defects are listed under "Known gaps" in each subject's README, linked to its audit file.
