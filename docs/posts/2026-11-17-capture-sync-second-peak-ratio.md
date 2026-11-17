---
title: "Audio sync of cameras: the runner-up peak catches what peak sharpness misses"
seo_title: "Audio sync confidence: a second-peak ratio stops aliasing"
date: 2026-11-17
description: "A second-peak ratio cut wrong syncs on a repeating shared sound from 19-20% to 0-1% in 242,000 replayed windows. Typing heard by one mic is still unsolved."
tags: [research, capture-sync, audio-sync, multi-camera]
---

The [capture-sync](../../research/capture-sync/) programme asks how often a few seconds of sound can sync two free-running cameras or phones to within one video frame, and how a rig can tell when not to trust an estimate. Up to now its confidence score has been the peak-to-sidelobe ratio (PSR): how far the correlation peak stands above the average of everything else.

The previous step found a case PSR misses. When both devices hear a sound that repeats inside the search range, the correlation has two or three peaks of nearly the same height. In this corpus the repeating sound was a set of looped door-slam recordings. PSR still sees one tall peak over a low average, so it reports high confidence. A gate calibrated without shared noise let 19-20% wrong windows through.

The fix tested here is to compare the winner with the runner-up instead of with the average. The second-peak ratio is the highest correlation value more than one frame away from the peak, divided by the peak. Step 3f's 242,000 simulated windows were replayed, and every failure label and every earlier gate decision matched bit for bit. The same Learn-then-Test gate then ran with three scores: PSR, the margin (1 minus the ratio), and the two multiplied. All results below are for 2 s windows at -10 dB, with devices 3 m apart and a gate calibrated on independent noise:

- **The door loops stop getting through.** The margin passes 1.1% and 0.0% wrong among accepted door windows in the two rooms, against PSR's 18.8% and 19.8%. It keeps 51-56% of them.
- **No coverage cost elsewhere.** The margin gate keeps 68-69% of all shared-noise windows against PSR's 60-63%. Windows that were both wrong and accepted fall from 1.4-1.5% of the total to 0.0-0.1%.
- **Impulsive noise at one device is still unsolved.** With independent typing or munching at each device, the 2% bound holds for only 4-5 of 10 noise types whichever score is used. In those failures the wrong peak has no close rival. PSR actually ranks typing failures above successes (AUROC 0.25), and the margin is near chance (0.55).

Four of the seven predictions written before the run failed in full or in part, and the [log](../../research/capture-sync/LOG.md) records each one. The product score just missed 10 of 10 noise types in the drier room (door at 2.1-2.3%). Its grid was copied from PSR's and turned out to refuse too much, and that is reported as a post-hoc finding rather than corrected. The repeating sound is a corpus artefact (looped files), not a measured machine. The rooms are statistical and the delays simulated. The next step is a score that tests the wrong peak itself, for example agreement between two weightings or between sub-windows, followed by a check of the margin on real phone recordings. The full table is in the [README](../../research/capture-sync/README.md).
