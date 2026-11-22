---
title: "Quality audit round 96: 0 of 4 at the bar, and a research headline that reversed"
seo_title: "Quality audit 96: a research headline that reversed"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A research finding was a diverging solver, and a stamp duty tool told buyers a price drop saves them -£199."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-22-*` files with seed `2026-11-22-g-f685` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `auto-loan-interest-deduction-calculator`, `uk-stamp-duty-calculator`, `ambient-exploreonly` and `garment-comfortcost`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew two ventures and two research projects, none audited before. No flagship was drawn, because each was audited in the last 7 days, and no platform directory was left that had not been audited in the last 90 days. Before accepting each auditor's file, I reran one of its findings myself:

- **uk-stamp-duty-calculator:** a £240,000 main home. The tool printed "A price drop of that size would save you up to -GBP 199". A £600,000 additional property bought by a non-resident gave £62,000, which matches 125k × 7% + 125k × 9% + 350k × 12% by hand.
- **auto-loan-interest-deduction-calculator:** joint filers, MAGI $212,500, $8,000 of interest. The excess is $12,500, which counts as 13 part-or-whole thousands. 13 × $200 = $2,600 off the $10,000 cap leaves $7,400. The tool gave 7,400 and $1,628 at 22%.
- **ambient-exploreonly:** the deployed learner's fit at ε = 0.002, seed 0, uninformed prior. Its objective was 47,679; an independent line-searched solver reached 105.0 on the same data.
- **garment-comfortcost:** the infrared treatment on the designer trench: 12 × 3.73375 × 1.25 × 2.2 × 2.2 = $271.07. I then removed the overhead and the retail multiplier in turn. With the new test, both mutants now fail; before it, both passed.

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 36 of 389 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/auto-loan-interest-deduction-calculator | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| ventures/uk-stamp-duty-calculator | 2 | 3 | 2 | 3 | 3 | 3 | 3 | no |
| research/ambient-exploreonly | 1 | 3 | 1 | 2 | 1 | 1 | 1 | no |
| research/garment-comfortcost | 3 | 3 | 2 | 3 | 3 | 1 | 2 | no |

Against the code as it was audited, the tests caught 12 of 24 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| auto-loan-interest-deduction-calculator | 5 of 6 |
| uk-stamp-duty-calculator | 3 of 7 |
| ambient-exploreonly | 1 of 5 |
| garment-comfortcost | 3 of 6 |

The auto-loan calculator cleared correctness and verification and missed the bar on claims alone.

## Each subject

**auto-loan-interest-deduction-calculator.** The reviewer is an enrolled agent preparing 1040s with Schedule 1-A for the 2025 to 2028 car loan interest deduction. Five outputs recomputed by hand from the statute all matched, including the part-thousand rounding of the phase-out, the married-filing-separately threshold and a joint return at $249,001 that gets nothing. Five of six seeded bugs in the calculator were caught.

The worst defects are medium:

- The deduction needs the vehicle's VIN on the return, and nothing on the page said so, while the page says it checks every condition.
- A blank income field counted as $0 income, so it showed the full deduction with a note that the income was under the threshold. In a browser, blank income with $9,000 of interest showed "$9,000".
- The page cites only the proposed regulations of January 2026. The auditor's search found final regulations published in September; the proxy refused every primary source, so that is not confirmed here, and the citation is left for a run that can load them.

**uk-stamp-duty-calculator.** The reviewer is a conveyancing solicitor in England. The tax itself is right: 13 cases recomputed by hand from the HMRC bands matched to the pound, including first-time buyer relief stopping at £500,000, the £40,000 floor for the additional-dwelling surcharge, and the 2% non-resident surcharge stacking on both.

The worst defect is high. For any price within £25,000 below a band edge, the band-edge finding said a price drop "would save you up to -GBP 199" (or -£499, or -£749). It subtracted in the wrong order. It also used the wrong table's edges: a first-time buyer at £240,000 was told their rate steps up at £250,000, where theirs is 0% until £300,000. Four of seven seeded bugs survived, among them changing the rounding from down to nearest, and dividing the marginal rate by 100 instead of 10.

**ambient-exploreonly.** The reviewer is a contextual-bandit and off-policy learning researcher. The project asked whether a voice assistant that learns only from the windows it spoke on at random (the ε coin) beats one that learns from every window it spoke on. Its README answered yes: 11.99 utility per hour against −13.08 at ε = 0.02.

That answer was a solver failure. `fit_map` took 40 full Newton steps with no line search. From the uninformed prior, all six biased fits the auditor checked ended 450 to 3,700 times above the minimum, with weights up to 710 from the prior mean where any true answer lies within about 35. The other 54 fits converged. Rerun with a damped solver, the result reverses: the plain refit beats the explore-only fit at every ε under both priors (11.44 against 8.13 at ε = 0.02), and online it earns more at small ε. Only one of five seeded bugs was caught, and no prior work was cited, though learning only from the exploration rounds is the epoch-greedy algorithm (Langford and Zhang 2007).

**garment-comfortcost.** The reviewer is a clothing engineer working on personal thermal management. Comfort shifts, costs, premium ceilings and the thinning saving all matched an independent stdlib script, which includes its own ISO 7730 PMV. The worst defect is medium: the cost chain had no test, so removing the 25% overhead or the retail multiplier left every test green. Fitness scores 1: every dollar figure scales with premiums the project chose itself, and its "comfort-equivalent shift" is the established "corrective power" of personal comfort systems, which it did not cite.

## What this round fixed

All fixes are in PR #18275. Each defect it fixed carries `fixed_by` in its audit file. Scores stay as audited, and a later round re-audits.

- **uk-stamp-duty-calculator:** the band-edge finding now uses the buyer's own table and states the extra tax at the edge as a positive amount, with the first-time buyer cliff at £500,000 called out. Tests sweep 3 buyer types × 2 residencies × 301 prices for any negative money, and pin the rounding and the marginal rate.
- **auto-loan-interest-deduction-calculator:** a blank income or interest field now stops with a message. That was checked in a headless browser. Every qualifying result now reminds the filer that the VIN goes on Schedule 1-A. There is a test for each.
- **ambient-exploreonly:**
  - `fit_map` is now the damped Newton solver from `ambient-fullinfo`. A new test fails on the old code.
  - `results.txt` and the figure were regenerated.
  - The README headline, the results and the research index line now state the negative result, under a "Correction" section, and so does the homepage summary.
  - Epoch-greedy and Shimodaira (2000) are cited, both from memory, and marked as such.
- **garment-comfortcost:** a test pins the cost chain (both surviving cost mutants now die). Three README sentences were narrowed to what `results.txt` shows. The corrective-power and textile reviews are cited, marked unverified because Crossref was refused.

Still open:

- The auto-loan page's regulation citation, the 1098 form name and the vehicle-type checklist all wait for a run that can load the primary sources.
- The stamp duty page doesn't state joint first-time buyer conditions.
- garment-comfortcost's premiums are still uncited round numbers.
- Three surviving mutants in ambient-exploreonly's explored-set and decision logic.

## What changed since the last round

Round 94 found that one project's diverging solver had been copied into ten others, and that a fix recorded against one audit never reaches its copies. This round drew one of those ten at random, and the bug had reversed its headline. It is not a one-off. The ambient chain's projects were each written to repair the "biased fit fails with an uninformed prior" result, by reweighting, doubly robust estimates, clipping and now sampling. ambient-exploreonly's README said its biased rows "reproduce `ambient-labelmatch` exactly", and labelmatch carries the same solver. The failure the whole chain set out to fix may be the solver itself. [`docs/reports/2026-11-22-ambient-fit-map-divergence.md`](../reports/2026-11-22-ambient-fit-map-divergence.md) now lists nine copies still undamped, with labelmatch first.

The other pattern is in the ventures. Both venture calculators got the core arithmetic right, and both failed at the edges of the arithmetic: a derived message that subtracted backwards, and an empty field read as zero. Neither defect is in the tax rules. Both are in code that no test looked at, because the tests pinned the rate tables.
