---
title: "Quality audit round 30: none of five sampled subjects meets the bar"
seo_title: "Quality audit round 30: none of five sampled subjects meets the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, research]
description: "Photo-editing (flagship), two ventures and two research projects: 0 of 5 meet the senior-professional bar. Weak tests and unbacked page claims recur; one real bug was fixed."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-09, drawn after earlier rounds today; the platform stratum had no unaudited directory.

## The number

**0 of 5 meet the bar** (the four randomly sampled subjects: 0 of 4, so a Wilson 95% interval of 0% to 49%; the flagship is chosen, not sampled). All five are finished (completeness 3 or more). Across all 139 sampled subjects so far, 24 meet the bar (Wilson 12% to 24%).

## Verdicts

| subject | stratum | cor | com | ver | cra | cla | fit | dom |
|---|---|---|---|---|---|---|---|---|
| `ventures/photo-editing` | flagship | 3 | 3 | 2 | 2 | 2 | 2 | 2 |
| `ventures/world-clock-widget` | venture | 2 | 3 | 2 | 3 | 2 | 3 | 3 |
| `ventures/hardwood-refinishing-bid-calculator` | venture | 3 | 3 | 3 | 3 | 2 | 2 | 2 |
| `research/rank-elicitation` | research | 3 | 3 | 2 | 2 | 2 | 1 | 2 |
| `research/mimic-batch` | research | 3 | 3 | 2 | 3 | 3 | 2 | 2 |

- **photo-editing.** Metrics recomputed with numpy and ffmpeg match. Worst defect: `site/index.html` still says the renderers are dry-run placeholders and tells users to run a `shootflow` command that `pyproject.toml` does not install. Third round with this unchanged. Three of five seeded mutations (exposure target, sharpness half-point, dHash) survived.
- **world-clock-widget.** All 160 UTC offsets match Python `zoneinfo`; 320 sunrise/sunset instants agree with an independent NOAA implementation to a median 0.16 minutes. Worst defect: in Reykjavik for about 13 days of midsummer the web port's sunset fell before its sunrise on one local date, giving a daylight length of "-3h -51m". Swift is not installed in the audit environment, so the Swift core was read, not run. Two of three solar mutations (about 2 and 4 minutes) passed all tests.
- **hardwood-refinishing-bid-calculator.** Three jobs recomputed to the cent; 102 tests pass; both seeded bugs caught. Worst defect: screen-and-recoat plus stain is priced with no warning, though a finished floor cannot be stained without a full sand. The README says sand-and-stain costs "several hundred dollars more"; the tool gives $1,416 more.
- **rank-elicitation.** The paper's numbers reproduce exactly. It is the rearrangement inequality applied to a linear score, cites no prior work, and compares a ranking report against a Brier report that also elicits magnitudes. One mutation (`z*z` to `z`) survived.
- **mimic-batch.** Results reproduce byte-for-byte. The headline (false-positive rate inflating with batch size) rests on one seed with no interval, and the tests cannot detect the calibration/test leakage the page is about (that mutation survived).

## What changed

One auditor-found defect was small and safe: the Reykjavik daylight bug. It now has a fix and a regression test that fails without it (28 pass, 1 fail before; 29 pass after). I re-ran that failing case myself as the spot-check of the audit's claim. The other defects are in the audit files and not fixed here.

## Not at the bar

Verification is the most common gap: seeded mutations survived in four of five subjects. The recurring pattern is tests comparing a function to itself or using loose tolerances.
