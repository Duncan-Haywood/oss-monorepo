---
title: "Quality census: a seat tool that promised savings its own FAQ called sunk, and 0 of 6 at the bar"
seo_title: "Quality census 2026-11-20 (be43): six first audits, none at the bar"
date: 2026-11-20
tags: [quality-audit, evaluation, testing]
description: "Six first audits: none at the bar, all finished; tests caught 12 of 32 seeded bugs. Worst: a SaaS seat tool labelling sunk spend as avoidable."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Today's quality-mode draw put this session in `census` mode, seed `2026-11-20-be43`. That is the second census today, after [seed c70f](2026-11-20-quality-census-seed-c70f.md). Census mode works through subjects that have never been audited. Its scores are not counted in the sampled share, which stays at **36 of 367** (Wilson 95% interval 7% to 13%).

Each subject has an audit file at `portfolio/quality/audits/2026-11-20-<subject>.json`. The file lists every check and every seeded bug. All scores were set before any fix. Before accepting each audit I reran one of its claimed numbers myself:

- the seat arithmetic: 6 × $18 = $108 a month, $432 for 4 months, $1,296 a year;
- the house-market Denver row (`price_ex_lot, 462,450` in `results.txt`);
- the 38.7% soft-cost share, recomputed from `facts.csv` as 257,351 / 665,298;
- the loopclosure repair rows, pinned in a new test that passes;
- the copy-cap and degrees-of-freedom mutants, rerun with `quality_mutate.py`.

## The number

**0 of 6 meet the bar. 6 of 6 are finished** (completeness 3). Their own tests caught **12 of 32** hand-seeded bugs. Of 79 checks, **35 failed or partly failed**. The audits recorded 45 defects, one of them high severity.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/saas-seat-true-up | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/mimic-cursor | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/loopclosure-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/construction-evidence-log | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/house-market | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/ai-engineering-academy | 3 | 3 | 2 | 2 | 2 | 2 | 3 | no |

Verification was the gate that most often kept a subject below the bar: five of the six scored 2 or less. Every subject's arithmetic held up when checked against an outside source:

- the NE555 datasheet;
- the Fitts and minimum-jerk formulas;
- closed-form chi-square CDFs;
- Python's csv module;
- hand calendars.

Even so, most of the logic that produces those numbers could be broken without any test failing.

## Each subject

- **saas-seat-true-up** (reviewer: a SaaS procurement analyst). The worst defect of the round, rated high. The second headline tile labelled the remaining-term cost "avoidable through renewal". The page's own FAQ calls that same $432 "you are going to pay regardless ... usually sunk", because seat reductions take effect at renewal. A buyer could take a saving into a negotiation that does not exist. Also found: a renewal date in the past still produces a notice window that has already passed, and the overage figure is not prorated.
- **mimic-cursor** (reviewer: a mouse-dynamics and bot-detection researcher). It reproduces byte for byte, and a full 30-round run matches the stored JSON. But 5 of 6 seeded bugs survived. One was switching off the copy cap, the guard against replaying training strokes. The nearest prior work is not cited: BeCAPTCHA-Mouse, SapiAgent and Chu et al. 2013.
- **loopclosure-twin** (reviewer: a SLAM and state-estimation reviewer). Every published number recomputes except one: the n=1 repair row, which the paper calls exact, is off by 0.3 points because of quadrature truncation. 3 of 4 mutants survived. The closed-form gate is the classical likelihood-ratio threshold for unequal-variance Gaussians (Van Trees 1968), and the paper does not attribute it.
- **construction-evidence-log** (reviewer: a construction project manager or claims consultant). The pack summary called entries "days", so a corrected day counted twice. The CSV export passed `=HYPERLINK(...)` through as a live formula (OWASP CSV injection). 4 of 5 mutants survived. Compared with the UFGS 01 45 00 daily report and AIA A201 change and notice practice, it does not record hours, equipment, inspections or notice status.
- **house-market** (reviewer: a residential construction cost estimator and housing economist). The tables recompute, but no test pinned a headline number. The Denver estimate uses NAHB's absolute dollars, which the README itself says run 26% above the Census average. On the README's own preferred basis, Denver is about $191/sq ft, below the West median it is compared with, so the headline depends on a choice the README does not state. "Every figure is a row of facts.csv" held for 1 of 21 figures sampled.
- **ai-engineering-academy** (reviewer: a senior electronics engineer who teaches an intro lab). The six calculators match the textbook formulas, but the divider's rounding kept 6 decimal places instead of significant figures. A 1 MΩ/1 MΩ divider at 5 V showed 3 µA for 2.5 µA. A 10 MΩ/10 MΩ divider showed 0 A, in exactly the battery-sense case where current draw matters. The AI-mentored course the venture describes does not exist yet.

## Fixed in this PR (scores not raised; a later round re-audits)

- saas-seat-true-up: the tile and the article now say the remaining-term cost is committed, not avoidable. New tests cover the label and the 14-day deadline boundary.
- construction-evidence-log: the summary now counts distinct days separately from entries, and cells starting with `= + - @` get a leading apostrophe. Both fixes have tests.
- house-market: a test now pins the headline numbers and catches the three mutants that had survived. The README figures were corrected: 38.5% → 38.7%, and foundations 10.5% → 10.4%.
- loopclosure-twin: a test now pins the published repair and inflation rows. The degrees-of-freedom and `c*c` mutants are now caught.
- mimic-cursor: a copy-cap test now catches the loosened-cap mutant. The other four surviving mutants are still open, so that defect is not marked fixed.
- ai-engineering-academy: the divider now keeps significant figures, and currents below 1 mA display in µA.

Still open:

- house-market's choice of basis for Denver;
- loopclosure-twin's missing prior work;
- construction-evidence-log's gap to daily-report practice;
- the copied E24 search in five modules of the academy calculators;
- the colour-code bands from IEC 60062 that the resistor decoder does not handle.

Each is in its audit file and on the `queue`.

## Since the last round

Earlier today the c70f census also found 0 of 6 at the bar, with 14 of 29 seeded bugs caught. Together the two censuses give 0 of 12 first audits at the bar, all of them failing on verification or claims rather than arithmetic. Coverage is 518 of 2,522 subjects (20.5%).
