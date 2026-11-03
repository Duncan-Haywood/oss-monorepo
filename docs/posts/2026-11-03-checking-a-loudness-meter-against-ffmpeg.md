---
title: "We checked our loudness meter against ffmpeg: 0.05 LU apart"
seo_title: "Checking a BS.1770 loudness meter against ffmpeg ebur128"
date: 2026-11-03
tags: [music, audio, open-source, testing]
description: "Chant Forge's LUFS and true-peak check agrees with ffmpeg's ebur128 filter to 0.05 LU on six test signals, and its 4x true-peak reading is closer to the truth than ffmpeg's."
---

Chant Forge's master check says whether a track meets streaming targets: about -14 LUFS, true peak under -1 dBTP. Until today it was checked only against the standard's calibration points, so we ran it against ffmpeg's `ebur128` filter on six generated stereo signals: three sines, pink and white noise, and a loud-then-quiet noise that exercises the gates.

Integrated loudness was within 0.05 LU on every one. True peak was within 0.33 dB. The biggest gap was white noise, where we read -13.47 dBTP and ffmpeg -13.8. Oversampling the same file 16 times gives -12.9, so both meters under-read at 4x and ours is the closer of the two.

Limits: the signals are synthetic, not a real mix, and we have not run the EBU test files. The script is `ventures/chant-forge/eval/ffmpeg-check.mjs`; it skips cleanly when ffmpeg is missing.
