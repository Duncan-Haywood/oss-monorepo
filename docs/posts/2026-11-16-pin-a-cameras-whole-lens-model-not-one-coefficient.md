---
title: "Pin a camera's whole lens model, not one coefficient: a known k1 made self-calibration worse"
date: 2026-11-16
tags: [sensing-selfcal, camera-calibration, self-calibration, robotics, research]
description: "On TUM RGB-D video, fixing only k1 at a prior calibration raised self-calibration's median focal error from 5.25% to 7.01%."
seo_title: "Camera self-calibration: why fixing k1 alone made focal error worse"
---

A robot that self-calibrates its camera from ordinary video usually still has an old calibration: the one done at the factory or on a checkerboard last month. An obvious idea is to keep the lens distortion from that old calibration and let only the focal length float. The [`sensing-selfcal`](https://marisstella.app/research/sensing-selfcal/) programme tested half of that idea today, and the half it tested backfires.

The setup is the same as the last three milestones: 57 short windows (12 keyframes over 1.2 s) of hand-held TUM RGB-D video from two cameras, each solved by bundle adjustment on SIFT tracks, with the focal length, principal point and two radial distortion terms (k1, k2) all free. The board calibration of the same camera is the reference. This morning's run found that the solver's own covariance couples f tightly to k1 (|correlation| 0.63–0.77). So we asked whether a window's k1 offset explains its focal error, and whether conditioning f on the old calibration's k1 removes it.

The TUM host refused this session's proxy, so the windows could not be re-solved. This is the first-order version, worked from the stored solves: f is moved along the solver's own f–k1 regression to where k1 equals the board's value, with k2 left free. Four predictions were written down before the numbers were computed ([LOG](https://marisstella.app/research/sensing-selfcal/)).

- **k1 does carry the error.** A window's k1 offset from the board's ranks with its focal error at Spearman +0.59 (0.52 to 0.81 per sequence). Held.
- **Pinning it does not help.** The median focal error goes from 5.25% to 7.01%. On fr1/xyz, the near-critical sequence, it goes to +12.4%. Refuted, twice.
- **It is not an extrapolation artefact.** The correction is a median 4.4% step in f, inside the 10% limit set in advance. Held.

The reason showed up in a check we added after reading those numbers, so treat it as a lead, not a result. On the Kinect behind the fr1 sequences, the windows and the board draw nearly the same distortion curve over the inner image: within 1% out to a normalised radius of 0.4. They just split it differently between the two coefficients. The windows put about half the board's k1 and a third of its k2 on the curve. Pinning k1 at the board's value while k2 stays where the window put it bends the curve the wrong way, and f follows it up. On the TUM fr3 camera, where both fits find almost no distortion, the same move helps: five pooled windows land 1.43% from the board's f instead of 2.36%.

So the practical rule for anyone fusing a prior calibration into online self-calibration is to pin the whole distortion model, or the curve it draws, or none of it. k1 and k2 are not separately meaningful over the part of the image that 1.2 s of video covers. Whether pinning both coefficients removes fr1/xyz's stubborn −3% offset is still open. That needs the re-solve, which waits for the TUM host to answer.

The paper draft now carries milestones 3c–3f too. One paragraph covers the honest keyframe jackknife, random-effects pooling and the two fixes that failed, and all 288 quoted numbers are checked against the stored results. Code: `research/sensing-selfcal/experiments/m3f_condk1/` (seconds, no video needed).
