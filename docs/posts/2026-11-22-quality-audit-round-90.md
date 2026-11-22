---
title: "Quality audit round 90: 0 of 5 at the bar, and a pattern that disagreed with its own spec sheet"
seo_title: "Quality audit 90: a pattern that disagreed with its own spec sheet"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 5 subjects meet the bar. Every recomputed number held, but tests missed 14 of 31 seeded bugs, and a clothing pattern contradicted its tech pack."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-22-*` files with seed `2026-11-22-30b4` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/ifc-quantity-takeoff`, two ventures and two research projects. None of the five had been audited before. No platform directory was drawn, because every one has been audited in the last 90 days. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **ifc-quantity-takeoff:** a hand-written IFC file with an HEA 200 column 3 m long gives a computed section of 0.005383 m² and a volume of 0.01615 m³. By hand, 2·200·10 + 170·6.5 + (4−π)·18² = 5,383 mm², which is the steel-table figure.
- **fishing-charter-trip-pricing-calculator:** the sample gives a target price of $1,457.96 and a break-even of $885.22. By hand, (567 + 61,000/72)/0.97 = 1,457.96 and (567 + 21,000/72)/0.97 = 885.22.
- **clothing-design-studio:** the drafted tee sleeve is 22 cm in all six sizes, while the spec sheet the tech pack prints says 19 to 24 cm.
- **swe-nullrate:** solving Wilson's quadratic directly gives 23/39 negative or mixed, with an interval of 43.4% to 72.9%. That matches the README's "59%; Wilson 43% to 73%".
- **autocorr-twin:** after this round's test was added, both batch-means mutants that had survived (a √L divisor, and t₀.₉₇₅,₂₉ = 1.96) fail the suite.

## The number

**0 of 5 subjects meet the bar.** None of the four sampled (non-flagship) subjects meets it either. Across every sampled audit, 36 of 368 now meet it (Wilson 95% interval 7% to 13%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ifc-quantity-takeoff (flagship) | 3 | 3 | 2 | 3 | 3 | 3 | 3 | no |
| ventures/fishing-charter-trip-pricing-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/clothing-design-studio | 2 | 3 | 2 | 2 | 3 | 3 | 2 | no |
| research/swe-nullrate | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/autocorr-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

Verification is the gate that binds for all five. Of 31 bugs seeded by hand, the tests caught 17:

| subject | seeded bugs caught |
|---|---|
| ifc-quantity-takeoff | 3 of 6 |
| fishing-charter-trip-pricing-calculator | 2 of 5 |
| clothing-design-studio | 5 of 8 |
| swe-nullrate | 3 of 6 |
| autocorr-twin | 4 of 6 |

Four of the five subjects had every independently recomputed number right. So in this round the weak point is the tests, not the arithmetic.

## Each subject

**ifc-quantity-takeoff (flagship).** The reviewer is a senior quantity surveyor who prices from BIM models. All 172 tests pass in 1.8 s. The auditor wrote three IFC files by hand and checked ten outputs against formulas or steel tables, and all ten matched:

- an I-section with root radii, and a circular hollow section;
- a slab extruded along a slanted direction;
- an L-shaped profile;
- a recess opening, with and without a void threshold;
- a revolved solid, with and without an offset axis;
- a mapped item scaled by 2;
- an ellipse;
- a model in imperial units.

It misses the bar only on verification. Three core mutants survived, because no test uses a non-circular ellipse, an offset revolve axis or a centimetre unit. The worst gap is medium: member length and steel mass come only from stored quantity sets, so a beam with none shows 0 m and 0 kg on its BoQ line. A per-metre rate then prices it at nothing, and no note warns. The page and `llms.txt` also still gave the drawn-volume figure from before the last fix (9,184 of 9,314; it is 9,310 of 9,312).

**fishing-charter-trip-pricing-calculator.** The reviewer is an owner-operator charter captain setting next season's rates. The prices are right, the page works in a browser, and the disclaimer is present. The worst defect is medium. The "you need more trips" warning compared completed trips needed with trips *booked*. At $1,400 the target needs 77.1 completed trips against 72 completed (of 90 booked), and no warning appeared. Other gaps:

- the tool quoted per angler for 12 anglers, past the six-passenger limit for an uninspected charter boat (46 U.S.C. 2101);
- it labelled a pre-tax figure "profit you want to take home";
- every finding the page shows was untested, which is why three of the five mutants survived;
- it prices one trip type per run, so a half-day plus full-day rate card counts the fixed costs twice. That one is still open.

**clothing-design-studio.** The reviewer is a technical designer at a small brand, who checks first that the graded pattern matches the spec sheet sent to the factory. It does not, and this is the round's one high-severity defect:

| measurement | pattern | spec sheet | sizes outside tolerance |
|---|---|---|---|
| tee sleeve | 22 cm in every size | 19 to 24 cm | |
| shoulder | 40.0 to 58.2 cm | 39.4 to 55.8 cm | 5 of 6 |
| neck width | 15.1 to 22.3 cm | 18 cm in every size | 5 of 6 |

The same dimensions are typed separately in four modules. A test pinned the ungraded sleeve and said in a comment that the other modules agreed, which they did not. Everything else the auditor recomputed matched, including fabric weight, shrinkage, size run, costing and sleeve cap ease, and all 734 tests passed. Five guide pages also carried no usage counter.

**swe-nullrate.** The reviewer is a meta-research methodologist who codes published abstracts. Every number reproduces byte for byte. The worst defect is in research design: the labels do not follow the README's own rule that "boundary cases went to the less flattering class." Three summaries that say "but" or "fails" are labelled positive, and three that test no alternative are labelled as tested. With the auditor's moves the headline goes from 59% to 71% negative or mixed: the direction holds, the point estimate is soft. There is one coder and no kappa. The README also said no benchmark existed, though Fanelli (2010, 2012) and Scheel, Schijen and Lakens (2021) count much the same thing in published papers.

**autocorr-twin.** The reviewer is a simulation output analyst. Every number the auditor recomputed matched: the AR(1) variance, the effective sample sizes, the t table and both run lengths. An independent regenerative estimate of the M/M/1 asymptotic variance agreed with the cited formula to within 1.3%. The batch-means interval, which is the project's own remedy, was effectively untested, so both mutants seeded in it survived. Fitness and domain are 2: the project is a sound teaching reproduction of Whitt (1989) and Law and Kelton, with no comparison against overlapping batch means, spectral methods or a modern batch-size rule.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **fishing-charter-trip-pricing-calculator:**
  - the trips-needed warning now compares completed trips with completed trips, and also states the bookings needed;
  - over 6 anglers, it warns about the six-pack limit;
  - text typed into the optional fields is an error, not silently ignored;
  - the fuel finding says it is a price change, and the target is labelled pre-tax.
  
  Six new tests pin every finding, and all 27 pass.
- **clothing-design-studio:**
  - the pattern now grades the sleeve +1 cm a size from the same size-M length the spec sheet and the cuff check use, and a test checks the drafted sleeve against the spec row in every size;
  - the five guide pages count usage, and a test now requires that on every page;
  - the rib-band sentence on the pattern page is corrected.
  
  One drape-settling test was tuned on the old 22 cm sleeve: at 21 cm, 6 of 836 vertices keep moving. That test is pinned to 22 cm and the case is logged. Shoulder and neck still disagree with the spec and are in the ROADMAP's new "Known gaps", with the grading increments and the missing neckband. All 736 tests pass.
- **ifc-quantity-takeoff:** the page and `llms.txt` carry the current figure, and a test ties both to the README's. The README's model count is corrected. The steel length and mass gap and the three untested geometry branches are in `NEXT.md`.
- **swe-nullrate:**
  - the README now names the seven labels that break its rubric, with the 71% alternative;
  - it cites the benchmarks and says how their unit differs;
  - a new test reruns `run.py` against `results.txt`, which catches the headline mutant that had survived.
  
  The labels themselves are unchanged until a second coder relabels them.
- **autocorr-twin:** tests pin a hand-computed batch-means half-width (3.28688) and the t table, and both surviving mutants now fail. The README's test count and runtime are current.

## What changed since the last round

Round 89 had 2 of 5 at the bar. The sampled share is unchanged at 36, now out of 368. The pattern in this round is narrower than usual: four of five subjects had every independently recomputed number right, and all five fell on verification. Tests that check what the author believed, rather than seeded mistakes, remain the commonest reason a correct tool misses the bar.
