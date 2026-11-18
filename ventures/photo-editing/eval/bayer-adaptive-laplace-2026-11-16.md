# Bayer demosaic: a per-sensel Laplacian weight, and a fresh held-out set (2026-11-16)

Flagship item: "Bayer: per-pixel Laplacian weight" (`eval/bayer-laplace-weight-2026-11-15.md`, Open:
"the finest frames want an eighth, the cleaner ones a quarter. A local measure of how far the colour
difference departs from linear could choose it. Worth up to 0.7 dB luma on the A7 III if it picks
right"). Same scores and tool (`tools/bayer_demosaic_check.py`, new variant `laplace-adaptive`).
Raw rows: `eval/bayer-adaptive-laplace-2026-11-16.jsonl` (the six truths of 2026-11-15, noise-free
and SNR 60 / 25, plus the real-frame closeness rows) and `eval/bayer-adaptive-laplace-fresh-2026-11-16.jsonl`
(five frames no earlier note used, with LibRaw's seven methods).

**Verdict: shipped as an option, `directional(..., laplace="adaptive")`, not the default.** It gains on
the sheet (false colour p99 42 to 9.6) and on four of five fresh frames, but loses luma on the two
finest frames it was meant to help (A7 III, K-1 II), costs about twice the time and has no C path.
The default stays 3/16. The fresh frames also give the 2026-11-15 default its first independent
check: it beats every LibRaw method on colour PSNR on all five, noise-free and at SNR 25.

## The method

With weight w, the row's colour difference at each sensel (green minus the other colour, as step 2 of
the demosaic forms it) is `A - w B`, where A = sign x (c - mean of the two row neighbours) and B = sign
x the sensel's own second difference. Hamilton and Adams' quarter is exact where the colour difference
is linear, so the weight that makes the colour difference *closest to linear* is the one the data asks
for. Its second difference along the row is `d2A - w d2B`; summing squares over a 3 x 3 window, rows
and columns pooled, the minimising weight is `sum(d2A d2B) / sum(d2B^2)`, clipped to [1/8, 1/4]
(`bayer_demosaic._laplace_map`). The repository's own derivation, not taken from another program.

## Tuning (70D, D810, sheet only; colour / luma PSNR, dB)

| variant | 70D | D810 | sheet | colour sum |
|---|---|---|---|---|
| fixed 3/16 (default) | 48.28 / 52.99 | 57.60 / 60.36 | 39.87 / 44.20 | 145.75 |
| fixed 1/8 | 48.35 / 53.12 | 57.28 / 59.61 | 38.31 / 39.77 | 143.94 |
| first difference (smoothest, not most linear), 5 x 5 | 48.28 / 52.95 | 57.82 / 60.71 | 40.35 / 45.64 | 146.45 |
| same, each line weighted by its smoothness (power 0-8) | within 0.04 dB | | | |
| **second difference, 3 x 3, [1/8, 1/4] (chosen)** | **48.34 / 53.11** | **57.78 / 60.58** | **40.47 / 45.97** | **146.59** |
| second difference, 5 x 5 | 48.32 / 53.10 | 57.75 / 60.55 | 40.49 / 45.99 | 146.56 |
| second difference, [1/16, 5/16] | 48.32 / 53.10 | 57.74 / 60.55 | 40.49 / 45.95 | 146.55 |

## The first held-out set (A7 III, E-M10, K-1 II), run once

| truth | 3/16 | adaptive | 1/8 |
|---|---|---|---|
| A7 III | 36.19 / 41.55 | 36.11 / 41.22 | 36.34 / 42.22 |
| E-M10 | 43.24 / 45.80 | 43.26 / 45.82 | 42.72 / 44.81 |
| K-1 II | 29.27 / 34.63 | 29.23 / 34.39 | 29.24 / 34.78 |

It moved the two fine, aliased frames the wrong way. The least-squares weight's median on the A7 III
is 0.209, above 3/16, where 1/8 is nearer the truth at 65% of red and blue sensels: aliasing makes
the colour difference look as if it wants *more* of the sensel's own detail.

### What would pick right? (diagnostic, after the held-out run)

Per red or blue sensel, which of 1/8 and 1/4 gives the green nearer the truth (both directions
averaged), and how well four local measures rank that choice (Spearman rank correlation with the
error gain of 1/8):

| truth | 1/8 better at | MSE 1/8 | MSE 1/4 | oracle (per-sensel best) | least squares | green curvature / Laplacian |
|---|---|---|---|---|---|---|
| 70D | 64% | 1.31e-05 | 1.75e-05 | 7.92e-06 | -0.08 | +0.07 |
| D810 | 58% | 3.42e-06 | 2.94e-06 | 1.91e-06 | -0.09 | +0.13 |
| sheet | 37% | 8.89e-04 | 1.02e-03 | 4.51e-04 | +0.13 | +0.55 |
| A7 III | 65% | 1.46e-04 | 2.08e-04 | 1.21e-04 | +0.05 | -0.08 |
| E-M10 | 48% | 3.66e-04 | 2.63e-04 | 1.78e-04 | -0.15 | +0.16 |
| K-1 II | 59% | 6.72e-04 | 8.55e-04 | 4.94e-04 | +0.00 | -0.05 |

The ceiling is real (a per-sensel oracle has 17-49% less green error than the better fixed weight),
but no measure tried ranks the choice with the same sign on every frame, and none above |0.16| on a
real frame. Two more selectors were tried on all six truths and dropped: the curvature ratio above as
a soft switch (sum within 0.1 dB of least squares, D810 0.2 dB worse), and a local regression of the
neighbour colour's curvature on the sensel's own (w = beta/16, the Taylor weight; it sits at 1/8
almost everywhere, and its six-truth colour sum is 2.9-5.6 dB below least squares at scales 1-4).

## A fresh held-out set, run once with the chosen settings

Five frames from the same public sample set (drewnoakes/metadata-extractor-images, not committed),
none used by any earlier note: Sony A7 IV (`arw/Sony ILCE-7M4 (A7M4).ARW`), Nikon D800E
(`nef/Nikon 800E.nef`), Canon 7D (`cr2/Canon EOS 7D.cr2`), Panasonic GF7 (`rw2/Panasonic DMC-GF7.rw2`),
Samsung NX1 (`srw/Samsung NX1.srw`). Colour / luma PSNR / false colour p99 (thousandths), noise-free:

| truth | 3/16 (default) | adaptive | 1/8 | 1/4 | bilinear | best LibRaw |
|---|---|---|---|---|---|---|
| A7 IV | **49.17** / 53.53 / 17.0 | 49.14 / 53.42 / 17.0 | 49.09 / 53.24 / 17.2 | 48.99 / 53.12 / 17.4 | 43.44 / 47.46 / 40.1 | AAHD 48.53 / 52.50 / 17.9 |
| D800E | 47.87 / 52.22 / 23.4 | **47.90** / 52.28 / 23.2 | 47.77 / 51.89 / 23.6 | 47.52 / 51.41 / 24.8 | 41.21 / 45.31 / 56.4 | AAHD 47.38 / 51.27 / 24.9 |
| 7D | 50.31 / 53.10 / 16.1 | **50.37** / 53.18 / 15.9 | 49.92 / 52.31 / 16.5 | 50.01 / 52.67 / 17.4 | 43.90 / 46.84 / 34.3 | AAHD 49.21 / 51.96 / 18.1 |
| GF7 | 30.25 / 32.38 / 150.6 | 30.34 / 32.49 / 149.1 | 29.69 / 31.50 / 163.1 | **30.35** / 32.53 / 146.5 | 24.63 / 27.75 / 299.9 | VNG 29.18 / 32.40 / 181.3 |
| NX1 | 47.38 / 49.03 / 29.5 | **47.75** / 49.51 / 27.7 | 46.55 / 47.78 / 32.2 | 46.74 / 48.45 / 31.0 | 38.27 / 41.24 / 75.1 | AAHD 45.91 / 47.87 / 35.5 |

At SNR 25 (colour PSNR): default 40.55, 42.88, 43.04, 30.04, 42.34; adaptive 40.48, 42.86, 43.03,
30.13, 42.40; best LibRaw 40.13 (VNG), 42.24 (DHT), 42.85 (VNG), 29.02 (VNG), 41.26 (AAHD).

- **Adaptive against the default:** colour PSNR +0.10 dB on average (-0.03 to +0.37; better on four
  of five), luma -0.11 to +0.48, false colour lower or equal on all five. Under noise it is a wash
  (-0.07 to +0.09). On the six older truths: sheet +0.60 colour, +1.77 luma, false colour 42 to 9.6;
  D810 +0.18; 70D +0.06; E-M10 +0.02; A7 III -0.08 (luma -0.33); K-1 II -0.04 (luma -0.24).
- **The default against LibRaw, on frames it was never tuned on:** higher colour PSNR than every one
  of LibRaw 0.22.2's seven Bayer methods on all five, by 0.5-1.5 dB noise-free and 0.2-1.1 dB at
  SNR 25, and lower noise-free false colour (p99) than any of them on all five. This is the clean check the 2026-11-15 held-out set
  (already used to choose 3/16) could not give again.
- No single fixed weight is best everywhere here either: the GF7 prefers the quarter, the A7 IV and
  D800E 3/16; 3/16 is never more than 0.1 dB from the best fixed weight on these five.

**Speed:** the adaptive weight runs in numpy only (the C path refuses it): about 2x the default's
time on the known-truth crops and 1.9-2.7x on full frames (A7 IV 24 MP: 4.5 s against 2.1 s on this
machine, which was running the other measurement at the same time).

**Real sensor data**, closeness to LibRaw's AHD render (not a quality score): the adaptive weight is
0.0-0.5 dB further from AHD than the default on all ten frames, and 1/8 is nearest on seven.

## Commands (from `ventures/photo-editing`)

    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py <the five 2026-11-15 files> \
        --variant default --variant laplace-adaptive --variant laplace-eighth --no-libraw \
        --noise-snr 60 --noise-snr 25 > eval/bayer-adaptive-laplace-2026-11-16.jsonl
    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py <the five fresh files> \
        --variant default --variant laplace-adaptive --variant laplace-eighth --variant laplace-quarter \
        --variant bilinear --skip-sheet --noise-snr 25 > eval/bayer-adaptive-laplace-fresh-2026-11-16.jsonl

rawpy 0.25 with LibRaw 0.22.2.

## Tests

`tests/test_bayer_demosaic.py::test_adaptive_laplace`: the weight stays in [1/8, 1/4] and varies; on
the tuning sheet luma is nearer the truth than 3/16 on all four Bayer phases; each sensel keeps its
own value; flat fields stay flat; `native=True` and an unknown name are refused.
`test_bands_equal_one_piece` now covers `laplace="adaptive"` (band height and thread count change no
bit). Full photo-editing suite: 1,198 passed, 8 skipped.

## Open

- A selector that ranks the 1/8-or-1/4 choice the same way on every frame: none of four tried does.
  A learned one (a few local features, trained on many binned frames) is the obvious next try, with
  these ten frames as a test set only.
- A C path for the adaptive weight, if it ever becomes the default.
- Noise: still needs a real low/high-ISO pair as a noisy truth.
