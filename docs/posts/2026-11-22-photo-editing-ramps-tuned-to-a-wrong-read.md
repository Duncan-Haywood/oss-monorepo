---
title: "Tuned to the wrong answer: why an accurate noise model looked worse in our raw developer"
seo_title: "Why an accurate noise model looked worse in a raw developer"
date: 2026-11-22
tags: [photo-editing, raw, demosaic, noise, evaluation, open-data]
description: "On 79 fresh phone bursts, the blend's ramps fitted for what ships fail our own bar, but they show why the oracle noise model kept losing."
---

ShootFlow's raw developer demosaics each block of a frame two ways, a sharp
directional pass and a soft bilinear one, and blends them. How much of each a
block gets depends on its `q`: how much detail the block holds compared with
the noise the developer thinks is there. Two ramps turn `q` into a weight, one
for colour and one for luma. Both were fitted earlier this month on noise we
drew ourselves.

Earlier today a test on real sensor noise (Google's HDR+ bursts, where the
burst merge subtracted from its reference frame leaves that frame's own noise)
turned up something odd. Hand the blend the *true* noise model and it was over
0.1 dB worse than what ships on 9 of 48 bursts. An accurate input shouldn't
lose to an inaccurate one. The suspects were the ramps.

## The test

We refitted both ramps on those 48 bursts with
`tools/hdrplus_ramp_fit.py`, scoring 589 blends per burst. Then we scored
the picks on 91 bursts no demosaic test had used before. These are the
subset's bursts whose files carry no noise profile, so the merge's leftover
noise fraction had to be assumed, and we disclose that. The pass bar was
written down and committed before any of those 91 were scored. Twelve were
skipped because moving subjects covered too much of the frame, which left 79.

## What happened

For what the developer actually runs, the refitted ramps gained
**+0.10 dB colour and +0.10 dB luma** on average over the fresh bursts, in
every noise third. But **6 of 79 bursts lost over 0.1 dB**, the worst by
0.62 dB in luma, all on older Nexus phones the fitting set barely had. Our
bar allows no such losers, so the ramps stay as they are. We won't trade a
nicer average for a handful of photos that come out visibly worse.

The second question had the clearer answer. On the shipped ramps, the oracle
model lost to what ships on **14 of 79** fresh bursts. With each noise read on
ramps fitted for it, the count was **0**. With its own ramps, the oracle beats
what ships by +0.18 dB colour and +0.22 dB luma, and no burst gets worse.

## Why

What ships reads the noise low on purpose. It applies a 0.8 scale, so an
error pushes toward the sharper demosaic. Ramps tuned alongside that read
learned to lean back toward bilinear to make up for it. Give the blend a
correct read and those ramps over-correct. So the ramps and the noise read
are one calibration. Testing a better read on the old ramps, which is how we
judged `mpcws` this morning, makes the better read look worse than it is.

## Next

The 153-burst public subset is now spent for this question. The full HDR+
set has 3,640 bursts with the same layout, and this session can reach it, so
the next run tests `mpcws` on its own fitted ramps against what ships, on a
fresh seeded draw. The rule gets committed first. A drawn-noise check on
camera files comes before any default changes, because every burst here is
a phone.

Numbers, rows and the committed rule:
[eval/hdrplus-ramp-fit-2026-11-22.md](../../ventures/photo-editing/eval/hdrplus-ramp-fit-2026-11-22.md).
