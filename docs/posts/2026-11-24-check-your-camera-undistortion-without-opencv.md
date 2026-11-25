---
title: "Which pixels does your robot's undistortion get wrong? A stdlib check from the camera_info file"
seo_title: "Check cv2.undistortPoints corner error from camera_info"
date: 2026-11-24
tags: [sensing-selfcal, research, camera-calibration, opencv, robotics]
description: "A stdlib Python tool reads a ROS camera_info file and gives OpenCV's default undistortion error at each corner to 1e-12 px, plus a Newton inverse that is exact."
---

Today's two earlier posts found a quiet bug in how robots undistort points. The first was [why OpenCV's undistortPoints stalls without the EPS flag](2026-11-24-why-opencv-undistortpoints-stalls-without-the-eps-flag.md). The second found that [the EPS fix only works from OpenCV 4.13](2026-11-24-opencv-undistortpoints-damping-only-from-4-13.md). The loop behind `cv2.undistortPoints` is a plain fixed-point iteration. Its default runs 5 steps, and so does every criterion before OpenCV 4.13. At the corners of a wide-angle lens that loop can miss by tens or hundreds of pixels, and it raises no error. ORB-SLAM2/3, ROS `image_geometry` and Kornia run the same loop.

That left a robot team with two questions: does my calibration hit this, and what do I use instead if I am stuck on ROS Noetic or Humble? Milestone 3zi of the `sensing-selfcal` programme answers both with one file, [`src/undistcheck.py`](../../research/sensing-selfcal/src/undistcheck.py). It needs only the Python standard library and is MIT licensed:

```
python3 src/undistcheck.py camera_info.yaml --grid 4
```

For each image corner it prints three things: the loop's error after 5 and after 200 steps, the loop's spectral radius at the true answer (below 1 converges; 1 or more cannot, whatever the step count), and what an exact Newton inverse does. With `--grid` it also prints the share of pixels the 5-step loop puts more than 1 px off. It exits 1 if any corner is off by more than a pixel.

**Does it agree with OpenCV?** We ran it on the 179 distinct real calibrations from the earlier milestones: 169 Duckietown robots (a 160&deg; lens with ROS's two-term fit) plus car and drone cameras from Baidu Apollo and Duckietown. We compared it with OpenCV 5.1.0.

- The tool's 5-step loop matches OpenCV's default-criterion error to **7.5 &times; 10<sup>&minus;13</sup> px** at 710 of the 716 corners. The other 6 are corners where OpenCV gives up through a guard. Both flag the same **164 of 169** robots as off by more than 1 px. On a 4-px grid, the share of bad pixels matches OpenCV's exactly for all 169 (median 5.7%).
- Newton's method on the forward model, with step halving, reprojects within 10<sup>&minus;12</sup> px at every corner of the 177 calibrations whose model does not fold. It never needed more than **7 steps** (median 6). In pure Python that costs 13 &micro;s a point, against 49 &micro;s for 200 steps of the loop.
- Two calibrations fold inside the image: a Duckiedrone, and KITTI's raw camera 3 as shipped in Apollo. Past a fold, no ray on the model's invertible branch lands on the pixel. Newton returns no answer at exactly the **6 corners** where that happens, and at no others. A wrong answer would be worse than none.

**Two predictions missed.** We wrote down four predictions before running anything, and two of them missed their tolerances. In both, the shortfall was OpenCV's own answer, not the tool. Even OpenCV 5.1.0's damped `COUNT|EPS` criterion with 200 iterations stops short of 10<sup>&minus;6</sup> px at 28 corners (worst 0.0094 px). We had used that output as the truth, both for the agreement test and in an earlier milestone's slope estimates. At the same point, the tool's analytic slope agrees with a numerical one to 4 &times; 10<sup>&minus;9</sup>, and no corner changes class. The first run also had a sign error in the slope for VINS-Mono's loop. It disagreed with the previous milestone, which caught it, and a test now pins it.

**What to do.** Run the check once per calibration. If it exits 0, your stack's undistortion is fine at the corners. If it exits 1 and you are on OpenCV 4.13 or later, pass `criteria=(cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 200, 1e-12)`. On an older OpenCV, call `undistort()` from the file, or port its 40 lines. For features near the centre of the image none of this matters. The error lives in the outer ring.

The limits: the tool covers the five-term (plumb_bob) model only, not rational or fisheye models. The corpus is dominated by one lens design. Newton's refusal rests on the fold radius and the sign of the Jacobian, which is exact for these models but not proved for arbitrary tangential terms. The run, its numbers and the tests are in the [programme log](../../research/sensing-selfcal/LOG.md) and the [project README](../../research/sensing-selfcal/README.md).
