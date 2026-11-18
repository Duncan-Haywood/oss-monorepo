---
title: "Quality census: a peer-prediction result that came from a missing term, and 1 of 6 at the bar"
seo_title: "Quality census 2026-11-17-7681: six first audits, one at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, one at the bar. Worst: a research headline that Correlated Agreement fails came from leaving out the mechanism's penalty term."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-7681`). A census audits subjects nobody has audited yet, so its scores stay out of the sampled share. That share is unchanged at **33 of 306** (Wilson 95% 8% to 15%).

The six audit files are the `2026-11-17-*.json` files for these subjects in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file records every check and every seeded bug. All scores were set before any fix. Before accepting each audit, I reran its headline recomputation myself.

## The number

**1 of 6 meets the bar, and 5 of 6 are finished.** Across the six, the subjects' own tests caught **21 of 38** hand-seeded bugs. Of the correctness checks recomputed against a source the author did not write, 32 of 45 passed.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/fdr-multiple-testing | 3 | 4 | 3 | 3 | 3 | 3 | 3 | **yes** |
| ventures/earthwork-cut-fill | 3 | 3 | 3 | 3 | 2 | 2 | 3 | no |
| research/osrobot-dofbom | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/patio-door-bid-calculator | 2 | 2 | 2 | 2 | 2 | 2 | 2 | no |
| research/simdesign-gaugescatter | 2 | 3 | 2 | 2 | 2 | 2 | 1 | no |
| research/decentralized-verification-markets | 2 | 3 | 3 | 3 | 1 | 2 | 1 | no |

Coverage: 427 of 2,496 subjects have now had at least one audit (17%).

## The subjects

**ventures/fdr-multiple-testing (meets the bar).** The auditor built a 504-test list with ties, exact zeros and ones, and 1e-12, and compared it with statsmodels 0.15.0. Bonferroni, Šidák, Holm, Hochberg, BH and BY matched to within 2.2e-16. Two-stage BKY gave the same rejections at four levels. Storey's pi0 and the q-values, and the online rules LOND, LORD++ and SAFFRON, matched implementations written separately from the papers. I reran one value myself: the adjusted BH p-value for the fourth test of the bundled 1995 example is 0.035625, which is 15 × 0.0095 / 4. The worst defect was in the JavaScript API, where p-values can be passed as an array. There, `null` and `""` became p = 0, so a missing test turned into a certain discovery. That is fixed here, and the fix has a test. Five of eight seeded bugs still survive. They are boundary and warning checks, listed in the audit.

**ventures/earthwork-cut-fill (claims 2).** All eight recomputations matched: average end area, a quadratic balance elevation under 20% shrink, a triangle split on its zero line, Caterpillar-handbook shrink and swell, metric units, and a four-point borrow-pit cell. The SciPy Qhull cross-check reproduces to 6e-14. Two defects were found, and both are fixed here with tests:

- A space-separated survey row with a comma in its description, `1 5000 2000 100 EP, CURB`, was split on the comma. As the first row, it was then dropped silently as a header, which halved the area.
- The privacy answer said "Nothing is sent anywhere", but the hosted page counts an anonymous page view.

The second defect is not limited to this product: **163 venture pages** use the same sentence. The deployed footer does describe the counter, so each of those pages says two different things. Each one needs its own wording.

**research/osrobot-dofbom (verification 2).** Every unit price matches the cited SO-ARM101 table. I reproduced the follower-arm total ($121.94), the 2-joint total ($66.38), the ratio (1.837) and the break-even servo price ($57.90). Three of four seeded bugs survived, because the tests only checked that the ratio lies between 1 and 3. The headline numbers are now pinned, and a ratio target that cannot be reached raises an error. The rows for the 12 V servo still carry the 5 V power supply. The README now says so.

**ventures/patio-door-bid-calculator (two high defects, both fixed).** The pricing engine is right: three bids computed by hand match to the cent. The page around it was not.

- **The selects stopped working after the first visit.** The page saves the form when it loads. When it restored a saved form, it marked every field as hand-entered. From the second visit on, changing the configuration, frame, glass, install or access no longer moved the price. A 16-foot impact balcony job priced at $2,770.12, the price of a 6-foot vinyl door.
- **The comparison page called the 32%-margin bid the "walk-away price".** On that basis it said a $1,800 flat special "loses $970.12". The tool's own walk-away figure says it loses $83.68.

Both are fixed here, and the auditor's fake-DOM harness now shows the second visit pricing $6,953.83. The same restore code appears in **38 venture pages**. Each one needs checking for kit-driven fields.

**research/simdesign-gaugescatter (domain 1).** Its headline is a narrow feasible region at the 2 mm gauge. That region exists only because of the coarse mesh the project used (h = 2.5 mm). The 33.3 g design it found reads 100.0 MPa on that mesh and 131.1 MPa at h = 0.5, which I reran. A one-line beam formula gives 108.7 MPa against the 100 MPa limit. A later project, `simdesign-gaugemesh`, had already found that none of the 39 such designs stays feasible on a finer mesh, but nothing in this project pointed to that result. Now the README, the homepage card and the index bullet do. A new tip-deflection test, bounded by beam theory, catches the two seeded bugs that had survived: plane strain in place of plane stress, and a load cut by 20%.

**research/decentralized-verification-markets (claims 1, domain 1).** The LMSR prices match Hanson's closed form to 2e-16, and the experiments reproduce. The headline finding is that Correlated Agreement (CA) is vulnerable to a coordinated deviation. That finding comes from an implementation that pays only the same-task bonus. It leaves out the penalty term of the published mechanism (Shnayder et al. 2016; Dasgupta and Ghosh 2013), which subtracts the score on two different tasks. With the term restored on the same reports, honest reporting beats every deviation by +153; I reran this. Three other README claims were wrong, and all three are corrected here:

- The "95% of steps need no recomputation" figure is just 1 − audit_fraction.
- The error bound is exceeded at eps = 0.8.
- The "48% lower Brier" gain is mostly a choice of the market's liquidity parameter: a tuned plain market scores 0.0112 against 0.0107.

Implementing the full mechanism and rerunning the follow-ups that depend on it is still open.

## What the six have in common

The arithmetic is right more often than the claims built on it. Five of the six have no wrong core number in the engine, yet only one passes the claims gate. In both research projects, the headline came from a modelling choice the README did not flag: a mesh that was never refined, and a mechanism missing a term. Two product defects turned out to be patterns copied across the portfolio rather than one-off bugs: the restore code on 38 pages and the privacy sentence on 163. Fixing those pages one at a time will not scale. A shared helper or a build-time check would.

## Fixed in this round

All of these are in [PR #17050](https://github.com/Duncan-Haywood/oss-monorepo/pull/17050). The scores above are the scores from before the fixes, and a later re-audit will check the fixes.

- fdr-multiple-testing: missing array entries are dropped and counted instead of being read as p = 0. A boundary test was added.
- earthwork-cut-fill: a comma inside a description no longer drops a shot, and the privacy answer now describes the page-view count.
- patio-door-bid-calculator: the kit selects move the price after a restore (`restoredOverrides`), and the comparison page labels its bids as bids.
- osrobot-dofbom: the headline ratios and the break-even price are pinned by tests, a target ratio that cannot be reached raises an error, and the README notes the 12 V supply gap.
- simdesign-gaugescatter: the README now points to the finer-mesh result, a test bounded by beam theory was added, and dead code and a wrong description were removed.
- decentralized-verification-markets: four README claims were corrected, including the missing CA penalty term.
