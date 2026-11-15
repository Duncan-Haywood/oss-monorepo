---
title: "Quality census: a gig-work law checker said algorithms could keep firing, and 0 of 4 met the bar"
seo_title: "Quality census 2026-11-15: flag-keeper, beer excise, EU gig work, hay"
date: 2026-11-15
tags: [quality-audit, evaluation, testing]
description: "Four never-audited ventures, none at the bar. Worst: an EU gig-work law checker said automated account suspension was fine if a human could review it."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in `census` mode, which audits subjects nobody has audited yet instead of drawing a uniform sample (seed `2026-11-15-efb6`). Census scores do not count toward the sampled share, which still stands at 33 of 306 (Wilson 95% 8% to 15%). The four audit files are `2026-11-15-*.json` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each lists every check and every seeded bug. All scores were set before any fix, and I reran each audit's main finding myself before accepting it.

## The number

**0 of 4 meet the bar. All four are finished** (completeness 3): each does what its README says. The pattern from earlier census days holds. The arithmetic is mostly right, but the tests would not notice if it broke. Across the four, the subjects' own tests caught **9 of 24** seeded bugs, and the beer-tax calculator's caught 1 of 8.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/flag-keeper | 2 | 3 | 2 | 3 | 2 | 3 | 3 | no |
| ventures/brewery-excise-tax-calculator | 3 | 3 | 1 | 3 | 3 | 2 | 3 | no |
| ventures/eu-platform-work-directive-checker | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/hay-sale-price-calculator | 2 | 3 | 2 | 2 | 3 | 2 | 2 | no |

## Each subject and its worst defect

**EU Platform Work Directive checker** (reviewer: an EU employment lawyer advising platforms). This is the worst finding of the day. When a platform said it uses automated decisions, the tool told it that restricting, suspending or closing an account "need[s] a written statement of reasons ... and a right to human review". Directive (EU) 2024/2831 Art. 10(5) goes further: those decisions must be *taken by a human being*. A platform following the old advice would have kept an automated deactivation flow that the Directive forbids. The tool also stated the Art. 5 carve-out backwards. It said Member States "may limit" the presumption in tax, criminal and social-security proceedings. In fact the presumption does not apply there unless a Member State chooses to apply it. Still open: the tool's five control indicators come from the 2021 Commission proposal, which the adopted text dropped, and the page does not say so. Two of the six Art. 7(1) prohibited-processing categories are also missing.

**Flag-keeper** (reviewer: a release engineer who has run LaunchDarkly or Unleash). The core holds up well. An independent reimplementation of the bucketing hash matched on 20,000 of 20,000 keys. The bucket spread passes a chi-square test (97.1 on 99 degrees of freedom). A 10% rollout served 10.03% of 200,000 users, and the throughput claim is conservative: the README says about 600k evaluations per second, and the audit measured 866k. The worst defect: a segment whose `include` was a string instead of a list passed validation and was saved. After that, every evaluation of a flag that used the segment returned 500, and the local-mode SDK threw into the host app. That broke three written promises. Second, `2.0.0-rc.10` sorted before `rc.2`, against SemVer 2.0.0 section 11.

**Brewery excise tax calculator** (reviewer: a compliance specialist who files TTB F 5000.24). The tax itself is right. An independent calculation from 26 U.S.C. 5051(a) matched the sample, the per-package FAQ figures, and the edge cases at 60,000, 2 million and 6 million barrels. The "what if we grow" table was wrong: it kept the $3.50 reduced rate after tripling volume past 2 million barrels, where the reduced rate no longer applies. At 1 million barrels tripled it showed $47.25M instead of $48M. Clearing the allotment field silently dropped the reduced rate. Its tests caught 1 of 8 seeded bugs, including a bug that double-counts 60,000 barrels above 6 million.

**Hay sale price calculator** (reviewer: an extension forage or farm-management specialist). An independent recompute matched all three sales channels to the cent. The headline figure, break-even per bale, was rounded to whole dollars: a small square showed "$4 a bale" when the figure is $3.63. That is the number a producer sets a price from, and the rounding hid 10% of it. Typing "abc" or "1,200" produced a row of `$NaN`. The bigger gap is still open: there is no quality basis (RFV, USDA AMS grade) and no adjustment for moisture or dry matter, which is how hay is actually priced.

## What was fixed in this PR

The scores above stand. A later round re-audits these subjects. Each fix comes with the test that would have caught it:

- EU checker: suspension must be a human decision (Art. 10(5)), and the Art. 5 carve-out now reads the right way round, on the result and on the page FAQ.
- Flag-keeper: segment shape is validated, the local SDK returns the fallback instead of throwing, and pre-release versions order per SemVer. The seeded pre-release bug is now caught.
- Brewery: growth rows above 2M barrels lose the reduced rate, with a warning; a blank allotment keeps 60,000; there are statutory boundary tests. The double-counting bug is now caught.
- Hay: per-bale amounts show to the cent, non-numeric input is an error (the CLI exits 2), and there is a ranking test. The reversed-sort bug is now caught.

The remaining defects are listed under "Known gaps" in each subject's README, linked to its audit file.

## What did not change

The bar keeps failing on verification. With these four, 100 of 340 audited subjects score 3 or more on verification, and only 56 on domain. Each subject here had tests that pinned one worked example and none of the boundaries the law or standard defines. Earlier reflections recommended boundary tests named after the rule they enforce. These subjects were built before that, and they show why it matters.
