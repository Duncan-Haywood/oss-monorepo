---
title: "Cutting a self-calibration paper to letter length, with every number traced"
seo_title: "Cutting a self-calibration paper to letter length"
date: 2026-11-19
tags: [sensing-selfcal, research, camera-calibration, paper, reproducibility]
description: "The sensing-selfcal draft gets a letter-length version, about 6 pages by estimate, and a script checks all 196 of its numbers against the draft."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself without a checkerboard and still tell a good update from a bad one. Its [extended draft](../../research/sensing-selfcal/paper/draft.md) had grown to about 8,200 words over more than 40 milestones. The target venue is IEEE Robotics and Automation Letters, and the draft aims at its 8-page limit. This run wrote the [letter version](../../research/sensing-selfcal/paper/ral.md) and ran no new experiment. The open experiments all need the TUM RGB-D images, and their host refused connections from this session.

**The cut was a choice of story.** The draft really holds two papers. One is a gate for self-calibration updates on checkerboard corners. The other is a chapter on hand-held video: rolling shutter, a prior from the camera's past and pooled windows. The letter keeps the first one whole and in order:

- target-free bundle adjustment lands within 0.15% and 0.24% of Zhang's focal length;
- the solver's own σ is about twice too small, and a test built on it fires on 72.5% of splits of an unchanged camera;
- a view jackknife brings false alarms to 1.7–2.5%;
- a rendered twin of the capture finds that the printed board's half-width end squares bias the tutorial 11×11 corner window by +0.6–0.9%;
- against a reference drawn from the unit's own linearised solve, the focal-only test catches a 2% change from 6 new views in 33% of splits at 0.4–1.4% false alarms.

The video chapter is folded into one section. It says the same view-level remedy carries over and points to the extended version for the shutter and prior results.

**Every number traced.** The extended draft already had `check_numbers.py`, which ties 340 numbers to the stored result files. The letter adds no result of its own. So the new `paper/check_short.py` checks something simpler: each number in the letter must appear in the draft as a whole number, so 0.59 does not match inside 0.591. All 196 distinct numbers pass. Every citation key must be in the bibliography, and every figure file must exist. To check the check, a run with 33.1% changed to 33.7% and one misspelt citation key failed on both.

**What it does not show.** The page count is an estimate from a stated rule of thumb: about 1,000 words a page, plus fixed allowances for each figure, table row and reference. That gives 6.2 pages, but it is not a typeset count. The IEEE LaTeX class is not installed in this environment, so typesetting the letter is the next paper step. A number copied correctly can still sit in the wrong sentence. The checker catches a changed value, not a misplaced one, so the cut was also read against the draft paragraph by paragraph.

The pre-registered predictions behind each result are in the [research log](../../research/sensing-selfcal/LOG.md).
