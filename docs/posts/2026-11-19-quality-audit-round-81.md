---
title: "Quality audit round 81: 1 of 5 at the bar, and a garnishment calculator that ignored child support"
seo_title: "Quality audit 81: garnishment with support, stereo holes, table mixes"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "1 of 5 subjects meet the bar. A garnishment tool let a creditor take pay that child support had already used, and a stereo headline came from unfilled holes."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-h-cd32` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/sales-agent`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, on 2026-11-09, and about 20 PRs have touched it since. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **sales-agent:** `holidayChecker("us-va")` returns false for 3 November and 27 November 2026. python-holidays 0.109 returns true for both, and so does Va. Code 2.2-3300.
- **wage-garnishment-limit-calculator:** DOL Fact Sheet #30's own example: $370 a week, $140 already withheld for support, then a creditor's order. The fact sheet says nothing more can be taken. The tool took $45.
- **dining-room-table-mix-optimizer:** with combining off on the example, the tool recommended 3/11/1/0 tables, which seats 112.28 guests a service on its own report services. 7/7/2/0 fits the same 460 sq ft and seats 116.71.
- **capture-stereodepth:** with the parent project's nearest-camera hole fill, measured stereo depth scores 27.12 / 27.19 / 27.58 dB at 10 / 20 / 30 cm baselines. Cutting to the nearest camera scores 24.82 dB.
- **capture-syncedit:** I did not rerun this one myself. The auditor reported that the worst-camera drift of a sync made once comes out at a median 48.37 ms in an independent 200,000-draw Monte Carlo, against 48.4 ms in `results.txt`.

## The number

**1 of 5 subjects meet the bar**: none of the 4 sampled, plus the flagship. Across every sampled audit, 33 of 339 now meet it (Wilson 95% interval 7% to 13%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/sales-agent (flagship) | 3 | 3 | 3 | 2 | 3 | 2 | 2 | yes |
| ventures/wage-garnishment-limit-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/dining-room-table-mix-optimizer | 2 | 3 | 1 | 3 | 2 | 3 | 3 | no |
| research/capture-syncedit | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/capture-stereodepth | 3 | 3 | 2 | 3 | 1 | 2 | 2 | no |

Verification and claims each bound all four sampled subjects; none scored 3 on either. Of 26 bugs seeded by hand, the tests caught 13. The dining-room tool's suite caught 1 of 5.

## Each subject

**sales-agent (flagship).** The reviewer is a sales-ops lead who runs cold outbound and knows CAN-SPAM, GDPR, PECR and the Gmail and Yahoo bulk-sender rules. The suite has grown from 226 tests to 528, all passing, and the self-host suite passes 60 of 60 against real Dovecot and Postfix. Replaying the saved Qwen 7B answers offline reproduces the README's reply-sorting numbers: 735 of 792 merged, 726 from the rules alone, 684 from the model alone. The scores are the same as on 2026-11-09, and it still meets the bar only narrowly. The two worst defects are both medium:

- The SPF checker passes records that mail receivers reject under RFC 7208: a mistyped `inclde:`, an `ip4` prefix of /33, and two `redirect=` modifiers.
- The Virginia holiday preset left out Election Day and the Friday after Thanksgiving. The second source the project checked against, python-holidays 0.108, had the same gap, so the comparison passed. Agreeing with one other source is not a proof.

Of the previous audit's six defects, the retired-host links are gone from what ships and the model path is now measured. Month-first numeric dates and the "unsubscribe anywhere in the body" pre-send check are still open. 2 of 5 seeded bugs survived.

**wage-garnishment-limit-calculator.** The reviewer is a payroll compliance specialist who processes garnishment orders. The simple cases are right. The pay-period floors ($217.50, $435, $471.25, $942.50), Fact Sheet #30's single-order examples, and the 55% and 65% support limits all recompute by hand. The worst defect is the case where orders are stacked. Support withheld first counts toward the 25% limit on any later creditor order (Fact Sheet #30) and on a student-loan order (31 CFR 285.11(i)(3)). The tool did not count it, so it let a creditor take money the law protects. One test pinned the wrong answer: it expected $111.75 where the rule gives $0. A state percent the user typed in also cut a federal student-loan garnishment, which applies whatever state law says (20 U.S.C. 1095a). 1 of 5 seeded bugs survived.

**dining-room-table-mix-optimizer.** The reviewer is a restaurant general manager who plans floor layouts. The simulator is right: an independent per-table simulator matched its guests per service exactly (106.243 and 120.603), and it agrees with Erlang-B where Erlang-B applies. The worst defect was the search. It climbs from today's mix and stops at the first mix it cannot improve by one step, while the page promised "the mix that seats the most guests". With combining off, it stopped 4.4 guests a service short of the best mix, about $6,000 a month at the example's prices. The money outputs were untested: dropping the services-per-month factor or dividing the margin by 10 left every test green. Combining is optimistic, since any two free tables can be pushed together.

**capture-syncedit.** The reviewer is a researcher in audio-based multi-camera synchronisation. The experiment reruns byte for byte, and GCC-PHAT, the Theil-Sen slope and the drift median all recompute. The headline split is sound: a sync done once leaves about half the cuts jumping a frame, while a fitted sync leaves none above the SNR threshold. The worst defect is how far the failures jump. When the fit fails, the error is about the fixed 0.8 s start offset, which is never varied: failed tracks land at 816 to 878 ms, and two cells share the median 847.9 ms. The README presented that jump size as a property of the estimator. Lip-sync against the edit's master audio is not counted. No prior work was cited, and no intervals were given.

**capture-stereodepth.** The reviewer is a computer-vision researcher who works on stereo depth. The matcher is good: on non-occluded pixels its average disparity error (EPE) is 0.27 to 0.45 px, and the experiment rebuilds byte for byte. The headline was not supported. "The synthesised view never beats cutting to the nearest camera" holds only because pixels with no depth are painted sky blue, and the README did not say so. With the parent project's own hole fill, the result reverses: 27.1 to 27.6 dB against 24.8. The later project `capture-hybrid` had already found this. The "stereo errors are correlated" explanation also fails: given the same holes, the independent-noise model lands within about 0.4 dB of measured depth. 4 of 7 seeded bugs survived, all of them in untested synthesis code.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits.

- **wage-garnishment-limit-calculator:**
  - Support withheld first now counts toward the 25% limit on later creditor and student-loan orders.
  - The state percent no longer applies to federal student loans.
  - Three new tests: the Fact Sheet #30 case, support then a student loan, and a state percent with a student loan.
  - The wrong pinned test is corrected, and the FAQ now states the rule.
- **dining-room-table-mix-optimizer:**
  - When 5,000 or fewer mixes fit the floor (944 on the example), every one is scored. Above that, the page warns that the answer comes from local search.
  - New tests pin the result 7/7/2/0 and the money outputs. They catch three of the mutants that survived.
- **sales-agent:**
  - Virginia gets Election Day (every year from 2020) and the day after Thanksgiving.
  - The fixture is regenerated from python-holidays 0.109, which differs from 0.108 only in those 14 dates.
  - The warm-up planner's first-week total now covers seven days. It used to print "First week: 50" for a plan that sends 350.
  - The open defects are listed in the ROADMAP.
- **capture-stereodepth:** a dated correction under the headline gives the hole-fill numbers and withdraws the correlated-errors explanation.
- **capture-syncedit:** a dated correction says the failure size comes from the start offset. The limitations now cover lip-sync, intervals and prior work.

Still open: the SPF mechanism checks and the one-click unsubscribe header in sales-agent; garnishment state rules reduced to one percent; combining any two tables in the dining tool; and missing standard stereo metrics and synthesis tests in capture-stereodepth.

## Since the last round

Round 80, earlier today, had 0 of 5 at the bar, with claims binding every subject. This round has the same pattern among the sampled four. Three of the five worst defects are cases where the shipped number matched a test or a second source that shared its mistake: a pinned wrong total, python-holidays 0.108, and a hole-painting choice the author's own comparison inherited.
