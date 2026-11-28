---
title: "Re-audit: the clothing studio's pattern now passes its own spec sheet"
seo_title: "Does your T-shirt pattern match your tech pack spec? A graded check"
date: 2026-11-28
tags: [quality-audit, evaluation, testing, clothing-design-studio]
description: "Measured off the drafted pieces, the clothing studio's tee, long sleeve, crewneck and hoodie patterns pass the tech pack spec in all 24 garment-size pairs."
---

The [clothing design studio](https://marisstella.app/clothing-design-studio/) drafts a knit
block (front, back, sleeve, now a neckband) for a tee, long sleeve, crewneck or hoodie in six
sizes. It also prints the measurement spec the tech pack sends to the factory. The
[2026-11-22 audit](../../portfolio/quality/audits/2026-11-22-clothing-design-studio.json) found
that these two disagreed. A sample sewn exactly to the studio's pattern failed the studio's own
spec on across-shoulder in 5 of 6 sizes and on neck width in 5 of 6. The sleeve was 22 cm in
every size. That cost the subject the quality bar. This re-audit
([audit file](../../portfolio/quality/audits/2026-11-28-clothing-design-studio-reaudit.json))
checked all eight of that audit's defects against the code as it stands today.

**The high defect is closed, and the studio now meets the bar.** The spec sheet reads its
shoulder and neck figures from the same block function the pattern draws from, so agreement
there could be circular. I didn't use that field. I measured each drafted front piece directly
instead: neck width from the highest point of its stitch line, across-shoulder from its shoulder
notch. All 24 garment-size pairs are inside the spec's own tolerances (neck 0.5 cm, shoulder
0.8 cm, sleeve 1 cm).

| tee, regular fit | XS | S | M | L | XL | XXL |
|---|---|---|---|---|---|---|
| neck, pattern / spec (cm) | 16.72 / 16.7 | 17.36 / 17.4 | 18.00 / 18 | 18.64 / 18.6 | 19.28 / 19.3 | 19.92 / 19.9 |
| across shoulder, pattern / spec | 40.00 / 40 | 44.00 / 44 | 47.40 / 47.4 | 49.16 / 49.2 | 50.92 / 50.9 | 52.68 / 52.7 |
| sleeve, pattern / spec | 19 / 19 | 20 / 20 | 21 / 21 | 22 / 22 | 23 / 23 | 24 / 24 |

## What changed since 2026-11-22

- **Grading.** Above M, the grade for each 8 cm chest step is now neck +0.64, across-shoulder
  +1.76, armhole depth +0.96, bicep +2.0 and sleeve +1.0 cm. Common knit-top grade charts use
  similar steps. Before, neck, shoulder and armhole all scaled with the chest, about twice
  those steps, so an XXL armhole came out around 3 cm too deep. The steps are typical figures,
  not a standard, and the page says so. A factory's own grade rule replaces them.
- **Neckband.** The tee, long sleeve and crewneck now include a folded rib neckband cut to
  0.85 of the whole neck seam. I measured 0.850 in every size.
- **Tests.** Three seeded bugs left all 734 tests green last time. Each now fails a test:
  the neck ratio, a size-run boundary moved off its midpoint, and run-cost cloth taken without
  body length. I also seeded two new bugs into the grade rule (the armhole step and the
  neckband ratio), and tests caught both. The suite now has 761 tests, all passing.
- **Page and tracking.** The pattern page no longer says "no rib" next to the rib option. All
  53 pages carry the disclaimer and usage tracking.

The arithmetic I checked by hand last time still matches: fabric weight conversion,
kilos to order, shrinkage cut size, and cloth uplift.

## What is not at the bar yet

- **Uneven shoulder grade below M.** In regular and slim fit, the block keeps at least 4 cm
  between the shoulder point and the side seam at the chest line, and that limit caps the XS and
  S shoulders. As a result, across-shoulder grows 4.0 cm from XS to S and 3.4 cm from S to M,
  then 1.76 cm per step above M. The pattern prints a note in those sizes and the spec sheet
  prints the same figures, so the factory gets no contradiction. A grader would still even
  this out before cutting a sample set.
- **Cutting plan allowance.** The rectangle cutting plan adds 1.5 cm on every edge. The
  pattern cuts 1 cm seams and a 2.5 cm hem. A body box comes out 1 cm wider and 0.5 cm shorter
  than the cut piece.
- **Code craft.** The same `num` range check is defined in 28 modules, and nine lines run
  past 300 characters. Craft stays at 2 of 4.

Scores: correctness, verification and claims 3; completeness, fitness and domain 3; craft 2.
That meets the bar: the three gating dimensions are all 3 and the median of the seven is 3. The
block is still drafted from typical ratios and has never been checked on a real sample. Cut a
test garment before production.
