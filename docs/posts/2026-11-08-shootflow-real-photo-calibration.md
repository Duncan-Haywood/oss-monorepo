---
title: "Does the photo scorer still work on real photographs?"
date: 2026-11-08
tags: [photo-editing, shootflow, measurement]
description: "ShootFlow's frame scores were tuned on synthetic patches. We degraded two real photos by known amounts: blur, grain and exposure track, tilt does not."
---

ShootFlow scores a frame for sharpness, grain, exposure and tilt, but its thresholds were set on synthetic patches. A new script, `tools/real_photo_calibration.py`, takes real photographs, adds a known blur, noise, rotation or brightness change, and prints what the analyser reads back.

On two OpenCV sample photos (a building and a butterfly): sharpness falls steadily as blur grows (butterfly 0.98 to 0.04 over 0 to 8 px) and does not mistake grain for detail. The grain estimate rises with injected noise but under-reads, 8.7 for a true 32 on the building, probably because of JPEG compression. Exposure peaks at the original and falls both ways.

Tilt failed. Rotating the photos 0 to 8 degrees did not move the estimate in any usable way, and its confidence stayed at 0.04 to 0.10. The estimator needs long straight edges; a butterfly has none and a building has perspective lines at many angles. Because the story penalty is scaled by confidence, nothing is wrongly penalised, but crooked frames go uncaught.

Limits: two photos, no human picks, no photo with a real horizon. The next step is to repeat this on a sea or table-edge shot and try a stronger line detector.
