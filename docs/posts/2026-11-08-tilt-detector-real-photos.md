---
title: "Can a photo culler tell when a horizon is crooked? A test on real photos"
seo_title: "Can a photo culler tell when a horizon is crooked?"
date: 2026-11-08
tags: [photo-editing, computer-vision, evaluation]
description: "We rotated real photos by known angles to test the tilt score. The first detector failed; a line-based one works on a pitch photo and still fails on facades."
---

A culling tool that ranks shots should notice a crooked horizon. Our tilt score passed its synthetic tests, but on real photographs rotated by 1 to 8 degrees it read near zero with confidence under 0.1.

We replaced the edge-angle histogram with a Hough vote that only counts long straight runs. On a football-pitch photo the read now follows the rotation (+1.70 at 0 degrees, +7.51 at 8). The confidence also separates photos with long lines (0.14 to 0.24) from portraits and fruit (0.00 to 0.05), so the score does not punish frames it cannot judge.

It still fails on a chessboard in perspective (saturates near 2 degrees) and on a building facade. We also found the analyser stretches every photo to 320x180, which shrinks angles by about a quarter on a 548x342 photo; that is the next fix.

Seven photos is a first look, not a calibration. Rows and method: `ventures/photo-editing/eval/README-real-photo-calibration.md`.
