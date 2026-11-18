---
title: "Most of the solar boat's 2025 sun-correction lead was a decade offset; only the ±3% clamp kept it"
seo_title: "Solar USV sun correction: a stale climatology test"
date: 2026-11-18
tags: [research, marine-hull]
description: "Rescoring 2025 against a 2005 to 2014 sun climatology, the learned corrections' lead mostly vanished. Only a ±3% clamp stayed ahead of no correction."
---

[Yesterday's step](2026-11-17-marine-hull-solar-boat-2025-out-of-sample.md) of the [marine-hull programme](../../research/marine-hull/README.md) scored the solar survey boat's sun-correction rules on 2025. That year was new to all of them. The narrow corrections kept their lead over planning on the plain climatology: about 5 to 6 of 84 cases. The wide ones lost theirs.

That test had a flaw. The 2025 corrections learned from 2020 to 2024, and those years were also part of the 2015 to 2024 climatology. So they had little offset to learn. The in-sample corrections learned from 2005 to 2013, outside the climatology, where a decade-level difference was there to find. The two columns were not built the same way.

**The fix.** We built the climatology from 2005 to 2014 instead. Now 2025's learning years lie outside it, as the in-sample ones did. As a reference under the same design we also scored 2020 to 2024. We wrote eight predictions into the script and committed them before the full run. Seven held.

**What changed.** Against the old decade, 2025 sunlight is 1.4% above climatology over the 30 ocean points. The learned month ratios pick that up: the self-set clamp's width rises from 0.031 to 0.037. Here is each rule's gain over no correction in 2025, with three seasons of log, out of 84 cases:

| rule | climatology 2015 to 2024 (6zzze) | climatology 2005 to 2014 (6zzzf) |
|---|---|---|
| ±3% clamp (C03) | +6.3 | +5.0 |
| band-pooled cosine (HR) | +6.3 | -0.4 |
| spread clamp (AP) | +5.2 | +0.4 |
| √k-scaled clamp (AK) | -6.3 | -10.9 |
| k-scaled clamp (A1) | -9.2 | -13.1 |
| ±15% clamp (C15) | -9.3 | -13.2 |

The prediction that failed was the one we cared about most. AP's lead did not grow once its learning years could see the offset. It collapsed to almost nothing. Most of yesterday's lead for AP and HR came from how the test was built, not from the rules.

**Only the ±3% clamp held.** Across the twelve scored-year rows of the two designs, the ±3% clamp beats no correction in every one. Its smallest margins are +0.9 and +1.5 cases. AP drops below no correction in two rows and HR in three. That is a reading made after the run, and the rows share years, so it is a lead to test next rather than a law. Even so, it narrows the designer's advice to one line. Correct the climatology by the boat's own learned month ratios, clamped to about ±3%, and never open the clamp wide.

**What it does not say.** Per point on the real hull, no correction is still the best single rule in 2025 (79 of 120 cases). Everything here is one boat with a 50 W payload, a calm-water daily model and NASA POWER sunlight. One side effect is also worth stating. The set of "high-amplitude" points is picked by measuring against the climatology, so the old decade picks five points instead of nine. Those pooled counts are not comparable with yesterday's, and no prediction used them.

Results: [`results_old_clim_2025.txt`](../../research/marine-hull/experiments/results_old_clim_2025.txt). Code: [`run_old_clim_2025.py`](../../research/marine-hull/experiments/run_old_clim_2025.py). Log: [`LOG.md`](../../research/marine-hull/LOG.md).
