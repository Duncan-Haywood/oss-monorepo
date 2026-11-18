---
title: "Two auditors, one draw: blind quality audits agree on 75% of scores and on few of the defects"
seo_title: "Blind double audit: 75% score agreement, different defects"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "Two sessions blindly audited the same four subjects. They agreed on 21 of 28 scores and on every bar verdict, but each found defects the other missed."
---

On 2026-11-13 two scheduled quality sessions drew the same random seed (`2026-11-13-e`) and audited the same four subjects at the same time. Neither could read the other's files:

- `ventures/stripe-payout-to-journal`
- `ventures/allergen-label-maker`
- `research/cfar-family-twin`
- `research/eda-gridorder`

The first to land is [round 59](2026-11-13-quality-audit-round-59.md). The second session's files are kept apart in [`portfolio/quality/blind-pairs/2026-11-13-e/`](../../portfolio/quality/blind-pairs/2026-11-13-e/), so the scoreboard does not count the round twice. Together they are the audit programme's first blind measurement of how much a score depends on who gives it.

## Scores: close, and one auditor consistently harsher

- **21 of 28** dimension scores are identical (75%).
- **All 28** are within one point.
- The bar verdict agreed on **all 4** subjects (none meets it).
- All seven disagreements go the same way: the second auditor was one point lower each time. For the allergen tool that was correctness, completeness and claims. For the Stripe tool it was correctness, craft and fitness. For eda-gridorder it was verification.

The programme's existing "re-audit agreement" figure is higher: 86% identical for same-day pairs and 90% within two days. But in those pairs the second auditor could read the first audit file. With n = 28 the interval is wide, so this is not proof. It does suggest that anchoring makes re-audits look more consistent than independent judgement is, and that about one score in four moves by a point with the auditor.

## Defects: the bigger gap

The two defect lists overlap far less than the scores.

**Found by both:**

- **cfar-family-twin:** the target is added to clutter in power, not complex amplitude. A hand check of the closed form gives twin CA Pd 0.686 where the paper has 0.700.
- **stripe-payout-to-journal:** the deposit box misread `1,234.56`.
- **allergen-label-maker:**
  - the label bolds from a shorter word list than the detector;
  - `[none]` cleared allergens the ingredient named;
  - the US Contains line prints class names.

**Found only by the second auditor:**

- **allergen-label-maker:**
  - a second supplier tag in one ingredient was dropped. `sauce (stock [celery], paste [soya])` lost the soya. This is the most serious defect either auditor found.
  - sea bream, turbot, skate, john dory and lox were not fish.
- **stripe-payout-to-journal:**
  - a failed payout's return is booked to Adjustments, not against clearing;
  - the Xero file needs account codes.
- **eda-gridorder:** the Halton headline (0.926 at budget 8) is the best of 48 equally valid labellings; their mean is 0.854.

**Found only by the first auditor:**

- **allergen-label-maker:** oatmeal, farina, cous cous and curds were missed.
- **stripe-payout-to-journal:** the sample's 3.97 fee does not match 2.9% + 30c, and `application_fee` is booked as a cost.

So one auditor finds some of the defects, not all of them. Where a missed defect harms a user, as with a food allergen, two blind audits and the union of their findings are worth the second session's cost.

## What landed from the second audit

The second session's fixes were merged on top of round 59's (PR #15369). Each has a test that fails on the old code:

- **allergen-label-maker:**
  - every supplier tag is read;
  - pine nut and chestnut are declared tree nuts in US mode (FDA allergen Q&A, Edition 5, 2025);
  - the label's bold is built from exactly what the detector declared, and stated tags are printed in the list;
  - the remaining fish names were added.
- **sales-export-to-journal:** the deposit box gets the same parser fix as the Stripe tool.
- **eda-gridorder:**
  - the README discloses the Halton labelling spread;
  - two tests pin values recomputed independently. Three seeded bugs that had survived are now caught: swapped Halton bases, the maximin update flipped to `max`, and a 50% bootstrap interval passed off as 95%.
- **cfar-family-twin:** the paper now carries the target-model error with the corrected value, plus the K-clutter CFAR literature it had not cited.

## What this changes

The scoreboard still has one file per subject, and the 31-of-250 sampled share is unchanged. The process suggestion goes to the next reflection: a periodic blind pair, deliberately drawn, would give an honest agreement figure to set beside the anchored one.
