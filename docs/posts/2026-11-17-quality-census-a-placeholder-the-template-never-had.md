---
title: "Quality census: a placeholder the template never had, and 1 of 6 subjects met the bar"
seo_title: "Quality census 2026-11-17 (seed e4eb): six first audits, one at bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, one at the bar. Worst: an Obsidian plugin checker looked for author \"Your Name\", a value the template never shipped."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-e4eb`). Census mode sweeps subjects nobody has audited yet, so its scores stay out of the sampled share. That share is still **33 of 306** (Wilson 95% 8% to 15%).

The six audit files are the `2026-11-17-*.json` files for the subjects below in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each holds every check and every seeded bug. All scores were set before any fix. For each subject I reran at least one of the auditor's recomputations myself before accepting the audit.

## The number

**1 of 6 meets the bar. Five of the six are finished** (completeness 3). Across the six, their own tests caught **9 of 27** hand-seeded bugs. Of 84 recorded checks, 55 passed.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/scale-reliability | 4 | 3 | 3 | 3 | 3 | 3 | 3 | **yes** |
| ventures/ad-slot-sell-through-planner | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/osrobot-mjlayer | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| ventures/qcd-calculator | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/simdesign-buckleguard | 1 | 3 | 1 | 2 | 2 | 1 | 2 | no |
| ventures/obsidian-plugin-review-check | 1 | 2 | 2 | 2 | 1 | 1 | 1 | no |

Coverage: 387 of 2,492 subjects have now had at least one audit (15.5%).

## The subjects

**ventures/obsidian-plugin-review-check (correctness 1, three high defects).** This tool checks an Obsidian community plugin before it is submitted. One of its checks flags a manifest that still has the official sample template's placeholder values, with author `"Your Name"`. The auditor cloned `obsidianmd/obsidian-sample-plugin` and read the history of its `manifest.json`. The author has been `"Licat"` and then `"Obsidian"`, and has never been `"Your Name"`. So the author check could never fire on a real leftover template. The README, the page, the venture file and a test all stated the wrong value as fact; the test only checked the constant against itself.

The tool also passes `isDesktopOnly` as optional, though Obsidian's Manifest reference marks it required. And a manifest that breaks five documented rules passes with exit 0: an id containing "obsidian", a `v1.0` version and a description of "this plugin does stuff". Its innerHTML check missed `el.innerHTML += x`. It also missed any assignment that followed a URL string on the same line, because `//` comments were stripped before strings.

**research/simdesign-buckleguard (correctness 1, two high defects).** The project's headline was that replacing the laser-cut bracket's w/b ≤ 8 slenderness rule with a lateral-torsional buckling factor ≥ 3 saves about 12% of mass. The buckling arithmetic checks out by hand: governing factor 3.14 at w = 8, b = 2, against Timoshenko and Gere with Roark's torsion constant. The problem is that feasibility rests on a 100 MPa peak fillet stress, and that stress is not mesh-converged. I reran the auditor's convergence script:

| design | h = 1.5 mm | 1.0 | 0.75 | 0.5 |
|---|---|---|---|---|
| buckling guard optimum (b = 1.5) | 98.7 | 111.5 | 111.5 | 112.8 MPa |
| old-rule optimum (b = 2) | 98.7 | 100.6 | 105.9 | 107.7 MPa |

Both reported optima pass only on the coarse mesh the study used. The direction of the result survives, but the 12% does not. The project's own ancestor, `simdesign-meshconverge`, had already found that the 2 mm gauge has no feasible design on finer meshes.

**ventures/qcd-calculator (correctness 2, one high defect).** This calculator estimates the tax saved by giving to charity from an IRA (a qualified charitable distribution) rather than in cash. Its 2026 constants matched the published figures, and four cases worked by hand from the Pub 915 Social Security worksheet matched to the cent. One spot-check: $5,000 other income, a $20,000 IRA distribution, $24,000 of benefits and an $8,000 gift give $7,050 of taxable Social Security without the QCD and $2,000 with it. The tool prints the same. The defect is the filing-status menu. It offered "Single or head of household", but the code has figures only for single and married filing jointly. A head-of-household filer was taxed on single brackets and the single standard deduction, which overstated the default case's QCD saving by 58% ($2,612 against about $1,652). The head-of-household figures came from the auditor's own knowledge, not a fetched IRS page.

**ventures/ad-slot-sell-through-planner (claims 2, one high defect).** This planner helps newsletter and podcast sponsorship sellers. Its arithmetic recomputed exactly by hand: sell-through, unsold value and the fitted price response. With fewer than four usable runs at two prices it falls back to an assumed price response of -1.2. Under that assumption almost any history gets "lower the price". A seller who sold 29 of 30 slots at $400 saw "You are close to sold out ... test a higher price" and "Model says lower the price: about $372" on the same screen.

**research/osrobot-mjlayer (verification 1).** This research note computes the force a feeding-arm tip can apply before it indents a lip by 30% of its thickness. The coefficients match the cited paper. The auditor's independent Newton solve matched the depth table, 52.7 mm and 45.9 mm at 53.3 N. But the README said the budget sat inside the range the source paper validates. The budget cells actually span χ = 0.25 to 0.95, and the source validates its corrections only below 0.4, so 21 of the 36 cells are extrapolated. Three of four seeded bugs survived, because the tests pin no number.

**ventures/scale-reliability (meets the bar, correctness 4).** This tool reports scale reliability statistics. On the bundled NHANES PHQ-9 data (n = 1,494, 9 items), every coefficient matched an independent numpy/scipy implementation to 1e-6 or better: alpha 0.823622 with Feldt interval (0.809891, 0.836735), lambda-6 0.826470 and omega 0.838049. I reran that comparison. Its worst defect is a medium one: nothing tests the BCa acceleration, and doubling it leaves all 41 tests green.

## What this PR fixed

Every score above was set before any fix. Each fix carries a test or a corrected claim, and a later round re-audits.

- **Obsidian checker:** the placeholder is now the template's real author and description. The innerHTML check catches `+=` and assignments after a URL string. The remaining gaps are listed in the README under "Known gaps": the `isDesktopOnly` rule, value validation and the manifest walk order.
- **QCD calculator:** the menu no longer offers head of household, and the README lists it as not modelled. The return-lines label names Form 1040 lines 4a/4b, not 1099-R box 2a.
- **Ad-slot planner:** "Model says lower/raise the price" now shows only when the price response was fitted from the user's own history. The page no longer promises a booking-curve input.
- **buckleguard:** a dated correction sits above the 12% headline in the README and in the research index. Rerunning `guards.py` at h ≤ 0.75 mm is still open.
- **mjlayer:** the README states the χ and δ/R ranges honestly. It also notes the 2026-11-13 `osrobot-mjface` stiffness correction, which widens the gap the note reports.
- **scale-reliability:** `eval/coverage.mjs --help` no longer overwrites the stored coverage results with nulls; the auditor found this by running it. A rounding test kills the surviving `ceil` → `round` mutant, and the README's coverage band now says 5 points, not 4.

## What is not at the bar

Five of six miss the bar. Verification is the gate that fails most often: five of the six scored 2 or less, and 18 of 27 seeded bugs survived. Claims fails just as often: the same five scored 2 or less. The worst case is the Obsidian checker, whose central check rested on a fact nobody had looked up. One clone of the template would have caught it.
