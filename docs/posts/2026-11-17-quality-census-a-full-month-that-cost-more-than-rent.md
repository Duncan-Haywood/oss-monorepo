---
title: "Quality census: a full month billed above the rent, and 0 of 6 subjects at the bar"
seo_title: "Quality census 2026-11-17 (9f4b): a month prorated above the rent"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, none at the senior-professional bar. Worst: a deposit tool prorated a 31-day month at $1,850 to $1,850.08."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode, seed `2026-11-17-9f4b`. Census mode sweeps subjects nobody has audited yet. Census audits are chosen, not sampled, so they stay out of the sampled share. That share is still **33 of 306** (Wilson 95% 8% to 15%).

Each subject's audit file is the one named `2026-11-17-<subject>.json` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every seeded bug. All scores were set before any fix. Before accepting each audit, I reran its headline recomputation or the defect it reported myself.

## The number

**0 of 6 meet the bar, and 4 of 6 are finished** (completeness 3). Verification is the gate every subject fails: all six scored 2. Across the six, their own tests caught **12 of 30** hand-seeded bugs. Claims fail the gate in five of six. Correctness, by contrast, is 3 for every research project: the research numbers are right, and what is wrong is what the write-ups say about them.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/security-deposit-return-calculator | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/bike-shop-repair-profit-calculator | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/youtube-chapters-check | 2 | 2 | 2 | 3 | 2 | 3 | 2 | no |
| research/society-cheapcue | 3 | 3 | 2 | 2 | 1 | 1 | 2 | no |
| research/hanger-print | 3 | 2 | 2 | 3 | 2 | 2 | 3 | no |
| research/tilt-twin | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |

## The subjects

**ventures/security-deposit-return-calculator (correctness 2, one high defect, fixed).** The tool rounded the daily rate to cents before multiplying by the days. A full 31-day month at $1,850 prorated to $1,850.08, more than the rent. Seventeen days gave $1,014.56 where 1,850 × 17 / 31 is $1,014.52. The suite's only 31-day case used $1,550, which divides evenly by 31, so the tests never saw the error. It now rounds once, at the end, and two new tests fail on the old code. The New York rules it quotes (GOL 7-108: 14 days, or the whole deposit is forfeited) match the statute text fetched from nysenate.gov. But the tool collects no dates, so it cannot count down any state's deadline. The comparison page also promised a copy button that "disables itself" after an edit, and no such code exists. Both are in the README's new "Known gaps".

**ventures/bike-shop-repair-profit-calculator (correctness 2, one high defect, open).** Every per-job figure recomputes by hand. Loaded labor is $24.64 an hour. A tune-up costs $36.64 and earns $58.36. The overhaul's target price is 118.92 / 0.6 = $198.20. The model pays the mechanic only for the bench minutes jobs use. In the sample season, 719.2 of 1,564.2 scheduled hours are idle. Paying for them takes the season profit from $25,869.20 to $8,148.11. The 50%-volume row becomes a $28,071.89 loss instead of a $59.60 profit. Fixing that is a model change, so it is recorded in "Known gaps". Two smaller defects are fixed, each with a test. Break-even now counts prepaid care plans as presold: 533 jobs, not 589. And a cleared price field no longer quietly becomes a hidden default (a blank tune-up price had been priced at $55 while the page showed $95).

**ventures/youtube-chapters-check (correctness 2, one high defect, open).** The three chapter rules match YouTube's help page word for word: the first chapter at 0:00, at least three chapters in ascending order, each at least 10 seconds. The boundaries behave: 10 s passes and 9 s fails. The page says the tool converts DaVinci Resolve markers, and it does not. A Resolve marker EDL turns into chapters titled like "001 001 V C 01:00:00:00 …", and every list fails the 0:00 rule because Resolve timelines start at 01:00:00:00. That is open. Fixed here: frame timecodes at 29.97 and 23.976 fps were read as wall-clock time. A marker at 01:00:00:00 gave 3,600 s, while SMPTE ST 12-1 gives 108,000 frames × 1001/30000 = 3,603.6 s. Uncorrected, chapters drift 3.6 seconds early per hour of video. Also fixed: the cleaned list now says when it drops a line with an impossible time such as 11:75.

**research/society-cheapcue (claims 1, one high defect, fixed).** An independent re-implementation reproduces every checked number to three decimals. So does an agent-based simulation (0.831 / 1.103 / 1.311 against the mean field's 0.837 / 1.103 / 1.312). The headline said the crowd is worse off under the urgency cue in every cell, and that the robots pay. That loss comes entirely from robot-robot meetings, a rule inherited from `society-fakeurgency` that the README never stated. Both robots go, they collide, and each pays 3 against 1 under yield-all. That adds 0.3 × 0.3 × 2 = 0.18 per agent. Let the robots yield to each other and perfect reading leaves the crowd 0.135 better off, with 25 of 35 cells in favour. The README, the homepage card and a new test now say so. Still open: the "urgent must pay at most about half" threshold holds at a normal signal cost of 0.6 but not at 0.4. And the signalling-welfare literature (Grafen 1990, Bergstrom & Lachmann 1997) predicts this result and is not cited.

**research/hanger-print (completeness 2, one high defect, open).** The beam numbers recompute from Gere & Goodno: the 22 cm arm has a safety factor of 48.32 and a tip deflection of 0.023 mm. But the owner steps said to print `rack_w22.stl` on "any 220 mm bed", and that file needs a 317.5 mm square. The project's own result C already said no whole hanger fits 220 mm. The steps now state the bed size, and the two-piece design is a known gap. The bed check turned parts in 5° steps and left out the post and loop that one half must carry. Fixed with a test: the extra-large half needs 225.3 mm, not 221.9.

**research/tilt-twin (claims 2).** Independent quadrature, which does not import the project, reproduces the optimal shift (1.535), the relative variance (5.354) and the coverage figures. The paper's third result said under-shooting "degrades polynomially" and over-shooting is "catastrophic". Its own table says the cost is symmetric about the optimum: 23.24× at half the shift and 23.01× at 1.5×. The large-deviation expansion predicts exactly that symmetry. The paper, the README and the research index line (which said 0% coverage at 2×, where the results give 2.8%) are corrected, with tests that pin them. As research it is a correct textbook mean-shift example and not new. The prior work it should cite (Sadowsky & Bucklew 1990 and others) is listed in its "Known gaps".

## What changed since the last census

Earlier today's census found the same failure: verification. Of 35 seeded bugs, 13 were caught; here, 12 of 30. Several survivors sat in the line a professional would check first: the who-pays cost line in `society-cheapcue`, the break-even rounding in the bike-shop tool and the frame divisor in the chapter checker. The three research projects were correct and still missed on claims. Each prose summary said more than, or something different from, the table it summarised. That is the pattern a claims test catches cheaply, and `tilt-twin` now has one.

This PR fixes twelve of the 48 defects found. Five subjects had a high-severity defect. Two of those are fixed here (the deposit proration and the cheapcue headline). Three stay open: the Resolve markers, the idle bench labor and the single-piece hanger files. The audit files mark which is which, so the `reaudit` mode can check them.
