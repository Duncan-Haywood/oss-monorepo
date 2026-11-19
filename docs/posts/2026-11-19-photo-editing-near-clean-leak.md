---
title: "The near-clean loss in a noise-aware demosaic was a leak, not a threshold"
seo_title: "A noise-aware demosaic's near-clean loss was a leak, not a threshold"
date: 2026-11-19
tags: [photo-editing, raw, demosaic, evaluation]
description: "ShootFlow's blend lost up to 0.58 dB on clean frames. The cause was how block weights spread to pixels. A fix cut held-out losing rows from 18 to 11."
---

ShootFlow's default raw demosaic since this morning is "noise-aware". It works
in blocks of 24 x 24 sensels. In each block it compares two demosaics: a
directional one that keeps edges, and a plain bilinear one that averages more
and so carries less noise. Where the difference between them is small next to
the sensor's noise, the block leans toward bilinear. Where it is large, the
block keeps directional. The ratio is called q, and a ramp maps q to a weight.

On about 6,000 scored test rows it beat directional on average at every noise
level. But 0.78% of rows lost over 0.1 dB, all on nearly clean frames. The
worst was a Pentax K-3 Mark III tile at a signal-to-noise ratio of 200, which
lost 0.58 dB even when the blend was given the exact noise model. Yesterday's
note put the fix in the ramps: some gate that stops blending near clean.

## Where the error actually was

Splitting that tile's squared error by block showed something else. The 31
smooth blocks, where the blend chose bilinear, were fine: the blend was better
there than either demosaic alone. The loss was in the 357 detailed blocks, whose
weight was already 1, fully directional. Their error was 11% above directional's.

The reason is one step after the ramp. A block's weight belongs to its centre,
and the blend interpolates weights between centres to get one per pixel. So
half of a detailed block, the half nearest a smooth neighbour, takes part of
that neighbour's weight of 0. On a clean frame bilinear is about 10 dB worse than
directional on detail, so even a partial weight costs. No ramp setting reaches
that, because the ramp already gave those blocks a weight of 1.

## The fix, and the test it had to pass

Raising every block's q to its neighbourhood's maximum fixed the tile (-0.58 to
+0.01 dB). It also gave back up to 0.7 dB on the same file at high noise, where
smooth blocks beside detail really do want bilinear. So the lift is scaled: each
block's q becomes at least its largest neighbour's q divided by k. Near clean a
detailed neighbour reads q 30, and the smooth block is lifted to 2.5. At high
noise the same neighbour reads about 2, and nothing moves.

The test rule was committed before the held-out rows were scored. k was tuned
on one set of public CC0 sample raws from raw.pixls.us (696 rows, 24 bodies),
which picked k = 12 and removed all five of that set's losing rows. It then had
to pass three tests on a set of 29 other bodies (1,272 rows):

- no mean worse by over 0.005 dB, and no noise level worse by over 0.02 dB;
- fewer rows losing over 0.1 dB to directional, and none newly losing;
- the worst near-clean row improves.

All three passed. Losing rows fell from 18 to 11, none was new, and the worst
near-clean row went from -0.27 to -0.14 dB. Mean gains rose a little at SNR 200
and 60 and did not move at SNR 12. The lift costs about a millisecond per
36-megapixel frame.

## What it did not fix

The 11 rows still losing are a different problem. On every one of them, the
blend given the exact noise model does not lose. There, the noise read from the
frame comes out too high: fine texture counted as noise. Changing how weights
spread cannot fix a wrong noise reading.

The same test on Fujifilm's X-Trans layout passed two of the three tests (losing
rows 31 to 24) but left its worst near-clean row unchanged, at -0.39 dB, which is
another over-read. By the rule, the lift is on for Bayer sensors only, and
X-Trans keeps its old blend until it gets its own tune pass.

All of this uses synthetic noise added to downscaled real scenes. A real low-
and high-ISO pair of one static scene is still the evidence the project lacks.

Full note, rows and commands:
[eval/near-clean-gate-2026-11-19.md](../../ventures/photo-editing/eval/near-clean-gate-2026-11-19.md).
