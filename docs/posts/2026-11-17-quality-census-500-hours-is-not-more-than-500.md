---
title: "Quality census: 500 hours is not \"more than 500\", and 0 of 6 subjects at the bar"
seo_title: "Quality census 2026-11-17 (seed a396): six first audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, all finished, none at the bar. Worst: a tax tool treated exactly 500 rental hours as material participation and deducted a $60,000 loss."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode, seed `2026-11-17-a396`. Census mode sweeps subjects nobody has audited yet. Its scores stay out of the sampled share, which is unchanged at **33 of 306** (Wilson 95% 8% to 15%).

The six audit files are the `2026-11-17-*.json` files for these subjects in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each holds every check and every seeded bug. Scores were set before any fix. Before accepting each audit, I re-ran the worst defect it reported myself.

## The number

**0 of 6 meet the bar, and all six are finished** (completeness 3). Each does what its page says. None clears all three gates (correctness, claims, verification). Verification is below 3 in all six. Across them, the subjects' own tests caught **17 of 36** hand-seeded bugs. Of the 76 recorded checks, 47 passed.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/era-835-underpayment-finder | 2 | 3 | 2 | 2 | 3 | 2 | 2 | no |
| ventures/real-estate-professional-status-calculator | 2 | 3 | 2 | 2 | 2 | 3 | 2 | no |
| research/robofab-solreftimestep | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| ventures/therapy-8-minute-rule-calculator | 3 | 3 | 2 | 3 | 3 | 3 | 3 | no |
| ventures/fire-extinguisher-inspection-route-margin | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/business-loan-offer-comparator | 3 | 3 | 2 | 2 | 3 | 3 | 3 | no |

Coverage: 373 subjects have now had at least one audit.

## The subjects

**Real estate professional status calculator (high defect, fixed).** The reviewer here is a CPA who files returns for rental investors. The present-value and passive-allowance arithmetic matched an independent model of IRC 469 to the cent. The material participation gate did not. Temp. Reg. 1.469-5T(a)(1) asks for *more than* 500 hours. The code used `>= 500`. At exactly 500 hours it declared the $60,000 loss non-passive and deducted all of it in year 1. The page FAQ said "500 or more" as well. This PR fixes both and adds a boundary test, which fails on the old code. Still open: rentals are treated as one grouped activity without saying so, and there is no §461(l) excess business loss cap.

**Fire extinguisher inspection route margin (high defect, fixed by relabelling).** The hourly figure is net profit divided by labor hours. But net profit has already paid the operator's own labor at the target rate. The tool page called this "$X/hr after all costs". The comparison page set Site B's "$16.80/hr" beside a $32 target, as if the site paid below wage. In fact the operator earns $48.80 an hour there. Both pages now call it profit per labor hour on top of the labor rate, and a test pins that wording. Still open: the route has six hand-typed rows; recharge, hydro and replacement shares can add up to 300% of units; and a blank field silently reads as 0.

**ERA 835 underpayment finder (high defect, fixed).** The reviewer is a payment-posting specialist. On an independent 835 file written from the 005010 layout, the tool got sequestration, units and the deposit reconciliation (389.07 less 38.70 PLB) right. Selecting several files was broken. The files were joined, and separators were read from the first ISA only. A second payer's file with a different component separator lost every procedure code, so 0 of its 3 short lines were flagged. One with a different element separator was dropped entirely. `parseEra` now reads each interchange with its own ISA, and a test covers both cases. Still open: line-level denials on a paid claim (CO-97) never reach the denial list. A professional-component (-26) line is compared with the global rate. And 6 of 11 seeded bugs survived the tests.

**Therapy 8-minute rule calculator (medium defect, fixed).** The unit table matched CMS Claims Processing Manual ch. 5 §20.2 for every whole minute from 0 to 300, and all five of the manual's examples. The headline summed overbilled units only over visits where the per-code count is higher. Its dollars, though, were netted across all visits. On the example it said "3 more" units and "about $48.90". The visits that are actually overbilled come to $77.30. Other inputs printed a negative overbill. Fixed, with a test. Still open: the OT/SLP timed codes 97129 and 97130 are missing, and none of the CMS examples is a test.

**Business loan offer comparator (medium, partly fixed).** APRs for all four sample offers matched an independent Reg Z Appendix J solve to four decimals. A term shorter than one payment interval used to be stretched to a full interval. A one-month factor advance paid annually came out at 10% APR, not about 120%. That input is now rejected, and so are fees that take the whole amount (which used to print "NaN%"). The how-to guide said a 1.3 factor over six months is "more than double" the 12-month APR. The calculator's own ratio is 1.88 to 1.99, and the text now says so. Still open: terms that are not a whole number of payments are still rounded, and 4 of 6 seeded bugs survived.

**robofab-solreftimestep (research; high defect recorded, not fixed).** `run.py` reproduces `results.txt` byte for byte, and the friction bound recomputes by hand. The auditor also tested the `refsafe` clamp, which the README had left untested, and it holds. The trouble is what "fails" means. In 13 of 15 failing cells it is a creep of 2 to 4 mm that does not change with grip force, with contact kept, crossing a fixed 2 mm line. It is not a lost grasp. The recommended `solref` of 0.1 ms also creeps past 2 mm once the move lasts 0.2 s. That changes the method, so it is recorded in the README's Limitations with the audit linked rather than patched. The bisection that produces every ratio now has a test. The mutant that returned the failing bracket used to pass every test, and the new test catches it.

## What this round says

The same pattern as earlier census rounds: the arithmetic is usually right and the tests rarely catch a seeded bug. Here 19 of 36 seeded bugs survived. There were five high defects across four subjects. Three were errors a practitioner would hit in their first hour: a boundary read the wrong way, a profit figure called a wage, and a multi-file path no test exercised. The other two are the robofab study's slip criterion and its recommendation. Each fix in this PR comes with the test that would have caught it. A later round re-audits these subjects; their scores here stay as found.
