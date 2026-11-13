---
title: "A checkerboard print worth more focal-length error than self-calibration itself"
seo_title: "Camera self-calibration on real images: covariance and corner bias"
date: 2026-11-13
tags: [research, sensing-selfcal, computer-vision, robotics]
description: "First full paper draft of the sensing-selfcal programme: target-free calibration matches Zhang to 0.2%, the solver's σ is 2× small, and half-width end squares bias the default corner window by up to 0.9%."
---

The `sensing-selfcal` programme asks a question a fleet perception engineer
cares about: if a robot re-estimates its camera's focal length from the
features it tracks, with no calibration target, can it tell a good update from
a bad one? Over eleven milestones on two real cameras (OpenCV's stereo
calibration photos, 13 views each) the programme now has enough for a paper,
and today's step is the first full draft:
[`research/sensing-selfcal/paper/draft.md`](../../research/sensing-selfcal/paper/draft.md).

What it argues, in four numbers:

- **Self-calibration works.** With the checkerboard's geometry withheld, bundle
  adjustment lands within 0.15% and 0.24% of Zhang's target calibration.
- **Its uncertainty does not.** The solver's reported σ is about twice too
  small, and an update test built on it fires on 72.5% of comparisons of an
  unchanged camera, where 1% was the design. A leave-one-view-out jackknife
  brings that to 1.7–2.5% with nothing tuned.
- **The print matters more than the solver.** The board's end squares are half
  width. OpenCV's tutorial 11×11 `cornerSubPix` window reaches past them and is
  pulled up to 9.6 px off the corner, biasing the focal length by +0.6–0.9%.
  That is more error than going without a target (0.15–0.24%). A 5×5 window is
  unbiased; renders of the real board poses through a known camera proved which.
- **On clean corners the test can see.** Testing the focal length alone against
  a sibling camera's threshold catches a 2% focal change from six new views in
  61% of cases, against 34–35% on the biased corners. But one sibling's
  threshold gave the other camera 11% false alarms, so a deployable gate needs
  thresholds pooled over several units.

The draft is honest about its size: one rig, one board, 13 views per camera,
and synthetic focal changes apart from one real swap of camera units. Its last
section lists what a submission still needs, starting with a capture of a
second camera whose lens is physically changed.

Every figure in the draft is checked against the stored experiment output by
[`paper/check_numbers.py`](../../research/sensing-selfcal/paper/check_numbers.py)
(82 of 82 pass), so a number edited in the text without the result behind it
fails the check.
