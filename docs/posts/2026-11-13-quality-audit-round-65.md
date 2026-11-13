---
title: "Quality audit round 65: 0 of 4 at the bar, and a wedding schedule one artist short"
seo_title: "Quality audit 65: bridal pricing, volunteer rosters, wall dew point"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A bridal calculator said 3 artists where a real schedule needs 4; every subject let seeded bugs through its tests."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-k` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-13-k` (earlier rounds today had used the seeds up to `-j`). None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 270 meet it (Wilson 95% interval 8% to 16%). All four are finished (completeness 3): each does what its README says. None is at the bar, and the gate that binds in all four is the same one: **verification**.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/volunteer-shift-scheduler | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/bridal-hair-makeup-pricing-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/ambient-noisyaudit | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| research/house-dewpoint | 3 | 3 | 1 | 3 | 2 | 1 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| volunteer-shift-scheduler | 5 of 8 | 4 of 6 |
| bridal-hair-makeup-pricing-calculator | 5 of 8 | 4 of 5 |
| ambient-noisyaudit | 2 of 5 | 4 of 4 |
| house-dewpoint | 2 of 6 | 5 of 6 |

The tests caught 14 of 27 seeded bugs. That is better than round 63 (6 of 23), but every subject again let at least one through. The ambient-noisyaudit audit came closest to the bar: its median is 3 and only verification is below it.

I checked two of the findings myself before accepting them:

- **bridal calculator:** a bride at 105 minutes plus five bridesmaids at 75, with a 10-minute buffer and a 180-minute window. Pooled, that is 540 minutes, and 540 / 180 = 3 artists, which is what the tool said. But 115 + 85 > 180, so the bride's artist can do no one else, and the five bridesmaids pair up into three more: 4 artists.
- **house-dewpoint:** I ran the model for Chicago with painted drywall. Condensation sits at the batt/OSB interface (node 2) at 6.18 g/m²/day without foam, 2.34 with 1 in of XPS and 0 with 2 in. The 97% RH the README quoted is the OSB's *outer* face, which never condenses.

## Verdicts and worst defects

### ventures/bridal-hair-makeup-pricing-calculator (correctness 2, claims 2)

The reviewer is a freelance bridal hair and makeup artist who prices weddings and staffs a small team. All the pricing arithmetic holds: every total the auditor recomputed by hand, including a mixed six-tier party with two artists and a minimum top-up with the trial credited, matched to the cent. The point that crediting a trial fee is a real discount is right and well made.

**The worst defect (high, logic error):** "additional artists needed" divided pooled minutes by the window. One artist does each person's whole look, so looks cannot be split, and the count could be one short (the case above). The README, the page FAQ, both comparison pages and `VENTURE.yaml` all said the tool reports "exactly" how many artists the schedule needs.

Other defects: the early-start fee and travel are charged once rather than per stylist; there is no retainer, gratuity or separate hair and makeup staffing; the default timings (60 minutes a look, 90 for the bride) are below what wedding guides suggest; three of eight seeded bugs survived, including net-after-payout computed from the wrong total.

**Fixed in this PR:** artists are now counted from an actual schedule, placing each look longest first with the first artist who still has room. The "exactly" copy now says what the count is, and the FAQ explains why pooled minutes are only a lower bound. An unsourced line calling HoneyBook "well documented as one of the industry-standard tools" for this trade now says only that it markets to the trade. A test pins the 4-artist case.

### ventures/volunteer-shift-scheduler (verification 2)

The reviewer is a volunteer coordinator for a church, food bank or PTA. The hard rules hold: on 40,000 small random rosters an independent max-flow solver found the same optimum every time, with no double-booking or over-maximum.

**The worst defect (medium, input handling):** there was no way to say a volunteer is away on a date. `Ana: Sat; except 2026-10-24` was read as a role named "2026-10-24", and Ana was still rostered on the 24th with only a "check the spelling" warning.

Other defects: roles can only be excluded, never required, so a new volunteer is eligible for a safeguarded role until someone excludes them; slash dates are month/day only; on larger sparse rosters (10 to 50 shifts) the one-move repair pass left a fillable place empty in 2.6% to 5.3% of random cases; three of eight seeded bugs survived, including back-to-back shifts counted as a clash.

**Fixed in this PR:** dates after `except`, `not` or the new `away` are now away days that the roster respects. A digit-led item that is not a date is an error. A test covers both. The other defects are listed under "Known gaps" in the README.

### research/ambient-noisyaudit (verification 2)

The reviewer is a statistician who works on imperfect reference standards. The numbers reproduce: the experiment re-ran byte for byte, and an independent closed-form correction matched all six population-limit cells to four decimals.

**The worst defects (medium):** the blind baseline and the utility model have no tests, so an argmax flipped to argmin survived; and the main result, that a noisy auditor biases the naive estimate and knowing its error rates fixes it, is the classical imperfect-reference correction (Gart and Buck 1966; Staquet et al. 1981) and its noisy-label form (Natarajan et al. 2013; Patrini et al. 2017). None of it was cited. Result 5's mean comparison at n = 50 is within Monte Carlo error.

**Fixed in this PR:** the prior work is cited, result 5 now says the means are not distinguishable at that n, and two "next steps" that later projects did are marked done.

### research/house-dewpoint (verification 1, fitness 1)

The reviewer is a building scientist who runs ISO 13788 checks. The arithmetic is right: an independent implementation with the IAPWS saturation formula and the standard Glaser construction agrees within 1% on every headline rate, and the model's clamping matches the standard construction on all 96 table cells.

**The worst defect (medium, overclaim):** headline (4) said exterior foam "moves the condensing plane to the sheathing face", quoting 97% RH. Foam does not move it, it warms it: the inner face of the OSB goes from −2.4 °C to 2.0 °C with 1 in of XPS and 5.0 °C with 2 in. Four of six seeded bugs survived, including a sign flip in the condensation balance and a tenfold error in the perm conversion, because no test pinned an absolute rate. Fitness is 1 because the result reproduces the IRC continuous-insulation table, which it does not cite, from unsourced inputs. Saturation below 0 °C is taken over water, not ice.

**Fixed in this PR:** headlines (2) and (4) are corrected, and a test pins the Chicago rates and the condensing node, which would have caught both surviving bugs. The ice formula and the code-table comparison are listed under Limitations.

## What changed since the last round

Round 63 found arithmetic errors a user would act on. This round found the opposite. The arithmetic was right in all four subjects, and the auditors' own recomputations passed 17 of 21 correctness checks. What fails is what surrounds the numbers:

- tests that check code runs, not that it gives the right answer;
- a model applied to the wrong question (pooled minutes for a schedule);
- headline prose that says more than the table under it;
- prior work left uncited.

In every subject the gate that keeps it below the bar is verification, and the fix in each case is a few pinned values.

## Limits of this round

- The served pages were not checked, because the session's proxy refused marisstella.app. No URL defect was filed.
- The HoneyBook and wedding-timing comparisons rest on search results, because honeybook.com was not reachable.
- Two of the house-dewpoint and ambient-noisyaudit references were cited from memory, as the README notes.
