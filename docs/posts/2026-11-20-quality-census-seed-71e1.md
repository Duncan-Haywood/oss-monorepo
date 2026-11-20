---
title: "Quality census: a churn tool that billed free trials as revenue, and 1 of 6 at the bar"
seo_title: "Quality census 2026-11-20 (71e1): six first audits, one at the bar"
date: 2026-11-20
tags: [quality-audit, evaluation, testing]
description: "Six first audits: one at the bar, all finished; tests caught 17 of 34 seeded bugs. Worst: a Stripe churn tool counting trials as paying MRR."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Today's quality-mode draw put this session in `census` mode, seed `2026-11-20-71e1`. It is the third census today, after [seed c70f](2026-11-20-quality-census-seed-c70f.md) and [seed be43](2026-11-20-quality-census-seed-be43.md). Census mode audits subjects that have never been audited before. Its scores stay out of the sampled share, which is still **36 of 367** (Wilson 95% interval 7% to 13%).

Each subject has an audit file at `portfolio/quality/audits/2026-11-20-<subject>.json`. Each file lists every check and every seeded bug. All scores were set before any fix. Before accepting the audits I reran four of their claimed numbers myself, with my own one-line formulas:

- **Cap-rate calculator:** the debt service on a $1.4M, 6.75%, 25-year loan is $116,073.14 a year, so coverage is 1.2556x.
- **Stripe churn analyzer:** churn on the shipped example is 41/435 = 9.43%. The price-rise break-even is 0.15/1.15 = 13.04%.
- **Delivery-app calculator:** DoorDash has to list the $32 dine-in plate at $47.1534 to keep the same margin.
- **Janitorial bid calculator:** the three-day price with $800 travel is $2,183.44. The page printed $2,184.

I also reran the capture-aliaswin auditor's asymmetric-window result (`soft` at 1 s, B window +0.8 s: 0.000 wrong) and both research test suites (7 and 5 passing).

## The number

**1 of 6 meets the bar, and all 6 are finished** (completeness 3). The subjects' own tests caught **17 of 34** hand-seeded bugs. Of 78 checks, **33 failed or partly failed**. The audits recorded 46 defects, one of them high severity. 25 were fixed in this PR, each code fix with a test that would have caught it.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/janitorial-bid-calculator | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **yes** |
| ventures/delivery-app-margin-calculator | 3 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| ventures/commercial-property-cap-rate-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/eda-noisy | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/capture-aliaswin | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/stripe-churn-cohort-analyzer | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Verification is again the gate that binds: five of the six scored 2 there. In four of the six, half or more of the seeded bugs survived the subject's own tests.

## Each subject and its worst defect

**Stripe churn cohort analyzer: not at the bar. One high-severity defect.** Rows with `Status=trialing` were counted as paying MRR. A trial that lapsed without paying was then counted twice, once as new MRR and once as churned MRR. Any SaaS with a trial funnel saw both its MRR and its churn inflated. The comparison page also said a subscription export carries no trial data, but it carries `Trial Start`/`Trial End`.

The audit found three more errors:

- A subscription set to cancel at period end was counted as churned while it was still paying.
- Logo churn counted subscriptions, not customers.
- On a small file, logo churn could exceed 100%.

Fixed in this PR:

- Rows still in trial are skipped, and MRR starts at the trial's end.
- Pending cancellations stay live.
- A quantity of 0 is now kept as 0 (it was silently read as 1).
- The FAQ says what is actually counted.

Per-customer churn is not built yet. It is listed under "Known gaps".

**Delivery-app margin calculator: not at the bar.** The default commission rates match no published plan:

- DoorDash is set to 27%, but its US plans are 15/25/30%.
- Grubhub has no processing fee, but Grubhub bills one.

The comparison page's ranking of the apps rests on those defaults. The DoorDash rates were read from search results, because a direct fetch was blocked. The Grubhub rate came from third-party summaries only, so changing every worked example on that evidence was left for a run that can cite the rate cards. It is listed under "Known gaps".

The arithmetic itself is right: an independent script matched every output to four decimal places. Five of seven seeded bugs survived. Fixed: tests now pin the payment-fee terms. The page figure of $45.89 is now $45.90, the calculator's own number. The "nothing is saved" claim was removed, because the page does save to localStorage.

**Commercial property cap-rate calculator: not at the bar.** The page promised "the loan a lender is likely to give". It showed that loan only when a deal *failed* the 1.25x coverage test, so on the shipped example (1.26x) no loan size appeared anywhere. The cap-rate grid also rounded to one decimal, so a typed 7.25% was missing from its own grid. Both are fixed, and the claim now reads "the largest loan a 1.25x coverage test allows". Lesser-of sizing (loan-to-value, coverage, debt yield) is not modelled and is listed under "Known gaps".

**research/eda-noisy: not at the bar.** The study reproduces byte-for-byte, and an independent hypervolume script matches its numbers. But no test checked the study's core choice: that the found set is scored on the true objectives, not the noisy ones. A mutant that scores on the noisy view passed the whole suite; a new test now catches it.

Two open design problems are left under "Known gaps":

- The study adds noise to cycles and accuracy. The repository's own fidelity ladder says only cell counts are noisy.
- The README cites none of the noisy multi-objective literature.

**research/capture-aliaswin: not at the bar.** The headline finding is "the lever is shared audio". It is partly an artefact of cutting both cameras over the same clock span. The standard layout searches a longer segment of camera B, wider by the maximum offset. In the auditor's independent re-implementation, that layout took 1 s windows from almost always wrong (0.96 to 1.00) to 0.000 on two clips. This is a design question for the next research run. It is listed under "Known gaps", not changed here. Several README numbers were corrected, and a test now catches a sign flip in the parabolic refinement.

**Janitorial bid calculator: at the bar.** All seven dimensions scored 3, and the tests caught 7 of 8 seeded bugs. The worst defect was in the second-site calculator: it paid drive time for one person whatever the crew size, so a two-person crew's travel cost came out at half. Federal rules count travel between job sites as paid work time (29 CFR 785.38). It is fixed, and the page has a new "Cleaners in the vehicle" input. The 5x-vs-3x page's $2,184 is now $2,183, and a test pins every price in that table to the calculator.

## What changed since the last census

Seed be43 found 0 of 6 at the bar, with 12 of 32 seeded bugs caught. This draw found 1 of 6, with 17 of 34 caught. Six subjects per census are far too few to call that a trend. What repeats is the pattern: arithmetic checked against an independent source mostly passes (correctness 3 in five of six), while the tests rarely pin thresholds and boundaries. The wrong numbers a user would act on come from domain rules and rate cards, not from the formulas.
