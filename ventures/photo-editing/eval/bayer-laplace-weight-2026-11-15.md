# Bayer demosaic: the quarter was too much (2026-11-15)

Flagship item: "Bayer demosaic: aliased luma" (`eval/bayer-directional-demosaic-2026-11-15.md`, Open:
"Luma on fine, aliased texture (A7 III, K-1 II): trails bilinear, DCB and VNG by 0.8-1 dB"). Same
truths, files, scores and tool (`tools/bayer_demosaic_check.py`). Raw rows:
`eval/bayer-laplace-weight-2026-11-15.jsonl` (350 rows: five files, four of our variants, LibRaw's
seven methods, noise-free and SNR 60 / 25, plus the real-frame closeness rows).

## The change

Step 1 of the directional demosaic builds a green at each red or blue sensel along the row (and the
column) as the mean of the two neighbouring greens plus a weight times the sensel's own second
difference, `(2c - c[x-2] - c[x+2])`. Hamilton and Adams use a quarter: exact when the colour
difference (green minus the sensel's colour) is locally linear. A Taylor expansion of a smooth green
gives an eighth instead (the two-green mean overshoots by G''/2; the second difference over two
sensels is 4 C''). Where the colour difference is not smooth, which is what fine, aliased texture is,
the quarter carries too much of the sensel's own detail into green, and luma suffers.

The weight is now a parameter, `directional(..., laplace=0.1875)` (3/16, between the two), in numpy
and in the C path (`bayer_native`, still bit for bit equal to numpy for any weight: new test). It is
used both for the green estimate and for the colour-difference direction test that reads it.
`laplace=0.25` gives the first version's output.

## How the weight was picked (tuning truths only: 70D, D810, sheet)

A quick harness with the same pipeline, sweeping the weight with the test and the estimate together.
Colour PSNR (dB):

| weight | 70D | D810 | sheet | sum |
|---|---|---|---|---|
| 0.25 (Hamilton-Adams, shipped) | 47.90 | 57.50 | 35.59 | 140.99 |
| 0.2125 | 48.16 | 57.61 | 38.52 | 144.29 |
| 0.2 | 48.22 | 57.61 | 39.31 | 145.14 |
| **0.1875** | 48.28 | 57.60 | 39.87 | 145.75 |
| 0.175 | 48.31 | 57.57 | 40.14 | 146.02 |
| 0.1625 | 48.34 | 57.52 | 40.11 | 145.97 |
| 0.15 | 48.36 | 57.46 | 39.79 | 145.61 |

The sum peaks at 0.175; it is flat to 0.3 dB from 0.1625 to 0.1875, and the sheet carries most of it.
I took 3/16: the two real tuning frames sum 0.03 dB higher there than at 0.175 and the D810, the
one that prefers more correction, loses nothing. Also tried and not kept: a separate weight for the
direction test (0.125 with a 0.1875 estimate: within 0.05 dB on real frames, 0.5 dB worse on the
sheet); a third tap at distance three (+-0.03: no gain); clamping each green to the range of its
two neighbours, as the X-Trans demosaic does (A7 III luma +1.6 dB, but D810 -0.6 colour PSNR and -1.2
luma, and the sheet -4.1 colour PSNR); an isotropic third estimate blended in where the two directions tie (within 0.05 dB
except the E-M10, which lost 0.1-1.3).

## Results, final settings, run once on the held-out frames

Colour PSNR / luma PSNR / 99th-percentile false colour (thousandths), noise-free. LibRaw 0.21.3
through rawpy 0.25 (the first note used LibRaw 0.22.2; its rows reproduce here to 0.01 dB):

| truth | quarter (before) | **3/16 (now)** | 1/8 | bilinear | best LibRaw (by colour PSNR) |
|---|---|---|---|---|---|
| 70D (tuning) | 47.90 / 52.10 / 19.3 | **48.28 / 52.99 / 18.7** | 48.35 / 53.12 / 18.7 | 44.31 / 48.46 / 33.0 | AAHD 47.46 / 51.43 / 20.0 |
| D810 (tuning) | 57.50 / 60.40 / 8.2 | **57.60 / 60.36 / 8.1** | 57.28 / 59.61 / 8.4 | 52.36 / 55.47 / 15.3 | AAHD 56.36 / 59.19 / 9.2 |
| sheet (tuning) | 35.59 / 36.63 / 119 | **39.87 / 44.20 / 42** | 38.31 / 39.77 / 114 | 21.72 / 24.88 / 368 | AAHD 34.74 / 36.61 / 136 |
| A7 III (held out) | 35.94 / 40.64 / 63.7 | **36.19 / 41.55 / 63.4** | 36.34 / 42.22 / 63.6 | 35.69 / 41.63 / 69.8 | VNG 36.01 / 41.45 / 64.6 |
| E-M10 (held out) | 42.67 / 45.15 / 45.7 | **43.24 / 45.80 / 41.7** | 42.72 / 44.81 / 44.1 | 30.40 / 34.23 / 208 | AAHD 42.62 / 45.32 / 44.7 |
| K-1 II (held out) | 29.16 / 34.03 / 138.8 | **29.27 / 34.63 / 139.3** | 29.24 / 34.78 / 140.9 | 27.54 / 33.21 / 176.9 | VNG 28.99 / 34.80 / 145.2 |

- **The luma gap the item named is mostly closed.** A7 III: 0.99 dB behind bilinear becomes 0.08
  behind (and 0.17 behind DCB's 41.72, the best luma there). K-1 II: 0.77 behind VNG becomes 0.17
  behind. An eighth would close both (42.22 and 34.78), but costs the D810 and the E-M10 0.75-1 dB of
  luma and the sheet 4.4: the finest frames want less correction, the cleaner ones more.
- **Colour PSNR rises on all six truths** (+0.10 to +4.28 dB), and the directional demosaic now has
  the highest colour PSNR of all eight methods on all six (it was second on the A7 III, behind VNG).
- **False colour (p99)** falls on five of six; the K-1 II is 0.5 higher (139.3 against 138.8), still
  the lowest of every method but the quarter.
- **The sheet:** 35.59 to 39.87 dB, 119 to 42 false colour; AAHD, LibRaw's best there, 34.74 / 136.
  The 1.9 dB the first note said only a median could give is now there without one (the median
  measured 37.51).

**With noise (SNR 25), colour / luma / p99:** 70D 42.16 / 43.62 / 26.0 (quarter 41.91 / 43.15 / 26.0),
D810 45.11 / 45.96 / 18.4 (44.94 / 45.58 / 17.4), A7 III 34.78 / 38.31 / 66.5 (34.55 / 37.66 / 66.4),
E-M10 40.66 / 42.39 / 44.0 (40.28 / 41.90 / 47.6), K-1 II 28.91 / 33.65 / 140.5 (28.79 / 33.08 /
139.9), sheet 37.05 / 39.42 / 47 (34.26 / 35.21 / 120). Colour PSNR is higher than the quarter's on
every noisy truth. Against bilinear at SNR 25 the A7 III now goes our way (34.78 against 34.71; it
was 34.55); the D810 still does not (45.11 against 45.68), and bilinear's luma is still higher on
the noisy real frames (its 3x3 average smooths noise). Against LibRaw at SNR 25 ours has the higher
colour PSNR on five of six truths; VNG is 0.03 dB ahead on the D810 (45.14), where it was ahead on
three before.

**Real sensor data**, closeness to LibRaw's AHD render of the same frame (not a quality score),
colour / luma: 70D 59.14 / 61.65 (was 58.17 / 60.36), D810 61.22 / 63.61 (60.26 / 62.24), A7 III
50.76 / 53.19 (49.71 / 51.73), E-M10 58.36 / 61.00 (57.65 / 59.82), K-1 II 57.93 / 60.69 (57.00 /
59.25). Nearer on all five.

Speed: unchanged (one multiply replaces one divide in the C path).

## Commands (from `ventures/photo-editing`)

    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py <5 files> \
        --variant bilinear --variant default --variant laplace-quarter --variant laplace-eighth \
        --noise-snr 60 --noise-snr 25 > eval/bayer-laplace-weight-2026-11-15.jsonl

Files from drewnoakes/metadata-extractor-images (sparse checkout, not committed), as in the first
note.

## Tests

- `tests/test_bayer_demosaic.py::test_laplace_weight`: on the tuning sheet (192 rows) the default's
  luma error is under half the quarter's on all four Bayer phases; the default equals an explicit
  `laplace=0.1875`; flat fields stay flat at weights 0, 1/8 and 0.3.
- `tests/test_bayer_native.py::test_laplace_weights_bit_identical`: C equals numpy bit for bit at
  1/4, 1/8 and 0.2.
- Full photo-editing suite: 1,205 tests pass (8 skipped).

## Open

- A per-pixel weight: the finest frames want an eighth, the cleaner ones a quarter. A local measure
  of how far the colour difference departs from linear could choose it. Worth up to 0.7 dB luma on the
  A7 III if it picks right.
- Noise: bilinear's luma is still higher on noisy real frames; a real low/high-ISO pair as a noisy
  truth is still the way to settle the noise question.
