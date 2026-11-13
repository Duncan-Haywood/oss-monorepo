---
title: "Quality audit round 55: 0 of 4 at the bar, and a morph planner that overstated odds for unproven hets"
seo_title: "Quality audit 55: morph odds, snow bids, robot reach, detectors"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A ball python planner treated a possible het's genotype as re-rolled for every egg, overstating clutch odds."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-13-*` files named below. Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample` with seed `2026-11-13`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Counting every sampled round on `main` plus this one, 31 of 234 meet it (Wilson 95% interval 10% to 18%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ball-python-morph-pairing-planner | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/snow-removal-bid-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/mimic-featuretransfer | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/robofab-reach | 2 | 3 | 2 | 2 | 1 | 1 | 2 | no |

| subject | seeded bugs caught | recomputed outputs right |
|---|---|---|
| ball-python-morph-pairing-planner | 4 of 5 | 5 of 7 |
| snow-removal-bid-calculator | 5 of 7 | 4 of 5 |
| mimic-featuretransfer | 1 of 5 | 5 of 5 |
| robofab-reach | 2 of 4 | 5 of 7 |

Three of the four had a wrong number that a user would act on. In each case the per-unit arithmetic was right and the error came from how the units were combined: eggs in a clutch, stops on a route, and a precedence slip in one height. The fourth subject, the detector study, reproduced exactly but said more than its ablation shows.

## Verdicts and worst defects

### ball-python-morph-pairing-planner (correctness 2)

The reviewer is an experienced ball python breeder who plans pairings for sale. The per-egg odds were right on every cross the auditor recomputed: the textbook 1:2:1 and dihybrid ratios, spider × spider losing a quarter of eggs, super forms, and a 24-class trihybrid.

**The worst defect (high):** the "chance of at least one" in a clutch treated every egg as independent, even when a parent was a possible het (`calc.mjs:379`, and each row at `:362`). A 50% het Clown female is either het or not for the whole clutch; she does not re-roll for every egg. For her (Luna in the sample list) bred to a het Clown male, 6 eggs at 85% hatch, the right chance of at least one Clown is 0.5 × (1 − (1 − 0.85/4)⁶) = 0.3807. The tool said 0.4903. Ranking pairings by target chance therefore favoured unproven parents. The tests could not catch it, because the test oracle used the same per-egg model as the code. I recomputed both figures by hand.

Other defects:

- **Medium.** The FAQ said possible hets come from het × visual pairings and that a visual bred to a normal gives 50% possible hets. Those babies are 100% het. Possible hets come from het × het (66%) and het × normal (50%).
- **Medium.** Allelic complexes (Lesser/Butter/Mojave, Cinnamon/Black Pastel, Yellow Belly/Gravel) are refused rather than modelled, though they are among the most-bred genes.
- **Low.** "66% het" is read as 0.66, not the 2/3 breeders mean by it.

### snow-removal-bid-calculator (correctness 2)

The reviewer is an owner-operator who bids residential and commercial snow contracts. Every figure the auditor recomputed by hand matched to the cent, including both tables on the flat-rate comparison page. The per-push prices sit inside the published $30 to $95 per-visit range for driveways.

**The worst defect (high):** "Per-site seasonal" and "Per-site per-push" were the route total divided by the number of stops (`calc.mjs:143`). On a route of one two-car driveway and one medium lot, both stops showed $2,273.07. Priced alone they cost $956.19 and $3,589.95. Quoting the driveway owner the "per-site" figure overcharges them by more than double, and quoting the lot undercharges it. That is the flat-rate error the venture's own comparison page warns against.

Other defects:

- **Medium.** A seasonal contract cannot be written with a visit cap and per-push overage, or with per-inch tiers, and lot salt is priced only in bags, not tons.
- **Medium.** Two of seven seeded bugs survived, including swapping the margin divisor for a markup on the per-ice-event price.
- **Medium.** The Aspire comparison said Aspire's plans are tiered by revenue without naming a source the reader could check. I searched and found Aspire's own landing page grouping plans by annual revenue, so the claim holds but was uncited.
- **Low.** The comparison page called $22/hr a "loaded operator" rate. It is the base wage; loaded, the operator costs $28.60 and operator plus truck $73.60.

### research/mimic-featuretransfer (verification 1)

The reviewer is a senior ML researcher in machine-text detection. The study asks which feature families let a human-vs-machine detector carry over to a text family it never saw. The auditor reran it in 5½ minutes and got `results.txt` and all 159 values in `results.json` back exactly. They also recomputed the AUROCs from Mann-Whitney ranks, the length column with no model at all, and the intervals with their own DeLong implementation. All of it matched.

**The worst defect (medium):** the headline "Content words carry most of the transfer" was not backed. The word feature set keeps every stop word. With stop words removed it averages 0.899, below characters at 0.916. And words beat characters in only 6 of 8 families (sign test p = 0.29), so the average lead is not a reliable ranking.

Other defects:

- **Medium.** 4 of 5 seeded bugs survived the tests, including leaking the held-out family into training and flipping the labels. Those two would have invalidated every number.
- **Medium.** Feature sets are compared by overlapping item-level intervals, with no paired test and no family-level uncertainty on the means.
- **Low.** "Char+word is not always best (recipes …; reddit …)" cited the two families where char+word *is* best.
- **Low.** No prior work on cross-domain detection (M4, MAGE) or function-word stylometry was cited.

### research/robofab-reach (claims 1)

The reviewer is a robot kinematics and workcell-layout researcher. The project asks how short a planar two-link arm can be and still assemble its own toy gripper. `run.py` reproduced `results.txt` byte for byte. An independent closed form recomputed all 16 cells of table 1. With equal links, the shortest link is half the radius of the smallest sphere around the 18 targets centred at shoulder height. The IK agreed with the textbook two-link workspace on 20,000 random targets.

**The worst defect (high):** "at 60 degrees no arm up to 600 mm works" was an artefact of the ±400 mm box the base search covers, not of the arm. The auditor found a 400 mm arm that reaches every target with its base outside the box.

Other defects:

- **Medium.** An operator-precedence slip put every tray pick point too high: `top - bottom / 2` instead of `(top - bottom) / 2` (`model.py:54`). Fixing it moved 4 of 16 table cells, including the headline 60 mm, which is now 70 mm.
- **Medium.** The equal-link answer is a closed-form workspace bound, and the README does not say so. Base-placement prior work (Zacharias 2007, Vahrenkamp 2013) is not cited.
- **Low.** "Within the 10 mm length grid" understated the grid: the total length steps by 15 to 30 mm, so the whole 150 to 160 mm spread across link ratios is grid noise. The README said a run takes about a minute; it takes 2 seconds.

## What was fixed in this round

All fixes are in the PR that carries this post, one commit per subject. Each comes with a test that fails on the old code. The scores above are from before the fixes; a later round will re-audit these subjects.

- **ball-python-morph-pairing-planner.** Clutch chances now average over each possible het's two genotypes: het with its stated chance, normal otherwise, the same for every egg. Luna × Ember now reads 0.3807. A test pins that and three other hand-computed cases, and checks that a pairing with no possible hets gives the same answer as the old formula. `verifyPlan` now checks that the clutch chance never exceeds the independent-egg figure, since averaging can only lower it. The FAQ now gives the right origins for possible hets. The allelic complexes and the 66% reading stay open.
- **snow-removal-bid-calculator.** Each stop now carries its own seasonal and per-push price (its minutes, its drive time, its salt). The stops add up to the route total, and a test checks each against the stop priced alone. The page shows these in the route split and the bid summary, and the old figure is now labelled "Average per stop". The $22/hr rate is called a wage, and the Aspire revenue-tier claim names its source. A new test catches the per-ice margin bug that survived. Visit caps, per-inch tiers and tonnage salt stay open.
- **mimic-featuretransfer.** The headline now says word n-grams, not content words, and reports the stop-word ablation and the 6-of-8 split. The "not always best" examples now name families where char+word is beaten (abstracts, poetry, wiki), and a test ties them to `results.json`. The weak tests on leakage and labels stay open.
- **robofab-reach.** The pick height is fixed, the experiment rerun, and the figure, README, homepage card and research index updated (headline 70 mm). The 60-degree finding now says it holds inside the 400 mm base box. A 400 mm arm with its base at (60, 780) works, and no 300 mm arm does anywhere on a 10 mm grid within 1,200 mm. The auditor's example base, (120, −690), stopped working once the pick height was fixed, so the test uses the new one. The closed-form framing and prior work stay open.

## What changed since round 54

Round 54 also had 0 of 4 at the bar, and its two well-tested subjects failed on claims. This round, 12 of 21 seeded bugs were caught, and recomputed outputs were right 19 times in 24. The misses were not in the formulas a developer writes tests for. They came one step out: combining eggs into a clutch, stops into a route, or a height into a target point. Each test suite checked that step with the code's own model, so it could not see the error. Across all audits, verification is still at 3 or more in only 94 of 248.
