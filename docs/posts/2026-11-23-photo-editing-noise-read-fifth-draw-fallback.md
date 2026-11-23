---
title: "We tried to make a noise read's safety check smarter, and a blind test said no"
seo_title: "A smarter fallback for a raw noise read fails its blind test"
date: 2026-11-23
tags: [photo-editing, raw, demosaic, noise, evaluation, open-data]
description: "A fallback that judged a noise read by its own shot slope failed a pre-registered test on 126 phone bursts; the cruder ratio check it was meant to replace held."
---

ShootFlow's raw developer reads how noisy a frame is from the picture itself,
then uses that reading to decide where to trust an edge-following demosaic and
where to fall back to plain bilinear. This morning a better read, `mpcws`,
shipped as an option after passing a fourth blind test on Google's public HDR+
bursts. It comes with a safety check: where `mpcws` reads less than 0.6 times
the noise the shipped read sees, the developer ignores it and uses the shipped
read.

That check had a flaw we could see in the data. It compares one estimate with
another. On three frames it threw away a good `mpcws` reading because the
*shipped* read was the one that was wrong: it was over-reading by 2 to 7 times.

## The idea

A noise model here has two terms: one that grows with brightness (shot noise)
and a constant (read noise). Every collapsed `mpcws` read we had seen had a
shot term near zero. On real sensors at mid-grey, shot noise dominates. So we
wrote down a check that needs no second estimate: if the shot term is under
half of the model's noise at 18% grey, fall back. We put the line at 0.5 and
committed it, with the code, before drawing a fifth random set of 240 bursts.

## What the fifth draw said

It failed. On 126 scored bursts the new check let through one frame that lost
0.35 dB, and it fell back on 31 frames, against 12 for the old check.

Both failures came from the same wrong assumption. On the losing frame `mpcws`
had collapsed completely: both terms were near zero. Their *ratio* still looked
healthy, so the check passed it. The old ratio-to-the-shipped-read check caught
it, because next to the shipped read it was 2,000 times too small.

And a zero shot term turned out to be common and mostly harmless. On 22 of
the 126 bursts `mpcws` put all of the noise into the constant term, and the
blend still gained on most of them. What the demosaic cares about is how much
noise there is at the tones in the picture, not how a fit splits it between two
terms. Falling back on those frames gave up about 0.02 dB of luma off the mean.

## What held

The old check passed the same draw cleanly: +0.06 dB colour and +0.10 dB luma
over the shipped read, and no burst more than 0.1 dB worse. Across the fourth
and fifth draws, 237 bursts no rule was tuned on, it has not lost on one. So the
option stays as it shipped.

One more lesson, about method. The 0.5 line was set from a first look at 11
bursts. A wider look at 233 bursts from the earlier draws, which we stopped once
the fifth draw had decided, already showed the check would fire on about 17% of
frames. Finishing that look before committing would have saved a draw.

The full note, the draw list and every row are in
`ventures/photo-editing/eval/hdrplus-joint-check-j5-2026-11-23.md`. The next
gate for making `mpcws` the default is unchanged: the same test on real camera
raws that no part of this tuning has used.
