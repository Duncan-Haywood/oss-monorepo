---
title: "Is the reference noisy, or just a forest? Reading a test image's grain from the raw"
seo_title: "Noisy reference or just a forest? Reading grain from the raw"
date: 2026-11-19
tags: [photo-editing, raw, noise, evaluation]
description: "A filter meant to drop noisy test references was using the noise estimator under test. Reading grain from the raw showed 6 of 11 demosaic losses are real."
---

ShootFlow's raw developer blends two demosaics block by block, guided by how
much noise the frame holds. To test it we take real camera files from
raw.pixls.us, render them, shrink them 4 x 4 into clean "truth" images, add
known noise, and score how close each demosaic gets to the truth.

After this morning's fix, 11 of 1,272 held-out rows still lost more than 0.1 dB
to the plain directional demosaic. All 11 came from four frames: three Nikon
D780 shots and one Nikon D600 shot. Given the exact noise model, the blend lost
on none of them, so the trouble was in how the frame's noise is read.

## A filter that grades its own homework

An earlier run found a different set of losers on a Pentax shot at ISO 1600
and 30 seconds. That frame's grain survives the 4 x 4 shrink, so the "truth"
itself was noisy, and a demosaic that smooths grain was being marked down for
it. That run added a column, the truth's own noise, and a `--clean-truths`
option that drops rows whose truth is noisier than the noise added.

On today's 11 losers the filter drops all 11. That looks like case closed. But
the column is computed by `frame_noise`, the same estimator we suspected of
reading texture as noise. The D780 frames were shot at ISO 100 and 1/400 s, and
a full-frame sensor at ISO 100 cannot leave grain at a signal-to-noise ratio of
13 in a shrunk image. The tiles are a sunlit forest, branches and leaves at the
limit of the sampling. The D600 tile is patterned wallpaper next to a
painting's brushwork. Three tiles of one D780 exposure read 0.0019, 0.0114 and
0.0140, though one exposure has one grain.

## Reading the grain from the raw instead

The new tool, `tools/truth_noise_check.py`, avoids the shrunk scene. It reads
the noise model from the raw's own sensels at full resolution, where grain is
much larger against texture. Then it measures how much of that noise survives
the truth pipeline: it runs LibRaw a second time with known noise added to the
raw and compares the outputs. Texture can only push the raw reading up, so the
result is an upper bound on the truth's grain.

It matches physics. A D780 at that raw level collects about 3,900 electrons,
which gives shot noise of about 0.0010 of full scale, and the raw reading is
0.0011 to 0.0012.

| tile | ISO | truth SNR, old column | truth SNR, from the raw |
|---|---|---|---|
| D780 forest, three frames | 100 | 13 to 19 | 153 to 181 |
| D600 wallpaper | 400 | 25 | 74 |
| Pentax K-1 II (the earlier case) | 1600 | 7 to 17 | 16 to 27 |

The Pentax case holds up: its truth really is grainy. The D780 and D600 truths
are clean, and the old column read their texture as 3 to 12 times the grain.

## What it changes

With the raw reading, 6 of the 11 losers are real. Their truths are cleaner
than the noise added (SNR 25 and 60 rows), and on them the shipped noise read
comes out 2.3 to 5.2 times too high. It reads nearly the same on the clean
image with nothing added: the foliage sets its floor. The other 5 are at SNR
200, where the truth's own grain is louder than the noise added, so these
truths cannot score them either way.

Sweep rows now carry the raw reading as `truth_grain18`, and `--clean-truths`
uses it first. On the rows it keeps, this morning's fix still passes all three
of its held-out tests, so the developer's output does not change. The next job
is a noise read that does not stop at fine foliage. One caveat comes first: a
real develop reads the full-resolution raw, where grain is about four times
larger against the same texture, so the shrunk test may overstate how often a
real photo meets this.

The full write-up, with every number and the commands to rerun it, is in
`ventures/photo-editing/eval/near-clean-truth-noise-2026-11-19.md`.
