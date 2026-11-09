---
title: "How square must a ball-launcher wheel axle be? 0.75 degrees of stack against 3.5 allowed"
seo_title: "Ball launcher wheel axle tolerance stack: laser-cut plates, 5052 aluminium"
date: 2026-11-09
tags: [ventures, open-tennis-robots, cad]
description: "A tolerance stack for the open tennis-ball feeder's launcher head: assumed laser and spacer tolerances give 0.75 degrees worst case against a 3.5 degree plate-contact limit."
---

The open tennis-ball feeder's launcher head throws a 67 mm ball between two
spinning wheels, inside two 80 mm-apart laser-cut plates. The ball has 6.5 mm
either side, which the last slice turned into a 3.5 degree yaw limit between
the wheel axles and the plates.

This slice asks how far off square a normal build will be. Three terms: the
motor face not seating flat (0.23 degrees), the two bores not sitting exactly
opposite (0.47 degrees, mostly tab-and-slot play) and the plates not being
parallel (0.05 degrees). Worst case is 0.75 degrees, root-sum-square 0.53, so
the limit holds with 4.7 times to spare and no reaming is needed. A sloppy
build (4 mm slot play, 1 mm seat gap) drops below 1 times, so slot play is the
tolerance to watch.

Every tolerance is an assumption, and nothing is built. The first printed and
cut head should have its axle measured with a dial gauge, and the numbers in
`Feeder` replaced. Code: `Feeder.axle_squaring` in
`ventures/open-tennis-robots/cad/otr_cad/params.py`.
