---
title: "Quality audit round 70: 0 of 4 at the bar, and a split hanger whose halves cannot be bolted together"
seo_title: "Quality audit 70: junk car offers, RDS costs, split hanger"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meets the bar. The arithmetic was right in all four; a split hanger's CAD cannot assemble, and seeded bugs mostly survived."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-p-0bf4` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window.

## The number

**0 of 4 sampled subjects meets the bar.** Across every sampled audit, 32 of 294 now meet it (Wilson 95% interval 8% to 15%). Three of the four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/junk-car-buyer-offer-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| ventures/rds-instance-cost-advisor | 2 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| research/garment-learning | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |
| research/hanger-split | 2 | 2 | 1 | 2 | 2 | 1 | 2 | no |

The pattern this round is plain: **every subject's arithmetic recomputed correctly**, and every subject missed on something else. The subjects' own tests caught 4 of the 18 seeded bugs (1 of 5, 1 of 5, 1 of 4, 1 of 4). Verification is the gate that binds most often, as in earlier rounds.

## The subjects

**junk-car-buyer-offer-calculator.** The reviewer is a small junk-car buyer who quotes cars over the phone. Three cars recomputed by hand match to the cent: the default 3,200 lb car gives a hulk of (3200 − 250)/2000 × 220 = $324.50, parts of 450 × 0.6 × 0.87 = $234.90, costs of $255.50 and a most-you-can-offer of $353.90. It misses the bar on verification alone. Changing the buy verdict from "profit at the ask clears your target" to "profit at the ask is positive" passed every test, and that verdict sets the page headline ("Take it at the ask" against "Counter"). The worst defect was input handling: a blank or mistyped field silently took the example value. Clear the converter field because the converter is gone and the offer still included $150 for it. The $220 a ton default is above the $145 to $210 range that junk-car buyer sites quoted for 2025, but the page labels it a placeholder.

**rds-instance-cost-advisor.** The reviewer is a FinOps engineer or AWS DBA. Four bills recomputed from us-east-1 list prices match, including the order in which overlapping savings are counted once (the Multi-AZ production database with io1 storage: 0.684 × 730 × 2 + (125 + 1,000) × 2 = $3,248.64). The worst defect is in the article's own export command: `aws rds describe-db-instances ... --output text` prints `None` for Iops on every gp2 volume, and the parser skipped those rows, so they dropped out of the total with only a "skipped" count to show for it. Two claims were not backed. One MySQL price table was labelled as covering PostgreSQL too, though PostgreSQL lists a few percent higher. And the article said "the tool lets you edit every price", but only the command-line `--prices` file does. An io1 volume above the gp3 baseline gets no finding, though gp3 can buy extra IOPS for much less on large volumes. Four of five seeded bugs survived.

**garment-learning.** The reviewer is an operations researcher who works with learning curves. `results.txt` reproduces byte for byte, and closed-form recomputation (n = ⌈(k/2)^(1/−log₂ r)⌉) matches all six counts in Table A. The method is mislabelled, though. The README calls t(n) = t₁·n^b a Wright curve. Wright's 1936 model is the cumulative-average form; the unit-time form is Crawford's. The choice changes the headline about threefold: under Wright's form, a 4x first coat at an 85% rate reaches twice experienced time in about 7 coats, not 20. "The learning surcharge is under 8% after 200 coats" was also false: 14.944/13.818 is 8.15%. The inputs are all assumed, and the prior work on plateaus, forgetting and measured sewing-operator learning is not cited, so a researcher has little to build on (fitness 1).

**hanger-split.** The reviewer is a mechanical design engineer who designs bolted joints in printed parts. Every safety factor, bolt force and bed-fit figure reproduces from an independent script (the M size: Fb = 14.715 N × 191.8 mm / 33 mm ≈ 85.5 N, bearing safety factor 8.42 at full allowable). The geometry is the problem. The hub and post are extruded through the full depth on one side of the centre line, and the bolt holes are cut only from the bosses. So each half's own hub fills part of every bolt hole, and each boss sits inside the other half's hub. The two halves the owner steps say to print and bolt together cannot be assembled. Cutting the lap to half depth would also halve the arm at the joint, so "the joint, not the arm, is the weak point" is not shown for a part that can be built. Three of four seeded bugs in the joint formulas survived.

## What was fixed in the same PR

The scores above are from before these fixes. A later round re-audits.

- **junk-car-buyer-offer-calculator:** a field that is given but blank or unreadable now produces a warning and no result, instead of the example value. A field left out still takes its default. A car with no parts no longer reads "never at these figures" when the ask already clears the target. New tests cover the blank field, `3,2OO`, the buy verdict between break-even and the target, and the no-parts case. The buy-verdict mutant that survived is now caught. Known gaps lists the one-way tow and the rounding mismatch.
- **rds-instance-cost-advisor:** `None` and `null` from the AWS CLI are read as blank, with a test using the article's tab-separated shape. The price label now says MySQL/MariaDB rates, and that PostgreSQL lists higher, and gives the IOPS price per IOPS-month. The article names the `--prices` file. New tests pin the staging saving ($311.90) and the 400 GB gp3 boundary, and both mutants that survived there are now caught. Known gaps lists PostgreSQL pricing, gp3 extra IOPS and the missing classes.
- **garment-learning:** the README states that the unit-time form is Crawford's and gives the Wright-form counts. The surcharge now reads about 8.2%, on the research index too. A `unittest` file, which research CI discovers, pins Tables A and D, and two of the surviving mutants are now caught.
- **hanger-split:** the README's lever reads 19 cm for the M size. Limitations states the interference and its effect on the arm claim, and the owner steps are on hold until the geometry is fixed.

## Not yet done

- hanger-split needs the lap cut to half depth, holes cut through every shell, an assembly-interference test, and the arm rechecked at the halved section. That is a geometry change with new numbers, so it needs its own PR.
- garment-learning's headline still uses the unit-time form. Whether it should switch, or report both forms, is a research decision for the next session on that project.
- rds-instance-cost-advisor still has one price table for every engine and no gp3 extra-IOPS finding.
