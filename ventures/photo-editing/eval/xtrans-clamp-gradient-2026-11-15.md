# X-Trans demosaic: the choice was the weak step (2026-11-15)

Flagship item: "X-Trans demosaic toward LibRaw's three-pass (2-6 dB short)". Follows
`eval/xtrans-directional-demosaic-2026-11-14.md`, with the same truths, files, scores and tool
(`tools/xtrans_demosaic_check.py`). Raw rows: `eval/xtrans-clamp-gradient-2026-11-15.jsonl`.

## Where the error was

The first step was a diagnosis, not a change. I exposed the four directional pictures and scored
different ways of combining them, before the median, on the X-E1 frame (binned 4x4 as truth) and
the synthetic sheet:

| combination | X-E1 frame | sheet |
|---|---|---|
| homogeneity choice (shipped 2026-11-14) | 36.38 dB | 30.75 dB |
| mean of all four directions | 36.39 | 33.93 |
| oracle: per pixel, the direction nearest the truth | 40.03 | 32.82 |
| each direction alone (across, down, diag, anti-diag) | 35.65, 35.21, 33.85, 33.90 | 27.46, 27.67, 23.84, 23.79 |

The L\*a\*b\* homogeneity choice did no better than a plain average on the real frame, and worse on
the sheet. The oracle shows the pictures held 3.6 dB more than the choice took. By channel, red and
blue were the worst (34.9 and 36.4 dB against green's 39.8 on the X-E1). Green error at red and blue
sites came from overshoot: the colour-difference estimate uses a 3x3 mean of the sensel's own colour
at the green sites, and where that mean is off, on texture or at an edge, the green lands outside the
two greens it was interpolated between.

## What changed

1. **Clamp** (`clamp=True`, default): each directional green at a red or blue sensel is clipped to
   [min, max] of the two greens it was interpolated from along that line.
2. **Gradient choice** (`select="gradient"`, default): for each direction, D = the absolute second
   difference of its picture along its own line, summed over R, G, B and a 3x3 window, plus
   1e-6 x scale. Weights are (D_min / D)^4, normalised to sum to one; the output is the weighted
   blend. `select="homogeneity"` keeps the 2026-11-14 rule.

Both are the repository's own, not taken from dcraw's or LibRaw's source.

## Tuning (X-E1 frame and sheet only)

Colour PSNR, full pipeline (one pass, one median) unless marked:

| variant | X-E1 | sheet |
|---|---|---|
| 2026-11-14 rule | 36.60 | 33.51 |
| clamp to the line's two greens, homogeneity | 38.26 | 34.75 |
| clamp to the 3x3 window's greens, homogeneity (before median, one-piece) | 37.55 | 31.48 |
| line clamp, gradient rgb d2 3x3, power 4 (**chosen**) | **38.56** | **35.00** |
| line clamp, gradient rgb d2, power 2 | 38.39 | 34.99 |
| line clamp, gradient L\*a\*b\* d2, power 4 | 38.42 | 34.96 |
| line clamp, gradient L\*a\*b\* first difference, power 1 | 38.08 | 34.16 |
| chosen, then red/blue from a 5x5 Gaussian colour difference | 38.44 | 35.53 |
| chosen, no median | 38.58 | 31.66 |
| chosen, three passes | 38.00 | 36.64 |

The power-4 gradient blend was picked on the sum over both truths. The Gaussian red/blue variant
scored a little higher on that sum, but it gains on the sheet and loses on the real frame. I kept
the 3x3 box, which needs no new code.

## Results (final settings; the X-E2 looked at once)

| truth | method | colour PSNR | luma PSNR | chroma mean | chroma p99 |
|---|---|---|---|---|---|
| X-E1 frame | 2026-11-14 rule | 36.60 | 40.54 | 15.8 | 85.1 |
| | **2026-11-15 default** | **38.56** | 43.18 | 13.1 | 68.1 |
| | LibRaw Markesteijn 1 pass | 37.48 | 41.99 | 14.6 | 81.4 |
| | LibRaw Markesteijn 3 passes | 39.27 | 44.65 | 12.6 | 65.4 |
| X-E2 frame (held out) | 2026-11-14 rule | 47.88 | 51.47 | 4.7 | 24.3 |
| | **2026-11-15 default** | **49.43** | 53.94 | 4.2 | 17.9 |
| | LibRaw Markesteijn 1 pass | 46.45 | 51.09 | 5.4 | 31.9 |
| | LibRaw Markesteijn 3 passes | 49.89 | 53.91 | 4.1 | 16.7 |
| synthetic sheet | 2026-11-14 rule | 33.51 | 36.92 | 18.4 | 133.6 |
| | **2026-11-15 default** | **35.00** | 38.87 | 13.6 | 89.8 |
| | LibRaw Markesteijn 1 pass | 25.89 | 31.66 | 49.4 | 338.6 |
| | LibRaw Markesteijn 3 passes | 39.37 | 42.50 | 5.9 | 68.4 |

(Chroma in thousandths of full scale. The LibRaw rows were re-run today and match 2026-11-14's to
0.01 dB. The sheet rows shown are on the X-E1's layout; on the X-E2's they are within 0.08 dB.)

- The gap to LibRaw's three passes went from 2.7 to 0.71 dB on the X-E1 frame and from 2.0 to 0.46
  dB on the held-out X-E2. On luma PSNR the X-E2 is level (53.94 against 53.91). On the sheet the gap
  went from 5.9 to 4.4 dB.
- Half size (full demosaic, then 2x2 means, against the truth's 2x2 means): X-E1 40.07 to 42.27 dB,
  sheet 37.36 to 38.84 (see the rows for the X-E2).
- Each part's share, on the X-E1 / sheet: clamp alone +1.66 / +1.24 dB; gradient choice alone +0.62 /
  -0.35; both +1.96 / +1.49.
- Speed: the known-truth runs on a 1238 x 822 picture take 0.4-0.6 s, against 0.6-0.9 s for the old
  rule (four threads), because four pictures no longer go to L\*a\*b\*. On a full 16 MP frame, timed
  while the venture's test suite was also running, the two were both about 9 s, so there is no
  full-frame speed claim here.

## With noise (the noisy known truth the 2026-11-14 note asked for)

`tools/xtrans_demosaic_check.py --noise-snr 60 --noise-snr 25` adds Poisson-Gaussian noise to the
mosaic (signal-to-noise 60 or 25 at 18% grey; 80% of the variance there from shot noise, 20% from
read noise; a fixed seed) and scores against the clean truth. LibRaw gets the same noisy mosaic
(clipped to 0..1, as its sensor data must be). These are chosen levels, not a measured camera's.
Colour PSNR / luma PSNR:

| truth | SNR | ours bilinear | 2026-11-14 rule | **2026-11-15 default** | no median | LibRaw 1 pass | LibRaw 3 passes |
|---|---|---|---|---|---|---|---|
| X-E1 frame | 60 | 34.77 / 39.80 | 36.44 / 40.22 | **38.34** / 42.67 | 38.36 / 43.56 | 37.29 / 41.60 | 38.99 / 44.00 |
| X-E1 frame | 25 | 34.49 / 39.31 | 35.80 / 38.98 | **37.42** / 40.85 | 37.47 / 41.64 | 36.48 / 40.12 | 37.85 / 41.83 |
| X-E2 frame | 60 | 41.43 / 44.85 | 45.32 / 47.18 | **46.20** / 48.27 | 45.84 / 48.33 | 44.37 / 47.32 | 46.29 / 48.56 |
| X-E2 frame | 25 | 39.55 / 42.50 | 40.38 / 41.18 | **40.79** / 41.78 | 40.74 / 42.22 | 39.89 / 41.58 | 40.67 / 42.20 |

(Sheet rows are in the jsonl.)

- The new default beats the old rule at both noise levels on every truth. The gap to LibRaw's three
  passes narrows with noise: 0.65 and 0.43 dB on the X-E1, and 0.09 dB behind and 0.12 dB ahead on
  the X-E2.
- **The median costs luma under noise.** It rebuilds green at a red or blue sensel as the sensel's
  value minus a median colour difference, so that sensel's noise goes into green. Without it, luma
  PSNR is 0.4-0.9 dB higher on the frames, and colour PSNR is about the same. It stays on because the
  sheet needs it (31.7 against 35.0 dB without noise).
- A median that leaves green alone (red and blue only) was tried on the noise-free and noisy truths:
  +0.4 dB on the X-E1 at every level, but 2.3-2.5 dB worse on the sheet. Not adopted. Deciding it
  needs a real noisy frame with a known answer, not more synthetic tests.

## Real sensor data

The rows marked `against: libraw markesteijn 3-pass (real sensor data)` in the jsonl compare each
variant with LibRaw's three-pass render of the real frame. This is a closeness check, not a quality
score (see the 2026-11-14 note). Colour / luma PSNR against that render:

| frame | bilinear | 2026-11-14 rule | 2026-11-15 default | no median |
|---|---|---|---|---|
| X-E1 | 45.53 / 51.22 | 45.72 / 47.41 | 47.52 / 49.44 | 48.23 / 52.40 |
| X-E2 | 54.09 / 59.33 | 54.41 / 56.32 | 56.31 / 58.37 | 57.04 / 60.88 |

The luma gap the 2026-11-14 note could not explain (directional further from LibRaw than bilinear) is
mostly the median: without it, luma is nearer LibRaw than bilinear's on both frames.

## Tests

`tests/test_xtrans_demosaic.py`, 4 new tests (13 in all):
- bands equal one piece for each `clamp` / `select` combination;
- with the clamp, every green at a red or blue sensel lies within the range of the greens up to three
  sensels away, on uniform noise;
- on the slanted edge and grating, the default has a lower error than the 2026-11-14 rule;
- an unknown `select` is refused.

## Open

- The sheet's 4.4 dB: mostly the zone plate's finest rings. Three passes give +1.6 dB there but cost
  the real frame 0.56 dB.
- Whether to keep green out of the median: needs a real noisy frame with a known answer (for
  example a static scene shot at low and high ISO, the low-ISO frame binned as truth).
- A C path.
- Bayer, still bilinear.
