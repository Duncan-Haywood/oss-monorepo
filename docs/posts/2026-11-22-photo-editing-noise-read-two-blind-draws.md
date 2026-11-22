---
title: "Two blind draws of phone bursts: a better noise read gains 0.1 dB and still doesn't ship"
seo_title: "A demosaic noise read tested on two blind HDR+ burst draws"
date: 2026-11-22
tags: [photo-editing, raw, demosaic, noise, evaluation, open-data]
description: "A noise read with its own blend ramps gained about 0.1 dB on 247 fresh HDR+ bursts but lost on 5: two collapsed reads and three ramp misses."
---

ShootFlow's raw developer blends two demosaics: an edge-following one where the
picture has detail, and a plain bilinear one in flat, noisy areas. Where each
goes depends on how much noise the developer thinks the frame has, and for files
without a noise model it reads that from the picture.

Earlier today a [ramp refit](2026-11-22-photo-editing-ramps-tuned-to-a-wrong-read.md)
on Google's public HDR+ bursts found that the noise read and the blend's
thresholds (the "ramps") are one calibration. A read that measures the noise
more accurately, `mpcws`, looked worse only because the ramps had been tuned
for a read that measures too low. Put each read on ramps picked for it, and the
case for `mpcws` got stronger. So this run asked the obvious question, with the
rule written down before any burst was scored.

## The test

We drew 240 bursts at random (seed 20261122) from the full 3,640-burst HDR+
set, leaving out every burst earlier work had used. Each burst gives a raw
reference frame and a merge of the whole burst, so the reference minus the merge
is the frame's own sensor noise and the merge serves as ground truth. The
candidate, `mpcws` on its refit ramps, had to pass four tests against what ships:
no average loss, no loss in any noise third, at least +0.02 dB luma, and **no
single burst more than 0.1 dB worse**.

## Draw one: 125 bursts, two losers, and a read that gives up

The candidate gained +0.076 dB colour and +0.084 dB luma on average and created
no new losses against plain edge-following. It failed the last test on two
bursts, one of them by 1.7 dB.

Both losers were frames where `mpcws` read essentially zero noise. With zero
noise the blend trusts the edge-follower everywhere, so the output became the
plain directional demosaic. The frames were a night scene and an indoor scene
with a fifth of the picture masked out because things moved. The shipped read
collapses too, on 17 of the 125 scenes, but where both collapse neither loses
to the other.

A fix suggested itself: when `mpcws` collapses, fall back to exactly what ships.
That passes on draw one by construction, which proves nothing. So we wrote it
down as a second question and drew 240 more bursts (seed 20261123) that had
not been seen.

## Draw two: 122 bursts, three small losses, and the oracle fails too

The fallback fired once and cost nothing. Averages held: +0.080 dB colour and
+0.123 dB luma. But three bursts lost between 0.10 and 0.25 dB of luma, so the
rule says the defaults stay, and they do.

Two findings make this more than a "no".

- **The losses come from the luma ramp, not the read.** `mpcws` on the shipped
  ramps loses less than 0.1 dB on all three. The candidate's luma ramp pushes
  luma toward bilinear, and on these frames it goes too far.
- **The test is stricter than the truth.** Using the true noise level on its own
  best ramps, the oracle also loses more than 0.1 dB on two of the three bursts.
  With about 120 bursts and per-burst scoring noise near 0.1 dB, "no burst
  worse" is a bar our most accurate read can't clear on a blind set.

## What comes next

The next question, written down before its draw: `mpcws` with the refit colour
ramp, the shipped luma ramp and the collapse fallback, on a third seeded draw.
A loss will count only where the oracle doesn't also lose. The collapsed reads
in what ships are now measured, and they point at the open item of a noise
floor taken from the sensor's optical-black margins.

The tool is `ventures/photo-editing/tools/hdrplus_joint_check.py`. The rules,
both burst lists and every number are in
`ventures/photo-editing/eval/hdrplus-joint-check-2026-11-22.md`.
