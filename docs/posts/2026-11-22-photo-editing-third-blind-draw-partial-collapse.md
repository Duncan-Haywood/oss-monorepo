---
title: "A third blind draw: the luma fix worked, and the noise read failed a different way"
seo_title: "Third blind HDR+ draw for a raw demosaic noise read"
date: 2026-11-22
tags: [photo-editing, raw, demosaic, noise, evaluation, open-data]
description: "Keeping the shipped luma ramp removed last draw's losses. Two new ones came from a noise read that finds almost no shot noise, below the fallback's line."
---

ShootFlow's raw developer blends an edge-following demosaic with a plain
bilinear one, and how far it leans each way depends on how noisy it thinks the
frame is. For files with no noise model it reads the noise from the picture.
Earlier today [two blind draws](2026-11-22-photo-editing-noise-read-two-blind-draws.md)
of Google's public HDR+ phone bursts showed that a better read, `mpcws`, gains
about 0.1 dB on average but leaves a few bursts more than 0.1 dB worse. The
second draw's losses all came from the luma ramp that went with it.

So the third question, written down before its bursts were fetched, changed two
things. It kept the luma ramp that already ships, and changed only the colour
ramp and the read. And it stopped counting a loss when the true noise level,
fed straight to the blend, loses on that frame too. A loss like that belongs to
the scene or the score, not to the read.

## What happened

We drew 240 bursts with seed 20261124, excluding every burst any earlier test
had used, and 137 could be scored. The new arm gained **+0.068 dB colour and
+0.102 dB luma** on average and made no new loser against plain edge-following.
It failed the last test on **2 bursts**, each about 0.13 dB worse on luma, so
by the rule nothing ships.

The luma change did its job. None of this draw's losses are from the ramp, and
the old arm, with its wider luma ramp, lost on four other frames of this same
draw.

The oracle allowance never came into play. The true noise level lost on one
burst, and the new arm did not lose there. Both of its losers are frames where
the truth *gains*.

## Why those two frames

On both, `mpcws` fitted a shot-noise slope of almost zero, so the noise it
reports at mid-grey is a third to a half of the real level. Told the frame is
cleaner than it is, the blend trusts the edge-follower too much, and the
edge-follower on its own loses 0.36 and 0.51 dB on those frames.

The fallback added last draw only fires when the read drops below a quarter of
the shipped read's level. These two sat at 0.45x and 0.55x, so it did not fire.

Raising the line to 0.6x would have cleared this draw: it fires on 10 of 137
scenes and costs nothing measurable on average. But that number was picked by
looking at this draw, so it proves nothing here. It is now written down as the
fourth question, for a fourth draw (seed 20261125) it has not seen.

## Where this leaves the read

Across three blind draws and 384 scored phone bursts, the read with its own
colour ramp gains roughly 0.07 to 0.08 dB colour and 0.10 dB luma over what
ships, and never adds a frame that plain edge-following beats. Every loss left
is either a read far below the truth or a ramp that doesn't match the read.
The defaults stay until a draw comes back clean.

The rule, numbers and per-burst rows are in
`ventures/photo-editing/eval/hdrplus-joint-check-j3-2026-11-22.md`, and the
tool is `ventures/photo-editing/tools/hdrplus_joint_check.py`. The HDR+ dataset
is Hasinoff et al., 2016, CC BY-SA 4.0.
