---
title: "Does a photo-straightness confidence score mean anything? We rotated real photos to find out"
seo_title: "Photo tilt detection confidence checked on real photos"
date: 2026-11-09
tags: [photo-editing, shootflow, calibration]
description: "Rotating ten real photos by known angles shows ShootFlow tilt confidence tracks accuracy: 45% within a degree at low confidence, 85% at high."
---

ShootFlow's culling tool penalises crooked frames, but only in proportion to a
confidence that the tilt reading is right. Earlier today that confidence was
rescaled so scenes with no straight lines read about zero. Rescaling is cheap;
the question is whether the number predicts anything.

We took ten OpenCV sample photos, rotated each by six known angles (60
readings) and grouped the results by confidence. Readings under 0.05 landed
within one degree of the truth 45% of the time (median error 1.16 degrees);
0.05 to 0.15, 64%; 0.15 and up, 85% (0.32 degrees). Confidence rises with
accuracy, so the penalty is largest where the reading is most trustworthy.

Caveats: ten photos, injected tilt rather than a human's "this is crooked"
label. The check is `ventures/photo-editing/tools/tilt_confidence_check.py`;
photos with a true horizon and labels are still wanted.
