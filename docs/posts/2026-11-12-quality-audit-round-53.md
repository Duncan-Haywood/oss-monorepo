---
title: "Quality audit round 53: 0 of 4 at the bar, and a tender checker that missed the FAR's own bid guarantee"
seo_title: "Quality audit 53: tender checker, horse barn, friction, hypotheses"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A tender checker missed FAR bid guarantees, and a research headline of 7.6 times was about 40 times."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix. The fixes landed in the same pull request, and a later round re-audits them.

This round ran in mode `sample` with seed `2026-11-12-l`. Round 52 (seed `-k`, [PR #15193](https://github.com/Duncan-Haywood/oss-monorepo/pull/15193)) was still open when this one started, so this round took the next seed, and round 52's subjects are not in the totals below. None of the four subjects had been audited before. No flagship or platform subject was drawn: each one had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Across all sampled rounds on `main` and in this pull request, 31 of 222 meet it (Wilson 95% interval 10% to 19%). All four are finished (completeness 3): each does what it lists, at a level below the senior-professional bar.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/horse-boarding-stall-profit-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/tender-bid-readiness | 1 | 3 | 1 | 2 | 2 | 1 | 1 | no |
| research/qual-hypothesis | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/friction-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

Verification was below 3 in all four, the same gate that binds most often across the corpus (92 of 236 audited subjects reach 3 on it). The tests caught 10 of 25 hand-seeded bugs:

| subject | seeded bugs caught | recomputed outputs right |
|---|---|---|
| horse-boarding-stall-profit-calculator | 3 of 6 | 4 of 6 |
| tender-bid-readiness | 2 of 6 | 1 of 8 |
| qual-hypothesis | 3 of 7 | 5 of 6 |
| friction-twin | 2 of 6 | 5 of 6 |

## Verdicts and worst defects

### tender-bid-readiness

**The weakest of the round: correctness 1.** It is a browser checker. You paste a solicitation, and it flags whether the text states the deadline, bond, insurance, licensing, a pre-bid meeting, the submission channel and the question window. The reviewer named for it is a Shipley- or APMP-trained bid manager running the bid/no-bid gate.

**Worst defect: it missed the bond requirement in the federal government's own wording (high).**
- The bond rule matched "bid bond", "performance bond" and similar phrases only.
- The federal clause that requires one, FAR 52.228-1, calls it a **"Bid Guarantee"**. Many state codes say "bid security".
- Both wordings came back "Not found".
- Under FAR 28.101-4, a missing bid guarantee generally makes a bid nonresponsive, so this was the most disqualifying item the tool could miss.

Two more high defects:
- **The wrong deadline.** The tool showed the first "due" in the text. With "Questions are due by 2 January" before "Proposals are due 20 January", it showed the question cut-off as the submission deadline. The tool's own guide calls these "two deadlines, not one". "Due diligence" also counted as a deadline.
- **A comparison claim the vendor contradicts.** The GovWin IQ comparison page said reading a solicitation's requirements "is not that platform's job". Deltek's GovWin IQ page, fetched during the audit, describes AI that summarizes documents and scores lead fit for go/no-go decisions.

What is still not at the bar:
- A requirement written as a negation still counts as found: "No bid bond is required" scores as a bond signal.
- A decoy paragraph with no real requirements scores 71%.
- Set-aside eligibility, SAM registration, the bid acceptance period and prevailing wage are not checked at all.

**Fixed in this PR:**
- The bond rule now matches "bid guarantee", "bid security" and "surety bond".
- Submission wording ("proposals are due", "closing date", "received until") is tried before any bare "due", and "due diligence" no longer counts.
- The GovWin paragraph and its FAQ schema copy now say what Deltek's page says.
- Two new tests cover the bond wording and the deadline choice.

### horse-boarding-stall-profit-calculator

**The arithmetic is right; the advice text was not tested.** It is a monthly profit and break-even calculator for a boarding barn. It prices the owner's own care time at a wage they choose. The reviewer named for it is an equine extension farm-business specialist.

The auditor recomputed the sample barn by hand, and the tool matched every line. I re-derived the 50%-full case myself and it matched too:

| quantity | calculation | result |
|---|---|---|
| margin per horse | (550 + 40) × 0.97 − 160 − 55 − 152 | $205.30 |
| profit, sample barn | 17 × 205.30 − 3,000 | $490.10 |
| break-even | 3,000 / 205.30 = 14.6 horses | 73% full |
| profit at 50% full | 10 × 205.30 − 3,000 | −$947 |

**Worst defect: a barn already losing money was told it was about to (medium).**
- The "within ten points of break-even" warning was also true for every occupancy *below* break-even.
- At 50% full, a barn losing $947 a month was told "a couple of empty stalls turns it into a loss".
- The owner's real hourly pay, the README's headline question, was hidden whenever profit after wages was negative. At $450 board the barn pays the owner $8.27 an hour against a $15 wage, and the page never said so.

Not yet at the bar:
- The sample's 20 minutes of care per horse per day is about half the labour that extension budgets use. At the Ohio State figure the sample barn loses money instead of making $490.
- There is no depreciation line and only one board tier.
- "550,50" is read as $55,050 with no warning.

**Fixed in this PR:**
- Below break-even, the page now says how many points and horses short the barn is.
- The hourly pay shows whenever profit plus labour is positive.
- Two tests cover both. The threshold mutant that survived before now fails them.

### qual-hypothesis

**The pipeline reproduces exactly; its headline ratio did not hold.** The project asks whether hypotheses about what separates two sets of documents survive a held-out check. It runs on 5,313 Reddit comments. The reviewer named for it is a statistician who works on selective inference.

What reproduced:
- The auditor's own pandas/statsmodels pipeline, sharing no code with the project, rebuilt the corpus and all 20 held-out test rows exactly.
- The Benjamini-Hochberg step matched statsmodels on 20,000 random families.
- The shuffled-label control is calibrated: 27 of 800 splits confirm anything, against a 5% target.

**Worst defect: the headline divides by noise (medium).**
- The README said discovery effects at 100 comments are "7.6 times too large". The 7.6 divides the discovery effect by the mean *absolute* held-out effect.
- At that sample size the absolute value is mostly noise: with the labels shuffled it is still 0.0089.
- In the discovery direction (signed), the held-out effect is 0.0023, not 0.0129, so the overstatement is about 40 times, not 7.6.
- I reran the auditor's probe and got the same four numbers.
- At 2,000 discovery comments the two measures agree, and the 1.5 figure stands.

Other gaps:
- The tokenizer splits curly apostrophes, so "m" (from "I’m") is reported as a confirmed hypothesis.
- The test for the BH step also passed under Bonferroni.
- The nearest prior work is not cited: "Fightin' Words", the winner's curse literature, and D5 and HypoGeniC on held-out hypothesis checks. Against that work the result is sound but not new.

**Fixed in this PR:**
- A BH test that Bonferroni fails.
- A correction note at the top of the README with the signed figures.
- The research-page summary now gives about 40 times.

The rerun with a signed measure and the tokenizer fix are left for the project's next run.

### friction-twin

**Every number reproduces; the tests pin almost none of them.** It is a short study of what happens when a simulator models Coulomb-plus-viscous friction with one fitted viscous gain. The reviewer named for it is a robot system-identification researcher.

The auditor recomputed the stop distances, the fitted gains, the crossover speed and the minimax gain from formulas, sharing no code with the project. I re-derived one case:
- k = 1 + 0.5 × 2 / (13/3) = 1.2308;
- the twin/real distance ratio at speed 1 is 1.80;
- the minimax gain on [1, 3] is 1.8494, with a worst error of 0.1997.

All of these match `results.txt`.

**Worst defect: the tests pin almost none of these numbers (medium).**
- 4 of 6 seeded bugs left all 8 tests green.
- Removing the `abs()` from the error measure made the minimax "optimum" a gain of one million with zero error, and nothing failed.
- One assertion checked that a distance was below 10⁹.

Not at the bar:
- The paper does not cite the standard practice its fix restates: Coulomb-plus-viscous least-squares fits in robot identification since Gautier and Khalil, and SAE J2263 coast-down fits.
- "Default in many simulators" has no source.

**Fixed in this PR:**
- Tests now pin the crossover speed, the minimax gain and error to their closed form, and the twin's time formula.
- The `abs()` and `log10` mutants that survived before now fail.

## What changed since the last round

- **Same verification problem.** Round 51 found the same thing in research: the numbers are right and the tests would not notice if they changed. All four subjects here repeat it.
- **Tender checker.** A regex over a legal document had been checked against wording its author typed, not against the standard's own terms. The fix here used the FAR's wording, and a test now holds it.
- **Headline ratios.** A ratio of absolute values over a noisy denominator is a pattern worth a check wherever a project reports "N times too large". The qual-hypothesis fix records the signed figure next to it.

Usage of these four products is unmeasured, not zero. This audit says nothing about how many people use them.
