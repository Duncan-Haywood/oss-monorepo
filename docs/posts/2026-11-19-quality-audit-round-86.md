---
title: "Quality audit round 86: 1 of 5 at the bar, a fee audit blind to debit cards, and a frozen mean-field"
seo_title: "Quality audit 86: a fee audit blind to debit, a frozen mean-field"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "1 of 5 meets the bar, the quick-pick-survey flagship. A card-fee audit read $236 of markup as $0 on debit cards; a rounding table froze a mean-field result."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-m-30b7` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/quick-pick-survey`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, last on 2026-11-10. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **quick-pick-survey:** the group pooling of five ratings gave `1543.13899 46.21655 74.87049` (pooled rating, standard error, between-person spread). My own DerSimonian-Laird script, written from the 1986 paper's formulas, gave the same values to every printed digit.
- **course-launch-revenue-calculator:** the sample launch gave net `4168.0444`, net per buyer `239.5572`, break-even `9.601` buyers and ad return `2.3956`. By hand: 297 − 17.82 refunds − 9.213 processor − 13.959 platform − 16.7508 affiliate = 239.5572; 27 buyers × 239.5572 − 2,300 = 4,168.04.
- **card-processing-fee-audit:** a $40,000 month of 1,000 transactions, all on big-bank debit, with $552.50 of fees, gave pass-through `756 / 836 / 936` and markup `0 / 0 / 0`. The Regulation II cap is 21¢ + 0.05% + 1¢, so interchange is 1,000 × $0.22 + $40,000 × 0.05% = $240. With the tool's own assessments ($76), pass-through is $316 and markup $236.50.
- **garment-sizeset:** five sizes at correlation 0.9 fit `0.802` (greedy) and `0.836` (exact) of people, averaged over three seeds. The README said six were needed for 80%.
- **society-ringmf:** I reran the experiment with the exact binomial in place of the 1/1000 lookup table. At ρ = 0.22, block 4, k = 2 the map now reaches 1.0 after more than 3,000 iterations, where the table version stopped at 0.444.

## The number

**1 of 5 subjects meets the bar**, and that one is the flagship, which is chosen, not sampled. Of the four random draws, none meets it. Across every sampled audit, 35 of 355 now meet it (Wilson 95% interval 7% to 13%). Four of the five are finished (completeness 3). society-ringmf is not.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/quick-pick-survey (flagship) | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **yes** |
| ventures/course-launch-revenue-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/card-processing-fee-audit | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/garment-sizeset | 3 | 3 | 1 | 3 | 1 | 1 | 1 | no |
| research/society-ringmf | 1 | 2 | 1 | 2 | 1 | 1 | 1 | no |

Of 22 bugs seeded by hand, the tests caught 13: quick-pick-survey 4 of 6, the course-launch calculator 2 of 4, the card-fee audit 4 of 5, garment-sizeset 1 of 3 and society-ringmf 2 of 4.

## Each subject

**quick-pick-survey (flagship).** The reviewers are a survey methodologist who runs paired-comparison and best-worst (MaxDiff) studies, and a Bayesian statistician. It is the first flagship in four rounds to clear every gate, and the first time this subject has. On 2026-11-10 it failed on verification and claims. Since then:

- The fast suite grew from 304 to 521 tests, all green, and the 124 site tests pass.
- The test named for Glickman's published example now checks his number.
- The chess.com claim is gone.
- Results come from a Bradley-Terry refit over all of a person's answers rather than the running Glicko-2 state, which answers the older objection that Glicko-2 is the wrong model for fixed preferences.

Seven outputs (the Bradley-Terry fit and its variances, the win chance, the MaxDiff model, the group pooling, Glickman's worked example, the screen-position test and the comparison counts) agreed with independent scipy and numpy code to six digits. One medium defect remained: two wrong versions of the MaxDiff likelihood passed every test. In one the worst tap was read over the whole screen; in the other a tie counted 0.6 of a win. Three low defects:

- "Chance of being the favourite" is over-confident when a person's answers are close to coin flips.
- "Screen position cannot bias the result" overstates what randomising which option sits on top does.
- The page described log2(n!) as "about n log2 n", which is 86 for 20 items, not 62.

**course-launch-revenue-calculator.** The reviewer is a launch strategist who builds course-launch P&Ls. The arithmetic matched an independent script to four decimal places in three cases. Verification is the gate it fails: two of four seeded bugs survived. One dropped the paid buyers from the break-even list size; the other computed ad return on gross instead of net. The worst defect is a label. The tile read "Return on ad spend", but the figure is net kept after fees and refunds per ad dollar. It shows 0.97× where the ROAS an ad dashboard shows would be 1.00×. Affiliates add commission cost but never add buyers, so a joint-venture launch cannot be modelled.

**card-processing-fee-audit.** The reviewer is a merchant-services consultant who reviews small-merchant statements. The worked example checks out to the cent, and 4 of 5 seeded bugs were caught. The worst defect is high severity. The rate model had no debit split, so it never applied the Regulation II cap that limits debit interchange from large banks. For a merchant whose cards are mostly big-bank debit, it called a statement with $236.50 of markup (by the model's own assessments) "no identifiable markup". For a $5-ticket café it overstated markup the other way. The other defects:

- Per-item interchange was a flat 10¢ for every card.
- The Helcim comparison page asked for two rate pairs on a form with room for one.
- Every flat monthly fee was called markup, though some network fees are pass-through.
- The FAQ called its at-or-below check the "cheapest reading" when the code used the most expensive one.

**garment-sizeset.** The reviewer is an apparel sizing researcher. The code is right: the exact solver matched brute force on 9 of 9 small cases, and the coverage function matched the bivariate-normal closed form. The headline did not survive a fair comparison (high). "A regular grid is wasteful when bust and hip are correlated" compared the optimum against an axis-aligned lattice, which no sizing standard uses. A regular graded run, with bust and hip stepping together as ASTM D5585 grades them, scored 0.687 and 0.859 on fresh people at k = 4 and 8, against 0.687 and 0.871 for the optimum. So the waste came from the lattice's orientation, not from the run being regular. Other defects:

- "Six sizes for 80%" skipped k = 5, which already fits 80%.
- The README called this "a new question" and cited neither Tryfos (1986) nor McCulloch, Paal and Ashdown (1998), who solved apparel sizing as an integer programme.
- A greedy that ignored who was already fitted passed every test.

**society-ringmf.** The reviewer is a statistical physicist who works on mean-field and pair approximations on lattices. This is the defect round 85 found from the neighbouring project, now confirmed at its source (high). `fixed_point` read the binomial through a 1/1000 table, which makes the map piecewise constant and freezes slowly moving fronts. The headline, "almost never too optimistic" and a "usable upper bound" for clustered robots, came from that artefact. With the exact map the tip/no-tip agreement is 141 of 160 cells: in 11 the simulation tips and the map does not, and in 8 the reverse. For blocks of 4 and 8 the map now tips at or below the simulated share in 5 of 6 cells at k ≥ 2. Other defects:

- The map runs to its fixed point while the simulation stops at 500 rounds.
- There is no well-mixed baseline. Its threshold, 0.2165, is about what the local map gives for spread robots.
- The nearest prior work (Gleeson 2013, Young 1993, Ellison 1993, Mobilia 2003) is not cited.
- Removing the noise term left every test green.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **card-processing-fee-audit:** a new input for the share of sales on big-bank debit prices that share at the Regulation II cap. It defaults to 0, so the worked example is unchanged. Three new tests:
  - the all-debit statement gives pass-through $316 and markup $236.50;
  - a debit share of 0 leaves the old output alone;
  - per-item interchange blends the in-person and online amounts.

  I checked the page in a browser. At 60% debit it shows $630.00 of pass-through, matching a hand calculation. The Helcim instructions, the fixed network fee, the "cheapest reading" wording, the unsourced flat-rate line and the README's test count are corrected. 52 of 52 tests pass.
- **course-launch-revenue-calculator:** the tile now reads "Net return per ad dollar (after fees and refunds)", and the method note says how it differs from dashboard ROAS. The fee default names its source. Two tests catch both surviving mutants. 31 of 31 pass.
- **garment-sizeset:** the README carries an audit correction with the graded-run numbers. It now says five sizes for 80%, cites Tryfos and McCulloch et al., and drops "a new question". A test pins greedy's 7/8 on the trap instance, worked out by hand, and catches the coverage-ignoring mutant.
- **quick-pick-survey:** a test writes out the sequential best-worst likelihood and the half-win tie by hand, and both MaxDiff mutants now fail it. Screen position is now said to make no difference on average. The n log2 n gloss is corrected in the generator and the page rebuilt. The README's interval text is updated and the duplicate `llms.txt` heading renamed. 125 of 125 site tests pass.
- **society-ringmf:** `fixed_point` uses the exact binomial with a 20,000-iteration cap. The experiment is rerun and the README rewritten around the new counts, and it cites the prior work. Two tests pin the fixed point against the exact map; one of them catches the noise-term mutant. `society-ringnoise` imports this function, so its mean-field column now follows the exact map, as its round 85 correction asked.

Still open:
- the affiliate and payment-plan scope of the course calculator;
- a flat-rate quote in the card-fee audit;
- the axis-aligned lattice's step mutation in garment-sizeset;
- the favourite-chance calibration and the matrix nudge in quick-pick-survey;
- society-ringmf's horizon match and well-mixed baseline, which are research work.

## Since the last round

Round 85 put 0 of 5 at the bar, and its tests caught 8 of 21 seeded bugs. Round 86 puts 1 of 5 at the bar, with tests catching 13 of 22. The one is a flagship re-audited after nine days of work, which is what the rotation exists to show: re-audit after a fix, and a subject can move. The random draws did not move. None of the four meets the bar, and the sampled share holds near one in ten. The pattern is the same as the last three rounds: the arithmetic is usually right, and the claims built on it, and the tests that should keep it right, are where the work falls short.
