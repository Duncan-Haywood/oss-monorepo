---
title: "Quality audit round 112: 0 of 2 sampled at the bar; a CIS refund that ignored the statements"
seo_title: "Quality audit 112: 0 of 2 sampled; CIS refund bug"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 2 sampled ventures meet the bar. The UK CIS calculator's tax bands are right, but its refund ignored the deductions on the user's statements."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is two `2026-11-26-*` files with seed `2026-11-26-f-9914` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `uk-cis-deduction-refund-calculator` and `christmas-tree-farm-profit-planner`. Each lists every check and every seeded bug. Scores were set before any fix.

The round ran in mode `sample`. No flagship was due (all were audited in the last seven days), no platform directory was outside its 90-day window, and research is paused, so the draw was two ventures, neither audited before.

## The number

**0 of 2 randomly sampled subjects meet the bar.** Across every sampled audit, 39 of 441 now meet it (Wilson 95% interval 6% to 12%).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/uk-cis-deduction-refund-calculator | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/christmas-tree-farm-profit-planner | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Against the code as audited, the tests caught 4 of 7 seeded bugs: 1 of 3 in the CIS calculator, 3 of 4 in the tree planner.

## Each subject

**UK CIS deduction and refund calculator.** The reviewer is a UK accountant who files Self Assessment for construction subcontractors. The tax engine is right. By hand against HMRC's 2025/26 rates: income tax on £110,000 (allowance tapered to £7,570) is £33,432, and Class 4 is £3,456.60. On £150,000 the tax is £53,703, made up of 37,700 at 20%, 87,440 at 40% and 24,860 at 45%. The sample bill is £6,351.80. The tool printed all of these. The worst defect is in the number people come for. The page asks for "CIS deducted per your statements", but the refund was always worked from 20% of labour. On the sample, statements showing £7,000 still gave a £2,048.20 refund. The amount you can actually reclaim is £6,351.80 − £7,000 = £648.20. The tool's own warning told users to "claim on what the statements show", and its headline did the opposite. Two of three seeded bugs survived: the 45% rate cut to 40%, and the payments-on-account line moved from £1,000 to £10,000. This is construction software, the vertical the portfolio ranks first, so a free front-door tool that gets the refund wrong costs trust where it matters most.

**Christmas tree farm profit planner.** The reviewer is an agricultural extension farm-management specialist who writes enterprise budgets. The cash flow recomputes exactly from the defaults. Sellable trees are 1,400 × 0.75 × 0.9 = 945 an acre, at a blended price of $42.80. One acre's cycle returns $27,466. Year 1 is −$17,800, and year 9's revenue is $80,892. The worst defect is an input that did nothing. "Equipment life (years, for the per-acre figure)" fed a variable nothing read. A 20-year plan with a 12-year life therefore never bought a second set, and the per-acre figure the label named explicitly excludes equipment. The method gap a specialist would raise first is harvest timing. Each block is cut in a single season and never replanted, whereas growers cut a planting over two to four seasons and replant behind it. The NPV formula had no test pinning it: moving the discount exponent by a year left every test green.

## Fixed in this round's PR

- The CIS refund now credits the statements' figure when one is entered and falls back to 20% (or 30%) of labour when it is blank. New tests pin £648.20, the 45% band and the £1,000 line. Both mutants that survived the audit now fail.
- The tree planner now buys equipment in year 1 and again each time its life runs out (years 1 and 13 on a 12-year life). The label says so, and a test checks NPV against a hand-discounted value. The harvest pattern is now listed in the README's Known gaps.

The scores above are from before these fixes. A later re-audit will score the fixed code.

## What has not changed

Verification is still the weakest dimension across the corpus (152 of 637 audits at 3 or more). Both subjects this round had the same habit: tests pinned the sample's numbers and left the branches the sample never reaches, the top tax band and the second purchase of equipment, unchecked.
